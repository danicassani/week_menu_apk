import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import Decimal from "decimal.js";
import {
  makePortion,
  type PlanningState,
  type MealPlan,
} from "../src/domain/planning";
import { addDays } from "../src/domain/dates";
import { daySummary } from "../src/domain/calories";
import type { HouseholdState, Profile } from "../src/domain/types";
import type { ShoppingPreview, ShoppingState } from "../src/domain/shopping";
const a = "40000000-0000-0000-0000-000000000001",
  b = "40000000-0000-0000-0000-000000000002";
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
describe.each([false, true])(
  "release workflow after v2 migration = %s",
  (v2) => {
    let db: PGlite, day: string;
    let migrated = false;
    async function actor(id: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    async function rpc<T = any>(
      name: string,
      args: unknown[] = [],
    ): Promise<T> {
      if (migrated && name !== "bootstrap_member") {
        const access = (
          await db.query<{ r: any }>("select public.get_household_access() r")
        ).rows[0].r;
        args = [
          access.active.household_id,
          access.active.membership_id,
          ...args,
        ];
      }
      return (
        await db.query<{ r: T }>(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`,
          args,
        )
      ).rows[0].r;
    }
    const library = () => rpc<PlanningState>("get_planning_library");
    const snapshot = () => rpc<HouseholdState>("get_household_snapshot");
    async function apply(p: ShoppingPreview) {
      await rpc("apply_shopping_list", [
        p.start_date,
        p.end_date,
        p.content_revision,
        p.source_fingerprint,
      ]);
    }
    beforeAll(async () => {
      db = new PGlite();
      await db.exec(
        `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
      );
      for (const f of readdirSync("supabase/migrations")
        .filter((f) => f.endsWith(".sql") && f < "202611040006")
        .sort())
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
        await rpc("save_my_profile", [
          {
            ...profile,
            ...(id === b
              ? {
                  name: "Noa",
                  sex: "female",
                  diet: "vegetarian",
                  language: "es",
                }
              : {}),
          },
          0,
        ]);
        const proposal = await rpc("get_my_target_proposal");
        expect(proposal.daily_kcal).toBe(id === a ? 2416.5625 : 2188.3125);
        await rpc("accept_my_target", [
          { breakfast: 400, lunch: 650, dinner: 650 },
          proposal.context_revision,
        ]);
      }
      day = addDays((await snapshot()).server_now.slice(0, 10), 2);
      if (v2) {
        await db.exec("reset role");
        await db.exec(
          readFileSync(
            "supabase/migrations/202611040006_households.sql",
            "utf8",
          ),
        );
        await db.exec("revoke usage on schema auth from week_menu_executor");
        await db.exec(
          readFileSync(
            "supabase/migrations/202611050007_auth_namespace_independence.sql",
            "utf8",
          ),
        );
        migrated = true;
        await actor(a);
      }
    }, 60000);
    afterAll(async () => db.close());
    it("integrates personal breakfasts, shared substitutions/dessert, authoritative arithmetic, eating out and reviewed shopping", async () => {
      let lib = await library();
      const members = (await snapshot()).members;
      const portion = (recipe: string, id: string, dessert = false) =>
        makePortion(
          lib.recipes.find((r) => r.id === recipe)!,
          id,
          members.find((m) => m.id === id)!.profile!,
          recipe.startsWith("b") ? 400 : 650,
          dessert,
          lib.ingredients,
          lib.substitutions,
        );
      const batch: MealPlan[] = [
        {
          day,
          type: "breakfast",
          revision: 0,
          shared_recipe_id: null,
          portions: [portion("b01", a), portion("b02", b)],
        },
        {
          day,
          type: "lunch",
          revision: 0,
          shared_recipe_id: "m01",
          portions: [portion("m01", a, true), portion("m01", b, false)],
        },
        {
          day,
          type: "dinner",
          revision: 0,
          shared_recipe_id: "m27",
          portions: [portion("m27", a), portion("m27", b)],
        },
      ];
      for (const meal of batch)
        for (const p of meal.portions) {
          p.kcal = 999999;
          for (const line of p.lines) {
            line.grams = 999999;
            line.kcal = 999999;
            line.grams_per_unit = 999999;
            line.energy_per_100g = 999999;
          }
        }
      await rpc("apply_meal_plans", [batch, lib.revision, false]);
      lib = await library();
      const lunch = lib.plans.find((m) => m.type === "lunch")!,
        dinner = lib.plans.find((m) => m.type === "dinner")!;
      expect(
        lunch.portions[0].lines.some((l) => l.component_id === "dessert"),
      ).toBe(true);
      expect(
        lunch.portions[1].lines.some((l) => l.component_id === "dessert"),
      ).toBe(false);
      expect(
        dinner.portions[0].lines.some((l) => l.ingredient_id === "chicken"),
      ).toBe(true);
      expect(
        dinner.portions[1].lines.some((l) => l.ingredient_id === "tofu"),
      ).toBe(true);
      expect(
        dinner.portions[1].lines.some((l) => l.ingredient_id === "chicken"),
      ).toBe(false);
      const grams = new Map<string, Decimal>();
      for (const meal of lib.plans)
        for (const p of meal.portions) {
          let energy = new Decimal(0);
          for (const line of p.lines) {
            const ingredient = lib.ingredients.find(
                (i) => i.id === line.ingredient_id,
              )!,
              conversion = ingredient.conversions.find(
                (c) => c.unit === line.unit,
              )!;
            const g = new Decimal(line.quantity).mul(conversion.grams_per_unit);
            expect(line.grams).toBe(g.toNumber());
            energy = energy.plus(
              g.mul(ingredient.nutrition_per_100g.energy_kcal!).div(100),
            );
            grams.set(
              line.ingredient_id,
              (grams.get(line.ingredient_id) ?? new Decimal(0)).plus(g),
            );
          }
          expect(p.kcal).toBeCloseTo(energy.toNumber(), 8);
        }
      await apply(
        await rpc<ShoppingPreview>("preview_shopping_list", [day, day]),
      );
      let list = await rpc<ShoppingState>("get_shopping_state");
      for (const item of list.items)
        expect(item.quantity).toBe(grams.get(item.ingredient_id!)!.toNumber());
      const manual = crypto.randomUUID();
      await actor(b);
      await rpc("save_manual_shopping_item", [
        manual,
        "Coffee filters",
        "1 pack",
        0,
      ]);
      await rpc("set_shopping_checked", [crypto.randomUUID(), manual, true]);
      const outdated = await rpc<ShoppingPreview>("preview_shopping_list", [
        day,
        day,
      ]);
      dinner.portions[1] = {
        ...dinner.portions[1],
        eating_out: true,
        description: "Dinner at the bar",
        kcal: 550,
      };
      lib = await library();
      await rpc("apply_meal_plans", [[dinner], lib.revision, true]);
      await expect(apply(outdated)).rejects.toThrow("stale_shopping");
      expect(
        (await rpc<ShoppingState>("get_shopping_state")).changes_available,
      ).toBe(true);
      const preview = await rpc<ShoppingPreview>("preview_shopping_list", [
        day,
        day,
      ]);
      expect(
        preview.changes.some(
          (c) => c.before?.ingredient_id === "tofu" && c.action === "remove",
        ),
      ).toBe(true);
      await apply(preview);
      list = await rpc<ShoppingState>("get_shopping_state");
      expect(list.items.find((i) => i.id === manual)?.checked).toBe(true);
      expect(list.items.some((i) => i.ingredient_id === "tofu")).toBe(false);
      const s = await snapshot(),
        person = s.members.find((m) => m.id === b)!;
      const meals = s.meals.filter((m) => m.member_id === b && m.day === day);
      expect(meals.filter((m) => m.type === "dinner")).toHaveLength(1);
      expect(meals.find((m) => m.type === "dinner")!.kcal).toBe(550);
      expect(daySummary(person.profile!, [], meals).complete).toBe(true);
    });
    it("rejects an interleaved stale editor and keeps a closed shared meal immutable across timezone and catalogue changes", async () => {
      await actor(a);
      let lib = await library();
      const meal = structuredClone(
          lib.plans.find((m) => m.type === "breakfast")!,
        ),
        stale = structuredClone(meal),
        revision = lib.revision;
      meal.portions[0].lines[0].quantity += 10;
      await rpc("apply_meal_plans", [[meal], revision, true]);
      await actor(b);
      await expect(
        rpc("apply_meal_plans", [[stale], revision, true]),
      ).rejects.toThrow("stale_plan");
      await db.exec("reset role");
      await db.query(
        "update public.meal_date_locks set cutoff=now()-interval '1 minute' where day=$1",
        [day],
      );
      await actor(a);
      lib = await library();
      const frozen = structuredClone(lib.plans);
      await rpc("bootstrap_member", ["Pacific/Honolulu"]);
      lib = await library();
      const oats = lib.ingredients.find((i) => i.id === "oats")!;
      await rpc("save_household_content", [
        "ingredient",
        {
          ...oats,
          nutrition_per_100g: { ...oats.nutrition_per_100g, energy_kcal: 999 },
        },
        oats.revision,
        false,
      ]);
      expect((await library()).plans).toEqual(frozen);
      await expect(
        rpc("delete_planned_meal", [
          day,
          "breakfast",
          (await library()).revision,
        ]),
      ).rejects.toThrow("day_closed");
      // Closing a shared meal date does not close this member's current personal day.
      await rpc("save_my_daily_entry", [
        "food",
        "Afternoon coffee",
        90,
        null,
        null,
      ]);
      const s = await snapshot();
      expect(
        s.entries.some(
          (e) => e.description === "Afternoon coffee" && e.member_id === a,
        ),
      ).toBe(true);
    });
    it("audits final-schema RLS, direct-write grants, private tables and definer-function exposure", async () => {
      await db.exec("reset role");
      const unsafeTables =
        await db.query(`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in('public','app_private') and (
 (n.nspname='public' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) or
 (n.nspname='app_private' and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))))`);
      expect(unsafeTables.rows).toEqual([]);
      const exposed = await db.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or not coalesce(p.proconfig @> array['search_path=""'],false))`,
      );
      expect(exposed.rows).toEqual([]);
    });
  },
);
