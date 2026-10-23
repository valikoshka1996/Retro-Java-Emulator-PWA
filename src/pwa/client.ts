import { create } from "zustand";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface PwaState {
  installed: boolean;
  knownInstalled: boolean;
  installDismissedUntil: number;
  online: boolean;
  ready: boolean;
  updateReady: boolean;
  prompt?: InstallPrompt;
  registration?: ServiceWorkerRegistration;
  error: string;
}
const standalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: window-controls-overlay)").matches ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone;
const installKey = "retro-pwa-install";
function readInstallPreference(): { knownInstalled?: boolean; until?: number } {
  try {
    return JSON.parse(localStorage.getItem(installKey) || "{}") || {};
  } catch {
    return {};
  }
}
function saveInstallPreference(knownInstalled: boolean, until: number) {
  usePwa.setState({ knownInstalled, installDismissedUntil: until });
  try {
    localStorage.setItem(installKey, JSON.stringify({ knownInstalled, until }));
  } catch {
    // The current session still remembers the choice when storage is blocked.
  }
}
export const isAppleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export function dismissInstallOffer() {
  saveInstallPreference(
    usePwa.getState().knownInstalled,
    Date.now() + 7 * 86400000,
  );
}
export function rememberInstalled() {
  saveInstallPreference(true, 0);
}
export const usePwa = create<PwaState>(() => ({
  installed: standalone(),
  knownInstalled: !!readInstallPreference().knownInstalled,
  installDismissedUntil: Number(readInstallPreference().until) || 0,
  online: navigator.onLine,
  ready: false,
  updateReady: false,
  error: "",
}));
let started = false;
export function startPwa() {
  if (started) return;
  started = true;
  if (standalone()) rememberInstalled();
  window.addEventListener("online", () => usePwa.setState({ online: true }));
  window.addEventListener("offline", () => usePwa.setState({ online: false }));
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    usePwa.setState({ prompt: event as InstallPrompt });
  });
  window.addEventListener("appinstalled", () => {
    rememberInstalled();
    usePwa.setState({ installed: true, prompt: undefined });
  });
  for (const mode of ["standalone", "window-controls-overlay"]) {
    matchMedia(`(display-mode: ${mode})`).addEventListener("change", () => {
      if (standalone()) {
        rememberInstalled();
        usePwa.setState({ installed: true, prompt: undefined });
      }
    });
  }
  // Development remains uncached. Test and install the production build.
  if (
    !import.meta.env.PROD ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  )
    return;
  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      usePwa.setState({ registration, updateReady: !!registration.waiting });
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            usePwa.setState({ updateReady: !!registration.waiting });
        });
      });
      void navigator.serviceWorker.ready.then(() =>
        usePwa.setState({ ready: true }),
      );
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && navigator.onLine)
          void registration.update().catch(() => {});
      });
    })
    .catch(() =>
      usePwa.setState({
        error:
          "Не вдалося підготувати офлайн-оболонку. Перевірте з’єднання й повторно відкрийте застосунок.",
      }),
    );
}
export async function installPwa() {
  const prompt = usePwa.getState().prompt;
  if (!prompt) return;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "dismissed") dismissInstallOffer();
  } finally {
    usePwa.setState({ prompt: undefined });
  }
}
export async function applyPwaUpdate() {
  const waiting = usePwa.getState().registration?.waiting;
  if (!waiting) return;
  if (!navigator.locks)
    throw Error(
      "Закрийте ігрові вкладки та повторно відкрийте застосунок для оновлення.",
    );
  await navigator.locks.request(
    "java-retro-engine",
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw Error(
          "Спочатку зупиніть гру, також перевірте інші вкладки. Збереження не буде перервано.",
        );
      await new Promise<void>((resolve, reject) => {
        const changed = () => {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            changed,
          );
          location.reload();
          resolve();
        };
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            changed,
          );
          reject(Error("Оновлення ще не активувалося. Спробуйте повторно."));
        }, 15000);
        navigator.serviceWorker.addEventListener("controllerchange", changed);
        waiting.postMessage({ type: "ACTIVATE_UPDATE" });
      });
    },
  );
}
