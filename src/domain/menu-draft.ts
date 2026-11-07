import { buildTransfer } from "./planning-transfer";
import type { HouseholdState, MealType } from "./types";
import { targetOn } from "./state";
import { makePortion, type MealPlan, type PlanningState } from "./planning";
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
  breakfastMember = state.viewer_id,
  targetMember = breakfastMember,
) {
  const source = {
    day: a.day,
    type: a.type,
    ...(a.type === "breakfast" ? { member_id: breakfastMember } : {}),
  };
  const target = {
    day: b.day,
    type: b.type,
    ...(b.type === "breakfast" ? { member_id: targetMember } : {}),
  };
  const result = buildTransfer(
    state,
    lib,
    { mode: "swap", source, target },
    plans,
    locks,
  );
  const keys = new Set(result.plans.map(slotKey));
  return plans.map((p) =>
    keys.has(slotKey(p))
      ? result.plans.find((q) => slotKey(q) === slotKey(p))!
      : p,
  );
}
