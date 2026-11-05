import { test, expect, type Page } from "@playwright/test";
import { offlineKey } from "../../src/domain/households";
import { emptyShopping } from "../../src/domain/shopping";
const context = {
  account_id: "70000000-0000-0000-0000-000000000001",
  household_id: "70000000-0000-0000-0000-000000000002",
  membership_id: "70000000-0000-0000-0000-000000000003",
  legacy_binding: false,
};
async function signedIn(page: Page, revoked = false, offlineStartup = false) {
  const user = {
    id: context.account_id,
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "google" },
    user_metadata: { full_name: "Test person" },
    created_at: "2026-11-04T12:00:00Z",
  };
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      {
        sub: context.account_id,
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
  let active = false,
    name = "Invited home";
  const requests: { name: string; args: any }[] = [];
  await page.route("https://household-tests.supabase.co/**", async (route) => {
    const request = route.request(),
      rpc = new URL(request.url()).pathname.split("/").pop()!;
    if (!request.url().includes("/rest/v1/rpc/")) {
      await route.fulfill({ json: user });
      return;
    }
    const args = request.postDataJSON() ?? {};
    requests.push({ name: rpc, args });
    let data: unknown = null;
    if (rpc === "get_household_access")
      data = {
        active: active ? context : null,
        invitations: active
          ? []
          : [{ id: "invitation", household_name: "Invited home" }],
      };
    else if (rpc === "create_household") {
      name = args.p_name;
      active = true;
    } else if (rpc === "join_household") {
      if (revoked) {
        await route.fulfill({
          status: 403,
          json: { message: "invalid_invitation", code: "P0001" },
        });
        return;
      }
      active = true;
    } else if (rpc === "get_household_snapshot")
      data = {
        context,
        server_now: "2026-11-04T12:00:00Z",
        viewer_id: context.membership_id,
        household: {
          id: context.household_id,
          name,
          owner_id: context.membership_id,
          week_start: 1,
          variety_days: 3,
        },
        members: [
          {
            id: context.membership_id,
            name: "Test person",
            status: "active",
            time_zone: "UTC",
            onboarded: false,
            profile: null,
            revision: 0,
          },
        ],
        targets: [],
        entries: [],
        days: [],
        invites: [],
        activity_catalogue: [],
        meals: [],
        budget_overrides: [],
        meal_locks: [],
        planning: {
          ingredients: [],
          recipes: [],
          substitutions: [],
          plans: [],
          revision: 0,
        },
        shopping: emptyShopping(),
      };
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  if (!offlineStartup)
    await expect(
      page.getByRole("heading", { name: "Your table starts here" }),
    ).toBeVisible();
  return requests;
}
test("explicitly creates a household, enters profile onboarding and binds the offline identity", async ({
  page,
}) => {
  const requests = await signedIn(page);
  expect(requests.some((r) => r.name === "join_household")).toBe(false);
  await page.getByLabel("Household name").fill("New home");
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Set up profile", exact: true }),
  ).toBeVisible();
  const snapshot = requests.find((r) => r.name === "get_household_snapshot")!;
  expect(snapshot.args).toEqual({
    p_household_id: context.household_id,
    p_membership_id: context.membership_id,
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          new Promise<string>((resolve, reject) => {
            const open = indexedDB.open("week-menu-offline-v1");
            open.onsuccess = () => {
              const db = open.result,
                tx = db.transaction("accounts", "readonly"),
                get = tx.objectStore("accounts").get("__active__");
              tx.oncomplete = () => {
                resolve(get.result?.value ?? "");
                db.close();
              };
              tx.onerror = () => reject(tx.error);
            };
            open.onerror = () => reject(open.error);
          }),
      ),
    )
    .toBe(offlineKey(context));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("accepts an invitation only after the person's explicit choice in Spanish", async ({
  page,
}) => {
  const requests = await signedIn(page);
  await page.getByRole("button", { name: "Español", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tu mesa empieza aquí" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unirse a Invited home" }).click();
  await expect(
    page.getByRole("button", { name: "Configurar perfil", exact: true }),
  ).toBeVisible();
  expect(requests.filter((r) => r.name === "join_household")).toHaveLength(1);
  expect(requests.some((r) => r.name === "create_household")).toBe(false);
});
test("a revoked invitation leaves the user in onboarding with a useful error", async ({
  page,
}) => {
  const requests = await signedIn(page, true);
  await page.getByRole("button", { name: "Join Invited home" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "invitation is unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Your table starts here" }),
  ).toBeVisible();
  expect(requests.some((r) => r.name === "get_household_snapshot")).toBe(false);
});

test("offline startup never displays another account's previously active shopping cache", async ({
  page,
}) => {
  await page.addInitScript(async () => {
    Object.defineProperty(navigator, "onLine", {
      get: () => false,
      configurable: true,
    });
    const secret = "PRIVATE OTHER ACCOUNT SHOPPING";
    (window as any).crossAccountFlash = false;
    new MutationObserver((records) => {
      if (
        records.some((record) =>
          Array.from(record.addedNodes).some((node) =>
            node.textContent?.includes(secret),
          ),
        )
      )
        (window as any).crossAccountFlash = true;
    }).observe(document, { childList: true, subtree: true });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("week-menu-offline-v1", 1);
      open.onupgradeneeded = () =>
        open.result.createObjectStore("accounts", { keyPath: "account_id" });
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction("accounts", "readwrite"),
          store = tx.objectStore("accounts");
        const key = 'v2:["other-account","other-home","other-membership"]';
        store.put({
          account_id: key,
          language: "en",
          saved_at: "2026-11-04T12:00:00Z",
          pending: [],
          next_sequence: 1,
          discarded: 0,
          shopping: {
            observation_revision: 0,
            content_revision: 0,
            start_date: null,
            end_date: null,
            applied_fingerprint: "",
            changes_available: false,
            items: [
              {
                id: "private-item",
                source: "manual",
                key: null,
                ingredient_id: null,
                name: { en: secret, es: secret },
                amount: "1",
                quantity: null,
                unit: "",
                reference_state: "",
                quantity_basis: "",
                checked: false,
                increased: false,
                content_revision: 1,
                checked_revision: 0,
              },
            ],
          },
        });
        store.put({ account_id: "__active__", value: key });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
  const requests = await signedIn(page, false, true);
  await expect(
    page.getByRole("heading", { name: "No shopping list saved yet" }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).crossAccountFlash)).toBe(
    false,
  );
  expect(requests).toEqual([]);
});
