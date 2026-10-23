import { test, expect, type Page } from "@playwright/test";

async function appleDevice(page: Page, mode: "iphone" | "ipad" = "iphone") {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript((kind) => {
    Object.defineProperty(navigator, "userAgent", {
      value:
        kind === "iphone"
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1"
          : "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    });
    Object.defineProperty(navigator, "platform", {
      value: kind === "iphone" ? "iPhone" : "MacIntel",
    });
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
  }, mode);
}

test("iPhone: ручне встановлення, компактна інструкція та відмова на 7 днів", async ({
  page,
}, info) => {
  await appleDevice(page);
  await page.goto("/");
  const button = page.getByRole("button", {
    name: "Як встановити",
    exact: true,
  });
  await expect(button).toBeVisible({ timeout: 10000 });
  await button.click();
  await expect(page.locator("#pwa-apple-install-steps")).toContainText(
    "На початковий екран",
  );
  await expect(page.locator("#pwa-apple-install-steps")).toContainText(
    "Поділитися",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("iphone-install.png") });
  await page.getByRole("button", { name: "Встановити пізніше" }).click();
  await expect(button).toHaveCount(0);
  const until = await page.evaluate(
    () => JSON.parse(localStorage.getItem("retro-pwa-install")!).until,
  );
  expect(until - Date.now()).toBeGreaterThan(6 * 86400000);
  await page.reload();
  await page.waitForTimeout(4500);
  await expect(button).toHaveCount(0);
  // Expired snoozes allow the offer again, rather than hiding it forever.
  await page.evaluate(() =>
    localStorage.setItem("retro-pwa-install", JSON.stringify({ until: 1 })),
  );
  await page.reload();
  await expect(button).toBeVisible({ timeout: 10000 });
});

test("iPad із desktop UA: користувач може підтвердити, що вже встановив", async ({
  page,
}) => {
  await appleDevice(page, "ipad");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Як встановити", exact: true })
    .click({ timeout: 10000 });
  await page.getByRole("button", { name: "Уже встановлено" }).click();
  await page.reload();
  await page.waitForTimeout(4500);
  await expect(
    page.getByRole("button", { name: "Як встановити", exact: true }),
  ).toHaveCount(0);
});

for (const mode of ["standalone", "ios-standalone"] as const) {
  test(`запуск встановленої PWA (${mode}) приховує пропозицію`, async ({
    page,
  }) => {
    await appleDevice(page);
    await page.addInitScript((kind) => {
      if (kind === "ios-standalone")
        Object.defineProperty(navigator, "standalone", { value: true });
      else {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const media = original(query);
          if (query === "(display-mode: standalone)")
            Object.defineProperty(media, "matches", { value: true });
          return media;
        };
      }
    }, mode);
    await page.goto("/");
    await page.waitForTimeout(4500);
    await expect(
      page.getByLabel("Встановлення та стан застосунку"),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("retro-pwa-install")!).knownInstalled,
      ),
    ).toBe(true);
  });
}

test("Chromium: native prompt тільки після кліку, appinstalled прибирає пропозицію", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        (window as any).installCalls = 1;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  const button = page.getByRole("button", { name: "Встановити", exact: true });
  await expect(button).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).installCalls),
  ).toBeUndefined();
  await button.click();
  expect(await page.evaluate(() => (window as any).installCalls)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(button).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("retro-pwa-install")!).knownInstalled,
    ),
  ).toBe(true);
});
