import { useState } from "react";
import { Download, RefreshCw, WifiOff, X, Check } from "lucide-react";
import { applyPwaUpdate, installPwa, usePwa } from "./client";

export function PwaControls() {
  const { prompt, installed, online, updateReady } = usePwa();
  const [hideInstall, setHideInstall] = useState(false),
    [hideUpdate, setHideUpdate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (
    online &&
    (!prompt || installed || hideInstall) &&
    (!updateReady || hideUpdate) &&
    !error
  )
    return null;
  return (
    <aside className="pwa-notice" aria-label="Встановлення та стан застосунку">
      {!online && (
        <div className="pwa-notice-row" role="status">
          <WifiOff size={18} />
          <p>
            <strong>Ви офлайн</strong>
            <span>
              Бібліотека доступна. Для нового запуску гри потрібен інтернет.
            </span>
          </p>
        </div>
      )}
      {updateReady && !hideUpdate ? (
        <div className="pwa-notice-row">
          <RefreshCw size={18} />
          <p>
            <strong>Доступне оновлення</strong>
            <span>Зупиніть гру перед перезапуском застосунку.</span>
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void action(applyPwaUpdate)}
          >
            Оновити
          </button>
          <button
            className="pwa-dismiss"
            aria-label="Оновити пізніше"
            onClick={() => setHideUpdate(true)}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        prompt &&
        !installed &&
        !hideInstall && (
          <div className="pwa-notice-row">
            <Download size={18} />
            <p>
              <strong>Java Retro як застосунок</strong>
              <span>Власна іконка та окреме вікно на вашому пристрої.</span>
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void action(installPwa)}
            >
              Встановити
            </button>
            <button
              className="pwa-dismiss"
              aria-label="Встановити пізніше"
              onClick={() => setHideInstall(true)}
            >
              <X size={16} />
            </button>
          </div>
        )
      )}
      {error && (
        <p className="pwa-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
export function PwaSettings() {
  const { installed, prompt, ready, updateReady, registration, error } =
    usePwa();
  const [message, setMessage] = useState("");
  const action = async (fn: () => Promise<unknown>) => {
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section>
      <h3>Встановлення застосунку</h3>
      <p className="muted">
        {installed
          ? "Java Retro встановлено на цьому пристрої."
          : "У Chrome або Edge виберіть «Встановити застосунок» у меню браузера. На iPhone / iPad: Safari → Поділитися → На початковий екран."}
      </p>
      <div className="button-row">
        {prompt && !installed && (
          <button className="secondary" onClick={() => void action(installPwa)}>
            <Download size={16} />
            Встановити Java Retro
          </button>
        )}
        {installed && (
          <span className="badge">
            <Check size={14} />
            Окреме вікно
          </span>
        )}
        {updateReady ? (
          <button
            className="secondary"
            onClick={() => void action(applyPwaUpdate)}
          >
            <RefreshCw size={16} />
            Оновити застосунок
          </button>
        ) : (
          registration && (
            <button
              className="secondary"
              onClick={() =>
                void action(async () => {
                  await registration.update();
                  setMessage(
                    "Перевірку виконано. Якщо є нова версія, після її завантаження з’явиться пропозиція оновлення.",
                  );
                })
              }
            >
              Перевірити оновлення
            </button>
          )
        )}
      </div>
      <p className="muted small">
        {ready
          ? "Оболонку збережено для офлайн-відкриття."
          : "Офлайн-оболонка підготовлюється у production-збірці після першого відкриття."}{" "}
        Ігри та RMS залишаються в IndexedDB. Запуск CheerpJ потребує інтернету.
      </p>
      {(error || message) && (
        <p className="hint" role="status">
          {error || message}
        </p>
      )}
    </section>
  );
}
