import { clickDisclosedAction } from "../browser/helpers/actions";
import { expect, type Page } from "@playwright/test";
export async function contentDisplayScenario(
  page: Page,
  language: "en" | "es",
  capture: string,
) {
  const t = (en: string, es: string) => (language === "en" ? en : es);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  if (language === "es") {
    await page
      .getByRole("button", { name: "Switch language", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cambiar tema", exact: true })
      .click();
  }
  const nav = page.getByRole("navigation", {
    name: t("Mobile navigation", "Navegación móvil"),
  });
  await nav
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .click();
  const search = page.getByRole("searchbox", {
    name: t("Search collection", "Buscar en la colección"),
  });
  await clickDisclosedAction(
    page,
    t("Ingredients & units", "Ingredientes y unidades"),
  );
  await search.fill(t("Eggs", "Huevos"));
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.locator(".recipe-card").click();
  await expect(page.getByRole("dialog")).toContainText(t("Eggs", "Huevos"));
  await page
    .getByRole("button", {
      name: t("Edit ingredient", "Editar ingrediente"),
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel(t("Name", "Nombre"), { exact: true }),
  ).toHaveValue(t("Eggs", "Huevos"));
  // Saving a different field must not turn a display alias into a private rename.
  await page
    .getByLabel(t("Energy · kcal per 100 g", "Energía · kcal por 100 g"), {
      exact: true,
    })
    .fill("140");
  await page
    .getByRole("button", { name: t("Save", "Guardar"), exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const eggNames = await page.evaluate(
    () =>
      JSON.parse(
        sessionStorage.getItem("week-menu-demo-server")!,
      ).library.ingredients.find((i: { id: string }) => i.id === "egg").name,
  );
  expect(eggNames).toEqual({
    en: "Whole chicken egg, raw, without shell",
    es: "Huevo de gallina crudo, sin cáscara",
  });
  await page.locator(".recipe-card").click();
  await page
    .getByRole("button", {
      name: t("Edit ingredient", "Editar ingrediente"),
      exact: true,
    })
    .click();
  await page
    .getByLabel(t("Name", "Nombre"), { exact: true })
    .fill(t("Family eggs", "Huevos de casa"));
  await page
    .getByRole("button", { name: t("Save", "Guardar"), exact: true })
    .click();
  await search.fill(t("Family eggs", "Huevos de casa"));
  await expect(page.locator(".recipe-card")).toContainText(
    t("Family eggs", "Huevos de casa"),
  );
  await search.fill(t("Almonds", "Almendras"));
  await expect(page.locator(".recipe-card")).toContainText(
    t("Almonds", "Almendras"),
  );
  await page
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .filter({ hasNot: page.locator("nav") })
    .first()
    .click();
  await search.fill(
    t(
      "Lentil and courgette potato pie",
      "Pastel de lentejas, calabacín y patata",
    ),
  );
  await page.locator(".recipe-card").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    t("Ingredients for 1 person", "Ingredientes para 1 persona"),
  );
  await expect(dialog).not.toContainText(
    t(
      "No cooked-weight conversion is assumed",
      "No se presupone ninguna conversión",
    ),
  );
  await expect(dialog.locator(".ingredient-list").first()).toContainText(
    t("Green/brown lentils", "Lentejas verdes o pardinas"),
  );
  await expect(dialog.locator(".instructions").first()).toContainText(
    t("Cook the weighed lentils", "Cuece las lentejas pesadas"),
  );
  await page.screenshot({ path: capture });
  await page
    .getByRole("button", {
      name: t("Edit recipe", "Editar receta"),
      exact: true,
    })
    .click();
  await page.getByLabel(t("Serves", "Personas"), { exact: true }).fill("4");
  await page
    .getByRole("button", {
      name: t("Save recipe", "Guardar receta"),
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".recipe-card").click();
  await expect(dialog).toContainText(
    t("Ingredients for 4 people", "Ingredientes para 4 personas"),
  );
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
