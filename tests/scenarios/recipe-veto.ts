import { expect, type Page } from "@playwright/test";
export async function recipeVetoScenario(
  page: Page,
  lang: "en" | "es",
  capture: string,
) {
  const t = (en: string, es: string) => (lang === "en" ? en : es);
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  if (lang === "es")
    await page
      .getByRole("button", { name: "Switch language", exact: true })
      .click();
  const nav = page.getByRole("navigation", {
    name: t("Mobile navigation", "Navegación móvil"),
  });
  const title = t(
    "Apple and ginger porridge",
    "Gachas de avena con manzana y jengibre",
  );
  await nav
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .click();
  const search = page.getByRole("searchbox", {
    name: t("Search collection", "Buscar en la colección"),
  });
  await search.fill(title);
  await page.locator(".recipe-card").click();
  await page
    .getByRole("button", {
      name: t("Veto recipe", "Vetar receta"),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: t("Remove veto", "Quitar veto"),
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    t(
      "Vetoed for household suggestions",
      "Vetada para las sugerencias del hogar",
    ),
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".recipe-card")).toHaveClass(/is-vetoed/);
  await expect(page.locator(".recipe-card")).toBeEnabled();
  await page.screenshot({ path: capture });
  await page.reload();
  await nav
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .click();
  await search.fill(title);
  await expect(page.locator(".recipe-card")).toHaveClass(/is-vetoed/);
  await nav
    .getByRole("button", { name: t("Menu", "Menú"), exact: true })
    .click();
  await page
    .getByRole("button", {
      name: t("Suggest week", "Sugerir semana"),
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).not.toContainText(title);
  await page.keyboard.press("Escape");
  await nav
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .click();
  await search.fill(title);
  await page.locator(".recipe-card").click();
  await page
    .getByRole("button", { name: t("Remove veto", "Quitar veto"), exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: t("Veto recipe", "Vetar receta"),
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".recipe-card")).not.toHaveClass(/is-vetoed/);
}
