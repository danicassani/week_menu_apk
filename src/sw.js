/* CACHE_NAME and PUBLIC_ASSETS are injected by scripts/build-pwa.mjs. */
const allowed = new Set(PUBLIC_ASSETS);
async function cached(path) {
  try {
    const response = await (await caches.open(CACHE_NAME)).match(path);
    if (!response?.ok) return undefined;
    // Chrome rejects redirected responses for navigation requests with redirect
    // mode "manual". Normalize legacy entries as well as fixing new downloads.
    if (path === "/index.html" && response.redirected) {
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  } catch {
    // Browser storage can fail even with a working network. Never fail the
    // navigation or asset request just because its optional cache failed.
    return undefined;
  }
}
async function completePage(html, read) {
  try {
    if (!html?.headers.get("content-type")?.includes("text/html")) return false;
    const paths = [
      ...(await html.clone().text()).matchAll(
        /(?:src|href)="(\/assets\/[^"?#]+)"/g,
      ),
    ].map((match) => match[1]);
    return (
      paths.length > 0 &&
      (
        await Promise.all(
          paths.map(async (path) => {
            const response = await read(path),
              type = response?.headers.get("content-type") ?? "";
            return (
              !!response?.ok &&
              (!path.endsWith(".js") || type.includes("javascript")) &&
              (!path.endsWith(".css") || type.includes("text/css"))
            );
          }),
        )
      ).every(Boolean)
    );
  } catch {
    return false;
  }
}
async function healthyPreviousShell() {
  for (const key of await caches.keys()) {
    if (!key.startsWith("week-menu-shell-") || key === CACHE_NAME) continue;
    const cache = await caches.open(key),
      html = await cache.match("/index.html");
    // Older releases cached Cloudflare's /index.html -> / redirect. Those
    // entries can be complete yet unusable for navigation, so repair immediately.
    if (
      !html?.redirected &&
      (await completePage(html, (path) => cache.match(path)))
    )
      return true;
  }
  return false;
}
let repairFlight;
function repairShell() {
  repairFlight ??= (async () => {
    const responses = await Promise.all(
      PUBLIC_ASSETS.map((path) =>
        fetch(path === "/index.html" ? "/" : path, {
          cache: "reload",
          redirect: "error",
        }),
      ),
    );
    if (responses.some((response) => !response.ok)) return;
    const index = PUBLIC_ASSETS.indexOf("/index.html");
    if (index < 0) return;
    const html = await responses[index].clone().text();
    const references = [...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map(
      (match) => match[1],
    );
    if (!references.length || references.some((path) => !allowed.has(path))) {
      await self.registration.update();
      return;
    }
    for (let n = 0; n < PUBLIC_ASSETS.length; n++)
      if (
        PUBLIC_ASSETS[n].endsWith(".js") &&
        !responses[n].headers.get("content-type")?.includes("javascript")
      )
        return;
    const cache = await caches.open(CACHE_NAME);
    // Publish HTML last: a partially repaired cache must not claim a full shell.
    for (let n = 0; n < PUBLIC_ASSETS.length; n++)
      if (n !== index) await cache.put(PUBLIC_ASSETS[n], responses[n]);
    await cache.put("/index.html", responses[index]);
    for (const client of await self.clients.matchAll())
      client.postMessage({ type: "SHELL_REPAIRED" });
  })()
    .catch(() => {})
    .finally(() => {
      repairFlight = undefined;
    });
  return repairFlight;
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(
          PUBLIC_ASSETS.filter((path) => path !== "/index.html"),
        );
        // Request the canonical URL directly, retaining the logical cache key.
        // Cloudflare returns 308 for /index.html; storing that followed response
        // and serving it to a navigation causes Chrome's ERR_FAILED.
        const html = await fetch("/", { cache: "reload", redirect: "error" });
        if (
          !html.ok ||
          !html.headers.get("content-type")?.includes("text/html")
        )
          throw new Error("invalid_app_shell");
        await cache.put("/index.html", html);
      } catch (error) {
        // Storage denial/quota is different from a failed asset download: install
        // a network-capable worker instead of leaving a broken predecessor stuck.
        if (
          ![
            "SecurityError",
            "QuotaExceededError",
            "InvalidStateError",
            "UnknownError",
          ].includes(error?.name)
        )
          throw error;
        await self.skipWaiting();
        return;
      }
      // A working installed shell still gets the normal reviewed update. When
      // the old shell is missing/incomplete, activate its replacement so users
      // aren't trapped on an error page without access to the update button.
      if (self.registration.active) {
        try {
          if (!(await healthyPreviousShell())) await self.skipWaiting();
        } catch {
          await self.skipWaiting();
        }
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        for (const key of await caches.keys())
          if (key.startsWith("week-menu-shell-") && key !== CACHE_NAME)
            await caches.delete(key).catch(() => {});
      } catch {
        /* Cache cleanup must not prevent online recovery. */
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
  if (event.data?.type === "SHELL_STATUS") {
    event.waitUntil(
      cached("/index.html").then(async (response) =>
        event.ports[0]?.postMessage({
          available: await completePage(response, cached),
        }),
      ),
    );
  }
});
function unavailable(request) {
  const spanish = /^es\b/i.test(request.headers.get("accept-language") ?? "");
  const heading = spanish
    ? "Vuelve a conectarte para abrir Week Menu"
    : "Reconnect to open Week Menu";
  const description = spanish
    ? "No se puede cargar la copia de la aplicación. Tus datos guardados y cambios de compra pendientes no se han borrado. Recupera la conexión y vuelve a intentarlo."
    : "The saved app copy could not be loaded. Your saved data and pending shopping changes have not been deleted. Restore your connection and try again.";
  return new Response(
    `<!doctype html><html lang="${spanish ? "es" : "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Week Menu</title><body><main><h1>${heading}</h1><p>${description}</p><a href="/">${spanish ? "Volver a intentar" : "Try again"}</a></main></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  // No API/authentication traffic, session storage or IndexedDB is handled here.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        // Keep healthy installed HTML paired with its own assets until update.
        const html = await cached("/index.html");
        if (await completePage(html, cached)) return html;
        try {
          const response = await fetch(request);
          if (response.ok) {
            event.waitUntil(repairShell());
            return response;
          }
        } catch {
          /* A readable recovery page replaces Chrome's generic ERR_FAILED. */
        }
        return unavailable(request);
      })(),
    );
    return;
  }
  if (url.search || !allowed.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const response = await cached(url.pathname);
      if (response) return response;
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === "basic") {
        try {
          await (
            await caches.open(CACHE_NAME)
          ).put(url.pathname, fresh.clone());
        } catch {
          /* Serve the network response even if storage is unavailable. */
        }
      }
      return fresh;
    })(),
  );
});
