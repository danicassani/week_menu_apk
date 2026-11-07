import { test } from "@playwright/test";
import { allocationScenario } from "../scenarios/milestone-3";
for (const language of ["en", "es"] as const)
  test(`${language}: milestone-three planned allocations and catalogue copy`, async ({
    page,
  }, info) => {
    await allocationScenario(
      page,
      language,
      info.outputPath(`allocation-${language}.png`),
    );
  });
