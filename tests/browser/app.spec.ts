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
