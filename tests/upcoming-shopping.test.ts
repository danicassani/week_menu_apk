import { it, expect } from "vitest";
import {
  emptyShopping,
  projectUpcomingShopping,
  shoppingNeedsRefresh,
  formatShoppingQuantity,
  type ShoppingItem,
  type ShoppingState,
  type PurchasingUnit,
} from "../src/domain/shopping";
const unit: PurchasingUnit = {
  ingredient_id: "egg",
  unit: "egg",
  grams_per_unit: 50,
  estimated: true,
  origin: "starter_estimate",
  revision: 0,
  reference_state: "raw_edible",
  quantity_basis: "edible_reference_weight",
};
const egg: ShoppingItem = {
  id: "egg-row",
  source: "generated",
  key: "egg-key",
  ingredient_id: "egg",
  name: { en: "Egg", es: "Huevo" },
  amount: "",
  quantity: 125,
  unit: "g",
  reference_state: "raw_edible",
  quantity_basis: "edible_reference_weight",
  checked: true,
  increased: false,
  content_revision: 1,
  checked_revision: 1,
  purchasing_unit: unit,
};
it("rounds combined edible grams upward into estimated eggs without changing nutrition or manual amounts", () => {
  expect(formatShoppingQuantity(egg, "en")).toBe("3 eggs");
  expect(formatShoppingQuantity({ ...egg, quantity: 50 }, "es")).toBe(
    "1 huevo",
  );
  expect(formatShoppingQuantity({ ...egg, quantity: 125 }, "es")).toBe(
    "3 huevos",
  );
  expect(
    formatShoppingQuantity(
      { ...egg, purchasing_unit: { ...unit, grams_per_unit: 0 } },
      "en",
    ),
  ).toBe("125 g");
  expect(
    formatShoppingQuantity({ ...egg, reference_state: "cooked" }, "en"),
  ).toBe("125 g");
  expect(
    formatShoppingQuantity(
      { ...egg, source: "manual", amount: "one carton" },
      "en",
    ),
  ).toBe("one carton");
  expect(egg.quantity).toBe(125);
});
it("subtracts complete expired contributions without changing pending intent, manual rows or surviving checks", () => {
  const manual = { ...egg, id: "soap", source: "manual" as const, amount: "1" };
  const state: ShoppingState = {
    ...emptyShopping(),
    scope: "upcoming",
    contributions_complete: true,
    items: [egg, manual],
    valid_until: "2026-11-04T00:00:00Z",
    contributions: [
      {
        day: "2026-11-03",
        cutoff: "2026-11-04T00:00:00Z",
        items: [{ ...egg, key: egg.key!, ingredient_id: "egg", quantity: 75 }],
      },
      {
        day: "2026-11-04",
        cutoff: "2026-11-05T00:00:00Z",
        items: [{ ...egg, key: egg.key!, ingredient_id: "egg", quantity: 50 }],
      },
    ],
  };
  const copy = structuredClone(state),
    projected = projectUpcomingShopping(
      state,
      Date.parse("2026-11-04T00:00:00Z"),
    );
  expect(projected.items[0]).toMatchObject({
    quantity: 50,
    checked: true,
    id: egg.id,
  });
  expect(projected.items[1]).toEqual(manual);
  expect(projected.valid_until).toBe("2026-11-05T00:00:00.000Z");
  expect(
    shoppingNeedsRefresh(projected, Date.parse("2026-11-04T00:00:00Z")),
  ).toBe(false);
  expect(
    projectUpcomingShopping(state, Date.parse("2026-11-05T00:00:00Z")).items,
  ).toEqual([manual]);
  expect(state).toEqual(copy);
  const legacy = { ...state, scope: undefined };
  expect(projectUpcomingShopping(legacy)).toBe(legacy);
  expect(shoppingNeedsRefresh(legacy)).toBe(true);
  expect(
    projectUpcomingShopping({
      ...state,
      contributions: [{ ...state.contributions![0], cutoff: "bad" }],
    }).contributions_complete,
  ).toBe(false);
});
