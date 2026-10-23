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
  await page.keyboard.press("Enter");
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_SAVED:1")), {
      timeout: 30000,
    })
    .toBe(true);
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
  await page.getByRole("button", { name: /RMS Tester/ }).click();
  await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect
    .poll(() => logs.some((s) => s.includes("PROBE_READ:1")), {
      timeout: 240000,
      intervals: [1000],
    })
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("rms-restored.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Стоп", exact: true }).click();
  await expect(page.getByText("Гру зупинено", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await context.close();
});
