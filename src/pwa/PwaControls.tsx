import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff, X, Check, Share } from "lucide-react";
import {
  applyPwaUpdate,
  installPwa,
  usePwa,
  isAppleMobile,
  dismissInstallOffer,
  rememberInstalled,
} from "./client";
import { useOffline } from "../offline";

function AppleInstallSteps() {
  return (
    <div className="pwa-install-steps">
      <ol>
        <li>
          У Safari натисніть <Share size={16} aria-hidden="true" />{" "}
          <strong>«Поділитися»</strong> (або відкрийте її через меню сторінки).
        </li>
        <li>
          Виберіть <strong>«На початковий екран»</strong>. Якщо пункту немає,
          знайдіть його в «Редагувати дії».
        </li>
        <li>
          Якщо є перемикач <strong>«Відкривати як вебзастосунок»</strong>,
          увімкніть його та натисніть <strong>«Додати»</strong>.
        </li>
      </ol>
      <p>
        Потім відкривайте Java Retro з іконки. Для гри без інтернету окремо
        підготуйте офлайн-пакет у налаштуваннях.
      </p>
    </div>
  );
}
export function PwaControls() {
  const {
    prompt,
    installed,
    online,
    updateReady,
    knownInstalled,
    installDismissedUntil,
  } = usePwa();
  const offline = useOffline();
  const [appleReady, setAppleReady] = useState(false),
    [showSteps, setShowSteps] = useState(false),
    [hideUpdate, setHideUpdate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!isAppleMobile()) return;
    const timer = setTimeout(() => setAppleReady(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  const offerInstall =
    !installed &&
    installDismissedUntil <= Date.now() &&
    (!!prompt || (appleReady && !knownInstalled));
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
  if (online && !offerInstall && (!updateReady || hideUpdate) && !error)
    return null;
  return (
    <aside className="pwa-notice" aria-label="Встановлення та стан застосунку">
      {!online && (
        <div className="pwa-notice-row" role="status">
          <WifiOff size={18} />
          <p>
            <strong>Ви офлайн</strong>
            <span>
              {offline.phase === "ready"
                ? "Локальний рушій підготовлено. Ігри та збереження доступні."
                : "Бібліотека доступна. Для запуску гри спочатку підготуйте офлайн-пакет у налаштуваннях."}
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
        offerInstall && (
          <div className="pwa-install-offer">
            <div className="pwa-notice-row">
              <Download size={18} />
              <p>
                <strong>Java Retro як застосунок</strong>
                <span>Власна іконка та окреме вікно на вашому пристрої.</span>
              </p>
              <button
                className="primary"
                disabled={busy}
                aria-expanded={!prompt ? showSteps : undefined}
                aria-controls={!prompt ? "pwa-apple-install-steps" : undefined}
                onClick={() =>
                  prompt ? void action(installPwa) : setShowSteps(!showSteps)
                }
              >
                {prompt ? "Встановити" : "Як встановити"}
              </button>
              <button
                className="pwa-dismiss"
                aria-label="Встановити пізніше"
                onClick={dismissInstallOffer}
              >
                <X size={16} />
              </button>
            </div>
            {!prompt && showSteps && (
              <div id="pwa-apple-install-steps">
                <AppleInstallSteps />
                <button
                  className="secondary pwa-already-installed"
                  onClick={rememberInstalled}
                >
                  Уже встановлено
                </button>
              </div>
            )}
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
          ? "Java Retro запущено як встановлений застосунок."
          : "У Chrome або Edge виберіть «Встановити застосунок» у меню браузера. На iPhone / iPad: Safari → Поділитися → На початковий екран."}
      </p>
      {!installed && isAppleMobile() && <AppleInstallSteps />}
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
        Ігри та RMS залишаються в IndexedDB. Для запуску без мережі підготуйте
        офлайн-пакет нижче.
      </p>
      {(error || message) && (
        <p className="hint" role="status">
          {error || message}
        </p>
      )}
    </section>
  );
}
