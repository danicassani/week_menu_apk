import { test, expect } from "@playwright/test";
test("recalculates the viewed week's planned meals after budgets change and updates shopping", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Suggest week", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve suggestions & save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const stored = () =>
    page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("week-menu-demo-server")!),
    );
  const original = await stored();
  await nav.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Adjust meal budgets", exact: true })
    .click();
  for (const [meal, budget] of [
    ["Breakfast", "800"],
    ["Lunch", "900"],
    ["Dinner", "1000"],
  ])
    await page.getByLabel(`${meal} kcal`, { exact: true }).fill(budget);
  await page
    .getByRole("button", { name: "Save overrides", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Recalculate quantities", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Recalculate quantities",
    exact: true,
  });
  await expect(review).toBeVisible();
  expect((await stored()).library.plans).toEqual(original.library.plans);
  await review
    .getByRole("button", { name: "Apply quantities", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  const saved = await stored();
  for (const plan of saved.library.plans) {
    const before = original.library.plans.find(
      (p: any) => p.day === plan.day && p.type === plan.type,
    );
    expect(before).toBeTruthy();
    for (const portion of plan.portions) {
      const prior = before.portions.find(
        (p: any) => p.member_id === portion.member_id,
      );
      expect(portion.recipe_id).toBe(prior.recipe_id);
      expect(portion.substitutions).toEqual(prior.substitutions);
      expect(portion.dessert).toBe(prior.dessert);
      expect(
        portion.lines.map((l: any) => [
          l.ingredient_id,
          l.component_id,
          l.unit,
        ]),
      ).toEqual(
        prior.lines.map((l: any) => [l.ingredient_id, l.component_id, l.unit]),
      );
      if (plan.day === "2026-11-03" && portion.member_id === "alex") {
        const budget = (
          { breakfast: 800, lunch: 900, dinner: 1000 } as Record<string, number>
        )[plan.type];
        expect(portion.budget).toBe(budget);
        expect(Math.abs(portion.kcal - budget)).toBeLessThan(
          Math.abs(prior.kcal - budget),
        );
      }
    }
  }
  expect(
    saved.shopping.items.some(
      (item: any) =>
        item.source === "generated" &&
        original.shopping.items.some(
          (old: any) => old.id === item.id && old.quantity !== item.quantity,
        ),
    ),
  ).toBe(true);
});
