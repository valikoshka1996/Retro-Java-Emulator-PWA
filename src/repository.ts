import { db, installGame } from "./db";
import type { GameCompatibility, GameMetadata } from "./types";
export interface RepositoryGame {
  id: string;
  filename: string;
  size: number;
  title: string;
  genre: string;
  description: string;
  tags: string[];
  published: boolean;
  featured: boolean;
  createdAt: number;
  updatedAt: number;
  metadata: GameMetadata;
  compatibility: GameCompatibility;
  hasIcon: boolean;
  screen: [number, number];
}
export const repositoryUrl = "/api/repository";
export async function repositoryRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(repositoryUrl + path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal || AbortSignal.timeout(120000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw Error(data?.error || `Сховище недоступне (HTTP ${response.status}).`);
  if (!data) throw Error("Сервер повернув некоректну відповідь.");
  return data as T;
}
export async function installRepositoryGame(
  profileId: string,
  entry: RepositoryGame,
) {
  const existing = await db.games.get(profileId + ":" + entry.id);
  if (existing) return existing;
  const response = await fetch(`${repositoryUrl}/games/${entry.id}/jar`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw Error("Не вдалося завантажити гру. Перевірте з’єднання.");
  const blob = await response.blob();
  if (blob.size !== entry.size || blob.size > 32 * 1024 * 1024)
    throw Error("Розмір завантаженої гри не збігається.");
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== entry.id)
    throw Error("Контрольна сума JAR не збігається. Інсталяцію скасовано.");
  const game = await installGame(profileId, blob, entry.filename);
  await db.games.update(game.id, {
    metadata: { ...game.metadata, name: entry.title },
    configuration: {
      ...game.configuration,
      width: entry.screen[0],
      height: entry.screen[1],
    },
  });
  return (await db.games.get(game.id))!;
}
