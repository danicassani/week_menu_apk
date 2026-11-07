import { expect, type Page } from "@playwright/test";
export async function allocationScenario(
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
  await page
    .getByRole("searchbox", {
      name: t("Search collection", "Buscar en la colección"),
    })
    .fill(t("Chicken and pepper rice skillet", "Arroz con pollo y pimientos"));
  await page.locator(".recipe-card").click();
  await expect(page.locator(".portion-allocation")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: t("Copy to menu", "Copiar al menú"),
      exact: true,
    })
    .click();
  const target = page.locator(".day-card").nth(1).locator(".meal-card").nth(1);
  await target
    .getByRole("button", { name: t("Paste meal", "Pegar comida"), exact: true })
    .click();
  await page
    .getByRole("dialog", {
      name: t("Review pasted meal", "Revisa la comida pegada"),
    })
    .getByRole("button", { name: t("Paste meal", "Pegar comida"), exact: true })
    .click();
  await target.locator(".meal-recipe-link").click();
  const chart = page.locator(".portion-allocation");
  await expect(chart).toBeVisible();
  expect(
    await chart.locator(".allocation-group").count(),
  ).toBeGreaterThanOrEqual(2);
  for (const group of await chart.locator(".allocation-group").all()) {
    const percentages = await group
      .locator(".allocation-legend li > span:last-child b")
      .allTextContents();
    expect(percentages.reduce((n, p) => n + parseInt(p), 0)).toBe(100);
  }
  const noa = chart
    .getByRole("button", {
      name: t("Portion for Noa", "Porción de Noa"),
      exact: true,
    })
    .first();
  const share = await noa
    .locator("xpath=ancestor::li[1]")
    .locator(":scope > span:last-child b")
    .innerText();
  await noa.click();
  const details = page.getByRole("dialog", {
    name: t("Portion for Noa", "Porción de Noa"),
    exact: true,
  });
  await expect(details.getByText("Noa", { exact: true })).toBeVisible();
  await expect(details).toContainText(share);
  await page.keyboard.press("Escape");
  await expect(noa).toBeFocused();
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({ path: capture });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
