import type { Plugin, ResolvedConfig } from "vite";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import runtime from "../src/pwa/runtime-resources.json";

// The small shell is automatic. The full, hash-verified engine is opt-in.
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
      const resources = [...runtime.files];
      for (const name of (
        await readdir(resolve(directory, "engine"), { recursive: true })
      ).sort()) {
        if (!/\.[a-z0-9]+$/i.test(name)) continue;
        const url = "/engine/" + name.replaceAll("\\", "/");
        const bytes = await readFile(resolve(directory, "." + url));
        resources.push({
          url,
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          type: /\.js$/.test(url)
            ? "application/javascript"
            : /\.html$/.test(url)
              ? "text/html"
              : /\.wasm$/.test(url)
                ? "application/wasm"
                : /\.css$/.test(url)
                  ? "text/css"
                  : "application/octet-stream",
        });
      }
      const version = createHash("sha256")
        .update(JSON.stringify({ resources, metadata: runtime.metadata }))
        .digest("hex")
        .slice(0, 20);
      const offline = {
        format: 1,
        version,
        runtime: runtime.base,
        resources,
        metadata: runtime.metadata,
      };
      await writeFile(
        resolve(directory, "offline-manifest.json"),
        JSON.stringify(offline),
      );
      const files = [
        "/index.html",
        "/offline-manifest.json",
        "/fonts/manrope.ttf",
        "/fonts/space-grotesk.ttf",
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
        .replace("__PRECACHE_URLS__", JSON.stringify(files))
        .replace("__OFFLINE_MANIFEST__", JSON.stringify(offline));
      await writeFile(resolve(directory, "sw.js"), worker);
    },
  };
}
