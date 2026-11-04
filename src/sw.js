/* CACHE_NAME and PUBLIC_ASSETS are injected by scripts/build-pwa.mjs. */
const allowed = new Set(PUBLIC_ASSETS);
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSETS)),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("week-menu-shell-") && key !== CACHE_NAME)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  // Household data and authentication are never cached by the service worker.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (!response.ok) throw new Error("navigation_failed");
          // Never store OAuth callback URLs, codes, errors or authenticated responses.
          if (
            !url.search &&
            url.pathname === "/" &&
            response.type === "basic" &&
            response.headers.get("content-type")?.includes("text/html")
          ) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/index.html", response.clone());
          }
          return response;
        } catch {
          return (await caches.match("/index.html")) ?? Response.error();
        }
      })(),
    );
    return;
  }
  if (url.search || !allowed.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(url.pathname);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url.pathname, response.clone());
      }
      return response;
    })(),
  );
});
