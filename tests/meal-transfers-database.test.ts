import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { addDays } from "../src/domain/dates";
import { makePortion, type PlanningState } from "../src/domain/planning";
import type { HouseholdState, Profile } from "../src/domain/types";
import type {
  TransferRequest,
  TransferPreview,
  MealEndpoint,
} from "../src/domain/planning-transfer";
let db: PGlite, day: string, home: any, member: string;
const a = "91000000-0000-0000-0000-000000000001",
  b = "91000000-0000-0000-0000-000000000002",
  c = "91000000-0000-0000-0000-000000000003";
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
const veg: Profile = { ...profile, name: "Noa", diet: "vegetarian" };
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
const library = () => rpc<PlanningState>("get_planning_library");
const endpoint = (
  offset = 0,
  who = a,
  type: MealEndpoint["type"] = "breakfast",
): MealEndpoint => ({
  day: addDays(day, offset),
  type,
  ...(type === "breakfast" ? { member_id: who } : {}),
});
const paste = (
  id: string,
  target = endpoint(),
): Extract<TransferRequest, { mode: "paste" }> => ({
  mode: "paste",
  target,
  choice: { recipe_id: id, revision: 1, desserts: {} },
});
const preview = (req: TransferRequest) =>
  rpc<TransferPreview>("preview_meal_transfer", [req]);
const apply = (req: TransferRequest, p: TransferPreview, overwrite = false) =>
  rpc("apply_meal_transfer", [req, p.revision, p.fingerprint, overwrite]);
async function commit(req: TransferRequest) {
  const p = await preview(req);
  await apply(req, p, true);
  return p;
}
const portion = (lib: PlanningState, ep: MealEndpoint) =>
  lib.plans
    .find((p) => p.day === ep.day && p.type === ep.type)
    ?.portions.find((p) => p.member_id === (ep.member_id ?? a));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  const files = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files.filter((f) => f < "202611040006"))
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const [id, email] of [
    [a, "a@example.com"],
    [b, "b@example.com"],
    [c, "c@example.com"],
  ])
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}','{}')`,
      [id, email],
    );
  await db.exec("select app_private.configure_owner('a@example.com')");
  await actor();
  await call("bootstrap_member", ["UTC"]);
  await call("save_my_profile", [profile, 0]);
  await call("accept_my_target", [
    { breakfast: 400, lunch: 650, dinner: 650 },
    (await call("get_my_target_proposal")).context_revision,
  ]);
  await db.exec("reset role");
  for (const f of files.filter((f) => f >= "202611040006")) {
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
    if (f.startsWith("202611040006"))
      await db.exec("revoke usage on schema auth from week_menu_executor");
  }
  await actor();
  home = (await call("get_household_access")).active;
  day = addDays(
    (await rpc<HouseholdState>("get_household_snapshot")).server_now.slice(
      0,
      10,
    ),
    3,
  );
  await rpc("invite_member", ["c@example.com"]);
  await actor(c);
  await call("join_household", [
    (await call("get_household_access")).invitations[0].id,
    "UTC",
  ]);
  const ctx = (await call("get_household_access")).active;
  member = ctx.membership_id;
  const args = [ctx.household_id, ctx.membership_id];
  await call("save_my_profile", [...args, veg, 0]);
  await call("accept_my_target", [
    ...args,
    { breakfast: 275, lunch: 500, dinner: 500 },
    (await call("get_my_target_proposal", args)).context_revision,
  ]);
  await actor(b);
  await call("create_household", ["Other home", "UTC"]);
  await actor();
}, 60000);
afterAll(async () => db?.close());
it("builds destination portions from trusted recipes, budgets, units and nutrition; requires explicit overwrite", async () => {
  const target = endpoint(),
    req = paste("b01", target),
    p = await preview(req),
    lib = await library();
  const expected = makePortion(
    lib.recipes.find((r) => r.id === "b01")!,
    a,
    profile,
    400,
    false,
    lib.ingredients,
    lib.substitutions,
  );
  expect(p.occupied).toBe(false);
  expect(p.plans[0].portions[0].lines).toEqual(expected.lines);
  expect(p.plans[0].portions[0].kcal).toBe(expected.kcal);
  expect(lib.plans).toHaveLength(0);
  await apply(req, p);
  const occupied = await preview(req);
  expect(occupied.occupied).toBe(true);
  await expect(apply(req, occupied)).rejects.toThrow("existing_meal");
  expect((await library()).plans).toHaveLength(1);
  await apply(req, occupied, true);
  await expect(apply(req, occupied, true)).rejects.toThrow("stale_plan");
  const tamper = await preview(paste("b02", endpoint(1)));
  tamper.fingerprint = "forged";
  await expect(apply(paste("b02", endpoint(1)), tamper, true)).rejects.toThrow(
    "stale_plan",
  );
  expect(portion(await library(), endpoint(1))).toBeUndefined();
});
it("atomically swaps same-day cross-person breakfasts, recalculates budgets and leaves other days byte-for-byte intact", async () => {
  await commit(paste("b02", endpoint(0, member)));
  await commit(paste("b03", endpoint(1)));
  await commit(paste("b04", endpoint(1, member)));
  const before = await library();
  const req: TransferRequest = {
    mode: "swap",
    source: endpoint(),
    target: endpoint(0, member),
  };
  const p = await preview(req);
  expect(p.plans).toHaveLength(1);
  expect(p.plans[0].portions.find((x) => x.member_id === a)).toMatchObject({
    recipe_id: "b02",
    budget: 400,
  });
  expect(p.plans[0].portions.find((x) => x.member_id === member)).toMatchObject(
    { recipe_id: "b01", budget: 275 },
  );
  await apply(req, p);
  const after = await library();
  expect(portion(after, endpoint(1))).toEqual(portion(before, endpoint(1)));
  expect(portion(after, endpoint(1, member))).toEqual(
    portion(before, endpoint(1, member)),
  );
  const move: TransferRequest = {
    mode: "swap",
    source: endpoint(),
    target: endpoint(2, member),
  };
  const moved = await preview(move);
  await apply(move, moved);
  const final = await library();
  expect(portion(final, endpoint())).toBeUndefined();
  expect(portion(final, endpoint(0, member))).toEqual(
    portion(after, endpoint(0, member)),
  );
  expect(portion(final, endpoint(2, member))).toMatchObject({
    recipe_id: "b02",
    budget: 275,
  });
});
it("replans shared meals with reviewed vegetarian substitutions and synchronizes shopping automatically", async () => {
  const lib = await library();
  const recipe = lib.recipes.find((r) => r.id === "m18")!;
  expect(recipe).toBeTruthy();
  const req = paste(recipe.id, endpoint(10, a, "lunch")),
    p = await preview(req);
  const personal = p.plans[0].portions.find((x) => x.member_id === member)!;
  expect(personal.substitutions.length).toBeGreaterThan(0);
  expect(personal.budget).toBe(500);
  const expected = makePortion(
    recipe,
    member,
    veg,
    500,
    false,
    lib.ingredients,
    lib.substitutions,
  );
  expect(personal.lines).toEqual(expected.lines);
  await apply(req, p);
  await rpc("set_shopping_date_range", [addDays(day, 10), addDays(day, 15)]);
  const list = await rpc<any>("get_shopping_state");
  expect(
    list.items.some(
      (x: any) => x.ingredient_id === personal.lines[0].ingredient_id,
    ),
  ).toBe(true);
  const next = paste(recipe.id, endpoint(11, a, "dinner"));
  const before = (await library()).plans;
  await expect(preview(next)).rejects.toThrow("variety_conflict");
  expect((await library()).plans).toEqual(before);
  // Move into an empty target must remove the original contribution, without deleting other slots.
  await commit({
    mode: "swap",
    source: endpoint(10, a, "lunch"),
    target: endpoint(15, a, "dinner"),
  });
  expect(
    (await library()).plans.some(
      (x) => x.day === addDays(day, 10) && x.type === "lunch",
    ),
  ).toBe(false);
});
it("revalidates changed budgets and rejects incompatible, archived, missing or closed endpoints without partial writes", async () => {
  const req = paste("b01", endpoint(20)),
    old = await preview(req);
  await rpc("save_my_budget_override", [addDays(day, 20), "breakfast", 325]);
  await expect(apply(req, old)).rejects.toThrow("stale_plan");
  const fresh = await preview(req);
  expect(fresh.plans[0].portions[0].budget).toBe(325);
  await expect(
    preview({
      ...req,
      choice: { ...req.choice, revision: 999 },
    } as TransferRequest),
  ).rejects.toThrow("stale_content");
  await expect(
    preview(paste("b01", endpoint(21, a, "lunch"))),
  ).rejects.toThrow();
  await expect(preview(paste("missing", endpoint(21)))).rejects.toThrow();
  await expect(
    preview(paste("b01", { ...endpoint(), day: "2000-01-01" })),
  ).rejects.toThrow("day_closed");
  await expect(preview(paste("b01", endpoint(21, b)))).rejects.toThrow(
    "invalid_member",
  );
  const lib = await library();
  const r = lib.recipes.find((r) => r.id === "b05")!;
  await rpc("save_household_content", ["recipe", r, r.revision, true]);
  await expect(preview(paste("b05", endpoint(21)))).rejects.toThrow();
  expect(portion(await library(), endpoint(20))).toBeUndefined();
});
it("tenant context, private helpers and anonymous entry points remain protected", async () => {
  await actor(b);
  await expect(preview(paste("b01"))).rejects.toThrow("membership_changed");
  await actor();
  for (const fn of [
    "transfer_guard('{}')",
    "transfer_portion('b01','" + a + "',current_date,'breakfast',false)",
    "transfer_patch('[]','{}','{}')",
  ])
    await expect(db.exec("select app_private." + fn)).rejects.toThrow(
      "permission denied",
    );
  await db.exec("set role anon");
  await expect(preview(paste("b01"))).rejects.toThrow("permission denied");
  await actor();
});
it("matches domain rounding for kg, volume, defined pieces and optional dessert", async () => {
  let lib = await library();
  const egg = structuredClone(lib.ingredients.find((i) => i.id === "egg")!);
  egg.conversions.push({
    unit: "egg",
    grams_per_unit: 50,
    quantity_step: 0.25,
  });
  await rpc("save_household_content", ["ingredient", egg, egg.revision, false]);
  const recipe = {
    ...structuredClone(lib.recipes.find((r) => r.id === "b01")!),
    id: crypto.randomUUID(),
    revision: 0,
  };
  recipe.components = [
    {
      id: "main",
      kind: "main",
      name: { en: "Main", es: "Principal" },
      optional: false,
      default_included: true,
      instructions: [],
      ingredients: [
        {
          ingredient_id: "egg",
          quantity: 2,
          unit: "egg",
          variety_role: "main",
        },
        {
          ingredient_id: "oats",
          quantity: 0.05,
          unit: "kg",
          variety_role: "base",
        },
        {
          ingredient_id: "milk",
          quantity: 3,
          unit: "metric_tbsp",
          variety_role: "support",
        },
        {
          ingredient_id: "milk",
          quantity: 40,
          unit: "ml",
          variety_role: "support",
        },
      ],
    },
    {
      id: "dessert",
      kind: "dessert",
      name: { en: "Dessert", es: "Postre" },
      optional: true,
      default_included: true,
      instructions: [],
      ingredients: [
        {
          ingredient_id: "apple",
          quantity: 100,
          unit: "g",
          variety_role: "support",
        },
      ],
    },
  ];
  await rpc("save_household_content", ["recipe", recipe, 0, false]);
  lib = await library();
  const current = lib.recipes.find((r) => r.id === recipe.id)!;
  for (const dessert of [false, true]) {
    const req = paste(recipe.id, endpoint(40));
    req.choice.desserts = { [a]: dessert };
    const p = await preview(req);
    const expected = makePortion(
      current,
      a,
      profile,
      400,
      dessert,
      lib.ingredients,
      lib.substitutions,
    );
    expect(p.plans[0].portions[0].lines).toEqual(expected.lines);
    expect(p.plans[0].portions[0].kcal).toBeCloseTo(expected.kcal, 9);
    expect(p.plans[0].portions[0].dessert).toBe(dessert);
  }
});
it("week approval removes an explicitly emptied draft source in the same transaction as its destination", async () => {
  await commit(paste("b01", endpoint(50)));
  const lib = await library();
  const old = lib.plans.find(
    (p) => p.day === endpoint(50).day && p.type === "breakfast",
  )!;
  const draft = await preview(paste("b01", endpoint(51)));
  const cleared = { ...old, portions: [] };
  await rpc("apply_meal_plans", [
    [cleared, ...draft.plans],
    lib.revision,
    true,
  ]);
  const after = await library();
  expect(portion(after, endpoint(50))).toBeUndefined();
  expect(after.plans.some((p) => p.day === endpoint(50).day)).toBe(false);
  expect(portion(after, endpoint(51))?.recipe_id).toBe("b01");
});
it("restores recoverable restaurant choices, requires overwrite for eating out and rejects bare estimates", async () => {
  await commit(paste("b01", endpoint(60)));
  let lib = await library();
  const plan = structuredClone(
    lib.plans.find(
      (p) => p.day === endpoint(60).day && p.type === "breakfast",
    )!,
  );
  plan.portions[0] = {
    ...plan.portions[0],
    recipe_id: null,
    eating_out: true,
    description: "Bar breakfast",
    kcal: 500,
    lines: [],
  };
  await rpc("apply_meal_plans", [[plan], lib.revision, true]);
  const move: TransferRequest = {
    mode: "swap",
    source: endpoint(60),
    target: endpoint(61),
  };
  const reviewed = await preview(move);
  expect(
    reviewed.plans.find((p) => p.day === endpoint(61).day)?.portions[0],
  ).toMatchObject({ recipe_id: "b01", eating_out: false });
  const replacement = paste("b02", endpoint(60)),
    p = await preview(replacement);
  expect(p.occupied).toBe(true);
  await expect(apply(replacement, p)).rejects.toThrow("existing_meal");
  await apply(replacement, p, true);
  lib = await library();
  plan.day = endpoint(62).day;
  await rpc("apply_meal_plans", [[plan], lib.revision, false]);
  await expect(
    preview({ mode: "swap", source: endpoint(62), target: endpoint(63) }),
  ).rejects.toThrow("no_suitable_recipe");
});
