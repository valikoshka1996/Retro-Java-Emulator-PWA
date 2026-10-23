// Small runtime JARs are loaded into CheerpJ's read-only memory filesystem.
// /app uses HTTP Range; some reverse proxies silently strip that request header.
const libraries = ["freej2me-web.jar", "retro-bridge.jar"];
const MAX_LIBRARY_BYTES = 4 * 1024 * 1024;

export function withTimeout(task, milliseconds, message) {
  let timer;
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function loadRuntimeLibraries(progress) {
  const paths = [];
  for (const name of libraries) {
    progress(`Завантаження ${name}…`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let bytes;
    try {
      const response = await fetch(new URL(name, import.meta.url), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok)
        throw Error(
          `Не вдалося завантажити ${name}: HTTP ${response.status}. Перевірте reverse proxy.`,
        );
      if (Number(response.headers.get("content-length")) > MAX_LIBRARY_BYTES)
        throw Error(`Завеликий файл рушія: ${name}.`);
      bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.length > MAX_LIBRARY_BYTES ||
        bytes.length < 4 ||
        bytes[0] !== 0x50 ||
        bytes[1] !== 0x4b ||
        bytes[2] !== 3 ||
        bytes[3] !== 4
      )
        throw Error(
          `Замість ${name} сервер повернув некоректний JAR. Перевірте URL Rewrite та кеш proxy.`,
        );
    } catch (error) {
      if (controller.signal.aborted)
        throw Error(
          `Завантаження ${name} перевищило 30 секунд. Перевірте з’єднання й повторіть запуск.`,
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const path = "/str/retro-" + name;
    cheerpOSAddStringFile(path, bytes);
    paths.push(path);
  }
  progress("Запуск Java-бібліотек FreeJ2ME…");
  return withTimeout(
    cheerpjRunLibrary(paths.join(":")),
    90000,
    "Java-бібліотеки не запустилися за 90 секунд. Перевірте доступ до CheerpJ CDN і повторіть запуск.",
  );
}
