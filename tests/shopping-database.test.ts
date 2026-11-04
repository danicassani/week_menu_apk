import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import {
  makePortion,
  type PlanningState,
  type MealPlan,
} from "../src/domain/planning";
import { addDays } from "../src/domain/dates";
import type { Profile } from "../src/domain/types";
import type { ShoppingState, ShoppingPreview } from "../src/domain/shopping";
let db: PGlite, day: string;
const a = "30000000-0000-0000-0000-000000000001",
  b = "30000000-0000-0000-0000-000000000002",
  outsider = "30000000-0000-0000-0000-000000000003";
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
async function rpc<T = any>(fn: string, args: unknown[] = []): Promise<T> {
  return (
    await db.query<{ r: T }>(
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
async function shopping() {
  return rpc<ShoppingState>("get_shopping_state");
}
async function preview(start = day, end = addDays(day, 7)) {
  return rpc<ShoppingPreview>("preview_shopping_list", [start, end]);
}
async function apply(p: ShoppingPreview) {
  return rpc("apply_shopping_list", [
    p.start_date,
    p.end_date,
    p.content_revision,
    p.source_fingerprint,
  ]);
}
async function checked(id: string, value: boolean, op = crypto.randomUUID()) {
  return rpc("set_shopping_checked", [op, id, value]);
}
async function saveMeal(date: string, quantity: number, eatingOut = false) {
  const lib = await rpc<PlanningState>("get_planning_library"),
    recipe = lib.recipes.find((r) => r.id === "b01")!;
  const portion = makePortion(
    recipe,
    a,
    profile,
    400,
    false,
    lib.ingredients,
    lib.substitutions,
  );
  portion.lines = portion.lines.map((l) => ({
    ...l,
    quantity: l.ingredient_id === "oats" ? quantity : l.quantity,
  }));
  portion.eating_out = eatingOut;
  if (eatingOut) {
    portion.description = "At the bar";
    portion.kcal = 500;
  }
  const meal: MealPlan = {
    day: date,
    type: "breakfast",
    shared_recipe_id: null,
    revision: 0,
    portions: [portion],
  };
  await rpc("apply_meal_plans", [[meal], lib.revision, true]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const [id, email] of [
    [a, "a@example.com"],
    [b, "b@example.com"],
    [outsider, "outside@example.com"],
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
  day = addDays(
    (await rpc("get_household_snapshot")).server_now.slice(0, 10),
    2,
  );
}, 60000);
afterAll(async () => db.close());
it("guards reads, direct writes and privileged helpers", async () => {
  await actor(outsider);
  expect((await db.query("select * from public.shopping_items")).rows).toEqual(
    [],
  );
  await expect(shopping()).rejects.toThrow("access_denied");
  await expect(
    db.exec("select * from app_private.shopping_receipts"),
  ).rejects.toThrow("permission denied");
  await actor(a);
  await expect(db.exec("delete from public.shopping_items")).rejects.toThrow(
    "permission denied",
  );
});
it("aggregates saved grams and requires a reviewed, current source", async () => {
  await saveMeal(day, 50);
  const p = await preview();
  expect(
    p.changes.find((c) => c.after?.ingredient_id === "oats")!.after!.quantity,
  ).toBe(50);
  await saveMeal(day, 60);
  await expect(apply(p)).rejects.toThrow("stale_shopping");
  await apply(await preview());
  expect(
    (await shopping()).items.find((i) => i.ingredient_id === "oats")!.quantity,
  ).toBe(60);
  expect(
    (await rpc("get_household_snapshot")).shopping.items.length,
  ).toBeGreaterThan(0);
});
it("increases uncheck and highlight; decreases and range changes preserve checked states and stable IDs", async () => {
  let s = await shopping();
  const oats = s.items.find((i) => i.ingredient_id === "oats")!;
  await checked(oats.id, true);
  await saveMeal(day, 80);
  expect((await shopping()).changes_available).toBe(true);
  await apply(await preview());
  s = await shopping();
  let row = s.items.find((i) => i.ingredient_id === "oats")!;
  expect(row.id).toBe(oats.id);
  expect(row.checked).toBe(false);
  expect(row.increased).toBe(true);
  await checked(row.id, true);
  await saveMeal(day, 40);
  await apply(await preview(day, addDays(day, 2)));
  row = (await shopping()).items.find((i) => i.ingredient_id === "oats")!;
  expect(row.checked).toBe(true);
  expect(row.quantity).toBe(40);
  expect(row.id).toBe(oats.id);
});
it("checkbox changes do not stale a content preview and apply reads the latest checked state", async () => {
  const p = await preview();
  const item = (await shopping()).items.find(
    (i) => i.ingredient_id === "oats",
  )!;
  await checked(item.id, false);
  await apply(p);
  expect((await shopping()).items.find((i) => i.id === item.id)!.checked).toBe(
    false,
  );
});
it("receipts prevent an old retry from replaying over a newer accepted change", async () => {
  const item = (await shopping()).items[0],
    operation = crypto.randomUUID();
  const ack = await checked(item.id, true, operation);
  await actor(b);
  await checked(item.id, false);
  await actor(a);
  expect(await checked(item.id, true, operation)).toEqual(ack);
  expect((await shopping()).items.find((i) => i.id === item.id)!.checked).toBe(
    false,
  );
  await expect(checked(item.id, false, operation)).rejects.toThrow(
    "operation_mismatch",
  );
});
it("late offline changes win by server acceptance order, including after an increase", async () => {
  const item = (await shopping()).items.find(
    (i) => i.ingredient_id === "oats",
  )!;
  await checked(item.id, true);
  await saveMeal(day, 90);
  await apply(await preview());
  expect((await shopping()).items.find((i) => i.id === item.id)!.checked).toBe(
    false,
  );
  await actor(b);
  await checked(item.id, true);
  expect((await shopping()).items.find((i) => i.id === item.id)!.checked).toBe(
    true,
  );
  await actor(a);
});
it("manual items survive menu removal, preserve checks, and retry creation without duplicates", async () => {
  const id = crypto.randomUUID();
  await rpc("save_manual_shopping_item", [id, "Dish soap", "2 bottles", 0]);
  await rpc("save_manual_shopping_item", [id, "Dish soap", "2 bottles", 0]);
  await checked(id, true);
  await saveMeal(day, 50, true);
  await apply(await preview());
  const s = await shopping();
  expect(s.items).toHaveLength(1);
  expect(s.items[0].id).toBe(id);
  expect(s.items[0].checked).toBe(true);
});
it("discarded operations never recreate deleted items or match recreated names", async () => {
  const id = (await shopping()).items[0].id;
  await rpc("delete_manual_shopping_item", [id, 1]);
  const newId = crypto.randomUUID();
  await rpc("save_manual_shopping_item", [newId, "Dish soap", "2 bottles", 0]);
  expect((await checked(id, true)).status).toBe("removed");
  expect((await shopping()).items[0].id).toBe(newId);
  expect((await shopping()).items[0].checked).toBe(false);
});
it("source identity separates raw/cooked states while old source versions remain available", async () => {
  await saveMeal(day, 50);
  await db.exec("reset role");
  await db.query(
    "update public.meal_date_locks set cutoff=now()-interval '1 hour' where day=$1",
    [day],
  );
  await actor(a);
  await rpc("get_household_snapshot");
  let lib = await rpc<PlanningState>("get_planning_library");
  const oats = lib.ingredients.find((i) => i.id === "oats")!;
  await rpc("save_household_content", [
    "ingredient",
    { ...oats, state: "cooked" },
    1,
    false,
  ]);
  await saveMeal(addDays(day, 1), 30);
  const p = await preview();
  const rows = p.changes
    .filter((c) => c.after?.ingredient_id === "oats")
    .map((c) => c.after!);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => r.reference_state))).toEqual(
    new Set(["dry", "cooked"]),
  );
  await apply(p);
});
it("removal revokes retries and all shopping access", async () => {
  await rpc("remove_member", [b]);
  await actor(b);
  await expect(checked(crypto.randomUUID(), true)).rejects.toThrow(
    "access_denied",
  );
  expect((await db.query("select * from public.shopping_items")).rows).toEqual(
    [],
  );
});
