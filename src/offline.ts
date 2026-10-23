import { create } from "zustand";
import { zipSync, strToU8, strFromU8 } from "fflate";
import { safeUnzip, binaryBlob } from "./archive";
import { requestDurableStorage } from "./storage";

interface Resource {
  url: string;
  size: number;
  sha256: string;
  type: string;
}
export interface OfflineManifest {
  format: 1;
  version: string;
  runtime: string;
  resources: Resource[];
  metadata: { url: string; kind: string }[];
}
export const READY_KEY = "/__retro_offline_ready__";
export const offlineCacheName = (manifest: OfflineManifest) =>
  "java-retro-offline-" + manifest.version;
interface OfflineState {
  phase: "checking" | "absent" | "busy" | "ready" | "error";
  done: number;
  total: number;
  bytes: number;
  totalBytes: number;
  error: string;
  manifest?: OfflineManifest;
}
export const useOffline = create<OfflineState>(() => ({
  phase: "checking",
  done: 0,
  total: 0,
  bytes: 0,
  totalBytes: 0,
  error: "",
}));
let manifestPromise: Promise<OfflineManifest | undefined> | undefined;
export function getOfflineManifest() {
  return (manifestPromise ??= (async () => {
    try {
      const r = await fetch("/offline-manifest.json");
      if (!r.ok) return;
      const m = (await r.json()) as OfflineManifest;
      if (
        m.format === 1 &&
        typeof m.version === "string" &&
        Array.isArray(m.resources)
      )
        return m;
    } catch {
      return;
    }
  })());
}
const key = (file: Resource) => new URL(file.url, location.origin).href;
async function verified(file: Resource, response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  if (bytes.length !== file.size || hash !== file.sha256)
    throw Error("Контрольна сума офлайн-ресурсу не збігається: " + file.url);
  return bytes;
}
function resourceResponse(file: Resource, bytes: Uint8Array) {
  return new Response(new Uint8Array(bytes).buffer, {
    headers: {
      "Content-Type": file.type,
      "Content-Length": String(bytes.length),
    },
  });
}
export async function isOfflinePrepared() {
  const m = await getOfflineManifest();
  if (!m || !("caches" in window)) return false;
  if (!(await caches.keys()).includes(offlineCacheName(m))) return false;
  const cache = await caches.open(offlineCacheName(m));
  if (!(await cache.match(READY_KEY))) return false;
  const keys = new Set((await cache.keys()).map((r) => r.url));
  return m.resources.every((f) => keys.has(key(f)));
}
export async function refreshOffline() {
  try {
    const manifest = await getOfflineManifest(),
      ready = await isOfflinePrepared();
    useOffline.setState({
      manifest,
      phase: ready ? "ready" : "absent",
      total: manifest?.resources.length || 0,
      totalBytes: manifest?.resources.reduce((n, f) => n + f.size, 0) || 0,
      error: "",
    });
  } catch {
    useOffline.setState({
      phase: "error",
      error: "Не вдалося перевірити офлайн-пакет. Перевірте доступ до сховища.",
    });
  }
}
async function exclusive(fn: () => Promise<void>) {
  if (!navigator.locks) throw Error("Потрібен браузер із Web Locks та HTTPS.");
  await navigator.locks.request(
    "java-retro-engine",
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw Error("Зупиніть гру в усіх вкладках перед підготовкою пакета.");
      await fn();
    },
  );
}
export async function prepareOffline() {
  await exclusive(async () => {
    const manifest = await getOfflineManifest();
    if (!manifest) throw Error("Офлайн-пакет доступний у production-збірці.");
    if (!navigator.serviceWorker?.controller)
      throw Error(
        "Дочекайтеся підготовки PWA та повторно відкрийте застосунок.",
      );
    const totalBytes = manifest.resources.reduce((s, f) => s + f.size, 0);
    useOffline.setState({
      phase: "busy",
      manifest,
      error: "",
      done: 0,
      total: manifest.resources.length,
      bytes: 0,
      totalBytes,
    });
    try {
      await requestDurableStorage();
      const cache = await caches.open(offlineCacheName(manifest));
      let done = 0,
        bytes = 0;
      for (const file of manifest.resources) {
        let existing = await cache.match(key(file));
        if (existing) {
          try {
            await verified(file, existing);
          } catch {
            existing = undefined;
          }
        }
        if (!existing) {
          const r = await fetch(key(file), {
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            signal: AbortSignal.timeout(90000),
          });
          if (r.status !== 200 || r.type === "opaque")
            throw Error(
              "Не вдалося завантажити офлайн-ресурс: " +
                file.url +
                " (HTTP " +
                r.status +
                ")",
            );
          await cache.put(
            key(file),
            resourceResponse(file, await verified(file, r)),
          );
        }
        bytes += file.size;
        done++;
        useOffline.setState({ bytes, done });
      }
      await cache.put(
        READY_KEY,
        new Response(
          JSON.stringify({ version: manifest.version, preparedAt: Date.now() }),
        ),
      );
      useOffline.setState({ phase: "ready" });
    } catch (e) {
      useOffline.setState({
        phase: "error",
        error:
          e instanceof Error && /quota/i.test(e.name)
            ? "Недостатньо місця для офлайн-пакета. Профілі та RMS не видалялися."
            : e instanceof Error
              ? e.message
              : String(e),
      });
      throw e;
    }
  });
}
export async function exportOfflinePackage() {
  const manifest = await getOfflineManifest();
  if (!manifest || !(await isOfflinePrepared()))
    throw Error("Спочатку підготуйте повний офлайн-пакет.");
  const cache = await caches.open(offlineCacheName(manifest));
  const entries: Record<string, Uint8Array> = {
    "package.json": strToU8(
      JSON.stringify({ format: 1, version: manifest.version }),
    ),
  };
  for (const [index, file] of manifest.resources.entries()) {
    const r = await cache.match(key(file));
    if (!r) throw Error("Пакет неповний.");
    entries["resources/" + index] = await verified(file, r);
  }
  return binaryBlob(zipSync(entries, { level: 0 }));
}
export async function importOfflinePackage(blob: Blob) {
  if (blob.size > 256 * 1024 * 1024) throw Error("Пакет перевищує 256 МБ.");
  await exclusive(async () => {
    const manifest = await getOfflineManifest();
    if (!manifest) throw Error("Немає опису поточного рушія.");
    const entries = safeUnzip(
      new Uint8Array(await blob.arrayBuffer()),
      256 * 1024 * 1024,
    );
    if (!entries["package.json"] || entries["package.json"].length > 4096)
      throw Error("Некоректний опис офлайн-пакета.");
    const meta =
      entries["package.json"] && JSON.parse(strFromU8(entries["package.json"]));
    if (
      meta?.format !== 1 ||
      meta.version !== manifest.version ||
      Object.keys(entries).length !== manifest.resources.length + 1
    )
      throw Error(
        "Пакет іншої версії або пошкоджений. Підготуйте пакет для поточного оновлення.",
      );
    // Every executable is checked against the app's trusted manifest, never a
    // checksum supplied by the imported archive itself.
    for (const [i, file] of manifest.resources.entries()) {
      if (!entries["resources/" + i]) throw Error("Пакет неповний.");
      await verified(file, resourceResponse(file, entries["resources/" + i]));
    }
    const cache = await caches.open(offlineCacheName(manifest));
    for (const [i, file] of manifest.resources.entries())
      await cache.put(
        key(file),
        resourceResponse(file, entries["resources/" + i]),
      );
    await cache.put(
      READY_KEY,
      new Response(
        JSON.stringify({ version: manifest.version, preparedAt: Date.now() }),
      ),
    );
    await refreshOffline();
  });
}
type DirectoryWindow = Window & {
  showDirectoryPicker?: (options: {
    mode: "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};
export const canChooseOfflineDirectory = () =>
  typeof (window as DirectoryWindow).showDirectoryPicker === "function";
export async function exportOfflineToDirectory() {
  const picker = (window as DirectoryWindow).showDirectoryPicker;
  if (!picker)
    throw Error(
      "Браузер не підтримує вибір папки. Завантажте ZIP та збережіть його у «Файлах».",
    );
  const directory = await picker.call(window, { mode: "readwrite" });
  const blob = await exportOfflinePackage();
  const file = await directory.getFileHandle("java-retro-offline.zip", {
    create: true,
  });
  const writable = await file.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (e) {
    await writable.abort().catch(() => {});
    throw e;
  }
  return directory.name;
}
