import Decimal from "decimal.js";
import definitions from "../../content/preparations/recipe-models.json" with { type: "json" };
import starter from "../../content/starter/recipes.json" with { type: "json" };
import expansion from "../../content/expansions/requested-recipes.json" with { type: "json" };
import { DomainError } from "./calories";
import type {
  Ingredient,
  MealPlan,
  Names,
  PlannedPortion,
  PlannedRecipe,
  PortionLine,
  RecipeComponent,
  RecipeIngredient,
} from "./planning";
import type { Profile } from "./types";

export interface PreparationLine extends RecipeIngredient {
  component_id: string;
  order: number;
}
/** Embedded, immutable preparation revision. Reusing it copies this revision;
 * editing a recipe never changes other recipes or saved meals implicitly. */
export interface Preparation {
  id: string;
  revision: number;
  name: Names;
  optional: boolean;
  default_included: boolean;
  lines: PreparationLine[];
  instructions: Names[];
  batchable: boolean;
  soak: boolean;
}
export interface RecipeVariant {
  id: string;
  name: Names;
  substitutions: PlannedPortion["substitutions"];
  preparations: Preparation[];
}
export interface RecipeModel {
  /** Legacy editor compatibility seal; omitted from personal meal snapshots. */
  legacy_components?: RecipeComponent[];
  legacy_name?: Names;
  version: 2;
  default_variant_id: string;
  variants: RecipeVariant[];
}
const seeds = [...starter.recipes, ...expansion.recipes];
/** Only unchanged bundled recipes receive editorial metadata. No inference from
 * household instructions and no retroactive changes to stored snapshots. */
export function withRecipeModel(recipe: PlannedRecipe): PlannedRecipe {
  if (recipe.recipe_model) return recipe;
  const seed = seeds.find((r) => r.id === recipe.id);
  if (
    !seed ||
    JSON.stringify(seed.name) !== JSON.stringify(recipe.name) ||
    seed.reference_servings !== recipe.reference_servings ||
    JSON.stringify(seed.components) !== JSON.stringify(recipe.components)
  )
    return recipe;
  const model = (definitions as unknown as Record<string, RecipeModel>)[
    recipe.id
  ];
  return { ...recipe, recipe_model: structuredClone(model) };
}
export function simpleRecipeModel(recipe: PlannedRecipe): RecipeModel {
  return {
    version: 2,
    legacy_components: structuredClone(recipe.components),
    legacy_name: { ...recipe.name },
    default_variant_id: "original",
    variants: [
      {
        id: "original",
        name: recipe.name,
        substitutions: [],
        preparations: recipe.components.map((c) => ({
          id: `${recipe.id}-${c.id}`,
          revision: (recipe.revision ?? 0) + 1,
          name: c.name,
          optional: c.optional,
          default_included: c.default_included,
          lines: c.ingredients.map((l, order) => ({
            ...l,
            component_id: c.id,
            order,
          })),
          instructions: c.instructions,
          batchable: false,
          soak: false,
        })),
      },
    ],
  };
}
export function variantComponents(
  recipe: PlannedRecipe,
  variant: RecipeVariant,
): RecipeComponent[] {
  const components = new Map<string, RecipeComponent>();
  for (const prep of variant.preparations)
    for (const l of prep.lines) {
      let component = components.get(l.component_id);
      if (!component) {
        const old = recipe.components.find((c) => c.id === l.component_id);
        component = {
          id: l.component_id,
          kind: prep.optional
            ? "dessert"
            : old?.kind === "dessert"
              ? "main"
              : (old?.kind ?? "main"),
          name: prep.name,
          optional: prep.optional,
          default_included: prep.default_included,
          ingredients: [],
          instructions: [],
        };
        components.set(l.component_id, component);
      }
      component.ingredients.push(l);
    }
  for (const component of components.values()) {
    component.ingredients.sort(
      (a, b) => (a as PreparationLine).order - (b as PreparationLine).order,
    );
    component.instructions = variant.preparations
      .filter((p) => p.lines.some((l) => l.component_id === component.id))
      .flatMap((p) => p.instructions);
  }
  return [...components.values()].sort(
    (a, b) =>
      recipe.components.findIndex((c) => c.id === a.id) -
      recipe.components.findIndex((c) => c.id === b.id),
  );
}
export function compatibleVariant(
  variant: RecipeVariant,
  profile: Profile,
  ingredients: Ingredient[],
  dessert: boolean,
) {
  return variant.preparations
    .filter((p) => !p.optional || dessert)
    .flatMap((p) => p.lines)
    .every((l) => {
      const food = ingredients.find((f) => f.id === l.ingredient_id);
      return (
        food &&
        !food.archived &&
        food.dietary_patterns.includes(profile.diet) &&
        !profile.excluded_ingredients.includes(food.id)
      );
    });
}
export function selectVariant(
  recipe: PlannedRecipe,
  profile: Profile,
  ingredients: Ingredient[],
  dessert: boolean,
  preferred?: string,
): RecipeVariant | undefined {
  const model = recipe.recipe_model;
  if (!model) return undefined;
  const choices = [...model.variants].sort((a, b) => {
    const rank = (v: RecipeVariant) =>
      v.id === preferred
        ? -2
        : v.id === model.default_variant_id
          ? -1
          : v.substitutions.length;
    return rank(a) - rank(b) || a.id.localeCompare(b.id);
  });
  return choices.find((v) =>
    compatibleVariant(v, profile, ingredients, dessert),
  );
}
export function savedVariant(
  portion: PlannedPortion,
): RecipeVariant | undefined {
  return portion.recipe_snapshot?.recipe_model?.variants.find(
    (v) => v.id === portion.variant_id,
  );
}
export function validateRecipeModel(recipe: PlannedRecipe) {
  const model = recipe.recipe_model;
  if (!model) return;
  if (
    model.version !== 2 ||
    !model.variants.length ||
    !model.variants.some((v) => v.id === model.default_variant_id) ||
    new Set(model.variants.map((v) => v.id)).size !== model.variants.length
  )
    throw new DomainError("invalid_recipe_model");
  for (const variant of model.variants) {
    const keys = new Set<string>();
    if (
      !variant.id ||
      !variant.preparations.length ||
      new Set(variant.preparations.map((p) => p.id)).size !==
        variant.preparations.length
    )
      throw new DomainError("invalid_recipe_model");
    for (const prep of variant.preparations) {
      if (
        !prep.id ||
        !Number.isInteger(prep.revision) ||
        prep.revision < 1 ||
        !prep.lines.length ||
        !Array.isArray(prep.instructions) ||
        typeof prep.batchable !== "boolean"
      )
        throw new DomainError("invalid_recipe_model");
      for (const line of prep.lines) {
        const key = `${line.component_id}/${line.ingredient_id}`;
        if (
          keys.has(key) ||
          !line.component_id ||
          !line.ingredient_id ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0
        )
          throw new DomainError("invalid_recipe_model");
        keys.add(key);
      }
    }
  }
}
export interface ResolvedPreparation {
  preparation: Preparation;
  lines: PortionLine[];
}
export function portionPreparations(
  portion: PlannedPortion,
): ResolvedPreparation[] {
  if (portion.eating_out) return [];
  const variant = savedVariant(portion);
  if (variant)
    return variant.preparations
      .map((preparation) => ({
        preparation,
        lines: portion.lines.filter((l) =>
          preparation.lines.some(
            (r) =>
              r.component_id === l.component_id &&
              r.ingredient_id === l.ingredient_id,
          ),
        ),
      }))
      .filter((p) => p.lines.length);
  // Legacy snapshots remain readable without inventing shared cooking methods.
  return [...new Set(portion.lines.map((l) => l.component_id))].map((id) => {
    const c = portion.recipe_snapshot?.components.find((c) => c.id === id);
    const lines = portion.lines.filter((l) => l.component_id === id);
    return {
      lines,
      preparation: {
        id: `legacy-${portion.recipe_id}-${id}-${JSON.stringify(portion.substitutions)}`,
        revision: portion.recipe_snapshot?.revision ?? 1,
        name: c?.name ?? portion.name,
        optional: c?.kind === "dessert",
        default_included: !!c?.default_included,
        lines: lines.map((l, order) => ({ ...l, order })),
        instructions: c?.instructions ?? [],
        batchable: false,
        soak: false,
      },
    };
  });
}
export function preparationScope(preparation: Preparation): string {
  const method = preparation.instructions
    .map(
      (s) =>
        `${Array.from(s.en ?? "").length}:${s.en ?? ""}${Array.from(s.es ?? "").length}:${s.es ?? ""}`,
    )
    .join("");
  return `preparation:${preparation.id}:${preparation.revision}:${method}`;
}
export interface HouseholdPreparation {
  id: string;
  scope: string;
  name: Names;
  instructions: Names[];
  lines: PortionLine[];
  shares: { member_id: string; lines: PortionLine[]; grams: number }[];
  proportional: boolean;
}
const foodKey = (l: PortionLine) =>
  JSON.stringify([
    l.ingredient_id,
    l.reference_state,
    l.quantity_basis,
    l.nutrition_revision,
    l.energy_per_100g,
  ]);
export function householdPreparations(plan: MealPlan): HouseholdPreparation[] {
  const groups = new Map<string, HouseholdPreparation>();
  for (const p of plan.portions)
    for (const { preparation, lines } of portionPreparations(p)) {
      const key = JSON.stringify([
        preparationScope(preparation),
        preparation.instructions,
        lines.map(foodKey).sort(),
      ]);
      const group = groups.get(key) ?? {
        id: key,
        scope: preparationScope(preparation),
        name: preparation.name,
        instructions: preparation.instructions,
        lines: [],
        shares: [],
        proportional: true,
      };
      group.shares.push({
        member_id: p.member_id,
        lines,
        grams: lines.reduce(
          (s, l) => new Decimal(s).plus(l.grams).toNumber(),
          0,
        ),
      });
      for (const line of lines) {
        const total = group.lines.find((l) => foodKey(l) === foodKey(line));
        if (!total) group.lines.push({ ...line });
        else {
          const sameUnit = total.unit === line.unit;
          total.grams = new Decimal(total.grams).plus(line.grams).toNumber();
          total.kcal = new Decimal(total.kcal).plus(line.kcal).toNumber();
          total.quantity = sameUnit
            ? new Decimal(total.quantity).plus(line.quantity).toNumber()
            : total.grams;
          if (!sameUnit) {
            total.unit = "g";
            total.grams_per_unit = 1;
          }
        }
      }
      groups.set(key, group);
    }
  for (const group of groups.values()) {
    const total = group.shares.reduce((s, p) => s + p.grams, 0);
    group.proportional = group.lines.every((line) =>
      group.shares.every((share) => {
        const amount = share.lines
          .filter((l) => foodKey(l) === foodKey(line))
          .reduce((s, l) => s + l.grams, 0);
        return Math.abs(amount / line.grams - share.grams / total) < 1e-9;
      }),
    );
  }
  return [...groups.values()];
}

/** Whole-dish preference only applies when every included preparation is eligible. */
export function batchPreparations(
  portion: PlannedPortion,
  preferWhole: boolean,
): ResolvedPreparation[] {
  const parts = portionPreparations(portion).filter(
    (p) => !p.preparation.optional,
  );
  if (
    preferWhole &&
    parts.length > 1 &&
    parts.every((p) => p.preparation.batchable)
  ) {
    return [
      {
        preparation: {
          id: `whole-${portion.recipe_id}-${portion.variant_id}`,
          revision: portion.recipe_snapshot?.revision ?? 1,
          name: portion.name,
          optional: false,
          default_included: true,
          lines: parts.flatMap((p) => p.preparation.lines),
          instructions: parts.flatMap((p) => p.preparation.instructions),
          batchable: true,
          soak: parts.some((p) => p.preparation.soak),
        },
        lines: parts.flatMap((p) => p.lines),
      },
    ];
  }
  return parts.filter((p) => p.preparation.batchable);
}
