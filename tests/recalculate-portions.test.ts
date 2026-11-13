import { it, expect } from "vitest";
import { PreviewRepository } from "../src/lib/preview-repository";
import { addDays } from "../src/domain/dates";
import {
  makePortion,
  recalculateLines,
  type MealPlan,
} from "../src/domain/planning";
import { recalculatePlannedPortions } from "../src/domain/recalculate-portions";

async function fixture() {
  const s = await new PreviewRepository("UTC").load("UTC"),
    lib = s.planning!,
    day = s.server_now.slice(0, 10);
  lib.plans = [];
  s.budget_overrides = [];
  const plan = (date = day): MealPlan => ({
    day: date,
    type: "lunch",
    revision: 3,
    shared_recipe_id: "m18",
    portions: s.members.map((member, index) =>
      makePortion(
        lib.recipes.find((r) => r.id === "m18")!,
        member.id,
        member.profile!,
        index === 0 ? 1000 : 200,
        index === 0,
        lib.ingredients,
        lib.substitutions,
      ),
    ),
  });
  return { s, lib, day, plan };
}
it("resizes above and below budget, honoring personal overrides while keeping composition and input data", async () => {
  const { s, lib, day, plan } = await fixture();
  lib.plans = [plan()];
  const original = lib.plans[0];
  original.portions[0] = recalculateLines(
    {
      ...original.portions[0],
      lines: original.portions[0].lines.map((line, index) =>
        index === 0 ? { ...line, quantity: line.quantity + 30 } : line,
      ),
    },
    lib.ingredients,
  );
  s.budget_overrides.push({
    member_id: s.viewer_id,
    day,
    meal_type: "lunch",
    kcal: 700,
  });
  const before = structuredClone(s),
    draft = recalculatePlannedPortions(s, [day]);
  expect(s).toEqual(before);
  expect(draft.plans).toHaveLength(1);
  expect(draft.changes).toHaveLength(2);
  for (const change of draft.changes) {
    const expected =
      change.member_id === s.viewer_id
        ? 700
        : s.targets.find((t) => t.member_id === change.member_id)!.budgets
            .lunch;
    expect(change.after.budget).toBe(expected);
    expect(Math.abs(change.after.kcal - expected)).toBeLessThan(
      Math.abs(change.before.kcal - expected),
    );
    expect(change.after.recipe_id).toBe(change.before.recipe_id);
    expect(change.after.recipe_snapshot).toEqual(change.before.recipe_snapshot);
    expect(change.after.substitutions).toEqual(change.before.substitutions);
    expect(change.after.dessert).toBe(change.before.dessert);
    expect(
      change.after.lines.map((l) => [l.ingredient_id, l.component_id, l.unit]),
    ).toEqual(
      change.before.lines.map((l) => [l.ingredient_id, l.component_id, l.unit]),
    );
  }
  expect(draft.plans[0].shared_recipe_id).toBe(original.shared_recipe_id);
  expect(draft.changes[1].after.variant_id).toBeTruthy();
  expect(draft.changes[1].after.warnings).not.toContain("review_substitutions");
});
it("keeps closed days, dates outside the selected week and restaurant entries unchanged", async () => {
  const { s, lib, day, plan } = await fixture();
  const closed = addDays(day, -1),
    outside = addDays(day, 8),
    today = plan();
  today.portions[0] = {
    ...today.portions[0],
    eating_out: true,
    recipe_id: null,
    description: "Lunch out",
    lines: [],
    kcal: 900,
  };
  lib.plans = [plan(closed), today, plan(outside)];
  const before = structuredClone(lib.plans),
    draft = recalculatePlannedPortions(s, [closed, day]);
  expect(draft.plans.map((p) => p.day)).toEqual([day]);
  expect(draft.plans[0].portions[0]).toEqual(today.portions[0]);
  expect(lib.plans).toEqual(before);
});
it("uses the earliest member cutoff, even if the viewer is still on the previous day", async () => {
  const { s, lib, day, plan } = await fixture();
  lib.plans = [plan()];
  s.members[0].time_zone = "Pacific/Honolulu";
  s.members[1].time_zone = "Pacific/Kiritimati";
  s.server_now = day + "T12:00:00Z";
  expect(recalculatePlannedPortions(s, [day]).plans).toEqual([]);
});
it("does not resize equal displayed calories and retains conversion steps for whole units", async () => {
  const { s, lib, day, plan } = await fixture();
  const food = lib.ingredients.find((f) => f.id === "chicken")!;
  food.nutrition_per_100g.energy_kcal = 100;
  food.conversions = [
    { unit: "g", grams_per_unit: 1 },
    { unit: "piece", grams_per_unit: 100, quantity_step: 1 },
  ];
  const portion = plan().portions[0];
  const exact = recalculateLines(
    {
      ...portion,
      budget: 400,
      substitutions: [],
      lines: [
        {
          ...portion.lines[0],
          ingredient_id: food.id,
          quantity: 4,
          unit: "piece",
        },
      ],
    },
    lib.ingredients,
  );
  const meal = { ...plan(), portions: [exact] };
  lib.plans = [meal];
  s.budget_overrides = [
    { member_id: exact.member_id, day, meal_type: "lunch", kcal: 400 },
  ];
  expect(recalculatePlannedPortions(s, [day]).changes).toHaveLength(0);
  s.budget_overrides[0].kcal = 610;
  const draft = recalculatePlannedPortions(s, [day]);
  expect(draft.plans[0].portions[0].lines[0].quantity).toBe(6);
  expect(draft.plans[0].portions[0].kcal).toBe(600);
  expect(draft.roundingLimited).toBe(1);
  lib.plans = draft.plans;
  expect(recalculatePlannedPortions(s, [day]).changes).toHaveLength(0);
  s.budget_overrides[0].kcal = 1;
  const minimum = recalculatePlannedPortions(s, [day]);
  expect(minimum.plans[0].portions[0].lines[0].quantity).toBe(1);
  expect(minimum.roundingLimited).toBe(1);
});
it("fails before any save when required nutrition or current budgets are missing", async () => {
  const { s, lib, day, plan } = await fixture();
  lib.plans = [plan()];
  const before = structuredClone(lib.plans),
    ingredients = lib.ingredients;
  lib.ingredients = [];
  expect(() => recalculatePlannedPortions(s, [day])).toThrow(
    "missing_nutrition",
  );
  expect(lib.plans).toEqual(before);
  lib.ingredients = ingredients;
  s.budget_overrides = [
    { member_id: s.viewer_id, day, meal_type: "lunch", kcal: 0 },
  ];
  expect(() => recalculatePlannedPortions(s, [day])).toThrow("invalid_budgets");
  expect(lib.plans).toEqual(before);
});
