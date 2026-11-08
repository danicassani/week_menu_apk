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
test("editing a legacy dish groups its sides while preserving ingredient references and planned meals", async ({
  page,
}) => {
  const before = await stored(page);
  const original = before.library.recipes.find((r: any) => r.id === "m26");
  await page
    .getByRole("searchbox", { name: "Search collection" })
    .fill("Turkey, spinach and quinoa bowl");
  await page
    .getByRole("button", { name: /Turkey, spinach and quinoa bowl/ })
    .click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  const dish = page.getByRole("region", { name: "Dish", exact: true });
  const dessert = page.getByRole("region", {
    name: "Optional dessert",
    exact: true,
  });
  await expect(page.getByLabel("Component type", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Component name", { exact: true })).toHaveCount(
    0,
  );
  await expect(dish.getByLabel("Ingredient", { exact: true })).toHaveCount(8);
  await expect(
    dish.getByLabel("Ingredient", { exact: true }).last(),
  ).toHaveValue("quinoa");
  await expect(dessert.getByLabel("Ingredient", { exact: true })).toHaveCount(
    2,
  );
  expect(
    await dish
      .getByRole("textbox", { name: "Instructions", exact: true })
      .inputValue(),
  ).toContain("Cook the weighed dry grain");
  await dish
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Cook the dish and its grain accompaniment together.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await stored(page);
  const saved = after.library.recipes.find((r: any) => r.id === "m26");
  expect(
    saved.components.map((c: any) => ({
      id: c.id,
      ingredients: c.ingredients,
    })),
  ).toEqual(
    original.components.map((c: any) => ({
      id: c.id,
      ingredients: c.ingredients,
    })),
  );
  expect(
    saved.components.find((c: any) => c.kind === "dessert").instructions,
  ).toEqual(
    original.components.find((c: any) => c.kind === "dessert").instructions,
  );
  expect(
    saved.components
      .filter((c: any) => c.kind !== "dessert")
      .flatMap((c: any) => c.instructions)
      .map((step: any) => step.es),
  ).toEqual(
    original.components
      .filter((c: any) => c.kind !== "dessert")
      .flatMap((c: any) => c.instructions)
      .map((step: any) => step.es),
  );
  expect(after.library.plans).toEqual(before.library.plans);
  await page
    .getByRole("button", { name: /Turkey, spinach and quinoa bowl/ })
    .click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Dish", exact: true })
      .getByRole("textbox", { name: "Instructions", exact: true }),
  ).toHaveValue(/^Cook the dish and its grain accompaniment together\.\n*$/);
});
test("a new recipe only asks for its name once and allows adding and removing an optional dessert", async ({
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
  await expect(
    page.getByRole("button", { name: "Add optional dessert", exact: true }),
  ).toHaveCount(0);
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
  expect(saved.components[0].name.en).toBe("Simple household dish");
  expect(saved.components[1]).toMatchObject({
    kind: "dessert",
    optional: true,
    default_included: false,
  });
  await page
    .getByRole("searchbox", { name: "Search collection" })
    .fill("Simple household dish");
  await page.getByRole("button", { name: /Simple household dish/ }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove dessert", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Optional dessert", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add optional dessert", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const updated = (await stored(page)).library.recipes.find(
    (r: any) => r.id === saved.id,
  );
  expect(updated.components).toEqual([saved.components[0]]);
});
