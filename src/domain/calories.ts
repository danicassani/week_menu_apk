import Decimal from "decimal.js";
import { daysBetween } from "./dates";
import type {
  Budgets,
  DailyEntry,
  MealSummary,
  Profile,
  Proposal,
} from "./types";

export class DomainError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  active: 1.55,
  very_active: 1.725,
} as const;
const valid = (n: number) => Number.isFinite(n) && n > 0;

export function validateProfile(p: Profile): void {
  if (
    !p.name.trim() ||
    p.name.length > 80 ||
    !Number.isInteger(p.age) ||
    p.age < 18 ||
    !valid(p.height_cm) ||
    !valid(p.weight_kg)
  )
    throw new DomainError("invalid_profile");
  if (
    !["male", "female"].includes(p.sex) ||
    !(p.activity_level in ACTIVITY_FACTORS) ||
    !["lose", "maintain"].includes(p.goal) ||
    !["en", "es"].includes(p.language) ||
    !["omnivore", "vegetarian", "vegan", "pescatarian"].includes(p.diet)
  )
    throw new DomainError("invalid_profile");
}
export function restingEnergy(
  p: Pick<Profile, "weight_kg" | "height_cm" | "age" | "sex">,
): number {
  const value = new Decimal(p.weight_kg)
    .mul(10)
    .plus(new Decimal(p.height_cm).mul(6.25))
    .minus(p.age * 5)
    .plus(p.sex === "male" ? 5 : -161);
  if (!value.isFinite() || value.lte(0))
    throw new DomainError("invalid_profile");
  return value.toNumber();
}
export function proposeTarget(p: Profile, today: string): Proposal {
  validateProfile(p);
  const resting = new Decimal(restingEnergy(p));
  const usual = resting.mul(ACTIVITY_FACTORS[p.activity_level]);
  let deficit = new Decimal(0);
  if (p.goal === "lose") {
    if (!valid(p.target_weight_kg ?? NaN))
      throw new DomainError("invalid_goal");
    if (p.target_weight_kg! >= p.weight_kg)
      throw new DomainError("goal_reached");
    let days: number;
    try {
      days = daysBetween(today, p.target_date ?? "");
    } catch {
      throw new DomainError("invalid_goal");
    }
    if (days <= 0) throw new DomainError("deadline_expired");
    const loss = new Decimal(p.weight_kg).minus(p.target_weight_kg!);
    if (loss.mul(7).div(days).gt(1)) throw new DomainError("goal_too_fast");
    deficit = loss.mul(7700).div(days);
  }
  const target = usual.minus(deficit);
  if (target.lte(1200)) throw new DomainError("target_too_low");
  return {
    resting_kcal: resting.toNumber(),
    usual_kcal: usual.toNumber(),
    deficit_kcal: deficit.toNumber(),
    daily_kcal: target.toNumber(),
  };
}
export function validateBudgets(budgets: Budgets): void {
  if (
    !["breakfast", "lunch", "dinner"].every((key) =>
      valid(budgets[key as keyof Budgets]),
    )
  )
    throw new DomainError("invalid_budgets");
}
export function expenditure(p: Profile, entries: DailyEntry[]): number {
  const resting = new Decimal(restingEnergy(p));
  const activities = entries.filter((x) => x.kind === "activity");
  if (!activities.length)
    return resting.mul(ACTIVITY_FACTORS[p.activity_level]).toNumber();
  const minutes = activities.reduce((sum, x) => sum + x.value, 0);
  if (
    minutes > 1440 ||
    activities.some(
      (x) => !valid(x.value) || x.met === null || !Number.isFinite(x.met),
    )
  )
    throw new DomainError("invalid_activity");
  return activities
    .reduce(
      (sum, x) =>
        sum.plus(
          new Decimal(Math.max(x.met! - 1, 0))
            .mul(p.weight_kg)
            .mul(x.value)
            .div(60),
        ),
      resting.mul(1.2),
    )
    .toNumber();
}
export function daySummary(
  p: Profile,
  entries: DailyEntry[],
  meals: MealSummary[],
) {
  const intake = meals
    .reduce((sum, x) => sum.plus(x.kcal), new Decimal(0))
    .plus(
      entries
        .filter((x) => x.kind === "food")
        .reduce((sum, x) => sum.plus(x.value), new Decimal(0)),
    );
  const burned = expenditure(p, entries);
  return {
    intake: intake.toNumber(),
    expenditure: burned,
    deficit: new Decimal(burned).minus(intake).toNumber(),
    complete: new Set(meals.map((x) => x.type)).size === 3,
    activity_override: entries.some((x) => x.kind === "activity"),
  };
}
export function roundQuantity(quantity: number, unitStep?: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new DomainError("invalid_quantity");
  const step = new Decimal(unitStep ?? (quantity >= 10 ? 10 : 1));
  if (!step.isFinite() || step.lte(0))
    throw new DomainError("invalid_quantity");
  const rounded = new Decimal(quantity)
    .div(step)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .mul(step);
  if (rounded.eq(0)) throw new DomainError("quantity_needs_review");
  return rounded.toNumber();
}
