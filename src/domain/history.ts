import Decimal from "decimal.js";
import { DomainError } from "./calories";
import {
  recalculateLines,
  type MealPlan,
  type PlannedPortion,
  type Ingredient,
} from "./planning";
export interface CorrectionSession {
  token: string;
  day: string;
  revision: number;
  expires_at: string;
  plans: MealPlan[];
}
export interface CorrectionAck {
  day: string;
  action: "save" | "erase";
  revision: number;
}
export interface CorrectionEvent {
  id: string;
  member_id: string;
  day: string;
  action: "save" | "erase";
  created_at: string;
  before_meals: MealPlan[];
  after_meals: MealPlan[];
}
export interface ClosedSequence {
  day: string;
  count: number;
  until: number;
}
export function advanceClosedSequence(
  previous: ClosedSequence | null,
  day: string,
  now: number,
): ClosedSequence {
  return {
    day,
    count:
      previous?.day === day && now < previous.until
        ? Math.min(5, previous.count + 1)
        : 1,
    until:
      previous?.day === day && now < previous.until
        ? previous.until
        : now + 5000,
  };
}
// Display-only calculation. Live corrections are independently normalized by SQL.
export function historicalQuantities(
  portion: PlannedPortion,
  original: PlannedPortion | undefined,
  ingredients: Ingredient[],
): PlannedPortion {
  if (portion.eating_out) {
    if (
      !portion.description?.trim() ||
      !Number.isFinite(portion.kcal) ||
      portion.kcal < 0
    )
      throw new DomainError("invalid_entry");
    return {
      ...portion,
      lines: [],
      variety_keys: [],
      substitutions: [],
      name: { en: portion.description.trim(), es: portion.description.trim() },
    };
  }
  const lines = portion.lines.map((l) => {
    const recorded =
      original?.recipe_id === portion.recipe_id
        ? original.lines.find(
            (o) =>
              o.ingredient_id === l.ingredient_id &&
              o.component_id === l.component_id &&
              o.unit === l.unit,
          )
        : undefined;
    if (!Number.isFinite(l.quantity) || l.quantity <= 0)
      throw new DomainError("invalid_quantity");
    if (!recorded)
      return recalculateLines({ ...portion, lines: [l] }, ingredients).lines[0];
    const grams = new Decimal(l.quantity)
      .mul(recorded.grams_per_unit)
      .toNumber();
    const kcal = new Decimal(grams)
      .mul(recorded.energy_per_100g)
      .div(100)
      .toNumber();
    if (!Number.isFinite(grams) || !Number.isFinite(kcal))
      throw new DomainError("missing_nutrition");
    return { ...recorded, quantity: l.quantity, grams, kcal };
  });
  const kcal = lines
    .reduce((s, l) => s.plus(l.kcal), new Decimal(0))
    .toNumber();
  return {
    ...portion,
    lines,
    kcal,
    warnings: [
      ...(kcal > portion.budget ? ["over_budget"] : []),
      ...(portion.substitutions.length ? ["review_substitutions"] : []),
    ],
  };
}
