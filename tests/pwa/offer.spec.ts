import{test,expect}from'@playwright/test';
test('пропозиція офлайн: явне завантаження, відкладання та доступ із налаштувань',async({page})=>{
  await page.goto('/');await page.getByLabel('Як вас називати?').fill('Offline offer');await page.getByRole('button',{name:'Створити профіль'}).click();
  const offer=page.getByRole('region',{name:'Підготовка до гри без інтернету'});
  await expect(offer).toBeVisible();
  expect(await page.evaluate(async()=>{for(const name of await caches.keys())if(name.startsWith('java-retro-offline-')){const cache=await caches.open(name);if((await cache.keys()).length)return true;}return false;})).toBe(false);
  await page.getByRole('button',{name:'Нагадати про офлайн пізніше'}).click();await expect(offer).toHaveCount(0);await page.reload();await expect(page.getByRole('heading',{name:'Ваша бібліотека'})).toBeVisible();await expect(offer).toHaveCount(0);
  await page.locator('.sidebar').getByRole('button',{name:'Налаштування',exact:true}).click();await expect(page.getByRole('button',{name:'Підготувати офлайн-пакет',exact:true})).toBeVisible();
});
