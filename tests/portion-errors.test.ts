import { expect, it } from "vitest";
import {
  makePortion,
  type Ingredient,
  type PlannedRecipe,
} from "../src/domain/planning";
import { PortionError } from "../src/domain/portion-error";
import { errorMessage } from "../src/lib/i18n";
import { ingredients, recipes } from "../src/lib/content";
import rules from "../content/starter/substitutions.json";
const substitutions = rules.rules;
import type { Profile } from "../src/domain/types";
const original = recipes.find((r) => r.id === "m26")! as PlannedRecipe;
const recipe = {
  ...original,
  components: [
    {
      ...original.components[0],
      ingredients: [{ ingredient_id: "turkey", quantity: 100, unit: "g" }],
    },
  ],
};
const profile = {
  name: "Noa",
  diet: "vegetarian",
  excluded_ingredients: [],
} as unknown as Profile;
function failed(
  p = profile,
  foods = ingredients as Ingredient[],
  rules = substitutions,
) {
  try {
    makePortion(recipe, "noa", p, 450, false, foods, rules);
  } catch (e) {
    expect(e).toBeInstanceOf(PortionError);
    return e as PortionError;
  }
  throw new Error("Expected a portion failure");
}
it("names the person, recipe, incompatible ingredient and missing recipe-specific substitution", () => {
  const e = failed(profile, ingredients as Ingredient[], []);
  expect(e.context.reason).toBe("incompatible_diet");
  for (const lang of ["en", "es"] as const) {
    const text = errorMessage(e, lang);
    expect(text).toContain("Noa");
    expect(text).toContain(recipe.name[lang]);
    expect(text).toContain(
      lang === "es" ? "dieta vegetariana" : "vegetarian diet",
    );
    expect(text).toContain(
      lang === "es" ? "Carne blanca de pavo" : "Turkey light meat",
    );
    expect(text).not.toMatch(/Add more recipes|Añade más recetas/);
  }
});
it("distinguishes an explicit exclusion from a dietary incompatibility", () => {
  const e = failed(
    { ...profile, diet: "omnivore", excluded_ingredients: ["turkey"] },
    ingredients as Ingredient[],
    [],
  );
  expect(e.context.reason).toBe("excluded_ingredient");
  expect(errorMessage(e, "es")).toContain("está excluido en su perfil");
  expect(errorMessage(e, "es")).not.toContain("dieta vegetariana");
});
it.each(["excluded", "archived", "missing", "diet"] as const)(
  "explains why a configured substitute is %s",
  (reason) => {
    const p = {
      ...profile,
      excluded_ingredients: reason === "excluded" ? ["tofu"] : [],
    };
    const foods = (ingredients as Ingredient[]).flatMap((i) =>
      i.id !== "tofu"
        ? [i]
        : reason === "missing"
          ? []
          : [
              {
                ...i,
                archived: reason === "archived",
                dietary_patterns:
                  reason === "diet"
                    ? ["omnivore" as const]
                    : i.dietary_patterns,
              },
            ],
    );
    const e = failed(p, foods);
    expect(
      e.context.alternatives?.some(
        (a) => a.ingredient.id === "tofu" && a.reason === reason,
      ),
    ).toBe(true);
    expect(errorMessage(e, "es")).toContain("sustituciones configuradas");
    expect(errorMessage(e, "es")).toContain(
      reason === "excluded"
        ? "excluido"
        : reason === "archived"
          ? "archivado"
          : reason === "missing"
            ? "no está en el catálogo"
            : "dieta vegetariana",
    );
  },
);
it.each(["missing", "archived", "nutrition"] as const)(
  "identifies the precise ingredient when %s",
  (reason) => {
    const foods = (ingredients as Ingredient[]).flatMap((i) =>
      i.id !== "turkey"
        ? [i]
        : reason === "missing"
          ? []
          : [
              {
                ...i,
                archived: reason === "archived",
                nutrition_per_100g:
                  reason === "nutrition"
                    ? { energy_kcal: null }
                    : i.nutrition_per_100g,
              },
            ],
    );
    const e = failed({ ...profile, diet: "omnivore" }, foods, []);
    expect(e.context.reason).toBe(
      reason === "missing"
        ? "missing_ingredient"
        : reason === "archived"
          ? "archived_ingredient"
          : "missing_nutrition",
    );
    expect(errorMessage(e, "es")).toContain("Noa");
    expect(errorMessage(e, "es")).not.toContain("Añade más recetas");
  },
);
it("keeps valid configured substitutions working", () => {
  const portion = makePortion(
    recipe,
    "noa",
    profile,
    450,
    false,
    ingredients as Ingredient[],
    substitutions,
  );
  expect(portion.substitutions).toMatchObject([{ from: "turkey", to: "tofu" }]);
});
it("does not invent an explanation for older server errors without details", () => {
  const text = errorMessage(new Error("no_suitable_recipe"), "es");
  expect(text).toContain("No se ha recibido el motivo concreto");
  expect(text).not.toContain("Añade más recetas");
  expect(errorMessage(new Error("recipe_vetoed"), "es")).toContain(
    "vetada en el hogar",
  );
});
