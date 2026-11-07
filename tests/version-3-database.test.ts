import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { addDays, dayCutoff } from "../src/domain/dates";
import { makePortion, type PlanningState } from "../src/domain/planning";
import type { HouseholdState, Profile } from "../src/domain/types";
import type { ShoppingState } from "../src/domain/shopping";
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
afterAll(async () => db?.close());
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
