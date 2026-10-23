import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";

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

test("повне закриття браузера → офлайн: профіль, RMS, автокопії й зовнішній ZIP", async ({}, info) => {
  const { chromium } = await import("@playwright/test");
  const userData = info.outputPath("offline-profile");
  let context = await chromium.launchPersistentContext(userData, {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  });
  try {
    let page = await context.newPage();
    await shellReady(page);
    await page.getByLabel("Як вас називати?").fill("Offline durable profile");
    await page.getByRole("button", { name: "Створити профіль" }).click();
    await page.getByRole("button", { name: "Додати RMS Probe" }).click();
    await page.getByRole("button", { name: "Збереження", exact: true }).click();
    for (const text of ["A", "B", "C"]) {
      const data = zipSync({ "rms/probe": strToU8(text) });
      await page.locator(".save-manager input[type=file]").setInputFiles({
        name: text + ".zip",
        mimeType: "application/zip",
        buffer: Buffer.from(data),
      });
      await expect(
        page.getByText(
          "Автоматичні попередні копії (" +
            ["A", "B", "C"].indexOf(text) +
            "/2)",
        ),
      ).toBeVisible();
    }
    await context.close();
    context = await chromium.launchPersistentContext(userData, {
      baseURL: "http://127.0.0.1:4173",
      headless: true,
    });
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Ваша бібліотека" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
    await page.getByRole("button", { name: "Збереження", exact: true }).click();
    await page.getByText("Автоматичні попередні копії (2/2)").click();
    await page
      .getByRole("button", { name: "Відновити автокопію", exact: true })
      .first()
      .click();
    const rmsDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Експорт RMS", exact: true })
      .click();
    const rmsFile = await rmsDownload;
    await rmsFile.saveAs(info.outputPath("restored.zip"));
    expect(
      strFromU8(
        unzipSync(
          new Uint8Array(await readFile(info.outputPath("restored.zip"))),
        )["rms/probe"],
      ),
    ).toBe("B");
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Налаштування", exact: true })
      .click();
    const archiveDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Експорт профілю", exact: true })
      .click();
    const file = await archiveDownload;
    await file.saveAs(info.outputPath("profile.zip"));
    const entries = unzipSync(
      new Uint8Array(await readFile(info.outputPath("profile.zip"))),
    );
    const manifest = JSON.parse(strFromU8(entries["profile.json"]));
    expect(manifest.profile.name).toBe("Offline durable profile");
    expect(
      strFromU8(
        unzipSync(entries[`saves/${manifest.games[0].hash}.zip`])["rms/probe"],
      ),
    ).toBe("B");
    await page.getByRole("button", { name: "Закрити", exact: true }).click();
    await page
      .getByRole("button", { name: "До бібліотеки", exact: true })
      .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Налаштування", exact: true })
      .click();
    await page
      .locator('input[type=file][accept=".zip"]')
      .setInputFiles(info.outputPath("profile.zip"));
    await page.getByRole("button", { name: "Закрити", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Відкрити RMS Probe" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
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
test("HTTP 206, proxy без Range та справжній MIDlet з RMS", async ({
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
  const loadedLibraries: string[] = [];
  // Reproduce aaPanel stripping Range: any JAR request receives the full HTTP 200 body.
  await page.route("**/engine/*.jar", async (route) => {
    const headers = { ...route.request().headers() };
    delete headers.range;
    delete headers["if-range"];
    const response = await route.fetch({ headers });
    expect(response.status()).toBe(200);
    loadedLibraries.push(new URL(route.request().url()).pathname);
    await route.fulfill({ response });
  });
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
  expect(loadedLibraries.sort()).toEqual([
    "/engine/freej2me-web.jar",
    "/engine/retro-bridge.jar",
  ]);
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

test("помилка HTTP при завантаженні рушія показується замість нескінченного Loading", async ({
  page,
}) => {
  await shellReady(page);
  await page.getByLabel("Як вас називати?").fill("Broken Proxy");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page.route("**/engine/freej2me-web.jar", (route) =>
    route.fulfill({ status: 502, body: "Bad Gateway" }),
  );
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "freej2me-web.jar: HTTP 502",
    { timeout: 30000 },
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Грати", exact: true }),
  ).toBeEnabled();
});

test("помилка імпорту модуля доходить до UI ще до запуску JVM", async ({
  page,
}) => {
  await shellReady(page);
  await page.getByLabel("Як вас називати?").fill("Missing Module");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page.route("**/engine/runtime.js", (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Не вдалося завантажити скрипт рушія",
    { timeout: 15000 },
  );
  await expect(page.locator("iframe")).toHaveCount(0);
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
