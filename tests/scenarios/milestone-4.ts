import { expect, type Page } from "@playwright/test";
export async function historicalScenario(
  page: Page,
  language: "en" | "es",
  capture: string,
) {
  const t = (en: string, es: string) => (language === "en" ? en : es);
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
  const menu = () =>
    page
      .getByRole("navigation", {
        name: t("Mobile navigation", "Navegación móvil"),
      })
      .getByRole("button", { name: t("Menu", "Menú"), exact: true });
  await menu().click();
  await page
    .getByRole("button", {
      name: t("Suggest week", "Sugerir semana"),
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
      exact: true,
    })
    .click();
  await page.clock.setFixedTime(new Date("2026-11-05T12:00:00Z"));
  await page.reload();
  await menu().click();
  const day = page.locator(".day-card").nth(1),
    check = day.locator(".closed-day-check");
  await expect(check).toBeVisible();
  await expect(
    day.getByRole("button", {
      name: t("Review meal", "Revisar comida"),
      exact: true,
    }),
  ).toHaveCount(0);
  await check.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (let i = 0; i < 4; i++) await check.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("3");
  await dialog
    .getByRole("button", { name: t("Cancel", "Cancelar"), exact: true })
    .click();
  for (let i = 0; i < 5; i++) await check.click();
  await dialog
    .getByRole("button", {
      name: t("Start historical edit", "Iniciar edición del historial"),
      exact: true,
    })
    .click();
  const quantity = dialog.locator(".historical-quantities input").first();
  const before = Number(await quantity.inputValue());
  await quantity.fill(String(before + 10));
  await dialog
    .getByRole("button", {
      name: t("Review correction", "Revisar corrección"),
      exact: true,
    })
    .click();
  await expect(dialog.locator(".portion-allocation")).toHaveCount(2);
  await dialog.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: capture });
  await dialog
    .getByRole("button", {
      name: t(
        "Confirm historical correction",
        "Confirmar corrección del historial",
      ),
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: capture.replace(".png", "-actions.png") });
  await dialog
    .getByRole("button", {
      name: t(
        "Confirm historical correction",
        "Confirmar corrección del historial",
      ),
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(check).toBeVisible();
  for (let i = 0; i < 5; i++) await check.click();
  await dialog
    .getByRole("button", {
      name: t("Start historical edit", "Iniciar edición del historial"),
      exact: true,
    })
    .click();
  await expect(
    dialog.locator(".historical-quantities input").first(),
  ).toHaveValue(String(before + 10));
  await dialog
    .getByRole("button", {
      name: t("Erase this day's meals", "Borrar las comidas de este día"),
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: t("Confirm day erasure", "Confirmar borrado del día"),
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: t("Cancel", "Cancelar"), exact: true })
    .click();
  await expect(
    dialog.locator(".historical-quantities input").first(),
  ).toHaveValue(String(before + 10));
  await dialog
    .getByRole("button", {
      name: t("Erase this day's meals", "Borrar las comidas de este día"),
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", {
      name: t("Confirm day erasure", "Confirmar borrado del día"),
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(day.locator(".meal-recipe-link")).toHaveCount(0);
  await page.reload();
  await menu().click();
  await expect(
    page.locator(".day-card").nth(1).locator(".meal-recipe-link"),
  ).toHaveCount(0);
}
