import { test, expect } from "@playwright/test";
for (const language of ["en", "es"] as const)
  test(`${language}: shared kitchen sessions, partial weights, profile access and online-only state`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    const t = (en: string, es: string) => (language === "en" ? en : es);
    await page.clock.setFixedTime(new Date("2026-11-10T08:00:00Z"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore the preview", exact: true })
      .click();
    if (language === "es")
      await page
        .getByRole("button", { name: "Switch language", exact: true })
        .click();
    const nav = page.getByRole("navigation", {
      name: t("Mobile navigation", "Navegación móvil"),
    });
    await expect(nav.getByRole("button")).toHaveCount(5);
    await expect(
      nav.getByRole("button", { name: t("Profile", "Perfil"), exact: true }),
    ).toHaveCount(0);
    await nav
      .getByRole("button", { name: t("Kitchen", "Cocina"), exact: true })
      .click();
    await page
      .getByText(t("Cooking settings", "Ajustes de cocina"), { exact: true })
      .click();
    await page
      .getByLabel(t("Cooking timezone", "Zona horaria de cocina"), {
        exact: true,
      })
      .fill("UTC");
    await page
      .getByRole("button", {
        name: t("Add cooking time", "Añadir horario"),
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", {
        name: t("Weekday", "Día de la semana"),
        exact: true,
      })
      .selectOption("2");
    await page
      .getByLabel(t("Session time", "Hora de la sesión"), { exact: true })
      .fill("10:00");
    await page
      .getByRole("button", {
        name: t("Save cooking settings", "Guardar configuración de cocina"),
        exact: true,
      })
      .click();
    await nav
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
    await page
      .getByLabel(
        t(
          "Generate week for batch cooking",
          "Generar semana para batch cooking",
        ),
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", {
        name: t("Suggest week", "Sugerir semana"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav
      .getByRole("button", { name: t("Kitchen", "Cocina"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Propose sessions", "Proponer sesiones"),
        exact: true,
      })
      .click();
    const proposal = page.getByRole("region", {
      name: t("Session proposal", "Propuesta de sesiones"),
    });
    await expect(proposal).toContainText("10");
    await expect(
      proposal.locator(".cooking-preparation-details[open]"),
    ).toHaveCount(0);
    await expect(
      proposal.locator(".cooking-preparation-details"),
    ).not.toHaveCount(0);
    await page
      .getByRole("button", {
        name: t("Confirm sessions", "Confirmar sesiones"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: t("Register cooked batch", "Registrar tanda cocinada"),
        exact: true,
      })
      .first()
      .click();
    const modal = page.getByRole("dialog");
    await modal
      .getByLabel(
        t(
          "Total cooked weight (g), optional",
          "Peso total cocinado (g), opcional",
        ),
        { exact: true },
      )
      .fill("1000");
    await modal
      .getByRole("button", {
        name: t("Confirm batch and storage", "Confirmar tanda y conservación"),
        exact: true,
      })
      .click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator(".cooking-batch").first()).toContainText("1000");
    const firstBatch = page.locator(".cooking-batch").first();
    await firstBatch.locator(":scope > summary").click();
    await firstBatch.locator(".cooking-stock > summary").click();
    await firstBatch
      .getByRole("button", {
        name: t("Confirm consumed", "Confirmar consumo"),
        exact: true,
      })
      .first()
      .click();
    await expect(firstBatch).toContainText(
      t("Consumption confirmed", "Consumo confirmado"),
    );
    await firstBatch
      .getByRole("button", { name: t("Left over", "Sobró"), exact: true })
      .first()
      .click();
    await firstBatch
      .getByRole("button", {
        name: t("Propose reassignment", "Proponer reasignación"),
        exact: true,
      })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: new RegExp(t("Confirm reservation", "Confirmar reserva")),
      })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await firstBatch.locator(".cooking-stock > summary").click();
    await page.screenshot({
      path: `test-results/cooking-${language}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await context.setOffline(true);
    await expect(
      page.getByRole("heading", {
        name: t("Your household, offline", "Tu hogar, sin conexión"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: t("Register cooked batch", "Registrar tanda cocinada"),
        exact: true,
      }),
    ).toHaveCount(0);
    await context.setOffline(false);
    await nav
      .getByRole("button", { name: t("Kitchen", "Cocina"), exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: t("Propose sessions", "Proponer sesiones"),
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await nav
      .getByRole("button", { name: t("Kitchen", "Cocina"), exact: true })
      .click();
    await expect(page.locator(".cooking-batch").first()).toContainText("1000");
    await page
      .getByRole("button", {
        name: t("Open my profile", "Abrir mi perfil"),
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel(t("Lunch time", "Hora del almuerzo"), { exact: true }),
    ).toBeVisible();
  });

for (const language of ["en", "es"] as const)
  test(`${language}: a loaded week shows only a compact actionable summary, with past and duplicate requirements omitted`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const t = (en: string, es: string) => (language === "en" ? en : es);
    await page.clock.setFixedTime(new Date("2026-11-09T08:00:00Z"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Explore the preview", exact: true })
      .click();
    if (language === "es")
      await page
        .getByRole("button", { name: "Switch language", exact: true })
        .click();
    const nav = page.getByRole("navigation", {
      name: t("Mobile navigation", "Navegación móvil"),
    });
    await nav
      .getByRole("button", { name: t("Menu", "Menú"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Suggest week", "Sugerir semana"),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: t("Approve suggestions & save", "Aprobar sugerencias y guardar"),
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav
      .getByRole("button", { name: t("Kitchen", "Cocina"), exact: true })
      .click();
    await page.locator(".cooking-settings > summary").click();
    await page
      .getByLabel(t("Cooking timezone", "Zona horaria de cocina"), {
        exact: true,
      })
      .fill("UTC");
    await page
      .getByRole("button", {
        name: t("Add cooking time", "Añadir horario"),
        exact: true,
      })
      .click();
    await page
      .getByLabel(t("Session time", "Hora de la sesión"), { exact: true })
      .fill("10:00");
    await page
      .getByRole("button", {
        name: t("Save cooking settings", "Guardar configuración de cocina"),
        exact: true,
      })
      .click();
    await page.clock.setFixedTime(new Date("2026-11-12T18:24:00Z"));
    await page.reload();
    await nav
      .getByRole("button", { name: t("Kitchen", "Cocina"), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: t("Propose sessions", "Proponer sesiones"),
        exact: true,
      })
      .click();
    const proposal = page.getByRole("region", {
      name: t("Session proposal", "Propuesta de sesiones"),
    });
    const counts = await page.evaluate(() => {
      const state = JSON.parse(
        sessionStorage.getItem("week-menu-demo-server")!,
      ).cooking;
      const future = state.requirements.filter(
        (r: { due_at: string }) =>
          Date.parse(r.due_at) > Date.parse(state.server_now),
      );
      return {
        raw: future.length,
        meals: new Set(
          future.map(
            (r: { day: string; type: string }) => `${r.day}/${r.type}`,
          ),
        ).size,
      };
    });
    expect(counts.meals).toBeGreaterThan(0);
    expect(counts.raw).toBeGreaterThan(counts.meals);
    await expect(
      proposal.getByRole("button", {
        name: t("Confirm sessions", "Confirmar sesiones"),
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(proposal.locator(".cooking-gap-details")).not.toHaveAttribute(
      "open",
    );
    expect((await proposal.innerText()).length).toBeLessThan(350);
    await expect(proposal.locator(".cooking-past-summary")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: t("Sessions and batches", "Sesiones y tandas"),
        exact: true,
      }),
    ).toHaveCount(0);
    if (language === "es") {
      await page
        .getByRole("button", { name: "Cambiar tema", exact: true })
        .click();
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "24px"),
      );
    }
    await page.screenshot({
      path: `test-results/compact-kitchen-${language}.png`,
      fullPage: true,
    });
    await proposal.locator(".cooking-gap-details > summary").click();
    await expect(proposal.locator(".cooking-gap-meals > li")).toHaveCount(
      counts.meals,
    );
    await expect(proposal).not.toContainText("Alex");
    await expect(proposal).not.toContainText("Noa");
    await expect(proposal).not.toContainText("2026-11-09");
    await page.setViewportSize({ width: 320, height: 780 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await proposal
      .getByRole("button", {
        name: t("Adjust cooking times", "Ajustar horarios"),
        exact: true,
      })
      .click();
    await expect(page.locator(".cooking-settings")).toHaveAttribute("open", "");
    await expect(
      page.getByLabel(t("Session time", "Hora de la sesión"), { exact: true }),
    ).toBeFocused();
  });
