import { it, expect } from "vitest";
import { ingredients, recipes } from "../src/lib/content";
import {
  substitutionText,
  ingredientNames,
  ingredientText,
  ingredientMatches,
  recipePresentation,
  recipeServingCaption,
} from "../src/domain/content-presentation";
import type { Ingredient, PlannedRecipe } from "../src/domain/planning";
import labels from "../content/presentation/ingredient-names.json";

it("projects only exact starter names independently by language, preserving names, identity and nutrition", () => {
  const before = structuredClone(ingredients);
  for (const [id, entry] of Object.entries(labels)) {
    const food = ingredients.find((i) => i.id === id)!;
    expect(food.name).toEqual(entry.source_name);
    expect(ingredientNames(food)).toEqual(entry.name);
    expect(
      ingredientNames({
        ...food,
        name: { ...food.name, en: "My own raw eggs" },
      }),
    ).toEqual({ en: "My own raw eggs", es: entry.name.es });
    expect(ingredientNames({ ...food, id: "private-item" })).toEqual(food.name);
    expect(ingredientMatches(food, entry.name.en)).toBe(true);
    expect(ingredientMatches(food, entry.source_name.es)).toBe(true);
  }
  const custom = {
    id: "sun-dried-tomatoes",
    name: { en: "Sun-dried tomatoes", es: "Tomates secos" },
  };
  expect(ingredientText(custom, "en")).toBe("Sun-dried tomatoes");
  expect(
    ingredientNames({
      ...custom,
      name: { en: "", es: "Mi ingrediente crudo" },
    }),
  ).toEqual({ en: "", es: "Mi ingrediente crudo" });
  expect(ingredientNames({ ...custom, id: "__proto__" })).toEqual(custom.name);
  expect(ingredientNames({ ...custom, id: "constructor" })).toEqual(
    custom.name,
  );
  expect(ingredients).toEqual(before);
});
it("hides known boilerplate while preserving private methods, notes, reference quantities and source snapshots", () => {
  const before = structuredClone(recipes);
  for (const source of recipes) {
    const shown = recipePresentation(source as PlannedRecipe);
    expect(shown.ingredient_preparation).toEqual([]);
    expect(shown.reference_servings).toBe(source.reference_servings);
    expect(shown.components.map((c) => c.ingredients)).toEqual(
      source.components.map((c) => c.ingredients),
    );
    for (const component of shown.components)
      for (const step of component.instructions) {
        expect(step.en).not.toMatch(
          /using (its|their full|the separate).*instructions/,
        );
        expect(step.es).not.toContain("instrucciones de preparación");
      }
  }
  const original = recipes[0] as PlannedRecipe;
  const custom = {
    ...structuredClone(original),
    ingredient_preparation: [
      {
        ingredient_id: "chickpeas",
        instructions: { en: "Family preparation note", es: "Nota familiar" },
      },
    ],
  };
  custom.components[0].instructions = [
    { en: "Our own method, weigh dry", es: "Nuestro método" },
  ];
  expect(recipePresentation(custom).ingredient_preparation).toEqual(
    custom.ingredient_preparation,
  );
  expect(recipePresentation(custom).components[0].instructions).toEqual(
    custom.components[0].instructions,
  );
  expect(recipeServingCaption(1, "en")).toBe("Ingredients for 1 person");
  expect(recipeServingCaption(4, "en")).toBe("Ingredients for 4 people");
  expect(recipeServingCaption(1, "es")).toBe("Ingredientes para 1 persona");
  expect(recipeServingCaption(4, "es")).toBe("Ingredientes para 4 personas");
  const privateCopy = { ...structuredClone(original), id: "private-recipe" };
  expect(recipePresentation(privateCopy)).toBe(privateCopy);
  expect(recipes).toEqual(before);
});

it("shows only named substitutions in both languages, including custom ingredients", () => {
  const items = [
    { id: "custom-chicken", name: { en: "Chicken", es: "Pollo" } },
    { id: "custom-tofu", name: { en: "Tofu", es: "Tofu" } },
  ];
  const swap = {
    from: "custom-chicken",
    to: "custom-tofu",
    instructions: {
      en: "Omit frying raw chicken.",
      es: "Omite freír pollo crudo.",
    },
  };
  expect(substitutionText(swap, items, "es")).toBe("Sustituye Pollo por Tofu.");
  expect(substitutionText(swap, items, "en")).toBe(
    "Replace Chicken with Tofu.",
  );
  expect(swap.instructions.es).toContain("freír");
});
