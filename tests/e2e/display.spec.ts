import { test, expect } from "@playwright/test";
test("екран: повороти, зміна viewport, фактичний розмір Canvas та координати тачу", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.innerHTML =
      '<div style="position:absolute;inset:0"><canvas width="240" height="320" tabindex="0"></canvas></div>';
    const displayPath = "/engine/display.js",
      inputPath = "/engine/input.js";
    const { createDisplayLayout } = await import(displayPath),
      { attachPointerInput } = await import(inputPath);
    const canvas = document.querySelector("canvas")!;
    (window as any).events = [];
    (window as any).geometry = [];
    (window as any).layout = createDisplayLayout(canvas, (g: any) =>
      (window as any).geometry.push(g),
    );
    attachPointerInput(
      canvas,
      { queueEvent: (event: any) => (window as any).events.push(event) },
      () => true,
    );
  });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 320, height: 568 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    for (const rotation of [0, 90, 180, 270]) {
      await page.evaluate(
        (rotation) =>
          (window as any).layout.update({ rotation, integerScale: false }),
        rotation,
      );
      await expect(page.locator("canvas")).toHaveAttribute(
        "data-rotation",
        String(rotation),
      );
      const rect = (await page.locator("canvas").boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(-1);
      expect(rect.y).toBeGreaterThanOrEqual(-1);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(rect.width / rect.height).toBeCloseTo(
        rotation % 180 ? 320 / 240 : 240 / 320,
        3,
      );
      await page.evaluate(() => ((window as any).events = []));
      await page.mouse.click(
        rect.x + rect.width * 0.25,
        rect.y + rect.height * 0.75,
      );
      const [pressed, released] = await page.evaluate(
        () => (window as any).events,
      );
      const [x, y] =
        rotation === 0
          ? [60, 240]
          : rotation === 90
            ? [180, 240]
            : rotation === 180
              ? [180, 80]
              : [60, 80];
      expect(pressed.kind).toBe("pointerpressed");
      expect(Math.abs(pressed.x - x)).toBeLessThanOrEqual(1);
      expect(Math.abs(pressed.y - y)).toBeLessThanOrEqual(1);
      expect(released.kind).toBe("pointerreleased");
    }
  }
  await page.evaluate(() => {
    const c = document.querySelector("canvas")!;
    c.width = 640;
    c.height = 360;
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).geometry.at(-1)))
    .toEqual({ width: 360, height: 640, rotation: 270 });
});
