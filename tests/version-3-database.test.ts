import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { addDays, dayCutoff } from "../src/domain/dates";
import { makePortion, type PlanningState } from "../src/domain/planning";
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
  expect((await shopping()).items.every((i) => i.source === "manual")).toBe(
    true,
  );
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
