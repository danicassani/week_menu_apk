import { it, expect } from "vitest";
import {
  sortedIngredients,
  ingredientText,
} from "../src/domain/content-presentation";
import { ingredients } from "../src/lib/content";
it("orders displayed ingredient names by locale without mutating catalogue order", () => {
  const original = ingredients.map((i) => i.id);
  for (const language of ["en", "es"] as const) {
    const sorted = sortedIngredients(ingredients, language),
      labels = sorted.map((i) => ingredientText(i, language));
    const collator = new Intl.Collator(language, {
      sensitivity: "base",
      numeric: true,
    });
    expect(labels).toEqual([...labels].sort(collator.compare));
  }
  expect(ingredients.map((i) => i.id)).toEqual(original);
  const custom = [
    { id: "n", name: { en: "Ñame", es: "Ñame" } },
    { id: "a", name: { en: "almond", es: "Almendra" } },
    { id: "z", name: { en: "Zucchini", es: "Zanahoria" } },
  ];
  expect(sortedIngredients(custom, "es").map((i) => i.id)).toEqual([
    "a",
    "n",
    "z",
  ]);
});
