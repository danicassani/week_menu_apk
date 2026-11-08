import { expect, it } from "vitest";
import base from "../content/starter/ingredients.json";
import pack from "../content/expansions/requested-recipes.json";
import rows from "../content/expansions/requested-cofid-rows.json";
import {
  makePortion,
  type Ingredient,
  type PlannedRecipe,
} from "../src/domain/planning";
import { recipeSource } from "../src/domain/recipe-source";
import { PreviewRepository } from "../src/lib/preview-repository";
const ingredients = [
  ...base.ingredients,
  ...pack.ingredients,
] as unknown as Ingredient[];
it("imports all 15 requested recipes with traceable bilingual content and complete nutrition", () => {
  expect(pack.recipes).toHaveLength(15);
  expect(new Set(ingredients.map((f) => f.id)).size).toBe(ingredients.length);
  for (const r of pack.recipes) {
    expect(r.name.en.length).toBeGreaterThan(0);
    expect(r.name.es.length).toBeGreaterThan(0);
    expect(recipeSource(r.source_recipe)?.url).toMatch(/^https:/);
    const quantified = r.components.flatMap((c) => c.ingredients);
    for (const line of quantified) {
      const reference = r.source_recipe.original_quantities.find(
        (q) => q.ingredient_id === line.ingredient_id,
      )!;
      expect(reference.normalized_g).toBe(line.quantity);
      expect(typeof reference.estimated).toBe("boolean");
      const f = ingredients.find((f) => f.id === line.ingredient_id)!;
      expect(f).toBeTruthy();
      expect(f.nutrition_per_100g.energy_kcal).toBeGreaterThanOrEqual(0);
      expect(f.conversions.find((c) => c.unit === line.unit)).toBeTruthy();
    }
    const energy = quantified.reduce(
      (s, l) =>
        s +
        (l.quantity *
          ingredients.find((f) => f.id === l.ingredient_id)!.nutrition_per_100g
            .energy_kcal!) /
          100,
      0,
    );
    expect(
      Math.abs(r.reference_energy_kcal.without_optional_dessert - energy),
    ).toBeLessThan(0.00501);
  }
});
it("retains exact CoFID evidence and distinguishes label data, estimates and the four-vegetable adaptation", () => {
  for (const food of pack.ingredients) {
    const source = food.source as Record<string, unknown>;
    if (source.dataset === "cofid_2021") {
      const row = (
        rows as Record<
          string,
          { proximates: { cells: Record<string, string> } }
        >
      )[source.food_code as string];
      expect(Number(row.proximates.cells.M)).toBe(
        food.nutrition_per_100g.energy_kcal,
      );
      expect(row.proximates.cells.B).toBe(source.original_name);
    } else expect(source.url).toMatch(/^https:/);
  }
  const veg = pack.recipes.find(
    (r) => r.id === "global_roasted_four_vegetables",
  )!;
  expect(
    veg.components[0].ingredients
      .filter((i) => i.ingredient_id !== "olive_oil")
      .map((i) => i.ingredient_id),
  ).toEqual(["potato", "sweet_potato", "onion", "sweetcorn_raw"]);
  expect(veg.source_recipe.changes?.en).toContain("User-approved adaptation");
  expect(
    veg.source_recipe.original_quantities.find(
      (q) => q.ingredient_id === "sweetcorn_raw",
    )?.estimated,
  ).toBe(true);
});
it("every new recipe produces personal portions and appears in the paginated preview catalogue", async () => {
  const repo = new PreviewRepository("UTC"),
    state = await repo.load("UTC");
  const member = state.members.find((m) => m.id === state.viewer_id)!;
  for (const recipe of pack.recipes)
    for (const budget of [300, 600, 900]) {
      const p = makePortion(
        recipe as unknown as PlannedRecipe,
        member.id,
        member.profile!,
        budget,
        false,
        state.planning!.ingredients,
        [],
      );
      expect(p.kcal).toBeGreaterThan(0);
      expect(Number.isFinite(p.kcal)).toBe(true);
    }
  const page = await repo.cataloguePage({
    kind: "recipe",
    query: "Banana bread",
    archived: false,
    cursor: null,
  });
  expect(page.items.some((r) => r.id === "global_banana_bread")).toBe(true);
});
it("source rendering rejects unsafe links and malformed metadata", () => {
  const s = pack.recipes[0].source_recipe;
  expect(recipeSource({ ...s, url: "javascript:alert(1)" })).toBeNull();
  expect(
    recipeSource({ ...s, url: "https://user:pass@example.com" }),
  ).toBeNull();
  expect(recipeSource({ ...s, quantity_notes: { en: {}, es: "" } })).toBeNull();
  expect(
    recipeSource({ ...s, original_quantities: [null, {}] })
      ?.original_quantities,
  ).toEqual([]);
});
