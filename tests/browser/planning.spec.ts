import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
});
test("re-rolls an own breakfast in preview, automatically fills shopping and deletes the accepted week", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  const cards = page.locator(".preview-meal");
  const breakfast = cards
    .filter({
      has: page.getByRole("button", {
        name: "Re-roll my breakfast",
        exact: true,
      }),
    })
    .first();
  const before = await cards.allTextContents();
  const noa = await breakfast.locator(":scope > div").last().textContent();
  await breakfast
    .getByRole("button", { name: "Re-roll my breakfast", exact: true })
    .click();
  const after = await cards.allTextContents();
  expect(after.filter((text, i) => text !== before[i])).toHaveLength(1);
  expect(await breakfast.locator(":scope > div").last().textContent()).toBe(
    noa,
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Approve suggestions & save" })
    .click();
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Apply reviewed changes" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Product", { exact: true })
    .fill("Keep this manual item");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Delete week", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete editable meals", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(
    page.getByText("Keep this manual item", { exact: true }),
  ).toBeVisible();
});
test("preview and commit a menu, replace one participant with eating out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Review your menu suggestions" }),
  ).toBeVisible();
  await expect(page.locator(".preview-meal")).not.toHaveCount(0);
  await page
    .getByRole("button", { name: "Approve suggestions & save" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review meal", exact: true })
    .first()
    .click();
  const participant = page.locator(".portion-editor").first();
  await participant
    .getByRole("checkbox", { name: "Eating out for this person" })
    .check();
  await participant
    .getByLabel("Description · required")
    .fill("Lunch at the bar");
  await expect(
    page.getByRole("button", { name: "Save this meal only", exact: true }),
  ).toBeDisabled();
  await participant.getByLabel("Estimated calories · required").fill("530");
  await page
    .getByRole("button", { name: "Save this meal only", exact: true })
    .click();
  await expect(
    page.getByText("Lunch at the bar", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-results/planner-desktop.png",
    fullPage: true,
  });
});
test("create ingredient and confirm a household piece conversion", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
  await page.getByRole("button", { name: "Ingredients & units" }).click();
  await page
    .getByRole("button", { name: "New ingredient", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Test household egg");
  await page.getByLabel("Energy · kcal per 100 g").fill("140");
  await page
    .getByRole("button", { name: "Add conversion", exact: true })
    .click();
  const row = page.locator(".conversion-row").last();
  await row.getByLabel("Unit", { exact: true }).fill("egg");
  await row.getByLabel("Grams per unit", { exact: true }).fill("55");
  await row.getByLabel("Quantity step", { exact: true }).fill("0.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search collection" })
    .fill("Test household egg");
  await page.getByRole("button", { name: /Test household egg/ }).click();
  const reader = page.getByRole("dialog", {
    name: "Test household egg",
    exact: true,
  });
  await expect(reader.locator("input, select, textarea")).toHaveCount(0);
  await expect(reader).toContainText("1 egg = 55 g");
  await expect(reader).toContainText("Quantity step: 0.5 egg");
  await expect(reader).toContainText("140");
  await expect(reader).toContainText("Raw");
  await reader
    .getByRole("button", { name: "Edit ingredient", exact: true })
    .click();
  await expect(
    page.getByLabel("Grams per unit", { exact: true }).last(),
  ).toHaveValue("55");
  await page.getByLabel("Name", { exact: true }).fill("Unsaved ingredient");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Test household egg/ }).click();
  await expect(reader).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page.getByRole("button", { name: /Test household egg/ }).click();
  await expect(
    reader.getByRole("button", { name: "Editar ingrediente", exact: true }),
  ).toBeVisible();
  await expect(reader).toContainText("Crudo");
  await reader
    .getByRole("button", { name: "Editar ingrediente", exact: true })
    .click();
  const energy = page.getByLabel("Energía · kcal por 100 g", { exact: true });
  const state = page.getByRole("combobox", {
    name: "Estado del alimento",
    exact: true,
  });
  await expect(state).toHaveAccessibleDescription(
    /Las calorías corresponden a 100 g/,
  );
  for (const width of [360, 390, 540, 800]) {
    await page.setViewportSize({ width, height: 844 });
    const a = await energy.boundingBox(),
      b = await state.boundingBox();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (width <= 600) {
      expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
      expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
      expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    } else {
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
    }
  }
  await state.selectOption("cooked");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("button", { name: /Test household egg/ }).click();
  await expect(reader).toContainText("Cocinado");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("create a recipe on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
  await page.getByRole("button", { name: "New recipe", exact: true }).click();
  await expect(
    page.getByLabel("Spanish translation", { exact: true }).first(),
  ).not.toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Household porridge");
  await page.getByLabel("Component name", { exact: true }).fill("Porridge");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Cook the oats.\nServe warm.");
  await page
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await page.getByLabel("Ingredient", { exact: true }).selectOption("oats");
  await page.getByLabel("Quantity", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search collection" })
    .fill("Household porridge");
  await expect(
    page.getByRole("button", { name: /Household porridge/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Household porridge/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Serve warm.");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page.getByRole("button", { name: /Household porridge/ }).click();
  await page
    .getByRole("button", { name: "Editar receta", exact: true })
    .click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(
    "Household porridge",
  );
  await expect(
    page.getByRole("textbox", { name: "Instrucciones", exact: true }),
  ).toHaveValue("Cook the oats.\nServe warm.");
  await page.getByLabel("Nombre", { exact: true }).fill("Gachas del hogar");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("searchbox").fill("Gachas del hogar");
  await expect(
    page.getByRole("button", { name: /Gachas del hogar/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cambiar idioma", exact: true })
    .click();
  await page.getByRole("searchbox").fill("Household porridge");
  await page.getByRole("button", { name: /Household porridge/ }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Household porridge",
  );
  await page.locator("details").first().locator("summary").click();
  await expect(
    page.getByLabel("Spanish translation", { exact: true }).first(),
  ).toHaveValue("Gachas del hogar");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("suggested recipe names open read-only details without losing the draft", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  const draft = await page.locator(".preview-meal").allTextContents();
  const recipe = page.locator(".preview-meal button.text-link").first();
  const title = await recipe.innerText();
  await recipe.click();
  const reader = page.getByRole("dialog", { name: title, exact: true });
  await expect(reader.locator(".ingredient-list li").first()).toBeVisible();
  await expect(reader.locator("input, select, textarea")).toHaveCount(0);
  await expect(
    reader.getByRole("button", { name: "Edit recipe", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(reader).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Review your menu suggestions" }),
  ).toBeVisible();
  expect(await page.locator(".preview-meal").allTextContents()).toEqual(draft);
  await expect(recipe).toBeFocused();
  await page
    .getByRole("button", { name: "Approve suggestions & save" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("recipe cards open a reader and editing requires an explicit action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
  const search = page.getByRole("searchbox", { name: "Search collection" });
  await search.fill("Chickpea and tomato toast");
  const card = page.locator(".recipe-card").first();
  await expect(card).not.toContainText("View / edit");
  await card.click();
  const reader = page.getByRole("dialog", {
    name: "Chickpea and tomato toast",
    exact: true,
  });
  await expect(reader.locator(".instructions li").first()).toBeVisible();
  await expect(reader.locator("input, select, textarea")).toHaveCount(0);
  await reader
    .getByRole("button", { name: "Edit recipe", exact: true })
    .click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Chickpea and tomato toast",
  );
  await page.getByLabel("Name", { exact: true }).fill("Unsaved change");
  await page.keyboard.press("Escape");
  await card.click();
  await expect(
    page.getByRole("dialog", {
      name: "Chickpea and tomato toast",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("saved future recipes can be read and closed days hide portion prompts and editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = () =>
    page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Menu", exact: true })
      .click();
  await menu();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  // Ensure this regression actually exercises a stored portion warning.
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("week-menu-demo-server")!);
    for (const meal of saved.library.plans)
      for (const portion of meal.portions)
        portion.warnings = ["review_portions"];
    sessionStorage.setItem("week-menu-demo-server", JSON.stringify(saved));
  });
  await page.reload();
  await menu();
  const day = page.locator(".day-card").nth(2); // Wednesday, after the frozen Tuesday.
  const recipe = day.locator(".meal-recipe-link").first();
  const title = await recipe.innerText();
  await expect(
    day.getByText("Review portions / substitutions", { exact: true }).first(),
  ).toBeVisible();
  await recipe.click();
  const reader = page.getByRole("dialog");
  await expect(reader).toContainText(title);
  await expect(reader.locator(".ingredient-list li").first()).toBeVisible();
  await expect(reader.locator(".instructions li").first()).toBeVisible();
  await expect(reader.locator("input, select, textarea")).toHaveCount(0);
  const instructions = await reader.locator(".instructions").allTextContents();
  await page.keyboard.press("Escape");
  await day
    .getByRole("button", { name: "View recipe", exact: true })
    .first()
    .click();
  expect(await reader.locator(".instructions").allTextContents()).toEqual(
    instructions,
  );
  await page.keyboard.press("Escape");
  await page.clock.setFixedTime(new Date("2026-11-06T12:00:00Z"));
  await page.reload();
  await menu();
  await expect(day.getByRole("button", { name: /^Closed day/ })).toBeVisible();
  await expect(
    day.getByText("Review portions / substitutions", { exact: true }),
  ).toHaveCount(0);
  await expect(
    day.getByRole("button", { name: "Review meal", exact: true }),
  ).toHaveCount(0);
  await expect(
    day.getByRole("button", { name: "Preview another recipe", exact: true }),
  ).toHaveCount(0);
  await day
    .getByRole("button", { name: "View recorded meal", exact: true })
    .first()
    .click();
  expect(await reader.locator(".instructions").allTextContents()).toEqual(
    instructions,
  );
  await page.keyboard.press("Escape");
  await page
    .locator(".day-card")
    .nth(5)
    .getByRole("button", { name: "View recipe", exact: true })
    .first()
    .click();
  await expect(reader.locator(".instructions li").first()).toBeVisible();
});

test("locks preserve suggestions during regeneration, own breakfast swaps stay personal and copied weeks are reviewed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  const cards = page.locator(".preview-meal");
  const shared = cards
    .filter({
      has: page.getByRole("button", { name: "Re-roll meal", exact: true }),
    })
    .first();
  const before = await shared
    .locator(".suggested-recipe-link")
    .allTextContents();
  await shared.getByRole("button", { name: "Lock meal", exact: true }).click();
  await expect(
    shared.getByRole("button", { name: "Re-roll meal", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Regenerate unlocked", exact: true })
    .click();
  expect(
    await shared.locator(".suggested-recipe-link").allTextContents(),
  ).toEqual(before);
  const breakfasts = cards.filter({
    has: page.getByRole("button", {
      name: "Re-roll my breakfast",
      exact: true,
    }),
  });
  const a = breakfasts.nth(0),
    b = breakfasts.nth(1);
  const first = await a.locator(".suggested-recipe-link").allTextContents(),
    second = await b.locator(".suggested-recipe-link").allTextContents();
  await a.getByRole("button", { name: "Swap suggestion", exact: true }).click();
  await b.getByRole("button", { name: "Swap here", exact: true }).click();
  expect((await a.locator(".suggested-recipe-link").allTextContents())[0]).toBe(
    second[0],
  );
  expect((await b.locator(".suggested-recipe-link").allTextContents())[0]).toBe(
    first[0],
  );
  expect((await a.locator(".suggested-recipe-link").allTextContents())[1]).toBe(
    first[1],
  );
  expect((await b.locator(".suggested-recipe-link").allTextContents())[1]).toBe(
    second[1],
  );
  const sourceChoices = await page
    .locator(".preview-meal .suggested-recipe-link")
    .allTextContents();
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  const sourceNames = await page.locator(".meal-recipe-link").allTextContents();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page.getByRole("button", { name: "Copy a week", exact: true }).click();
  await page.getByLabel("Source week", { exact: true }).fill("2026-11-02");
  await page
    .getByRole("button", { name: "Preview copied week", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Review your menu suggestions",
      exact: true,
    }),
  ).toBeVisible();
  const copied = await page
    .locator(".preview-meal .suggested-recipe-link")
    .allTextContents();
  expect(copied.length).toBeGreaterThan(0);
  for (const name of copied) expect(sourceChoices).toContain(name);
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  expect(await page.locator(".meal-recipe-link").allTextContents()).toEqual(
    sourceNames,
  );
});

test("recipe stars save one informational rating without opening the editor", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Recipes", exact: true })
    .click();
  await page.getByRole("searchbox").fill("Chickpea and tomato toast");
  await page.locator(".recipe-card").first().click();
  await expect(page.getByText("Not rated yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rate 4 stars", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rate 4 stars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("4.0 / 5 · 1 rating", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rate 2 stars", exact: true }).click();
  await expect(
    page.getByText("2.0 / 5 · 1 rating", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").locator("input,textarea,select"),
  ).toHaveCount(0);
});

for (const lang of ["en", "es"] as const) {
  test(`${lang}: compact preview uses accessible icon actions and toggles padlocks`, async ({
    page,
  }) => {
    const t = (en: string, es: string) => (lang === "en" ? en : es);
    await page.setViewportSize({ width: 390, height: 844 });
    if (lang === "es")
      await page
        .getByRole("button", { name: "Switch language", exact: true })
        .click();
    if (lang === "es")
      await page
        .getByRole("button", { name: "Cambiar tema", exact: true })
        .click();
    await page
      .getByRole("navigation", {
        name: t("Mobile navigation", "Navegación móvil"),
      })
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Suggest week", "Sugerir semana"),
        exact: true,
      })
      .click();
    const reader = page.getByRole("dialog");
    await expect(reader.locator(".preview-date-range")).toHaveText(
      "02/11 - 08/11",
    );
    await expect(reader.locator(".preview-meal h3").first()).toHaveText(
      t("Tuesday · Breakfast", "martes · Desayuno"),
    );
    await expect(
      reader
        .getByRole("button", {
          name: t("Regenerate unlocked", "Regenerar no bloqueadas"),
        })
        .locator(".lucide-dices"),
    ).toHaveCount(1);
    const actions = reader.locator(".preview-action");
    expect(await actions.count()).toBeGreaterThan(20);
    expect(
      (await actions.allTextContents()).every((text) => text.trim() === ""),
    ).toBe(true);
    const breakfast = page
      .locator(".preview-meal")
      .filter({
        has: page.getByRole("button", {
          name: t("Re-roll my breakfast", "Volver a sugerir mi desayuno"),
          exact: true,
        }),
      })
      .first();
    const portions = breakfast.locator(".preview-portion");
    await expect(portions.nth(0).locator(".preview-action")).toHaveCount(4);
    await expect(portions.nth(1).locator(".preview-action")).toHaveCount(4);
    const lock = portions.first().getByRole("button", {
      name: t("Lock breakfast", "Bloquear desayuno"),
      exact: true,
    });
    await expect(lock.locator(".lucide-lock-open")).toHaveCount(1);
    const box = await lock.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await lock.click();
    const unlock = portions.first().getByRole("button", {
      name: t("Unlock breakfast", "Desbloquear desayuno"),
      exact: true,
    });
    await expect(unlock).toHaveAttribute("aria-pressed", "true");
    await expect(unlock.locator(".lucide-lock")).toHaveCount(1);
    await expect(unlock).toHaveAttribute(
      "title",
      t("Unlock breakfast", "Desbloquear desayuno"),
    );
    await expect(
      breakfast.getByRole("button", {
        name: t("Re-roll my breakfast", "Volver a sugerir mi desayuno"),
        exact: true,
      }),
    ).toBeDisabled();
    await page.screenshot({ path: `test-results/compact-preview-${lang}.png` });
    await unlock.click();
    await breakfast
      .getByRole("button", {
        name: t("Swap suggestion", "Intercambiar sugerencia"),
        exact: true,
      })
      .click();
    const cancel = breakfast.getByRole("button", {
      name: t("Cancel selected swap", "Cancelar intercambio seleccionado"),
      exact: true,
    });
    await expect(cancel).toHaveAttribute("aria-pressed", "true");
    await expect(cancel.locator(".lucide-arrow-down-up")).toHaveCount(1);
    await cancel.click();
    await expect(
      page.getByRole("button", {
        name: t("Swap here", "Intercambiar aquí"),
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("button", {
          name: t(
            "Approve suggestions & save",
            "Aprobar sugerencias y guardar",
          ),
          exact: true,
        })
        .locator(".lucide-check"),
    ).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("another member's breakfast can be re-rolled and swapped without changing the viewer", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  const onlyEmpty = page.getByRole("checkbox", {
    name: "Only empty slots",
    exact: true,
  });
  await expect(onlyEmpty).toBeChecked();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  const breakfasts = page.locator(".preview-meal").filter({
    has: page.getByRole("button", {
      name: "Re-roll breakfast for Noa",
      exact: true,
    }),
  });
  const first = breakfasts.nth(0),
    second = breakfasts.nth(1);
  const alex = await first
    .locator(".preview-portion-summary")
    .first()
    .innerText();
  const noa = await first
    .locator(".preview-portion-summary button.text-link")
    .nth(1)
    .innerText();
  await first
    .getByRole("button", { name: "Re-roll breakfast for Noa", exact: true })
    .click();
  await expect(
    first.locator(".preview-portion-summary button.text-link").nth(1),
  ).not.toHaveText(noa);
  await expect(first.locator(".preview-portion-summary").first()).toHaveText(
    alex,
  );
  const before = await first
    .locator(".preview-portion-summary button.text-link")
    .nth(1)
    .innerText();
  const destination = await second
    .locator(".preview-portion-summary button.text-link")
    .nth(1)
    .innerText();
  const secondAlex = await second
    .locator(".preview-portion-summary")
    .first()
    .innerText();
  await first
    .getByRole("button", { name: "Swap breakfast for Noa", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Swap here", exact: true }),
  ).toBeEnabled();
  await second
    .getByRole("button", { name: "Swap breakfast here for Noa", exact: true })
    .click();
  await expect(
    first.locator(".preview-portion-summary button.text-link").nth(1),
  ).toHaveText(destination);
  await expect(
    second.locator(".preview-portion-summary button.text-link").nth(1),
  ).toHaveText(before);
  await expect(first.locator(".preview-portion-summary").first()).toHaveText(
    alex,
  );
  await expect(second.locator(".preview-portion-summary").first()).toHaveText(
    secondAlex,
  );
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await expect(page.locator(".preview-meal")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await onlyEmpty.uncheck();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await expect(page.locator(".preview-meal").first()).toBeVisible();
});

test("calorie warnings are explained on demand and return focus to the yellow number", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page.getByRole("button", { name: "Cambiar tema", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Navegación móvil" })
    .getByRole("button", { name: "Menú", exact: true })
    .click();
  const erase = page.getByRole("button", {
    name: "Borrar semana",
    exact: true,
  });
  const copy = page.getByRole("button", {
    name: "Copiar una semana",
    exact: true,
  });
  await expect(erase.locator(".lucide-eraser")).toHaveCount(1);
  await expect(copy.locator(".lucide-import")).toHaveCount(1);
  expect(await erase.innerText()).toBe("");
  expect(await copy.innerText()).toBe("");
  await page
    .locator(".planner-controls")
    .screenshot({ path: "test-results/menu-controls-es.png" });
  await page
    .getByRole("button", { name: "Sugerir semana", exact: true })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Revisa las sugerencias del menú",
    exact: true,
  });
  const warning = preview.locator(".preview-calorie-warning").first();
  const explanation =
    "Las cantidades redondeadas superan el presupuesto. Ajusta las porciones manualmente después de guardar.";
  await expect(preview.getByText(explanation, { exact: true })).toHaveCount(0);
  await expect(warning).toHaveCSS("color", "rgb(245, 214, 106)");
  await page.screenshot({ path: "test-results/menu-suggestions-es.png" });
  await warning.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/calorie-number-es.png",
  });
  await warning.click();
  const help = page.getByRole("dialog", {
    name: "Calorías por encima del objetivo",
    exact: true,
  });
  await expect(help.getByText(explanation, { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/calorie-explanation-es.png",
  });
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(preview).toBeVisible();
  await expect(warning).toBeFocused();
});
