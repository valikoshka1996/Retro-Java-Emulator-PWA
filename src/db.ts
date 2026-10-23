import Dexie, { type EntityTable } from "dexie";
import { zipSync, strToU8, strFromU8 } from "fflate";
import type {
  Profile,
  Game,
  GameFile,
  GameSave,
  SaveSlot,
  PlaySession,
  RecoverySave,
} from "./types";
import { analyzeJar } from "./importer";
import { safeUnzip, binaryBlob } from "./archive";
import { validateConfiguration } from "./config";
import { validateTouchControls } from "./touch";
import type { TouchControlsConfiguration } from "./types";
export class RetroDB extends Dexie {
  profiles!: EntityTable<Profile, "id">;
  games!: EntityTable<Game, "id">;
  files!: EntityTable<GameFile, "id">;
  saves!: EntityTable<GameSave, "id">;
  slots!: EntityTable<SaveSlot, "id">;
  sessions!: EntityTable<PlaySession, "id">;
  recoverySaves!: EntityTable<RecoverySave, "id">;
  constructor(name = "java-retro-v1") {
    super(name, { chromeTransactionDurability: "strict" });
    this.version(1).stores({
      profiles: "id,createdAt",
      games: "id,profileId,[profileId+hash],lastPlayed",
      files: "id",
      saves: "id,profileId,gameId",
      slots: "id,profileId,gameId",
      sessions: "id,profileId,gameId,startedAt",
    });
    this.version(2).stores({
      games: "id,profileId,[profileId+hash],lastPlayed,importedAt",
    });
    this.version(3).stores({
      recoverySaves: "id,profileId,gameId,[gameId+savedFrom]",
    });
  }
}
export const db = new RetroDB();
export async function saveTouchControls(
  gameId: string,
  touchControls: TouchControlsConfiguration,
  database = db,
) {
  validateTouchControls(touchControls);
  await database.transaction("rw", database.games, async () => {
    const game = await database.games.get(gameId);
    if (!game) throw Error("Гру не знайдено.");
    await database.games.update(gameId, {
      configuration: {
        ...game.configuration,
        touchControls: { ...touchControls },
      },
    });
  });
}
export async function createProfile(
  name: string,
  avatar = "👾",
  database = db,
) {
  name = name.trim();
  if (!name || name.length > 40)
    throw Error("Ім’я має містити від 1 до 40 символів.");
  const p: Profile = {
    id: crypto.randomUUID(),
    name,
    avatar,
    createdAt: Date.now(),
  };
  await database.profiles.add(p);
  return p;
}
export async function installGame(
  profileId: string,
  jar: Blob,
  filename: string,
  jad?: Blob,
  database = db,
) {
  if (!(await database.profiles.get(profileId)))
    throw Error("Профіль не знайдено.");
  const result = await analyzeJar(jar, filename, jad);
  const id = profileId + ":" + result.hash;
  const game: Game = {
    ...result,
    id,
    profileId,
    favorite: false,
    importedAt: Date.now(),
  };
  await database.transaction("rw", database.games, database.files, async () => {
    if (await database.games.get(id))
      throw Error("Ця гра вже є у вашій бібліотеці.");
    await database.games.add(game);
    await database.files.put({ id, jar, jad, filename });
  });
  return game;
}
export async function removeGame(
  profileId: string,
  gameId: string,
  removeSaves: boolean,
  database = db,
) {
  const game = await database.games.get(gameId);
  if (!game || game.profileId !== profileId)
    throw Error("Гру не знайдено у профілі.");
  await database.transaction(
    "rw",
    [
      database.games,
      database.files,
      database.saves,
      database.slots,
      database.sessions,
      database.recoverySaves,
    ],
    async () => {
      await database.games.delete(gameId);
      await database.files.delete(gameId);
      if (removeSaves) {
        await database.saves.delete(gameId);
        await database.slots.where({ profileId, gameId }).delete();
        await database.recoverySaves.where({ profileId, gameId }).delete();
      }
      await database.sessions.where({ profileId, gameId }).delete();
    },
  );
}
export function validateRms(data: Uint8Array) {
  const entries = safeUnzip(data, 32 * 1024 * 1024);
  if (
    Object.keys(entries).some(
      (p) => !p.startsWith("rms/") || p.split("/").length !== 2,
    )
  )
    throw Error("Архів має містити лише rms/ім’я.");
  return entries;
}
export async function putSave(
  profileId: string,
  gameId: string,
  data: Blob,
  database = db,
) {
  if (data.size > 32 * 1024 * 1024) throw Error("RMS-архів перевищує 32 МБ.");
  const game = await database.games.get(gameId);
  if (!game || game.profileId !== profileId)
    throw Error("Чужий профіль збереження.");
  const entries = validateRms(new Uint8Array(await data.arrayBuffer()));
  // ZIP timestamps change every snapshot. Compare actual RMS contents instead.
  const signature = await Promise.all(
    Object.keys(entries)
      .sort()
      .map(async (name) => [
        name,
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new Uint8Array(entries[name]).buffer,
            ),
          ),
          (n) => n.toString(16).padStart(2, "0"),
        ).join(""),
      ]),
  );
  const contentHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(signature)),
      ),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  try {
    return await database.transaction(
      "rw",
      database.games,
      database.saves,
      database.recoverySaves,
      async () => {
        const currentGame = await database.games.get(gameId);
        if (!currentGame || currentGame.profileId !== profileId)
          throw Error("Чужий профіль збереження.");
        const previous = await database.saves.get(gameId);
        if (previous?.contentHash === contentHash) return previous.updatedAt;
        const updatedAt = Math.max(Date.now(), (previous?.updatedAt || 0) + 1);
        if (previous)
          await database.recoverySaves.put({
            ...previous,
            id: crypto.randomUUID(),
            savedFrom: previous.updatedAt,
          });
        const older = await database.recoverySaves
          .where({ gameId })
          .sortBy("savedFrom");
        await database.recoverySaves.bulkDelete(
          older.slice(0, Math.max(0, older.length - 2)).map((s) => s.id),
        );
        await database.saves.put({
          id: gameId,
          profileId,
          gameId,
          data,
          updatedAt,
          format: 1,
          contentHash,
        });
        return updatedAt;
      },
    );
  } catch (e) {
    if (e instanceof Error && /quota/i.test(e.name))
      throw Error(
        "Не вдалося записати RMS: недостатньо місця на пристрої. Раніше підтверджені дані не змінено. Експортуйте профіль і звільніть місце.",
      );
    throw e;
  }
}
export async function restoreRecoverySave(
  profileId: string,
  recoveryId: string,
  database = db,
) {
  const save = await database.recoverySaves.get(recoveryId);
  if (!save || save.profileId !== profileId)
    throw Error("Автокопію не знайдено у профілі.");
  await putSave(profileId, save.gameId, save.data, database);
}
export async function createSlot(
  profileId: string,
  gameId: string,
  name: string,
  screenshot?: Blob,
  database = db,
) {
  return database.transaction(
    "rw",
    database.saves,
    database.slots,
    async () => {
      const save = await database.saves.get(gameId);
      if (!save || save.profileId !== profileId)
        throw Error("Спочатку запустіть гру та збережіть RMS.");
      if ((await database.slots.where({ profileId, gameId }).count()) >= 5)
        throw Error("Доступно максимум 5 слотів.");
      const slot: SaveSlot = {
        id: crypto.randomUUID(),
        profileId,
        gameId,
        name: name.trim().slice(0, 80) || "Резервна копія",
        data: save.data,
        screenshot,
        createdAt: Date.now(),
        format: 1,
      };
      await database.slots.add(slot);
      return slot;
    },
  );
}
export async function restoreSlot(
  profileId: string,
  slotId: string,
  database = db,
) {
  const slot = await database.slots.get(slotId);
  if (!slot || slot.profileId !== profileId) throw Error("Слот не знайдено.");
  await putSave(profileId, slot.gameId, slot.data, database);
}
export async function exportProfile(profileId: string, database = db) {
  // Read a consistent snapshot before Blob/ZIP work, which cannot keep an IDB
  // transaction alive. A concurrent import/delete must not produce a mixed ZIP.
  const { profile, games, files, saves, slots, sessions } =
    await database.transaction(
      "r",
      [
        database.profiles,
        database.games,
        database.files,
        database.saves,
        database.slots,
        database.sessions,
      ],
      async () => {
        const profile = await database.profiles.get(profileId),
          games = await database.games.where({ profileId }).toArray(),
          files = await database.files.bulkGet(games.map((g) => g.id)),
          saves = await database.saves.where({ profileId }).toArray(),
          slots = await database.slots.where({ profileId }).toArray(),
          sessions = await database.sessions.where({ profileId }).toArray();
        return { profile, games, files, saves, slots, sessions };
      },
    );
  if (!profile) throw Error("Профіль не знайдено.");
  const archive: Record<string, Uint8Array> = {};
  for (const [index, g] of games.entries()) {
    const f = files[index];
    if (!f) throw Error("Відсутній JAR.");
    archive[`games/${g.hash}.jar`] = new Uint8Array(await f.jar.arrayBuffer());
    if (f.jad)
      archive[`games/${g.hash}.jad`] = new Uint8Array(
        await f.jad.arrayBuffer(),
      );
  }
  for (const s of saves)
    archive[`saves/${s.gameId.split(":")[1]}.zip`] = new Uint8Array(
      await s.data.arrayBuffer(),
    );
  for (const s of slots) {
    archive[`slots/${s.id}.zip`] = new Uint8Array(await s.data.arrayBuffer());
    if (s.screenshot)
      archive[`slots/${s.id}.png`] = new Uint8Array(
        await s.screenshot.arrayBuffer(),
      );
  }
  archive["profile.json"] = strToU8(
    JSON.stringify({
      format: 1,
      profile,
      games: games.map(({ icon, ...g }) => g),
      saves: saves.map(({ data, ...s }) => s),
      slots: slots.map(({ data, screenshot, ...s }) => ({
        ...s,
        hasScreenshot: !!screenshot,
      })),
      sessions,
    }),
  );
  return binaryBlob(zipSync(archive, { level: 0 }));
}
export async function importProfile(blob: Blob, database = db) {
  if (blob.size > 256 * 1024 * 1024)
    throw Error("Архів профілю перевищує 256 МБ.");
  const entries = safeUnzip(
    new Uint8Array(await blob.arrayBuffer()),
    256 * 1024 * 1024,
  );
  if (
    !entries["profile.json"] ||
    entries["profile.json"].length > 4 * 1024 * 1024
  )
    throw Error("Немає коректного profile.json.");
  const m = JSON.parse(strFromU8(entries["profile.json"]));
  if (
    m.format !== 1 ||
    typeof m.profile?.name !== "string" ||
    !Array.isArray(m.games) ||
    !Array.isArray(m.saves) ||
    !Array.isArray(m.slots) ||
    !Array.isArray(m.sessions) ||
    m.games.length > 500
  )
    throw Error("Непідтримуваний формат профілю.");
  const p: Profile = {
    id: crypto.randomUUID(),
    name: m.profile.name.trim().slice(0, 40),
    avatar: ["👾", "🎮", "🚀", "🦊", "🤖", "💜"].includes(m.profile.avatar)
      ? m.profile.avatar
      : "👾",
    createdAt: Date.now(),
  };
  if (!p.name) throw Error("Некоректне ім’я.");
  const games: Game[] = [],
    files: GameFile[] = [],
    saves: GameSave[] = [],
    slots: SaveSlot[] = [],
    sessions: PlaySession[] = [];
  const ids = new Map<string, string>();
  const mapGameId = (oldId: unknown) => {
    if (
      typeof oldId !== "string" ||
      !oldId.startsWith(m.profile.id + ":") ||
      !/^[a-f0-9]{64}$/.test(oldId.split(":")[1])
    )
      throw Error("Некоректне посилання на гру.");
    const mapped = p.id + ":" + oldId.split(":")[1];
    ids.set(oldId, mapped);
    return mapped;
  };
  for (const g of m.games) {
    if (
      !/^[a-f0-9]{64}$/.test(g.hash) ||
      typeof g.id !== "string" ||
      ids.has(g.id)
    )
      throw Error("Некоректний ID гри.");
    const jarBytes = entries[`games/${g.hash}.jar`];
    if (!jarBytes) throw Error("Відсутній JAR.");
    const jar = binaryBlob(jarBytes, "application/java-archive"),
      jadBytes = entries[`games/${g.hash}.jad`],
      jad = jadBytes ? binaryBlob(jadBytes, "text/plain") : undefined;
    const a = await analyzeJar(jar, g.hash + ".jar", jad);
    if (a.hash !== g.hash) throw Error("SHA-256 не збігається.");
    validateConfiguration(g.configuration);
    if (!a.metadata.midlets.some((x) => x.className === g.configuration.midlet))
      throw Error("Невідомий MIDlet.");
    const id = mapGameId(g.id);
    if (id !== p.id + ":" + a.hash)
      throw Error("ID гри не відповідає SHA-256.");
    ids.set(g.id, id);
    games.push({
      ...a,
      id,
      profileId: p.id,
      configuration: g.configuration,
      favorite: !!g.favorite,
      importedAt: Date.now(),
      lastPlayed: typeof g.lastPlayed === "number" ? g.lastPlayed : undefined,
    });
    files.push({ id, jar, jad, filename: a.metadata.name + ".jar" });
  }
  for (const s of m.saves) {
    const gameId = mapGameId(s.gameId);
    const data = entries[`saves/${gameId.split(":")[1]}.zip`];
    if (!data) throw Error("Немає RMS.");
    validateRms(data);
    saves.push({
      id: gameId,
      gameId,
      profileId: p.id,
      data: binaryBlob(data),
      updatedAt: Date.now(),
      format: 1,
    });
  }
  for (const s of m.slots) {
    const gameId = mapGameId(s.gameId);
    if (typeof s.id !== "string" || !/^[a-zA-Z0-9-]+$/.test(s.id))
      throw Error("Некоректний слот.");
    const data = entries[`slots/${s.id}.zip`];
    if (!data) throw Error("Немає даних слота.");
    validateRms(data);
    if (slots.filter((x) => x.gameId === gameId).length >= 5)
      throw Error("Забагато слотів.");
    const image = entries[`slots/${s.id}.png`];
    slots.push({
      id: crypto.randomUUID(),
      profileId: p.id,
      gameId,
      name: String(s.name).slice(0, 80),
      createdAt: Number(s.createdAt) || Date.now(),
      format: 1,
      data: binaryBlob(data),
      screenshot: image ? binaryBlob(image, "image/png") : undefined,
    });
  }
  for (const s of m.sessions) {
    const gameId = ids.get(s.gameId);
    if (gameId && Number.isFinite(s.seconds) && s.seconds >= 0)
      sessions.push({
        id: crypto.randomUUID(),
        profileId: p.id,
        gameId,
        startedAt: Number(s.startedAt) || Date.now(),
        endedAt: Number(s.endedAt) || undefined,
        seconds: s.seconds,
      });
  }
  await database.transaction(
    "rw",
    [
      database.profiles,
      database.games,
      database.files,
      database.saves,
      database.slots,
      database.sessions,
    ],
    async () => {
      await database.profiles.add(p);
      await database.games.bulkAdd(games);
      await database.files.bulkAdd(files);
      await database.saves.bulkAdd(saves);
      await database.slots.bulkAdd(slots);
      await database.sessions.bulkAdd(sessions);
    },
  );
  return p;
}
