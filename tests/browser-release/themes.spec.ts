import { test } from "@playwright/test";
import { themesScenario } from "../scenarios/themes";
for (const language of ["en", "es"] as const)
  test(`${language}: fourteen device themes, keyboard, large text and sign-out persistence`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await themesScenario(page, language, (name) => info.outputPath(name));
  });
