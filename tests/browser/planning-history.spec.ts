import { test, expect } from "@playwright/test";
for (const language of ["en", "es"] as const)
  test(`${language}: hidden profile history shows saved actions and before/after details after reload`, async ({
    page,
  }) => {
    const t = (en: string, es: string) => (language === "en" ? en : es);
    await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
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
    const nav = page.getByRole("navigation", {
      name: t("Mobile navigation", "Navegación móvil"),
    });
    const label = t("AT A GLANCE", "DE UN VISTAZO");
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
    await nav
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
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
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav
      .getByRole("button", { name: t("Profile", "Perfil"), exact: true })
      .click();
    const tap = () =>
      page.getByRole("button", { name: label, exact: true }).click();
    for (let i = 0; i < 4; i++) await tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await tap();
    const dialog = page.getByRole("dialog", {
      name: t("Planning change history", "Historial de cambios"),
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".history-events > li")).toHaveCount(1);
    await expect(dialog).toContainText("Alex");
    await expect(dialog).toContainText(
      t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
    );
    await dialog.locator(".history-events summary").click();
    await expect(
      dialog
        .getByRole("heading", { name: t("Before", "Antes"), exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      dialog
        .getByRole("heading", { name: t("After", "Después"), exact: true })
        .first(),
    ).toBeVisible();
    await expect(dialog).not.toContainText("recipe_snapshot");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/planning-history-${language}.png`,
    });
    await page.keyboard.press("Escape");
    await page.reload();
    await nav
      .getByRole("button", { name: t("Profile", "Perfil"), exact: true })
      .click();
    for (let i = 0; i < 5; i++) await tap();
    await expect(dialog.locator(".history-events > li")).toHaveCount(1);
    await dialog
      .getByLabel(t("Author", "Autor"), { exact: true })
      .fill("Nobody");
    await dialog
      .getByRole("button", {
        name: t("Filter history", "Filtrar historial"),
        exact: true,
      })
      .click();
    await expect(dialog.locator(".history-events > li")).toHaveCount(0);
  });
