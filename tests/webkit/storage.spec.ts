import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

test("Safari/WebKit: іконка, зміна клавіатури, stop → play та мобільна ширина", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGnYAAAAASUVORK5CYII=",
    "base64",
  );
  const rms = Array.from(zipSync({ "rms/probe": strToU8("saved") }));
  // Exercise the real adapter and IndexedDB with deterministic replies. The
  // separate Chromium emulator test executes the actual Java VM and real RMS.
  await page.route("**/engine/player.html?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<script>
 const token=new URLSearchParams(location.search).get('token');const emit=(kind,payload)=>parent.postMessage({retro:true,token,kind,payload},location.origin);
 addEventListener('message',e=>{const {method,id}=e.data;let result=true;if(method==='snapshot'||method==='stop')result=new Uint8Array(${JSON.stringify(rms)}).buffer;if(method==='screenshot')result=new Blob([new Uint8Array(${JSON.stringify(Array.from(png))})],{type:'image/png'});if(id)emit('reply',{id,result});if(method==='install')emit('ready');});emit('booted');
 </script>`,
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Як вас називати?").fill("Safari Player");
  await page.getByRole("button", { name: "Створити профіль" }).click();
  const jar = unzipSync(
    new Uint8Array(await readFile("public/fixtures/rms-probe.jar")),
  );
  jar["META-INF/MANIFEST.MF"] = strToU8(
    strFromU8(jar["META-INF/MANIFEST.MF"]).trim() +
      "\r\nMIDlet-Icon: icon.png\r\n\r\n",
  );
  jar["icon.png"] = new Uint8Array(png);
  await page.locator('input[type=file][accept*=".jar"]').setInputFiles({
    name: "probe-icon.jar",
    mimeType: "application/java-archive",
    buffer: Buffer.from(zipSync(jar)),
  });
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect(page.locator(".key-fire")).toBeEnabled();
  await page
    .getByRole("button", { name: "Вигляд клавіатури", exact: true })
    .click();
  await page.getByLabel("Тема клавіатури").selectOption("violet");
  await page.screenshot({
    path: info.outputPath("webkit-mobile-keyboard.png"),
  });
  await page
    .getByRole("button", { name: "Зберегти вигляд", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".touch-controls .theme-violet")).toBeVisible();
  for (let n = 0; n < 2; n++) {
    await page.getByRole("button", { name: "Стоп", exact: true }).click();
    await expect(page.getByText("Гру зупинено", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Грати", exact: true }).click();
    await expect(page.locator(".key-fire")).toBeEnabled();
  }
  await page.getByRole("button", { name: "Стоп", exact: true }).click();
  await expect(page.getByText("Гру зупинено", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Бібліотека", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "До бібліотеки", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Відкрити RMS Probe" }),
  ).toBeVisible();
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    main: document.querySelector("main")!.getBoundingClientRect().x,
    nav: document.querySelector(".sidebar")!.getBoundingClientRect().y,
  }));
  expect(layout.width).toBeLessThanOrEqual(390);
  expect(layout.main).toBe(0);
  expect(layout.nav).toBeGreaterThan(700);
  await page.screenshot({
    path: info.outputPath("webkit-mobile-library.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Відкрити RMS Probe" }).click();
  await page.getByRole("button", { name: "Грати", exact: true }).click();
  await expect(page.locator(".touch-controls .theme-violet")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});
