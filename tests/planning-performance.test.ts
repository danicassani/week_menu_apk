import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { addDays } from "../src/domain/dates";
import {
  makePortion,
  type PlanningState,
  type MealPlan,
} from "../src/domain/planning";
import type { Profile } from "../src/domain/types";

it("saves a two-member mixed week with one shopping computation and preserves list semantics", async () => {
  const db = new PGlite();
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
    diet: "vegetarian",
    language: "en",
    excluded_ingredients: [],
  };
  const actor = async (id = a) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const call = async (fn: string, args: unknown[] = []) =>
    (
      await db.query<{ r: any }>(
        `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`,
        args,
      )
    ).rows[0].r;
  try {
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
      { breakfast: 750, lunch: 600, dinner: 615 },
      (await call("get_my_target_proposal")).context_revision,
    ]);
    await db.exec("reset role");
    for (const f of files.filter(
      (f) => f >= "202611040006" && f < "202611080024",
    ))
      await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
    await actor();
    const home = (await call("get_household_access")).active;
    const rpc = (fn: string, args: unknown[] = []) =>
      call(fn, [home.household_id, home.membership_id, ...args]);
    await rpc("invite_member", ["b@example.com"]);
    await actor(b);
    await call("join_household", [
      (await call("get_household_access")).invitations[0].id,
      "UTC",
    ]);
    const second = (await call("get_household_access")).active;
    const otherProfile: Profile = {
      ...profile,
      name: "Blair",
      diet: "omnivore",
    };
    await call("save_my_profile", [
      second.household_id,
      second.membership_id,
      otherProfile,
      0,
    ]);
    await call("accept_my_target", [
      second.household_id,
      second.membership_id,
      { breakfast: 450, lunch: 450, dinner: 450 },
      (
        await call("get_my_target_proposal", [
          second.household_id,
          second.membership_id,
        ])
      ).context_revision,
    ]);
    await actor();
    const lib: PlanningState = await rpc("get_planning_library");
    const breakfast = [
      ["global_tomato_mozzarella_toast", "b04"],
      ["b09", "b12"],
      ["b10", "global_banana_bread"],
      ["b11", "global_carrot_muffins"],
      ["b12", "global_scrambled_toast"],
      ["global_banana_bread", "global_spinach_omelette"],
      ["global_carrot_muffins", "global_tomato_mozzarella_toast"],
    ];
    const mains = [
      "m26",
      "m29",
      "m18",
      "m19",
      "m18",
      "m20",
      "m19",
      "m21",
      "m20",
      "m23",
      "m21",
      "m24",
      "m23",
      "m25",
    ];
    const start = addDays(new Date().toISOString().slice(0, 10), 2),
      batch: MealPlan[] = [];
    for (let offset = 0; offset < 7; offset++)
      for (const type of ["breakfast", "lunch", "dinner"] as const) {
        const shared =
          type === "breakfast"
            ? null
            : mains[offset * 2 + (type === "dinner" ? 1 : 0)];
        const ids = shared ? [shared, shared] : breakfast[offset];
        batch.push({
          day: addDays(start, offset),
          type,
          revision: 0,
          shared_recipe_id: shared,
          portions: ids.map((rid, index) =>
            makePortion(
              lib.recipes.find((r) => r.id === rid)!,
              index === 0 ? home.membership_id : second.membership_id,
              index === 0 ? profile : otherProfile,
              index === 0
                ? { breakfast: 750, lunch: 600, dinner: 615 }[type]
                : 450,
              false,
              lib.ingredients,
              lib.substitutions,
            ),
          ),
        });
      }
    const begin = performance.now();
    await rpc("apply_meal_plans", [batch, lib.revision, false]);
    const elapsed = performance.now() - begin;
    const shoppingBegin = performance.now();
    const shopping = await rpc("get_shopping_state");
    const shoppingMs = performance.now() - shoppingBegin;
    const nextBatch = batch.map((m) => ({ ...m, day: addDays(m.day, 7) }));
    const nextRevision = (await rpc("get_planning_library")).revision;
    const secondBegin = performance.now();
    await rpc("apply_meal_plans", [nextBatch, nextRevision, false]);
    const secondElapsed = performance.now() - secondBegin;
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        "supabase/migrations/202611080024_planning_shopping_performance.sql",
        "utf8",
      ),
    );
    await actor();
    const afterLib = await rpc("get_planning_library");
    await db.exec("reset role");
    // Instrument only the test database; assert bounded work, not flaky timing.
    const body = (
      await db.query<{ prosrc: string }>(
        "select prosrc from pg_proc where oid='app_private.upcoming_contributions()'::regprocedure",
      )
    ).rows[0].prosrc;
    await db.exec(
      "create table app_private.projection_probe(calls integer);insert into app_private.projection_probe values(0);grant select,update on app_private.projection_probe to week_menu_executor",
    );
    await db.exec(
      `create or replace function app_private.upcoming_contributions() returns table(day date,cutoff timestamptz,key text,ingredient_id text,name jsonb,quantity numeric,unit text,reference_state text,quantity_basis text) language plpgsql security definer set search_path='' as $probe$ #variable_conflict use_column
begin update app_private.projection_probe set calls=calls+1;return query ${body};end $probe$`,
    );
    await actor();
    const afterBegin = performance.now();
    await rpc("apply_meal_plans", [nextBatch, afterLib.revision, true]);
    const afterElapsed = performance.now() - afterBegin;
    await db.exec("reset role");
    expect(
      (
        await db.query<{ calls: number }>(
          "select calls from app_private.projection_probe",
        )
      ).rows[0].calls,
    ).toBe(1);
    // The new helpers cannot be called by an authenticated user with forged data.
    await actor();
    await expect(
      db.query("select app_private.reconcile_shopping_projection('{}',0)"),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("select app_private.shopping_projection()"),
    ).rejects.toThrow("permission denied");
    const afterShopping = await rpc("get_shopping_state");
    const eggs = afterShopping.items.find(
      (i: any) => i.ingredient_id === "egg",
    );
    await rpc("set_shopping_checked", [crypto.randomUUID(), eggs.id, true]);
    await rpc("save_manual_shopping_item", [
      crypto.randomUUID(),
      "Coffee",
      "1 bag",
      0,
    ]);
    const beforeReplacement = await rpc("get_shopping_state");
    const current = await rpc("get_planning_library");
    await rpc("apply_meal_plans", [nextBatch, current.revision, true]);
    const afterReplacement = await rpc("get_shopping_state");
    expect(
      afterReplacement.items.find((i: any) => i.id === eggs.id).checked,
    ).toBe(true);
    expect(
      afterReplacement.items.find((i: any) => i.source === "manual").name.en,
    ).toBe("Coffee");
    expect(
      afterReplacement.items
        .filter((i: any) => i.source === "generated")
        .map((i: any) => [i.key, i.quantity]),
    ).toEqual(
      beforeReplacement.items
        .filter((i: any) => i.source === "generated")
        .map((i: any) => [i.key, i.quantity]),
    );
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/planning-performance.json",
      JSON.stringify({
        elapsed,
        secondElapsed,
        afterElapsed,
        shoppingMs,
        itemCount: shopping.items.length,
      }),
    );
    expect(shopping.items.length).toBeGreaterThan(10);
    expect(
      batch.flatMap((m) => m.portions).some((p) => p.substitutions.length > 0),
    ).toBe(true);
  } finally {
    await db.close();
  }
}, 60000);
