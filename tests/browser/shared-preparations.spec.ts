import { test, expect, type Page } from "@playwright/test";
async function openFixture(page: Page, language: "en" | "es") {
  await page.clock.setFixedTime(new Date("2026-11-10T08:00:00Z"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Good to see you, Alex.", exact: true })
    .waitFor();
  await page.evaluate(async () => {
    const modulePath = "/src/domain/planning.ts";
    const { makePortion } = await import(modulePath);
    const saved = JSON.parse(sessionStorage.getItem("week-menu-demo-server")!);
    const r = saved.library.recipes.find((r: any) => r.id === "m18");
    const profile = {
      name: "Alex",
      age: 32,
      sex: "male",
      height_cm: 178,
      weight_kg: 80,
      activity_level: "light",
      goal: "maintain",
      target_weight_kg: null,
      target_date: null,
      diet: "omnivore",
      excluded_ingredients: [],
      language: "en",
    };
    saved.library.plans = [
      {
        day: "2026-11-10",
        type: "lunch",
        revision: 1,
        shared_recipe_id: r.id,
        portions: [
          makePortion(
            r,
            "alex",
            profile,
            600,
            false,
            saved.library.ingredients,
            saved.library.substitutions,
          ),
          makePortion(
            r,
            "noa",
            { ...profile, name: "Noa", diet: "vegetarian" },
            450,
            false,
            saved.library.ingredients,
            saved.library.substitutions,
          ),
        ],
      },
    ];
    saved.serial++;
    sessionStorage.setItem("week-menu-demo-server", JSON.stringify(saved));
    sessionStorage.setItem(
      "week-menu-context:preview",
      JSON.stringify({ tab: "menu", anchor: "2026-11-10", member: "alex" }),
    );
  });
  await page.reload();
  if (language === "es")
    await page
      .getByRole("button", { name: "Switch language", exact: true })
      .click();
}
for (const language of ["en", "es"] as const)
  test(`${language}: common totals, variants, budgets, purchased items and stable offline navigation`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const t = (en: string, es: string) => (language === "en" ? en : es);
    await openFixture(page, language);
    const nav = page.getByRole("navigation", {
      name: t("Mobile navigation", "Navegación móvil"),
    });
    await expect(page.locator(".meal-more[open]")).toHaveCount(0);
    await page.locator(".meal-recipe-link").first().click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", {
        name: t("In common", "En común"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("heading", {
        name: t("Variants", "Variantes"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog.locator(".portion-distribution")).not.toHaveAttribute(
      "open",
    );
    expect((await dialog.innerText()).toLowerCase()).not.toMatch(
      /omitir|omit the|utensil|contamin/,
    );
    const grain = dialog
      .locator(".household-meal > section .ingredient-list li")
      .filter({ hasText: t("Basmati rice", "Arroz basmati") });
    await expect(grain).toHaveCount(1);
    const expected = await page.evaluate(() =>
      JSON.parse(
        sessionStorage.getItem("week-menu-demo-server")!,
      ).library.plans[0].portions.reduce(
        (sum: number, p: any) =>
          sum +
          p.lines.find((l: any) => l.ingredient_id === "rice_white").quantity,
        0,
      ),
    );
    await expect(grain).toContainText(`${expected} g`);
    await dialog.locator(".portion-distribution > summary").click();
    await expect(dialog.locator(".portion-distribution")).toContainText("Alex");
    await expect(dialog.locator(".portion-distribution")).toContainText("Noa");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(
        () => (document.documentElement.dataset.textSize = "large"),
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await page.screenshot({
      path: `test-results/shared-preparations-${language}.png`,
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Close / Cerrar", exact: true })
      .click();
    await nav
      .getByRole("button", { name: t("Overview", "Inicio"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Adjust meal budgets", "Ajustar presupuestos de las comidas"),
        exact: true,
      })
      .click();
    await page
      .getByRole("spinbutton", {
        name: t("Lunch kcal", "Almuerzo kcal"),
        exact: true,
      })
      .fill("510");
    await page
      .getByRole("button", {
        name: t("Save overrides", "Guardar ajustes"),
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: t("Review the change", "Revisar el cambio"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: t(
          "Adjust saved portions to these budgets",
          "Ajustar las raciones guardadas a estos presupuestos",
        ),
        exact: true,
      }),
    ).toBeChecked();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: t("Save changes", "Guardar cambios"),
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const portions = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("week-menu-demo-server")!).library
          .plans[0].portions,
    );
    expect(portions.find((p: any) => p.member_id === "alex").budget).toBe(510);
    expect(portions.find((p: any) => p.member_id === "noa").budget).toBe(450);
    await nav
      .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Add item", "Añadir producto"),
        exact: true,
      })
      .click();
    await page
      .getByLabel(t("Product", "Producto"), { exact: true })
      .fill("Purchased fixture");
    await page
      .getByRole("button", {
        name: t("Save item", "Guardar producto"),
        exact: true,
      })
      .click();
    await page
      .getByRole("checkbox", { name: "Purchased fixture", exact: true })
      .click();
    const purchased = page.locator("details.shopping-group").filter({
      has: page.locator("summary", { hasText: t("Purchased", "Comprados") }),
    });
    await expect(purchased).not.toHaveAttribute("open");
    await purchased.locator("summary").click();
    await expect(
      purchased.getByRole("checkbox", {
        name: "Purchased fixture",
        exact: true,
      }),
    ).toBeChecked();
    await nav
      .getByRole("button", { name: t("Kitchen", "Cocina"), exact: true })
      .click();
    await context.setOffline(true);
    const offline = page.getByRole("navigation", {
      name: t("Offline navigation", "Navegación sin conexión"),
    });
    await expect(offline.getByRole("button")).toHaveCount(5);
    await expect(
      page.getByRole("heading", { name: t("Kitchen", "Cocina"), exact: true }),
    ).toBeVisible();
    await context.setOffline(false);
    await expect(
      page.getByRole("button", {
        name: t("Propose sessions", "Proponer sesiones"),
        exact: true,
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

test("profile sections save independently and editing variants preserves saved meals", async ({
  page,
}) => {
  await openFixture(page, "en");
  await page
    .getByRole("button", { name: "Open my profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Alex updated");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Change history", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Planning change history", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close / Cerrar", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await nav.getByRole("button", { name: "Recipes", exact: true }).click();
  const before = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("week-menu-demo-server")!),
  );
  const recipe = before.library.recipes.find((r: any) => r.id === "m18");
  await page
    .getByRole("searchbox", { name: "Search collection", exact: true })
    .fill(recipe.name.en);
  await page.getByRole("button", { name: new RegExp(recipe.name.en) }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page
    .getByText("Variants and reusable preparations", { exact: true })
    .click();
  await page.getByRole("button", { name: "Add variant", exact: true }).click();
  await page
    .getByLabel("Variant name", { exact: true })
    .fill("Household variant");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("week-menu-demo-server")!),
  );
  expect(
    after.library.recipes.find((r: any) => r.id === "m18").recipe_model.variants
      .length,
  ).toBe(recipe.recipe_model.variants.length + 1);
  expect(after.library.plans).toEqual(before.library.plans);
});
for (const language of ["en", "es"] as const)
  test(`${language}: accepting default budgets reviews and updates only personal future portions`, async ({
    page,
  }) => {
    const t = (en: string, es: string) => (language === "en" ? en : es);
    await openFixture(page, language);
    const before = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("week-menu-demo-server")!).library
          .plans,
    );
    await page
      .getByRole("button", {
        name: t("Open my profile", "Abrir mi perfil"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: t("Recalculate & review", "Recalcular y revisar"),
        exact: true,
      })
      .click();
    await page
      .getByRole("spinbutton", {
        name: t("Lunch kcal", "Almuerzo kcal"),
        exact: true,
      })
      .fill("800");
    await page
      .getByRole("button", {
        name: t("Accept target & budgets", "Aceptar objetivo y presupuestos"),
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: t("Review future portions", "Revisar raciones futuras"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: t(
          "Adjust my saved portions to these budgets",
          "Ajustar mis raciones guardadas a estos presupuestos",
        ),
        exact: true,
      }),
    ).toBeChecked();
    await page
      .getByRole("button", {
        name: t("Accept target and changes", "Aceptar objetivo y cambios"),
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const after = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("week-menu-demo-server")!).library
          .plans,
    );
    expect(
      after[0].portions.find((p: any) => p.member_id === "alex").budget,
    ).toBe(800);
    expect(after[0].portions.find((p: any) => p.member_id === "noa")).toEqual(
      before[0].portions.find((p: any) => p.member_id === "noa"),
    );
  });
