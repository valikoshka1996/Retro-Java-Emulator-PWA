import { test, expect } from "@playwright/test";

test("Стоп чекає активного RMS, завершує Java один раз і повертає фінальний RMS", async ({
  page,
}) => {
  test.setTimeout(30000);
  await page.route("**/engine/stop-harness?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<canvas></canvas><div id="loading"></div><script type="module">
    import { bridge } from '/engine/bridge.js';
    window.calls=[]; let active=false, generation=1;
    const helper={
      prepare:async()=>{},
      exportRms:async()=>{
        if(active)throw Error("Java code still running, check for a missing 'await'");
        active=true;calls.push('export:'+generation);
        await new Promise(resolve=>window.finishExport=resolve);
        active=false;return new Uint8Array([generation]);
      },
      destroy:async()=>{
        if(active)throw Error("Java code still running, check for a missing 'await'");
        active=true;calls.push('destroy');
        await new Promise(resolve=>window.finishDestroy=resolve);
        generation=2;active=false;
      }
    };
    window.libmidi={context:{resume:async()=>{}}};
    window.bridgeLoaded=true;
    await bridge.prepare({retro:{RetroBridge:helper}});
    bridge.attach(document.querySelector('canvas'),{queueEvent(){}});
    bridge.ready();window.harnessReady=true;
  </script>`,
    }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).replies = [];
    window.addEventListener("message", (e) => {
      if (e.data.kind === "reply") (window as any).replies.push(e.data.payload);
    });
    const frame = document.createElement("iframe");
    frame.src = "/engine/stop-harness?token=stop-test";
    document.body.append(frame);
  });
  const frame = page.frameLocator("iframe");
  await frame.locator("canvas").waitFor();
  const vm = page.frames().find((f) => f.url().includes("stop-harness"))!;
  await vm.waitForFunction(() => (window as any).bridgeLoaded);
  const send = (method: string, id: number, payload?: unknown) =>
    page.evaluate(
      ({ method, id, payload }) => {
        document
          .querySelector("iframe")!
          .contentWindow!.postMessage(
            { retro: true, token: "stop-test", method, id, payload },
            location.origin,
          );
      },
      { method, id, payload },
    );
  await send("install", 0, {
    appId: "retro_a",
    jar: new ArrayBuffer(0),
    configuration: { keys: {}, width: 240, height: 320 },
    properties: {},
  });
  await vm.waitForFunction(() => (window as any).harnessReady);
  await send("snapshot", 1);
  await vm.waitForFunction(() => (window as any).calls.length === 1);
  await send("stop", 2);
  await send("snapshot", 3);
  await send("stop", 4);
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() =>
      (window as any).replies.filter((r: any) => r.error),
    ),
  ).toEqual([]);
  expect(await vm.evaluate(() => (window as any).calls)).toEqual(["export:1"]);
  await vm.evaluate(() => (window as any).finishExport());
  await vm.waitForFunction(() => (window as any).calls.includes("destroy"));
  expect(await vm.evaluate(() => (window as any).calls)).toEqual([
    "export:1",
    "destroy",
  ]);
  await vm.evaluate(() => (window as any).finishDestroy());
  await vm.waitForFunction(() => (window as any).calls.length === 3);
  await vm.evaluate(() => (window as any).finishExport());
  await vm.waitForFunction(() => (window as any).calls.length === 4);
  await vm.evaluate(() => (window as any).finishExport());
  await expect
    .poll(() => page.evaluate(() => (window as any).replies.length))
    .toBe(5);
  const replies = await page.evaluate(() =>
    (window as any).replies.map((r: any) => ({
      id: r.id,
      error: r.error,
      bytes:
        r.result instanceof ArrayBuffer
          ? [...new Uint8Array(r.result)]
          : undefined,
    })),
  );
  expect(replies.filter((r: any) => r.error)).toEqual([]);
  for (const id of [2, 3, 4])
    expect(replies.find((r: any) => r.id === id).bytes).toEqual([2]);
  expect(await vm.evaluate(() => (window as any).calls)).toEqual([
    "export:1",
    "destroy",
    "export:2",
    "export:2",
  ]);
});
