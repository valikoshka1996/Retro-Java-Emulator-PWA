import type {
  Action,
  EmulatorCapabilities,
  EmulatorConfiguration,
  Game,
} from "./types";
import { db, putSave, validateRms } from "./db";
import { validateConfiguration } from "./config";
import { binaryBlob } from "./archive";
export interface EmulatorAdapter {
  installGame(game: Game): Promise<void>;
  launchGame(container: HTMLElement): Promise<void>;
  stopGame(): Promise<void>;
  restartGame(): Promise<void>;
  sendKeyDown(action: Action, source?: string): void;
  sendKeyUp(action: Action, source?: string): void;
  getCapabilities(): EmulatorCapabilities;
  updateConfiguration(config: EmulatorConfiguration): Promise<void>;
  exportSaveData(): Promise<Blob>;
  importSaveData(data: Blob): Promise<void>;
  captureScreenshot(): Promise<Blob>;
}
export class FreeJ2MEAdapter implements EmulatorAdapter {
  private game?: Game;
  private frame?: HTMLIFrameElement;
  private container?: HTMLElement;
  private token = crypto.randomUUID();
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readyResolve?: () => void;
  private readyReject?: (e: Error) => void;
  private sessionId?: string;
  private startedAt = 0;
  private releaseLock?: () => void;
  private saveQueue = Promise.resolve();
  private stopping = false;
  constructor(
    private onStatus: (status: string) => void,
    private onError: (e: string) => void,
    private onExit: () => void,
  ) {}
  getCapabilities(): EmulatorCapabilities {
    return {
      rms: true,
      backupSlots: true,
      snapshots: false,
      pause: false,
      screenshot: true,
      m3g: true,
      mascotCapsule: "v3",
      webgl2: !!document.createElement("canvas").getContext("webgl2"),
      volume: false,
    };
  }
  async installGame(game: Game) {
    if (this.frame) throw Error("Спочатку зупиніть гру.");
    if (!(await db.files.get(game.id))) throw Error("Файл гри не знайдено.");
    this.game = game;
  }
  private send(method: string, payload?: unknown, id?: number) {
    this.frame?.contentWindow?.postMessage(
      { retro: true, token: this.token, id, method, payload },
      location.origin,
    );
  }
  private rpc<T>(method: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Рушій не відповів: " + method));
      }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      this.send(method, payload, id);
    });
  }
  private persist(data: ArrayBuffer) {
    const game = this.game!;
    this.saveQueue = this.saveQueue
      .catch(() => {})
      .then(() => putSave(game.profileId, game.id, new Blob([data])));
    return this.saveQueue;
  }
  private message = async (e: MessageEvent) => {
    if (
      e.origin !== location.origin ||
      e.source !== this.frame?.contentWindow ||
      !e.data?.retro ||
      e.data.token !== this.token
    )
      return;
    const { kind, payload } = e.data;
    try {
      if (kind === "stage" && typeof payload === "string")
        this.onStatus(payload);
      if (kind === "reply") {
        const p = this.pending.get(payload.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(payload.id);
          payload.error
            ? p.reject(Error(payload.error))
            : p.resolve(payload.result);
        }
      }
      if (kind === "booted") {
        this.onStatus("Підготовка JAR та RMS…");
        const g = this.game!,
          f = (await db.files.get(g.id))!,
          s = await db.saves.get(g.id);
        await this.rpc("install", {
          appId: "retro_" + g.profileId.replaceAll("-", "") + "_" + g.hash,
          jar: await f.jar.arrayBuffer(),
          rms: s ? await s.data.arrayBuffer() : null,
          configuration: g.configuration,
          properties: g.metadata.manifest,
        });
      }
      if (kind === "ready") {
        this.onStatus("Гра працює");
        this.readyResolve?.();
      }
      if (kind === "error") {
        this.readyReject?.(Error(payload));
        this.onError(payload);
      }
      if (kind === "rms") await this.persist(payload);
      if (kind === "exited") {
        await this.saveQueue;
        await this.finish();
        this.onExit();
      }
      if (kind === "restart") await this.restartGame();
    } catch (err) {
      const msg = String(err);
      this.onError(msg);
      this.readyReject?.(Error(msg));
    }
  };
  async launchGame(container: HTMLElement) {
    if (!this.game || this.frame) throw Error("Некоректний стан запуску.");
    if (!navigator.onLine)
      throw Error(
        "Для запуску гри потрібен інтернет: CheerpJ завантажується з CDN. Бібліотека та збереження залишаються на пристрої.",
      );
    if (!navigator.locks)
      throw Error(
        "Браузер має підтримувати Web Locks. Відкрийте localhost або HTTPS.",
      );
    await new Promise<void>((resolve, reject) => {
      navigator.locks
        .request("java-retro-engine", { ifAvailable: true }, async (lock) => {
          if (!lock) {
            reject(Error("Емулятор уже запущений в іншій вкладці."));
            return;
          }
          await new Promise<void>((release) => {
            this.releaseLock = release;
            resolve();
          });
        })
        .catch(reject);
    });
    this.container = container;
    this.stopping = false;
    this.token = crypto.randomUUID();
    window.addEventListener("message", this.message);
    window.addEventListener("beforeunload", this.beforeUnload);
    this.frame = document.createElement("iframe");
    this.frame.title = this.game.metadata.name;
    this.frame.allow = "autoplay; fullscreen";
    this.frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-pointer-lock",
    );
    this.onStatus("Завантаження CheerpJ з CDN…");
    // Install the startup handlers before the iframe can report an early error.
    const startup = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            Error(
              "Запуск перевищив 180 секунд. Перевірте з’єднання або доступ до CheerpJ CDN.",
            ),
          ),
        180000,
      );
      this.readyResolve = () => {
        clearTimeout(timer);
        resolve();
      };
      this.readyReject = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    });
    // A fast resource error may arrive while the IndexedDB session is being written.
    void startup.catch(() => {});
    this.frame.src = "/engine/player.html?token=" + this.token;
    container.replaceChildren(this.frame);
    this.startedAt = Date.now();
    this.sessionId = crypto.randomUUID();
    try {
      await db.sessions.add({
        id: this.sessionId,
        profileId: this.game.profileId,
        gameId: this.game.id,
        startedAt: this.startedAt,
        seconds: 0,
      });
      await db.games.update(this.game.id, { lastPlayed: this.startedAt });
      await startup;
    } catch (e) {
      await this.finish();
      throw e;
    }
  }
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.frame) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  private async finish() {
    this.readyReject?.(Error("Сесію завершено."));
    this.readyReject = undefined;
    this.readyResolve = undefined;
    this.frame?.remove();
    this.frame = undefined;
    window.removeEventListener("message", this.message);
    window.removeEventListener("beforeunload", this.beforeUnload);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Сесію завершено."));
    }
    this.pending.clear();
    this.releaseLock?.();
    this.releaseLock = undefined;
    if (this.sessionId) {
      await db.sessions.update(this.sessionId, {
        endedAt: Date.now(),
        seconds: Math.floor((Date.now() - this.startedAt) / 1000),
      });
      this.sessionId = undefined;
    }
    this.onStatus("Зупинено");
  }
  async stopGame() {
    if (!this.frame) return;
    this.stopping = true;
    try {
      const rms = await this.rpc<ArrayBuffer>("stop");
      await this.persist(rms);
      await this.saveQueue;
      await this.finish();
    } catch (e) {
      this.stopping = false;
      throw e;
    }
  }
  async restartGame() {
    const container = this.container!;
    await this.stopGame();
    await this.launchGame(container);
  }
  sendKeyDown(action: Action, source: string = action) {
    if (!this.stopping) this.send("key", { action, down: true, source });
  }
  sendKeyUp(action: Action, source: string = action) {
    this.send("key", { action, down: false, source });
  }
  releaseKeys() {
    this.send("release");
  }
  async updateConfiguration(configuration: EmulatorConfiguration) {
    if (this.frame) throw Error("Зупиніть гру для зміни конфігурації.");
    validateConfiguration(configuration);
    this.game = { ...this.game!, configuration };
    await db.games.update(this.game.id, { configuration });
  }
  async exportSaveData() {
    if (this.frame) {
      const data = await this.rpc<ArrayBuffer>("snapshot");
      await this.persist(data);
    }
    const save = await db.saves.get(this.game!.id);
    if (!save) throw Error("RMS ще не створено.");
    return save.data;
  }
  async importSaveData(data: Blob) {
    if (this.frame) throw Error("Зупиніть гру перед відновленням RMS.");
    validateRms(new Uint8Array(await data.arrayBuffer()));
    await putSave(this.game!.profileId, this.game!.id, data);
  }
  async captureScreenshot() {
    if (!this.frame) throw Error("Гра не запущена.");
    return this.rpc<Blob>("screenshot");
  }
  // Explicit emergency action for a hung VM; confirmed RMS in IndexedDB is retained.
  async forceStop() {
    await this.saveQueue.catch(() => {});
    await this.finish();
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const emptyRms = () =>
  binaryBlob(new Uint8Array([80, 75, 5, 6, ...Array(18).fill(0)]));
