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
    await expect(dialog.locator(".history-diff > li").first()).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: t("Before", "Antes"), exact: true }),
    ).toHaveCount(0);
    await expect(dialog.locator(".history-filter-panel")).not.toHaveAttribute(
      "open",
    );
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
    await dialog.locator(".history-filter-panel > summary").click();
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

test("imported recipe replacements show one concise line in a dark mobile history", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex.", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("week-menu-demo-server")!);
    const p = {
      member_id: "alex",
      member: "Alex",
      recipe_id: "old",
      name: { en: "Pasta", es: "Pasta" },
      kcal: 719.08,
      budget: 600,
      lines: [
        {
          ingredient_id: "chickpeas",
          name: { en: "Chickpeas", es: "Garbanzos" },
          quantity: 90,
          unit: "g",
          kcal: 288,
        },
      ],
    };
    const before = [{ day: "2026-11-05", type: "lunch", portions: [p] }];
    const after = [
      {
        day: "2026-11-05",
        type: "lunch",
        portions: [
          {
            ...p,
            recipe_id: "new",
            name: { en: "Lentils", es: "Lentejas" },
            kcal: 400,
            lines: [],
          },
        ],
      },
    ];
    saved.historyEvents = [
      {
        id: "concise-fixture",
        actor_id: "alex",
        actor_name: "Alex",
        action: "correction",
        created_at: "2026-11-03T11:00:00Z",
        imported: true,
        summary: {
          en: "Alex corrected 2026-11-05.",
          es: "Alex corrigió el día 2026-11-05.",
        },
        changes: { correction: { kind: "correction", before, after } },
      },
    ];
    sessionStorage.setItem("week-menu-demo-server", JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Navegación móvil" })
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  for (let i = 0; i < 5; i++)
    await page
      .getByRole("button", { name: "DE UN VISTAZO", exact: true })
      .click();
  const dialog = page.getByRole("dialog", {
    name: "Historial de cambios",
    exact: true,
  });
  await expect(dialog.locator(".history-filter-panel")).not.toHaveAttribute(
    "open",
  );
  await expect(dialog.getByLabel("Autor", { exact: true })).not.toBeVisible();
  await dialog.locator(".history-events summary").click();
  await expect(dialog.locator(".history-diff li")).toHaveText([
    "05/11/2026 · Almuerzo: «Pasta» → «Lentejas».",
  ]);
  await expect(dialog).not.toContainText("Garbanzos");
  await expect(dialog).not.toContainText("719");
  await expect(dialog).not.toContainText("Calorías");
  await expect(dialog).not.toContainText("Ingredientes");
  await page.screenshot({
    path: "test-results/history-concise-dark-mobile.png",
  });
  await dialog.locator(".history-filter-panel > summary").click();
  await expect(dialog.getByLabel("Autor", { exact: true })).toBeVisible();
  await dialog.locator(".history-filter-panel > summary").click();
  await expect(dialog.getByLabel("Autor", { exact: true })).not.toBeVisible();
});
