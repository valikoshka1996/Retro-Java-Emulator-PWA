import { codeMap } from "./src/key.js";
const token = new URLSearchParams(location.search).get("token");
function emit(kind, payload) {
  parent.postMessage({ retro: true, token, kind, payload }, location.origin);
}
let resolveInstall;
const installed = new Promise((r) => (resolveInstall = r));
let helper,
  display,
  queue,
  config,
  ready = false,
  stopping = false;
const held = new Map();
const repeats = new Map();
const actionCodes = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  fire: "Enter",
  softLeft: "F1",
  softRight: "F2",
  star: "KeyE",
  hash: "KeyR",
  ...Object.fromEntries(Array.from({ length: 10 }, (_, n) => [n, "Digit" + n])),
};
function dispatch(action, down) {
  const code = actionCodes[action];
  queue.queueEvent({
    kind: down ? "keydown" : "keyup",
    args: [
      codeMap[code],
      /^\d$/.test(action) ? action.charCodeAt(0) : 0,
      false,
      false,
    ],
  });
}
function key(action, down, source = action) {
  if (!ready) return;
  if (!actionCodes[action]) return;
  if (down) {
    if (held.has(source)) return;
    const already = [...held.values()].includes(action);
    held.set(source, action);
    if (already) return;
    repeats.set(
      action,
      setTimeout(() => {
        dispatch(action, true);
        repeats.set(
          action,
          setInterval(() => dispatch(action, true), 60),
        );
      }, 500),
    );
  } else {
    if (!held.has(source)) return;
    held.delete(source);
    if ([...held.values()].includes(action)) return;
    clearTimeout(repeats.get(action));
    clearInterval(repeats.get(action));
    repeats.delete(action);
  }
  dispatch(action, down);
}
function release() {
  for (const [source, action] of [...held]) key(action, false, source);
}
let snapshots = Promise.resolve();
function snapshot() {
  const result = snapshots.then(async () => {
    const bytes = await helper.exportRms(bridge.appId);
    return new Uint8Array(bytes).buffer;
  });
  snapshots = result.catch(() => {});
  return result;
}
export const bridge = {
  appId: "",
  integerScale: true,
  stage(message) {
    document.getElementById("loading").textContent = message;
    emit("stage", message);
  },
  attach(canvas, q) {
    display = canvas;
    queue = q;
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) release();
    });
  },
  keyboard(e) {
    e.preventDefault();
    if (!config) return true;
    const action = Object.keys(config.keys).find(
      (a) => config.keys[a] === e.code,
    );
    if (action) key(action, e.type === "keydown", "keyboard:" + e.code);
    return true;
  },
  async prepare(lib) {
    emit("booted");
    const data = await installed;
    config = data.configuration;
    this.integerScale = config.integerScale;
    this.appId = data.appId;
    helper = await lib.retro.RetroBridge;
    const settings = {
      width: config.width,
      height: config.height,
      phone: config.phone,
      sound: config.sound ? "on" : "off",
      fps: config.fps,
      main: config.midlet,
      forceFullscreen: config.forceFullscreen ? "on" : "off",
      queuedPaint: config.queuedPaint ? "on" : "off",
      textureDisableFilter: config.textureDisableFilter ? "on" : "off",
    };
    const text = (o) =>
      Object.entries(o)
        .map(([k, v]) => k + ":" + String(v).replace(/[\r\n]/g, " ") + "\n")
        .join("");
    await helper.prepare(
      this.appId,
      new Int8Array(data.jar),
      text(settings),
      text(data.properties),
      data.rms ? new Int8Array(data.rms) : new Int8Array(),
    );
    window.libmidi.context.resume().catch(() => {});
    return this.appId;
  },
  ready() {
    if (ready) return;
    ready = true;
    emit("ready");
    setInterval(() => {
      if (ready)
        snapshot()
          .then((data) => emit("rms", data))
          .catch((e) => emit("error", String(e)));
    }, 3000);
  },
  error(e) {
    let message = "Помилка Java runtime. Перевірте консоль браузера.";
    try {
      message = typeof e === "string" ? e : String(e?.message || e);
    } catch {
      /* Some CheerpJ Java exception proxies cannot be converted to a string. */
    }
    document.getElementById("loading").hidden = false;
    document.getElementById("loading").textContent = message;
    emit("error", message);
  },
  async exit() {
    if (stopping) return;
    ready = false;
    try {
      emit("rms", await snapshot());
      emit("exited");
    } catch (e) {
      emit("error", String(e));
    }
  },
  restart() {
    emit("restart");
  },
};
window.addEventListener("message", async (e) => {
  if (
    e.source !== parent ||
    e.origin !== location.origin ||
    !e.data?.retro ||
    e.data.token !== token
  )
    return;
  const { id, method, payload } = e.data;
  try {
    let result;
    if (method === "install") {
      resolveInstall(payload);
      result = true;
    } else if (method === "key") {
      key(payload.action, payload.down, payload.source);
      return;
    } else if (method === "release") {
      release();
      return;
    } else if (method === "snapshot") {
      result = await snapshot();
    } else if (method === "stop") {
      release();
      stopping = true;
      ready = false;
      await helper.destroy();
      result = await snapshot();
    } else if (method === "screenshot") {
      result = await new Promise((resolve, reject) =>
        display.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PNG capture failed"))),
          "image/png",
        ),
      );
    } else throw Error("Unsupported bridge method");
    emit("reply", { id, result });
  } catch (e) {
    emit("reply", { id, error: String(e) });
  }
});
