import { test, expect } from "@playwright/test";
test("реальний MIDlet: RMS → стоп → закрити браузер → відкрити → прочитати", async ({
  browser,
  browserName,
}, testInfo) => {
  // Persistent browser profile is required: storageState does not include CheerpJ filesystem.
  const { chromium } = await import("@playwright/test");
  const userData = testInfo.outputPath("browser-profile");
  let context = await chromium.launchPersistentContext(userData, {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  let page = await context.newPage();
  const logs: string[] = [];
  page.on("console", (m) => {
    logs.push(m.text());
    if (/PROBE_|Exception|Error|Crash/.test(m.text())) console.log(m.text());
  });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto("/");
  await page.getByLabel("Як вас називати?").fill("RMS Tester");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_READ:0")), {
      timeout: 240000,
      intervals: [1000],
    })
    .toBe(true);
  const frame = page.frameLocator("iframe");
  await frame.locator("#display").click();
  const vmFrame = page
    .frames()
    .find((f) => f.url().includes("/engine/player.html"))!;
  await vmFrame.evaluate(() => {
    const midi = (window as any).libmidi;
    const analyser = midi.context.createAnalyser();
    analyser.fftSize = 256;
    midi.midiPlayer.gainNode.connect(analyser);
    (window as any).probePeak = 0;
    const values = new Float32Array(analyser.fftSize);
    const sample = () => {
      analyser.getFloatTimeDomainData(values);
      (window as any).probePeak = Math.max(
        (window as any).probePeak,
        ...Array.from(values, Math.abs),
      );
      requestAnimationFrame(sample);
    };
    sample();
  });
  await page.keyboard.press("Digit1");
  await expect
    .poll(() => vmFrame.evaluate(() => (window as any).probePeak), {
      timeout: 15000,
    })
    .toBeGreaterThan(0.001);
  await page.setViewportSize({ width: 390, height: 844 });
  // Exercise the iPhone/PWA viewport fallback: desktop Chromium refuses window
  // resizing while its native fullscreen window is active.
  await page.evaluate(() => {
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(Element.prototype, "webkitRequestFullscreen", {
      value: undefined,
      configurable: true,
    });
  });
  await page
    .getByRole("button", { name: "На весь екран", exact: true })
    .click();
  await expect(page.locator(".is-immersive .key-fire")).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_SAVED:1")), {
      timeout: 30000,
    })
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("real-mobile-fullscreen.png"),
  });
  await page.getByRole("button", { name: "Меню гри", exact: true }).click();
  await page.getByLabel("Поворот екрана гри").selectOption("90");
  await page
    .getByRole("button", { name: "Повернутися до гри", exact: true })
    .click();
  await expect(frame.locator("#display")).toHaveAttribute(
    "data-rotation",
    "90",
  );
  expect(page.frames()).toContain(vmFrame);
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const canvas = await frame.locator("#display").boundingBox(),
          host = await page.locator(".emulator-host").boundingBox();
        return (
          !!canvas &&
          !!host &&
          canvas.x >= host.x - 1 &&
          canvas.y >= host.y - 1 &&
          canvas.x + canvas.width <= host.x + host.width + 1 &&
          canvas.y + canvas.height <= host.y + host.height + 1
        );
      })
      .toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("real-rotated-game.png") });
  await page.getByRole("button", { name: "Вийти", exact: true }).click();
  const shot = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скріншот", exact: true }).click();
  const png = await (
    await import("node:fs/promises")
  ).readFile((await (await shot).path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([320, 240]);
  await page.getByRole("button", { name: "Збереження", exact: true }).click();
  await page.getByLabel("Назва резервної копії").fill("Before restart");
  await page.getByRole("button", { name: /Створити слот/ }).click();
  await expect(
    page.getByRole("heading", { name: "Before restart" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрити", exact: true }).click();
  await page.getByRole("button", { name: "Стоп", exact: true }).click();
  await expect(page.getByText("Гру зупинено", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.screenshot({
    path: testInfo.outputPath("player-stopped.png"),
    fullPage: true,
  });
  await context.close();
  context = await chromium.launchPersistentContext(userData, {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  page = await context.newPage();
  logs.length = 0;
  page.on("console", (m) => {
    logs.push(m.text());
    if (/PROBE_|Exception|Error/.test(m.text())) console.log(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ваша бібліотека" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_READ:1")), {
      timeout: 240000,
      intervals: [1000],
    })
    .toBe(true);
  await expect(page.getByLabel("Поворот екрана гри")).toHaveValue("90");
  await expect(page.frameLocator("iframe").locator("#display")).toHaveAttribute(
    "data-rotation",
    "90",
  );
  await page.screenshot({
    path: testInfo.outputPath("rms-restored.png"),
    fullPage: true,
  });
  await expect(page.locator(".rms-feedback")).toContainText("RMS ✓", {
    timeout: 15000,
  });
  const confirmed = await page.locator(".rms-feedback").innerText();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_SAVED:2")), {
      timeout: 15000,
    })
    .toBe(true);
  await expect
    .poll(() => page.locator(".rms-feedback").innerText(), { timeout: 15000 })
    .not.toBe(confirmed);
  await expect(page.locator(".rms-feedback")).toContainText("RMS ✓");
  // Close without Stop, after the application has confirmed the periodic copy.
  await context.close();
  context = await chromium.launchPersistentContext(userData, {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
  });
  page = await context.newPage();
  logs.length = 0;
  page.on("console", (m) => {
    logs.push(m.text());
    if (/PROBE_/.test(m.text())) console.log(m.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_READ:2")), {
      timeout: 90000,
      intervals: [1000],
    })
    .toBe(true);
  await page.getByRole("button", { name: "Стоп", exact: true }).click();
  await expect(page.getByText("Гру зупинено", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await context.close();
});
