import { test, expect, type Page } from "@playwright/test";

// Keep layout/input regressions independent of the CDN. emulator.spec exercises
// the real JVM separately; this bridge records exactly what the UI sends.
async function openPlayer(page: Page, api: "missing" | "denied" | "native") {
  await page.addInitScript((api) => {
    if (api === "missing") {
      Object.defineProperty(Element.prototype, "requestFullscreen", {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(Element.prototype, "webkitRequestFullscreen", {
        value: undefined,
        configurable: true,
      });
    } else if (api === "denied") {
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error("Not allowed"));
    }
  }, api);
  await page.route("**/engine/player.html?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body style="margin:0;background:#132a25;color:#80efca;display:grid;place-items:center;height:100vh;font-family:monospace"><div>RMS Probe<br>240 × 320</div><script>
    const token=new URLSearchParams(location.search).get('token'); window.keys=[];
    const emit=(kind,payload)=>parent.postMessage({retro:true,token,kind,payload},location.origin);
    addEventListener('message',e=>{ if(e.data.method==='key') keys.push(e.data.payload); });
    emit('ready');
    </script></body>`,
    }),
  );
  await page.goto("/");
  await page.getByLabel("Як вас називати?").fill("Mobile Tester");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect(page.locator(".phone-key.key-fire")).toBeEnabled();
}

async function fits(page: Page) {
  const bounds = await page
    .locator(
      ".phone-key:not([disabled]), .is-immersive .player-stage, .immersive-toolbar",
    )
    .evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      }),
    );
  const size = page.viewportSize()!;
  for (const b of bounds) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(size.width + 1);
    expect(b.bottom).toBeLessThanOrEqual(size.height + 1);
    expect(b.height).toBeGreaterThan(20);
  }
}

test("iPhone без Fullscreen API: повний екран, поворот, налаштування та одночасні дотики", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlayer(page, "missing");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const frame = page
    .frames()
    .find((f) => f.url().includes("/engine/player.html"))!;
  await page
    .getByRole("button", { name: "На весь екран", exact: true })
    .click();
  await expect(page.locator(".player-page")).toHaveAttribute(
    "data-fullscreen-mode",
    "viewport",
  );
  await expect(page.locator(".sidebar")).toBeHidden();
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath("phone-portrait.png") });
  const up = (await page.locator(".key-up").boundingBox())!,
    fire = (await page.locator(".key-fire").boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const points = [
    { x: up.x + up.width / 2, y: up.y + up.height / 2, id: 1 },
    { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 },
  ];
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: points.slice(1),
  });
  await expect
    .poll(() =>
      frame.evaluate(() =>
        (window as any).keys
          .filter((k: any) => !k.down)
          .map((k: any) => k.action),
      ),
    )
    .toEqual(["fire"]);
  expect(
    await page
      .locator(".key-fire span")
      .evaluate((e) => getComputedStyle(e).webkitUserSelect),
  ).toBe("none");
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() =>
      frame.evaluate(() =>
        (window as any).keys
          .filter((k: any) => k.down)
          .map((k: any) => k.action)
          .sort(),
      ),
    )
    .toEqual(["fire", "up"]);
  await expect
    .poll(() =>
      frame.evaluate(() =>
        (window as any).keys
          .filter((k: any) => !k.down)
          .map((k: any) => k.action),
      ),
    )
    .toEqual(expect.arrayContaining(["fire", "up"]));
  await page.getByRole("button", { name: "Клавіатура", exact: true }).click();
  await page
    .getByRole("button", { name: "Великі кнопки", exact: true })
    .click();
  await page.getByLabel("Тема клавіатури").selectOption("mint");
  for (const name of [
    "Висота кнопок",
    "Відступ між кнопками",
    "Ширина клавіатури",
  ]) {
    await page.getByRole("slider", { name, exact: true }).focus();
    await page.keyboard.press("End");
  }
  await page
    .getByRole("button", { name: "Зберегти вигляд", exact: true })
    .click();
  await expect(page.locator(".phone-keypad.theme-mint")).toBeVisible();
  expect(page.frames()).toContain(frame); // No reload of the running game.
  for (const size of [
    { width: 375, height: 667 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath(`phone-${size.width}x${size.height}.png`),
    });
  }
  await page.getByRole("button", { name: "Вийти", exact: true }).click();
  await expect(page.locator(".player-page")).toHaveAttribute(
    "data-fullscreen-mode",
    "window",
  );
  await expect(page.locator(".sidebar")).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByLabel("Режим керування").selectOption("touch");
  await expect(page.locator(".phone-keypad")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect(page.getByLabel("Режим керування")).toHaveValue("touch");
  await expect(page.locator(".phone-keypad")).toHaveCount(0);
  await page.getByLabel("Режим керування").selectOption("both");
  await expect(page.locator(".phone-keypad.theme-mint")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const api of ["denied", "native"] as const)
  test(`fullscreen ${api}: вихід і доступ до клавіатури`, async ({ page }) => {
    if (api === "denied")
      await page.setViewportSize({ width: 375, height: 667 });
    await openPlayer(page, api);
    await page
      .getByRole("button", { name: "На весь екран", exact: true })
      .click();
    await expect(page.locator(".player-page")).toHaveAttribute(
      "data-fullscreen-mode",
      api === "native" ? "native" : "viewport",
    );
    await fits(page);
    if (api === "native")
      expect(
        await page.evaluate(() =>
          document.fullscreenElement?.contains(
            document.querySelector(".phone-keypad"),
          ),
        ),
      ).toBe(true);
    await page.getByRole("button", { name: "Клавіатура", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Закрити", exact: true }).click();
    await page.getByRole("button", { name: "Вийти", exact: true }).click();
    await expect(page.locator(".player-page")).toHaveAttribute(
      "data-fullscreen-mode",
      "window",
    );
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  });
