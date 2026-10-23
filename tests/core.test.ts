import { describe, it, expect, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import {
  parseManifest,
  analyzeJar,
  CompatibilityAnalyzer,
} from "../src/importer";
import { safeUnzip, binaryBlob } from "../src/archive";
import {
  RetroDB,
  createProfile,
  installGame,
  removeGame,
  putSave,
  createSlot,
  restoreSlot,
  exportProfile,
  importProfile,
  saveTouchControls,
} from "../src/db";
import {
  defaultTouchControls,
  normalizeTouchControls,
  validateTouchControls,
} from "../src/touch";
import { validateConfiguration } from "../src/config";
const databases: RetroDB[] = [];
function database() {
  const d = new RetroDB("test-" + crypto.randomUUID());
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases.splice(0)) await d.delete();
});
async function fixture() {
  return new Blob([await readFile("public/fixtures/rms-probe.jar")]);
}
const rms = (value: string) =>
  binaryBlob(zipSync({ "rms/probe": strToU8(value) }));
describe("JAR та аналіз сумісності", () => {
  it("відхиляє пошкоджений CRC", () => {
    const zip = zipSync({ "test.txt": strToU8("hello") }, { level: 0 });
    zip[30 + "test.txt".length] ^= 1;
    expect(() => safeUnzip(zip)).toThrow("CRC");
  });
  it("читає перенос manifest і двокрапки у значенні", () =>
    expect(
      parseManifest(
        "MIDlet-Name: Hello\r\n World\r\nURL: https://example.com\r\n",
      ),
    ).toMatchObject({
      "MIDlet-Name": "HelloWorld",
      URL: "https://example.com",
    }));
  it("читає реальний MIDlet та стабільний SHA-256", async () => {
    const a = await analyzeJar(await fixture(), "probe.jar");
    const b = await analyzeJar(await fixture(), "renamed.jar");
    expect(a.hash).toBe(b.hash);
    expect(a.metadata.midlets[0].className).toBe("RmsProbe");
    expect(a.metadata.midp).toBe("MIDP-2.0");
    expect(a.compatibility.screen.confidence).toBeLessThan(0.5);
  });
  it("JAD доповнює manifest", async () => {
    const a = await analyzeJar(
      await fixture(),
      "probe.jar",
      new Blob([
        "MIDlet-Name: Test\nMIDlet-Screen-Width: 176\nMIDlet-Screen-Height: 208",
      ]),
    );
    expect(a.metadata.name).toBe("Test");
    expect(a.configuration.width).toBe(176);
    expect(a.compatibility.screen.confidence).toBe(0.9);
  });
  it("окремо визначає M3G та Mascot", () => {
    const a = CompatibilityAnalyzer.analyze(
      {},
      {
        "Test.class": strToU8(
          "javax/microedition/m3g/Graphics3D com/mascotcapsule/micro3d/v3/Figure com/nokia/mid/ui/DirectGraphics",
        ),
      },
    );
    expect(a.apis).toEqual(["M3G / JSR-184", "Mascot Capsule v3", "Nokia UI"]);
    expect(a.phone.value).toBe("Nokia");
  });
  it("відхиляє файл без MIDlet і пошкоджений ZIP", async () => {
    await expect(
      analyzeJar(binaryBlob(zipSync({ "file.txt": strToU8("x") })), "bad.jar"),
    ).rejects.toThrow("MIDlet");
    expect(() => safeUnzip(new Uint8Array(40))).toThrow();
  });
  it("відхиляє traversal до розпакування", () =>
    expect(() => safeUnzip(zipSync({ "../escape": strToU8("x") }))).toThrow(
      "шлях",
    ));
  it("відхиляє zip bomb за заявленими розмірами", () => {
    const zip = zipSync({ bomb: new Uint8Array(2 * 1024 * 1024) });
    expect(() => safeUnzip(zip)).toThrow("межі");
  });
  it("відхиляє oversized та неправильне розширення", async () => {
    await expect(analyzeJar(new Blob(["abc"]), "x.zip")).rejects.toThrow("JAR");
    await expect(
      analyzeJar(new Blob([new Uint8Array(33 * 1024 * 1024)]), "x.jar"),
    ).rejects.toThrow("32");
  });
});
describe("Профілі, IndexedDB та резервні копії", () => {
  it("старі конфігурації працюють без touchControls; некоректні розміри відхиляються", async () => {
    const a = await analyzeJar(await fixture(), "x.jar");
    delete a.configuration.touchControls;
    expect(() => validateConfiguration(a.configuration)).not.toThrow();
    expect(normalizeTouchControls(a.configuration.touchControls)).toEqual(
      defaultTouchControls(),
    );
    expect(() =>
      validateTouchControls({ ...defaultTouchControls(), width: 999 }),
    ).toThrow();
    expect(() =>
      validateTouchControls({ ...defaultTouchControls(), gap: NaN }),
    ).toThrow();
  });
  it("вигляд клавіатури не перезаписує інші параметри і переноситься в архіві", async () => {
    const d = database(),
      p = await createProfile("Phone", "👾", d),
      g = await installGame(p.id, await fixture(), "x.jar", undefined, d);
    await d.games.update(g.id, {
      configuration: {
        ...g.configuration,
        width: 176,
        keys: { ...g.configuration.keys, up: "KeyI" },
      },
    });
    const touch = {
      ...defaultTouchControls(),
      theme: "mint" as const,
      width: 248,
    };
    await saveTouchControls(g.id, touch, d);
    const saved = (await d.games.get(g.id))!;
    expect(saved.configuration.width).toBe(176);
    expect(saved.configuration.keys.up).toBe("KeyI");
    const copy = await importProfile(await exportProfile(p.id, d), d);
    const imported = await d.games.where({ profileId: copy.id }).first();
    expect(imported?.configuration.touchControls).toEqual(touch);
    await expect(
      saveTouchControls(g.id, { ...touch, keyHeight: 500 }, d),
    ).rejects.toThrow();
    expect((await d.games.get(g.id))?.configuration.touchControls).toEqual(
      touch,
    );
  });
  it("архів переносить залишені RMS видалених ігор", async () => {
    const d = database(),
      p = await createProfile("A", "👾", d),
      jar = await fixture();
    const game = await installGame(p.id, jar, "x.jar", undefined, d);
    await putSave(p.id, game.id, rms("orphan"), d);
    await createSlot(p.id, game.id, "kept", undefined, d);
    await removeGame(p.id, game.id, false, d);
    const copy = await importProfile(await exportProfile(p.id, d), d);
    expect(await d.games.where({ profileId: copy.id }).count()).toBe(0);
    const restored = await installGame(copy.id, jar, "x.jar", undefined, d);
    expect(await d.saves.get(restored.id)).toBeDefined();
    expect(
      await d.slots.where({ profileId: copy.id, gameId: restored.id }).count(),
    ).toBe(1);
  });
  it("валідовує ім’я профілю", async () => {
    await expect(createProfile(" ", undefined, database())).rejects.toThrow(
      "Ім’я",
    );
  });
  it("ізолює однакові JAR і RMS між профілями та ловить дублікати", async () => {
    const d = database(),
      p = await createProfile("A", "👾", d),
      q = await createProfile("B", "🎮", d),
      jar = await fixture();
    const a = await installGame(p.id, jar, "x.jar", undefined, d),
      b = await installGame(q.id, jar, "x.jar", undefined, d);
    expect(a.hash).toBe(b.hash);
    expect(a.id).not.toBe(b.id);
    await expect(installGame(p.id, jar, "y.jar", undefined, d)).rejects.toThrow(
      "вже",
    );
    await putSave(p.id, a.id, rms("A"), d);
    await expect(putSave(q.id, a.id, rms("B"), d)).rejects.toThrow("Чужий");
    expect(await d.saves.get(b.id)).toBeUndefined();
  });
  it("зберігає бінарні дані після закриття DB", async () => {
    const d = database(),
      p = await createProfile("A", "👾", d),
      g = await installGame(p.id, await fixture(), "x.jar", undefined, d);
    await putSave(p.id, g.id, rms("persisted"), d);
    d.close();
    await d.open();
    const s = (await d.saves.get(g.id))!;
    expect(
      new TextDecoder().decode(
        safeUnzip(new Uint8Array(await s.data.arrayBuffer()))["rms/probe"],
      ),
    ).toBe("persisted");
  });
  it("створює, відновлює, перейменовує і видаляє слоти; максимум п’ять", async () => {
    const d = database(),
      p = await createProfile("A", "👾", d),
      g = await installGame(p.id, await fixture(), "x.jar", undefined, d);
    await putSave(p.id, g.id, rms("before"), d);
    const s = await createSlot(p.id, g.id, "first", undefined, d);
    await putSave(p.id, g.id, rms("after"), d);
    await restoreSlot(p.id, s.id, d);
    const restored = (await d.saves.get(g.id))!;
    expect(
      new TextDecoder().decode(
        safeUnzip(new Uint8Array(await restored.data.arrayBuffer()))[
          "rms/probe"
        ],
      ),
    ).toBe("before");
    await d.slots.update(s.id, { name: "renamed" });
    expect((await d.slots.get(s.id))?.name).toBe("renamed");
    await Promise.all(
      Array.from({ length: 4 }, () =>
        createSlot(p.id, g.id, "extra", undefined, d),
      ),
    );
    await expect(
      createSlot(p.id, g.id, "overflow", undefined, d),
    ).rejects.toThrow("5");
    await d.slots.delete(s.id);
    expect(await d.slots.count()).toBe(4);
  });
  it("експортує/імпортує профіль, конфігурацію, RMS і слоти з новими ID", async () => {
    const d = database(),
      p = await createProfile("Player", "🚀", d),
      g = await installGame(p.id, await fixture(), "x.jar", undefined, d);
    await d.games.update(g.id, {
      configuration: { ...g.configuration, width: 176, height: 208 },
    });
    await putSave(p.id, g.id, rms("backup"), d);
    await createSlot(
      p.id,
      g.id,
      "slot",
      new Blob(["image"], { type: "image/png" }),
      d,
    );
    await d.sessions.add({
      id: "test",
      gameId: g.id,
      profileId: p.id,
      startedAt: 1,
      endedAt: 11,
      seconds: 10,
    });
    const archive = await exportProfile(p.id, d),
      copy = await importProfile(archive, d);
    expect(copy.id).not.toBe(p.id);
    const imported = (await d.games.where({ profileId: copy.id }).toArray())[0];
    expect(imported.configuration.width).toBe(176);
    expect(imported.hash).toBe(g.hash);
    expect((await d.saves.get(imported.id))?.profileId).toBe(copy.id);
    expect(await d.slots.where({ profileId: copy.id }).count()).toBe(1);
    expect(
      (await d.sessions.where({ profileId: copy.id }).toArray())[0].seconds,
    ).toBe(10);
  });
  it("видалення може залишити RMS для повторного імпорту", async () => {
    const d = database(),
      p = await createProfile("A", "👾", d),
      jar = await fixture(),
      g = await installGame(p.id, jar, "x.jar", undefined, d);
    await putSave(p.id, g.id, rms("keep"), d);
    await removeGame(p.id, g.id, false, d);
    expect(await d.files.get(g.id)).toBeUndefined();
    const again = await installGame(p.id, jar, "x.jar", undefined, d);
    expect(again.id).toBe(g.id);
    expect(await d.saves.get(again.id)).toBeDefined();
    await removeGame(p.id, g.id, true, d);
    expect(await d.saves.get(g.id)).toBeUndefined();
  });
  it("відхиляє чужий слот і RMS з довільними файлами", async () => {
    const d = database(),
      p = await createProfile("A", "👾", d),
      q = await createProfile("B", "👾", d),
      g = await installGame(p.id, await fixture(), "x.jar", undefined, d);
    await expect(
      putSave(
        p.id,
        g.id,
        binaryBlob(zipSync({ "config/settings.conf": strToU8("bad") })),
        d,
      ),
    ).rejects.toThrow("лише rms");
    await putSave(p.id, g.id, rms("ok"), d);
    const s = await createSlot(p.id, g.id, "one", undefined, d);
    await expect(restoreSlot(q.id, s.id, d)).rejects.toThrow("Слот");
  });
  it("пошкоджений імпорт профілю не залишає часткових даних", async () => {
    const d = database();
    await expect(
      importProfile(
        binaryBlob(zipSync({ "profile.json": strToU8('{"format":2}') })),
        d,
      ),
    ).rejects.toThrow("формат");
    expect(await d.profiles.count()).toBe(0);
  });
});
