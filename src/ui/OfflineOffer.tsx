import { useState } from "react";
import { Download, X } from "lucide-react";
import { prepareOffline, useOffline } from "../offline";

export function OfflineOffer() {
  const state = useOffline(),
    [dismissed, setDismissed] = useState(() => {
      try {
        return localStorage.getItem("retro-offline-offer") || "";
      } catch {
        return "";
      }
    }),
    [error, setError] = useState("");
  const version = state.manifest?.version;
  if (
    !version ||
    state.phase === "ready" ||
    state.phase === "checking" ||
    dismissed === version
  )
    return null;
  const busy = state.phase === "busy";
  return (
    <section
      className="offline-offer"
      aria-label="Підготовка до гри без інтернету"
    >
      <div>
        <strong>
          {busy
            ? "Готуємо ігри без інтернету…"
            : "Грати будь-де, навіть без інтернету"}
        </strong>
        <p>
          {busy
            ? `${state.done}/${state.total} файлів · ${Math.round(state.bytes / 1024 / 1024)} МБ`
            : `Підготуйте Java-рушій на цьому пристрої: приблизно ${Math.ceil(state.totalBytes / 1024 / 1024)} МБ. Ігри встановлюються окремо.`}
        </p>
        {busy && (
          <progress
            aria-label="Завантаження офлайн-рушія"
            value={state.done}
            max={state.total || 1}
          />
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <button
        className="primary"
        disabled={busy}
        onClick={() => {
          setError("");
          void prepareOffline().catch((e) => setError((e as Error).message));
        }}
      >
        <Download size={17} />
        {busy ? "Завантаження…" : "Підготувати офлайн"}
      </button>
      <button
        className="icon-button"
        aria-label="Нагадати про офлайн пізніше"
        onClick={() => {
          setDismissed(version);
          try {
            localStorage.setItem("retro-offline-offer", version);
          } catch {
            /* Session-only dismissal still works. */
          }
        }}
      >
        <X size={18} />
      </button>
    </section>
  );
}
