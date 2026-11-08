import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Profile } from "../src/domain/types";
import { addDays } from "../src/domain/dates";
import { makePortion, type PlanningState } from "../src/domain/planning";

it.each(["LF", "CRLF, tabs and trailing whitespace"])(
  "repairs %s pre-21 functions after 22 without weakening validation or losing rounding",
  async (format) => {
    const db = new PGlite();
    const id = "90000000-0000-0000-0000-000000000001";
    const sql = (prefix: string) =>
      readFileSync(
        "supabase/migrations/" +
          readdirSync("supabase/migrations").find((f) => f.startsWith(prefix))!,
        "utf8",
      );
    const call = async (fn: string, args: unknown[] = []) =>
      (
        await db.query<{ r: any }>(
          `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`,
          args,
        )
      ).rows[0].r;
    const actor = async () => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
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
    try {
      await db.exec(
        `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
      );
      const migrations = readdirSync("supabase/migrations")
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const f of migrations.filter((f) => f < "202611040006"))
        await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
      await db.query(
        `insert into auth.users values($1,'a@example.com',now(),'{"provider":"google"}','{}')`,
        [id],
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
      for (const f of migrations.filter(
        (f) => f >= "202611040006" && f < "202611080021",
      ))
        await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
      const signatures = [
        "api_apply_plans(jsonb,bigint,boolean)",
        "api_transfer_preview(uuid,uuid,jsonb)",
        "validate_food(jsonb)",
        "validate_recipe(jsonb)",
        "checked_portion_v2(jsonb,boolean)",
        "historical_portion(jsonb,jsonb,date,text)",
        "transfer_portion(text,uuid,date,text,boolean)",
        "api_planner_settings(integer,integer)",
      ];
      const metadata = async () =>
        (
          await db.query(
            `select p.oid::regprocedure::text as signature,p.proowner,p.proacl,p.proconfig from pg_proc p where p.oid=any($1::regprocedure[]) order by p.oid`,
            [signatures.map((s) => "app_private." + s)],
          )
        ).rows;
      const permissions = await metadata();
      for (const signature of signatures) {
        const def = (
          await db.query<{ definition: string }>(
            "select pg_get_functiondef($1::regprocedure) definition",
            ["app_private." + signature],
          )
        ).rows[0].definition;
        await db.exec(
          def
            .split("\n")
            .map(
              (line, i) =>
                " ".repeat(55 + i * 2) +
                line.replace(
                  "select value->>",
                  format === "LF" ? "select value->>" : "select \t value->>",
                ) +
                (format === "LF" ? "" : " \t"),
            )
            .join(format === "LF" ? "\n" : "\r\n"),
        );
      }
      await db.exec(sql("202611080022"));
      await expect(db.exec(sql("202611080021"))).rejects.toThrow(
        "remove_variety_definition_mismatch: api_apply_plans",
      );
      await db.exec("rollback");
      await actor();
      const home = (await call("get_household_access")).active;
      const rpc = (fn: string, args: unknown[] = []) =>
        call(fn, [home.household_id, home.membership_id, ...args]);
      let lib: PlanningState = await rpc("get_planning_library");
      const day = addDays(new Date().toISOString().slice(0, 10), 10);
      const recipe = lib.recipes.find((r) => r.id === "global_banana_bread")!;
      const portion = makePortion(
        recipe,
        home.membership_id,
        profile,
        400,
        false,
        lib.ingredients,
        [],
      );
      const batch = [
        {
          day,
          type: "breakfast",
          revision: 0,
          shared_recipe_id: null,
          portions: [portion],
        },
      ];
      await expect(
        rpc("apply_meal_plans", [batch, lib.revision, false]),
      ).rejects.toThrow("invalid_recipe");
      const before = await rpc("get_household_snapshot");
      await db.exec("reset role");
      const definitions = async () =>
        (
          await db.query<{ definition: string }>(
            "select pg_get_functiondef(x::regprocedure) definition from unnest($1::text[]) x",
            [signatures.map((s) => "app_private." + s)],
          )
        ).rows.map((r) => r.definition);
      const originalDefinitions = await definitions();
      // Spaces inside a quoted identifier value are not harmless SQL formatting.
      // Reject unknown code after earlier patches and roll the whole repair back.
      await db.exec(
        originalDefinitions[4].replace("'variety_role'", "'variety_ role'"),
      );
      const tamperedDefinitions = await definitions();
      await expect(db.exec(sql("202611080023"))).rejects.toThrow(
        "(patch 6, matches 0)",
      );
      await db.exec("rollback");
      expect(await definitions()).toEqual(tamperedDefinitions);
      await db.exec(originalDefinitions[4]);
      await db.exec(sql("202611080023"));
      expect(await metadata()).toEqual(permissions);
      await actor();
      expect(await rpc("get_household_snapshot")).toMatchObject({
        meals: before.meals,
        days: before.days,
        entries: before.entries,
        targets: before.targets,
      });
      await rpc("apply_meal_plans", [batch, lib.revision, false]);
      lib = await rpc("get_planning_library");
      expect(
        lib.plans.some(
          (p) => p.day === day && p.portions[0].recipe_id === recipe.id,
        ),
      ).toBe(true);
      // The server's copy/paste path must retain migration 22's tiny-spice rounding.
      for (const [index, r] of lib.recipes
        .filter((r) => r.id.startsWith("global_"))
        .entries()) {
        const type = r.meal_types[0];
        const review = await rpc("preview_meal_transfer", [
          {
            mode: "paste",
            target: {
              day: addDays(day, index + 1),
              type,
              ...(type === "breakfast"
                ? { member_id: home.membership_id }
                : {}),
            },
            choice: { recipe_id: r.id, revision: r.revision, desserts: {} },
          },
        ]);
        const actual = review.plans[0].portions[0];
        expect(actual.lines).toEqual(
          makePortion(
            r,
            home.membership_id,
            profile,
            actual.budget,
            false,
            lib.ingredients,
            [],
          ).lines,
        );
      }
      // Ingredient membership and positive quantities still apply after removing variety.
      const invalid = structuredClone(batch);
      invalid[0].day = addDays(day, 50);
      invalid[0].portions[0].lines[0].quantity = 0;
      await expect(
        rpc("apply_meal_plans", [invalid, lib.revision, false]),
      ).rejects.toThrow("invalid_quantity");
      invalid[0].portions[0].lines[0].quantity = 10;
      invalid[0].portions[0].lines[0].component_id = "missing-component";
      await expect(
        rpc("apply_meal_plans", [invalid, lib.revision, false]),
      ).rejects.toThrow("invalid_recipe");
      await db.exec("reset role");
      await db.exec(sql("202611080023"));
      expect(await metadata()).toEqual(permissions);
    } finally {
      await db.close();
    }
  },
  60000,
);
