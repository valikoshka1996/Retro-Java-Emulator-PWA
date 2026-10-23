import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
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

test("пагінація, пошук, жанри та пакетна публікація", async ({
  page,
  request,
}) => {
  await request.post("/api/repository/session", {
    data: { password: "test-only-password-0123456789" },
  });
  const original = unzipSync(
    new Uint8Array(await readFile("public/fixtures/rms-probe.jar")),
  );
  const manifest = strFromU8(original["META-INF/MANIFEST.MF"]);
  for (let i = 1; i <= 25; i++) {
    const entries = {
      ...original,
      "META-INF/MANIFEST.MF": strToU8(
        manifest.replace(
          /MIDlet-Name:[^\r\n]*/,
          `MIDlet-Name: Game ${String(i).padStart(2, "0")}`,
        ),
      ),
    };
    const response = await request.post(
      "/api/repository/games?filename=page.jar",
      {
        headers: { "Content-Type": "application/java-archive" },
        data: Buffer.from(zipSync(entries)),
      },
    );
    expect(response.ok()).toBe(true);
  }
  await page.goto("/");
  await page.getByLabel("Як вас називати?").fill("Pagination");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  await page.getByRole("button", { name: "Магазин", exact: true }).click();
  await page
    .getByRole("button", { name: "Адміністрування", exact: true })
    .click();
  // APIRequestContext and browser cookies are separate: authenticate the UI.
  await page
    .getByLabel("Пароль адміністратора")
    .fill("test-only-password-0123456789");
  await page.getByRole("button", { name: "Увійти", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Опублікувати всі чернетки (25)",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Опубліковано ігор: 25.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".repository-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Наступна", exact: true }).click();
  await expect(page.getByLabel("Сторінка магазину")).toHaveValue("2");
  await expect(
    page.getByRole("heading", { name: "Game 13", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Наступна", exact: true }).click();
  await expect(page.locator(".repository-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Наступна", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Пошук у магазині").fill("Game 02");
  await expect(page.locator(".repository-card")).toHaveCount(1);
  await expect(page.getByLabel("Сторінка магазину")).toHaveValue("1");
  await page.getByLabel("Пошук у магазині").fill("");
  await page.getByLabel("Ігор на сторінці").selectOption("24");
  await expect(page.locator(".repository-card")).toHaveCount(24);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
