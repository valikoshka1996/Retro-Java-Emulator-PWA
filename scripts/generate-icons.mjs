// Rasterize our existing vector brand mark; no generated game artwork.
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
const svg = await readFile("public/icons/icon.svg", "utf8");
const browser = await chromium.launch();
try {
  for (const [name, size, maskable] of [
    ["icon-192", 192, false],
    ["icon-512", 512, false],
    ["maskable-512", 512, true],
    ["apple-touch-icon", 180, false],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>body{margin:0;background:#71ebc5}svg{display:block;width:${size}px;height:${size}px}</style>${maskable ? svg.replace("<g stroke=", '<g transform="translate(51.2 51.2) scale(.8)"><g stroke=').replace("</svg>", "</g></svg>") : svg}`,
    );
    await page.screenshot({ path: `public/icons/${name}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
