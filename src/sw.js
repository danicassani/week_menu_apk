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
    // Keep the installed HTML paired with this worker's asset version until the
    // user accepts the update. OAuth query parameters still reach the page URL;
    // neither callback URLs nor navigation responses enter the public cache.
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then(
          async (cache) => (await cache.match("/index.html")) ?? fetch(request),
        ),
    );
    return;
  }
  if (url.search || !allowed.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(url.pathname, response.clone());
      }
      return response;
    })(),
  );
});
