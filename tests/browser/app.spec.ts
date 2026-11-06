import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
});
test("dashboard, profile acceptance, logs, and member permissions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByLabel("What did you have?").fill("Coffee at the bar");
  await page.getByLabel("Estimated calories · required").fill("90");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(
    page.getByText("Coffee at the bar", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1790 kcal known intake")).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByLabel("Activity & pace or intensity").selectOption("17190");
  await page.getByLabel("Duration · minutes").fill("30");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByText("From logged activities today")).toBeVisible();
  await page.getByRole("button", { name: "Weight", exact: true }).click();
  await page.getByLabel("New weight · kg").fill("79");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Review your calorie target" }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Breakfast kcal", exact: true })
    .fill("410");
  await page
    .getByRole("spinbutton", { name: "Lunch kcal", exact: true })
    .fill("660");
  await page
    .getByRole("spinbutton", { name: "Dinner kcal", exact: true })
    .fill("670");
  await page.getByRole("button", { name: "Accept target & budgets" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("View household member").selectOption("noa");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Noa." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Food", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Edit profile" })).toHaveCount(
    0,
  );
  await page.getByLabel("View household member").selectOption("alex");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Target date", { exact: true }).fill("2028-11-03");
  await page.getByRole("button", { name: "Save & review target" }).click();
  await expect(
    page.getByRole("dialog", { name: "Review your calorie target" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close / Cerrar" }).click();
  expect(errors).toEqual([]);
});
test("owner invitations, recipe preparation, and all five tabs", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Invite member", exact: true })
    .click();
  await page.getByLabel("Google email address").fill("new@example.com");
  await page.getByRole("button", { name: "Approve invitation" }).click();
  await expect(
    page.getByText("new@example.com", { exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Recipes", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search collection" })
    .fill("Chickpea and tomato toast");
  await page.getByRole("button", { name: /Chickpea and tomato toast/ }).click();
  await expect(
    page.getByText(/Weigh dry, then soak at least 12 hours/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".day-card")).toHaveCount(7);
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The shopping list" }),
  ).toBeVisible();
});
test("mobile, dark mode, and Spanish remain usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Qué bien verte, Alex." }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.screenshot({
    path: "test-results/dashboard-mobile-dark-es.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Navegación móvil" })
    .getByRole("button", { name: "Menú", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Navegación móvil" })
    .getByRole("button", { name: "Recetas", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("desktop dashboard visual review", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
});
test("goal reached offers maintenance without automatically accepting it", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Weight", exact: true }).click();
  await page.getByLabel("New weight · kg").fill("75");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "You reached your goal" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review maintenance target", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review your calorie target" }),
  ).toBeVisible();
  await expect(page.locator(".target-proposal strong")).toContainText("2,348");
  await page.getByRole("button", { name: "Close / Cerrar" }).click();
  await expect(page.locator(".target-number")).toContainText("2,142");
});

test("menu actions stay together and planner preferences live in the person's profile", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  expect(
    await page
      .getByRole("button", { name: "Suggest week", exact: true })
      .evaluate((el) => el.nextElementSibling?.getAttribute("aria-label")),
  ).toBe("Delete week");
  await expect(page.getByLabel("Week starts on")).toHaveCount(0);
  await expect(page.getByLabel("Variety window · days")).toHaveCount(0);
  await nav.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Week starts on").selectOption("0");
  await expect(page.getByLabel("Week starts on")).toHaveValue("0");
  await page.getByLabel("Variety window · days").selectOption("5");
  await expect(page.getByLabel("Variety window · days")).toHaveValue("5");
  await expect(
    page.getByText(/they do not send phone notifications/),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".day-card h2").first()).toContainText("Sunday");
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await expect(page.locator(".preview-date-range")).toHaveText("01/11 - 07/11");
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Variety window · days")).toHaveValue("5");
  await page.getByLabel("View household member").selectOption("noa");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toHaveCount(0);
});

test("personal text size and emoji preferences survive navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await page
    .getByRole("combobox", { name: "View household member", exact: true })
    .selectOption("noa");
  await page
    .getByRole("button", { name: "Open my profile", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "View household member", exact: true }),
  ).toHaveValue("alex");
  await page
    .getByRole("combobox", { name: "Text size", exact: true })
    .selectOption("large");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await expect(
    page.getByRole("combobox", { name: "Your avatar", exact: true }),
  ).toHaveCount(0);
  const avatar = page.getByRole("button", {
    name: "Change my avatar",
    exact: true,
  });
  await avatar.click();
  const picker = page.getByRole("dialog", {
    name: "Choose your avatar",
    exact: true,
  });
  const cells = picker.locator(".emoji-choice");
  expect(await cells.count()).toBeGreaterThan(10);
  const first = await cells.nth(0).boundingBox(),
    second = await cells.nth(1).boundingBox();
  expect(first!.width).toBeGreaterThanOrEqual(44);
  expect(first!.height).toBeGreaterThanOrEqual(44);
  expect(first!.y).toBe(second!.y);
  expect(first!.x).toBeLessThan(second!.x);
  await page.screenshot({ path: "test-results/avatar-grid-mobile.png" });
  await picker.getByRole("button", { name: "Choose 🐱", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(avatar).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Open my profile", exact: true }),
  ).toContainText("🐱");
  await nav.getByRole("button", { name: "Recipes", exact: true }).click();
  await page
    .getByRole("button", { name: "New ingredient", exact: true })
    .count();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await page.getByRole("button", { name: "New recipe", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Emoji soup");
  await page
    .getByRole("combobox", { name: "Food emoji", exact: true })
    .selectOption("🍲");
  await page
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Ingredient", exact: true })
    .selectOption("oats");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("searchbox").fill("Emoji soup");
  await expect(page.locator(".recipe-card")).toContainText("🍲");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await nav.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(avatar).toContainText("🐱");
  await page
    .getByRole("combobox", { name: "View household member", exact: true })
    .selectOption("noa");
  await expect(avatar).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open my profile", exact: true })
    .click();
  await avatar.click();
  await expect(
    picker.getByRole("button", { name: "Choose 🐱", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(avatar).toBeFocused();
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cambiar mi avatar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Elige tu avatar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Elegir 🦊", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir mi perfil", exact: true }),
  ).toContainText("🦊");
});
