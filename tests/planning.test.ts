import { describe, it, expect } from "vitest";
import {
  gramsFor,
  makePortion,
  varietyConflict,
  type Ingredient,
  type PlannedRecipe,
  type MealPlan,
} from "../src/domain/planning";
import food from "../content/starter/ingredients.json";
import book from "../content/starter/recipes.json";
import subs from "../content/starter/substitutions.json";
import type { Profile } from "../src/domain/types";
const ingredients = food.ingredients as unknown as Ingredient[];
const recipe = (id: string) =>
  book.recipes.find((r) => r.id === id)! as unknown as PlannedRecipe;
const p: Profile = {
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
const plan = (
  day: string,
  type: "breakfast" | "lunch" | "dinner",
  keys: string[],
): MealPlan => ({
  day,
  type,
  revision: 1,
  shared_recipe_id: "m01",
  portions: [
    {
      ...makePortion(
        recipe("m01"),
        "a",
        p,
        650,
        false,
        ingredients,
        subs.rules,
      ),
      variety_keys: keys,
    },
  ],
});
describe("meal portions and rolling variety", () => {
  it("scales and recalculates calories from final practical quantities", () => {
    const q = makePortion(
      recipe("b01"),
      "a",
      p,
      400,
      false,
      ingredients,
      subs.rules,
    );
    expect(q.kcal).toBeCloseTo(
      q.lines.reduce((s, l) => s + (l.grams * l.energy_per_100g) / 100, 0),
      8,
    );
    expect(q.lines.every((l) => l.quantity > 0)).toBe(true);
    expect(q.recipe_snapshot!.id).toBe("b01");
  });
  it("requires explicit ingredient conversions and preserves countable increments", () => {
    const egg = ingredients.find((i) => i.id === "egg")!;
    expect(() => gramsFor(egg, 1, "egg")).toThrow("missing_conversion");
    expect(
      gramsFor(
        {
          ...egg,
          conversions: [
            ...egg.conversions,
            { unit: "egg", grams_per_unit: 55, quantity_step: 0.5 },
          ],
        },
        2,
        "egg",
      ),
    ).toBe(110);
  });
  it("suggests only curated substitutions compatible with the person and recipe", () => {
    const q = makePortion(
      recipe("m18"),
      "a",
      { ...p, diet: "vegetarian" },
      650,
      false,
      ingredients,
      subs.rules,
    );
    expect(q.substitutions.some((s) => s.to === "tofu")).toBe(true);
    expect(q.lines.some((l) => l.ingredient_id === "chicken")).toBe(false);
    expect(q.warnings).toContain("review_substitutions");
    expect(() =>
      makePortion(
        recipe("m18"),
        "a",
        { ...p, diet: "vegetarian", excluded_ingredients: ["tofu"] },
        650,
        false,
        ingredients,
        subs.rules,
      ),
    ).toThrow();
  });
  it("checks both neighboring directions and week boundaries, excluding breakfast", () => {
    const old = plan("2026-11-01", "dinner", ["chickpea"]);
    expect(
      varietyConflict(plan("2026-11-03", "lunch", ["chickpea"]), [old], 3),
    ).toBe(true);
    expect(
      varietyConflict(plan("2026-11-04", "lunch", ["chickpea"]), [old], 3),
    ).toBe(false);
    expect(
      varietyConflict(plan("2026-10-31", "lunch", ["chickpea"]), [old], 3),
    ).toBe(true);
    expect(
      varietyConflict(plan("2026-11-01", "lunch", ["chickpea"]), [old], 3),
    ).toBe(true);
    expect(
      varietyConflict(plan("2026-11-01", "breakfast", ["chickpea"]), [old], 3),
    ).toBe(false);
  });
  it("rejects archived selections and missing nutrition", () => {
    expect(() =>
      makePortion(
        { ...recipe("b01"), archived: true },
        "a",
        p,
        400,
        false,
        ingredients,
        subs.rules,
      ),
    ).toThrow("invalid_recipe");
    expect(() =>
      makePortion(
        recipe("b01"),
        "a",
        p,
        400,
        false,
        ingredients.map((i) =>
          i.id === "oats"
            ? { ...i, nutrition_per_100g: { energy_kcal: null } }
            : i,
        ),
        subs.rules,
      ),
    ).toThrow("missing_nutrition");
  });
  it("selects dessert per person without adding it to another portion", () => {
    const r = recipe("m01");
    const a = makePortion(r, "a", p, 650, true, ingredients, subs.rules),
      b = makePortion(r, "b", p, 650, false, ingredients, subs.rules);
    expect(a.lines.some((l) => l.component_id === "dessert")).toBe(true);
    expect(b.lines.some((l) => l.component_id === "dessert")).toBe(false);
  });
  it("scales kilogram recipe quantities with practical mass precision", () => {
    const r = recipe("b01");
    const converted = {
      ...r,
      components: r.components.map((c) => ({
        ...c,
        ingredients: c.ingredients.map((l) =>
          l.ingredient_id === "oats"
            ? { ...l, quantity: l.quantity / 1000, unit: "kg" }
            : l,
        ),
      })),
    };
    const a = makePortion(r, "a", p, 400, false, ingredients, subs.rules),
      b = makePortion(converted, "a", p, 400, false, ingredients, subs.rules);
    expect(a.kcal).toBeCloseTo(b.kcal, 8);
  });
});
