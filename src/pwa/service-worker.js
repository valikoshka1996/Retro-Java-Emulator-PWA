/* Built by build/pwa.ts; app data remains in IndexedDB and is never cached here. */
const PREFIX = "java-retro-shell-";
const CACHE = PREFIX + "__CACHE_VERSION__";
const SHELL = __PRECACHE_URLS__;
const allowed = new Set(SHELL);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))),
      ),
  );
  // Updates wait for an explicit user action; never reload a running MIDlet.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE")
    event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("range")
  )
    return;
  // In particular, /engine/player.html must never receive the React SPA fallback.
  if (
    request.mode === "navigate" &&
    (url.pathname === "/" || url.pathname === "/index.html")
  ) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) => (await cache.match("/index.html")) || fetch(request),
        ),
    );
    return;
  }
  if (!allowed.has(url.pathname) || url.search) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then(
        async (cache) => (await cache.match(url.pathname)) || fetch(request),
      ),
  );
});
