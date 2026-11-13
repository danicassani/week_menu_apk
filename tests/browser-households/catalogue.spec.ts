import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test, expect } from "@playwright/test";
import { PreviewRepository } from "../../src/lib/preview-repository";
import { emptyShopping } from "../../src/domain/shopping";
test("authenticated browsing requests 50 summaries and compact snapshots, without a hidden full-library fetch", async ({
  page,
}, info) => {
  const source = await new PreviewRepository("UTC").load("UTC"),
    full = source.planning!;
  const context = {
    account_id: "71000000-0000-0000-0000-000000000001",
    household_id: "71000000-0000-0000-0000-000000000002",
    membership_id: source.viewer_id,
  };
  const state = {
    ...source,
    context,
    household: { ...source.household, id: context.household_id },
    meals: [],
    shopping: emptyShopping(),
    planning: {
      complete: false,
      recipes: [],
      ingredients: [],
      plans: [],
      substitutions: [],
      revision: 1,
    },
  };
  const summaries = Array.from({ length: 110 }, (_, i) => ({
    id: `fixture_${i}`,
    name: { en: `Recipe number ${i}`, es: `Receta número ${i}` },
    meal_types: ["lunch", "dinner"],
    revision: 1,
    archived: false,
  }));
  const user = {
    id: context.account_id,
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "google" },
    user_metadata: { full_name: "Alex" },
    created_at: "2026-01-01T00:00:00Z",
  };
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      {
        sub: user.id,
        exp: 4102444800,
        aud: "authenticated",
        role: "authenticated",
      },
    ]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".") + ".test-only";
  await page.addInitScript(
    ({ user, token }) =>
      localStorage.setItem(
        "sb-household-tests-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-only",
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ),
    { user, token },
  );
  await page.routeWebSocket("wss://household-tests.supabase.co/**", (ws) =>
    ws.close(),
  );
  const requests: { name: string; args: any; bytes: number }[] = [];
  let rejectActivity = true,
    failReads = false;
  await page.route("https://household-tests.supabase.co/**", async (route) => {
    const request = route.request(),
      name = new URL(request.url()).pathname.split("/").pop()!;
    if (!request.url().includes("/rest/v1/rpc/")) {
      await route.fulfill({ json: user });
      return;
    }
    const args = request.postDataJSON() ?? {};
    let data: unknown = null;
    if (name === "save_my_daily_entry") {
      requests.push({ name, args, bytes: 0 });
      if (rejectActivity) {
        await route.fulfill({
          status: 400,
          json: { code: "P0001", message: "invalid_entry" },
        });
        return;
      }
      failReads = true;
      await route.fulfill({ json: null });
      return;
    }
    if (name === "get_household_snapshot" && failReads) {
      await route.fulfill({
        status: 500,
        json: { code: "XX000", message: "read unavailable" },
      });
      return;
    }

    if (name === "get_household_access")
      data = { active: context, invitations: [] };
    else if (name === "get_household_snapshot") data = state;
    else if (name === "get_shopping_state") data = emptyShopping();
    else if (name === "get_catalogue_page") {
      const selected = summaries.filter((i) =>
        i.name.en.toLowerCase().includes(args.p_query.toLowerCase()),
      );
      const start = Number(args.p_cursor ?? 0);
      data = {
        items: selected.slice(start, start + 50),
        next_cursor: start + 50 < selected.length ? String(start + 50) : null,
      };
    } else if (name === "get_planning_library")
      data = { ...full, revision: 1, complete: true };
    requests.push({
      name,
      args,
      bytes: Buffer.byteLength(JSON.stringify(data)),
    });
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex.", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", {
    name:
      info.project.name === "desktop-chromium"
        ? "Main navigation"
        : "Mobile navigation",
  });
  await page
    .getByRole("button", { name: "Open my profile", exact: true })
    .click();
  const themeWrites = requests.filter((r) => !r.name.startsWith("get_")).length;
  await page
    .getByRole("radio", { name: "Blue", exact: true })
    .locator("..")
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-colour", "blue");
  expect(requests.filter((r) => !r.name.startsWith("get_")).length).toBe(
    themeWrites,
  );
  await nav.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(50);
  expect(
    requests.filter((r) => r.name === "get_planning_library"),
  ).toHaveLength(0);
  expect(
    requests.find((r) => r.name === "get_household_snapshot")?.args.p_compact,
  ).toBe(true);
  await page
    .getByRole("button", { name: "Load 50 more recipes", exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(100);
  await page
    .getByRole("searchbox", { name: "Search collection", exact: true })
    .fill("Recipe number 109");
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await expect(page.locator(".recipe-card")).toContainText("Recipe number 109");
  expect(
    requests.filter((r) => r.name === "get_planning_library"),
  ).toHaveLength(0);
  await nav.getByRole("button", { name: "Overview", exact: true }).click();
  const recent = () =>
    page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("week-menu:activity-recent:v1:"),
      ),
    );
  const fillActivity = async () => {
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page.getByLabel("Activity type").selectOption("walking");
    await page.getByLabel("Pace or intensity").selectOption("17190");
    await page.getByLabel("Duration · minutes").fill("20");
    await page.getByRole("button", { name: "Save entry", exact: true }).click();
  };
  await fillActivity();
  await expect
    .poll(() => requests.filter((r) => r.name === "save_my_daily_entry").length)
    .toBe(1);
  expect(await recent()).toHaveLength(0);
  await page.keyboard.press("Escape");
  rejectActivity = false;
  await fillActivity();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => recent()).toHaveLength(1);
  await expect(
    page.getByText(
      "Changes saved. The latest view could not be loaded. Refresh to update it.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests.filter((r) => r.name === "save_my_daily_entry")).toHaveLength(
    2,
  );
  const payloadPath = info.outputPath("catalogue-payload.json");
  mkdirSync(dirname(payloadPath), { recursive: true });
  writeFileSync(
    payloadPath,
    JSON.stringify(
      {
        requests,
        initial_snapshot_bytes: Buffer.byteLength(JSON.stringify(state)),
        full_snapshot_bytes: Buffer.byteLength(JSON.stringify(source)),
      },
      null,
      2,
    ),
  );
  await info.attach("catalogue-payload.json", {
    path: payloadPath,
    contentType: "application/json",
  });
});
