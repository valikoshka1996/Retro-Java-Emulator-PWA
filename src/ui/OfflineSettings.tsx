import { useEffect, useState } from "react";
import {
  useOffline,
  refreshOffline,
  prepareOffline,
  exportOfflinePackage,
  importOfflinePackage,
  canChooseOfflineDirectory,
  exportOfflineToDirectory,
} from "../offline";
import { download } from "../emulator";

export function OfflineSettings() {
  const state = useOffline(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void refreshOffline();
  }, []);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="offline-settings">
      <h3>Ігри без інтернету</h3>
      <p className="muted">
        Завантажте Java-рушій на цей пристрій один раз: приблизно{" "}
        {Math.ceil(state.totalBytes / 1024 / 1024) || 70} МБ. Профілі та ігри
        зберігаються окремо. Після підготовки перевірте запуск потрібних ігор в
        авіарежимі.
      </p>
      <p className="hint" role="status">
        {state.phase === "ready"
          ? "Офлайн-пакет збережено та перевірено. Можна запускати ігри без мережі."
          : state.phase === "busy"
            ? `Завантаження: ${state.done}/${state.total} файлів · ${Math.round(state.bytes / 1024 / 1024)}/${Math.ceil(state.totalBytes / 1024 / 1024)} МБ`
            : state.phase === "checking"
              ? "Перевіряємо локальний пакет…"
              : "Офлайн-пакет ще не підготовлено для цієї версії рушія."}
      </p>
      {state.phase === "busy" && (
        <progress
          max={state.total || 1}
          value={state.done}
          aria-label="Підготовка офлайн-пакета"
        />
      )}
      <div className="button-row">
        <button
          className="secondary"
          disabled={busy || state.phase === "busy"}
          onClick={() => void action(prepareOffline)}
        >
          Підготувати офлайн-пакет
        </button>
        <button
          className="secondary"
          disabled={busy || state.phase !== "ready"}
          onClick={() =>
            void action(async () =>
              download(await exportOfflinePackage(), "java-retro-offline.zip"),
            )
          }
        >
          Експорт офлайн-пакета
        </button>
        {canChooseOfflineDirectory() && (
          <button
            className="secondary"
            disabled={busy || state.phase !== "ready"}
            onClick={() =>
              void action(async () =>
                setMessage(
                  "Пакет записано у папку «" +
                    (await exportOfflineToDirectory()) +
                    "».",
                ),
              )
            }
          >
            Зберегти пакет у папку
          </button>
        )}
        <label className={"secondary file-label " + (busy ? "disabled" : "")}>
          Імпорт офлайн-пакета
          <input
            type="file"
            accept=".zip"
            aria-label="Імпорт офлайн-пакета"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void action(() => importOfflinePackage(file));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="muted small">
        На iPhone: експортуйте ZIP та збережіть у «Файлах». Браузер не дозволяє
        вибрати папку для постійної роботи рушія; робоча копія залишається у
        сховищі PWA. Імпорт ZIP відновлює пакет без CDN. Після зміни версії
        рушія потрібен відповідний пакет.
      </p>
      {(message || state.error) && (
        <p className="hint" role="alert">
          {message || state.error}
        </p>
      )}
    </section>
  );
}
