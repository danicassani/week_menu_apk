import { test, expect } from "@playwright/test";
test("budgets form one four-column row below the whole daily card in light and dark mode", async ({
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
      const boxes = await page
        .locator(".dashboard-budget-strip")
        .evaluate((el) => {
          const cells = [...el.querySelector(".budget-values")!.children].map(
            (cell) => {
              const box = cell.getBoundingClientRect(),
                number = cell
                  .querySelector("b,strong")!
                  .getBoundingClientRect();
              return { left: box.left, top: box.top, numberTop: number.top };
            },
          );
          return {
            cells,
            top: el.getBoundingClientRect().top,
            cardBottom: document
              .querySelector(".target-card")!
              .getBoundingClientRect().bottom,
          };
        });
      expect(boxes.cells).toHaveLength(4);
      expect(boxes.top).toBeGreaterThanOrEqual(boxes.cardBottom);
      for (let i = 1; i < 4; i++) {
        expect(boxes.cells[i].left).toBeGreaterThan(boxes.cells[i - 1].left);
        expect(Math.abs(boxes.cells[i].top - boxes.cells[0].top)).toBeLessThan(
          1,
        );
        expect(
          Math.abs(boxes.cells[i].numberTop - boxes.cells[0].numberTop),
        ).toBeLessThan(1);
      }
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
  await page
    .getByRole("heading", { name: "Review the change", exact: true })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(margin).toHaveClass(/budget-margin--exceeded/);
  await expect(margin).toHaveCSS("color", "rgb(252, 165, 165)");
  await expect(margin).toContainText("-");
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(
    page.getByRole("group", { name: "Presupuestos personales" }),
  ).toContainText("Desayuno");
  await page
    .locator(".daily-picture")
    .screenshot({ path: "test-results/dashboard-budget-row-es-dark.png" });
});
