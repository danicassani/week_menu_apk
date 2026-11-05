import { test, expect } from "@playwright/test";
for (const language of ["en", "es"] as const) {
  test(`${language}: complete mobile plan, shopping, offline recovery and personal food workflow`, async ({
    page,
    context,
  }) => {
    const t = (en: string, es: string) => (language === "en" ? en : es),
      errors: string[] = [],
      csp: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      document.addEventListener(
        "securitypolicyviolation",
        (e) =>
          ((window as any).cspFailures = (
            (window as any).cspFailures ?? []
          ).concat(e.violatedDirective)),
      ),
    );
    await page.clock.setFixedTime(new Date("2026-11-04T12:00:00Z"));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore the preview", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Good to see you, Alex." }),
    ).toBeVisible();
    if (language === "es")
      await page
        .getByRole("button", { name: "Switch language", exact: true })
        .click();
    await page
      .getByRole("button", {
        name: t("Switch theme", "Cambiar tema"),
        exact: true,
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page
      .getByRole("button", { name: t("Food", "Comida"), exact: true })
      .click();
    await page
      .getByLabel(t("What did you have?", "¿Qué has tomado?"))
      .fill("Coffee at the bar");
    await page
      .getByLabel(
        t("Estimated calories · required", "Calorías estimadas · obligatorio"),
      )
      .fill("90");
    await page
      .getByRole("button", {
        name: t("Save entry", "Guardar registro"),
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Coffee at the bar", { exact: true }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", {
      name: t("Mobile navigation", "Navegación móvil"),
    });
    await nav
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Suggest the week", "Sugerir la semana"),
        exact: true,
      })
      .click();
    await expect(page.locator(".preview-meal")).not.toHaveCount(0);
    await page
      .getByRole("button", {
        name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav
      .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
      .click();
    await expect(
      page.getByRole("searchbox", {
        name: t("Search collection", "Buscar en la colección"),
      }),
    ).toBeVisible();
    await nav
      .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("checkbox").first()).toBeEnabled();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    csp.push(...(await page.evaluate(() => (window as any).cspFailures ?? [])));
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: t("Your household, offline", "Tu hogar, sin conexión"),
      }),
    ).toBeVisible();
    const checkbox = page.getByRole("checkbox").first(),
      label = await checkbox.getAttribute("aria-label");
    await checkbox.click();
    await expect(
      page.getByRole("checkbox", { name: label!, exact: true }),
    ).toBeChecked();
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: label!, exact: true }),
    ).toBeChecked();
    await expect(page.locator(".shopping-progress")).toContainText(
      t("1 pending sync", "1 por sincronizar"),
    );
    await context.setOffline(false);
    await expect(
      page.getByRole("heading", {
        name: t("Good to see you, Alex.", "Qué bien verte, Alex."),
      }),
    ).toBeVisible();
    await page
      .getByRole("navigation", {
        name: t("Mobile navigation", "Navegación móvil"),
      })
      .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
      .click();
    await expect(page.locator(".sync-status")).toContainText(
      t("Connected", "Con conexión"),
    );
    await expect(page.locator(".shopping-progress .pill")).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: label!, exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: `test-results/release/${test.info().project.name}-${language}.png`,
      fullPage: true,
    });
    expect(csp).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test("keyboard modal focus stays trapped and returns to the invoking control", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const trigger = page.getByRole("button", { name: "Food", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("installation UI uses the browser prompt or iOS home-screen instructions", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  if (browserName === "webkit") {
    await page
      .getByRole("button", { name: "Install app", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Install on iPhone or iPad" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Tap Share, then Add to Home Screen/),
    ).toBeVisible();
  } else {
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          (window as any).installPromptRequested = true;
        },
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });
    await page
      .getByRole("button", { name: "Install app", exact: true })
      .click();
    expect(
      await page.evaluate(() => (window as any).installPromptRequested),
    ).toBe(true);
  }
});
test("another member is read-only, and offline sign-out clears that device’s saved views", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page.getByLabel("View household member").selectOption("noa");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Noa." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Food", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Shopping", exact: true })
    .click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Product", { exact: true })
    .fill("Release checklist item");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("checkbox")).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sync first" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Discard changes & sign out" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Release checklist item", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toHaveCount(0);
});
