import { test, expect } from "@playwright/test";
test("магазин: адміністратор, JAR, публікація, локальна інсталяція та видалення", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Як вас називати?").fill("Store player");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Магазин", exact: true }).click();
  await page
    .getByRole("button", { name: "Адміністрування", exact: true })
    .click();
  await page
    .getByLabel("Пароль адміністратора")
    .fill("test-only-password-0123456789");
  await page.getByRole("button", { name: "Увійти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Майстерня каталогу" }),
  ).toBeVisible();
  await page
    .locator('input[type=file][accept=".jar"]')
    .setInputFiles("public/fixtures/rms-probe.jar");
  await expect(
    page.getByText("Додано чернеток: 1.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Редагувати", exact: true }).click();
  await page.getByLabel("Назва гри", { exact: true }).fill("Ретро тест");
  await page.getByRole("dialog").getByRole("combobox").fill("Аркади");
  await page
    .getByLabel("Опис", { exact: true })
    .fill("Гра з нашого магазину — встановлення одним дотиком.");
  await page.getByLabel("Опублікувати у магазині").check();
  await page
    .getByRole("button", { name: "Зберегти зміни", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ретро тест", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вийти", exact: true }).click();
  await page.getByRole("button", { name: "Встановити", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Відкрити гру", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("store-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Відкрити гру", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ретро тест", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Відкрити Ретро тест", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Магазин", exact: true }).click();
  await page
    .getByRole("button", { name: "Адміністрування", exact: true })
    .click();
  await page
    .getByLabel("Пароль адміністратора")
    .fill("test-only-password-0123456789");
  await page.getByRole("button", { name: "Увійти", exact: true }).click();
  await page.getByRole("button", { name: "Редагувати", exact: true }).click();
  await page
    .getByRole("button", { name: "Видалити з репозиторію", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Так, видалити гру", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Тут з’являться нові пригоди" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Бібліотека", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Відкрити Ретро тест", exact: true }),
  ).toBeVisible();
});
