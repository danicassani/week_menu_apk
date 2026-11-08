import { expect, type Page } from "@playwright/test";
export async function recipeReviewScenario(
  page: Page,
  language: "en" | "es",
  capture: string,
) {
  const t = (en: string, es: string) => (language === "en" ? en : es);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex.", exact: true }),
  ).toBeVisible();
  if (language === "es")
    await page
      .getByRole("button", { name: "Switch language", exact: true })
      .click();
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("week-menu-demo-server")!);
    const base = saved.library.recipes[0];
    for (let i = 0; i < 13; i++)
      saved.library.recipes.push({
        ...base,
        id: `review-extra-${i}`,
        revision: 1,
        name: {
          en: `ZZ review ${String(i).padStart(2, "0")}`,
          es: `ZZ repaso ${String(i).padStart(2, "0")}`,
        },
      });
    saved.recipeReviews = Object.fromEntries(
      saved.library.recipes
        .slice(0, -2)
        .map((r: { id: string; revision: number }) => [r.id, r.revision ?? 1]),
    );
    sessionStorage.setItem("week-menu-demo-server", JSON.stringify(saved));
  });
  await page.reload();
  const nav = page.getByRole("navigation", {
    name: t("Mobile navigation", "Navegación móvil"),
  });
  await nav
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(50);
  const first = await page.locator(".recipe-card").first().elementHandle();
  const open = () =>
    page
      .getByRole("button", {
        name: t("Recipe Tinder", "Tinder de recetas"),
        exact: true,
      })
      .click();
  await open();
  const modal = page.getByRole("dialog", {
    name: t("Recipe Tinder", "Tinder de recetas"),
    exact: true,
  });
  await expect(modal.locator(".review-progress")).toContainText("59 / 61");
  await expect(modal.locator(".recipe-review-card")).toContainText(
    t("ZZ review 11", "ZZ repaso 11"),
  );
  const card = modal.locator(".recipe-review-card");
  await page.screenshot({ path: capture });
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + 35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, box.y + 36, { steps: 8 });
  await page.mouse.up();
  await expect(modal.locator(".review-progress")).toContainText("60 / 61");
  await expect(card).toContainText(t("ZZ review 12", "ZZ repaso 12"));
  await modal
    .getByRole("button", { name: t("Close", "Cerrar"), exact: true })
    .click();
  expect(await first!.evaluate((el) => el.isConnected)).toBe(true);
  await expect(page.locator(".recipe-card")).toHaveCount(50);
  await open();
  await expect(modal.locator(".review-progress")).toContainText("60 / 61");
  await expect(card).toContainText(t("ZZ review 12", "ZZ repaso 12"));
  // Right swipe accepts the final recipe; both button alternatives remain available.
  await expect(
    modal.getByRole("button", { name: t("Accept", "Aceptar"), exact: true }),
  ).toBeEnabled();
  const last = (await card.boundingBox())!;
  await page.mouse.move(last.x + last.width * 0.15, last.y + 35);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width * 0.8, last.y + 36, { steps: 8 });
  await page.mouse.up();
  await expect(modal).toContainText(
    t("All recipes reviewed", "Todas las recetas revisadas"),
  );
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("week-menu-demo-server")!),
  );
  expect(
    saved.library.recipes.find(
      (r: { id: string }) => r.id === "review-extra-11",
    ).banned,
  ).toBe(true);
  expect(
    saved.library.recipes.find(
      (r: { id: string }) => r.id === "review-extra-12",
    ).banned,
  ).toBe(false);
  await modal
    .getByRole("button", { name: t("Close", "Cerrar"), exact: true })
    .click();
  await page.reload();
  await nav
    .getByRole("button", { name: t("Recipes", "Recetas"), exact: true })
    .click();
  await open();
  await expect(modal).toContainText(
    t("All recipes reviewed", "Todas las recetas revisadas"),
  );
  page.once("dialog", (d) => d.accept());
  await modal
    .getByRole("button", {
      name: t("Start again", "Volver a empezar"),
      exact: true,
    })
    .click();
  await expect(modal.locator(".review-progress")).toContainText("0 / 61");
  const after = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("week-menu-demo-server")!),
  );
  expect(
    after.library.recipes.find(
      (r: { id: string }) => r.id === "review-extra-11",
    ).banned,
  ).toBe(true);
}
