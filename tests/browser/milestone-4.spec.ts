import { test } from "@playwright/test";
import { historicalScenario } from "../scenarios/milestone-4";
for (const lang of ["en", "es"] as const)
  test(`${lang}: historical correction and confirmed erasure retain closed-day locks`, async ({
    page,
  }, info) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 390, height: 844 });
    await historicalScenario(
      page,
      lang,
      info.outputPath(`historical-${lang}.png`),
    );
  });
