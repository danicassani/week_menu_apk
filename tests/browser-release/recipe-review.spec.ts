import { test } from "@playwright/test";
import { recipeReviewScenario } from "../scenarios/recipe-review";
for (const language of ["en", "es"] as const)
  test(`${language}: review all pages, swipe, resume and restart without resetting vetoes`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await recipeReviewScenario(
      page,
      language,
      info.outputPath(`recipe-review-${language}.png`),
    );
  });
