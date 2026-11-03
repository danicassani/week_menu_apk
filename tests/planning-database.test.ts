import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  makePortion,
  type PlanningState,
  type MealPlan,
} from "../src/domain/planning";
import { addDays } from "../src/domain/dates";
import type { Profile } from "../src/domain/types";
const a = "20000000-0000-0000-0000-000000000001",
  b = "20000000-0000-0000-0000-000000000002";
let db: PGlite, day: string;
const profile: Profile = {
  name: "A",
  age: 32,
  sex: "male",
  height_cm: 178,
  weight_kg: 80,
  activity_level: "light",
  goal: "maintain",
  target_weight_kg: null,
  target_date: null,
  diet: "omnivore",
  excluded_ingredients: [],
  language: "en",
};
async function rpc(fn: string, args: unknown[] = []) {
  return (
    await db.query<{ r: any }>(
      `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`,
      args,
    )
  ).rows[0].r;
}
async function actor(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function library(): Promise<PlanningState> {
  return rpc("get_planning_library");
}
function meal(l: PlanningState, date: string): MealPlan {
  const r = { ...l.recipes.find((r) => r.id === "m01")!, archived: false };
  return {
    day: date,
    type: "lunch",
    revision: 0,
    shared_recipe_id: r.id,
    portions: [
      makePortion(r, a, profile, 650, false, l.ingredients, l.substitutions),
      makePortion(r, b, profile, 650, false, l.ingredients, l.substitutions),
    ],
  };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of [
    "202611030001_foundation.sql",
    "202611030002_activities.sql",
    "202611030003_planning.sql",
    "202611030004_starter_food.sql",
  ])
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
  await actor(a);
  await rpc("bootstrap_member", ["UTC"]);
  await rpc("invite_member", ["b@example.com"]);
  for (const id of [b, a]) {
    await actor(id);
    await rpc("bootstrap_member", ["UTC"]);
    await rpc("save_my_profile", [profile, 0]);
    const p = await rpc("get_my_target_proposal");
    await rpc("accept_my_target", [
      { breakfast: 400, lunch: 650, dinner: 650 },
      p.context_revision,
    ]);
  }
  day = (await rpc("get_household_snapshot")).server_now.slice(0, 10);
}, 60000);
afterAll(async () => db.close());
it("seeds reviewed content and denies direct writes or unapproved access", async () => {
  const l = await library();
  expect(l.ingredients).toHaveLength(97);
  expect(l.recipes).toHaveLength(48);
  expect(l.substitutions).toHaveLength(19);
  await expect(db.exec("delete from public.food_items")).rejects.toThrow(
    "permission denied",
  );
});
it("saves server-authoritative portions and enriches the household snapshot", async () => {
  const l = await library(),
    m = meal(l, addDays(day, 2));
  m.portions[0].kcal = 999999;
  m.portions[0].budget = 999999;
  await rpc("apply_meal_plans", [[m], l.revision, false]);
  const saved = (await library()).plans[0];
  expect(saved.portions[0].kcal).not.toBe(999999);
  expect(saved.portions[0].budget).toBe(650);
  const snapshot = await rpc("get_household_snapshot");
  expect(snapshot.meals).toHaveLength(2);
  expect(snapshot.planning.plans).toHaveLength(1);
  expect(snapshot.planning.revision).toBe((await library()).revision);
  await expect(
    rpc("apply_meal_plans", [[m], l.revision, true]),
  ).rejects.toThrow("stale_plan");
});
it("rejects variety conflicts across calendar weeks and protects existing meals", async () => {
  const l = await library(),
    m = meal(l, addDays(day, 3));
  await expect(
    rpc("apply_meal_plans", [[m], l.revision, false]),
  ).rejects.toThrow("variety_conflict");
  await expect(
    rpc("apply_meal_plans", [[meal(l, addDays(day, 2))], l.revision, false]),
  ).rejects.toThrow("existing_meal");
});
it("versions catalogue edits, preserves quantities, and freezes historical nutrition", async () => {
  let l = await library();
  const future = meal(l, addDays(day, 7));
  await rpc("apply_meal_plans", [[future], l.revision, false]);
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set cutoff=now()-interval '1 hour' where day=$1",
    [addDays(day, 2)],
  );
  await actor(a);
  l = await library();
  const before = l.plans.find((m) => m.day === addDays(day, 2))!.portions[0]
    .kcal;
  const open = l.plans.find((m) => m.day === addDays(day, 7))!.portions[0];
  const chick = l.ingredients.find((i) => i.id === "chickpeas")!;
  await rpc("save_household_content", [
    "ingredient",
    {
      ...chick,
      nutrition_per_100g: { ...chick.nutrition_per_100g, energy_kcal: 400 },
    },
    1,
    false,
  ]);
  l = await library();
  expect(l.plans.find((m) => m.day === addDays(day, 2))!.portions[0].kcal).toBe(
    before,
  );
  const after = l.plans.find((m) => m.day === addDays(day, 7))!.portions[0];
  expect(after.lines.map((x) => x.quantity)).toEqual(
    open.lines.map((x) => x.quantity),
  );
  expect(after.kcal).not.toBe(open.kcal);
  await expect(
    rpc("save_household_content", ["ingredient", chick, 1, false]),
  ).rejects.toThrow("stale_content");
  await expect(
    rpc("apply_meal_plans", [[meal(l, addDays(day, 2))], l.revision, true]),
  ).rejects.toThrow("day_closed");
});
it("replaces only a participant with eating out and requires a calorie estimate", async () => {
  let l = await library();
  const m = structuredClone(l.plans.find((m) => m.day === addDays(day, 7))!);
  m.portions[0] = {
    ...m.portions[0],
    eating_out: true,
    description: "At the bar",
    kcal: 550,
  };
  await rpc("apply_meal_plans", [[m], l.revision, true]);
  l = await library();
  const p = l.plans.find(
    (m) => m.day === m.day && m.day === addDays(day, 7),
  )!.portions;
  expect(p[0].lines).toEqual([]);
  expect(p[0].kcal).toBe(550);
  expect(p[1].lines.length).toBeGreaterThan(0);
  const bad = structuredClone(m);
  (bad.portions[0] as any).kcal = null;
  await expect(
    rpc("apply_meal_plans", [[bad], l.revision, true]),
  ).rejects.toThrow("invalid_entry");
});
it("archives preserve references and removal cleans only unlocked participants", async () => {
  let l = await library();
  const r = l.recipes.find((r) => r.id === "m01")!;
  await rpc("save_household_content", ["recipe", r, 1, true]);
  l = await library();
  expect(l.plans).toHaveLength(2);
  await expect(
    rpc("apply_meal_plans", [[meal(l, addDays(day, 12))], l.revision, false]),
  ).rejects.toThrow("archived_ingredient");
  await rpc("remove_member", [b]);
  l = await library();
  expect(l.plans.find((m) => m.day === addDays(day, 2))!.portions).toHaveLength(
    2,
  );
  expect(l.plans.find((m) => m.day === addDays(day, 7))!.portions).toHaveLength(
    1,
  );
  await actor(b);
  await expect(library()).rejects.toThrow("access_denied");
});
it("atomically replaces neighboring meals without comparing against superseded slots", async () => {
  await actor(a);
  let l = await library();
  const build = (offset: number, id: string): MealPlan => {
    const r = l.recipes.find((r) => r.id === id)!;
    return {
      day: addDays(day, offset),
      type: "dinner",
      revision: 0,
      shared_recipe_id: id,
      portions: [
        makePortion(r, a, profile, 650, false, l.ingredients, l.substitutions),
      ],
    };
  };
  await rpc("apply_meal_plans", [
    [build(20, "m02"), build(21, "m03")],
    l.revision,
    false,
  ]);
  l = await library();
  await rpc("apply_meal_plans", [
    [build(20, "m03"), build(21, "m02")],
    l.revision,
    true,
  ]);
  l = await library();
  expect(
    l.plans.find((m) => m.day === addDays(day, 20))!.shared_recipe_id,
  ).toBe("m03");
  const m = l.plans.find((m) => m.day === addDays(day, 21))!,
    snapshot = structuredClone(m.portions[0].recipe_snapshot);
  const r = l.recipes.find((r) => r.id === "m02")!;
  await rpc("save_household_content", [
    "recipe",
    {
      ...r,
      components: r.components.map((c, i) =>
        i === 0 ? { ...c, ingredients: c.ingredients.slice(1) } : c,
      ),
    },
    r.revision,
    false,
  ]);
  l = await library();
  expect(
    l.plans.find((m) => m.day === addDays(day, 21))!.portions[0]
      .recipe_snapshot,
  ).toEqual(snapshot);
  await rpc("apply_meal_plans", [[m], l.revision, true]);
  expect(
    (await library()).plans.find((m) => m.day === addDays(day, 21))!.portions[0]
      .recipe_snapshot,
  ).toEqual(snapshot);
});
it("allows independent breakfasts, personal dessert and per-member recipe prompt preferences", async () => {
  await actor(a);
  let l = await library();
  const base = (id: string, person: string, dessert = false) =>
    makePortion(
      l.recipes.find((r) => r.id === id)!,
      person,
      profile,
      650,
      dessert,
      l.ingredients,
      l.substitutions,
    );
  const breakfast: MealPlan = {
    day: addDays(day, 25),
    type: "breakfast",
    revision: 0,
    shared_recipe_id: null,
    portions: [base("b01", a)],
  };
  await rpc("apply_meal_plans", [[breakfast], l.revision, false]);
  l = await library();
  const dinner: MealPlan = {
    day: addDays(day, 26),
    type: "dinner",
    revision: 0,
    shared_recipe_id: "m03",
    portions: [base("m03", a, true)],
  };
  await rpc("apply_meal_plans", [[dinner], l.revision, false]);
  l = await library();
  expect(
    l.plans
      .find((m) => m.day === dinner.day)!
      .portions[0].lines.some((x) => x.component_id === "dessert"),
  ).toBe(true);
  await rpc("save_recipe_prompt_preference", [null]);
  expect((await library()).prompt_show_after).toBe("never");
  await rpc("save_recipe_prompt_preference", [new Date().toISOString()]);
  expect((await library()).prompt_show_after).not.toBe("never");
  l = await library();
  await rpc("delete_planned_meal", [breakfast.day, "breakfast", l.revision]);
  expect((await library()).plans.some((m) => m.day === breakfast.day)).toBe(
    false,
  );
});
