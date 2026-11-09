import { PortionError, type PortionFailureReason } from "./portion-error";
import Decimal from "decimal.js";
import {
  DomainError,
  roundQuantity,
  roundWeight,
  exceedsDisplayedCalories,
} from "./calories";
import type { MealType, Profile } from "./types";
export type Names = { en: string; es: string };
export interface Ingredient {
  emoji?: string;
  quantity_basis?: string;
  shopping_policy?: string;
  id: string;
  name: Names;
  state: string;
  /** Legacy metadata, ignored by current planning. */
  variety_key?: string;
  dietary_patterns: string[];
  nutrition_per_100g: { energy_kcal: number | null };
  conversions: {
    unit: string;
    grams_per_unit: number;
    quantity_step?: number;
  }[];
  archived?: boolean;
  revision?: number;
  source?: unknown;
}
export interface RecipeIngredient {
  ingredient_id: string;
  quantity: number;
  unit: string;
  /** Legacy metadata, ignored by current planning. */
  variety_role?: string;
}
export interface RecipeComponent {
  id: string;
  kind: string;
  name: Names;
  optional: boolean;
  default_included: boolean;
  ingredients: RecipeIngredient[];
  instructions: Names[];
  reference_energy_kcal?: number;
}
export interface PlannedRecipe {
  banned?: boolean;
  veto_revision?: number;
  household_revision?: number;
  emoji?: string;
  id: string;
  name: Names;
  meal_types: string[];
  reference_servings: number;
  components: RecipeComponent[];
  archived?: boolean;
  revision?: number;
  ingredient_preparation?: { ingredient_id: string; instructions: Names }[];
  [key: string]: unknown;
}
export interface Substitution {
  from_ingredient_id: string;
  to_ingredient_id: string;
  initial_target_grams_per_source_gram: number;
  allowed_recipe_ids: string[];
  instruction_override: Names;
}
export interface PortionLine {
  reference_state?: string;
  quantity_basis?: string;
  shopping_policy?: string;
  ingredient_id: string;
  component_id: string;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  /** Legacy metadata, ignored by current planning. */
  variety_role?: string;
  name: Names;
  nutrition_revision: number;
  grams_per_unit: number;
  energy_per_100g: number;
  /** Legacy metadata, ignored by current planning. */
  variety_key?: string;
}
export interface PlannedPortion {
  underlying_recipe_id?: string | null;
  member_id: string;
  recipe_id: string | null;
  name: Names;
  dessert: boolean;
  eating_out: boolean;
  description?: string;
  kcal: number;
  budget: number;
  lines: PortionLine[];
  substitutions: { from: string; to: string; instructions: Names }[];
  /** Legacy metadata, ignored by current planning. */
  variety_keys?: string[];
  warnings: string[];
  recipe_snapshot?: PlannedRecipe;
}
export interface MealPlan {
  day: string;
  type: MealType;
  revision: number;
  shared_recipe_id: string | null;
  portions: PlannedPortion[];
}
export interface PlanningState {
  complete?: boolean;
  ratings?: {
    recipe_id: string;
    member_id: string;
    stars: number;
    mine?: boolean;
  }[];
  prompt_show_after?: string;
  ingredients: Ingredient[];
  recipes: PlannedRecipe[];
  substitutions: Substitution[];
  plans: MealPlan[];
  revision: number;
}
export function gramsFor(
  i: Ingredient,
  quantity: number,
  unit: string,
): number {
  const c = i.conversions.find((c) => c.unit === unit);
  if (
    !c ||
    !Number.isFinite(c.grams_per_unit) ||
    c.grams_per_unit <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  )
    throw new DomainError("missing_conversion");
  return new Decimal(quantity).mul(c.grams_per_unit).toNumber();
}
export function allowed(i: Ingredient, p: Profile) {
  return (
    i.dietary_patterns.includes(p.diet) &&
    !p.excluded_ingredients.includes(i.id)
  );
}
export function makePortion(
  recipe: PlannedRecipe,
  member_id: string,
  profile: Profile,
  budget: number,
  dessert: boolean,
  ingredients: Ingredient[],
  rules: Substitution[],
): PlannedPortion {
  if (recipe.archived || !Number.isFinite(budget) || budget <= 0)
    throw new DomainError("invalid_recipe");
  const failure = (
    code: string,
    reason: PortionFailureReason,
    ingredient: { id: string; name: Names },
    alternatives?: PortionError["context"]["alternatives"],
  ) =>
    new PortionError(code, {
      reason,
      member: profile.name || member_id,
      recipe: recipe.name,
      ingredient,
      diet: profile.diet,
      alternatives,
    });
  const chosen = recipe.components.filter(
    (c) => !c.optional || (c.kind === "dessert" ? dessert : c.default_included),
  );
  const substitutions: PlannedPortion["substitutions"] = [];
  const raw = chosen.flatMap((c) =>
    c.ingredients.map((line) => {
      let ingredient = ingredients.find((i) => i.id === line.ingredient_id),
        quantity = line.quantity,
        unit = line.unit;
      if (!ingredient || ingredient.archived)
        throw failure(
          "archived_ingredient",
          ingredient ? "archived_ingredient" : "missing_ingredient",
          ingredient ?? {
            id: line.ingredient_id,
            name: { en: line.ingredient_id, es: line.ingredient_id },
          },
        );
      if (!allowed(ingredient, profile)) {
        const rule = rules.find(
          (r) =>
            r.from_ingredient_id === ingredient!.id &&
            r.allowed_recipe_ids.includes(recipe.id) &&
            ingredients.some(
              (i) =>
                i.id === r.to_ingredient_id &&
                !i.archived &&
                allowed(i, profile),
            ),
        );
        if (!rule) {
          const alternatives = rules
            .filter(
              (r) =>
                r.from_ingredient_id === ingredient!.id &&
                r.allowed_recipe_ids.includes(recipe.id),
            )
            .map((r) => {
              const target = ingredients.find(
                (i) => i.id === r.to_ingredient_id,
              );
              const reason = !target
                ? "missing"
                : target.archived
                  ? "archived"
                  : profile.excluded_ingredients.includes(target.id)
                    ? "excluded"
                    : "diet";
              return {
                ingredient: target ?? {
                  id: r.to_ingredient_id,
                  name: { en: r.to_ingredient_id, es: r.to_ingredient_id },
                },
                reason,
              } as NonNullable<PortionError["context"]["alternatives"]>[number];
            });
          throw failure(
            "no_suitable_recipe",
            profile.excluded_ingredients.includes(ingredient.id)
              ? "excluded_ingredient"
              : "incompatible_diet",
            ingredient,
            alternatives,
          );
        }
        const original = ingredient;
        ingredient = ingredients.find((i) => i.id === rule.to_ingredient_id)!;
        quantity = new Decimal(gramsFor(original, quantity, unit))
          .mul(rule.initial_target_grams_per_source_gram)
          .toNumber();
        unit = "g";
        substitutions.push({
          from: original.id,
          to: ingredient.id,
          instructions: rule.instruction_override,
        });
      }
      const energy = ingredient.nutrition_per_100g.energy_kcal;
      if (energy === null || !Number.isFinite(energy) || energy < 0)
        throw failure("missing_nutrition", "missing_nutrition", ingredient);
      return { line, ingredient, quantity, unit, component_id: c.id, energy };
    }),
  );
  const total = raw.reduce(
    (sum, r) =>
      sum.plus(
        new Decimal(gramsFor(r.ingredient, r.quantity, r.unit))
          .mul(r.energy)
          .div(100),
      ),
    new Decimal(0),
  );
  if (total.lte(0)) throw new DomainError("missing_nutrition");
  const factor = new Decimal(budget).div(total),
    warnings: string[] = [];
  const lines = raw.map((r) => {
    const scaled = new Decimal(r.quantity).mul(factor).toNumber();
    const step = r.ingredient.conversions.find(
      (c) => c.unit === r.unit,
    )?.quantity_step;
    const quantity =
      r.unit === "kg" || r.unit === "l"
        ? roundWeight(scaled * 1000) / 1000
        : r.unit === "g" || r.unit === "ml"
          ? roundWeight(scaled)
          : roundQuantity(scaled, step ?? 1);
    const grams = gramsFor(r.ingredient, quantity, r.unit),
      kcal = new Decimal(grams).mul(r.energy).div(100).toNumber();
    return {
      reference_state: r.ingredient.state,
      quantity_basis: r.ingredient.quantity_basis ?? "edible_reference_weight",
      shopping_policy: r.ingredient.shopping_policy ?? "include",
      ingredient_id: r.ingredient.id,
      component_id: r.component_id,
      quantity,
      unit: r.unit,
      grams,
      kcal,
      name: r.ingredient.name,
      nutrition_revision: r.ingredient.revision ?? 1,
      grams_per_unit: r.ingredient.conversions.find((c) => c.unit === r.unit)!
        .grams_per_unit,
      energy_per_100g: r.energy,
    };
  });
  const kcal = lines
    .reduce((s, l) => s.plus(l.kcal), new Decimal(0))
    .toNumber();
  if (exceedsDisplayedCalories(kcal, budget)) warnings.push("over_budget");
  if (substitutions.length) warnings.push("review_substitutions");
  return {
    member_id,
    recipe_id: recipe.id,
    name: recipe.name,
    dessert,
    eating_out: false,
    kcal,
    budget,
    lines,
    substitutions,
    warnings,
    recipe_snapshot: structuredClone(recipe),
  };
}
export function recalculateLines(
  portion: PlannedPortion,
  ingredients: Ingredient[],
): PlannedPortion {
  const lines = portion.lines.map((l) => {
    const i = ingredients.find((i) => i.id === l.ingredient_id);
    if (!i) throw new DomainError("missing_nutrition");
    const grams = gramsFor(i, l.quantity, l.unit),
      energy = i.nutrition_per_100g.energy_kcal;
    if (energy === null) throw new DomainError("missing_nutrition");
    return {
      ...l,
      reference_state: i.state,
      quantity_basis: i.quantity_basis ?? "edible_reference_weight",
      shopping_policy: i.shopping_policy ?? "include",
      name: i.name,
      grams,
      kcal: new Decimal(grams).mul(energy).div(100).toNumber(),
      grams_per_unit: i.conversions.find((c) => c.unit === l.unit)!
        .grams_per_unit,
      energy_per_100g: energy,
      nutrition_revision: i.revision ?? 1,
    };
  });
  const kcal = lines
    .reduce((s, l) => s.plus(l.kcal), new Decimal(0))
    .toNumber();
  return {
    ...portion,
    lines,
    kcal,
    warnings: exceedsDisplayedCalories(kcal, portion.budget)
      ? ["over_budget"]
      : [],
  };
}
