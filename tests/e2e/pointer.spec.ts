import { test, expect } from "@playwright/test";
test("Canvas pointer: масштаб, drag, cancel, режим клавіатури та другий палець", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.innerHTML =
      '<canvas id="pointer-probe" width="240" height="320" style="position:absolute;left:40px;top:80px;width:120px;height:160px;transform:scale(1.5);transform-origin:top left"></canvas>';
    const path = "/engine/input.js";
    const { attachPointerInput } = await import(path);
    (window as any).pointerEvents = [];
    (window as any).pointerEnabled = true;
    (window as any).releasePointer = attachPointerInput(
      document.querySelector("canvas"),
      { queueEvent: (event: any) => (window as any).pointerEvents.push(event) },
      () => (window as any).pointerEnabled,
    );
  });
  const canvas = page.locator("#pointer-probe"),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height - 1);
  await page.mouse.up();
  const events = await page.evaluate(() => (window as any).pointerEvents);
  expect(events[0]).toEqual({ kind: "pointerpressed", x: 120, y: 160 });
  expect(events.at(-1).kind).toBe("pointerreleased");
  expect(events.some((e: any) => e.kind === "pointerdragged")).toBe(true);
  await page.evaluate(() => {
    (window as any).pointerEvents = [];
    (window as any).pointerEnabled = false;
  });
  await canvas.click();
  expect(await page.evaluate(() => (window as any).pointerEvents)).toEqual([]);
  await page.evaluate(() => ((window as any).pointerEnabled = true));
  const session = await page.context().newCDPSession(page),
    points = [
      { id: 1, x: box.x + 20, y: box.y + 20 },
      { id: 2, x: box.x + 80, y: box.y + 80 },
    ];
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  expect(
    (await page.evaluate(() => (window as any).pointerEvents)).map(
      (e: any) => e.kind,
    ),
  ).toEqual(["pointerpressed", "pointerreleased"]);
});
