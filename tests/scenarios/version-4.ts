import { expect, type Page } from "@playwright/test";
export async function versionFourScenario(
  page: Page,
  language: "en" | "es",
  outputPath: (name: string) => string,
) {
  const t = (en: string, es: string) => (language === "en" ? en : es);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  if (language === "es") {
    await page
      .getByRole("button", { name: "Switch language", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cambiar tema", exact: true })
      .click();
  }
  await expect(page.locator(".week-glance,.shopping-shortcut")).toHaveCount(0);
  const nav = page.getByRole("navigation", {
    name: t("Mobile navigation", "Navegación móvil"),
  });
  await nav
    .getByRole("button", { name: t("Menu", "Menú"), exact: true })
    .click();
  const day = page.locator(".day-card").nth(1),
    breakfast = day.locator(".meal-card").nth(0),
    lunch = day.locator(".meal-card").nth(1);
  const approve = () =>
    page
      .getByRole("button", {
        name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
        exact: true,
      })
      .click();
  await breakfast
    .getByRole("button", { name: t("Suggest", "Sugerir"), exact: true })
    .click();
  await approve();
  const row = breakfast.locator(".meal-bottom-actions");
  await expect(row.getByRole("button")).toHaveCount(1);
  await expect(row.locator(".meal-more")).not.toHaveAttribute("open");
  await row.locator(".meal-more > summary").click();
  await expect(row.getByRole("button")).toHaveCount(5);
  const boxes = await row.getByRole("button").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  for (let i = 1; i < boxes.length; i++)
    expect(
      boxes[i].top >= boxes[i - 1].bottom + 4 ||
        boxes[i].left >= boxes[i - 1].right + 4,
    ).toBe(true);
  const labels = await row
    .getByRole("button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  await expect(
    row.getByRole("button", { name: t("Change", "Cambiar"), exact: true }),
  ).toBeVisible();
  expect(labels[1]).toBe(t("Preview another recipe", "Probar otra receta"));
  expect(labels[2]).toContain(t("Copy", "Copiar"));
  expect(labels[3]).toBe(t("Remove meal", "Eliminar comida"));
  expect(labels[4]).toContain(t("Swap", "Intercambiar"));
  await breakfast
    .getByRole("button", {
      name: t("View recipe", "Ver receta"),
      exact: true,
    })
    .click();
  await expect(page.locator(".portion-allocation")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await lunch
    .getByRole("button", { name: t("Suggest", "Sugerir"), exact: true })
    .click();
  await approve();
  await lunch
    .getByRole("button", {
      name: t("View recipe", "Ver receta"),
      exact: true,
    })
    .click();
  await expect(page.locator(".household-meal")).toBeVisible();
  await expect(page.locator(".portion-distribution")).not.toHaveAttribute(
    "open",
  );
  await expect(page.locator(".allocation-pie")).toHaveCount(0);
  await page.screenshot({
    path: outputPath(`shared-bar-${language}.png`),
  });
  await page.keyboard.press("Escape");
  await day.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: outputPath(`menu-icons-${language}.png`),
  });
  const check = page.locator(".day-card").first().locator(".closed-day-check");
  const appearance = () =>
    check.evaluate((e) => {
      const s = getComputedStyle(e);
      return [s.color, s.backgroundColor, s.borderWidth];
    });
  const before = await appearance();
  for (let i = 0; i < 4; i++) await check.click();
  expect(await appearance()).toEqual(before);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await check.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await nav
    .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
    .click();
  await page.locator(".shopping-sync-details > summary").click();
  await expect(
    page.getByRole("button", {
      name: t("Sync now", "Sincronizar ahora"),
      exact: true,
    }),
  ).toHaveClass(/button/);
  await page.evaluate(() => {
    const raw = sessionStorage.getItem("week-menu-demo-server");
    if (!raw) throw Error("missing preview fixture");
    const saved = JSON.parse(raw);
    saved.shopping.items.forEach((item: any) => {
      item.increased = true;
      item.checked = false;
    });
    sessionStorage.setItem("week-menu-demo-server", JSON.stringify(saved));
  });
  await page.reload();
  await nav
    .getByRole("button", { name: t("Shopping", "Compra"), exact: true })
    .click();
  await expect(
    page.locator(".quantity-increased,.shopping-checklist .increased"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await nav
    .getByRole("button", { name: t("Menu", "Menú"), exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 780 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await page.locator(".day-card").nth(1).scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: outputPath(`menu-large-${language}.png`) });
}
