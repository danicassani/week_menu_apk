import { it, expect } from "vitest";
import { allocation, percentages } from "../src/domain/allocation";
import type { MealPlan, PlannedPortion } from "../src/domain/planning";
const portion = (
  id: string,
  grams: number[],
  options: Partial<PlannedPortion> = {},
): PlannedPortion => ({
  member_id: id,
  recipe_id: "r",
  name: { en: "Recipe", es: "Receta" },
  budget: 9999,
  kcal: grams.reduce((s, g) => s + g, 0),
  dessert: false,
  eating_out: false,
  substitutions: [],
  variety_keys: [],
  warnings: [],
  lines: grams.map((g, i) => ({
    ingredient_id: String(i),
    component_id: "main",
    grams: g,
    quantity: g,
    unit: "g",
    kcal: g,
    name: { en: `Food ${i}`, es: `Comida ${i}` },
    variety_role: "support",
    nutrition_revision: 1,
    grams_per_unit: 1,
    energy_per_100g: 100,
    variety_key: String(i),
  })),
  ...options,
});
const plan = (portions: PlannedPortion[]): MealPlan => ({
  day: "2026-11-10",
  type: "lunch",
  shared_recipe_id: "r",
  revision: 0,
  portions,
});
it("apportions displayed shares to 100 without using budgets or changing food", () => {
  expect(percentages([1, 1, 1])).toEqual([34, 33, 33]);
  expect(percentages([0, 0])).toEqual([]);
  expect(percentages([Infinity, 1])).toEqual([]);
  const meal = plan([portion("a", [100, 50]), portion("b", [300, 150])]),
    before = structuredClone(meal),
    result = allocation(meal);
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].shares.map((s) => s.percent)).toEqual([25, 75]);
  expect(meal).toEqual(before);
});
it("splits differing recipes, substitutions and optional desserts into real preparations", () => {
  const a = portion("a", [100]),
    b = portion("b", [200], {
      substitutions: [
        {
          from: "chicken",
          to: "tofu",
          instructions: { en: "Warm tofu", es: "Calienta tofu" },
        },
      ],
    }),
    c = portion("c", [200], { recipe_id: "another" });
  b.lines[0].ingredient_id = "tofu";
  a.lines.push({
    ...a.lines[0],
    component_id: "dessert",
    ingredient_id: "apple",
  });
  a.dessert = true;
  const groups = allocation(plan([a, b, c])).groups;
  expect(groups).toHaveLength(4);
  expect(
    groups.every((g) => g.shares.reduce((s, p) => s + p.percent, 0) === 100),
  ).toBe(true);
});
it("uses ingredient-level shares when independent rounding changes proportions beyond five percentage points", () => {
  const groups = allocation(
    plan([portion("a", [10, 90]), portion("b", [90, 10])]),
  ).groups;
  expect(groups).toHaveLength(2);
  expect(groups.every((g) => g.ingredientLevel)).toBe(true);
  expect(groups[0].shares.map((s) => s.percent)).toEqual([10, 90]);
});
it("does not invent allocations for eating out, missing or invalid quantities", () => {
  const meal = plan([
      portion("a", [], {
        eating_out: true,
        description: "Restaurant",
        kcal: 500,
      }),
      portion("b", [NaN]),
      portion("c", []),
    ]),
    r = allocation(meal);
  expect(r.groups).toEqual([]);
  expect(r.eatingOut).toHaveLength(1);
  expect(r.invalid).toBe(2);
});

it("a substitution in the main does not split an identical side", () => {
  const a = portion("a", [100]),
    b = portion("b", [100], {
      substitutions: [
        {
          from: "chicken",
          to: "tofu",
          instructions: { en: "Warm tofu", es: "Calienta tofu" },
        },
      ],
    });
  b.lines[0].ingredient_id = "tofu";
  a.lines.push({ ...a.lines[0], component_id: "side", ingredient_id: "rice" });
  b.lines.push({ ...a.lines[1], grams: 200, quantity: 200 });
  const groups = allocation(plan([a, b])).groups;
  expect(groups).toHaveLength(3);
  expect(groups.filter((g) => g.shares.length === 2)).toHaveLength(1);
});
