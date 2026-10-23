import { createServer } from "node:http";
import { mkdir, readFile, rename, unlink, open, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, resolve } from "node:path";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { analyzeJar } from "../src/importer.ts";

const scrypt = promisify(scryptCallback);
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max, label, required = false) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw fail(400, `Перевірте поле «${label}».`);
  return value.trim();
};
async function atomic(file, bytes) {
  const tmp = file + "." + randomBytes(8).toString("hex") + ".tmp";
  const handle = await open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, file);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}
export async function startRepository({
  directory = process.env.REPOSITORY_DATA || "./repository-data",
  port = Number(process.env.PORT || 8081),
  host = process.env.HOST || "0.0.0.0",
} = {}) {
  directory = resolve(directory);
  await mkdir(join(directory, "jars"), { recursive: true, mode: 0o700 });
  await mkdir(join(directory, "icons"), { recursive: true, mode: 0o700 });
  let auth;
  try {
    auth = JSON.parse(await readFile(join(directory, "auth.json"), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const password =
      process.env.ADMIN_PASSWORD || randomBytes(24).toString("base64url");
    if (password.length < 16)
      throw Error("ADMIN_PASSWORD must contain at least 16 characters");
    const salt = randomBytes(16).toString("hex");
    auth = { salt, hash: (await scrypt(password, salt, 64)).toString("hex") };
    await atomic(join(directory, "auth.json"), JSON.stringify(auth));
    if (!process.env.ADMIN_PASSWORD)
      await atomic(
        join(directory, "admin-credentials.txt"),
        `Java Retro — пароль адміністратора\n${password}\nЗберігайте цей файл приватно.\n`,
      );
  }
  let catalog;
  try {
    catalog = JSON.parse(
      await readFile(join(directory, "catalog.json"), "utf8"),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    catalog = { format: 1, games: [] };
  }
  if (catalog.format !== 1 || !Array.isArray(catalog.games))
    throw Error("Unsupported repository catalog; restore a backup");
  let mutation = Promise.resolve();
  const serialize = (fn) => {
    const pending = mutation.then(fn);
    mutation = pending.catch(() => {});
    return pending;
  };
  const save = async (games) => {
    await atomic(
      join(directory, "catalog.json"),
      JSON.stringify({ format: 1, games }, null, 2),
    );
    catalog = { format: 1, games };
  };
  const sessions = new Map(),
    attempts = new Map();
  const tokenOf = (req) =>
    /(?:^|;\s*)retro_admin=([A-Za-z0-9_-]+)/.exec(
      req.headers.cookie || "",
    )?.[1];
  const admin = (req) => {
    const token = tokenOf(req),
      expires = sessions.get(token);
    if (expires > Date.now()) return true;
    sessions.delete(token);
    return false;
  };
  const body = async (req, limit) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw fail(413, "Файл завеликий. JAR — до 32 МБ.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const jsonBody = async (req) => {
    try {
      return JSON.parse((await body(req, 16384)).toString());
    } catch (e) {
      if (e.status) throw e;
      throw fail(400, "Некоректний JSON.");
    }
  };
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  const cookie = (req, token, age) =>
    `retro_admin=${token}; Path=/api/repository; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://repository"),
        path = url.pathname.replace(/^\/api\/repository/, "");
      if (req.url === "/healthz") {
        json(res, 200, { ok: true });
        return;
      }
      if (!url.pathname.startsWith("/api/repository/"))
        throw fail(404, "Не знайдено.");
      if (req.method !== "GET" && req.method !== "HEAD") {
        // Origin is checked in addition to an HttpOnly session; no browser secret is embedded in the app.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host)
          throw fail(403, "Запит з іншого сайту відхилено.");
        if (req.headers["sec-fetch-site"] === "cross-site")
          throw fail(403, "Запит з іншого сайту відхилено.");
      }
      if (path === "/session" && req.method === "GET") {
        json(res, 200, { admin: admin(req) });
        return;
      }
      if (path === "/session" && req.method === "POST") {
        // The proxy supplies a single client address, never an arbitrary forwarded chain.
        const ip = req.headers["x-real-ip"] || req.socket.remoteAddress;
        const current = attempts.get(ip) || {
          count: 0,
          until: Date.now() + 900000,
        };
        if (current.until < Date.now()) {
          current.count = 0;
          current.until = Date.now() + 900000;
        }
        if (current.count >= 10)
          throw fail(429, "Забагато спроб. Спробуйте через 15 хвилин.");
        current.count++;
        attempts.set(ip, current);
        if (attempts.size > 5000)
          for (const [key, a] of attempts)
            if (a.until < Date.now()) attempts.delete(key);
        const { password } = await jsonBody(req);
        if (typeof password !== "string" || password.length > 256)
          throw fail(400, "Введіть пароль.");
        const actual = await scrypt(password, auth.salt, 64);
        if (!timingSafeEqual(actual, Buffer.from(auth.hash, "hex")))
          throw fail(401, "Неправильний пароль.");
        attempts.delete(ip);
        for (const [key, expires] of sessions)
          if (expires < Date.now()) sessions.delete(key);
        if (sessions.size >= 1000) throw fail(429, "Забагато сесій.");
        const token = randomBytes(32).toString("base64url");
        sessions.set(token, Date.now() + 8 * 3600000);
        res.setHeader("Set-Cookie", cookie(req, token, 8 * 3600));
        json(res, 200, { admin: true });
        return;
      }
      if (path === "/session" && req.method === "DELETE") {
        sessions.delete(tokenOf(req));
        res.setHeader("Set-Cookie", cookie(req, "", 0));
        json(res, 200, { admin: false });
        return;
      }
      if (path === "/games" && req.method === "GET") {
        const isAdmin = admin(req);
        json(res, 200, {
          games: catalog.games
            .filter((g) => isAdmin || g.published)
            .map(({ configuration, ...g }) => g),
        });
        return;
      }
      const match = /^\/games\/([0-9a-f]{64})(?:\/(jar|icon))?$/.exec(path);
      if (match && req.method === "GET" && match[2]) {
        const game = catalog.games.find(
          (g) => g.id === match[1] && (g.published || admin(req)),
        );
        if (!game) throw fail(404, "Гру не знайдено.");
        const icon = match[2] === "icon";
        if (icon && !game.hasIcon) throw fail(404, "Немає іконки.");
        const file = join(
          directory,
          icon ? "icons" : "jars",
          game.id + (icon ? ".png" : ".jar"),
        );
        const { size } = await stat(file);
        res.writeHead(200, {
          "Content-Type": icon ? "image/png" : "application/java-archive",
          "Content-Length": size,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          ...(icon
            ? {}
            : {
                "Content-Disposition": `attachment; filename="${game.id}.jar"`,
              }),
        });
        await pipeline(createReadStream(file), res);
        return;
      }
      if (!admin(req)) throw fail(401, "Увійдіть як адміністратор.");
      if (path === "/games" && req.method === "POST") {
        const filename = text(
          url.searchParams.get("filename"),
          512,
          "Ім’я файлу",
          true,
        );
        const bytes = await body(req, 32 * 1024 * 1024);
        let analyzed;
        try {
          analyzed = await analyzeJar(new Blob([bytes]), filename);
        } catch (e) {
          throw fail(400, e.message);
        }
        const id = createHash("sha256").update(bytes).digest("hex");
        const result = await serialize(async () => {
          const existing = catalog.games.find((g) => g.id === id);
          if (existing) return { game: existing, duplicate: true };
          let screen = analyzed.compatibility.screen;
          const hint = /(?:^|\D)(\d{2,4})\s*[xх×]\s*(\d{2,4})(?:\D|$)/i.exec(
            filename,
          );
          if (
            screen.confidence < 0.5 &&
            hint &&
            +hint[1] >= 64 &&
            +hint[2] >= 64 &&
            +hint[1] <= 1024 &&
            +hint[2] <= 1024
          )
            screen = {
              value: [+hint[1], +hint[2]],
              confidence: 0.6,
              evidence: "Розмір із назви файлу; перевірте у грі.",
            };
          const game = {
            id,
            filename,
            size: bytes.length,
            title: analyzed.metadata.name,
            genre: "Інше",
            description: "",
            tags: [],
            published: false,
            featured: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: analyzed.metadata,
            compatibility: { ...analyzed.compatibility, screen },
            hasIcon: !!analyzed.icon,
            screen: screen.value,
          };
          await atomic(join(directory, "jars", id + ".jar"), bytes);
          if (analyzed.icon)
            await atomic(
              join(directory, "icons", id + ".png"),
              Buffer.from(await analyzed.icon.arrayBuffer()),
            );
          await save([...catalog.games, game]);
          return { game, duplicate: false };
        });
        json(res, result.duplicate ? 200 : 201, result);
        return;
      }
      if (match && !match[2] && req.method === "PATCH") {
        const changes = await jsonBody(req);
        const result = await serialize(async () => {
          const game = catalog.games.find((g) => g.id === match[1]);
          if (!game) throw fail(404, "Гру не знайдено.");
          const update = { ...game, updatedAt: Date.now() };
          if ("title" in changes)
            update.title = text(changes.title, 160, "Назва", true);
          if ("genre" in changes)
            update.genre = text(changes.genre, 60, "Жанр", true);
          if ("description" in changes)
            update.description = text(changes.description, 4000, "Опис");
          if ("tags" in changes) {
            if (!Array.isArray(changes.tags) || changes.tags.length > 12)
              throw fail(400, "До 12 тегів.");
            update.tags = changes.tags.map((t) => text(t, 40, "Тег", true));
          }
          for (const key of ["published", "featured"])
            if (key in changes) {
              if (typeof changes[key] !== "boolean")
                throw fail(400, "Некоректний перемикач.");
              update[key] = changes[key];
            }
          if ("screen" in changes) {
            if (
              !Array.isArray(changes.screen) ||
              changes.screen.length !== 2 ||
              changes.screen.some(
                (n) => !Number.isInteger(n) || n < 64 || n > 1024,
              )
            )
              throw fail(400, "Розмір екрана: 64–1024 px.");
            update.screen = changes.screen;
          }
          await save(catalog.games.map((g) => (g.id === game.id ? update : g)));
          return update;
        });
        json(res, 200, { game: result });
        return;
      }
      if (match && !match[2] && req.method === "DELETE") {
        await serialize(async () => {
          if (!catalog.games.some((g) => g.id === match[1]))
            throw fail(404, "Гру не знайдено.");
          await save(catalog.games.filter((g) => g.id !== match[1]));
          for (const [folder, ext] of [
            ["jars", ".jar"],
            ["icons", ".png"],
          ])
            await unlink(join(directory, folder, match[1] + ext)).catch((e) => {
              if (e.code !== "ENOENT")
                console.error(
                  "Could not remove orphaned repository file",
                  e.code,
                );
            });
        });
        json(res, 200, { deleted: true });
        return;
      }
      throw fail(404, "Не знайдено.");
    } catch (e) {
      if (!res.headersSent)
        json(res, e.status || 500, {
          error: e.status
            ? e.message
            : "Не вдалося виконати операцію зі сховищем.",
        });
      else res.end();
      if (!e.status) console.error("Repository operation failed:", e.message);
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  await new Promise((ok, reject) => {
    server.once("error", reject);
    server.listen(port, host, ok);
  });
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const server = await startRepository();
  console.log("Java Retro repository listening on", server.address().port);
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
