import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { addDays, dayCutoff } from "../src/domain/dates";
import {
  makePortion,
  type PlanningState,
  type MealPlan,
} from "../src/domain/planning";
import type { HouseholdState, Profile } from "../src/domain/types";
import type { ShoppingState } from "../src/domain/shopping";
const measurements: Record<string, unknown> = {};
let db: PGlite, day: string, home: any, other: any;
const a = "90000000-0000-0000-0000-000000000001",
  b = "90000000-0000-0000-0000-000000000002";
const profile: Profile = {
  name: "Alex",
  age: 32,
  sex: "male",
  height_cm: 178,
  weight_kg: 80,
  activity_level: "light",
  goal: "maintain",
  target_weight_kg: null,
  target_date: null,
  diet: "omnivore",
  language: "en",
  excluded_ingredients: [],
};
async function actor(id = a) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function call<T = any>(fn: string, args: unknown[] = []): Promise<T> {
  return (
    await db.query<{ r: T }>(
      `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`,
      args,
    )
  ).rows[0].r;
}
const rpc = <T = any>(fn: string, args: unknown[] = []) =>
  call<T>(fn, [home.household_id, home.membership_id, ...args]);
const shopping = () => rpc<ShoppingState>("get_shopping_state");
const snapshot = () => rpc<HouseholdState>("get_household_snapshot");
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  const migrations = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of migrations.filter((f) => f < "202611040006"))
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const [id, email] of [
    [a, "a@example.com"],
    [b, "b@example.com"],
  ])
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}','{}')`,
      [id, email],
    );
  await db.exec("select app_private.configure_owner('a@example.com')");
  await actor();
  await call("bootstrap_member", ["UTC"]);
  await call("save_my_profile", [profile, 0]);
  const proposal = await call("get_my_target_proposal");
  await call("accept_my_target", [
    { breakfast: 400, lunch: 650, dinner: 650 },
    proposal.context_revision,
  ]);
  await db.exec("reset role");
  for (const f of migrations.filter((f) => f >= "202611040006")) {
    if (f.startsWith("202611090027"))
      await db.query(
        `insert into app_private.meal_corrections(id,token,member_id,day,action,request,before_meals,after_meals,acknowledgement,created_at) values('87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000002',$1,current_date-40,'save','{}','[]','[]','{}',clock_timestamp()-interval '40 days')`,
        [a],
      );
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
    if (f.startsWith("202611040006"))
      await db.exec("revoke usage on schema auth from week_menu_executor");
  }
  await actor();
  home = (await call("get_household_access")).active;
  day = addDays((await snapshot()).server_now.slice(0, 10), 2);
  await actor(b);
  await call("create_household", ["Other home", "UTC"]);
  other = (await call("get_household_access")).active;
  await actor();
}, 60000);
afterAll(async () => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/catalogue-measurements.json",
    JSON.stringify(measurements, null, 2),
  );
  await db?.close();
});
it("atomically commits changed budgets and an old acknowledgement never replays over a newer save", async () => {
  const d = addDays(day, 10),
    op = crypto.randomUUID(),
    changes = { breakfast: 410, lunch: 620, dinner: 710 };
  const ack = await rpc("save_my_meal_budgets", [op, d, changes]);
  expect(ack).toMatchObject({ operation_id: op, day: d });
  expect(
    (await snapshot()).budget_overrides.filter((x) => x.day === d),
  ).toHaveLength(3);
  const before = (await snapshot()).budget_overrides;
  for (const invalid of [
    { breakfast: 415, lunch: -1 },
    { breakfast: "410" },
    { brunch: 500 },
    {},
    null,
  ])
    await expect(
      rpc("save_my_meal_budgets", [crypto.randomUUID(), d, invalid]),
    ).rejects.toThrow("invalid_budgets");
  expect((await snapshot()).budget_overrides).toEqual(before);
  await rpc("save_my_budget_override", [d, "breakfast", 430]);
  expect(await rpc("save_my_meal_budgets", [op, d, changes])).toEqual(ack);
  expect(
    (await snapshot()).budget_overrides.find(
      (x) => x.day === d && x.meal_type === "breakfast",
    )!.kcal,
  ).toBe(430);
  await expect(
    rpc("save_my_meal_budgets", [op, d, { breakfast: 999 }]),
  ).rejects.toThrow("operation_mismatch");
  await rpc("save_my_meal_budgets", [
    crypto.randomUUID(),
    d,
    { breakfast: null },
  ]);
  expect(
    (await snapshot()).budget_overrides.some(
      (x) => x.day === d && x.meal_type === "breakfast",
    ),
  ).toBe(false);
  await expect(
    rpc("save_my_meal_budgets", [
      crypto.randomUUID(),
      "infinity",
      { breakfast: 400 },
    ]),
  ).rejects.toThrow();
  await actor(b);
  await expect(
    rpc("save_my_meal_budgets", [crypto.randomUUID(), d, changes]),
  ).rejects.toThrow("membership_changed");
  expect(
    (
      await call<HouseholdState>("get_household_snapshot", [
        other.household_id,
        other.membership_id,
      ])
    ).budget_overrides,
  ).toEqual([]);
  await actor();
  await expect(
    db.exec("select * from app_private.budget_commits"),
  ).rejects.toThrow("permission denied");
});
it("rejects a closed-date batch without partial writes", async () => {
  const d = addDays(day, 15);
  await rpc("save_my_budget_override", [d, "lunch", 600]);
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set closed=true where household_id=$1 and day=$2",
    [home.household_id, d],
  );
  await actor();
  const before = (await snapshot()).budget_overrides;
  await expect(
    rpc("save_my_meal_budgets", [
      crypto.randomUUID(),
      d,
      { breakfast: 420, lunch: 630 },
    ]),
  ).rejects.toThrow("day_closed");
  expect((await snapshot()).budget_overrides).toEqual(before);
});
it("expires checked/unchecked contributions, decreases shared quantities, preserves manual items and repairs only once", async () => {
  const lib = await rpc<PlanningState>("get_planning_library");
  const plans = ["b01", "b02"].map((id, i) => ({
    day: addDays(day, i),
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: [
      makePortion(
        lib.recipes.find((r) => r.id === id)!,
        a,
        profile,
        400,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ],
  }));
  await rpc("apply_meal_plans", [plans, lib.revision, false]);
  await rpc("set_shopping_date_range", [day, addDays(day, 1)]);
  let list = await shopping();
  expect(Date.parse(list.valid_until!)).toBe(Date.parse(dayCutoff(day, "UTC")));
  const oats = list.items.find((i) => i.ingredient_id === "oats")!,
    apple = list.items.find((i) => i.ingredient_id === "apple")!,
    ginger = list.items.find((i) => i.ingredient_id === "ginger")!;
  const manual = crypto.randomUUID();
  await rpc("save_manual_shopping_item", [manual, "Soap", "1", 0]);
  for (const id of [oats.id, apple.id, manual])
    await rpc("set_shopping_checked", [crypto.randomUUID(), id, true]);
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set cutoff=clock_timestamp()-interval '1 second' where household_id=$1 and day=$2",
    [home.household_id, day],
  );
  await actor();
  list = await shopping();
  const futureOats = plans[1].portions[0].lines.find(
    (l) => l.ingredient_id === "oats",
  )!.grams;
  expect(list.items.find((i) => i.id === oats.id)).toMatchObject({
    quantity: futureOats,
    checked: true,
    increased: false,
  });
  expect(list.items.some((i) => i.id === apple.id || i.id === ginger.id)).toBe(
    false,
  );
  expect(list.items.find((i) => i.id === manual)!.checked).toBe(true);
  const revision = list.observation_revision;
  expect((await shopping()).observation_revision).toBe(revision);
  expect((await snapshot()).planning!.plans).toHaveLength(2);
  expect(
    (await rpc("set_shopping_checked", [crypto.randomUUID(), apple.id, true]))
      .status,
  ).toBe("removed");
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set closed=true where household_id=$1 and day=$2",
    [home.household_id, addDays(day, 1)],
  );
  await actor();
  list = await shopping();
  expect(list.items.map((i) => i.id)).toEqual([manual]);
  expect(list.valid_until).toBeNull();
});
it("the returned cutoff honors member timezones including DST and keeps sticky closures", async () => {
  const lib = await rpc<PlanningState>("get_planning_library"),
    d = "2027-03-28";
  const p = makePortion(
    lib.recipes.find((r) => r.id === "b01")!,
    a,
    profile,
    400,
    false,
    lib.ingredients,
    lib.substitutions,
  );
  await rpc("apply_meal_plans", [
    [
      {
        day: d,
        type: "breakfast",
        revision: 0,
        shared_recipe_id: null,
        portions: [p],
      },
    ],
    lib.revision,
    false,
  ]);
  await call("bootstrap_member", ["Europe/Madrid"]);
  await rpc("set_shopping_date_range", [d, d]);
  expect(Date.parse((await shopping()).valid_until!)).toBe(
    Date.parse(dayCutoff(d, "Europe/Madrid")),
  );
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set closed=true,cutoff='2099-01-01' where household_id=$1 and day=$2",
    [home.household_id, d],
  );
  await actor();
  expect((await shopping()).items.every((i) => i.source === "manual")).toBe(
    true,
  );
});
it("compact snapshots retain saved references without downloading the entire catalogue; old clients keep the full graph", async () => {
  const full = await snapshot(),
    small = await rpc<HouseholdState>("get_household_snapshot", [true]);
  measurements.snapshot = {
    compact_bytes: Buffer.byteLength(JSON.stringify(small)),
    full_bytes: Buffer.byteLength(JSON.stringify(full)),
    compact_recipes: small.planning!.recipes.length,
    full_recipes: full.planning!.recipes.length,
  };
  expect(full.planning!.recipes.length).toBeGreaterThan(40);
  expect(small.planning!.complete).toBe(false);
  expect(small.planning!.recipes.length).toBeLessThan(10);
  expect(small.planning!.plans).toEqual(full.planning!.plans);
  expect(JSON.stringify(small).length).toBeLessThan(
    JSON.stringify(full).length / 2,
  );
  expect((await snapshot()).planning!.recipes).toHaveLength(
    full.planning!.recipes.length,
  );
  const detail = await rpc<any>("get_catalogue_item", ["recipe", "b01"]);
  expect(detail.item.components.length).toBeGreaterThan(0);
  expect(detail.ingredients.length).toBeGreaterThan(0);
});
it("pages resolved catalogue summaries in stable groups of 50, searches the whole collection and excludes inserts newer than its cursor", async () => {
  const lib = await rpc<PlanningState>("get_planning_library"),
    base = lib.recipes.find((r) => r.id === "b01")!;
  await db.exec("reset role");
  for (let i = 0; i < 110; i++) {
    const id = `page_${String(i).padStart(3, "0")}`;
    await db.query(
      "insert into public.saved_recipes(household_id,id,data) values($1,$2,$3)",
      [
        home.household_id,
        id,
        { ...base, id, name: { en: `Page fixture ${i}`, es: `Receta ${i}` } },
      ],
    );
  }
  await db.query(
    "update app_private.catalogue_chronology set created_at=clock_timestamp()-interval '1 day' where household_id=$1 and item_id like 'page_%'",
    [home.household_id],
  );
  // Equal creation timestamps use an immutable ID tie-breaker.
  await db.query(
    "update app_private.catalogue_chronology set created_at='2026-01-01T00:00:00Z' where household_id=$1 and item_id like 'page_%'",
    [home.household_id],
  );
  await actor();
  const first = await rpc<any>("get_catalogue_page", [
    "recipe",
    "",
    false,
    null,
  ]);
  measurements.first_page = {
    items: first.items.length,
    bytes: Buffer.byteLength(JSON.stringify(first)),
  };
  expect(first.items).toHaveLength(50);
  expect(first.items.every((r: any) => !r.components)).toBe(true);
  await rpc("save_household_content", [
    "recipe",
    {
      ...base,
      id: "page_new",
      name: { en: "New insertion", es: "Nueva receta" },
    },
    0,
    false,
  ]);
  const all = [...first.items];
  let cursor = first.next_cursor;
  while (cursor) {
    const next = await rpc<any>("get_catalogue_page", [
      "recipe",
      "",
      false,
      cursor,
    ]);
    expect(next.items.length).toBeLessThanOrEqual(50);
    all.push(...next.items);
    cursor = next.next_cursor;
  }
  expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  expect(all.filter((r) => r.id.startsWith("page_")).length).toBe(110);
  expect(all.some((r) => r.id === "page_new")).toBe(false);
  const search = await rpc<any>("get_catalogue_page", [
    "recipe",
    "Page fixture 109",
    false,
    null,
  ]);
  expect(search.items.map((r: any) => r.id)).toEqual(["page_109"]);
  await expect(
    rpc("get_catalogue_page", ["ingredient", "", false, first.next_cursor]),
  ).rejects.toThrow("invalid_catalogue_cursor");
  await expect(
    rpc("get_catalogue_page", ["recipe", "changed", false, first.next_cursor]),
  ).rejects.toThrow("invalid_catalogue_cursor");
  const newer = await rpc<any>("get_catalogue_page", [
    "recipe",
    "",
    false,
    null,
  ]);
  expect(newer.items[0].id).toBe("page_new");
  const created = newer.items[0].created_at,
    updated = {
      ...base,
      id: "page_new",
      name: { en: "Renamed insertion", es: "Receta cambiada" },
    };
  await rpc("save_household_content", ["recipe", updated, 1, false]);
  expect(
    (
      await rpc<any>("get_catalogue_page", [
        "recipe",
        "Renamed insertion",
        false,
        null,
      ])
    ).items[0].created_at,
  ).toBe(created);
  await actor(b);
  await expect(
    rpc("get_catalogue_page", ["recipe", "", false, null]),
  ).rejects.toThrow("membership_changed");
  await expect(
    rpc("get_catalogue_item", ["recipe", "page_new"]),
  ).rejects.toThrow("membership_changed");
  await actor();
  await expect(
    db.exec("select * from app_private.catalogue_chronology"),
  ).rejects.toThrow("permission denied");
});
it("an archived private starter override hides the common recipe before paging", async () => {
  const lib = await rpc<PlanningState>("get_planning_library"),
    r = lib.recipes.find((r) => r.id === "b01")!;
  await rpc("save_household_content", ["recipe", r, r.revision, true]);
  const hidden = await rpc<any>("get_catalogue_page", [
    "recipe",
    r.name.en,
    false,
    null,
  ]);
  expect(hidden.items).toHaveLength(0);
  const shown = await rpc<any>("get_catalogue_page", [
    "recipe",
    r.name.en,
    true,
    null,
  ]);
  expect(shown.items).toHaveLength(1);
  expect(shown.items[0]).toMatchObject({
    id: "b01",
    archived: true,
    created_at: null,
  });
});
it("historical correction credentials are scoped, expire and leave ordinary historical guards intact", async () => {
  const lib = await rpc<PlanningState>("get_planning_library"),
    d = addDays(day, 35),
    future = addDays(d, 1);
  const plan = {
    day: d,
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: [
      makePortion(
        lib.recipes.find((r) => r.id === "b02")!,
        a,
        profile,
        400,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ],
  };
  await rpc("apply_meal_plans", [
    [plan, { ...plan, day: future }],
    lib.revision,
    false,
  ]);
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set closed=true where household_id=$1 and day=$2",
    [home.household_id, d],
  );
  await db.query(
    "insert into public.personal_days(household_id,member_id,day,cutoff,closed,snapshot) values($1,$2,$3,clock_timestamp(),true,app_private.context($2,$3))",
    [home.household_id, a, d],
  );
  await actor();
  const current = await rpc<PlanningState>("get_planning_library");
  await expect(
    rpc("apply_meal_plans", [[plan], current.revision, true]),
  ).rejects.toThrow("day_closed");
  await expect(
    rpc("delete_planned_meal", [d, "breakfast", current.revision]),
  ).rejects.toThrow("day_closed");
  await expect(
    rpc("begin_historical_correction", [future, current.revision]),
  ).rejects.toThrow("historical_day_required");
  const session = await rpc<any>("begin_historical_correction", [
    d,
    current.revision,
  ]);
  await expect(
    rpc("apply_historical_correction", [crypto.randomUUID(), d, "erase", []]),
  ).rejects.toThrow("correction_expired");
  await expect(
    rpc("apply_historical_correction", [session.token, future, "erase", []]),
  ).rejects.toThrow("correction_expired");
  await expect(
    rpc("apply_historical_correction", [
      session.token,
      d,
      "save",
      [{ ...plan, day: future }],
    ]),
  ).rejects.toThrow("invalid_recipe");
  await actor(b);
  await expect(
    rpc("apply_historical_correction", [session.token, d, "erase", []]),
  ).rejects.toThrow("membership_changed");
  await expect(
    call("apply_historical_correction", [
      other.household_id,
      other.membership_id,
      session.token,
      d,
      "erase",
      [],
    ]),
  ).rejects.toThrow("correction_expired");
  await actor();
  await db.exec("reset role");
  await db.query(
    "update app_private.correction_sessions set expires_at=clock_timestamp()-interval '1 second' where token=$1",
    [session.token],
  );
  await actor();
  await expect(
    rpc("apply_historical_correction", [session.token, d, "erase", []]),
  ).rejects.toThrow("correction_expired");
  for (const table of ["correction_sessions", "meal_corrections"])
    await expect(db.exec(`select * from app_private.${table}`)).rejects.toThrow(
      "permission denied",
    );
});
it("normalizes corrections from recorded references, preserves personal context, audits once and erases only one day", async () => {
  const d = addDays(day, 35),
    future = addDays(d, 1),
    before = await snapshot(),
    lib = before.planning!;
  const recorded = structuredClone(lib.plans.find((m) => m.day === d)!);
  const food = lib.ingredients.find(
    (i) => i.id === recorded.portions[0].lines[0].ingredient_id,
  )!;
  // A later nutrition edit cannot rewrite existing recorded quantities/reference versions.
  await rpc("save_household_content", [
    "ingredient",
    { ...food, nutrition_per_100g: { energy_kcal: 999 } },
    food.revision,
    false,
  ]);
  const now = await snapshot(),
    session = await rpc<any>("begin_historical_correction", [
      d,
      now.planning!.revision,
    ]);
  await expect(
    rpc("apply_historical_correction", [
      session.token,
      d,
      "save",
      session.plans,
    ]),
  ).rejects.toThrow("correction_unchanged");
  const changed = structuredClone(session.plans);
  changed[0].portions[0].lines[0].quantity *= 2;
  changed[0].portions[0].lines[0].grams_per_unit = 999;
  changed[0].portions[0].lines[0].energy_per_100g = 999;
  changed[0].portions[0].lines[0].kcal = 999999;
  changed[0].portions[0].budget = 1;
  const ack = await rpc<any>("apply_historical_correction", [
    session.token,
    d,
    "save",
    changed,
  ]);
  const after = await snapshot(),
    actual = after.planning!.plans.find((m) => m.day === d)!;
  expect(actual.portions[0].budget).toBe(recorded.portions[0].budget);
  expect(actual.portions[0].lines[0]).toMatchObject({
    grams: recorded.portions[0].lines[0].grams * 2,
    kcal: recorded.portions[0].lines[0].kcal * 2,
    energy_per_100g: recorded.portions[0].lines[0].energy_per_100g,
    nutrition_revision: recorded.portions[0].lines[0].nutrition_revision,
  });
  expect(actual.portions[0].lines.slice(1)).toEqual(
    recorded.portions[0].lines.slice(1),
  );
  expect(after.days).toEqual(now.days);
  expect(after.targets).toEqual(now.targets);
  expect(after.entries).toEqual(now.entries);
  expect(after.members).toEqual(now.members);
  expect(after.planning!.plans.find((m) => m.day === future)).toEqual(
    now.planning!.plans.find((m) => m.day === future),
  );
  expect(after.meals.find((m) => m.day === d)!.kcal).toBe(
    actual.portions[0].kcal,
  );
  const history = await rpc<any[]>("get_historical_corrections", [d]);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    member_id: a,
    day: d,
    action: "save",
    before_meals: session.plans,
  });
  expect(history[0]).not.toHaveProperty("token");
  expect(
    await rpc("apply_historical_correction", [
      session.token,
      d,
      "save",
      changed,
    ]),
  ).toEqual(ack);
  await expect(
    rpc("apply_historical_correction", [session.token, d, "erase", []]),
  ).rejects.toThrow("operation_mismatch");
  expect(await rpc("get_historical_corrections", [d])).toHaveLength(1);
  const stale = await rpc<any>("begin_historical_correction", [
    d,
    after.planning!.revision,
  ]);
  await rpc("save_planner_settings", [1, 4]);
  await expect(
    rpc("apply_historical_correction", [stale.token, d, "erase", []]),
  ).rejects.toThrow("stale_plan");
  const refreshed = await snapshot(),
    erase = await rpc<any>("begin_historical_correction", [
      d,
      refreshed.planning!.revision,
    ]);
  await rpc("cancel_historical_correction", [erase.token]);
  await expect(
    rpc("apply_historical_correction", [erase.token, d, "erase", []]),
  ).rejects.toThrow("correction_expired");
  const finalSession = await rpc<any>("begin_historical_correction", [
    d,
    refreshed.planning!.revision,
  ]);
  await rpc("apply_historical_correction", [
    finalSession.token,
    d,
    "erase",
    [],
  ]);
  const final = await snapshot();
  expect(final.planning!.plans.some((m) => m.day === d)).toBe(false);
  expect(final.meals.some((m) => m.day === d)).toBe(false);
  expect(final.days).toEqual(refreshed.days);
  expect(final.entries).toEqual(refreshed.entries);
  expect(final.targets).toEqual(refreshed.targets);
  expect((await snapshot()).planning!.plans.some((m) => m.day === d)).toBe(
    false,
  );
  await rpc("set_shopping_date_range", [d, d]);
  const remaining = await shopping();
  expect(remaining.scope).toBe("upcoming");
  expect(remaining.contributions!.some((c) => c.day === d)).toBe(false);
  expect(remaining.items.some((i) => i.source === "generated")).toBe(true); // the other future date remains
  expect(await rpc("get_historical_corrections", [d])).toHaveLength(2);
});
it("a revoked editor cannot reuse a correction credential or read its receipt", async () => {
  const d = addDays(day, 35),
    s = await snapshot(),
    session = await rpc<any>("begin_historical_correction", [
      d,
      s.planning!.revision,
    ]);
  await db.exec("reset role");
  await db.query(
    "update public.members set status='removed' where household_id=$1 and id=$2",
    [home.household_id, a],
  );
  await actor();
  await expect(
    rpc("apply_historical_correction", [session.token, d, "erase", []]),
  ).rejects.toThrow("access_denied");
  await expect(rpc("get_historical_corrections", [d])).rejects.toThrow(
    "access_denied",
  );
  await db.exec("reset role");
  await db.query(
    "update public.members set status='active' where household_id=$1 and id=$2",
    [home.household_id, a],
  );
  await db.query(
    "update public.approved_emails set revoked=false where household_id=$1 and email='a@example.com'",
    [home.household_id],
  );
  await actor();
});
it("historical recipe replacements and restaurant portions use trusted references and keep frozen budgets", async () => {
  const d = addDays(day, 35),
    s = await snapshot(),
    lib = s.planning!;
  // Today's different diet/weight must not replace the frozen historical profile.
  await rpc("save_my_profile", [
    { ...profile, diet: "vegan", weight_kg: 75 },
    s.members.find((m) => m.id === a)!.revision,
  ]);
  const session = await rpc<any>("begin_historical_correction", [
    d,
    (await snapshot()).planning!.revision,
  ]);
  const portion = makePortion(
    lib.recipes.find((r) => r.id === "b03")!,
    a,
    profile,
    400,
    false,
    lib.ingredients,
    lib.substitutions,
  );
  const plan = {
    day: d,
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: [{ ...portion, budget: 99999 }],
  };
  await rpc("apply_historical_correction", [session.token, d, "save", [plan]]);
  const saved = await snapshot(),
    actual = saved.planning!.plans.find((m) => m.day === d)!;
  expect(actual.portions[0].budget).toBe(400);
  expect(actual.portions[0].recipe_snapshot!.id).toBe("b03");
  expect(actual.portions[0].kcal).toBeCloseTo(portion.kcal, 8);
  const restaurant = await rpc<any>("begin_historical_correction", [
      d,
      saved.planning!.revision,
    ]),
    out = structuredClone(actual);
  out.portions[0] = {
    ...out.portions[0],
    eating_out: true,
    description: "Lunch at the bar",
    kcal: -1,
  };
  await expect(
    rpc("apply_historical_correction", [restaurant.token, d, "save", [out]]),
  ).rejects.toThrow("invalid_entry");
  out.portions[0].kcal = 580;
  await rpc("apply_historical_correction", [
    restaurant.token,
    d,
    "save",
    [out],
  ]);
  const final = await snapshot(),
    p = final.planning!.plans.find((m) => m.day === d)!.portions[0];
  expect(p).toMatchObject({
    eating_out: true,
    description: "Lunch at the bar",
    kcal: 580,
    budget: 400,
    lines: [],
  });
  expect(final.days).toEqual(s.days);
  expect(final.targets).toEqual(s.targets);
  expect(final.entries).toEqual(s.entries);
  await rpc("set_shopping_date_range", [d, d]);
  expect((await shopping()).items.every((i) => i.source === "manual")).toBe(
    true,
  );
});
it("V4 shopping includes multiple future weeks and legacy ranges cannot narrow it; egg settings are scoped and preserve nutrition", async () => {
  const current = await snapshot();
  await rpc("save_my_profile", [
    profile,
    current.members.find((m) => m.id === a)!.revision,
  ]);
  const lib = await rpc<PlanningState>("get_planning_library"),
    r = lib.recipes.find(
      (r) =>
        r.meal_types.includes("breakfast") &&
        !r.archived &&
        r.components.some((c) =>
          c.ingredients.some((i) => i.ingredient_id === "egg"),
        ),
    )!;
  const d = addDays(day, 80),
    later = addDays(d, 21),
    portion = makePortion(
      r,
      a,
      profile,
      400,
      false,
      lib.ingredients,
      lib.substitutions,
    );
  const plans = [d, later].map((day) => ({
    day,
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: [portion],
  }));
  await rpc("apply_meal_plans", [plans, lib.revision, false]);
  const initial = await shopping();
  expect(initial.scope).toBe("upcoming");
  expect(initial.contributions_complete).toBe(true);
  measurements.upcoming = {
    bytes: Buffer.byteLength(JSON.stringify(initial)),
    days: initial.contributions!.length,
    rows: initial.items.length,
  };
  expect(initial.contributions!.map((c) => c.day)).toEqual(
    expect.arrayContaining([d, later]),
  );
  const eggs = initial.items.find((i) => i.ingredient_id === "egg")!;
  expect(eggs.quantity).toBe(
    portion.lines.find((l) => l.ingredient_id === "egg")!.grams * 2,
  );
  expect(eggs.purchasing_unit).toMatchObject({
    unit: "egg",
    grams_per_unit: 50,
    estimated: true,
  });
  const manual = crypto.randomUUID();
  await rpc("save_manual_shopping_item", [manual, "Soap", "1", 0]);
  await rpc("set_shopping_checked", [crypto.randomUUID(), manual, true]);
  await rpc("set_shopping_date_range", [d, d]);
  expect((await shopping()).items.find((i) => i.id === eggs.id)!.quantity).toBe(
    eggs.quantity,
  );
  const preview = await rpc<any>("preview_shopping_list", [
    addDays(later, 30),
    addDays(later, 31),
  ]);
  expect(
    preview.changes.some((c: any) => c.after?.ingredient_id === "egg"),
  ).toBe(true);
  await rpc("apply_shopping_list", [
    preview.start_date,
    preview.end_date,
    preview.content_revision,
    preview.source_fingerprint,
  ]);
  const stable = await shopping();
  expect(stable.items.find((i) => i.id === manual)!.checked).toBe(true);
  expect((await shopping()).observation_revision).toBe(
    stable.observation_revision,
  );
  const beforePlans = (await snapshot()).planning!.plans;
  await rpc("save_egg_purchasing_unit", [60, 0]);
  await rpc("save_egg_purchasing_unit", [60, 0]); // lost-ack retry
  const configured = await shopping();
  expect(
    configured.items.find((i) => i.id === eggs.id)!.purchasing_unit,
  ).toMatchObject({
    grams_per_unit: 60,
    revision: 1,
    origin: "household_estimate",
  });
  expect(configured.items.find((i) => i.id === eggs.id)!.quantity).toBe(
    eggs.quantity,
  );
  expect((await snapshot()).planning!.plans).toEqual(beforePlans);
  await expect(rpc("save_egg_purchasing_unit", [70, 0])).rejects.toThrow(
    "stale_content",
  );
  await expect(rpc("save_egg_purchasing_unit", [-1, 1])).rejects.toThrow(
    "invalid_purchasing_unit",
  );
  await actor(b);
  await expect(rpc("save_egg_purchasing_unit", [80, 1])).rejects.toThrow(
    "membership_changed",
  );
  const otherList = await call<ShoppingState>("get_shopping_state", [
    other.household_id,
    other.membership_id,
  ]);
  expect(otherList.purchasing![0]).toMatchObject({
    grams_per_unit: 50,
    revision: 0,
  });
  await actor();
  await expect(
    db.exec("select * from app_private.purchasing_units"),
  ).rejects.toThrow("permission denied");
  await rpc("save_egg_purchasing_unit", [null, 1]);
  expect((await shopping()).purchasing![0]).toMatchObject({
    grams_per_unit: 50,
    revision: 2,
    origin: "starter_estimate",
  });
  // An increase still unchecks even when the whole-egg purchasing count is unchanged.
  let editable = await rpc<PlanningState>("get_planning_library");
  const more = structuredClone(editable.plans.find((m) => m.day === later)!);
  more.portions[0].lines.find((l) => l.ingredient_id === "egg")!.quantity += 1;
  await rpc("apply_meal_plans", [[more], editable.revision, true]);
  const firstIncrease = (await shopping()).items.find((i) => i.id === eggs.id)!;
  await rpc("set_shopping_checked", [crypto.randomUUID(), eggs.id, true]);
  editable = await rpc<PlanningState>("get_planning_library");
  more.portions[0].lines.find((l) => l.ingredient_id === "egg")!.quantity += 1;
  await rpc("apply_meal_plans", [[more], editable.revision, true]);
  const secondIncrease = (await shopping()).items.find(
    (i) => i.id === eggs.id,
  )!;
  expect(secondIncrease.quantity!).toBeGreaterThan(firstIncrease.quantity!);
  expect(Math.ceil(secondIncrease.quantity! / 50)).toBe(
    Math.ceil(firstIncrease.quantity! / 50),
  );
  expect(secondIncrease.checked).toBe(false);
  await db.exec("reset role");
  await db.exec("begin;select app_private.actor()");
  const explained = (
    await db.query<any>(
      "explain (analyze,format json) select * from app_private.upcoming_contributions()",
    )
  ).rows[0]["QUERY PLAN"][0];
  measurements.upcoming_query = {
    execution_ms: explained["Execution Time"],
    rows: explained.Plan["Actual Rows"],
  };
  expect(explained.Plan["Actual Rows"]).toBeGreaterThan(0);
  await db.exec("rollback");
  await actor();
  // Closing one date subtracts only its contribution and never regenerates it.
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set closed=true where household_id=$1 and day=$2",
    [home.household_id, d],
  );
  await actor();
  const expired = await shopping();
  expect(expired.contributions!.some((c) => c.day === d)).toBe(false);
  expect(expired.items.find((i) => i.id === eggs.id)!.quantity).toBe(
    eggs.quantity! / 2 + 2,
  );
  expect(expired.items.find((i) => i.id === manual)!.checked).toBe(true);
  const finalLib = await rpc<PlanningState>("get_planning_library");
  await rpc("delete_planned_meal", [later, "breakfast", finalLib.revision]);
  const empty = await shopping();
  expect(empty.items.every((i) => i.source === "manual")).toBe(true);
  expect((await shopping()).observation_revision).toBe(
    empty.observation_revision,
  );
  expect(
    (await rpc("set_shopping_checked", [crypto.randomUUID(), eggs.id, true]))
      .status,
  ).toBe("removed");
});
it("V4 short ingredient aliases search the complete catalogue without rewriting source names or leaking household overrides", async () => {
  await actor();
  const labels = JSON.parse(
    readFileSync("content/presentation/ingredient-names.json", "utf8"),
  );
  const lib = await rpc<PlanningState>("get_planning_library");
  await db.exec("reset role");
  for (const [id, entry] of Object.entries(labels) as [string, any][]) {
    const projected = await db.query<{ names: any }>(
      "select app_private.ingredient_display_names($1,$2) names",
      [id, entry.source_name],
    );
    expect(projected.rows[0].names).toEqual(entry.name);
  }
  await actor();
  await expect(
    db.query("select app_private.ingredient_display_names('egg','{}')"),
  ).rejects.toThrow("permission denied");
  for (const [query, id] of [
    ["Eggs", "egg"],
    ["Almonds", "almond"],
    ["Carrots", "carrot"],
    ["Huevos", "egg"],
  ]) {
    const page = await rpc<any>("get_catalogue_page", [
      "ingredient",
      query,
      false,
      null,
    ]);
    expect(page.items.map((i: any) => i.id)).toContain(id);
    const item = page.items.find((i: any) => i.id === id);
    expect(item.name).toEqual(lib.ingredients.find((i) => i.id === id)!.name);
  }
  const source = lib.ingredients.find((i) => i.id === "egg")!;
  const privateEgg = {
    ...source,
    name: { en: "Our own raw egg", es: source.name.es },
  };
  await rpc("save_household_content", [
    "ingredient",
    privateEgg,
    source.revision,
    false,
  ]);
  expect(
    (
      await rpc<any>("get_catalogue_page", ["ingredient", "Eggs", false, null])
    ).items.some((i: any) => i.id === "egg"),
  ).toBe(false);
  expect(
    (
      await rpc<any>("get_catalogue_page", [
        "ingredient",
        "Huevos",
        false,
        null,
      ])
    ).items.find((i: any) => i.id === "egg").name.en,
  ).toBe("Our own raw egg");
  const own = await rpc<any>("get_catalogue_item", ["ingredient", "egg"]);
  expect(own.item.nutrition_per_100g).toEqual(source.nutrition_per_100g);
  expect(own.item.conversions).toEqual(source.conversions);
  expect(own.item.state).toBe(source.state);
  await actor(b);
  const otherEggs = await call<any>("get_catalogue_page", [
    other.household_id,
    other.membership_id,
    "ingredient",
    "Eggs",
    false,
    null,
  ]);
  expect(otherEggs.items.find((i: any) => i.id === "egg").name).toEqual(
    source.name,
  );
  await expect(
    rpc("get_catalogue_page", ["ingredient", "Eggs", false, null]),
  ).rejects.toThrow("membership_changed");
  await actor();
});
it("household recipe vetoes survive edits, preserve meals and starter data, and enforce context/CAS", async () => {
  await actor();
  const initial = await rpc<PlanningState>("get_planning_library");
  const recipe = initial.recipes.find((r) => r.id === "m02")!;
  const savedPlans = JSON.stringify(initial.plans),
    savedShopping = JSON.stringify((await shopping()).items);
  const beforeDetail = await rpc<any>("get_catalogue_item", [
    "recipe",
    recipe.id,
  ]);
  const veto = await rpc<any>("set_recipe_veto", [recipe.id, true, 0]);
  expect(veto).toMatchObject({
    banned: true,
    veto_revision: 1,
    revision: recipe.revision,
  });
  await rpc("set_recipe_veto", [recipe.id, true, 0]); // safe retry after a lost acknowledgement
  await expect(rpc("set_recipe_veto", [recipe.id, false, 0])).rejects.toThrow(
    "stale_content",
  );
  const page = await rpc<any>("get_catalogue_page", [
    "recipe",
    recipe.name.en,
    false,
    null,
  ]);
  expect(page.items.find((r: any) => r.id === recipe.id).banned).toBe(true);
  const library = await rpc<PlanningState>("get_planning_library");
  expect(library.recipes.find((r) => r.id === recipe.id)?.banned).toBe(true);
  expect(JSON.stringify(library.plans)).toBe(savedPlans);
  expect(JSON.stringify((await shopping()).items)).toBe(savedShopping);
  const afterDetail = await rpc<any>("get_catalogue_item", [
    "recipe",
    recipe.id,
  ]);
  expect(afterDetail.item.components).toEqual(beforeDetail.item.components);
  await rpc("save_household_content", [
    "recipe",
    {
      ...afterDetail.item,
      banned: false,
      name: { ...recipe.name, en: "Private dal" },
    },
    recipe.revision,
    false,
  ]);
  expect(
    (await rpc<any>("get_catalogue_item", ["recipe", recipe.id])).item.banned,
  ).toBe(true);
  await actor(b);
  await expect(rpc("set_recipe_veto", [recipe.id, false, 1])).rejects.toThrow(
    "membership_changed",
  );
  const otherDetail = await call<any>("get_catalogue_item", [
    other.household_id,
    other.membership_id,
    "recipe",
    recipe.id,
  ]);
  expect(otherDetail.item.banned).toBe(false);
  expect(otherDetail.item.name).toEqual(recipe.name);
  await actor();
  await expect(
    db.exec("select * from app_private.recipe_vetoes"),
  ).rejects.toThrow("permission denied");
  const restored = await rpc<any>("set_recipe_veto", [recipe.id, false, 1]);
  expect(restored).toMatchObject({ banned: false, veto_revision: 2 });
  expect(restored.name.en).toBe("Private dal");
  await expect(
    rpc("set_recipe_veto", ["missing-recipe", true, 0]),
  ).rejects.toThrow("catalogue_item_unavailable");
});
it("personal recipe review resumes across reads, remains isolated and reopens edited recipes", async () => {
  await actor();
  const lib = await rpc<PlanningState>("get_planning_library");
  const r = lib.recipes.find((r) => r.id === "m03")!;
  expect((await rpc<any>("get_recipe_review")).reviewed_recipe_ids).toEqual([]);
  const ack = await rpc<any>("review_recipe", [
    r.id,
    true,
    r.veto_revision ?? 0,
    r.revision,
  ]);
  expect(ack.banned).toBe(true);
  expect(ack.household_revision).toBeGreaterThan(lib.revision);
  expect((await rpc<any>("get_recipe_review")).reviewed_recipe_ids).toContain(
    r.id,
  );
  const c = "90000000-0000-0000-0000-000000000003";
  await db.exec("reset role");
  await db.query(
    `insert into auth.users values($1,'c@example.com',now(),'{"provider":"google"}','{}')`,
    [c],
  );
  await actor();
  await rpc("invite_member", ["c@example.com"]);
  await actor(c);
  const invitation = (await call<any>("get_household_access")).invitations[0]
    .id;
  await call("join_household", [invitation, "UTC"]);
  const context = (await call<any>("get_household_access")).active;
  expect(
    (
      await call<any>("get_recipe_review", [
        context.household_id,
        context.membership_id,
      ])
    ).reviewed_recipe_ids,
  ).toEqual([]);
  await call("reset_recipe_review", [
    context.household_id,
    context.membership_id,
  ]);
  await actor();
  expect((await rpc<any>("get_recipe_review")).reviewed_recipe_ids).toContain(
    r.id,
  );
  const again = await rpc<any>("review_recipe", [
    r.id,
    true,
    r.veto_revision ?? 0,
    r.revision,
  ]);
  expect(again.veto_revision).toBe(ack.veto_revision);
  await actor(b);
  expect(
    (
      await call<any>("get_recipe_review", [
        other.household_id,
        other.membership_id,
      ])
    ).reviewed_recipe_ids,
  ).toEqual([]);
  await expect(rpc("reset_recipe_review")).rejects.toThrow(
    "membership_changed",
  );
  await actor();
  await expect(
    db.exec("select * from app_private.recipe_reviews"),
  ).rejects.toThrow("permission denied");
  await rpc("save_household_content", [
    "recipe",
    { ...r, name: { ...r.name, en: "Edited review recipe" } },
    r.revision,
    false,
  ]);
  expect(
    (await rpc<any>("get_recipe_review")).reviewed_recipe_ids,
  ).not.toContain(r.id);
  await expect(
    rpc("review_recipe", [r.id, false, ack.veto_revision, r.revision]),
  ).rejects.toThrow("stale_content");
  const latest = (await rpc<any>("get_catalogue_item", ["recipe", r.id])).item;
  await rpc("review_recipe", [
    r.id,
    false,
    latest.veto_revision,
    latest.revision,
  ]);
  await rpc("reset_recipe_review");
  expect((await rpc<any>("get_recipe_review")).reviewed_recipe_ids).toEqual([]);
  expect(
    (await rpc<any>("get_catalogue_item", ["recipe", r.id])).item.banned,
  ).toBe(false);
});
it("accepts consecutive repeated meals and content without legacy variety metadata", async () => {
  await actor();
  let lib = await rpc<PlanningState>("get_planning_library");
  const ingredient = structuredClone(
    lib.ingredients.find((i) => i.id === "chickpeas")!,
  );
  ingredient.id = "no-variety-chickpeas";
  delete ingredient.variety_key;
  await rpc("save_household_content", ["ingredient", ingredient, 0, false]);
  const recipe = structuredClone(lib.recipes.find((r) => r.id === "m01")!);
  recipe.id = "no-variety-recipe";
  for (const c of recipe.components)
    for (const line of c.ingredients) delete line.variety_role;
  await rpc("save_household_content", ["recipe", recipe, 0, false]);
  lib = await rpc<PlanningState>("get_planning_library");
  const portion = makePortion(
    recipe,
    home.membership_id,
    profile,
    650,
    false,
    lib.ingredients,
    lib.substitutions,
  );
  const batch = [0, 1, 2].flatMap((offset) =>
    (["lunch", "dinner"] as const).map((type) => ({
      day: addDays(day, 120 + offset),
      type,
      revision: 0,
      shared_recipe_id: recipe.id,
      portions: [portion],
    })),
  );
  await rpc("apply_meal_plans", [batch, lib.revision, false]);
  const saved = (await rpc<PlanningState>("get_planning_library")).plans.filter(
    (p) => batch.some((b) => b.day === p.day && b.type === p.type),
  );
  expect(saved).toHaveLength(6);
  expect(saved.every((p) => p.shared_recipe_id === recipe.id)).toBe(true);
  expect(saved[0].portions[0].lines[0].variety_role).toBeUndefined();
  await rpc("save_planner_settings", [0, -999]); // Obsolete second parameter is ignored.
  expect((await snapshot()).household.week_start).toBe(0);
  await expect(rpc("save_planner_settings", [2, 3])).rejects.toThrow(
    "invalid_recipe",
  );
});
it("new global recipes work in existing and new households and private edits stay private", async () => {
  await actor();
  const pack = JSON.parse(
    readFileSync("content/expansions/requested-recipes.json", "utf8"),
  );
  const lib = await rpc<PlanningState>("get_planning_library");
  const plans = pack.recipes.map((r: any, index: number) => ({
    day: addDays(day, 200 + index),
    type: r.meal_types[0],
    revision: 0,
    shared_recipe_id: r.meal_types[0] === "breakfast" ? null : r.id,
    portions: [
      makePortion(
        r,
        home.membership_id,
        profile,
        600,
        false,
        lib.ingredients,
        [],
      ),
    ],
  }));
  await rpc("apply_meal_plans", [plans, lib.revision, false]);
  const saved = await rpc<PlanningState>("get_planning_library");
  for (const r of pack.recipes) {
    expect(saved.recipes.some((f) => f.id === r.id)).toBe(true);
    expect(
      saved.plans.some((p) => p.portions.some((q) => q.recipe_id === r.id)),
    ).toBe(true);
  }
  // Exercise the independent server re-planning path, including tiny spices.
  for (const [index, recipe] of pack.recipes.entries()) {
    const review = await rpc<any>("preview_meal_transfer", [
      {
        mode: "paste",
        target: {
          day: addDays(day, 200 + index),
          type: recipe.meal_types[0],
          ...(recipe.meal_types[0] === "breakfast"
            ? { member_id: home.membership_id }
            : {}),
        },
        choice: { recipe_id: recipe.id, revision: 1, desserts: {} },
      },
    ]);
    const actual = review.plans[0].portions.find(
      (p: any) => p.member_id === home.membership_id,
    );
    const expected = makePortion(
      recipe,
      home.membership_id,
      profile,
      actual.budget,
      false,
      lib.ingredients,
      [],
    );
    expect(actual.lines).toEqual(expected.lines);
  }
  const original = pack.recipes[0];
  const detail = (await rpc<any>("get_catalogue_item", ["recipe", original.id]))
    .item;
  await rpc("save_household_content", [
    "recipe",
    {
      ...detail,
      name: { en: "Our private toast", es: "Nuestra tostada privada" },
    },
    detail.revision,
    false,
  ]);
  await actor(b);
  const theirs = await call<any>("get_catalogue_item", [
    other.household_id,
    other.membership_id,
    "recipe",
    original.id,
  ]);
  expect(theirs.item.name).toEqual(original.name);
  expect(theirs.item.source_recipe.url).toBe(original.source_recipe.url);
  const ingredients = await call<any>("get_catalogue_item", [
    other.household_id,
    other.membership_id,
    "ingredient",
    "mozzarella",
  ]);
  expect(ingredients.item.nutrition_per_100g.energy_kcal).toBe(257);
  await expect(
    db.exec(
      "update app_private.starter_content set data='{}'::jsonb where id='global_banana_bread'",
    ),
  ).rejects.toThrow("permission denied");
  await actor();
  expect(
    (await rpc<any>("get_catalogue_item", ["recipe", original.id])).item.name
      .en,
  ).toBe("Our private toast");
});
it("saves a generated full week with shared meals and source-backed individual breakfasts", async () => {
  await actor();
  const { suggested } = await import("../src/pages/planner");
  const state = await snapshot(),
    lib = await rpc<PlanningState>("get_planning_library");
  const batch: MealPlan[] = [];
  for (let offset = 0; offset < 7; offset++)
    for (const type of ["breakfast", "lunch", "dinner"] as const) {
      const plan = suggested(
        { s: state } as any,
        lib,
        addDays(day, 300 + offset),
        type,
        batch,
      );
      expect(plan, `${offset}/${type}`).not.toBeNull();
      if (plan) batch.push(plan);
    }
  expect(batch).toHaveLength(21);
  await rpc("apply_meal_plans", [batch, lib.revision, false]);
  const saved = await rpc<PlanningState>("get_planning_library");
  expect(
    saved.plans.filter((p) =>
      batch.some((b) => b.day === p.day && b.type === p.type),
    ),
  ).toHaveLength(21);
});
it("server and historical calorie warnings match whole-kcal displays without rounding stored energy", async () => {
  await actor();
  const lib = await rpc<PlanningState>("get_planning_library");
  const recipe = lib.recipes.find((r) => r.id === "b04")!;
  const base = makePortion(
    recipe,
    home.membership_id,
    profile,
    500,
    false,
    lib.ingredients,
    [],
  );
  const yogurt = base.lines.find((l) => l.ingredient_id === "yogurt")!;
  const before = await snapshot();
  await db.exec("reset role;set role week_menu_executor");
  for (const [quantity, budget, warn] of [
    [100, 57, false],
    [100.4, 57, false],
    [100.9, 57, true],
    [100, 56.8, false],
    [100, 56.49, true],
  ] as const) {
    const portion = {
      ...base,
      budget,
      recipe_snapshot: recipe,
      kcal: 9999,
      warnings: [],
      lines: [{ ...yogurt, quantity, kcal: 9999 }],
    };
    const old = {
      ...portion,
      lines: [{ ...portion.lines[0], quantity: quantity + 1 }],
    };
    const checked = (
      await db.query<{ r: typeof base }>(
        "select app_private.checked_portion_v2($1::jsonb) r",
        [portion],
      )
    ).rows[0].r;
    const historical = (
      await db.query<{ r: typeof base }>(
        "select app_private.historical_portion($1::jsonb,$2::jsonb,$3::date,'breakfast') r",
        [portion, old, day],
      )
    ).rows[0].r;
    for (const result of [checked, historical]) {
      expect(result.warnings.includes("over_budget")).toBe(warn);
      expect(result.kcal).toBeCloseTo(
        (quantity * yogurt.energy_per_100g) / 100,
        8,
      );
      expect(result.budget).toBe(budget);
    }
  }
  await actor();
  const after = await snapshot();
  expect(after.targets).toEqual(before.targets);
  expect(after.meals).toEqual(before.meals);
});
it("resizes planned quantities to current budgets atomically, with automatic shopping and stale-review protection", async () => {
  await actor();
  const { recalculatePlannedPortions } =
    await import("../src/domain/recalculate-portions");
  const d = addDays(day, 400),
    lib = await rpc<PlanningState>("get_planning_library"),
    state = await snapshot();
  const person = state.members.find((m) => m.id === home.membership_id)!;
  const recipe = lib.recipes.find((r) => r.id === "b04")!;
  const original = {
    day: d,
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: [
      makePortion(
        recipe,
        person.id,
        person.profile!,
        200,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ],
  };
  await rpc("apply_meal_plans", [[original], lib.revision, false]);
  await rpc("save_my_budget_override", [d, "breakfast", 750]);
  const grocery = (await shopping()).items.find(
    (i) => i.source === "generated" && i.ingredient_id === "yogurt",
  )!;
  await rpc("set_shopping_checked", [crypto.randomUUID(), grocery.id, true]);
  const review = recalculatePlannedPortions(await snapshot(), [d]);
  expect(review.changes).toHaveLength(1);
  await rpc("save_my_budget_override", [d, "breakfast", 760]);
  const before = await snapshot();
  await expect(
    rpc("apply_meal_plans", [review.plans, review.revision, true]),
  ).rejects.toThrow("stale_plan");
  expect((await snapshot()).planning!.plans).toEqual(before.planning!.plans);
  const fresh = recalculatePlannedPortions(await snapshot(), [d]);
  const previous = fresh.changes[0].before;
  await rpc("apply_meal_plans_with_history", [
    "88000000-0000-0000-0000-000000000010",
    "recalculate",
    fresh.plans,
    fresh.revision,
    true,
  ]);
  const after = await snapshot(),
    saved = after.planning!.plans.find(
      (p) => p.day === d && p.type === "breakfast",
    )!;
  const portion = saved.portions[0];
  expect(portion.budget).toBe(760);
  expect(Math.abs(portion.kcal - 760)).toBeLessThan(
    Math.abs(previous.kcal - 760),
  );
  expect(portion.recipe_snapshot).toEqual(previous.recipe_snapshot);
  expect(
    portion.lines.map((l) => [l.ingredient_id, l.component_id, l.unit]),
  ).toEqual(
    previous.lines.map((l) => [l.ingredient_id, l.component_id, l.unit]),
  );
  expect(after.planning!.plans.filter((p) => p.day !== d)).toEqual(
    before.planning!.plans.filter((p) => p.day !== d),
  );
  expect(after.targets).toEqual(before.targets);
  const updated = (await shopping()).items.find((i) => i.id === grocery.id)!;
  expect(updated.quantity).toBeGreaterThan(grocery.quantity!);
  expect(updated.checked).toBe(false);
});

it("persists personal meal times, validates input and isolates household context", async () => {
  await actor();
  const defaults = { breakfast: "09:00", lunch: "14:00", dinner: "21:00" };
  const before = await snapshot();
  expect(
    before.members.find((m) => m.id === home.membership_id)?.meal_times,
  ).toEqual(defaults);
  const times = { ...defaults, breakfast: "08:30" };
  await rpc("save_my_meal_times", [times]);
  expect(
    (await snapshot()).members.find((m) => m.id === home.membership_id)
      ?.meal_times,
  ).toEqual(times);
  for (const invalid of [
    null,
    {},
    [],
    { ...times, dinner: "24:00" },
    { ...times, lunch: 14 },
    { ...times, extra: "00:00" },
  ])
    await expect(rpc("save_my_meal_times", [invalid])).rejects.toThrow(
      "invalid_meal_times",
    );
  await actor(b);
  expect(
    (
      await call<HouseholdState>("get_household_snapshot", [
        other.household_id,
        other.membership_id,
      ])
    ).members.find((m) => m.id === other.membership_id)?.meal_times,
  ).toEqual(defaults);
  await expect(rpc("save_my_meal_times", [defaults])).rejects.toThrow();
  await actor();
  expect(
    (await snapshot()).members.find((m) => m.id === home.membership_id)
      ?.meal_times,
  ).toEqual(times);
  await expect(
    db.exec("update public.members set meal_times='{}'::jsonb"),
  ).rejects.toThrow("permission denied");
  await rpc("save_my_meal_times", [defaults]);
});

it("records transactional menu operations with actor, details, receipts and household isolation", async () => {
  await actor();
  const lib = await rpc<PlanningState>("get_planning_library");
  const state = await snapshot();
  const member = state.members.find((m) => m.id === home.membership_id)!;
  const r = lib.recipes.find(
    (r) => r.meal_types.includes("breakfast") && !r.archived && !r.banned,
  )!;
  const date = addDays(day, 30);
  const plan: MealPlan = {
    day: date,
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: [
      makePortion(
        r,
        member.id,
        member.profile!,
        400,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ],
  };
  const op = "88000000-0000-0000-0000-000000000001";
  await rpc("apply_meal_plans_with_history", [
    op,
    "suggestions",
    [plan],
    lib.revision,
    true,
  ]);
  const list = await rpc("get_planning_history", [{}, null]);
  const entry = list.events.find((e: any) => e.action === "suggestions");
  expect(entry.actor_id).toBe(member.id);
  expect(entry.summary.es).toContain("Aprobar sugerencias y guardar");
  expect(entry.changes).toBeUndefined();
  const detail = await rpc("get_planning_history_event", [entry.id]);
  expect(JSON.stringify(detail.changes)).toContain(date);
  expect(JSON.stringify(detail.changes)).not.toContain("recipe_snapshot");
  await rpc("apply_meal_plans_with_history", [
    op,
    "suggestions",
    [plan],
    lib.revision,
    true,
  ]);
  expect(
    (await rpc("get_planning_history", [{}, null])).events.filter(
      (e: any) => e.id === entry.id,
    ),
  ).toHaveLength(1);
  await expect(
    rpc("apply_meal_plans_with_history", [
      op,
      "review_meal",
      [plan],
      lib.revision,
      true,
    ]),
  ).rejects.toThrow("operation_mismatch");
  const latest = await rpc<PlanningState>("get_planning_library");
  const count = (await rpc("get_planning_history", [{}, null])).events.length;
  await expect(
    rpc("apply_meal_plans_with_history", [
      "88000000-0000-0000-0000-000000000002",
      "suggestions",
      [plan],
      lib.revision,
      true,
    ]),
  ).rejects.toThrow("stale_plan");
  expect((await rpc("get_planning_history", [{}, null])).events).toHaveLength(
    count,
  );
  await rpc("apply_meal_plans_with_history", [
    "88000000-0000-0000-0000-000000000003",
    "review_meal",
    [plan],
    latest.revision,
    true,
  ]);
  expect((await rpc("get_planning_history", [{}, null])).events).toHaveLength(
    count,
  );
  await actor(b);
  await expect(
    call("get_planning_history_event", [
      other.household_id,
      other.membership_id,
      entry.id,
    ]),
  ).rejects.toThrow("history_event_unavailable");
  await expect(rpc("get_planning_history", [{}, null])).rejects.toThrow(
    "membership_changed",
  );
  await actor();
  await expect(
    db.exec("delete from app_private.planning_history"),
  ).rejects.toThrow("permission denied");
  await expect(
    db.exec("select app_private.purge_planning_history()"),
  ).rejects.toThrow("permission denied");
});
it("paginates history without payloads, filters authors and purges expired evidence across households", async () => {
  await db.exec("reset role");
  await db.query(
    `insert into app_private.planning_history(household_id,actor_id,actor_name,action,created_at,summary,changes)
 select $1,$2,'History fixture','budget',clock_timestamp()-interval '1 day', '{"en":"Fixture change","es":"Cambio de prueba"}', '{"seed":{"kind":"budget_overrides","before":null,"after":{"kcal":400}}}' from generate_series(1,61)`,
    [home.household_id, home.membership_id],
  );
  const expired = (
    await db.query<{ id: string }>(
      `insert into app_private.planning_history(household_id,actor_name,action,created_at,summary) values($1,'Expired','system',clock_timestamp()-interval '91 days','{}') returning id`,
      [other.household_id],
    )
  ).rows[0].id;
  await actor();
  const first = await rpc("get_planning_history", [
    { actor: "history fixture" },
    null,
  ]);
  expect(first.events).toHaveLength(50);
  expect(first.next_cursor).not.toBeNull();
  const second = await rpc("get_planning_history", [
    { actor: "history fixture" },
    first.next_cursor,
  ]);
  expect(second.events).toHaveLength(11);
  expect(second.next_cursor).toBeNull();
  expect(
    new Set([...first.events, ...second.events].map((e: any) => e.id)).size,
  ).toBe(61);
  expect(first.events.every((e: any) => !e.changes)).toBe(true);
  await db.exec("reset role");
  await db.exec("select app_private.purge_planning_history()");
  expect(
    (
      await db.query(
        "select id from app_private.planning_history where id=$1",
        [expired],
      )
    ).rows,
  ).toHaveLength(0);
  await actor();
});

it("imports only real historical evidence with its original timestamp and author", async () => {
  await actor();
  const e = await rpc("get_planning_history_event", [
    "87000000-0000-0000-0000-000000000001",
  ]);
  expect(e.imported).toBe(true);
  expect(e.actor_id).toBe(home.membership_id);
  expect(Date.parse(e.created_at)).toBeLessThan(Date.now() - 39 * 86400000);
  expect(e.summary.es).toContain("importado");
});

it("keeps captured author names and labels unauthenticated administrator writes as system", async () => {
  await actor();
  const recent = (await rpc("get_planning_history", [{}, null])).events.find(
    (e: any) => e.actor_id === home.membership_id,
  );
  const savedName = recent.actor_name;
  await db.exec("reset role");
  await db.query(
    "update public.members set name='Renamed author' where id=$1",
    [home.membership_id],
  );
  await actor();
  expect(
    (await rpc("get_planning_history_event", [recent.id])).actor_name,
  ).toBe(savedName);
  await db.exec("reset role");
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  await db.query(
    "insert into public.budget_overrides(household_id,member_id,day,meal_type,kcal) values($1,$2,$3,'breakfast',401)",
    [home.household_id, home.membership_id, addDays(day, 80)],
  );
  await actor();
  const system = (
    await rpc("get_planning_history", [{ action: "system" }, null])
  ).events[0];
  expect(system.actor_id).toBeNull();
  expect(system.action).toBe("system");
  await db.exec("reset role");
  await db.query("update public.members set name=$1 where id=$2", [
    savedName,
    home.membership_id,
  ]);
  await actor();
});

it("does not report catalogue revision-only saves as planning changes", async () => {
  await actor();
  const lib = await rpc<PlanningState>("get_planning_library");
  const recipe = lib.recipes.find((r) => !r.archived)!;
  const before = await rpc("get_planning_history", [
    { action: "catalogue" },
    null,
  ]);
  await rpc("save_household_content", [
    "recipe",
    recipe,
    recipe.revision ?? 1,
    false,
  ]);
  const after = await rpc("get_planning_history", [
    { action: "catalogue" },
    null,
  ]);
  expect(after.events.map((e: any) => e.id)).toEqual(
    before.events.map((e: any) => e.id),
  );
});

it("V6 cooking is canonical, scoped, idempotent and never changes shopping or saved calories", async () => {
  await actor();
  const lib = await rpc<PlanningState>("get_planning_library");
  const d = addDays(day, 26),
    recipe = lib.recipes.find((r) => r.id === "m02")!;
  const plan: MealPlan = {
    day: d,
    type: "lunch",
    revision: 0,
    shared_recipe_id: recipe.id,
    portions: [
      makePortion(
        recipe,
        home.membership_id,
        profile,
        650,
        false,
        lib.ingredients,
        lib.substitutions,
      ),
    ],
  };
  await rpc("apply_meal_plans", [[plan], lib.revision, false]);
  const beforeShopping = await shopping(),
    beforePlans = (await rpc<PlanningState>("get_planning_library")).plans;
  let state = await rpc<any>("get_cooking_state");
  const session = new Date();
  session.setUTCDate(session.getUTCDate() + 1);
  session.setUTCHours(10, 0, 0, 0);
  const settings = {
    timezone: "UTC",
    sessions: [{ weekday: session.getUTCDay() || 7, time: "10:00" }],
    usage_mode: "manual",
    prefer_whole: false,
  };
  const send = async (
    action: string,
    payload: any,
    revision = state.revision,
    operation = crypto.randomUUID(),
  ) => rpc("apply_cooking_command", [operation, revision, action, payload]);
  await send("settings", { settings });
  state = await rpc("get_cooking_state");
  const r = state.requirements.find(
    (r: any) => r.day === d && r.scope.includes("rice_"),
  );
  expect(r).toBeDefined();
  // Use a session within the thirty-day freezing cap.
  const near = new Date(d + "T10:00:00Z");
  near.setUTCDate(near.getUTCDate() - 4);
  settings.sessions = [{ weekday: near.getUTCDay() || 7, time: "10:00" }];
  await send("settings", { settings });
  state = await rpc("get_cooking_state");
  const task = {
    session_at: near.toISOString(),
    allocations: [
      {
        target: { ...r, lines: [], name: { en: "forged", es: "falso" } },
        grams: r.grams,
        storage: "frozen",
      },
    ],
  };
  const op = crypto.randomUUID(),
    rev = state.revision;
  await send("plan", { tasks: [task] }, rev, op);
  await send("plan", { tasks: [task] }, rev, op);
  await expect(send("plan", { tasks: [] }, rev, op)).rejects.toThrow(
    "operation_mismatch",
  );
  state = await rpc("get_cooking_state");
  expect(state.batches).toHaveLength(1);
  expect(state.batches[0].lines).toEqual(r.lines);
  await expect(send("plan", { tasks: [task] })).rejects.toThrow(
    "cooking_overallocated",
  );
  await expect(
    send("cancel", { batch_id: state.batches[0].id }, rev),
  ).rejects.toThrow("stale_plan");
  // Preparation cannot pretend old food was safely chilled today.
  const id = state.batches[0].id,
    now = new Date().toISOString();
  await expect(
    send("prepare", {
      batch_id: id,
      grams: r.grams,
      cooked_grams: null,
      cooked_at: "2020-01-01T00:00:00Z",
      stored_at: now,
      storage: "frozen",
    }),
  ).rejects.toThrow("cooking_storage_invalid");
  await send("prepare", {
    batch_id: id,
    grams: r.grams / 2,
    cooked_grams: r.grams,
    cooked_at: now,
    stored_at: now,
    storage: "frozen",
  });
  state = await rpc("get_cooking_state");
  expect(state.batches[0].status).toBe("cooked");
  expect(state.batches[0].containers[0].grams).toBe(r.grams / 2);
  await send("settings", {
    settings: { ...state.settings, timezone: "Europe/Madrid" },
  });
  state = await rpc("get_cooking_state");
  expect(state.batches[0].containers[0].usage_timezone).toBe("Europe/Madrid");
  const container = state.batches[0].containers[0].id;
  await expect(send("use", { container_ids: [container] })).rejects.toThrow(
    "cooking_review_required",
  );
  await send("release", { container_id: container });
  state = await rpc("get_cooking_state");
  await send("assign", {
    container_id: container,
    target_id: r.id,
    grams: r.grams / 4,
  });
  state = await rpc("get_cooking_state");
  expect(state.batches[0].containers).toHaveLength(2);
  expect(
    state.batches[0].containers.reduce((n: number, c: any) => n + c.grams, 0),
  ).toBe(r.grams / 2);
  await send("store", { container_id: container, storage: "thawing" });
  state = await rpc("get_cooking_state");
  await send("store", { container_id: container, storage: "fridge" });
  state = await rpc("get_cooking_state");
  await expect(
    send("store", { container_id: container, storage: "frozen" }),
  ).rejects.toThrow("cooking_storage_invalid");
  await actor(b);
  await expect(rpc("get_cooking_state")).rejects.toThrow("membership_changed");
  await actor();
  expect((await shopping()).items).toEqual(beforeShopping.items);
  expect((await rpc<PlanningState>("get_planning_library")).plans).toEqual(
    beforePlans,
  );
  const history = await rpc<any>("get_planning_history", [{}, null]);
  expect(
    history.events.some(
      (e: any) => e.action === "cooking" && e.actor_id === home.membership_id,
    ),
  ).toBe(true);
  await send("discard", { container_id: container });
}, 30000);

it("V6 automatic use is recorded as System and changing modes leaves past manual reservations pending", async () => {
  await actor();
  const lib = await rpc<PlanningState>("get_planning_library"),
    source = lib.plans.find(
      (p) => p.day === addDays(day, 26) && p.type === "lunch",
    )!;
  const yesterday = addDays((await snapshot()).server_now.slice(0, 10), -1),
    past = { ...source, day: yesterday, type: "dinner" };
  await db.exec("reset role");
  await db.query(
    `insert into public.meal_plans(household_id,day,meal_type,data,revision) values($1,$2,'dinner',$3,1) on conflict(household_id,day,meal_type) do update set data=excluded.data`,
    [home.household_id, yesterday, past],
  );
  await actor();
  let state = await rpc<any>("get_cooking_state");
  const r = state.requirements.find(
    (r: any) => r.day === yesterday && r.type === "dinner",
  )!;
  expect(r).toBeDefined();
  const batch = structuredClone(state.batches[0]),
    base = batch.containers[1];
  batch.id = crypto.randomUUID();
  batch.status = "cooked";
  batch.grams = r.grams;
  batch.cooked_at = yesterday + "T10:00:00Z";
  batch.containers = ["manual", "automatic"].map((mode) => ({
    ...base,
    id: crypto.randomUUID(),
    batch_id: batch.id,
    grams: r.grams / 2,
    status: "reserved",
    storage: "frozen",
    target_id: r.id,
    target_snapshot: r,
    usage_mode: mode,
    usage_timezone: "UTC",
    expires_at: new Date(Date.now() + 86400000 * 10).toISOString(),
  }));
  await db.exec("reset role");
  await db.query(
    `update app_private.cooking_ledger set batches=batches || jsonb_build_array($2::jsonb) where household_id=$1`,
    [home.household_id, batch],
  );
  await actor();
  state = await rpc("get_cooking_state");
  const fresh = state.batches.find((b: any) => b.id === batch.id);
  expect(fresh.containers.map((c: any) => c.status)).toEqual([
    "reserved",
    "assumed",
  ]);
  expect(fresh.containers[0].pending).toBe(true);
  const history = await rpc<any>("get_planning_history", [
    { action: "system" },
    null,
  ]);
  const event = history.events.find((e: any) =>
    e.summary.en.includes("Automatic consumption"),
  );
  expect(event).toMatchObject({
    actor_id: null,
    actor_name: "Sistema / System",
  });
  await rpc("apply_cooking_command", [
    crypto.randomUUID(),
    state.revision,
    "settings",
    { settings: { ...state.settings, usage_mode: "automatic" } },
  ]);
  state = await rpc("get_cooking_state");
  expect(
    state.batches.find((b: any) => b.id === batch.id).containers[0].status,
  ).toBe("reserved");
  const stock = state.batches.find((b: any) => b.id === batch.id).containers[1];
  await rpc("apply_cooking_command", [
    crypto.randomUUID(),
    state.revision,
    "restore",
    { container_id: stock.id },
  ]);
  state = await rpc("get_cooking_state");
  expect(
    state.batches.find((b: any) => b.id === batch.id).containers[1].status,
  ).toBe("available");
  const manual = state.batches.find((b: any) => b.id === batch.id).containers[0]
    .id;
  const send = async (action: string, payload: any) => {
    await rpc("apply_cooking_command", [
      crypto.randomUUID(),
      state.revision,
      action,
      payload,
    ]);
    state = await rpc("get_cooking_state");
  };
  await send("store", { container_id: manual, storage: "thawing" });
  await send("store", { container_id: manual, storage: "fridge" });
  await send("use", { container_ids: [manual] });
  expect(
    state.batches.find((b: any) => b.id === batch.id).containers[0].status,
  ).toBe("used");
  await send("restore", { container_id: manual });
  await db.exec("reset role");
  await db.query(
    `update app_private.cooking_ledger set batches=jsonb_set(batches, array[(jsonb_array_length(batches)-1)::text,'containers','0','expires_at'],to_jsonb(clock_timestamp()-interval '1 hour')) where household_id=$1`,
    [home.household_id],
  );
  await actor();
  state = await rpc("get_cooking_state");
  await expect(
    send("assign", { container_id: manual, target_id: r.id, grams: 1 }),
  ).rejects.toThrow("cooking_expired");
});
