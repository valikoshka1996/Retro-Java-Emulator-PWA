import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

async function shellReady(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => resolve(),
        { once: true },
      ),
    );
  });
}
test("manifest, PNG-іконки, кеш оболонки та офлайн-бібліотека", async ({
  page,
  context,
}, info) => {
  await shellReady(page);
  const cdp = await context.newCDPSession(page);
  const eligibility = await cdp.send("Page.getInstallabilityErrors");
  expect(eligibility.installabilityErrors).toEqual([]);
  await cdp.detach();
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons).toHaveLength(3);
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    expect(bytes.readUInt32BE(16)).toBe(Number(icon.sizes.split("x")[0]));
    expect(bytes.readUInt32BE(20)).toBe(Number(icon.sizes.split("x")[1]));
  }
  await page.getByLabel("Як вас називати?").fill("PWA Player");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page
    .getByRole("button", { name: "До бібліотеки", exact: true })
    .click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ваша бібліотека" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Відкрити RMS Probe" }),
  ).toBeVisible();
  await expect(page.getByText("Ви офлайн", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Для запуску гри потрібен інтернет",
  );
  await page.screenshot({
    path: info.outputPath("offline-pwa.png"),
    fullPage: true,
  });
  const requests = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const key of keys.filter((k) => k.startsWith("java-retro-shell-"))) {
      for (const request of await (await caches.open(key)).keys())
        urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(requests).toContain("/index.html");
  expect(
    requests.some((p) => p.startsWith("/assets/") && p.endsWith(".js")),
  ).toBe(true);
  expect(
    requests.some(
      (p) => p.startsWith("/engine/") || p.startsWith("/fixtures/"),
    ),
  ).toBe(false);
});
test("service worker не змінює Range і справжній MIDlet пише RMS", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  await shellReady(page);
  const range = await page.evaluate(async () => {
    const r = await fetch("/engine/freej2me-web.jar", {
      headers: { Range: "bytes=0-15" },
    });
    return {
      status: r.status,
      range: r.headers.get("content-range"),
      size: (await r.arrayBuffer()).byteLength,
    };
  });
  expect(range.status).toBe(206);
  expect(range.range).toMatch(/^bytes 0-15\//);
  expect(range.size).toBe(16);
  await page.getByLabel("Як вас називати?").fill("PWA RMS");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_READ:0")), {
      timeout: 180000,
      intervals: [1000],
    })
    .toBe(true);
  await page.frameLocator("iframe").locator("#display").click();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_SAVED:1")), {
      timeout: 10000,
    })
    .toBe(true);
  await page.getByRole("button", { name: "Стоп", exact: true }).click();
  await expect(page.getByText("Гру зупинено", { exact: true })).toBeVisible({
    timeout: 45000,
  });
});
test("встановлення обробляє відмову користувача без фальшивого installed", async ({
  page,
}) => {
  await shellReady(page);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        (window as any).promptCalls = ((window as any).promptCalls || 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Встановити", exact: true }).click();
  expect(await page.evaluate(() => (window as any).promptCalls)).toBe(1);
  await expect(
    page.getByRole("button", { name: "Встановити", exact: true }),
  ).toHaveCount(0);
});

test("оновлення очікує зупинки рушія й зберігає бібліотеку", async ({
  page,
}) => {
  await shellReady(page);
  await page.getByLabel("Як вас називати?").fill("Update Player");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page
    .getByRole("button", { name: "До бібліотеки", exact: true })
    .click();
  const original = await readFile("dist/sw.js", "utf8");
  const updated = original.replace(
    /const CACHE = PREFIX \+ .+;/,
    'const CACHE = PREFIX + "update-integration";',
  );
  expect(updated).not.toBe(original);
  const file = "dist/sw.js";
  await writeFile(file, updated);
  try {
    await page.evaluate(async () => {
      await caches.open("unrelated-cache");
      await (await navigator.serviceWorker.getRegistration())!.update();
      await new Promise<void>((locked) => {
        void navigator.locks.request("java-retro-engine", async () => {
          await new Promise<void>((release) => {
            (window as any).releaseTestGame = release;
            locked();
          });
        });
      });
    });
    await expect(
      page.getByRole("button", { name: "Оновити", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Оновити", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Спочатку зупиніть гру",
    );
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
    ).toContain("/sw.js");
    await page.evaluate(() => (window as any).releaseTestGame());
    const reloaded = page.waitForEvent("load");
    await page.getByRole("button", { name: "Оновити", exact: true }).click();
    await reloaded;
    await expect(
      page.getByRole("button", { name: "Відкрити RMS Probe" }),
    ).toBeVisible();
    const cachesAfter = await page.evaluate(() => caches.keys());
    expect(cachesAfter).toContain("unrelated-cache");
    expect(
      cachesAfter.filter((k) => k.startsWith("java-retro-shell-")),
    ).toEqual(["java-retro-shell-update-integration"]);
  } finally {
    await page
      .evaluate(() => (window as any).releaseTestGame?.())
      .catch(() => {});
    await writeFile(file, original);
  }
});
