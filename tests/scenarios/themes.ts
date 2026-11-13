import { expect, type Page } from "@playwright/test";
import { THEME_FAMILIES, THEME_NAMES, THEMES } from "../../src/domain/themes";
export async function themesScenario(
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
  await page
    .getByRole("button", {
      name: t("Open my profile", "Abrir mi perfil"),
      exact: true,
    })
    .click();
  const settings = page.locator(".theme-settings");
  await expect(settings.getByRole("radio")).toHaveCount(7);
  for (const family of THEME_FAMILIES) {
    await settings
      .getByRole("radio", { name: THEME_NAMES[family][language], exact: true })
      .locator("..")
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-colour", family);
    for (const mode of ["light", "dark"] as const) {
      if ((await page.locator("html").getAttribute("data-theme")) !== mode)
        await page
          .getByRole("button", {
            name: t("Switch theme", "Cambiar tema"),
            exact: true,
          })
          .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--bg")
            .trim(),
        ),
      ).toBe(THEMES[family][mode].bg);
      await expect(
        settings.getByRole("radio", {
          name: THEME_NAMES[family][language],
          exact: true,
        }),
      ).toBeChecked();
      await settings.screenshot({
        path: outputPath(`${family}-${mode}-${language}.png`),
      });
    }
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-colour", "orange");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", {
      name: t("Open my profile", "Abrir mi perfil"),
      exact: true,
    })
    .click();
  await page.setViewportSize({ width: 320, height: 780 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await settings.scrollIntoViewIfNeeded();
  await expect(
    settings.getByRole("radio", { name: t("Orange", "Naranja"), exact: true }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await settings
    .getByRole("radio", { name: t("Orange", "Naranja"), exact: true })
    .focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    settings.getByRole("radio", { name: t("Yellow", "Amarillo"), exact: true }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-colour", "yellow");
  await expect(page.locator(".theme-option:focus-within")).toHaveCount(1);
  await expect(page.locator(".theme-option:focus-within")).toHaveCSS(
    "outline-style",
    "solid",
  );
  await page.screenshot({ path: outputPath(`theme-large-${language}.png`) });
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("font-size");
  });
  await page
    .getByRole("button", { name: t("Exit", "Salir"), exact: true })
    .click();
  await page
    .getByRole("button", {
      name: t(
        "Sign out & clear this device",
        "Cerrar sesión y borrar datos locales",
      ),
      exact: true,
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-colour", "yellow");
  await expect(
    page.getByRole("button", {
      name: t("Explore the preview", "Explorar la vista previa"),
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-colour", "yellow");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}
