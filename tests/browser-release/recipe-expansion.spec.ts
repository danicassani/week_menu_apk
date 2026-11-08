import { test } from "@playwright/test";
import { recipeExpansionScenario } from "../scenarios/recipe-expansion";
for (const language of ["en", "es"] as const)
  test(`${language}: sourced recipes show provenance and quantity estimates on a phone`, async ({
    page,
  }, info) => {
    await recipeExpansionScenario(
      page,
      language,
      info.outputPath(`sourced-recipe-${language}.png`),
    );
  });
