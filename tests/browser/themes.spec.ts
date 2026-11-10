import { test, expect } from "@playwright/test";
import { themesScenario } from "../scenarios/themes";
for (const language of ["en", "es"] as const)
  test(`${language}: fourteen device themes, keyboard, large text and sign-out persistence`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await themesScenario(page, language, (name) => info.outputPath(name));
  });
test("legacy light/dark preference survives; corrupt colour and blocked storage fall back safely", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("week-menu-theme", "dark");
    localStorage.setItem("week-menu-colour-v1", "unknown");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-colour", "white");
  await page.evaluate(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "week-menu-colour-v1",
        newValue: "blue",
      }),
    );
  });
  await expect(page.locator("html")).toHaveAttribute("data-colour", "blue");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("storage blocked");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-colour", "white");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open my profile", exact: true })
    .click();
  await page.getByRole("radio", { name: "Pink", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-colour", "pink");
});
