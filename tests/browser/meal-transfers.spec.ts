import { test, expect, type Page } from "@playwright/test";
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Main navigation" });
const day = (page: Page, label = "Tuesday 3 November") =>
  page
    .locator(".day-card")
    .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
async function menu(page: Page) {
  await nav(page).getByRole("button", { name: "Menu", exact: true }).click();
}
async function generate(page: Page) {
  await menu(page);
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
});
test("draft cross-person same-day swaps retain the rest of the draft; paste requires overwrite review", async ({
  page,
}) => {
  await generate(page);
  const breakfast = page.locator(".preview-meal").first(),
    portions = breakfast.locator(".preview-portion");
  const before = await portions
    .locator(".suggested-recipe-link")
    .allTextContents();
  await portions
    .nth(0)
    .getByRole("button", { name: "Swap suggestion", exact: true })
    .click();
  await portions
    .nth(1)
    .getByRole("button", { name: "Swap breakfast here for Noa", exact: true })
    .click();
  expect(
    await portions.locator(".suggested-recipe-link").allTextContents(),
  ).toEqual([before[1], before[0]]);
  await portions
    .nth(0)
    .getByRole("button", { name: "Copy breakfast for Alex", exact: true })
    .click();
  await portions
    .nth(1)
    .getByRole("button", { name: "Paste breakfast for Noa", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review pasted meal" });
  await expect(
    review.getByText(/This replaces the existing meal/),
  ).toBeVisible();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await portions.locator(".suggested-recipe-link").allTextContents(),
  ).toEqual([before[1], before[0]]);
  await portions
    .nth(1)
    .getByRole("button", { name: "Paste breakfast for Noa", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Replace and paste", exact: true })
    .click();
  expect(
    await portions.locator(".suggested-recipe-link").allTextContents(),
  ).toEqual([before[1], before[1]]);
  await save(page);
});
test("saved breakfast swap across members is reviewed and atomic", async ({
  page,
}) => {
  await generate(page);
  await save(page);
  const breakfast = day(page).locator(".meal-card").first();
  const alex = await breakfast.locator(".meal-recipe-link").innerText();
  await breakfast
    .getByRole("button", { name: "Swap breakfast", exact: true })
    .click();
  await page.getByLabel("View household member").selectOption("noa");
  const noa = await breakfast.locator(".meal-recipe-link").innerText();
  await breakfast
    .getByRole("button", { name: "Swap breakfast here for Noa", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review meal swap" });
  await expect(review.getByText("Noa", { exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Apply swap", exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(breakfast.locator(".meal-recipe-link")).toHaveText(alex);
  await page.getByLabel("View household member").selectOption("alex");
  await expect(breakfast.locator(".meal-recipe-link")).toHaveText(noa);
});
test("clipboard survives tabs and weeks, pastes repeatedly, confirms replacement and clears on reload", async ({
  page,
}) => {
  await generate(page);
  await save(page);
  const source = day(page).locator(".meal-card").first(),
    name = await source.locator(".meal-recipe-link").innerText();
  await source
    .getByRole("button", { name: "Copy breakfast for Alex", exact: true })
    .click();
  await nav(page).getByRole("button", { name: "Recipes", exact: true }).click();
  await menu(page);
  await expect(
    page.getByRole("button", { name: "Cancel transfer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  const target = day(page, "Monday 9 November").locator(".meal-card").first();
  await target
    .getByRole("button", { name: "Paste breakfast for Alex", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review pasted meal" });
  await expect(
    review.getByRole("button", { name: "Paste meal", exact: true }),
  ).toBeVisible();
  await review.getByRole("button", { name: "Paste meal", exact: true }).click();
  await expect(target.locator(".meal-recipe-link")).toHaveText(name);
  await target
    .getByRole("button", { name: "Paste breakfast for Alex", exact: true })
    .click();
  await expect(
    review.getByRole("button", { name: "Replace and paste", exact: true }),
  ).toBeVisible();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(target.locator(".meal-recipe-link")).toHaveText(name);
  const second = day(page, "Tuesday 10 November").locator(".meal-card").first();
  await second
    .getByRole("button", { name: "Paste breakfast for Alex", exact: true })
    .click();
  await review.getByRole("button", { name: "Paste meal", exact: true }).click();
  await expect(second.locator(".meal-recipe-link")).toHaveText(name);
  await page.reload();
  await menu(page);
  await expect(
    page.getByRole("button", { name: "Paste breakfast for Alex", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cancel transfer", exact: true }),
  ).toHaveCount(0);
});
test("catalogue right-click and keyboard actions copy to the selected week; ordinary clicks still read", async ({
  page,
}) => {
  await menu(page);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await nav(page).getByRole("button", { name: "Recipes", exact: true }).click();
  const card = page.locator(".recipe-card").first(),
    title = await card.locator("h3").innerText();
  await card.click({ button: "right" });
  const context = page.getByRole("dialog");
  await expect(
    context.getByRole("button", { name: "View recipe", exact: true }),
  ).toBeVisible();
  await context
    .getByRole("button", { name: "Copy to menu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Monday 9 November", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".planning-clipboard")).toContainText(
    title.replace(/^\S+\s/, ""),
  );
  await page
    .getByRole("button", { name: "Cancel transfer", exact: true })
    .click();
  await nav(page).getByRole("button", { name: "Recipes", exact: true }).click();
  await card.click();
  await expect(
    page.getByText("Ingredients for 1 person", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await card.focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    context.getByRole("button", { name: "Copy to menu", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await card.click();
  await page.getByRole("button", { name: "Copy to menu", exact: true }).click();
  await expect(page.locator(".planning-clipboard")).toBeVisible();
});
test("touch press opens context without opening the reader; movement and scrolling cancel it", async ({
  page,
}) => {
  await nav(page).getByRole("button", { name: "Recipes", exact: true }).click();
  const card = page.locator(".recipe-card").first();
  const touch = {
    pointerType: "touch",
    isPrimary: true,
    pointerId: 1,
    clientX: 100,
    clientY: 200,
  };
  await card.dispatchEvent("pointerdown", touch);
  await card.dispatchEvent("pointermove", { ...touch, clientY: 220 });
  await page.waitForTimeout(550);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.dispatchEvent("pointerdown", touch);
  await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
  await page.waitForTimeout(550);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.dispatchEvent("pointerdown", touch);
  await expect(
    page.getByRole("button", { name: "Copy to menu", exact: true }),
  ).toBeVisible();
  await card.dispatchEvent("pointerup", touch);
  await card.dispatchEvent("click");
  await expect(
    page.getByRole("button", { name: "Edit recipe", exact: true }),
  ).toHaveCount(0);
});
test("moving the last draft portion into an empty slot removes the saved source on approval", async ({
  page,
}) => {
  await menu(page);
  const source = day(page).locator(".meal-card").nth(1);
  await source.getByRole("button", { name: "Suggest", exact: true }).click();
  await save(page);
  await source
    .getByRole("button", { name: "Preview another recipe", exact: true })
    .click();
  const preview = page.locator(".preview-meal");
  await expect(preview).toHaveCount(1);
  const names = await preview
    .locator(".suggested-recipe-link")
    .allTextContents();
  await preview
    .getByRole("button", { name: "Swap suggestion", exact: true })
    .click();
  const destination = page
    .locator(".transfer-empty-row")
    .filter({ hasText: "Wednesday · Dinner" });
  await destination
    .getByRole("button", { name: "Swap here", exact: true })
    .click();
  await expect(preview).toHaveCount(1);
  await expect(
    preview.getByRole("heading", { name: "Wednesday · Dinner", exact: true }),
  ).toBeVisible();
  await save(page);
  await expect(source.locator(".meal-recipe-link")).toHaveCount(0);
  await expect(
    source.getByRole("button", { name: "Suggest", exact: true }),
  ).toBeVisible();
  const target = day(page, "Wednesday 4 November").locator(".meal-card").nth(2);
  await expect(target.locator(".meal-recipe-link")).toHaveText(names[0]);
});
test("a rejected draft paste explains the conflict inside the open suggestion dialog", async ({
  page,
}) => {
  await generate(page);
  const meals = page.locator(".preview-meal").filter({
    has: page.getByRole("button", { name: "Re-roll meal", exact: true }),
  });
  await meals
    .nth(0)
    .getByRole("button", { name: "Copy meal", exact: true })
    .click();
  const before = await meals
    .nth(1)
    .locator(".suggested-recipe-link")
    .allTextContents();
  await meals
    .nth(1)
    .getByRole("button", { name: "Paste meal", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review your menu suggestions",
  });
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(
    await meals.nth(1).locator(".suggested-recipe-link").allTextContents(),
  ).toEqual(before);
  await expect(
    page.getByRole("dialog", { name: "Review pasted meal" }),
  ).toHaveCount(0);
});
