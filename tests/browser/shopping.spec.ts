import { test, expect } from "@playwright/test";
test("saved portions automatically generate an upcoming list and retain manual checked items", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
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
    includeHidden: true,
  });
  await manual.click();
  await expect(manual).toBeChecked();
  await expect(manual).not.toBeVisible();
  const purchased = page.locator(".shopping-purchased details");
  await expect(purchased).not.toHaveAttribute("open");
  await expect(purchased.locator("summary")).toHaveText("Purchased 1");
  await purchased.locator("summary").click();
  await expect(manual).toBeVisible();
  await manual.click();
  await expect(manual).not.toBeChecked();
  await expect(page.locator(".shopping-purchased")).toHaveCount(0);
  await expect(manual).toBeVisible();
  await manual.click();
  await expect(manual).toBeChecked();
  await expect(manual).not.toBeVisible();
  await purchased.locator("summary").click();

  await expect(page.locator(".sync-status")).toContainText("Connected");
  await expect(page.getByLabel("From", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("All upcoming meals", { exact: true }),
  ).toBeVisible();
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

test("an empty week clears the generated shopping list and stays empty after reload", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const nav = () => page.getByRole("navigation", { name: "Main navigation" });
  await nav().getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  await nav().getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeEnabled();
  await nav().getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Delete week", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete editable meals", exact: true })
    .click();
  await nav().getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.reload();
  await nav().getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByLabel("From", { exact: true })).toHaveCount(0);
});

test("the visible shopping list drops expired quantities at midnight", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-03T23:59:00Z") });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeEnabled();
  const before = await page
    .locator(".shopping-checklist label")
    .allTextContents();
  await page.clock.fastForward(61_000);
  await expect
    .poll(() => page.locator(".shopping-checklist label").allTextContents())
    .not.toEqual(before);
  await expect(
    page.getByRole("button", { name: "Apply date range", exact: true }),
  ).toHaveCount(0);
});
