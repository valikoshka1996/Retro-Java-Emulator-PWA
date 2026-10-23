import { describe, test, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error Server entry is JavaScript; Vitest bundles its shared TS importer.
import { startRepository } from "../server/main.mjs";

describe("private game repository", () => {
  test("admin auth, drafts, immutable JAR, edits, duplicates, persistence and delete", async () => {
    const directory = await mkdtemp(join(tmpdir(), "retro-store-"));
    let server = await startRepository({
      directory,
      port: 0,
      host: "127.0.0.1",
    });
    const base = () =>
      `http://127.0.0.1:${server.address().port}/api/repository`;
    const request = (path: string, options: RequestInit = {}) =>
      fetch(base() + path, options);
    try {
      const credentials = await readFile(
        join(directory, "admin-credentials.txt"),
        "utf8",
      );
      const password = credentials.split("\n")[1];
      expect(password.length).toBeGreaterThanOrEqual(16);
      const bytes = await readFile("public/fixtures/rms-probe.jar");
      expect(
        (
          await request("/games?filename=probe.jar", {
            method: "POST",
            body: bytes,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request("/session", {
            method: "POST",
            headers: { Origin: "https://evil.example" },
            body: JSON.stringify({ password }),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request("/session", {
            method: "POST",
            body: JSON.stringify({ password: "wrong" }),
          })
        ).status,
      ).toBe(401);
      const login = await request("/session", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0],
        headers = { Cookie: cookie };
      expect(login.headers.get("set-cookie")).toContain("HttpOnly");
      const upload = await request("/games?filename=probe-176x220.jar", {
        method: "POST",
        headers,
        body: bytes,
      });
      expect(upload.status).toBe(201);
      const { game } = await upload.json();
      expect(game.title).toBe("RMS Probe");
      expect(game.screen).toEqual([176, 220]);
      expect((await (await request("/games")).json()).games).toEqual([]);
      expect((await request(`/games/${game.id}/jar`)).status).toBe(404);
      const duplicate = await (
        await request("/games?filename=renamed.jar", {
          method: "POST",
          headers,
          body: bytes,
        })
      ).json();
      expect(duplicate.duplicate).toBe(true);
      const edit = await request("/games/" + game.id, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          title: "Моя гра",
          genre: "Аркади",
          description: "Тест",
          tags: ["retro"],
          screen: [240, 320],
          published: true,
          filename: "../../bad.jar",
          id: "bad",
        }),
      });
      expect(edit.status).toBe(200);
      const publicList = await (await request("/games")).json();
      expect(publicList.games).toHaveLength(1);
      expect(publicList.games[0].title).toBe("Моя гра");
      expect(publicList.games[0].filename).toBe("probe-176x220.jar");
      const downloaded = await (
        await request(`/games/${game.id}/jar`)
      ).arrayBuffer();
      expect(Buffer.from(downloaded)).toEqual(bytes);
      expect(
        (
          await request("/games/" + game.id, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ screen: [1, 1] }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request("/games?filename=bad.jar", {
            method: "POST",
            headers,
            body: "invalid",
          })
        ).status,
      ).toBe(400);
      await new Promise<void>((done) => server.close(done));
      server = await startRepository({ directory, port: 0, host: "127.0.0.1" });
      expect((await (await request("/games")).json()).games[0].title).toBe(
        "Моя гра",
      );
      expect(
        (await request("/games/" + game.id, { method: "DELETE", headers }))
          .status,
      ).toBe(401);
      const again = await request("/session", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      const nextCookie = again.headers.get("set-cookie")!.split(";")[0];
      expect(
        (
          await request("/games/" + game.id, {
            method: "DELETE",
            headers: { Cookie: nextCookie },
          })
        ).status,
      ).toBe(200);
      expect((await (await request("/games")).json()).games).toEqual([]);
      expect((await request(`/games/${game.id}/jar`)).status).toBe(404);
    } finally {
      await new Promise<void>((done) => server.close(done));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
