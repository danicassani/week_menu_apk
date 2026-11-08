import { expect, type Page } from "@playwright/test";
export async function upcomingShoppingScenario(
  page: Page,
  language: "en" | "es",
  outputPath: (name: string) => string,
) {
  const t = (en: string, es: string) => (language === "en" ? en : es);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  if (language === "es")
    await page
      .getByRole("button", { name: "Switch language", exact: true })
      .click();
  const nav = page.getByRole("navigation", {
    name: t("Mobile navigation", "Navegación móvil"),
  });
  const copyToMenu = async () => {
    await nav
      .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
      .click();
    await page
      .getByRole("searchbox", {
        name: t("Search collection", "Buscar en la colección"),
      })
      .fill(t("Avocado and egg toast", "Tostada de aguacate y huevo"));
    await page.locator(".recipe-card").click();
    await page
      .getByRole("button", {
        name: t("Copy to menu", "Copiar al menú"),
        exact: true,
      })
      .click();
  };
  await copyToMenu();
  const paste = () =>
    page
      .getByRole("dialog")
      .getByRole("button", {
        name: t("Paste meal", "Pegar comida"),
        exact: true,
      })
      .click();
  const choose = () =>
    page
      .locator(".day-card")
      .nth(1)
      .locator(".meal-card")
      .first()
      .getByRole("button", {
        name: t("Paste breakfast for Alex", "Pegar desayuno de Alex"),
        exact: true,
      })
      .click();
  // Copy an individually scaled breakfast into two different weeks.
  await choose();
  await paste();
  await nav
    .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
    .click();
  const eggRow = () =>
    page
      .locator(".shopping-checklist li")
      .filter({ hasText: t("Eggs", "Huevos") });
  await expect(eggRow()).toHaveCount(1);
  const before = await eggRow().innerText();
  await eggRow().getByRole("checkbox").click();
  await expect(eggRow().getByRole("checkbox")).toBeChecked();
  await expect(page.locator(".sync-status")).toContainText(
    t("Connected", "Con conexión"),
  );
  await nav
    .getByRole("button", { name: t("Menu", "Menú"), exact: true })
    .click();
  await page
    .getByRole("button", {
      name: t("Next week", "Semana siguiente"),
      exact: true,
    })
    .click();
  await choose();
  await paste();
  await nav
    .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
    .click();
  await expect(eggRow().getByRole("checkbox")).not.toBeChecked();
  expect(await eggRow().innerText()).not.toEqual(before);
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await page
    .getByRole("button", {
      name: t("Egg size estimate", "Tamaño estimado del huevo"),
      exact: true,
    })
    .click();
  await page
    .getByLabel(t("Edible grams per egg", "Gramos comestibles por huevo"), {
      exact: true,
    })
    .fill("60");
  await page
    .getByRole("button", {
      name: t("Save estimate", "Guardar estimación"),
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: outputPath(`upcoming-eggs-${language}.png`) });
  await page.reload();
  await nav
    .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
    .click();
  await page
    .getByRole("button", {
      name: t("Egg size estimate", "Tamaño estimado del huevo"),
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel(t("Edible grams per egg", "Gramos comestibles por huevo"), {
      exact: true,
    }),
  ).toHaveValue("60");
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
