import Decimal from "decimal.js";
import { DomainError, roundQuantity, roundWeight } from "./calories";
import { dayCutoff } from "./dates";
import { targetOn } from "./state";
import {
  recalculateLines,
  type MealPlan,
  type PlannedPortion,
} from "./planning";
import type { HouseholdState, MealType } from "./types";

export interface PortionAdjustment {
  day: string;
  type: MealType;
  member_id: string;
  member_name: string;
  before: PlannedPortion;
  after: PlannedPortion;
}
export interface PortionRecalculation {
  revision: number;
  plans: MealPlan[];
  changes: PortionAdjustment[];
  roundingLimited: number;
}

/** Uses one coherent household snapshot; never changes recipes or composition. */
export function recalculatePlannedPortions(
  state: HouseholdState,
  days: readonly string[],
  onlyMember?: string,
): PortionRecalculation {
  const lib = state.planning;
  if (!lib) throw new DomainError("planning_update_unavailable");
  const selected = new Set(days),
    now = Date.parse(state.server_now);
  const active = state.members.filter((m) => m.status === "active");
  const result: PortionRecalculation = {
    revision: lib.revision,
    plans: [],
    changes: [],
    roundingLimited: 0,
  };
  for (const plan of lib.plans) {
    if (
      !selected.has(plan.day) ||
      state.meal_locks.some((l) => l.day === plan.day && l.closed) ||
      !active.length ||
      active.some((m) => now >= Date.parse(dayCutoff(plan.day, m.time_zone)))
    )
      continue;
    const start = result.changes.length;
    const portions = plan.portions.map((original) => {
      if (
        original.eating_out ||
        (onlyMember && original.member_id !== onlyMember)
      )
        return original;
      const member = active.find(
        (m) => m.id === original.member_id && m.onboarded,
      );
      if (!member?.profile) throw new DomainError("invalid_member");
      const budget =
        state.budget_overrides.find(
          (b) =>
            b.member_id === member.id &&
            b.day === plan.day &&
            b.meal_type === plan.type,
        )?.kcal ??
        targetOn(state, member.id, plan.day)?.budgets[plan.type] ??
        0;
      if (!Number.isFinite(budget) || budget <= 0)
        throw new DomainError("invalid_budgets");
      if (!original.lines.length) throw new DomainError("missing_nutrition");
      for (const line of original.lines) {
        const food = lib.ingredients.find((f) => f.id === line.ingredient_id);
        if (!food) throw new DomainError("missing_nutrition");
        if (
          !food.dietary_patterns.includes(member.profile.diet) ||
          member.profile.excluded_ingredients.includes(food.id)
        )
          throw new DomainError("diet_conflict");
      }
      const current = recalculateLines(
        { ...original, budget },
        lib.ingredients,
      );
      let next = current;
      if (Math.round(current.kcal) !== Math.round(budget)) {
        if (!Number.isFinite(current.kcal) || current.kcal <= 0)
          throw new DomainError("missing_nutrition");
        const factor = new Decimal(budget).div(current.kcal);
        const lines = current.lines.map((line) => {
          const conversion = lib.ingredients
            .find((f) => f.id === line.ingredient_id)!
            .conversions.find((c) => c.unit === line.unit);
          const scaled = new Decimal(line.quantity).mul(factor).toNumber();
          const quantity =
            line.unit === "kg" || line.unit === "l"
              ? roundWeight(scaled * 1000) / 1000
              : line.unit === "g" || line.unit === "ml"
                ? roundWeight(scaled)
                : roundQuantity(
                    Math.max(scaled, conversion?.quantity_step ?? 1),
                    conversion?.quantity_step ?? 1,
                  );
          return { ...line, quantity };
        });
        const candidate = recalculateLines(
          { ...current, lines },
          lib.ingredients,
        );
        if (
          new Decimal(candidate.kcal)
            .minus(budget)
            .abs()
            .lt(new Decimal(current.kcal).minus(budget).abs())
        )
          next = candidate;
      }
      const warnings = new Set([
        ...next.warnings,
        ...original.warnings.filter((w) => w !== "over_budget"),
      ]);
      if (original.substitutions.length && !original.variant_id)
        warnings.add("review_substitutions");
      next = { ...next, warnings: [...warnings] };
      if (Math.round(next.kcal) !== Math.round(budget))
        result.roundingLimited++;
      if (
        original.budget === next.budget &&
        original.kcal === next.kcal &&
        JSON.stringify(original.lines) === JSON.stringify(next.lines) &&
        JSON.stringify(original.warnings) === JSON.stringify(next.warnings)
      )
        return original;
      result.changes.push({
        day: plan.day,
        type: plan.type,
        member_id: original.member_id,
        member_name: member.name,
        before: original,
        after: next,
      });
      return next;
    });
    if (result.changes.length > start) result.plans.push({ ...plan, portions });
  }
  return result;
}
