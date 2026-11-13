import { clickDisclosedAction } from "../browser/helpers/actions";
import { test, expect } from "@playwright/test";
import { PreviewRepository } from "../../src/lib/preview-repository";
test("egg estimate conflicts require renewed review; a lost acknowledgement retries without duplicate writes", async ({
  page,
}) => {
  const source = await new PreviewRepository("UTC").load("UTC");
  const context = {
    account_id: "73000000-0000-0000-0000-000000000001",
    household_id: "73000000-0000-0000-0000-000000000002",
    membership_id: source.viewer_id,
  };
  const state = {
    ...source,
    context,
    household: { ...source.household, id: context.household_id },
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
  let commits = 0,
    lost = false;
  await page.route("https://household-tests.supabase.co/**", async (route) => {
    const req = route.request(),
      name = new URL(req.url()).pathname.split("/").pop()!,
      args = req.postDataJSON() ?? {};
    if (!req.url().includes("/rest/v1/rpc/")) {
      await route.fulfill({ json: user });
      return;
    }
    let data: unknown = null;
    if (name === "get_household_access")
      data = { active: context, invitations: [] };
    else if (name === "get_household_snapshot") data = state;
    else if (name === "get_shopping_state") data = state.shopping;
    else if (name === "get_planning_library") data = state.planning;
    else if (name === "save_egg_purchasing_unit") {
      const setting = state.shopping!.purchasing![0];
      if (args.p_revision !== setting.revision) {
        if (!(
          setting.revision === args.p_revision + 1 &&
          setting.grams_per_unit === args.p_grams_per_egg
        )) {
          await route.fulfill({
            status: 400,
            json: { code: "P0001", message: "stale_content" },
          });
          return;
        }
      } else {
        setting.grams_per_unit = args.p_grams_per_egg;
        setting.revision++;
        state.shopping!.observation_revision++;
        commits++;
        if (!lost) {
          lost = true;
          await route.abort("failed");
          return;
        }
      }
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .last()
    .getByRole("button", { name: "Shopping", exact: true })
    .click();
  await clickDisclosedAction(page, "Egg size estimate");
  const input = page.getByLabel("Edible grams per egg", { exact: true }),
    save = page.getByRole("button", { name: "Save estimate", exact: true });
  await input.fill("60");
  state.shopping!.purchasing![0] = {
    ...state.shopping!.purchasing![0],
    grams_per_unit: 55,
    revision: 1,
  };
  state.shopping!.observation_revision++;
  await save.click();
  await expect(
    page.getByText(
      "The household estimate changed. Reload and review it before saving.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(input).toHaveValue("60");
  await expect(save).toBeDisabled();
  await page
    .getByRole("button", { name: "Reload for review", exact: true })
    .click();
  await expect(input).toHaveValue("55");
  await input.fill("60");
  await save.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(commits).toBe(1);
  expect(state.shopping!.purchasing![0].grams_per_unit).toBe(60);
});
