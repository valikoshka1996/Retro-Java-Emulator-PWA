import type { Plugin, ResolvedConfig } from "vite";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Cache only the app shell. CheerpJ relies on native Range semantics, so neither
// the engine nor external runtime requests are intercepted by our worker.
export function pwaShell(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "java-retro-pwa",
    apply: "build",
    configResolved(value) {
      config = value;
    },
    async closeBundle() {
      const directory = resolve(config.root, config.build.outDir);
      const template = await readFile(
        resolve(config.root, "src/pwa/service-worker.js"),
        "utf8",
      );
      const assets = (await readdir(resolve(directory, "assets")))
        .filter((name) => /\.(?:js|css|woff2?)$/.test(name))
        .sort()
        .map((name) => "/assets/" + name);
      const files = [
        "/index.html",
        "/manifest.webmanifest",
        "/icons/icon.svg",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/maskable-512.png",
        "/icons/apple-touch-icon.png",
        ...assets,
      ];
      const hash = createHash("sha256").update(template);
      for (const file of files)
        hash
          .update(file)
          .update(await readFile(resolve(directory, "." + file)));
      const worker = template
        .replace("__CACHE_VERSION__", hash.digest("hex").slice(0, 16))
        .replace("__PRECACHE_URLS__", JSON.stringify(files));
      await writeFile(resolve(directory, "sw.js"), worker);
    },
  };
}
