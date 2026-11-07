// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import {
  advanceClosedSequence,
  historicalQuantities,
} from "../src/domain/history";
import { useClosedDayCheck } from "../src/components/closed-day-check";
import {
  makePortion,
  type Ingredient,
  type PlannedRecipe,
} from "../src/domain/planning";
import recipes from "../content/starter/recipes.json";
import ingredients from "../content/starter/ingredients.json";
import type { Profile } from "../src/domain/types";
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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("five activations must be the same date within a single five-second window", () => {
  let s = advanceClosedSequence(null, "2026-11-01", 1000);
  s = advanceClosedSequence(s, "2026-11-01", 3000);
  expect(s.count).toBe(2);
  expect(s.until).toBe(6000);
  s = advanceClosedSequence(s, "2026-11-01", 6000);
  expect(s.count).toBe(1);
  s = advanceClosedSequence(s, "2026-11-02", 6100);
  expect(s.count).toBe(1);
});
it("keyboard auto-repeat cannot open the offer; five deliberate clicks can, and navigation resets", () => {
  vi.useFakeTimers();
  const offer = vi.fn();
  function Harness({ week }: { week: string }) {
    const check = useClosedDayCheck(week, "en", offer);
    return (
      <>
        {check.button("2026-11-01")}
        {check.button("2026-11-02")}
      </>
    );
  }
  const ui = render(<Harness week="one" />),
    a = screen.getAllByRole("button")[0],
    b = screen.getAllByRole("button")[1];
  for (let i = 0; i < 8; i++)
    expect(fireEvent.keyDown(a, { key: "Enter", repeat: true })).toBe(false);
  expect(offer).not.toHaveBeenCalled();
  fireEvent.click(a);
  fireEvent.click(a);
  fireEvent.click(b);
  fireEvent.click(a);
  act(() => vi.advanceTimersByTime(5000));
  for (let i = 0; i < 4; i++) fireEvent.click(a);
  expect(offer).not.toHaveBeenCalled();
  ui.rerender(<Harness week="two" />);
  fireEvent.click(a);
  expect(offer).not.toHaveBeenCalled();
  for (let i = 0; i < 4; i++) fireEvent.click(a);
  expect(offer).toHaveBeenCalledExactlyOnceWith("2026-11-01");
});
it("retained quantities keep recorded unit conversions and nutrition instead of today's catalogue", () => {
  const foods = structuredClone(
    ingredients.ingredients,
  ) as unknown as Ingredient[];
  const recipe = recipes.recipes.find(
    (r) => r.id === "b01",
  ) as unknown as PlannedRecipe;
  const old = makePortion(recipe, "alex", profile, 400, false, foods, []);
  const changed = structuredClone(old);
  changed.lines[0].quantity *= 2;
  foods.find(
    (f) => f.id === old.lines[0].ingredient_id,
  )!.nutrition_per_100g.energy_kcal = 999;
  const result = historicalQuantities(changed, old, foods);
  expect(result.lines[0].kcal).toBe(old.lines[0].kcal * 2);
  expect(result.lines.slice(1)).toEqual(old.lines.slice(1));
  changed.lines[0].quantity = NaN;
  expect(() => historicalQuantities(changed, old, foods)).toThrow(
    "invalid_quantity",
  );
});
