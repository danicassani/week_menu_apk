import { test } from "@playwright/test";
import { recipeVetoScenario } from "../scenarios/recipe-veto";
for (const lang of ["en", "es"] as const)
  test(`${lang}: shared recipe veto stays readable and can be reversed`, async ({
    page,
  }, info) => {
    test.setTimeout(45000);
    await recipeVetoScenario(page, lang, info.outputPath(`veto-${lang}.png`));
  });
