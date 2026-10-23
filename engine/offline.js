// Local browser cache adapter for the pinned CheerpJ downloader. Vendor scripts
// still come from their original CDN; licence checks and flags are untouched.
export async function installOfflineRuntimeCache(onMissing) {
  let manifest;
  try {
    const r = await fetch("/offline-manifest.json");
    if (!r.ok) return;
    manifest = await r.json();
  } catch {
    return;
  }
  const cache = await caches.open("java-retro-offline-" + manifest.version);
  if (!(await cache.match("/__retro_offline_ready__"))) return;
  if (typeof window.IFrameProxyDownloader !== "function")
    throw Error("Офлайн-адаптер несумісний із цією версією CheerpJ.");
  const files = new Map(
    manifest.resources
      .filter((f) => f.url.startsWith(manifest.runtime))
      .map((f) => [f.url, f]),
  );
  const metadata = new Map(manifest.metadata.map((f) => [f.url, f.kind]));
  const loaded = new Map();
  const original = IFrameProxyDownloader.prototype.send;
  IFrameProxyDownloader.prototype.send = function () {
    const d = this;
    if (!d.url.startsWith(manifest.runtime)) {
      original.call(d);
      return;
    }
    const perform = async () => {
      if (metadata.has(d.url)) {
        d.fileLength = metadata.get(d.url) === "directory" ? 0 : -1;
        d.responseURL = d.fileLength === 0 ? d.url + "/" : d.url;
        d.onEnd(null);
        return;
      }
      const file = files.get(d.url);
      if (!file) throw Error("В офлайн-пакеті немає ресурсу " + d.url);
      if (!loaded.has(d.url))
        loaded.set(
          d.url,
          (async () => {
            const r = await cache.match(d.url);
            if (!r)
              throw Error("Офлайн-пакет неповний. Підготуйте його знову.");
            const bytes = new Uint8Array(await r.arrayBuffer());
            const hash = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (n) => n.toString(16).padStart(2, "0"),
            ).join("");
            if (bytes.length !== file.size || hash !== file.sha256)
              throw Error("Пошкоджений офлайн-ресурс. Підготуйте пакет знову.");
            return bytes;
          })(),
        );
      const bytes = await loaded.get(d.url);
      d.responseURL = d.url;
      d.fileLength = bytes.length;
      if (d.metaDataOnly && !d.rangeHeader) {
        d.onEnd(null);
        return;
      }
      const match = /^bytes=(\d+)-(\d*)$/.exec(d.rangeHeader || "");
      if (d.rangeHeader && !match)
        throw Error("Непідтримуваний Range офлайн-рушія.");
      const body = match
        ? bytes.subarray(
            Number(match[1]),
            match[2]
              ? Math.min(Number(match[2]) + 1, bytes.length)
              : bytes.length,
          )
        : bytes;
      if (!d.chunkSize) {
        d.onEnd([body]);
        return;
      }
      for (let i = 0; i < body.length; i += d.chunkSize)
        d.onData(body.slice(i, i + d.chunkSize));
      d.onEnd(null);
    };
    perform().catch((error) => {
      if (navigator.onLine) {
        original.call(d);
        return;
      }
      onMissing(String(error.message || error));
      d.fileLength = -1;
      d.responseURL = d.url;
      d.onEnd(null);
    });
  };
}
