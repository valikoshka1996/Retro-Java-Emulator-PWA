import { create } from "zustand";

type Persistence =
  "checking" | "persistent" | "best-effort" | "unsupported" | "unavailable";
export interface StorageHealth {
  persistence: Persistence;
  usage?: number;
  quota?: number;
  message: string;
}
export const useStorageHealth = create<StorageHealth>(() => ({
  persistence: "checking",
  message: "",
}));

export async function refreshStorageHealth() {
  const manager = navigator.storage;
  if (!manager) {
    useStorageHealth.setState({
      persistence: "unsupported",
      message: "Браузер не підтримує перевірку постійного сховища.",
    });
    return;
  }
  const [persistence, estimate] = await Promise.allSettled([
    typeof manager.persisted === "function"
      ? manager.persisted()
      : Promise.resolve(undefined),
    typeof manager.estimate === "function"
      ? manager.estimate()
      : Promise.resolve({} as StorageEstimate),
  ]);
  useStorageHealth.setState({
    persistence:
      persistence.status === "rejected"
        ? "unavailable"
        : persistence.value === undefined
          ? "unsupported"
          : persistence.value
            ? "persistent"
            : "best-effort",
    ...(estimate.status === "fulfilled"
      ? { usage: estimate.value.usage, quota: estimate.value.quota }
      : {}),
    message:
      persistence.status === "rejected"
        ? "Не вдалося перевірити стан сховища. Зробіть зовнішню копію профілю."
        : "",
  });
}

let requesting: Promise<void> | undefined;
export function requestDurableStorage() {
  if (requesting) return requesting;
  requesting = (async () => {
    try {
      const manager = navigator.storage;
      if (typeof manager?.persist === "function") {
        if (!(await manager.persisted?.())) await manager.persist();
      }
      await refreshStorageHealth();
    } catch {
      useStorageHealth.setState({
        persistence: "unavailable",
        message:
          "Запит постійного сховища не завершився. Профіль працює; збережіть окремий ZIP-файл.",
      });
    }
  })().finally(() => {
    requesting = undefined;
  });
  return requesting;
}

export function startStorageHealth() {
  void refreshStorageHealth();
  // Home Screen launch is a persistence heuristic in WebKit. Ask once per launch,
  // with manual retry available in settings; a refusal never blocks the app.
  if (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
  )
    void requestDurableStorage();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refreshStorageHealth();
  });
}
