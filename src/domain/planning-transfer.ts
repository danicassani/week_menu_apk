import { DomainError } from "./calories";
import { dayCutoff } from "./dates";
import {
  makePortion,
  type MealPlan,
  type PlanningState,
  type PlannedRecipe,
  type Names,
} from "./planning";
import { targetOn } from "./state";
import type { HouseholdState, MealType } from "./types";

export type MealEndpoint = { day: string; type: MealType; member_id?: string };
export type RecipeChoice = {
  recipe_id: string;
  revision: number;
  desserts: Record<string, boolean>;
};
export type PlanningClipboard = {
  choice: RecipeChoice;
  name: Names;
  origin?: { endpoint: MealEndpoint; context: string };
};
export type TransferRequest =
  | { mode: "paste"; target: MealEndpoint; choice: RecipeChoice }
  | { mode: "swap"; source: MealEndpoint; target: MealEndpoint };
export type TransferPreview = {
  revision: number;
  fingerprint: string;
  plans: MealPlan[];
  occupied: boolean;
};
export const endpointKey = (e: MealEndpoint) =>
  `${e.day}/${e.type}/${e.type === "breakfast" ? e.member_id : "shared"}`;
const key = (e: Pick<MealEndpoint, "day" | "type">) => `${e.day}/${e.type}`;
export function choiceFromRecipe(recipe: PlannedRecipe): RecipeChoice {
  if (recipe.archived) throw new DomainError("archived_ingredient");
  return { recipe_id: recipe.id, revision: recipe.revision ?? 1, desserts: {} };
}
export function choiceFromMeal(
  plan: MealPlan,
  ep: MealEndpoint,
  lib: PlanningState,
): RecipeChoice {
  const portions =
    ep.type === "breakfast"
      ? plan.portions.filter((p) => p.member_id === ep.member_id)
      : plan.portions;
  const id =
    ep.type === "breakfast"
      ? (portions[0]?.recipe_id ?? portions[0]?.underlying_recipe_id)
      : (plan.shared_recipe_id ??
        portions.find((p) => p.recipe_id || p.underlying_recipe_id)
          ?.recipe_id ??
        portions.find((p) => p.underlying_recipe_id)?.underlying_recipe_id);
  const recipe = lib.recipes.find((r) => r.id === id);
  if (!recipe) throw new DomainError("no_suitable_recipe");
  return {
    ...choiceFromRecipe(recipe),
    desserts: Object.fromEntries(portions.map((p) => [p.member_id, p.dessert])),
  };
}
export function endpointOccupied(plans: MealPlan[], ep: MealEndpoint) {
  const plan = plans.find((p) => key(p) === key(ep));
  return (
    !!plan &&
    (ep.type !== "breakfast"
      ? plan.portions.length > 0
      : plan.portions.some((p) => p.member_id === ep.member_id))
  );
}
export function endpointClosed(state: HouseholdState, ep: MealEndpoint) {
  return (
    state.meal_locks.some(
      (l) =>
        l.day === ep.day &&
        (l.closed || Date.parse(state.server_now) >= Date.parse(l.cutoff)),
    ) ||
    Date.parse(state.server_now) >=
      Math.min(
        ...state.members
          .filter((m) => m.status === "active")
          .map((m) => Date.parse(dayCutoff(ep.day, m.time_zone))),
      )
  );
}
function validateEndpoint(state: HouseholdState, ep: MealEndpoint) {
  if (
    !ep ||
    !/^\d{4}-\d{2}-\d{2}$/.test(ep.day) ||
    !["breakfast", "lunch", "dinner"].includes(ep.type)
  )
    throw new DomainError("invalid_recipe");
  if (endpointClosed(state, ep)) throw new DomainError("day_closed");
  if (
    ep.type === "breakfast" &&
    !state.members.some(
      (m) =>
        m.id === ep.member_id &&
        m.status === "active" &&
        m.onboarded &&
        m.profile,
    )
  )
    throw new DomainError("invalid_member");
  if (ep.type !== "breakfast" && ep.member_id)
    throw new DomainError("invalid_member");
}
export function buildTransfer(
  state: HouseholdState,
  lib: PlanningState,
  request: TransferRequest,
  plans = lib.plans,
  locks: string[] = [],
): TransferPreview {
  validateEndpoint(state, request.target);
  const target = request.target;
  const affected = [target];
  let incoming: RecipeChoice,
    reverse: RecipeChoice | null = null;
  if (request.mode === "swap") {
    validateEndpoint(state, request.source);
    if (
      endpointKey(request.source) === endpointKey(target) ||
      (request.source.type === "breakfast") !== (target.type === "breakfast")
    )
      throw new DomainError("invalid_recipe");
    const sourcePlan = plans.find((p) => key(p) === key(request.source));
    if (!sourcePlan || !endpointOccupied(plans, request.source))
      throw new DomainError("no_suitable_recipe");
    incoming = choiceFromMeal(sourcePlan, request.source, lib);
    if (endpointOccupied(plans, target))
      reverse = choiceFromMeal(
        plans.find((p) => key(p) === key(target))!,
        target,
        lib,
      );
    if (target.type === "breakfast") {
      incoming = {
        ...incoming,
        desserts: {
          [target.member_id!]:
            incoming.desserts[request.source.member_id!] ?? false,
        },
      };
      if (reverse)
        reverse = {
          ...reverse,
          desserts: {
            [request.source.member_id!]:
              reverse.desserts[target.member_id!] ?? false,
          },
        };
    }
    affected.push(request.source);
  } else incoming = request.choice;
  if (affected.some((e) => locks.includes(endpointKey(e))))
    throw new DomainError("locked_suggestion");
  const working = new Map<string, MealPlan>();
  for (const ep of affected)
    if (!working.has(key(ep)))
      working.set(
        key(ep),
        structuredClone(
          plans.find((p) => key(p) === key(ep)) ?? {
            day: ep.day,
            type: ep.type,
            revision: 0,
            shared_recipe_id: null,
            portions: [],
          },
        ),
      );
  const put = (ep: MealEndpoint, choice: RecipeChoice | null) => {
    const plan = working.get(key(ep))!;
    if (!choice) {
      plan.portions =
        ep.type === "breakfast"
          ? plan.portions.filter((p) => p.member_id !== ep.member_id)
          : [];
      if (ep.type !== "breakfast") plan.shared_recipe_id = null;
      return;
    }
    const recipe = lib.recipes.find(
      (r) => r.id === choice.recipe_id && !r.archived,
    );
    if (!recipe) throw new DomainError("archived_ingredient");
    if ((recipe.revision ?? 1) !== choice.revision)
      throw new DomainError("stale_content");
    if (!recipe.meal_types.includes(ep.type))
      throw new DomainError("invalid_recipe");
    const members = state.members.filter(
      (m) =>
        m.status === "active" &&
        m.onboarded &&
        m.profile &&
        (ep.type !== "breakfast" || m.id === ep.member_id),
    );
    if (!members.length) throw new DomainError("invalid_member");
    const portions = members.map((m) => {
      const budget =
        state.budget_overrides.find(
          (b) =>
            b.member_id === m.id && b.day === ep.day && b.meal_type === ep.type,
        )?.kcal ??
        targetOn(state, m.id, ep.day)?.budgets[ep.type] ??
        0;
      const dessert =
        choice.desserts[m.id] ??
        recipe.components.some(
          (c) => c.kind === "dessert" && c.optional && c.default_included,
        );
      return makePortion(
        recipe,
        m.id,
        m.profile!,
        budget,
        dessert,
        lib.ingredients,
        lib.substitutions,
      );
    });
    if (ep.type === "breakfast") {
      const oldIndex = plan.portions.findIndex(
        (p) => p.member_id === ep.member_id,
      );
      if (oldIndex < 0) plan.portions.push(portions[0]);
      else plan.portions[oldIndex] = portions[0];
    } else plan.portions = portions;
    plan.shared_recipe_id = ep.type === "breakfast" ? null : recipe.id;
  };
  put(target, incoming);
  if (request.mode === "swap") put(request.source, reverse);
  const changed = [...working.values()];
  const revision = lib.revision,
    occupied = endpointOccupied(plans, target);
  return {
    revision,
    occupied,
    plans: changed,
    fingerprint: JSON.stringify([revision, request, changed, occupied]),
  };
}
