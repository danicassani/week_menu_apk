import { test, expect } from "@playwright/test";
import { PreviewRepository } from "../../src/lib/preview-repository";
import { makePortion, type MealPlan } from "../../src/domain/planning";
import { emptyShopping } from "../../src/domain/shopping";
test("historical drafts survive a compact refresh; an unknown acknowledgement retries exactly once without exposing the credential to storage", async ({
  page,
}) => {
  const source = await new PreviewRepository("UTC").load("UTC"),
    lib = source.planning!,
    day = "2026-11-03";
  const context = {
    account_id: "72000000-0000-0000-0000-000000000001",
    household_id: "72000000-0000-0000-0000-000000000002",
    membership_id: source.viewer_id,
  };
  let revision = 1,
    commits = 0,
    sessionSerial = 0;
  let plans: MealPlan[] = [
    {
      day,
      type: "breakfast",
      revision: 1,
      shared_recipe_id: null,
      portions: [
        makePortion(
          lib.recipes.find((r) => r.id === "b01")!,
          source.viewer_id,
          source.members[0].profile!,
          400,
          false,
          lib.ingredients,
          lib.substitutions,
        ),
      ],
    },
  ];
  const credential = "0b4c4d66-2ee3-4018-a7f5-d956fb70a100";
  const state = () => ({
    ...source,
    server_now: "2026-11-05T12:00:00Z",
    context,
    household: { ...source.household, id: context.household_id },
    meal_locks: [{ day, closed: true, cutoff: "2026-11-04T00:00:00Z" }],
    planning: { ...lib, complete: false, revision, plans },
    shopping: emptyShopping(),
    meals: plans.flatMap((m) =>
      m.portions.map((p) => ({
        member_id: p.member_id,
        day,
        type: m.type,
        name: p.name,
        kcal: p.kcal,
      })),
    ),
  });
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
  let submitted: any = null;
  const calls: { name: string; args: any }[] = [];
  await page.route("https://household-tests.supabase.co/**", async (route) => {
    const req = route.request(),
      name = new URL(req.url()).pathname.split("/").pop()!,
      args = req.postDataJSON() ?? {};
    if (!req.url().includes("/rest/v1/rpc/")) {
      await route.fulfill({ json: user });
      return;
    }
    calls.push({ name, args });
    let data: unknown = null;
    if (name === "get_household_access")
      data = { active: context, invitations: [] };
    else if (name === "get_household_snapshot") data = state();
    else if (name === "get_planning_library")
      data = { ...lib, complete: true, revision, plans };
    else if (name === "get_shopping_state") data = emptyShopping();
    else if (name === "begin_historical_correction") {
      sessionSerial++;
      data = {
        token: credential,
        day,
        revision,
        expires_at: "2026-11-05T12:10:00Z",
        plans,
      };
    } else if (name === "apply_historical_correction") {
      if (submitted === null) {
        submitted = args;
        plans = args.p_plans;
        revision++;
        commits++;
        await route.abort("failed");
        return;
      }
      expect(args).toEqual(submitted);
      data = { day, action: "save", revision };
    }
    await route.fulfill({ json: data });
  });
  await page.clock.setFixedTime(new Date("2026-11-05T12:00:00Z"));
  await page.goto("/");
  const nav = page.getByRole("navigation").last();
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  const check = page.locator(".day-card").nth(1).locator(".closed-day-check");
  for (let i = 0; i < 5; i++) await check.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Start historical edit", exact: true })
    .click();
  const quantity = dialog.locator(".historical-quantities input").first();
  const initial = Number(await quantity.inputValue());
  await quantity.fill(String(initial + 10));
  revision++;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(dialog).toContainText("The household changed");
  await expect(quantity).toHaveValue(String(initial + 10));
  await dialog
    .getByRole("button", { name: "Reload for review", exact: true })
    .click();
  await expect(quantity).toHaveValue(String(initial));
  expect(sessionSerial).toBe(2);
  await quantity.fill(String(initial + 20));
  await dialog
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm historical correction", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Check correction result",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Check correction result", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(commits).toBe(1);
  expect(
    calls.filter((c) => c.name === "apply_historical_correction"),
  ).toHaveLength(2);
  const stored = await page.evaluate(async () => {
    const values = [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ];
    const databases = await indexedDB.databases();
    for (const info of databases)
      if (info.name)
        await new Promise<void>((resolve) => {
          const request = indexedDB.open(info.name!);
          request.onsuccess = () => {
            const db = request.result;
            const stores = [...db.objectStoreNames];
            if (!stores.length) {
              db.close();
              resolve();
              return;
            }
            const tx = db.transaction(stores);
            for (const store of stores) {
              const r = tx.objectStore(store).getAll();
              r.onsuccess = () => values.push(JSON.stringify(r.result));
            }
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        });
    return values.join("\n");
  });
  expect(stored).not.toContain(credential);
});
