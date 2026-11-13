import { expect, test } from "@playwright/test";
for (const language of ["en", "es"] as const) {
  test(`${language}: meal recipe choices respect vetoes, amounts are read-only, and selection errors receive focus`, async ({
    page,
  }) => {
    const t = (en: string, es: string) => (language === "en" ? en : es);
    await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
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
    await page.evaluate(() => {
      const saved = JSON.parse(
        sessionStorage.getItem("week-menu-demo-server")!,
      );
      saved.library.recipes.find((r: { id: string }) => r.id === "b04").banned =
        true;
      saved.library.recipes.find((r: { id: string }) => r.id === "m26").banned =
        true;
      const base = saved.library.recipes.find(
        (r: { id: string }) => r.id === "b09",
      );
      saved.library.recipes.push({
        ...base,
        recipe_model: undefined,
        id: "broken-recipe",
        name: {
          en: "Broken recipe fixture",
          es: "Receta de prueba incompleta",
        },
        components: [
          {
            ...base.components[0],
            ingredients: [
              { ingredient_id: "missing-fixture", quantity: 100, unit: "g" },
            ],
          },
        ],
      });
      saved.library.recipes.push({
        ...base,
        recipe_model: undefined,
        id: "incompatible-fixture",
        name: { en: "Turkey fixture", es: "Receta de pavo de prueba" },
        meal_types: ["lunch"],
        components: [
          {
            ...base.components[0],
            ingredients: [
              { ingredient_id: "turkey", quantity: 100, unit: "g" },
            ],
          },
        ],
      });
      sessionStorage.setItem("week-menu-demo-server", JSON.stringify(saved));
    });
    await page.reload();
    if (language === "es")
      await page
        .getByRole("button", { name: "Switch language", exact: true })
        .click();
    const nav = page.getByRole("navigation", {
      name: t("Main navigation", "Navegación principal"),
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
    await page
      .getByRole("button", {
        name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: t("Change", "Cambiar"),
        exact: true,
      })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    const selectors = dialog.getByRole("combobox", {
      name: t("Recipe", "Receta"),
      exact: true,
    });
    await expect(selectors).toHaveCount(2);
    for (const selector of await selectors.all()) {
      await expect(selector.locator('option[value="b04"]')).toHaveCount(0);
      await expect(selector.locator('option[value="m26"]')).toHaveCount(0);
    }
    await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
    await dialog
      .getByText(t("Quantities", "Cantidades"), { exact: true })
      .first()
      .click();
    await expect(dialog.locator(".ingredient-list li").first()).toBeVisible();
    const first = dialog.locator(".portion-editor").first();
    await selectors.first().selectOption("broken-recipe");
    const alert = first.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(alert).toContainText("Alex");
    await expect(alert).toContainText("missing-fixture");
    await expect(
      first.getByRole("combobox", { name: t("Recipe", "Receta"), exact: true }),
    ).not.toHaveValue("broken-recipe");
    await selectors.first().selectOption("b09");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog
      .getByRole("button", {
        name: t("Save this meal only", "Guardar solo esta comida"),
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: t("Change", "Cambiar"),
        exact: true,
      })
      .nth(1)
      .click();
    for (const selector of await page
      .getByRole("dialog")
      .getByRole("combobox", { name: t("Recipe", "Receta"), exact: true })
      .all()) {
      await expect(selector.locator('option[value="m26"]')).toHaveCount(0);
    }
    await page
      .getByRole("dialog")
      .getByRole("combobox", { name: t("Recipe", "Receta"), exact: true })
      .first()
      .selectOption("incompatible-fixture");
    const sharedError = page.getByRole("dialog").getByRole("alert");
    await expect(sharedError).toBeVisible();
    await expect(sharedError).toBeFocused();
    await expect(sharedError).toContainText("Noa");
    await expect(sharedError).toContainText(
      t("Turkey light meat", "Carne blanca de pavo"),
    );
    await expect(sharedError).toContainText(
      t("vegetarian diet", "dieta vegetariana"),
    );
    await expect(sharedError).toContainText(
      t("No substitution is configured", "No hay una sustitución configurada"),
    );
    await expect(sharedError).not.toContainText(
      t("Add more recipes", "Añade más recetas"),
    );
    await page.keyboard.press("Escape");
    await nav
      .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
      .click();
    await page
      .getByRole("searchbox", {
        name: t("Search collection", "Buscar en la colección"),
      })
      .fill(t("Banana oat pancakes", "Tortitas de avena y plátano"));
    await page.locator(".recipe-card").click();
    await expect(
      page.getByRole("button", {
        name: t("Edit recipe", "Editar receta"),
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("shared lunch displays simple named substitutions without editable amounts", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Change", exact: true })
    .nth(1)
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Recipe", exact: true })
    .first()
    .selectOption("m26");
  const notes = dialog.locator(".portion-editor").nth(1).locator(".note");
  await expect(notes).toContainText([
    "Replace Turkey light meat with Plain steamed tofu.",
  ]);
  await expect(dialog).not.toContainText("instead of frying raw turkey");
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
});
