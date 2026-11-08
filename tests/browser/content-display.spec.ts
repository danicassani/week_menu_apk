import { test } from "@playwright/test";
import { contentDisplayScenario } from "../scenarios/content-display";
for (const language of ["en", "es"] as const)
  test(`${language}: V4 ingredient labels and recipe presentation preserve private edits`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await contentDisplayScenario(
      page,
      language,
      info.outputPath(`content-${language}.png`),
    );
  });
