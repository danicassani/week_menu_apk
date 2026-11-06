import type { HouseholdState, MealType } from "./types";
import { targetOn } from "./state";
import {
  makePortion,
  varietyConflict,
  type MealPlan,
  type PlanningState,
} from "./planning";
export const slotKey = (m: Pick<MealPlan, "day" | "type">) =>
  `${m.day}/${m.type}`;
export const lockKey = (m: Pick<MealPlan, "day" | "type">, member?: string) =>
  `${slotKey(m)}/${m.type === "breakfast" ? member : "shared"}`;
export function replan(
  source: MealPlan,
  day: string,
  type: MealType,
  state: HouseholdState,
  lib: PlanningState,
  onlyMember?: string,
) {
  const gaps: string[] = [];
  const portions = state.members
    .filter(
      (m) =>
        m.status === "active" &&
        m.onboarded &&
        m.profile &&
        (!onlyMember || m.id === onlyMember),
    )
    .flatMap((member) => {
      const old = source.portions.find((p) => p.member_id === member.id);
      const id =
        type !== "breakfast"
          ? (source.shared_recipe_id ??
            source.portions.find((p) => p.recipe_id)?.recipe_id)
          : (old?.recipe_id ?? old?.underlying_recipe_id);
      const recipe = lib.recipes.find(
        (r) => r.id === id && !r.archived && r.meal_types.includes(type),
      );
      try {
        if (!recipe) throw Error("missing_recipe");
        const budget =
          state.budget_overrides.find(
            (b) =>
              b.member_id === member.id &&
              b.day === day &&
              b.meal_type === type,
          )?.kcal ??
          targetOn(state, member.id, day)?.budgets[type] ??
          0;
        if (!(budget > 0)) throw Error("missing_budget");
        return [
          makePortion(
            recipe,
            member.id,
            member.profile!,
            budget,
            old?.dessert ?? false,
            lib.ingredients,
            lib.substitutions,
          ),
        ];
      } catch {
        gaps.push(`${day} · ${type} · ${member.name}`);
        return [];
      }
    });
  return {
    plan: {
      day,
      type,
      revision: 0,
      shared_recipe_id:
        type === "breakfast"
          ? null
          : (source.shared_recipe_id ??
            portions.find((p) => p.recipe_id)?.recipe_id ??
            null),
      portions,
    } as MealPlan,
    gaps,
  };
}
export function swapDraft(
  plans: MealPlan[],
  a: MealPlan,
  b: MealPlan,
  state: HouseholdState,
  lib: PlanningState,
  locks: string[],
) {
  if (a === b || (a.type === "breakfast") !== (b.type === "breakfast"))
    throw Error("invalid_recipe");
  const own = state.viewer_id;
  if (locks.includes(lockKey(a, own)) || locks.includes(lockKey(b, own)))
    throw Error("locked_suggestion");
  const first = replan(
      b,
      a.day,
      a.type,
      state,
      lib,
      a.type === "breakfast" ? own : undefined,
    ),
    second = replan(
      a,
      b.day,
      b.type,
      state,
      lib,
      a.type === "breakfast" ? own : undefined,
    );
  if (first.gaps.length || second.gaps.length)
    throw Error("no_suitable_recipe");
  const replace = (original: MealPlan, next: MealPlan) =>
    a.type !== "breakfast"
      ? next
      : {
          ...original,
          portions: original.portions.map((p) =>
            p.member_id === own
              ? next.portions.find((q) => q.member_id === own)!
              : p,
          ),
        };
  if (
    a.type === "breakfast" &&
    (!first.plan.portions.some((p) => p.member_id === own) ||
      !second.plan.portions.some((p) => p.member_id === own))
  )
    throw Error("no_suitable_recipe");
  const result = plans.map((p) =>
    p === a ? replace(a, first.plan) : p === b ? replace(b, second.plan) : p,
  );
  const retained = lib.plans.filter(
    (p) => !result.some((r) => slotKey(r) === slotKey(p)),
  );
  if (
    result.some((p) =>
      varietyConflict(
        p,
        [...retained, ...result.filter((x) => x !== p)],
        state.household.variety_days,
      ),
    )
  )
    throw Error("variety_conflict");
  return result;
}
