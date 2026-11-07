import { test, expect } from "@playwright/test";
for (const lang of ["en", "es"] as const) {
  test(`${lang}: mobile planning clipboard, overwrite review and copy context`, async ({
    page,
  }, testInfo) => {
    const t = (en: string, es: string) => (lang === "en" ? en : es);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore the preview", exact: true })
      .click();
    if (lang === "es") {
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
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Suggest week", "Sugerir semana"),
        exact: true,
      })
      .click();
    const breakfast = page.locator(".preview-meal").first();
    const copy = breakfast.getByRole("button", {
      name: t("Copy breakfast for Alex", "Copiar desayuno de Alex"),
      exact: true,
    });
    for (const b of await breakfast.locator(".preview-action").all()) {
      const box = await b.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await copy.click();
    const paste = breakfast.getByRole("button", {
      name: t("Paste breakfast for Noa", "Pegar desayuno de Noa"),
      exact: true,
    });
    await expect(paste.locator(".lucide-clipboard-paste")).toHaveCount(1);
    await breakfast.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`v3-transfers-${lang}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await paste.click();
    const review = page.getByRole("dialog", {
      name: t("Review pasted meal", "Revisa la comida pegada"),
    });
    await expect(
      review.getByRole("button", {
        name: t("Replace and paste", "Sustituir y pegar"),
        exact: true,
      }),
    ).toBeVisible();
    await review
      .getByRole("button", { name: t("Cancel", "Cancelar"), exact: true })
      .click();
    await expect(paste).toBeEnabled();
    await page
      .getByRole("button", {
        name: t("Cancel transfer", "Cancelar transferencia"),
        exact: true,
      })
      .click();
    await page.keyboard.press("Escape");
    await nav
      .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
      .click();
    const card = page.locator(".recipe-card").first();
    await card.dispatchEvent("pointerdown", {
      pointerType: "touch",
      isPrimary: true,
      pointerId: 1,
      clientX: 100,
      clientY: 250,
    });
    await expect(
      page.getByRole("button", {
        name: t("Copy to menu", "Copiar al menú"),
        exact: true,
      }),
    ).toBeVisible();
    await card.dispatchEvent("pointerup", {
      pointerType: "touch",
      isPrimary: true,
      pointerId: 1,
    });
    await card.dispatchEvent("click");
    await page
      .getByRole("button", {
        name: t("Copy to menu", "Copiar al menú"),
        exact: true,
      })
      .click();
    await expect(page.locator(".planning-clipboard")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
