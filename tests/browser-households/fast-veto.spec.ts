import { clickDisclosedAction } from "../browser/helpers/actions";
import { test, expect } from "@playwright/test";
import { PreviewRepository } from "../../src/lib/preview-repository";
test("veto uses one write without snapshot/catalogue reload and keeps all loaded cards", async ({
  page,
}, info) => {
  const source = await new PreviewRepository("UTC").load("UTC");
  const template = source.planning!.recipes[0];
  const context = {
    account_id: "74000000-0000-0000-0000-000000000001",
    household_id: "74000000-0000-0000-0000-000000000002",
    membership_id: source.viewer_id,
  };
  const state = {
    ...source,
    context,
    household: { ...source.household, id: context.household_id },
    planning: {
      ...source.planning!,
      recipes: [],
      ingredients: [],
      plans: [],
      complete: false,
      revision: 10,
    },
  };
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
  const calls: string[] = [];
  let releaseSecond: () => void = () => {};
  const secondWrite = new Promise<void>((resolve) => (releaseSecond = resolve));
  let veto = false,
    vetoRevision = 0;
  const all = Array.from({ length: 110 }, (_, i) => ({
    ...template,
    id: `recipe-${i}`,
    name: { en: `Recipe ${i}`, es: `Receta ${i}` },
    revision: 1,
    banned: false,
    veto_revision: 0,
  }));
  await page.route("https://household-tests.supabase.co/**", async (route) => {
    const req = route.request(),
      method = new URL(req.url()).pathname.split("/").pop()!,
      args = req.postDataJSON() ?? {};
    if (!req.url().includes("/rest/v1/rpc/")) {
      await route.fulfill({ json: user });
      return;
    }
    calls.push(method);
    let data: unknown = null;
    if (method === "get_household_access")
      data = { active: context, invitations: [] };
    else if (method === "get_household_snapshot") data = state;
    else if (method === "get_catalogue_page") {
      if (args.p_kind === "ingredient")
        data = {
          items: [
            {
              id: "recipe-0",
              name: { en: "Ingredient row", es: "Ingrediente" },
              revision: 1,
              archived: false,
            },
          ],
          next_cursor: null,
        };
      else {
        const start = Number(args.p_cursor ?? 0);
        data = {
          items: all.slice(start, start + 50).map((r) => ({
            ...r,
            banned: r.id === "recipe-0" ? veto : false,
            veto_revision: r.id === "recipe-0" ? vetoRevision : 0,
          })),
          next_cursor: start + 50 < all.length ? String(start + 50) : null,
        };
      }
    } else if (method === "get_catalogue_item")
      data = {
        item: {
          ...all.find((r) => r.id === args.p_id)!,
          banned: veto,
          veto_revision: vetoRevision,
        },
        ingredients: source.planning!.ingredients,
      };
    else if (method === "set_recipe_veto") {
      expect(args.p_household_id).toBe(context.household_id);
      expect(args.p_membership_id).toBe(context.membership_id);
      veto = args.p_banned;
      vetoRevision++;
      if (vetoRevision === 2) await secondWrite;
      data = {
        ...all[0],
        banned: veto,
        veto_revision: vetoRevision,
        household_revision: 10 + vetoRevision,
      };
    } else if (method === "get_shopping_state") data = state.shopping;
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", {
    name:
      info.project.name === "desktop-chromium"
        ? "Main navigation"
        : "Mobile navigation",
  });
  await nav.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(50);
  await page
    .getByRole("button", { name: "Load 50 more recipes", exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(100);
  const card = page.locator(".recipe-card").first(),
    element = await card.elementHandle();
  await card.click();
  const before = calls.length;
  await page.getByRole("button", { name: "Veto recipe", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove veto", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator(".recipe-card").first()).toHaveClass(/is-vetoed/);
  await expect(page.locator(".recipe-card")).toHaveCount(100);
  expect(await element!.evaluate((el) => el.isConnected)).toBe(true);
  expect(calls.slice(before)).toEqual(["set_recipe_veto"]);
  await card.click();
  await page.getByRole("button", { name: "Remove veto", exact: true }).click();
  await expect
    .poll(() => calls.filter((name) => name === "set_recipe_veto").length)
    .toBe(2);
  await page.keyboard.press("Escape");
  await clickDisclosedAction(page, "Ingredients & units");
  await expect(page.locator(".recipe-card")).toContainText("Ingredient row");
  releaseSecond();
  await expect(
    page.getByRole("button", { name: "New ingredient", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await expect(page.locator(".recipe-card")).toContainText("Ingredient row");
});
