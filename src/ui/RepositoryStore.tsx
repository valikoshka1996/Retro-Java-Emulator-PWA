import { useEffect, useRef, useState } from "react";
import {
  Download,
  Gamepad2,
  Search,
  ShieldCheck,
  Upload,
  X,
  LogOut,
  Store,
  Star,
  RefreshCw,
} from "lucide-react";
import {
  installRepositoryGame,
  repositoryRequest,
  repositoryUrl,
  type RepositoryGame,
} from "../repository";
import type { Game } from "../types";

export function RepositoryStore({
  profileId,
  games,
  open,
}: {
  profileId: string;
  games: Game[];
  open: (id: string) => void;
}) {
  const [entries, setEntries] = useState<RepositoryGame[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [genre, setGenre] = useState(""),
    [admin, setAdmin] = useState(false),
    [manage, setManage] = useState(false);
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<RepositoryGame | null>(null);
  const files = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null);
  const load = async () => {
    setLoading(true);
    try {
      const [catalog, session] = await Promise.all([
        repositoryRequest<{ games: RepositoryGame[] }>("/games"),
        repositoryRequest<{ admin: boolean }>("/session"),
      ]);
      setEntries(catalog.games);
      setAdmin(session.admin);
      setError("");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const upload = async (list: FileList | null) => {
    if (!list) return;
    const selected = Array.from(list).filter((f) => /\.jar$/i.test(f.name));
    if (!selected.length) {
      setError("Виберіть JAR або папку з іграми.");
      return;
    }
    await run("upload", async () => {
      let added = 0,
        duplicates = 0;
      const failed: string[] = [];
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        setNotice(`Обробка ${i + 1}/${selected.length}: ${file.name}`);
        try {
          const result = await repositoryRequest<{ duplicate: boolean }>(
            "/games?filename=" + encodeURIComponent(file.name),
            {
              method: "POST",
              headers: { "Content-Type": "application/java-archive" },
              body: file,
            },
          );
          if (result.duplicate) duplicates++;
          else added++;
        } catch (e) {
          failed.push(file.name + ": " + (e as Error).message);
        }
      }
      await load();
      setNotice(`Додано чернеток: ${added}. Уже в каталозі: ${duplicates}.`);
      if (failed.length) setError(failed.join("\n"));
    });
  };
  const visible = entries
    .filter(
      (g) =>
        ((manage && admin) || g.published) &&
        (!genre || g.genre === genre) &&
        `${g.title} ${g.metadata.vendor} ${g.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) ||
        a.title.localeCompare(b.title, "uk"),
    );
  return (
    <div className="content repository-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">НОВІ ІГРИ. ОДИН ДОТИК.</p>
          <h1>
            <Store /> Магазин ігор
          </h1>
          <p className="muted">
            Встановіть у свій профіль. Гра та збереження залишаться на пристрої.
          </p>
        </div>
        <button onClick={() => setManage(!manage)}>
          <ShieldCheck size={18} />
          {manage ? "До магазину" : "Адміністрування"}
        </button>
      </div>
      {manage && !admin && (
        <form
          className="repository-login panel"
          onSubmit={(e) => {
            e.preventDefault();
            void run("login", async () => {
              await repositoryRequest("/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
              });
              setPassword("");
              await load();
            });
          }}
        >
          <h2>Вхід адміністратора</h2>
          <p className="muted">
            Пароль знаходиться у приватному файлі на сервері. Локальний ігровий
            профіль не надає прав адміністратора.
          </p>
          <label>
            Пароль адміністратора
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={!!busy}>
            Увійти
          </button>
        </form>
      )}
      {manage && admin && (
        <section className="panel repository-admin">
          <div>
            <h2>Майстерня каталогу</h2>
            <p className="muted">
              JAR аналізується автоматично. Нові ігри спершу потрапляють у
              чернетки.
            </p>
          </div>
          <div className="repository-actions">
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => files.current?.click()}
            >
              <Upload size={18} />
              Додати JAR
            </button>
            <button disabled={!!busy} onClick={() => folder.current?.click()}>
              Імпортувати папку
            </button>
            {entries.some((e) => !e.published) && (
              <button
                disabled={!!busy}
                onClick={() =>
                  void run("publish", async () => {
                    const drafts = entries.filter((e) => !e.published);
                    for (let i = 0; i < drafts.length; i++) {
                      setNotice(
                        `Публікація ${i + 1}/${drafts.length}: ${drafts[i].title}`,
                      );
                      await repositoryRequest("/games/" + drafts[i].id, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ published: true }),
                      });
                    }
                    await load();
                    setNotice(`Опубліковано ігор: ${drafts.length}.`);
                  })
                }
              >
                Опублікувати всі чернетки (
                {entries.filter((e) => !e.published).length})
              </button>
            )}
            <button
              disabled={!!busy}
              onClick={() =>
                void run("logout", async () => {
                  await repositoryRequest("/session", { method: "DELETE" });
                  setManage(false);
                  await load();
                })
              }
            >
              <LogOut size={17} />
              Вийти
            </button>
          </div>
          <input
            ref={files}
            type="file"
            multiple
            accept=".jar"
            hidden
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={folder}
            type="file"
            multiple
            hidden
            {...{ webkitdirectory: "" }}
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </section>
      )}
      {error && !editing && (
        <div className="repository-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="repository-notice" role="status">
          {notice}
        </p>
      )}
      <div className="repository-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Пошук у магазині"
            placeholder="Назва, розробник або тег…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Жанр гри"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        >
          <option value="">Усі жанри</option>
          {Array.from(
            new Set(
              entries
                .filter((g) => g.published || (manage && admin))
                .map((g) => g.genre),
            ),
          )
            .sort()
            .map((g) => (
              <option key={g}>{g}</option>
            ))}
        </select>
        <button
          aria-label="Оновити каталог"
          disabled={loading || !!busy}
          onClick={() => void load()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {loading ? (
        <p role="status">Завантаження каталогу…</p>
      ) : !visible.length ? (
        <section className="panel repository-empty">
          <Gamepad2 size={42} />
          <h2>
            {error
              ? "Магазин зараз недоступний"
              : "Тут з’являться нові пригоди"}
          </h2>
          <p className="muted">
            {error
              ? "Уже встановлені ігри доступні у бібліотеці, зокрема без інтернету."
              : "Спробуйте інший пошук або додайте першу гру через адмінку."}
          </p>
        </section>
      ) : (
        <div className="repository-grid">
          {visible.map((entry) => {
            const installed = games.find((g) => g.hash === entry.id);
            return (
              <article className="repository-card" key={entry.id}>
                <div className="repository-cover">
                  {entry.hasIcon ? (
                    <img
                      src={`${repositoryUrl}/games/${entry.id}/icon`}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <Gamepad2 size={48} />
                  )}
                  <div>
                    <span className="badge">{entry.genre}</span>
                    {entry.featured && <Star size={18} />}
                    <h2>{entry.title}</h2>
                    <p>{entry.metadata.vendor}</p>
                  </div>
                </div>
                <div className="repository-card-body">
                  <div className="repository-specs">
                    <span>{entry.screen.join(" × ")}</span>
                    <span>
                      {entry.size < 1024 * 1024
                        ? Math.ceil(entry.size / 1024) + " КБ"
                        : (entry.size / 1024 / 1024).toFixed(1) + " МБ"}
                    </span>
                    <span>v{entry.metadata.version}</span>
                  </div>
                  <p>
                    {entry.description || "Класика Java ME для вашої колекції."}
                  </p>
                  <div className="repository-tags">
                    {entry.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                  {manage && admin ? (
                    <div className="repository-actions">
                      <span
                        className={"badge " + (entry.published ? "" : "draft")}
                      >
                        {entry.published ? "Опубліковано" : "Чернетка"}
                      </span>
                      <button
                        disabled={!!busy}
                        onClick={() => setEditing(structuredClone(entry))}
                      >
                        Редагувати
                      </button>
                    </div>
                  ) : (
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() =>
                        installed
                          ? open(installed.id)
                          : void run(entry.id, async () => {
                              await installRepositoryGame(profileId, entry);
                              setNotice(
                                `«${entry.title}» додано до вашої бібліотеки.`,
                              );
                            })
                      }
                    >
                      {busy === entry.id ? (
                        "Встановлення…"
                      ) : installed ? (
                        "Відкрити гру"
                      ) : (
                        <>
                          <Download size={17} />
                          Встановити
                        </>
                      )}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editing && (
        <RepositoryEditor
          entry={editing}
          error={error}
          busy={!!busy}
          close={() => setEditing(null)}
          save={(changes) =>
            void run("edit", async () => {
              await repositoryRequest("/games/" + editing.id, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(changes),
              });
              setEditing(null);
              await load();
              setNotice("Зміни каталогу збережено. JAR не змінювався.");
            })
          }
          remove={() =>
            void run("delete", async () => {
              await repositoryRequest("/games/" + editing.id, {
                method: "DELETE",
              });
              setEditing(null);
              await load();
              setNotice(
                "Гру видалено з магазину. Встановлені копії на пристроях залишаються.",
              );
            })
          }
        />
      )}
    </div>
  );
}
function RepositoryEditor({
  entry,
  error,
  busy,
  close,
  save,
  remove,
}: {
  entry: RepositoryGame;
  error: string;
  busy: boolean;
  close: () => void;
  save: (data: unknown) => void;
  remove: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [draft, setDraft] = useState(entry),
    [tags, setTags] = useState(entry.tags.join(", ")),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="repository-editor"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="modal-head">
        <h2>Редагування гри</h2>
        <button aria-label="Закрити редактор" disabled={busy} onClick={close}>
          <X />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({
            title: draft.title,
            genre: draft.genre,
            description: draft.description,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            screen: draft.screen,
            published: draft.published,
            featured: draft.featured,
          });
        }}
      >
        {error && <p role="alert" className="repository-error">{error}</p>}
        <label>
          Назва гри
          <input
            required
            maxLength={160}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          Жанр
          <input
            list="repository-genres"
            aria-label="Жанр"
            required
            maxLength={60}
            value={draft.genre}
            onChange={(e) => setDraft({ ...draft, genre: e.target.value })}
          />
          <datalist id="repository-genres">
            {[
              "Екшн",
              "Пригоди",
              "Перегони",
              "RPG",
              "Стратегії",
              "Спорт",
              "Аркади",
              "Головоломки",
              "Інше",
            ].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </datalist>
        </label>
        <label>
          Опис
          <textarea
            maxLength={4000}
            rows={4}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
        <label>
          Теги через кому
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <div className="repository-dimensions">
          {(["Ширина екрана", "Висота екрана"] as const).map((label, index) => (
            <label key={label}>
              {label}
              <input
                type="number"
                min={64}
                max={1024}
                required
                value={draft.screen[index]}
                onChange={(e) => {
                  const screen: [number, number] = [...draft.screen];
                  screen[index] = +e.target.value;
                  setDraft({ ...draft, screen });
                }}
              />
            </label>
          ))}
        </div>
        <small>{entry.compatibility.screen.evidence}</small>
        <label className="repository-check">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) =>
              setDraft({ ...draft, published: e.target.checked })
            }
          />
          Опублікувати у магазині
        </label>
        <label className="repository-check">
          <input
            type="checkbox"
            checked={draft.featured}
            onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
          />
          Рекомендована гра
        </label>
        <details>
          <summary>Дані з MIDlet</summary>
          <pre>
            {JSON.stringify(
              { filename: entry.filename, sha256: entry.id, ...entry.metadata },
              null,
              2,
            )}
          </pre>
        </details>
        <div className="repository-editor-footer">
          <button className="primary" disabled={busy}>
            Зберегти зміни
          </button>
          <button type="button" disabled={busy} onClick={close}>
            Скасувати
          </button>
        </div>
      </form>
      <div className="repository-delete">
        {confirm ? (
          <>
            <p>Видалити «{entry.title}» зі сховища назавжди?</p>
            <button className="danger" disabled={busy} onClick={remove}>
              Так, видалити гру
            </button>
            <button disabled={busy} onClick={() => setConfirm(false)}>
              Залишити
            </button>
          </>
        ) : (
          <button
            className="danger"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Видалити з репозиторію
          </button>
        )}
      </div>
    </dialog>
  );
}
