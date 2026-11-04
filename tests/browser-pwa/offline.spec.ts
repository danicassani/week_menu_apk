import { test, expect } from "@playwright/test";
async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".day-card")).toHaveCount(7);
  await nav.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search collection" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Shopping", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Product", { exact: true })
    .fill("Coffee for the household");
  await page.getByLabel("Quantity or note · optional").fill("2 packs");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByText("Coffee for the household", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeEnabled();
}
test("production shell reloads offline, retains checked intents across restart, then synchronizes", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toBeVisible();
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox")).toBeChecked();
  const nav = page.getByRole("navigation", { name: "Offline navigation" });
  await nav.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".day-card")).toHaveCount(7);
  await nav.getByRole("button", { name: "Recipes", exact: true }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search saved recipes" }),
  ).toBeVisible();
  await expect(page.locator(".recipe-card").first()).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Shopping", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.locator(".sync-status")).toContainText("Connected");
  await expect(
    page.getByText("Saved on this device · pending sync", { exact: true }),
  ).toHaveCount(0);
  const cached = await page.evaluate(async () => {
    const result: string[] = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        result.push(request.url);
    return result;
  });
  expect(cached.length).toBeGreaterThan(5);
  expect(
    cached.every((url) => new URL(url).origin === "http://127.0.0.1:5174"),
  ).toBe(true);
  expect(cached.some((url) => /supabase|auth\/|\?|#/.test(url))).toBe(false);
  expect(errors).toEqual([]);
});
test("offline sign-out requires explicitly discarding queued changes and clears household views", async ({
  page,
  context,
}) => {
  await enter(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText(/shopping changes waiting to sync/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync first" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Discard changes & sign out" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Coffee for the household", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toHaveCount(0);
});
test("accepting a downloaded app update retains offline pending checks", async ({
  page,
  context,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises");
  await enter(page);
  const file = "dist/sw.js",
    original = await readFile(file, "utf8");
  try {
    await writeFile(
      file,
      original.replace(
        /(const CACHE_NAME=)("[^"]+")/,
        (_, prefix, value) =>
          prefix + JSON.stringify(JSON.parse(value) + "-update-test"),
      ),
    );
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg!.update();
    });
    await expect(
      page.getByRole("button", { name: "Update & reload" }),
    ).toBeVisible();
    await context.setOffline(true);
    await expect(
      page.getByRole("heading", { name: "Your household, offline" }),
    ).toBeVisible();
    await page.getByRole("checkbox").click();
    await expect(page.getByRole("checkbox")).toBeChecked();
    await page.getByRole("button", { name: "Update & reload" }).click();
    await expect(
      page.getByRole("heading", { name: "Your household, offline" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeChecked();
    await expect(
      page.getByText("1 pending sync", { exact: true }),
    ).toBeVisible();
  } finally {
    await writeFile(file, original);
  }
});
test("a waiting release cannot replace the active shell before the user accepts it", async ({
  page,
  context,
}) => {
  const { readFile, writeFile, unlink } = await import("node:fs/promises");
  await enter(page);
  const html = await readFile("dist/index.html", "utf8"),
    worker = await readFile("dist/sw.js", "utf8");
  try {
    await writeFile(
      "dist/release-marker.js",
      'document.documentElement.dataset.releaseMarker="new-release";',
    );
    await writeFile(
      "dist/index.html",
      html.replace(
        "</head>",
        '<script src="/release-marker.js"></script></head>',
      ),
    );
    await writeFile(
      "dist/sw.js",
      worker
        .replace(
          /(const CACHE_NAME=)("[^"]+")/,
          (_, prefix, value) =>
            prefix + JSON.stringify(JSON.parse(value) + "-next-release"),
        )
        .replace(
          "const PUBLIC_ASSETS=[",
          'const PUBLIC_ASSETS=["/release-marker.js",',
        ),
    );
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(
      page.getByRole("button", { name: "Update & reload" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-release-marker",
      "new-release",
    );
    await expect(
      page.getByRole("button", { name: "Update & reload" }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("checkbox").click();
    await expect(page.getByRole("checkbox")).toBeChecked();
    await page.getByRole("button", { name: "Update & reload" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-release-marker",
      "new-release",
    );
    await expect(page.getByRole("checkbox")).toBeChecked();
    await expect(
      page.getByText("1 pending sync", { exact: true }),
    ).toBeVisible();
  } finally {
    await writeFile("dist/index.html", html);
    await writeFile("dist/sw.js", worker);
    await unlink("dist/release-marker.js");
  }
});
test("production security headers and manifest are served; callback URLs never enter the shell cache", async ({
  page,
  request,
}) => {
  const root = await request.get("/"),
    headers = root.headers();
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.headers()["cache-control"]).toBe("no-cache");
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
  expect((await request.get("/sw.js")).headers()["cache-control"]).toBe(
    "no-cache",
  );
  await enter(page);
  await page.goto("/?error=access_denied&error_description=release-test");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  const urls = await page.evaluate(async () => {
    const out: string[] = [];
    for (const key of await caches.keys())
      out.push(...(await (await caches.open(key)).keys()).map((r) => r.url));
    return out;
  });
  expect(
    urls.some(
      (url) =>
        url.includes("?") || url.includes("/auth/") || url.includes("supabase"),
    ),
  ).toBe(false);
});
test("an initial worker install failure is visible while the online app remains usable", async ({
  page,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const worker = await readFile("dist/sw.js", "utf8");
  try {
    await writeFile(
      "dist/sw.js",
      'self.addEventListener("install",e=>e.waitUntil(Promise.reject(new Error("test installation failure"))));',
    );
    await page.goto("/");
    await expect(
      page.getByText(
        "Offline app loading is unavailable in this browser. Keep a connection to reopen the app.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Explore the preview", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Good to see you, Alex." }),
    ).toBeVisible();
  } finally {
    await writeFile("dist/sw.js", worker);
  }
});
