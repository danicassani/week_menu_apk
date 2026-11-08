import { test, expect } from "@playwright/test";
import { recipeReviewScenario } from "../scenarios/recipe-review";
for (const language of ["en", "es"] as const)
  test(`${language}: review all pages, swipe, resume and restart without resetting vetoes`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await recipeReviewScenario(
      page,
      language,
      info.outputPath(`recipe-review-${language}.png`),
    );
  });
for (const language of ["en", "es"] as const)
  test(`${language}: ingredient selectors follow displayed alphabetical names`, async ({
    page,
  }, info) => {
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
    await page
      .getByRole("button", {
        name: t("Recipe Tinder", "Tinder de recetas"),
        exact: true,
      })
      .click();
    await expect(page.locator(".recipe-review-card")).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`recipe-tinder-${language}.png`),
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: t("Close", "Cerrar"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("New recipe", "Nueva receta"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: t("Add ingredient", "Añadir ingrediente"),
        exact: true,
      })
      .click();
    const labels = (
      await page
        .getByRole("combobox", {
          name: t("Ingredient", "Ingrediente"),
          exact: true,
        })
        .locator("option")
        .allTextContents()
    ).slice(1);
    expect(labels.length).toBeGreaterThan(50);
    expect(labels).toEqual(
      [...labels].sort(
        new Intl.Collator(language, { sensitivity: "base", numeric: true })
          .compare,
      ),
    );
  });
