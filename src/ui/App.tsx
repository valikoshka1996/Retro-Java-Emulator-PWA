import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Gamepad2,
  Library,
  Heart,
  Users,
  Settings,
  Plus,
  Upload,
  ArrowUpRight,
  Search,
  Play,
  ChevronLeft,
  Download,
  HardDrive,
  ShieldCheck,
  Monitor,
  Trash2,
  Star,
  SlidersHorizontal,
  X,
  Check,
  ArrowRight,
  Keyboard,
  RotateCcw,
  Square,
  Maximize,
  Camera,
  Store,
  AlertCircle,
} from "lucide-react";
import {
  db,
  createProfile,
  installGame,
  removeGame,
  exportProfile,
  importProfile,
  createSlot,
  restoreSlot,
  putSave,
  restoreRecoverySave,
} from "../db";
import { useApp } from "../store";
import { FreeJ2MEAdapter, download, type SaveFeedback } from "../emulator";
import {
  actions,
  labels,
  keyboardPreset,
  validateConfiguration,
} from "../config";
import { t } from "../i18n";
import type {
  Game,
  EmulatorConfiguration,
  Action,
  Profile,
  InputMode,
  DisplayRotation,
  DisplayGeometry,
} from "../types";
import { PhoneKeypad, TouchControlsEditor } from "./PhoneKeypad";
import { normalizeTouchControls } from "../touch";
import { useGameFullscreen } from "./useGameFullscreen";
import { PwaSettings } from "../pwa/PwaControls";
import { requestDurableStorage, useStorageHealth } from "../storage";
import { OfflineSettings } from "./OfflineSettings";
import { RepositoryStore } from "./RepositoryStore";
import { OfflineOffer } from "./OfflineOffer";
import { hasWebGL2 } from "../capabilities";
const date = (n?: number) =>
  n ? new Date(n).toLocaleDateString("uk-UA") : "Ще не запускали";
const avatars = ["👾", "🎮", "🚀", "🦊", "🤖", "💜"];
function BlobImage({
  blob,
  ...props
}: {
  blob?: Blob;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? (
    <img src={url} {...props} />
  ) : (
    <Gamepad2 aria-hidden="true" className={props.className} />
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрити" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function App() {
  const { profileId, setProfile, error, setError } = useApp();
  const profiles = useLiveQuery(() => db.profiles.toArray(), []);
  const profile = profiles?.find((p) => p.id === profileId);
  const games =
    useLiveQuery(
      () => (profileId ? db.games.where({ profileId }).toArray() : []),
      [profileId],
    ) || [];
  const sessions =
    useLiveQuery(
      () => (profileId ? db.sessions.where({ profileId }).toArray() : []),
      [profileId],
    ) || [];
  const [page, setPage] = useState("library"),
    [selected, setSelected] = useState<string | null>(null),
    [playing, setPlaying] = useState(false),
    [modal, setModal] = useState<"profile" | "import" | "global" | null>(null);
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const selectedGame = games.find((g) => g.id === selected);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      setBusy(true);
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    // A newly imported profile can reach Zustand before the live query refreshes.
    // Confirm absence in IndexedDB before clearing the selected ID.
    if (profiles && profileId && !profile) {
      void db.profiles.get(profileId).then((found) => {
        if (!cancelled && !found) setProfile(null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [profiles, profileId, profile]);
  if (!profiles || (profileId && !profile))
    return (
      <div className="loading-screen">Завантаження локальної бібліотеки…</div>
    );
  if (!profile)
    return (
      <div className="onboarding">
        <div className="brand">
          <span className="brand-icon">
            <Gamepad2 />
          </span>
          java<span className="brand-light">retro</span>
          <span className="beta">BETA</span>
        </div>
        <div className="onboard-grid">
          <div>
            <p className="eyebrow">ВАША МОБІЛЬНА КЛАСИКА</p>
            <h1>
              Маленький екран.
              <br />
              <em>Великі спогади.</em>
            </h1>
            <p className="lead">
              Поверніться до улюблених Java-ігор.
              <br />
              Просто у браузері, з вашими збереженнями.
            </p>
            <div className="feature-row">
              <span>
                <HardDrive size={17} /> Локальні дані
              </span>
              <span>
                <ShieldCheck size={17} /> Без реєстрації
              </span>
            </div>
            <PhoneArt />
          </div>
          <section className="onboard-card">
            <span className="eyebrow">ПОЧНІМО ЗІ ЗНАЙОМСТВА</span>
            <h2>Ваш ігровий профіль</h2>
            <p>Окрема бібліотека, налаштування та RMS для кожного гравця.</p>
            {profiles.length > 0 && (
              <div className="profile-list">
                {profiles.map((p) => (
                  <button key={p.id} onClick={() => setProfile(p.id)}>
                    <span>{p.avatar}</span>
                    {p.name}
                    <ArrowRight size={18} />
                  </button>
                ))}
              </div>
            )}
            <ProfileForm onCreate={(p) => setProfile(p.id)} />
            <label className="text-link file-label">
              <Upload size={16} /> Імпортувати профіль
              <input
                type="file"
                accept=".zip"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void run(async () =>
                      setProfile((await importProfile(f)).id),
                    );
                }}
              />
            </label>
            <small>
              Профіль зберігається лише в цьому браузері.
              <br />
              Для перенесення на інший пристрій експортуйте архів.
            </small>
          </section>
        </div>
        {error && <ErrorBox error={error} close={() => setError("")} />}
      </div>
    );
  const filtered = games
    .filter(
      (g) =>
        (page !== "favorites" || g.favorite) &&
        (g.metadata.name + " " + g.metadata.vendor)
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.metadata.name.localeCompare(b.metadata.name)
        : sort === "added"
          ? b.importedAt - a.importedAt
          : (b.lastPlayed || 0) - (a.lastPlayed || 0) ||
            b.importedAt - a.importedAt,
    );
  const importFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const jars = list.filter((f) => /\.jar$/i.test(f.name));
    if (!jars.length)
      throw Error("Виберіть JAR. JAD можна додати разом із ним.");
    for (const jar of jars) {
      const jad = list.find(
        (f) =>
          f.name.toLowerCase() ===
          jar.name.replace(/\.jar$/i, ".jad").toLowerCase(),
      );
      const game = await installGame(profile.id, jar, jar.name, jad);
      setSelected(game.id);
    }
    setModal(null);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (!playing) {
              setSelected(null);
              setPage("library");
            }
          }}
        >
          <span className="brand-icon">
            <Gamepad2 />
          </span>
          java<span className="brand-light">retro</span>
        </a>
        <p className="sidebar-caption">ВАШ ПРОСТІР</p>
        <nav>
          {[
            [Library, "library", t("library")],
            [Store, "store", "Магазин"],
            [Heart, "favorites", t("favorites")],
            [Users, "profiles", t("profiles")],
          ].map(([Icon, key, text]) => {
            const I = Icon as typeof Library;
            return (
              <button
                key={String(key)}
                disabled={playing}
                className={page === key ? "nav-active" : ""}
                onClick={() => {
                  setPage(String(key));
                  setSelected(null);
                }}
              >
                <I size={19} />
                {String(text)}
                {key === "library" && (
                  <span className="nav-count">{games.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" />
            <strong>Усе залишається у вас</strong>
            <p>Ігри та збереження зберігаються локально в браузері.</p>
          </div>
          <button
            className="nav-settings"
            disabled={playing}
            onClick={() => setModal("global")}
          >
            <Settings size={18} />
            {t("settings")}
          </button>
          <button
            className="profile-switch"
            aria-label={"Профіль " + profile.name}
            disabled={playing}
            onClick={() => {
              setPage("profiles");
              setSelected(null);
            }}
          >
            <span className="avatar">{profile.avatar}</span>
            <span>
              <strong>{profile.name}</strong>
              <small>Локальний профіль</small>
            </span>
            <span className="online-dot" />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            <span className="crumb">Ваш простір</span>
            <span className="slash">/</span>
            {selectedGame
              ? selectedGame.metadata.name
              : page === "profiles"
                ? t("profiles")
                : page === "favorites"
                  ? t("favorites")
                  : page === "store"
                    ? "Магазин"
                    : t("library")}
          </span>
          <span className="topbar-status">
            <span className="status-dot" /> FreeJ2ME Web{" "}
            <span className="version">v0.1</span>
          </span>
        </header>
        {!playing && !selectedGame && page === "library" && <OfflineOffer />}
        {playing && selectedGame ? (
          <Player
            game={selectedGame}
            close={() => setPlaying(false)}
            run={run}
          />
        ) : selectedGame ? (
          <GameDetails
            game={selectedGame}
            back={() => setSelected(null)}
            play={() => setPlaying(true)}
            run={run}
          />
        ) : page === "store" ? (
          <RepositoryStore
            profileId={profile.id}
            games={games}
            open={(id) => setSelected(id)}
          />
        ) : page === "profiles" ? (
          <div className="content">
            <p className="eyebrow">КОЖНОМУ — СВОЯ ІСТОРІЯ</p>
            <h1>Ігрові профілі</h1>
            <p className="muted">
              Бібліотеки та збереження розділені між профілями.
            </p>
            <div className="profiles-grid">
              {profiles.map((p) => (
                <button
                  className={
                    "profile-card " + (p.id === profile.id ? "active" : "")
                  }
                  key={p.id}
                  onClick={() => {
                    setProfile(p.id);
                    setPage("library");
                  }}
                >
                  <span>{p.avatar}</span>
                  <h3>{p.name}</h3>
                  <small>Створено {date(p.createdAt)}</small>
                  {p.id === profile.id && (
                    <span className="badge">Активний</span>
                  )}
                </button>
              ))}
              <button
                className="profile-card add-profile"
                onClick={() => setModal("profile")}
              >
                <Plus />
                <h3>Новий профіль</h3>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={
              "content library-page" + (games.length ? " has-games" : "")
            }
          >
            <div className="page-heading">
              <div>
                <p className="eyebrow">СТАРІ ІГРИ. НОВІ ПРИГОДИ.</p>
                <h1>
                  {page === "favorites" ? "Обрані ігри" : "Ваша бібліотека"}
                  <span className="title-count">{games.length}</span>
                </h1>
                <p className="muted">
                  Ті самі ігри, заради яких хотілося ще п’ять хвилин.
                </p>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() => setModal("import")}
              >
                <Plus size={18} />
                {t("importGame")}
              </button>
            </div>
            <section className="hero">
              <div className="hero-copy">
                <span className="badge">
                  <span className="status-dot" /> JAVA ME · У БРАУЗЕРІ
                </span>
                <h2>
                  Ностальгія.
                  <br />
                  <em>Без кнопкового телефону.</em>
                </h2>
                <p>
                  Перетягніть свій JAR. Ми підберемо налаштування.
                  <br />
                  Вам залишиться тільки натиснути «Грати».
                </p>
                <button
                  className="hero-link"
                  onClick={() => setModal("import")}
                >
                  Додати першу пригоду <ArrowUpRight size={18} />
                </button>
              </div>
              <PhoneArt />
              <span className="hero-coordinate">
                240 × 320 / PURE NOSTALGIA
              </span>
            </section>
            <div className="stats-row">
              <span>
                <Gamepad2 size={18} />
                <strong>{games.length}</strong> ігор у бібліотеці
              </span>
              <span>
                <Heart size={17} />
                <strong>{games.filter((g) => g.favorite).length}</strong>{" "}
                обраних
              </span>
              <span>
                <Monitor size={17} />
                <strong>
                  {Math.floor(sessions.reduce((n, s) => n + s.seconds, 0) / 60)}
                </strong>{" "}
                хвилин гри
              </span>
              <span className="stats-local">
                <ShieldCheck size={16} /> JAR не завантажуються на сервер
              </span>
            </div>
            <div className="library-toolbar">
              <div className="tabs">
                <button
                  className={page === "library" ? "active" : ""}
                  onClick={() => setPage("library")}
                >
                  Усі ігри <span>{games.length}</span>
                </button>
                <button
                  className={page === "favorites" ? "active" : ""}
                  onClick={() => setPage("favorites")}
                >
                  Обрані
                </button>
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Пошук ігор"
                    placeholder="Знайти гру…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="sort">
                  <SlidersHorizontal size={16} />
                  <select
                    aria-label="Сортувати ігри"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recent">Нещодавні</option>
                    <option value="added">Додані</option>
                    <option value="name">За назвою</option>
                  </select>
                </label>
              </div>
            </div>
            <div
              className={"drop-zone " + (drag ? "dragging" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void run(() => importFiles(e.dataTransfer.files));
              }}
            >
              <span className="upload-icon">
                <Upload />
              </span>
              <div>
                <h3>
                  {busy ? "Аналізуємо JAR…" : "Нові спогади починаються тут"}
                </h3>
                <p>
                  Перетягніть .jar сюди або{" "}
                  <button
                    className="inline-link"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                  >
                    виберіть файл
                  </button>
                </p>
                <small>
                  JAR до 32 МБ · JAD за бажанням · автоматичний аналіз
                </small>
              </div>
              <span className="file-tag">
                .JAR <Plus size={14} />
              </span>
            </div>
            <input
              ref={input}
              className="hidden"
              type="file"
              accept=".jar,.jad"
              multiple
              onChange={(e) => {
                if (e.target.files)
                  void run(() => importFiles(e.target.files!));
                e.target.value = "";
              }}
            />
            {filtered.length ? (
              <div className="games-grid">
                {filtered.map((g, i) => (
                  <article className={"game-card tone-" + (i % 4)} key={g.id}>
                    <button
                      className="game-cover"
                      onClick={() => setSelected(g.id)}
                      aria-label={"Відкрити " + g.metadata.name}
                    >
                      <div className="cover-lines" />
                      <BlobImage blob={g.icon} alt="" />
                      <span className="cover-title">{g.metadata.name}</span>
                      <span className="cover-tag">JAVA ME</span>
                    </button>
                    <button
                      className={
                        "favorite " + (g.favorite ? "is-favorite" : "")
                      }
                      aria-label={
                        g.favorite ? "Прибрати з обраних" : "В обрані"
                      }
                      onClick={() =>
                        void run(() =>
                          db.games.update(g.id, { favorite: !g.favorite }),
                        )
                      }
                    >
                      <Heart
                        size={17}
                        fill={g.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <div className="game-info">
                      <button
                        className="game-title"
                        onClick={() => setSelected(g.id)}
                      >
                        {g.metadata.name}
                      </button>
                      <small>
                        {g.metadata.vendor} · {g.metadata.version}
                      </small>
                      <div className="game-card-bottom">
                        <span>{date(g.lastPlayed)}</span>
                        <button
                          className="small-play"
                          onClick={() => {
                            setSelected(g.id);
                            setPlaying(true);
                          }}
                        >
                          <Play size={14} fill="currentColor" /> Грати
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-library">
                <Library size={25} />
                <h3>
                  {query
                    ? "Нічого не знайдено"
                    : page === "favorites"
                      ? "Тут житимуть ваші фаворити"
                      : "Ваша наступна улюблена гра вже десь поруч"}
                </h3>
                <p>
                  {query
                    ? "Спробуйте іншу назву або розробника."
                    : "Додайте власний JAR або перевірте емулятор нашим тестовим MIDlet."}
                </p>
                {!query && page === "library" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const r = await fetch("/fixtures/rms-probe.jar");
                        if (!r.ok)
                          throw Error(
                            "Тестовий JAR не знайдено. Запустіть npm run engine:prepare.",
                          );
                        const g = await installGame(
                          profile.id,
                          await r.blob(),
                          "rms-probe.jar",
                        );
                        setSelected(g.id);
                      })
                    }
                  >
                    Додати RMS Probe <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
            <footer>
              <span>Зроблено для ігор, які ми пам’ятаємо.</span>
              <span>
                FreeJ2ME Web + CheerpJ <span className="footer-dot">·</span>{" "}
                Дані лише на пристрої
              </span>
            </footer>
          </div>
        )}
      </main>
      {modal === "profile" && (
        <Modal title="Новий профіль" close={() => setModal(null)}>
          <ProfileForm
            onCreate={(p) => {
              setProfile(p.id);
              setModal(null);
              setPage("library");
            }}
          />
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="Додати гру" close={() => setModal(null)}>
          <p className="muted">
            Оберіть власний JAR. Для супровідного JAD використайте таку саму
            назву файлу.
          </p>
          <div
            className="drop-zone modal-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void run(() => importFiles(e.dataTransfer.files));
            }}
          >
            <Upload />
            <p>Перетягніть JAR та JAD сюди</p>
            <label className="primary file-label">
              Вибрати файли
              <input
                disabled={busy}
                type="file"
                multiple
                accept=".jar,.jad"
                onChange={(e) => {
                  if (e.target.files)
                    void run(() => importFiles(e.target.files!));
                }}
              />
            </label>
          </div>
          <p className="muted small">
            До 32 МБ на JAR. Архів перевіряється перед розпакуванням.
            Автоматичні параметри можна змінити після імпорту.
          </p>
          {busy && <p role="status">Імпортуємо та аналізуємо…</p>}
        </Modal>
      )}
      {modal === "global" && (
        <Modal title="Налаштування та дані" close={() => setModal(null)}>
          <GlobalSettings profile={profile} run={run} />
        </Modal>
      )}
      {error && <ErrorBox error={error} close={() => setError("")} />}
    </div>
  );
}
function errorText(e: unknown) {
  const s = e instanceof Error ? e.message : String(e);
  return /quota/i.test(s)
    ? "Недостатньо місця у сховищі браузера. Експортуйте профіль і звільніть місце."
    : s;
}
function ErrorBox({ error, close }: { error: string; close: () => void }) {
  return (
    <div className="error-toast" role="alert">
      <AlertCircle size={19} />
      <span>{error}</span>
      <button aria-label="Закрити помилку" onClick={close}>
        <X size={17} />
      </button>
    </div>
  );
}
function ProfileForm({ onCreate }: { onCreate: (p: Profile) => void }) {
  const [name, setName] = useState(""),
    [avatar, setAvatar] = useState("👾"),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          void requestDurableStorage();
          onCreate(await createProfile(name, avatar));
        } catch (e) {
          useApp.getState().setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>Оберіть аватар</label>
      <div className="avatar-picker">
        {avatars.map((a) => (
          <button
            className={avatar === a ? "selected" : ""}
            type="button"
            key={a}
            aria-label={"Аватар " + a}
            aria-pressed={avatar === a}
            onClick={() => setAvatar(a)}
          >
            {a}
          </button>
        ))}
      </div>
      <label htmlFor="profile-name">Як вас називати?</label>
      <input
        id="profile-name"
        placeholder="Ім’я гравця"
        required
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="primary wide" disabled={busy || !name.trim()}>
        Створити профіль <ArrowRight size={18} />
      </button>
    </form>
  );
}
function PhoneArt() {
  return (
    <div className="phone-art" aria-hidden="true">
      <span className="orbit orbit-one" />
      <span className="orbit orbit-two" />
      <span className="pixel pixel-one" />
      <span className="pixel pixel-two" />
      <div className="phone">
        <div className="phone-speaker" />
        <span className="phone-brand">JAVA RETRO</span>
        <div className="phone-screen">
          <div className="phone-signal">
            ▂▄▆ <span>▰</span>
          </div>
          <div className="pixel-snake">
            ▟<br />
            ▙▄▄▖
            <br />
            　　▜▙
          </div>
          <span className="phone-screen-text">READY TO PLAY</span>
        </div>
        <div className="phone-controls">
          <span>−</span>
          <span className="dpad">✚</span>
          <span>−</span>
        </div>
        <div className="phone-numbers">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
            (n) => (
              <span key={n}>{n}</span>
            ),
          )}
        </div>
      </div>
      <div className="floating-chip">
        <span className="status-dot" /> Знову на зв’язку
      </div>
    </div>
  );
}
type Run = (fn: () => Promise<unknown>) => Promise<void>;
function GlobalSettings({ profile, run }: { profile: Profile; run: Run }) {
  const storage = useStorageHealth(),
    persistent = storage.persistence === "persistent";
  return (
    <div className="settings-stack">
      <PwaSettings />
      <OfflineSettings />
      <section>
        <h3>
          Профіль {profile.avatar} {profile.name}
        </h3>
        <p className="muted">
          Архів включає JAR, налаштування, RMS, слоти та історію запусків.
          Імпорт створює окремий новий профіль.
        </p>
        <div className="button-row">
          <button
            className="secondary"
            onClick={() =>
              void run(async () =>
                download(
                  await exportProfile(profile.id),
                  profile.name + "-retro.zip",
                ),
              )
            }
          >
            <Download size={16} /> Експорт профілю
          </button>
          <label className="secondary file-label">
            <Upload size={16} /> Імпорт профілю
            <input
              aria-label="Імпорт профілю"
              type="file"
              accept=".zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void run(async () => {
                    const p = await importProfile(f);
                    useApp.getState().setProfile(p.id);
                  });
              }}
            />
          </label>
        </div>
      </section>
      <section>
        <h3>Сховище браузера</h3>
        <p className="muted">
          Використано {Math.round((storage?.usage || 0) / 1024 / 1024)} МБ. Дані
          залишаються на цьому пристрої без інтернету. Постійне сховище:
          {persistent
            ? " дозволено браузером."
            : storage.persistence === "checking"
              ? " перевіряємо…"
              : " не підтверджено."}
          {storage.quota !== undefined && (
            <>
              {" "}
              Орієнтовна квота: {Math.round(storage.quota / 1024 / 1024)} МБ.
            </>
          )}
        </p>
        <button
          className="secondary"
          disabled={persistent || storage.persistence === "unsupported"}
          onClick={() => void requestDurableStorage()}
        >
          {persistent ? <Check size={16} /> : <HardDrive size={16} />}{" "}
          {persistent
            ? "Постійне сховище дозволено"
            : "Запросити постійне сховище"}
        </button>
        {storage.message && (
          <p className="hint" role="status">
            {storage.message}
          </p>
        )}
        <p className="hint">
          Окремий ZIP у «Файлах» захищає від очищення даних застосунку.
          Натисніть «Експорт профілю» вище та збережіть файл поза браузером. На
          iPhone використовуйте встановлену PWA й ту саму адресу сайту.
          Приватний режим не підходить для постійної бібліотеки.
        </p>
      </section>
      <section>
        <h3>Рушій і сумісність</h3>
        <p className="muted">
          FreeJ2ME Web · GPL-3.0-or-later та сторонні ліцензії. CheerpJ
          завантажується з CDN або підготовленого офлайн-пакета. M3G та Mascot
          Capsule v3 потребують WebGL 2. Пауза й повні snapshots недоступні.
        </p>
        <p className="muted">
          Локальні профілі розділяють дані застосунку. Це не захист від навмисно
          шкідливого Java-коду в межах одного origin.
        </p>
        <a
          href="https://cheerpj.com/docs/licensing.html"
          target="_blank"
          rel="noreferrer"
        >
          Умови CheerpJ ↗
        </a>{" "}
        ·{" "}
        <a href="/engine/LICENSE" target="_blank" rel="noreferrer">
          Ліцензія FreeJ2ME ↗
        </a>
      </section>
    </div>
  );
}
function GameDetails({
  game,
  back,
  play,
  run,
}: {
  game: Game;
  back: () => void;
  play: () => void;
  run: Run;
}) {
  const [tab, setTab] = useState("details"),
    [deleting, setDeleting] = useState(false),
    [deleteSaves, setDeleteSaves] = useState(false);
  return (
    <div className="content">
      <button className="text-link back-link" onClick={back}>
        <ChevronLeft size={18} />
        {t("back")}
      </button>
      <div className="details-heading">
        <div className="detail-icon">
          <BlobImage blob={game.icon} alt="" />
        </div>
        <div>
          <p className="eyebrow">{game.metadata.vendor}</p>
          <h1>{game.metadata.name}</h1>
          <p className="muted">
            Версія {game.metadata.version} · {game.metadata.midp} ·{" "}
            {game.metadata.cldc}
          </p>
        </div>
        <button className="primary" onClick={play}>
          <Play size={17} fill="currentColor" />
          Грати
        </button>
      </div>
      <div className="tabs details-tabs">
        {[
          ["details", "Огляд"],
          ["settings", "Налаштування"],
          ["keyboard", "Клавіатура"],
          ["saves", "Збереження"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "details" ? (
        <div className="details-grid">
          <section className="panel">
            <h2>Аналіз сумісності</h2>
            <div className="detection">
              <Monitor />
              <div>
                <strong>
                  {game.configuration.width} × {game.configuration.height}
                </strong>
                <p>{game.compatibility.screen.evidence}</p>
              </div>
              <span>
                {Math.round(game.compatibility.screen.confidence * 100)}%
              </span>
            </div>
            <div className="detection">
              <Gamepad2 />
              <div>
                <strong>{game.configuration.phone}</strong>
                <p>{game.compatibility.phone.evidence}</p>
              </div>
              <span>
                {Math.round(game.compatibility.phone.confidence * 100)}%
              </span>
            </div>
            <div className="tags">
              {game.compatibility.apis.map((a) => (
                <span className="badge" key={a}>
                  {a}
                </span>
              ))}
            </div>
            {game.compatibility.warnings.map((w) => (
              <p className="muted small" key={w}>
                • {w}
              </p>
            ))}
            <p className="hint">
              Якщо гра не запускається, спробуйте Standard, іншу роздільність,
              вимкнення звуку або queued paint у налаштуваннях.
            </p>
          </section>
          <section className="panel">
            <h2>Про гру</h2>
            <dl>
              <dt>Останній запуск</dt>
              <dd>{date(game.lastPlayed)}</dd>
              <dt>Додано</dt>
              <dd>{date(game.importedAt)}</dd>
              <dt>MIDlet</dt>
              <dd>{game.configuration.midlet}</dd>
              <dt>SHA-256</dt>
              <dd className="hash">{game.hash}</dd>
            </dl>
            <button
              className="danger text-link"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={16} />
              Видалити гру
            </button>
          </section>
          <section className="panel full">
            <details>
              <summary>Manifest / JAD</summary>
              <pre>
                {Object.entries(game.metadata.manifest)
                  .map(([k, v]) => k + ": " + v)
                  .join("\n")}
              </pre>
            </details>
          </section>
        </div>
      ) : tab === "settings" ? (
        <GameSettings game={game} run={run} />
      ) : tab === "keyboard" ? (
        <KeyboardEditor game={game} run={run} />
      ) : (
        <SaveManager game={game} run={run} />
      )}
      {deleting && (
        <Modal title="Видалити гру?" close={() => setDeleting(false)}>
          <p>JAR «{game.metadata.name}» буде видалено з цього профілю.</p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={deleteSaves}
              onChange={(e) => setDeleteSaves(e.target.checked)}
            />
            Також видалити RMS і резервні слоти
          </label>
          <p className="muted small">
            Якщо залишити збереження, вони підхопляться після повторного імпорту
            того самого JAR.
          </p>
          <button
            className="danger-button"
            onClick={() =>
              void run(async () => {
                await removeGame(game.profileId, game.id, deleteSaves);
                back();
              })
            }
          >
            Видалити
          </button>
        </Modal>
      )}
    </div>
  );
}
function GameSettings({ game, run }: { game: Game; run: Run }) {
  const [c, setC] = useState<EmulatorConfiguration>(game.configuration),
    [saved, setSaved] = useState(false);
  const patch = (p: Partial<EmulatorConfiguration>) => {
    setC({ ...c, ...p });
    setSaved(false);
  };
  return (
    <form
      className="panel settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          validateConfiguration(c);
          await db.games.update(game.id, { configuration: c });
          setSaved(true);
        });
      }}
    >
      <div className="section-heading">
        <div>
          <h2>Параметри емуляції</h2>
          <p className="muted">
            Зміни застосуються під час наступного запуску.
          </p>
        </div>
        <select
          aria-label="Режим конфігурації"
          value={c.mode}
          onChange={(e) => {
            if (e.target.value === "auto") {
              setC({
                ...c,
                mode: "auto",
                phone: game.compatibility.phone.value,
                width: game.compatibility.screen.value[0],
                height: game.compatibility.screen.value[1],
              });
            } else patch({ mode: "advanced" });
          }}
        >
          <option value="auto">Auto</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div className="form-grid">
        <label>
          Телефон
          <select
            disabled={c.mode === "auto"}
            value={c.phone}
            onChange={(e) =>
              patch({ phone: e.target.value as EmulatorConfiguration["phone"] })
            }
          >
            {["Standard", "Nokia", "SonyEricsson", "Motorola", "Siemens"].map(
              (p) => (
                <option key={p}>{p}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Екран
          <select
            disabled={c.mode === "auto"}
            value={
              [
                "128x160",
                "176x208",
                "176x220",
                "240x320",
                "320x240",
                "360x640",
              ].includes(c.width + "x" + c.height)
                ? c.width + "x" + c.height
                : "custom"
            }
            onChange={(e) => {
              if (e.target.value === "custom")
                patch({ width: 241, height: 320 });
              else {
                const [width, height] = e.target.value.split("x").map(Number);
                patch({ width, height });
              }
            }}
          >
            {[
              "128x160",
              "176x208",
              "176x220",
              "240x320",
              "320x240",
              "360x640",
            ].map((s) => (
              <option key={s} value={s}>
                {s.replace("x", " × ")}
              </option>
            ))}
            <option value="custom">Власна роздільність</option>
          </select>
        </label>
        <label>
          Ширина
          <input
            disabled={c.mode === "auto"}
            type="number"
            min={64}
            max={1024}
            value={c.width}
            onChange={(e) => patch({ width: Number(e.target.value) })}
          />
        </label>
        <label>
          Висота
          <input
            disabled={c.mode === "auto"}
            type="number"
            min={64}
            max={1024}
            value={c.height}
            onChange={(e) => patch({ height: Number(e.target.value) })}
          />
        </label>
        <label>
          FPS limit
          <select
            value={c.fps}
            onChange={(e) => patch({ fps: Number(e.target.value) })}
          >
            {[0, 15, 30, 60].map((f) => (
              <option key={f} value={f}>
                {f || "Без обмежень"}
              </option>
            ))}
          </select>
        </label>
        <label>
          MIDlet
          <select
            value={c.midlet}
            onChange={(e) => patch({ midlet: e.target.value })}
          >
            {game.metadata.midlets.map((m) => (
              <option key={m.className} value={m.className}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="checkbox-grid">
        {[
          ["sound", "Звук"],
          ["integerScale", "Цілочисельний масштаб"],
          ["forceFullscreen", "Повний екран MIDlet"],
          ["queuedPaint", "Queued paint"],
          ["textureDisableFilter", "Без фільтрації 3D-текстур"],
        ].map(([k, label]) => (
          <label className="checkbox" key={k}>
            <input
              type="checkbox"
              checked={c[k as keyof EmulatorConfiguration] as boolean}
              onChange={(e) => patch({ [k]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <p className="hint">
        MIDP / CLDC визначаються грою; рушій не має перемикача версій JVM. M3G і
        Mascot Capsule v3 активуються викликами гри. Загальний регулятор
        гучності для всіх звукових API не підтримується.
      </p>
      <p className="muted small">
        WebGL 2: {hasWebGL2() ? "доступний" : "недоступний"}. Samsung API
        потребує перевірки; окремого телефонного пресету немає.
      </p>
      <button className="primary">
        {saved ? <Check size={17} /> : <Settings size={17} />}{" "}
        {saved ? "Збережено" : "Зберегти параметри"}
      </button>
    </form>
  );
}
function KeyboardEditor({ game, run }: { game: Game; run: Run }) {
  const [keys, setKeys] = useState(game.configuration.keys),
    [capture, setCapture] = useState<Action | null>(null),
    [preset, setPreset] = useState("Custom"),
    [saved, setSaved] = useState(false);
  const duplicates = actions.filter((a) =>
    actions.some((b) => a !== b && keys[a] === keys[b]),
  );
  useEffect(() => {
    if (!capture) return;
    const handle = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setKeys((k) => ({ ...k, [capture]: e.code }));
      setCapture(null);
      setPreset("Custom");
      setSaved(false);
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [capture]);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Ваша клавіатура</h2>
          <p className="muted">Натисніть кнопку дії, потім фізичну клавішу.</p>
        </div>
        <select
          aria-label="Пресет клавіатури"
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            if (e.target.value !== "Custom")
              setKeys(keyboardPreset(e.target.value));
            setSaved(false);
          }}
        >
          {["Nokia Classic", "Sony Ericsson", "Standard J2ME", "Custom"].map(
            (p) => (
              <option key={p}>{p}</option>
            ),
          )}
        </select>
      </div>
      <div className="key-editor">
        {actions.map((a) => (
          <button
            key={a}
            className={
              (capture === a ? "capturing " : "") +
              (duplicates.includes(a) ? "conflict" : "")
            }
            onClick={() => setCapture(a)}
          >
            <span>{labels[a]}</span>
            <kbd>{capture === a ? "Натисніть клавішу…" : keys[a]}</kbd>
          </button>
        ))}
      </div>
      {duplicates.length > 0 && (
        <p className="danger">Конфлікт: кожна дія потребує окремої клавіші.</p>
      )}
      <p className="hint">
        Gamepad: D-pad / лівий стік — напрямок; A — OK; B / X — soft keys; Y —
        5; Start — 0. Екранна клавіатура підтримує одночасні дотики.
      </p>
      <button
        className="primary"
        disabled={!!duplicates.length || !!capture}
        onClick={() =>
          void run(async () => {
            const configuration = { ...game.configuration, keys };
            validateConfiguration(configuration);
            await db.games.update(game.id, { configuration });
            setSaved(true);
          })
        }
      >
        <Keyboard size={17} />
        {saved ? "Збережено" : "Зберегти розкладку"}
      </button>
      <details className="touch-design-settings">
        <summary>Вигляд екранної клавіатури</summary>
        <TouchControlsEditor
          gameId={game.id}
          value={game.configuration.touchControls}
        />
      </details>
    </section>
  );
}
function SaveManager({
  game,
  run,
  adapter,
  running = false,
  screenshot,
}: {
  game: Game;
  run: Run;
  adapter?: FreeJ2MEAdapter;
  running?: boolean;
  screenshot?: Blob;
}) {
  const saves = useLiveQuery(() => db.saves.get(game.id), [game.id]);
  const recovery =
    useLiveQuery(
      () =>
        db.recoverySaves
          .where({ gameId: game.id, profileId: game.profileId })
          .sortBy("savedFrom"),
      [game.id, game.profileId],
    ) || [];
  const slots =
    useLiveQuery(
      () =>
        db.slots
          .where({ profileId: game.profileId, gameId: game.id })
          .toArray(),
      [game.id],
    ) || [];
  const [name, setName] = useState("Резервна копія"),
    [rename, setRename] = useState<string | null>(null),
    [renameText, setRenameText] = useState("");
  return (
    <section className="panel save-manager">
      <h2>Постійні збереження RMS</h2>
      <p className="muted">
        {saves
          ? "Остання копія: " +
            new Date(saves.updatedAt).toLocaleString("uk-UA")
          : "Збережень ще немає. Запустіть гру."}
      </p>
      <p className="hint">
        Слоти відновлюють внутрішні збереження гри. Повний стан JVM і точний
        момент гри не підтримуються. Відновлення доступне після зупинки.
      </p>
      <div className="button-row">
        <button
          className="secondary"
          disabled={!saves && !running}
          onClick={() =>
            void run(async () =>
              download(
                adapter ? await adapter.exportSaveData() : saves!.data,
                game.metadata.name + "-rms.zip",
              ),
            )
          }
        >
          <Download size={16} />
          Експорт RMS
        </button>
        <label
          className={"secondary file-label " + (running ? "disabled" : "")}
        >
          <Upload size={16} />
          Імпорт RMS
          <input
            disabled={running}
            type="file"
            accept=".zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(() => putSave(game.profileId, game.id, f));
            }}
          />
        </label>
      </div>
      <details className="recovery-saves">
        <summary>Автоматичні попередні копії ({recovery.length}/2)</summary>
        <p className="muted small">
          Дві попередні різні версії RMS зберігаються на цьому пристрої. Це
          відновлення після невдалого запису або небажаного прогресу; для
          захисту від очищення браузера потрібен окремий експорт. Архів профілю
          містить поточне RMS і ручні слоти.
        </p>
        {[...recovery].reverse().map((save) => (
          <div key={save.id} className="recovery-row">
            <span>{new Date(save.savedFrom).toLocaleString("uk-UA")}</span>
            <button
              className="secondary"
              disabled={running}
              onClick={() =>
                void run(() => restoreRecoverySave(game.profileId, save.id))
              }
            >
              Відновити автокопію
            </button>
            <button
              className="secondary"
              onClick={() =>
                download(save.data, game.metadata.name + "-recovery.zip")
              }
            >
              Експорт автокопії
            </button>
          </div>
        ))}
      </details>
      <div className="slot-create">
        <input
          aria-label="Назва резервної копії"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <button
          className="primary"
          disabled={slots.length >= 5 || (!saves && !running)}
          onClick={() =>
            void run(async () => {
              let image = screenshot;
              if (adapter && running) {
                await adapter.exportSaveData();
                image = await adapter.captureScreenshot();
              }
              await createSlot(game.profileId, game.id, name, image);
            })
          }
        >
          <Plus size={16} />
          Створити слот ({slots.length}/5)
        </button>
      </div>
      <div className="slots">
        {slots.map((s) => (
          <article className="slot" key={s.id}>
            {s.screenshot && (
              <BlobImage blob={s.screenshot} alt="Скріншот слота" />
            )}
            <div>
              <h3>{s.name}</h3>
              <small>
                {new Date(s.createdAt).toLocaleString("uk-UA")} · RMS v
                {s.format}
              </small>
            </div>
            <div className="button-row">
              <button
                className="secondary"
                disabled={running}
                onClick={() =>
                  void run(() => restoreSlot(game.profileId, s.id))
                }
              >
                Відновити
              </button>
              <button
                className="icon-button"
                aria-label="Перейменувати слот"
                onClick={() => {
                  setRename(s.id);
                  setRenameText(s.name);
                }}
              >
                <Settings size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Експорт слота"
                onClick={() => download(s.data, s.name + ".zip")}
              >
                <Download size={16} />
              </button>
              <button
                className="icon-button danger"
                aria-label="Видалити слот"
                onClick={() => void run(() => db.slots.delete(s.id))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!slots.length && (
        <p className="muted">П’ять місць для ваших важливих збережень.</p>
      )}
      {rename && (
        <form
          className="rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await db.slots.update(rename, {
                name: renameText.trim().slice(0, 80) || "Резервна копія",
              });
              setRename(null);
            });
          }}
        >
          <input
            aria-label="Нова назва слота"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            maxLength={80}
          />
          <button className="primary">Зберегти назву</button>
        </form>
      )}
    </section>
  );
}
function Player({
  game,
  close,
  run,
}: {
  game: Game;
  close: () => void;
  run: Run;
}) {
  const host = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const fullscreen = useGameFullscreen(surface);
  const [touchControls, setTouchControls] = useState(() =>
    normalizeTouchControls(game.configuration.touchControls),
  );
  const [showControls, setShowControls] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>(
    game.configuration.inputMode || "both",
  );
  const [modeSaving, setModeSaving] = useState(false);
  const [rotation, setRotation] = useState<DisplayRotation>(
    game.configuration.displayRotation || 0,
  );
  const [geometry, setGeometry] = useState<DisplayGeometry>({
    width: game.configuration.width,
    height: game.configuration.height,
    rotation: 0,
  });
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>({
    state: "pending",
  });
  const [status, setStatus] = useState("Підготовка…"),
    [running, setRunning] = useState(false),
    [working, setWorking] = useState(true),
    [showSaves, setShowSaves] = useState(false),
    [screenshot, setScreenshot] = useState<Blob>();
  const [adapter] = useState(
    () =>
      new FreeJ2MEAdapter(
        setStatus,
        (e) => useApp.getState().setError(e),
        () => {
          setRunning(false);
          setWorking(false);
        },
        setSaveFeedback,
        setGeometry,
      ),
  );
  const launch = async () => {
    setWorking(true);
    try {
      await adapter.installGame(game);
      await adapter.launchGame(host.current!);
      setRunning(true);
    } finally {
      setWorking(false);
    }
  };
  useEffect(() => {
    void run(launch);
    return () => {
      void adapter.forceStop();
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const physicalHeld = new Map<string, Action>();
    const key = (e: KeyboardEvent) => {
      if (e.type === "keyup" && physicalHeld.has(e.code)) {
        adapter.sendKeyUp(physicalHeld.get(e.code)!, "keyboard:" + e.code);
        physicalHeld.delete(e.code);
        e.preventDefault();
        return;
      }
      if (
        (e.target as HTMLElement)?.closest(
          "input,select,textarea,dialog,button",
        )
      )
        return;
      const a = actions.find((a) => game.configuration.keys[a] === e.code);
      if (a) {
        e.preventDefault();
        if (e.type === "keydown") physicalHeld.set(e.code, a);
        e.type === "keydown"
          ? adapter.sendKeyDown(a, "keyboard:" + e.code)
          : adapter.sendKeyUp(a, "keyboard:" + e.code);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    const release = () => {
      physicalHeld.clear();
      adapter.releaseKeys();
    };
    const releaseOnBlur = () =>
      queueMicrotask(() => {
        // Focusing the same-origin game iframe blurs this window, but the app
        // still has focus. Keep other fingers held on the parent keypad.
        if (!document.hasFocus()) release();
      });
    window.addEventListener("blur", releaseOnBlur);
    document.addEventListener("visibilitychange", release);
    let frame = 0;
    let held = new Set<string>();
    const poll = () => {
      if (document.hidden || showControls || showSaves) {
        if (held.size) {
          adapter.releaseKeys();
          held.clear();
        }
        frame = requestAnimationFrame(poll);
        return;
      }
      const next = new Set<string>();
      for (const g of navigator.getGamepads?.() || []) {
        if (!g) continue;
        const bindings: [number, Action][] = [
          [0, "fire"],
          [1, "softRight"],
          [2, "softLeft"],
          [3, "5"],
          [9, "0"],
          [12, "up"],
          [13, "down"],
          [14, "left"],
          [15, "right"],
        ];
        for (const [i, a] of bindings)
          if (g.buttons[i]?.pressed) next.add(g.index + ":" + a);
        if (g.axes[0] < -0.5) next.add(g.index + ":left");
        if (g.axes[0] > 0.5) next.add(g.index + ":right");
        if (g.axes[1] < -0.5) next.add(g.index + ":up");
        if (g.axes[1] > 0.5) next.add(g.index + ":down");
      }
      for (const s of next)
        if (!held.has(s))
          adapter.sendKeyDown(s.split(":")[1] as Action, "gamepad:" + s);
      for (const s of held)
        if (!next.has(s))
          adapter.sendKeyUp(s.split(":")[1] as Action, "gamepad:" + s);
      held = next;
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", releaseOnBlur);
      document.removeEventListener("visibilitychange", release);
      cancelAnimationFrame(frame);
      release();
    };
  }, [running, adapter, game.configuration.keys, showControls, showSaves]);
  const stop = async () => {
    setWorking(true);
    try {
      setScreenshot(await adapter.captureScreenshot());
      await adapter.stopGame();
      setRunning(false);
    } finally {
      setWorking(false);
    }
  };
  const inputSelector = (
    <label className="player-input-mode">
      Керування
      <select
        aria-label="Режим керування"
        value={inputMode}
        disabled={working || modeSaving}
        onChange={(e) => {
          const mode = e.target.value as InputMode;
          void run(async () => {
            setModeSaving(true);
            try {
              await db.transaction("rw", db.games, async () => {
                const current = await db.games.get(game.id);
                if (!current) throw Error("Гру не знайдено.");
                const configuration = {
                  ...current.configuration,
                  inputMode: mode,
                };
                validateConfiguration(configuration);
                await db.games.update(game.id, { configuration });
              });
              adapter.setInputMode(mode);
              setInputMode(mode);
            } finally {
              setModeSaving(false);
            }
          });
        }}
      >
        <option value="both">Клавіатура + тач</option>
        <option value="keypad">Тільки клавіатура</option>
        <option value="touch">Тільки тач</option>
      </select>
    </label>
  );
  const rotationSelector = (
    <label className="player-input-mode">
      Поворот
      <select
        aria-label="Поворот екрана гри"
        value={rotation}
        disabled={working || modeSaving}
        onChange={(e) => {
          const next = +e.target.value as DisplayRotation;
          void run(async () => {
            setModeSaving(true);
            try {
              await db.transaction("rw", db.games, async () => {
                const current = await db.games.get(game.id);
                if (!current) throw Error("Гру не знайдено.");
                const configuration = {
                  ...current.configuration,
                  displayRotation: next,
                };
                validateConfiguration(configuration);
                await db.games.update(game.id, { configuration });
              });
              adapter.setDisplayRotation(next);
              setRotation(next);
            } finally {
              setModeSaving(false);
            }
          });
        }}
      >
        <option value={0}>За грою (0°)</option>
        <option value={90}>Вправо 90°</option>
        <option value={180}>180°</option>
        <option value={270}>Вліво 90°</option>
      </select>
    </label>
  );
  return (
    <div
      ref={surface}
      className={
        "content player-page" +
        (fullscreen.active ? " is-immersive" : "") +
        (inputMode === "touch" ? " touch-only" : "")
      }
      data-fullscreen-mode={fullscreen.mode || "window"}
    >
      {fullscreen.active && (
        <div className="immersive-toolbar">
          {inputSelector}
          {rotationSelector}
          <button className="secondary" onClick={() => void fullscreen.leave()}>
            <ChevronLeft size={16} />
            Вийти
          </button>
          <button className="secondary" onClick={() => setShowControls(true)}>
            <Keyboard size={16} />
            Клавіатура
          </button>
          <button className="secondary" onClick={() => setShowSaves(true)}>
            <HardDrive size={16} />
            Збереження
          </button>
          <button
            className="secondary"
            disabled={working}
            onClick={() => void run(running ? stop : launch)}
          >
            {running ? <Square size={15} /> : <Play size={15} />}{" "}
            {running ? "Стоп" : "Грати"}
          </button>
        </div>
      )}
      <div className="player-heading">
        <button
          className="text-link"
          disabled={working}
          onClick={() =>
            void run(async () => {
              if (running) await stop();
              close();
            })
          }
        >
          <ChevronLeft size={18} />
          Бібліотека
        </button>
        <h2>{game.metadata.name}</h2>
        <span className="badge">
          <span className="status-dot" />
          {status}
        </span>
      </div>
      <div className="player-toolbar">
        {!fullscreen.active && inputSelector}
        {!fullscreen.active && rotationSelector}
        <button
          className="secondary"
          disabled={running || working}
          onClick={() => void run(launch)}
        >
          <Play size={16} />
          Грати
        </button>
        <button
          className="secondary"
          disabled={!running || working}
          onClick={() =>
            void run(async () => {
              setWorking(true);
              try {
                await adapter.restartGame();
              } finally {
                setWorking(false);
              }
            })
          }
        >
          <RotateCcw size={16} />
          Спочатку
        </button>
        <button
          className="secondary"
          disabled={!running || working}
          onClick={() => void run(stop)}
        >
          <Square size={16} />
          Стоп
        </button>
        <button
          className="secondary"
          onClick={() =>
            void (fullscreen.active ? fullscreen.leave() : fullscreen.enter())
          }
        >
          <Maximize size={16} />
          На весь екран
        </button>
        <button className="secondary" onClick={() => setShowControls(true)}>
          <Keyboard size={16} />
          Вигляд клавіатури
        </button>
        <button
          className="secondary"
          disabled={!running}
          onClick={() =>
            void run(async () =>
              download(
                await adapter.captureScreenshot(),
                game.metadata.name + ".png",
              ),
            )
          }
        >
          <Camera size={16} />
          Скріншот
        </button>
        <button className="secondary" onClick={() => setShowSaves(true)}>
          <HardDrive size={16} />
          Збереження
        </button>
      </div>
      <div className="player-layout">
        <div className="player-stage">
          {running && (
            <span
              className={"rms-feedback rms-" + saveFeedback.state}
              role="status"
            >
              {saveFeedback.state === "saved"
                ? "RMS ✓ " +
                  new Date(saveFeedback.confirmedAt!).toLocaleTimeString(
                    "uk-UA",
                  )
                : saveFeedback.state === "failed"
                  ? "RMS: запис не підтверджено"
                  : "RMS: очікуємо запису…"}
            </span>
          )}
          <div
            ref={host}
            className="emulator-host"
            style={{
              aspectRatio: geometry.width + "/" + geometry.height,
            }}
          />
          {!running && !working && (
            <div className="stopped-label">
              <Square />
              Гру зупинено
            </div>
          )}
        </div>
        {inputMode !== "touch" && (
          <aside className="touch-controls">
            <PhoneKeypad
              configuration={touchControls}
              adapter={adapter}
              disabled={!running}
            />
            <p className="touch-controls-caption">
              Стрілки / Enter · F1 / F2 · Gamepad
              <br />
              RMS — автокопія кожні 3 с
            </p>
          </aside>
        )}
      </div>
      {inputMode === "touch" && (
        <p className="hint">
          Торкання екрана працюють у Java ME іграх із підтримкою сенсорного
          керування. Клавіатуру можна повернути в меню «Керування».
        </p>
      )}
      <p className="hint">
        Перед закриттям браузера натисніть «Стоп», щоб дочекатися фінального
        запису RMS. При раптовому закритті останні секунди можуть не потрапити
        до копії.
      </p>
      {!running && !working && (
        <button className="text-link" onClick={close}>
          <Settings size={16} />
          Налаштування та клавіатура
        </button>
      )}
      {working && (
        <p role="status">{status} Перший запуск може тривати кілька хвилин.</p>
      )}
      <details className="diagnostics">
        <summary>Діагностика та аварійне завершення</summary>
        <p className="muted small">
          WebGL 2: {adapter.getCapabilities().webgl2 ? "так" : "ні"} · M3G: API
          наявне · Mascot Capsule: v3 · snapshots: недоступні · пауза:
          недоступна.
        </p>
        <button
          className="danger-button"
          onClick={() =>
            void run(async () => {
              await adapter.forceStop();
              setRunning(false);
              setWorking(false);
            })
          }
        >
          Завершити завислий рушій
        </button>
        <p className="muted small">
          Зберігається остання підтверджена копія RMS. Незавершені записи можуть
          бути втрачені.
        </p>
      </details>
      {showSaves && (
        <Modal title="Збереження гри" close={() => setShowSaves(false)}>
          <SaveManager
            game={game}
            run={run}
            adapter={adapter}
            running={running}
            screenshot={screenshot}
          />
        </Modal>
      )}
      {showControls && (
        <Modal title="Вигляд клавіатури" close={() => setShowControls(false)}>
          <TouchControlsEditor
            gameId={game.id}
            value={touchControls}
            onSaved={(value) => {
              setTouchControls(value);
              setShowControls(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
