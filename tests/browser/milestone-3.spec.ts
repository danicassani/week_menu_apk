import { test, expect } from "@playwright/test";
import { allocationScenario } from "../scenarios/milestone-3";
for (const lang of ["en", "es"] as const)
  test(`${lang}: real serving allocations separate substitutions and identify avatar portions`, async ({
    page,
  }, info) => {
    await allocationScenario(
      page,
      lang,
      info.outputPath(`allocation-${lang}.png`),
    );
  });
test("activity type/intensity choices remember only saved code and keep recency local", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByLabel("Activity type").selectOption("walking");
  await page.getByLabel("Pace or intensity").selectOption("17190");
  await page.getByLabel("Duration · minutes").fill("30");
  await page.screenshot({ path: info.outputPath("activity-selectors.png") });
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith("week-menu:activity-recent:v1:"),
    ),
  );
  expect(stored).toHaveLength(1);
  expect(JSON.parse(stored[0][1])).toEqual({
    version: 1,
    type: "walking",
    code: "17190",
  });
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByLabel("Activity type")).toHaveValue("walking");
  await expect(page.getByLabel("Pace or intensity")).toHaveValue("17190");
  await page.getByLabel("Activity type").selectOption("cycling");
  await expect(page.getByLabel("Pace or intensity")).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByLabel("Activity type")).toHaveValue("walking");
});
test("whole catalogue pages have a footer create action and a distinct centered load-more plus", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ingredients & units", exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(50);
  const more = page.getByRole("button", {
    name: "Load 50 more ingredients",
    exact: true,
  });
  await more.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("catalogue-footer.png") });
  await expect(
    page
      .locator(".page-heading")
      .getByRole("button", { name: "New ingredient", exact: true }),
  ).toHaveCount(0);
  await more.click();
  expect(await page.locator(".recipe-card").count()).toBeGreaterThan(50);
});
test("calorie help works without an edit pencil and grouped week controls fit large text at 320px", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const help = page.getByRole("button", {
    name: "About planned calories",
    exact: true,
  });
  await expect(page.locator(".planning-note")).toHaveCount(0);
  await help.click();
  await expect(
    page.getByRole("dialog", { name: "About planned calories", exact: true }),
  ).toContainText("budgets are not consumed calories");
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  await page.getByLabel("View household member").selectOption("noa");
  await expect(
    page.getByRole("button", { name: "Adjust meal budgets", exact: true }),
  ).toHaveCount(0);
  await help.click();
  await expect(
    page.getByRole("dialog", { name: "About planned calories", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  await page.locator(".planner-controls").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("menu-320-large-text.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page
      .locator(".week-actions")
      .getByRole("button", { name: "Suggest week", exact: true }),
  ).toBeVisible();
});
