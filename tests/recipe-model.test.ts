import { it, expect } from "vitest";
import starter from "../content/starter/recipes.json";
import expansion from "../content/expansions/requested-recipes.json";
import foods from "../content/starter/ingredients.json";
import substitutions from "../content/starter/substitutions.json";
import {
  withRecipeModel,
  householdPreparations,
  validateRecipeModel,
  savedVariant,
} from "../src/domain/recipe-model";
import {
  makePortion,
  type Ingredient,
  type PlannedRecipe,
  type MealPlan,
} from "../src/domain/planning";
import type { Profile } from "../src/domain/types";
const ingredients = [
  ...foods.ingredients,
  ...expansion.ingredients,
] as unknown as Ingredient[];
const recipes = [
  ...starter.recipes,
  ...expansion.recipes,
] as unknown as PlannedRecipe[];
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
  excluded_ingredients: [],
  language: "en",
};
const portion = (r: PlannedRecipe, p = profile, budget = 650) =>
  makePortion(r, p.name, p, budget, false, ingredients, substitutions.rules);
it("adapts 63 bundled recipes and preserves calorie calculations, units and ingredient amounts for every supported dietary combination", () => {
  let compared = 0;
  for (const r of recipes) {
    const model = withRecipeModel(r);
    validateRecipeModel(model);
    expect(model.recipe_model?.version).toBe(2);
    for (const diet of [
      "omnivore",
      "vegetarian",
      "vegan",
      "pescatarian",
    ] as const)
      for (const dessert of [false, true]) {
        const p = { ...profile, diet };
        let old;
        try {
          old = makePortion(
            r,
            p.name,
            p,
            650,
            dessert,
            ingredients,
            substitutions.rules,
          );
        } catch {
          continue;
        }
        const next = makePortion(
          model,
          p.name,
          p,
          650,
          dessert,
          ingredients,
          substitutions.rules,
        );
        const amounts = (lines: typeof next.lines) =>
          lines
            .map((l) => ({
              id: l.ingredient_id,
              c: l.component_id,
              quantity: l.quantity,
              unit: l.unit,
              grams: l.grams,
              kcal: l.kcal,
            }))
            .sort((a, b) => (a.c + a.id).localeCompare(b.c + b.id));
        expect(amounts(next.lines), `${r.id}/${diet}/${dessert}`).toEqual(
          amounts(old.lines),
        );
        expect(next.kcal).toBeCloseTo(old.kcal, 9);
        compared++;
      }
  }
  expect(compared).toBeGreaterThan(250);
});
it("combines vegetables and rice for the household and separates chicken and tofu, preserving personal portions", () => {
  const r = withRecipeModel(recipes.find((r) => r.id === "m18")!);
  const a = portion(r),
    b = portion(r, { ...profile, name: "Noa", diet: "vegetarian" }, 450);
  const plan: MealPlan = {
    day: "2026-11-12",
    type: "lunch",
    revision: 0,
    shared_recipe_id: r.id,
    portions: [a, b],
  };
  const groups = householdPreparations(plan);
  const rice = groups.find((g) =>
    g.lines.some((l) => l.ingredient_id === "rice_white"),
  )!;
  expect(rice.shares).toHaveLength(2);
  expect(rice.lines[0].grams).toBe(
    a.lines.find((l) => l.ingredient_id === "rice_white")!.grams +
      b.lines.find((l) => l.ingredient_id === "rice_white")!.grams,
  );
  expect(groups.filter((g) => g.shares.length === 2)).toHaveLength(2);
  expect(groups.filter((g) => g.shares.length === 1)).toHaveLength(2);
  expect(JSON.stringify(savedVariant(b)?.preparations)).not.toMatch(
    /omit|omitir|raw-chicken|pollo crudo/i,
  );
  expect(savedVariant(b)?.name.en).not.toMatch(/chicken/i);
});
it("does not infer preparations from household text or mutate old snapshots", () => {
  const r = structuredClone(recipes.find((r) => r.id === "m18")!);
  r.components[0].instructions[0].en = "Use chicken stock for the vegetables.";
  expect(withRecipeModel(r).recipe_model).toBeUndefined();
  const old = portion(recipes.find((r) => r.id === "m18")!);
  const before = JSON.stringify(old);
  withRecipeModel(old.recipe_snapshot!);
  expect(JSON.stringify(old)).toBe(before);
});
it("does not combine preparation revisions or nutritional states and detects nonproportional serving ratios", () => {
  const r = withRecipeModel(recipes.find((r) => r.id === "m18")!);
  const a = portion(r),
    b = portion(r, { ...profile, name: "Noa", diet: "vegetarian" }, 450);
  const altered = b.lines.find((l) => l.ingredient_id === "pepper_red")!;
  altered.grams += 13;
  const plan: MealPlan = {
    day: "2026-11-12",
    type: "lunch",
    revision: 0,
    shared_recipe_id: r.id,
    portions: [a, b],
  };
  expect(
    householdPreparations(plan).find((g) =>
      g.lines.some((l) => l.ingredient_id === "pepper_red"),
    )?.proportional,
  ).toBe(false);
  b
    .recipe_snapshot!.recipe_model!.variants.find((v) => v.id === b.variant_id)!
    .preparations.find((p) => p.id === "m18-vegetables")!.revision++;
  expect(
    householdPreparations(plan).filter((g) => g.shares.length === 2),
  ).toHaveLength(1);
});
it("batches the same rice preparation across different dishes without counting shopping twice", async () => {
  const { PreviewRepository } = await import("../src/lib/preview-repository");
  const { cookingRequirements, cookingProposal, defaultCookingSettings } =
    await import("../src/domain/cooking");
  const repo = new PreviewRepository("UTC"),
    state = await repo.load("UTC"),
    lib = await repo.getPlanningLibrary();
  state.server_now = "2026-11-09T08:00:00Z";
  const plans = ["m18", "m22", "m09"].map((id, i) => {
    const recipe = lib.recipes.find((r) => r.id === id)!;
    return {
      day: `2026-11-${10 + i * 2}`,
      type: "lunch" as const,
      revision: 0,
      shared_recipe_id: id,
      portions: state.members.map((m) =>
        makePortion(
          recipe,
          m.id,
          m.profile!,
          600,
          false,
          lib.ingredients,
          lib.substitutions,
        ),
      ),
    };
  });
  state.planning = { ...lib, plans };
  const settings = {
    ...defaultCookingSettings("UTC"),
    sessions: [{ weekday: 1, time: "10:00" }],
  };
  const requirements = cookingRequirements(state, settings);
  const rice = requirements.filter(
    (r) => r.lines.length === 1 && r.lines[0].ingredient_id === "rice_white",
  );
  expect(rice).toHaveLength(6);
  expect(new Set(rice.map((r) => r.signature)).size).toBe(1);
  const proposal = cookingProposal(
    {
      settings,
      batches: [],
      requirements,
      revision: 0,
      server_now: state.server_now,
    },
    plans.map((p) => p.day),
  );
  expect(
    proposal.tasks.filter(
      (t) => t.lines.length === 1 && t.lines[0].ingredient_id === "rice_white",
    ),
  ).toHaveLength(1);
  const batch = proposal.tasks.find(
    (t) => t.lines.length === 1 && t.lines[0].ingredient_id === "rice_white",
  )!;
  expect(batch.allocations).toHaveLength(6);
  expect(batch.grams).toBe(rice.reduce((s, r) => s + r.grams, 0));
  expect(batch.allocations.some((a) => a.storage === "frozen")).toBe(true);
});
it("preserves every configured substitution's amounts, including exclusions that select grains, nuts and alternative proteins", () => {
  let checked = 0;
  for (const rule of substitutions.rules)
    for (const id of rule.allowed_recipe_ids) {
      const recipe = recipes.find((r) => r.id === id)!;
      const competing = substitutions.rules
        .filter(
          (r) =>
            r.from_ingredient_id === rule.from_ingredient_id &&
            r.allowed_recipe_ids.includes(id) &&
            r.to_ingredient_id !== rule.to_ingredient_id,
        )
        .map((r) => r.to_ingredient_id);
      const p = {
        ...profile,
        excluded_ingredients: [rule.from_ingredient_id, ...competing],
      };
      let old;
      try {
        old = portion(recipe, p);
      } catch {
        continue;
      }
      const next = portion(withRecipeModel(recipe), p);
      const amounts = (lines: typeof next.lines) =>
        lines.map((l) => [
          l.component_id,
          l.ingredient_id,
          l.unit,
          l.quantity,
          l.grams,
          l.kcal,
        ]);
      expect(amounts(next.lines), `${rule.id}/${id}`).toEqual(
        amounts(old.lines),
      );
      checked++;
    }
  expect(checked).toBeGreaterThan(30);
});
it("copying a week retains an explicitly chosen compatible variant and excludes vetoed recipes", async () => {
  const { PreviewRepository } = await import("../src/lib/preview-repository");
  const { replan } = await import("../src/domain/menu-draft");
  const repo = new PreviewRepository("UTC"),
    state = await repo.load("UTC"),
    lib = await repo.getPlanningLibrary();
  const r = lib.recipes.find((r) => r.id === "m18")!;
  const source: MealPlan = {
    day: "2026-11-12",
    type: "lunch",
    revision: 0,
    shared_recipe_id: r.id,
    portions: state.members.map((m) =>
      makePortion(
        r,
        m.id,
        m.profile!,
        600,
        false,
        lib.ingredients,
        lib.substitutions,
        "s03",
      ),
    ),
  };
  const copied = replan(source, "2026-11-19", "lunch", state, lib);
  expect(
    copied.plan.portions.find((p) => p.member_id === state.viewer_id)
      ?.variant_id,
  ).toBe("s03");
  r.banned = true;
  expect(
    replan(source, "2026-11-19", "lunch", state, lib).plan.portions,
  ).toHaveLength(0);
});
