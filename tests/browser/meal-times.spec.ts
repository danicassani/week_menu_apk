import { test, expect } from "@playwright/test";
test("scheduled intake updates without reload and personal times survive reload", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-03T08:59:58Z") });
  await page.clock.pauseAt(new Date("2026-11-03T08:59:59Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await expect(
    page.getByText("0 kcal estimated intake, including logs", { exact: true }),
  ).toBeVisible();
  await page.clock.runFor(1100);
  await expect(
    page.getByText("400 kcal estimated intake, including logs", {
      exact: true,
    }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await page
    .getByRole("button", { name: "Open my profile", exact: true })
    .click();
  await page.getByLabel("Lunch time", { exact: true }).fill("09:00");
  await page.getByLabel("Dinner time", { exact: true }).fill("09:00");
  await page
    .getByRole("button", { name: "Save meal times", exact: true })
    .click();
  await expect(
    page.getByText("Meal times saved.", { exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByText("1700 kcal estimated intake, including logs", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("1700 kcal estimated intake, including logs", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open my profile", exact: true })
    .click();
  await expect(page.getByLabel("Lunch time", { exact: true })).toHaveValue(
    "09:00",
  );
  await page.setViewportSize({ width: 320, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
