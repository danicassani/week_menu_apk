import { expect, type Page } from "@playwright/test";
export async function recipeExpansionScenario(
  page: Page,
  language: "en" | "es",
  screenshot: string,
) {
  const t = (en: string, es: string) => (language === "en" ? en : es);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Good to see you, Alex.",
      exact: true,
    }),
  ).toBeVisible();
  if (language === "es")
    await page
      .getByRole("button", { name: "Switch language", exact: true })
      .click();
  await page
    .getByRole("navigation", {
      name: t("Mobile navigation", "Navegación móvil"),
    })
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .click();
  const query = page.getByRole("searchbox", {
    name: t("Search collection", "Buscar en la colección"),
  });
  await query.fill("Banana bread");
  await page.getByRole("button", { name: /Banana bread/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Banana bread",
    exact: true,
  });
  await expect(
    dialog.getByText(
      t("Source & quantity estimates", "Fuente y cantidades estimadas"),
      { exact: true },
    ),
  ).toBeVisible();
  await expect(dialog.locator(".source-quantities")).not.toBeVisible();
  await dialog.locator(".recipe-source-details summary").click();
  const source = dialog.locator(".recipe-source-details");
  await expect(source.getByRole("link")).toHaveAttribute(
    "href",
    "https://www.bbcgoodfood.com/recipes/brilliant-banana-loaf",
  );
  await expect(source).toContainText("2 large eggs → 120 g");
  await expect(source).toContainText(t("estimate", "estimación"));
  await expect(source).toContainText("2357");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: screenshot,
  });
  await page.keyboard.press("Escape");
  await query.fill("Verduras al horno");
  await page
    .getByRole("button", {
      name: /Verduras al horno|Roasted potato, sweet potato/,
    })
    .click();
  await page.locator(".recipe-source-details summary").click();
  await expect(page.getByRole("dialog")).toContainText(
    t("User-approved adaptation", "Adaptación autorizada"),
  );
}
