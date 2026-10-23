import { test, expect } from "@playwright/test";
test("бібліотека, клавіатура, профілі, експорт та мобільний екран", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Як вас називати?").fill("Player One");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await expect(
    page.getByRole("heading", { name: "Ваша бібліотека" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("library-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Додати RMS Probe" }).click();
  await page.getByRole("button", { name: "Клавіатура", exact: true }).click();
  await page.getByRole("button", { name: "↑ ArrowUp", exact: true }).click();
  await page.keyboard.press("KeyI");
  await page.getByRole("button", { name: "Зберегти розкладку" }).click();
  await expect(page.getByText("KeyI", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "До бібліотеки", exact: true })
    .click();
  await page.getByRole("button", { name: "В обрані", exact: true }).click();
  await page.getByLabel("Пошук ігор").fill("not here");
  await expect(
    page.getByRole("heading", { name: "Нічого не знайдено" }),
  ).toBeVisible();
  await page.getByLabel("Пошук ігор").fill("");
  await page.getByRole("button", { name: "Налаштування", exact: true }).click();
  const wait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Експорт профілю", exact: true })
    .click();
  const archive = await wait;
  await archive.saveAs(testInfo.outputPath("profile.zip"));
  await page.getByRole("button", { name: "Закрити", exact: true }).click();
  await page.getByRole("button", { name: "Профілі", exact: true }).click();
  await page.getByRole("button", { name: "Новий профіль" }).click();
  await page.getByLabel("Як вас називати?").fill("Player Two");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await expect(
    page.getByRole("button", { name: "Відкрити RMS Probe" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("library-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Налаштування", exact: true }).click();
  await page
    .getByLabel("Імпорт профілю", { exact: true })
    .setInputFiles(testInfo.outputPath("profile.zip"));
  await page.getByRole("button", { name: "Закрити", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Відкрити RMS Probe" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Відкрити RMS Probe" }),
  ).toBeVisible();
});
