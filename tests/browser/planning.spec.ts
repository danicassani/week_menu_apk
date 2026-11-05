import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
});
test("re-rolls an own breakfast in preview, automatically fills shopping and deletes the accepted week", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Suggest the week", exact: true })
    .click();
  const cards = page.locator(".preview-meal");
  const breakfast = cards
    .filter({
      has: page.getByRole("button", {
        name: "Re-roll my breakfast",
        exact: true,
      }),
    })
    .first();
  const before = await cards.allTextContents();
  const noa = await breakfast.locator(":scope > div").last().textContent();
  await breakfast
    .getByRole("button", { name: "Re-roll my breakfast", exact: true })
    .click();
  const after = await cards.allTextContents();
  expect(after.filter((text, i) => text !== before[i])).toHaveLength(1);
  expect(await breakfast.locator(":scope > div").last().textContent()).toBe(
    noa,
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Approve suggestions & save" })
    .click();
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Apply reviewed changes" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Product", { exact: true })
    .fill("Keep this manual item");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Delete week", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete editable meals", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(
    page.getByText("Keep this manual item", { exact: true }),
  ).toBeVisible();
});
test("preview and commit a menu, replace one participant with eating out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Suggest the week", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review your menu suggestions" }),
  ).toBeVisible();
  await expect(page.locator(".preview-meal")).not.toHaveCount(0);
  await page
    .getByRole("button", { name: "Approve suggestions & save" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review meal", exact: true })
    .first()
    .click();
  const participant = page.locator(".portion-editor").first();
  await participant
    .getByRole("checkbox", { name: "Eating out for this person" })
    .check();
  await participant
    .getByLabel("Description · required")
    .fill("Lunch at the bar");
  await expect(
    page.getByRole("button", { name: "Save this meal only", exact: true }),
  ).toBeDisabled();
  await participant.getByLabel("Estimated calories · required").fill("530");
  await page
    .getByRole("button", { name: "Save this meal only", exact: true })
    .click();
  await expect(
    page.getByText("Lunch at the bar", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-results/planner-desktop.png",
    fullPage: true,
  });
});
test("create ingredient and confirm a household piece conversion", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
  await page.getByRole("button", { name: "Ingredients & units" }).click();
  await page
    .getByRole("button", { name: "New ingredient", exact: true })
    .click();
  await page
    .getByLabel("English name", { exact: true })
    .fill("Test household egg");
  await page.getByLabel("Energy · kcal per 100 g").fill("140");
  await page
    .getByRole("button", { name: "Add conversion", exact: true })
    .click();
  const row = page.locator(".conversion-row").last();
  await row.getByLabel("Unit", { exact: true }).fill("egg");
  await row.getByLabel("Grams per unit", { exact: true }).fill("55");
  await row.getByLabel("Quantity step", { exact: true }).fill("0.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search collection" })
    .fill("Test household egg");
  await page.getByRole("button", { name: /Test household egg/ }).click();
  await expect(
    page.getByLabel("Grams per unit", { exact: true }).last(),
  ).toHaveValue("55");
});
test("create a recipe on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
  await page.getByRole("button", { name: "New recipe", exact: true }).click();
  await page
    .getByLabel("English name", { exact: true })
    .fill("Household porridge");
  await page
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await page.getByLabel("Ingredient", { exact: true }).selectOption("oats");
  await page.getByLabel("Quantity", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search collection" })
    .fill("Household porridge");
  await expect(
    page.getByRole("button", { name: /Household porridge/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
