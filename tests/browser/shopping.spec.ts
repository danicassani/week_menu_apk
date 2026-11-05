import { test, expect } from "@playwright/test";
test("saved portions automatically generate a list; range changes retain manual checked items", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Suggest the week", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve suggestions & save" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeEnabled();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product", { exact: true }).fill("Kitchen towels");
  await page.getByLabel("Quantity or note · optional").fill("2 rolls");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  const manual = page.getByRole("checkbox", {
    name: "Kitchen towels · 2 rolls",
  });
  await manual.click();
  await expect(manual).toBeChecked();
  await expect(page.locator(".sync-status")).toContainText("Connected");
  await page.getByLabel("From", { exact: true }).fill("2026-11-09");
  await page.getByLabel("Through", { exact: true }).fill("2026-11-09");
  await page.getByRole("button", { name: "Apply date range" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(manual).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/shopping-mobile.png",
    fullPage: true,
  });
});
