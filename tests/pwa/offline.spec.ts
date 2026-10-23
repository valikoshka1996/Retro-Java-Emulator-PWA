import { test, expect, chromium, webkit, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync } from "fflate";

test("повний локальний пакет: SHA-256, ZIP, перезапуск без HTTP-кешу, офлайн JVM та RMS", async ({
  browserName,
}, info) => {
  const launcher = browserName === "webkit" ? webkit : chromium;
  const profile = info.outputPath("browser-profile"),
    options = { baseURL: "http://127.0.0.1:4173", headless: true };
  let context = await launcher.launchPersistentContext(profile, options),
    page = await context.newPage();
  let logs: string[] = [];
  const observe = (p: Page) => {
    p.on("console", (m) => {
      logs.push(m.text());
      if (/PROBE_/.test(m.text())) console.log(m.text());
    });
  };
  observe(page);
  const stop = async () => {
    await page.getByRole("button", { name: "Стоп", exact: true }).click();
    await expect(page.getByText("Гру зупинено", { exact: true })).toBeVisible({
      timeout: 45000,
    });
  };
  const play = async (value: number) => {
    logs = [];
    await page.getByRole("button", { name: "Грати", exact: true }).click();
    await expect
      .poll(() => logs.some((s) => s.includes("PROBE_READ:" + value)), {
        timeout: 90000,
        intervals: [1000],
      })
      .toBe(true);
  };
  try {
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((r) =>
          navigator.serviceWorker.addEventListener("controllerchange", r, {
            once: true,
          }),
        );
    });
    await page.getByLabel("Як вас називати?").fill("Fully offline");
    await page.getByRole("button", { name: "Створити профіль" }).click();
    await page.getByRole("button", { name: "Додати RMS Probe" }).click();
    await page
      .getByRole("button", { name: "До бібліотеки", exact: true })
      .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Налаштування", exact: true })
      .click();
    // A partial download must never be advertised as a ready package.
    await context.route("**/engine/offline.js", (route) =>
      route.abort("failed"),
    );
    await page
      .getByRole("button", { name: "Підготувати офлайн-пакет", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30000 });
    expect(
      await page.evaluate(async () => {
        for (const name of await caches.keys())
          if (name.startsWith("java-retro-offline-")) {
            if (
              await (await caches.open(name)).match("/__retro_offline_ready__")
            )
              return true;
          }
        return false;
      }),
    ).toBe(false);
    await context.unroute("**/engine/offline.js");
    await page.getByRole("button", { name: "Закрити", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Підготовка до гри без інтернету" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Підготувати офлайн", exact: true })
      .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Налаштування", exact: true })
      .click();
    await expect(
      page.getByText("Офлайн-пакет збережено та перевірено.", { exact: false }),
    ).toBeVisible({ timeout: 150000 });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Експорт офлайн-пакета", exact: true })
      .click();
    await (await pending).saveAs(info.outputPath("offline.zip"));
    const original = await readFile(info.outputPath("offline.zip")),
      entries = unzipSync(new Uint8Array(original));
    entries["resources/0"][0] ^= 1;
    await writeFile(
      info.outputPath("tampered.zip"),
      zipSync(entries, { level: 0 }),
    );
    await page
      .getByLabel("Імпорт офлайн-пакета", { exact: true })
      .setInputFiles(info.outputPath("tampered.zip"));
    await expect(page.getByRole("alert")).toContainText("Контрольна сума");
    await expect(
      page.getByText("Офлайн-пакет збережено та перевірено.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Закрити", exact: true }).click();
    await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
    await play(0);
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect
      .poll(() => logs.some((s) => s.includes("PROBE_SAVED:1")), {
        timeout: 15000,
      })
      .toBe(true);
    await stop();
    if (browserName === "chromium") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.clearBrowserCache");
      await cdp.detach();
    }
    await context.close();
    context = await launcher.launchPersistentContext(profile, options);
    if (browserName === "webkit")
      await context.route("**/*", (route) => route.continue());
    await context.setOffline(true);
    page = await context.newPage();
    observe(page);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Відкрити RMS Probe" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
    await play(1);
    await stop();
    await page.screenshot({
      path: info.outputPath("offline-real-jvm.png"),
      fullPage: true,
    });
    // Delete only the runtime package. No HTTP cache or CDN can rescue the import.
    await page.evaluate(async () => {
      for (const key of await caches.keys())
        if (key.startsWith("java-retro-offline-")) await caches.delete(key);
    });
    await page.reload();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Налаштування", exact: true })
      .click();
    await page
      .getByLabel("Імпорт офлайн-пакета", { exact: true })
      .setInputFiles(info.outputPath("offline.zip"));
    await expect(
      page.getByText("Офлайн-пакет збережено та перевірено.", { exact: false }),
    ).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Закрити", exact: true }).click();
    await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
    await play(1);
    await stop();
  } finally {
    await writeFile(
      info.outputPath("runtime-console.json"),
      JSON.stringify(logs, null, 2),
    );
    await writeFile(
      info.outputPath("runtime-page.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => "closed"),
    );
    await page
      .screenshot({ path: info.outputPath("runtime-final.png") })
      .catch(() => {});
    await context.close();
  }
});
