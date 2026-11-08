import { test } from "@playwright/test";
import { upcomingShoppingScenario } from "../scenarios/upcoming-shopping";
for (const lang of ["en", "es"] as const)
  test(`${lang}: shopping combines future weeks and edits egg estimates`, async ({
    page,
  }, info) => {
    test.setTimeout(45000);
    await upcomingShoppingScenario(page, lang, (name) => info.outputPath(name));
  });
