import { test } from "@playwright/test";
import { historicalScenario } from "../scenarios/milestone-4";
for (const lang of ["en", "es"] as const)
  test(`${lang}: historical correction and confirmed erasure retain closed-day locks`, async ({
    page,
  }, info) => {
    await historicalScenario(
      page,
      lang,
      info.outputPath(`historical-${lang}.png`),
    );
  });
