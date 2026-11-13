import { targetOn } from "./state";
import { dayAt } from "./dates";
import type { Budgets, HouseholdState, MealType, Proposal } from "./types";
import { recalculatePlannedPortions } from "./recalculate-portions";
/** A personal date override affects only this member and the edited meal slots. */
export function budgetImpact(
  state: HouseholdState,
  day: string,
  changes: Partial<Record<MealType, number | null>>,
) {
  const projected = structuredClone(state);
  projected.budget_overrides = projected.budget_overrides.filter(
    (b) =>
      !(
        b.member_id === state.viewer_id &&
        b.day === day &&
        Object.hasOwn(changes, b.meal_type)
      ),
  );
  for (const [type, kcal] of Object.entries(changes))
    if (kcal !== null)
      projected.budget_overrides.push({
        member_id: state.viewer_id,
        day,
        meal_type: type as MealType,
        kcal: kcal!,
      });
  const draft = recalculatePlannedPortions(projected, [day], state.viewer_id);
  draft.changes = draft.changes.filter(
    (c) => c.member_id === state.viewer_id && Object.hasOwn(changes, c.type),
  );
  draft.plans = draft.plans
    .filter((p) =>
      draft.changes.some((c) => c.day === p.day && c.type === p.type),
    )
    .map((p) => ({
      ...p,
      portions: p.portions.map((portion) =>
        portion.member_id === state.viewer_id
          ? portion
          : state
              .planning!.plans.find(
                (x) => x.day === p.day && x.type === p.type,
              )!
              .portions.find((x) => x.member_id === portion.member_id)!,
      ),
    }));
  return draft;
}

/** A new accepted default applies from today; explicit date overrides still win. */
export function targetBudgetImpact(
  state: HouseholdState,
  budgets: Budgets,
  proposal: Proposal,
) {
  const projected = structuredClone(state);
  const member = state.members.find((m) => m.id === state.viewer_id)!;
  const today = dayAt(state.server_now, member.time_zone);
  projected.targets = projected.targets.filter(
    (t) => t.member_id !== member.id || t.effective_date !== today,
  );
  projected.targets.push({
    id: "pending-target",
    member_id: member.id,
    effective_date: today,
    created_at: state.server_now,
    daily_kcal: proposal.daily_kcal,
    resting_kcal: proposal.resting_kcal,
    usual_kcal: proposal.usual_kcal,
    deficit_kcal: proposal.deficit_kcal,
    budgets,
    inputs: member.profile!,
  });
  if (projected.planning) {
    const budgetAt = (s: HouseholdState, day: string, type: MealType) =>
      s.budget_overrides.find(
        (b) =>
          b.member_id === member.id && b.day === day && b.meal_type === type,
      )?.kcal ?? targetOn(s, member.id, day)?.budgets[type];
    projected.planning.plans = projected.planning.plans.filter(
      (p) =>
        budgetAt(state, p.day, p.type) !== budgetAt(projected, p.day, p.type),
    );
  }
  return recalculatePlannedPortions(
    projected,
    [
      ...new Set(
        projected.planning?.plans
          .filter((p) => p.day >= today)
          .map((p) => p.day) ?? [],
      ),
    ],
    member.id,
  );
}

/** Mirrors the server's quantity-only composition guard for the demo transaction. */
export function quantityPlanSignature(plan: import("./planning").MealPlan) {
  const normalize = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(normalize)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, v]) => [key, normalize(v)]),
          )
        : value;
  const portions = plan.portions
    .map((p) => {
      const {
        lines,
        budget: _budget,
        kcal: _kcal,
        warnings: _warnings,
        ...rest
      } = p;
      return {
        ...rest,
        lines: lines
          .map((l) => {
            const { quantity: _q, grams: _g, kcal: _k, ...line } = l;
            return line;
          })
          .sort((a, b) =>
            (a.component_id + a.ingredient_id).localeCompare(
              b.component_id + b.ingredient_id,
            ),
          ),
      };
    })
    .sort((a, b) => a.member_id.localeCompare(b.member_id));
  return JSON.stringify(normalize([plan.shared_recipe_id, portions]));
}
