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
test("cache API failure falls back to the network instead of ERR_FAILED", async ({
  page,
  context,
}) => {
  await enter(page);
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => {
    caches.open = async () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Shopping", exact: true })
    .click();
  await expect(
    page.getByText("Coffee for the household", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Offline app loading is unavailable in this browser. Keep a connection to reopen the app.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("missing shell offline shows recovery guidance, preserves queued checks and repairs on reconnect", async ({
  page,
  context,
}) => {
  await enter(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.evaluate(async () => {
    for (const key of await caches.keys()) await caches.delete(key);
  });
  const response = await page.reload();
  expect(response!.status()).toBe(503);
  await expect(
    page.getByRole("heading", { name: "Reconnect to open Week Menu" }),
  ).toBeVisible();
  await expect(
    page.getByText(/pending shopping changes have not been deleted/),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Shopping", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        for (const key of keys)
          if (await (await caches.open(key)).match("/index.html")) return true;
        return false;
      }),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeChecked();
});
test("a new worker replaces an incomplete predecessor without an unreachable update button", async ({
  page,
  context,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises");
  await enter(page);
  const original = await readFile("dist/sw.js", "utf8");
  const before = await page.evaluate(
    () => navigator.serviceWorker.controller!.scriptURL,
  );
  try {
    await page.evaluate(async () => {
      for (const key of await caches.keys())
        await (await caches.open(key)).delete("/index.html");
    });
    await writeFile(
      "dist/sw.js",
      original.replace(
        /(const CACHE_NAME=)("[^"]+")/,
        (_, prefix, value) =>
          prefix + JSON.stringify(JSON.parse(value) + "-repair"),
      ),
    );
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return !!reg?.active && !reg.waiting && !reg.installing;
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          return (await caches.keys()).some((key) => key.endsWith("-repair"));
        }),
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your household, offline" }),
    ).toBeVisible();
    await expect(
      page.getByText("Coffee for the household", { exact: true }),
    ).toBeVisible();
    expect(before).toContain("/sw.js");
  } finally {
    await writeFile("dist/sw.js", original);
  }
});
test("a missing cached entry script shows recovery instead of a blank offline app", async ({
  page,
  context,
}) => {
  await enter(page);
  await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key),
        html = await cache.match("/index.html");
      if (html) {
        const entry = /<script[^>]+src="([^"]+)"/.exec(await html.text())?.[1];
        if (entry) await cache.delete(entry);
      }
    }
  });
  await context.setOffline(true);
  const response = await page.reload();
  expect(response!.status()).toBe(503);
  await expect(
    page.getByRole("heading", { name: "Reconnect to open Week Menu" }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
});
test("Cloudflare canonical HTML redirects cannot poison navigation or OAuth returns", async ({
  page,
  request,
  context,
}) => {
  const redirect = await request.get("/index.html", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers()["location"]).toBe("/");
  await enter(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await page.goto("/?error=access_denied&error_description=canonical-test");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Alex." }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toBeVisible();
  const redirected = await page.evaluate(async () => {
    const result: boolean[] = [];
    for (const key of await caches.keys()) {
      const response = await (await caches.open(key)).match("/index.html");
      if (response) result.push(response.redirected);
    }
    return result;
  });
  expect(redirected).toEqual([false]);
});
test("legacy redirected entries are usable while their repairing worker installs", async ({
  page,
  context,
}) => {
  await enter(page);
  await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      if (await cache.match("/index.html")) {
        const redirected = await fetch("/index.html?legacy=1");
        if (!redirected.redirected) throw Error("Test server did not redirect");
        await cache.put("/index.html", redirected);
      }
    }
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your household, offline" }),
  ).toBeVisible();
  await expect(
    page.getByText("Coffee for the household", { exact: true }),
  ).toBeVisible();
});
test("an installed worker stuck on a redirected page upgrades without deleting pending checks", async ({
  page,
  context,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises"),
    original = await readFile("dist/sw.js", "utf8");
  const assets = JSON.parse(
      /const PUBLIC_ASSETS=(\[[^\n]+\]);/.exec(original)![1],
    ),
    legacyKey = "week-menu-shell-legacy-canonical";
  const legacy = `const NAME=${JSON.stringify(legacyKey)},ASSETS=${JSON.stringify(assets)};
 self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(ASSETS))));
 self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
 self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
 e.respondWith(caches.open(NAME).then(async c=>(await c.match(e.request.mode==='navigate'?'/index.html':e.request))??fetch(e.request)));});`;
  try {
    await writeFile("dist/sw.js", legacy);
    await enter(page);
    const old = context.serviceWorkers()[0];
    await context.setOffline(true);
    await page.getByRole("checkbox").click();
    await expect(page.getByRole("checkbox")).toBeChecked();
    await expect(page.reload()).rejects.toThrow("ERR_FAILED");
    await writeFile("dist/sw.js", original);
    await context.setOffline(false);
    const installed = context.waitForEvent("serviceworker");
    await old.evaluate(async () => {
      await (self as any).registration.update();
    });
    const replacement = await installed;
    await expect
      .poll(() =>
        replacement.evaluate(async () => {
          const scope = self as any;
          return (
            scope.registration.active?.state === "activated" &&
            !(await caches.has("week-menu-shell-legacy-canonical"))
          );
        }),
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your household, offline" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeChecked();
    await expect(
      page.getByText("1 pending sync", { exact: true }),
    ).toBeVisible();
  } finally {
    await writeFile("dist/sw.js", original);
  }
});
