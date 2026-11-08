import { test } from "@playwright/test";
import { versionFourScenario } from "../scenarios/version-4";
for (const language of ["en", "es"] as const)
  test(`${language}: quiet V4 actions and allocation bar`, async ({
    page,
  }, info) => {
    test.setTimeout(45000);
    await versionFourScenario(page, language, (name) => info.outputPath(name));
  });
