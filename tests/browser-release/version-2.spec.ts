import { clickDisclosedAction } from "../browser/helpers/actions";
import { test, expect } from "@playwright/test";
for (const language of ["en", "es"] as const) {
  test(`${language}: v2 avatars, large text, locks, personal swaps, ratings and week copies`, async ({
    page,
  }) => {
    const t = (en: string, es: string) => (language === "en" ? en : es);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore the preview", exact: true })
      .click();
    if (language === "es")
      await page
        .getByRole("button", { name: "Switch language", exact: true })
        .click();
    await page
      .getByRole("button", {
        name: t("Open my profile", "Abrir mi perfil"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: t("Change my avatar", "Cambiar mi avatar"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: t("Choose 🦊", "Elegir 🦊"), exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: t("Open my profile", "Abrir mi perfil"),
        exact: true,
      }),
    ).toContainText("🦊");
    await page
      .getByRole("combobox", {
        name: t("Text size", "Tamaño del texto"),
        exact: true,
      })
      .selectOption("large");
    await expect(page.locator("html")).toHaveAttribute(
      "data-text-size",
      "large",
    );
    const nav = page.getByRole("navigation", {
      name: t("Mobile navigation", "Navegación móvil"),
    });
    await nav
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Suggest week", "Sugerir semana"),
        exact: true,
      })
      .click();
    const cards = page.locator(".preview-meal"),
      shared = cards
        .filter({
          has: page.getByRole("button", {
            name: t("Re-roll meal", "Volver a sugerir comida"),
            exact: true,
          }),
        })
        .first();
    const names = await shared
      .locator(".suggested-recipe-link")
      .allTextContents();
    await shared
      .getByRole("button", {
        name: t("Lock meal", "Bloquear comida"),
        exact: true,
      })
      .click();
    await expect(
      shared.getByRole("button", {
        name: t("Re-roll meal", "Volver a sugerir comida"),
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: t("Regenerate unlocked", "Regenerar no bloqueadas"),
        exact: true,
      })
      .click();
    expect(
      await shared.locator(".suggested-recipe-link").allTextContents(),
    ).toEqual(names);
    const breakfasts = cards.filter({
      has: page.getByRole("button", {
        name: t("Re-roll my breakfast", "Volver a sugerir mi desayuno"),
        exact: true,
      }),
    });
    const a = breakfasts.nth(0),
      b = breakfasts.nth(1);
    const beforeA = await a.locator(".suggested-recipe-link").allTextContents(),
      beforeB = await b.locator(".suggested-recipe-link").allTextContents();
    await a
      .getByRole("button", {
        name: t("Swap suggestion", "Intercambiar sugerencia"),
        exact: true,
      })
      .click();
    await b
      .getByRole("button", {
        name: t("Swap here", "Intercambiar aquí"),
        exact: true,
      })
      .click();
    expect(
      (await a.locator(".suggested-recipe-link").allTextContents())[0],
    ).toBe(beforeB[0]);
    expect(
      (await a.locator(".suggested-recipe-link").allTextContents())[1],
    ).toBe(beforeA[1]);
    const viewerAfterSwap = (
      await a.locator(".suggested-recipe-link").allTextContents()
    )[0];
    await a
      .getByRole("button", {
        name: t(
          "Re-roll breakfast for Noa",
          "Volver a sugerir el desayuno de Noa",
        ),
        exact: true,
      })
      .click();
    const otherA = (
      await a.locator(".suggested-recipe-link").allTextContents()
    )[1];
    const otherB = (
      await b.locator(".suggested-recipe-link").allTextContents()
    )[1];
    expect(otherA).not.toBe(beforeA[1]);
    await a
      .getByRole("button", {
        name: t("Swap breakfast for Noa", "Intercambiar desayuno de Noa"),
        exact: true,
      })
      .click();
    await b
      .getByRole("button", {
        name: t(
          "Swap breakfast here for Noa",
          "Intercambiar aquí el desayuno de Noa",
        ),
        exact: true,
      })
      .click();
    expect(await a.locator(".suggested-recipe-link").allTextContents()).toEqual(
      [viewerAfterSwap, otherB],
    );
    expect(
      (await b.locator(".suggested-recipe-link").allTextContents())[1],
    ).toBe(otherA);
    await page
      .getByRole("button", {
        name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: t("View recipe", "Ver receta"),
        exact: true,
      })
      .first()
      .click();
    await expect(
      page.getByRole("dialog").locator(".instructions li").first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close / Cerrar", exact: true })
      .click();
    await nav
      .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
      .click();
    await page.locator(".recipe-card").first().click();
    await page
      .getByRole("button", {
        name: t("Rate 4 stars", "Puntuar con 4 estrellas"),
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: t("Rate 4 stars", "Puntuar con 4 estrellas"),
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Close / Cerrar", exact: true })
      .click();
    await nav
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Next week", "Semana siguiente"),
        exact: true,
      })
      .click();
    await clickDisclosedAction(page, t("Copy a week", "Copiar una semana"));
    await page
      .getByLabel(t("Source week", "Semana de origen"), { exact: true })
      .fill("2026-11-02");
    await page
      .getByRole("button", {
        name: t("Preview copied week", "Revisar semana copiada"),
        exact: true,
      })
      .click();
    await expect(page.locator(".preview-meal").first()).toBeVisible();
    await page
      .getByRole("button", {
        name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
        exact: true,
      })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // The app must also honor an explicit browser text-size override at 200%.
    await page
      .getByRole("button", {
        name: t("Open my profile", "Abrir mi perfil"),
        exact: true,
      })
      .click();
    await page
      .locator("html")
      .evaluate((el) => ((el as HTMLElement).style.fontSize = "38px"));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .locator("html")
      .evaluate((el) => ((el as HTMLElement).style.fontSize = ""));
    await page.screenshot({
      path: `test-results/v2-profile-${language}-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
