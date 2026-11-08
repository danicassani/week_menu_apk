import labels from "../../content/presentation/ingredient-names.json" with { type: "json" };
import recipeDisplay from "../../content/presentation/recipe-display.json" with { type: "json" };
import type { Names, PlannedRecipe } from "./planning";

type NamedIngredient = {
  id?: string;
  ingredient_id?: string | null;
  name: Names;
};
/** Read-only overlay: identity and each unchanged starter language must match. */
export function ingredientNames(item: NamedIngredient): Names {
  const id = item.ingredient_id ?? item.id ?? "";
  const entry = Object.hasOwn(labels, id)
    ? (labels as Record<string, { source_name: Names; name: Names }>)[id]
    : undefined;
  if (!entry) return item.name;
  return {
    en: item.name.en === entry.source_name.en ? entry.name.en : item.name.en,
    es: item.name.es === entry.source_name.es ? entry.name.es : item.name.es,
  };
}
export function ingredientText(item: NamedIngredient, language: "en" | "es") {
  const names = ingredientNames(item);
  return names[language] || names.en || names.es;
}
export function ingredientMatches(item: NamedIngredient, query: string) {
  const names = ingredientNames(item),
    q = query.toLocaleLowerCase();
  return [names.en, names.es, item.name.en, item.name.es].some((n) =>
    n.toLocaleLowerCase().includes(q),
  );
}

const same = (a: Names, b: Names) => a.en === b.en && a.es === b.es;
/** Hide only known starter boilerplate; preserve independently authored notes. */
export function recipePresentation(recipe: PlannedRecipe): PlannedRecipe {
  if (!recipeDisplay.recipe_ids.includes(recipe.id)) return recipe;
  return {
    ...recipe,
    ingredient_preparation: recipe.ingredient_preparation?.filter(
      (p) =>
        !recipeDisplay.notes.some(
          (s) =>
            s.ingredient_id === p.ingredient_id &&
            same(s.instructions, p.instructions),
        ),
    ),
    components: recipe.components.map((c) => ({
      ...c,
      instructions: c.instructions.map((step) => {
        const rule = recipeDisplay.steps.find(
          (r) =>
            r.targets.some(
              (target) =>
                target.recipe_id === recipe.id && target.component_id === c.id,
            ) && same(r.source, step),
        );
        return rule?.display ?? step;
      }),
    })),
  };
}
export function recipeServingCaption(count: number, language: "en" | "es") {
  return language === "es"
    ? `Ingredientes para ${count} ${count === 1 ? "persona" : "personas"}`
    : `Ingredients for ${count} ${count === 1 ? "person" : "people"}`;
}

export function sortedIngredients<T extends { id: string; name: Names }>(
  items: readonly T[],
  language: "en" | "es",
): T[] {
  const collator = new Intl.Collator(language, {
    sensitivity: "base",
    numeric: true,
  });
  return [...items].sort(
    (a, b) =>
      collator.compare(
        ingredientText(a, language),
        ingredientText(b, language),
      ) || a.id.localeCompare(b.id),
  );
}
