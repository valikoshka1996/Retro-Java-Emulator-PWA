/* Built by build/pwa.ts; app data remains in IndexedDB and is never cached here. */
const PREFIX = "java-retro-shell-";
const CACHE = PREFIX + "__CACHE_VERSION__";
const SHELL = __PRECACHE_URLS__;
const allowed = new Set(SHELL);
const OFFLINE = __OFFLINE_MANIFEST__;
const ENGINE_CACHE = "java-retro-offline-" + OFFLINE.version;
const engineUrls = new Set(
  OFFLINE.resources.map((r) => new URL(r.url, self.location.origin).href),
);
async function engineResponse(request, key) {
  const cache = await caches.open(ENGINE_CACHE);
  if (await cache.match("/__retro_offline_ready__")) {
    const hit = await cache.match(key);
    if (hit) {
      const range = request.headers.get("range");
      if (!range) return hit;
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (m) {
        const bytes = await hit.arrayBuffer(),
          start = Number(m[1]),
          end = m[2]
            ? Math.min(Number(m[2]), bytes.byteLength - 1)
            : bytes.byteLength - 1;
        if (start > end || start >= bytes.byteLength)
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": "bytes */" + bytes.byteLength },
          });
        const headers = new Headers(hit.headers);
        headers.set(
          "Content-Range",
          `bytes ${start}-${end}/${bytes.byteLength}`,
        );
        headers.set("Content-Length", String(end - start + 1));
        headers.set("Accept-Ranges", "bytes");
        return new Response(bytes.slice(start, end + 1), {
          status: 206,
          headers,
        });
      }
    }
  }
  return fetch(request);
}

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
  const engineKey =
    url.origin === self.location.origin &&
    url.pathname === "/engine/player.html"
      ? new URL(url.pathname, self.location.origin).href
      : url.href;
  if (request.method === "GET" && engineUrls.has(engineKey)) {
    event.respondWith(engineResponse(request, engineKey));
    return;
  }
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
