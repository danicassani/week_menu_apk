import { it, expect } from "vitest";
import {
  shoppingRequirements,
  shoppingChanges,
  applyShoppingPreview,
  emptyShopping,
  overlayPending,
  eligibleShoppingPlans,
  shoppingValidUntil,
  shoppingNeedsRefresh,
  type ShoppingItem,
} from "../src/domain/shopping";
import {
  makePortion,
  type Ingredient,
  type PlannedRecipe,
  type MealPlan,
} from "../src/domain/planning";
import type { Profile } from "../src/domain/types";
import food from "../content/starter/ingredients.json";
import book from "../content/starter/recipes.json";
import substitutions from "../content/starter/substitutions.json";
import { dayCutoff, addDays } from "../src/domain/dates";
import type { HouseholdState } from "../src/domain/types";
const ingredients = food.ingredients as unknown as Ingredient[],
  r = book.recipes.find((r) => r.id === "m01")! as unknown as PlannedRecipe;
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
const meal: MealPlan = {
  day: "2026-11-04",
  type: "lunch",
  revision: 1,
  shared_recipe_id: r.id,
  portions: [
    makePortion(r, "a", profile, 650, true, ingredients, substitutions.rules),
    makePortion(r, "b", profile, 650, false, ingredients, substitutions.rules),
  ],
};
const required = () =>
  shoppingRequirements([meal], "2026-11-04", "2026-11-04", ingredients);
const manual: ShoppingItem = {
  id: "manual",
  source: "manual",
  key: null,
  ingredient_id: null,
  name: { en: "Soap", es: "Jabón" },
  amount: "1 bottle",
  quantity: null,
  unit: "",
  reference_state: "",
  quantity_basis: "",
  checked: true,
  increased: false,
  content_revision: 1,
  checked_revision: 1,
};
it("expires at the first member's exact midnight and marks unprovable offline quantities for refresh", () => {
  const scope = {
    members: [
      { status: "active", time_zone: "UTC" },
      { status: "active", time_zone: "Pacific/Auckland" },
    ],
    meal_locks: [],
  } as unknown as HouseholdState;
  const cutoff = Date.parse(dayCutoff(meal.day, "Pacific/Auckland"));
  const future = { ...meal, day: addDays(meal.day, 1) };
  expect(eligibleShoppingPlans([meal, future], scope, cutoff - 1)).toHaveLength(
    2,
  );
  expect(eligibleShoppingPlans([meal, future], scope, cutoff)).toEqual([
    future,
  ]);
  expect(
    shoppingValidUntil([meal, future], scope, meal.day, future.day, cutoff),
  ).toBe(dayCutoff(future.day, "Pacific/Auckland").replace("Z", ".000Z"));
  const populated = applyShoppingPreview(emptyShopping(), {
    start_date: meal.day,
    end_date: meal.day,
    content_revision: 0,
    source_fingerprint: "test",
    changes: shoppingChanges(emptyShopping(), required()),
  });
  expect(
    shoppingNeedsRefresh(
      {
        ...populated,
        scope: "upcoming",
        contributions_complete: true,
        contributions: [],
        valid_until: new Date(cutoff).toISOString(),
      },
      cutoff - 1,
    ),
  ).toBe(false);
  expect(
    shoppingNeedsRefresh(
      {
        ...populated,
        scope: "upcoming",
        contributions_complete: true,
        contributions: [],
        valid_until: new Date(cutoff).toISOString(),
      },
      cutoff,
    ),
  ).toBe(true);
  expect(shoppingNeedsRefresh(populated, cutoff)).toBe(true);
  expect(
    shoppingNeedsRefresh({ ...populated, valid_until: "invalid" }, cutoff),
  ).toBe(true);
  expect(
    shoppingNeedsRefresh(
      {
        ...emptyShopping(),
        scope: "upcoming",
        contributions_complete: true,
        contributions: [],
        items: [manual],
      },
      cutoff,
    ),
  ).toBe(false);
  scope.meal_locks = [
    { day: future.day, cutoff: dayCutoff(future.day, "UTC"), closed: true },
  ];
  expect(eligibleShoppingPlans([future], scope, cutoff)).toEqual([]);
});
it("aggregates personal final portions, selected dessert and side quantities once", () => {
  const rows = required();
  const total = meal.portions
    .flatMap((p) => p.lines)
    .reduce((s, l) => s + l.grams, 0);
  expect(rows.reduce((s, r) => s + r.quantity, 0)).toBeCloseTo(total, 8);
  expect(rows.find((r) => r.ingredient_id === "chickpeas")?.quantity).toBe(
    meal.portions
      .flatMap((p) => p.lines)
      .filter((l) => l.ingredient_id === "chickpeas")
      .reduce((s, l) => s + l.grams, 0),
  );
  expect(
    shoppingRequirements([meal], "2026-11-05", "2026-11-06", ingredients),
  ).toEqual([]);
});
it("eating out contributes no home-cooked ingredients", () => {
  const out = {
    ...meal,
    portions: meal.portions.map((p) => ({ ...p, eating_out: true })),
  };
  expect(shoppingRequirements([out], meal.day, meal.day, ingredients)).toEqual(
    [],
  );
});
it("keeps raw/cooked reference identities separate even for the same catalogue ID", () => {
  const changed = structuredClone(meal);
  changed.portions[1].lines = changed.portions[1].lines.map((l) =>
    l.ingredient_id === "chickpeas" ? { ...l, reference_state: "cooked" } : l,
  );
  expect(
    shoppingRequirements([changed], meal.day, meal.day, ingredients).filter(
      (r) => r.ingredient_id === "chickpeas",
    ),
  ).toHaveLength(2);
});
it("retains stable IDs and manual checks, unchecks increases and preserves decreases", () => {
  let current = applyShoppingPreview(
    { ...emptyShopping(), items: [manual] },
    {
      start_date: meal.day,
      end_date: meal.day,
      content_revision: 0,
      source_fingerprint: "a",
      changes: shoppingChanges(emptyShopping(), required()),
    },
  );
  current.items = current.items.map((i) => ({ ...i, checked: true }));
  const id = current.items.find((i) => i.source === "generated")!.id,
    key = current.items.find((i) => i.id === id)!.key;
  const rows = required().map((r) =>
    r.key === key ? { ...r, quantity: r.quantity + 20 } : r,
  );
  let next = applyShoppingPreview(current, {
    start_date: meal.day,
    end_date: "2026-11-06",
    content_revision: current.content_revision,
    source_fingerprint: "b",
    changes: shoppingChanges(current, rows),
  });
  expect(next.items.find((i) => i.id === id)?.checked).toBe(false);
  expect(next.items.find((i) => i.id === id)?.increased).toBe(true);
  expect(next.items.find((i) => i.id === "manual")?.checked).toBe(true);
  next.items = next.items.map((i) => ({ ...i, checked: true }));
  const lower = required().map((r) =>
    r.key === key ? { ...r, quantity: r.quantity - 1 } : r,
  );
  next = applyShoppingPreview(next, {
    start_date: meal.day,
    end_date: meal.day,
    content_revision: next.content_revision,
    source_fingerprint: "c",
    changes: shoppingChanges(next, lower),
  });
  expect(next.items.find((i) => i.id === id)?.checked).toBe(true);
});
it("preserves manual additions when every generated contribution disappears", () => {
  const current = applyShoppingPreview(
    { ...emptyShopping(), items: [manual] },
    {
      start_date: meal.day,
      end_date: meal.day,
      content_revision: 0,
      source_fingerprint: "a",
      changes: shoppingChanges(emptyShopping(), required()),
    },
  );
  const next = applyShoppingPreview(current, {
    start_date: "2026-12-01",
    end_date: "2026-12-02",
    content_revision: current.content_revision,
    source_fingerprint: "b",
    changes: shoppingChanges(current, []),
  });
  expect(next.items).toEqual([manual]);
});
it("overlays only the newest queued intent for each stable item ID", () => {
  const rows = overlayPending(
    [manual],
    [
      { id: "2", item_id: "manual", checked: false, sequence: 2 },
      { id: "1", item_id: "manual", checked: true, sequence: 1 },
      { id: "3", item_id: "gone", checked: true, sequence: 3 },
    ],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].checked).toBe(false);
});
