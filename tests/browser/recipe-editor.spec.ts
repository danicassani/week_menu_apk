import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
});
const stored = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("week-menu-demo-server")!),
  );
const references = (components: any[]) =>
  components.flatMap((c) =>
    c.ingredients.map((l: any) => ({
      component: c.id,
      id: l.ingredient_id,
      quantity: l.quantity,
      unit: l.unit,
    })),
  );
test("editing a shared preparation preserves reference amounts and saved meals and creates a distinct method revision", async ({
  page,
}) => {
  const before = await stored(page),
    original = before.library.recipes.find((r: any) => r.id === "m26");
  await page
    .getByRole("searchbox", { name: "Search collection", exact: true })
    .fill(original.name.en);
  await page.locator(".recipe-card").click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(page.getByLabel("Component type", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Component name", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Ingredient", { exact: true })).toHaveCount(10);
  const common = page.getByRole("region", {
    name: "Vegetables and seasoning",
    exact: true,
  });
  await expect(common.getByLabel("Ingredient", { exact: true })).toHaveCount(6);
  await common
    .getByRole("textbox", { name: "Step 1", exact: true })
    .fill(
      "Cook the vegetables until tender, then season with the measured ingredients.",
    );
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await stored(page),
    saved = after.library.recipes.find((r: any) => r.id === "m26");
  expect(references(saved.components)).toEqual(references(original.components));
  expect(after.library.plans).toEqual(before.library.plans);
  const prep = saved.recipe_model.variants[0].preparations[0];
  expect(prep.id).not.toBe(
    original.recipe_model.variants[0].preparations[0].id,
  );
  expect(prep.batchable).toBe(false);
  await page.locator(".recipe-card").click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Step 1", exact: true }).first(),
  ).toHaveValue(
    "Cook the vegetables until tender, then season with the measured ingredients.",
  );
});
test("a new recipe keeps one name, simple authoring and an optional removable dessert", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New recipe", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Simple household dish");
  const dish = page.getByRole("region", { name: "Dish", exact: true });
  await dish
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await dish.getByLabel("Ingredient", { exact: true }).selectOption("tomato");
  await dish.getByLabel("Quantity", { exact: true }).fill("200");
  await dish
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Chop the tomato.");
  await page
    .getByRole("button", { name: "Add optional dessert", exact: true })
    .click();
  const dessert = page.getByRole("region", {
    name: "Optional dessert",
    exact: true,
  });
  await dessert
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await dessert.getByLabel("Ingredient", { exact: true }).selectOption("apple");
  await dessert.getByLabel("Quantity", { exact: true }).fill("100");
  await dessert
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Slice the apple.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = (await stored(page)).library.recipes.find(
    (r: any) => r.name.en === "Simple household dish",
  );
  expect(saved.components).toHaveLength(2);
  expect(saved.recipe_model.version).toBe(2);
  await page
    .getByRole("searchbox", { name: "Search collection", exact: true })
    .fill("Simple household dish");
  await page.locator(".recipe-card").click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(1);
  const options = dessert.locator("details").filter({
    has: page.locator("summary", { hasText: "Preparation options" }),
  });
  await options.locator(":scope > summary").click();
  await dessert
    .getByRole("button", { name: "Remove preparation", exact: true })
    .click();
  await expect(dessert).toHaveCount(0);
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const updated = (await stored(page)).library.recipes.find(
    (r: any) => r.id === saved.id,
  );
  expect(references(updated.components)).toEqual(
    references([saved.components[0]]),
  );
});
