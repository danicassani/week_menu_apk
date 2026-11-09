import { test, expect } from "@playwright/test";
test("budgets sit below the daily heading with a responsive green/red margin in light and dark mode", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const margin = page.getByRole("status", { name: "Daily budget margin" });
  await expect(margin).toHaveClass(/budget-margin--available/);
  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark")
      await page
        .getByRole("button", { name: "Switch theme", exact: true })
        .click();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(margin).toHaveCSS(
        "color",
        mode === "light" ? "rgb(22, 101, 52)" : "rgb(134, 239, 172)",
      );
      const boxes = await page.locator(".budget-strip").evaluate((el) => {
        const group = el.firstElementChild!.getBoundingClientRect(),
          m = el.querySelector(".budget-margin")!.getBoundingClientRect();
        return { right: group.right, marginLeft: m.left };
      });
      expect(boxes.marginLeft).toBeGreaterThanOrEqual(boxes.right - 1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole("button", { name: "Adjust meal budgets", exact: true })
    .click();
  for (const meal of ["Breakfast", "Lunch", "Dinner"])
    await page.getByLabel(`${meal} kcal`, { exact: true }).fill("2000");
  await page
    .getByRole("button", { name: "Save overrides", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(margin).toHaveClass(/budget-margin--exceeded/);
  await expect(margin).toHaveCSS("color", "rgb(252, 165, 165)");
  await expect(margin).toContainText("-");
  await page
    .locator(".target-card")
    .screenshot({ path: "test-results/dashboard-budget-margin-dark.png" });
});
