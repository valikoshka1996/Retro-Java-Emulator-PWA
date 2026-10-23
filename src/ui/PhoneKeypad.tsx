import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Settings, RotateCcw, Check } from "lucide-react";
import type { Action, TouchControlsConfiguration } from "../types";
import type { EmulatorAdapter } from "../emulator";
import { labels } from "../config";
import {
  normalizeTouchControls,
  touchPreset,
  validateTouchControls,
} from "../touch";
import { saveTouchControls } from "../db";

const letters: Partial<Record<Action, string>> = {
  "0": "+",
  "1": "",
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
};
const navigation: (Action | null)[] = [
  "softLeft",
  "up",
  "softRight",
  "left",
  "fire",
  "right",
  null,
  "down",
  null,
];
const numbers: Action[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "star",
  "0",
  "hash",
];
type KeySender = Pick<EmulatorAdapter, "sendKeyDown" | "sendKeyUp">;

function TouchKey({
  action,
  adapter,
  disabled,
  showLetters,
  preview,
}: {
  action: Action;
  adapter?: KeySender;
  disabled: boolean;
  showLetters: boolean;
  preview?: boolean;
}) {
  const pointers = useRef(new Set<number>());
  const keyboardHeld = useRef(false);
  const releaseKeyboard = () => {
    if (keyboardHeld.current) {
      keyboardHeld.current = false;
      adapter?.sendKeyUp(action, "button:" + action);
    }
  };
  const releasePointer = (id: number) => {
    if (pointers.current.delete(id)) adapter?.sendKeyUp(action, "touch:" + id);
  };
  useEffect(() => {
    const release = () => {
      for (const id of pointers.current)
        adapter?.sendKeyUp(action, "touch:" + id);
      pointers.current.clear();
      releaseKeyboard();
    };
    if (disabled) release();
    return release;
  }, [adapter, action, disabled]);
  const display =
    action === "softLeft"
      ? "Ліва"
      : action === "softRight"
        ? "Права"
        : labels[action];
  return (
    <button
      type="button"
      className={"phone-key key-" + action}
      disabled={disabled}
      tabIndex={preview ? -1 : undefined}
      aria-label={labels[action]}
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        event.preventDefault();
        pointers.current.add(event.pointerId);
        event.currentTarget.setPointerCapture(event.pointerId);
        adapter?.sendKeyDown(action, "touch:" + event.pointerId);
      }}
      onPointerUp={(event) => releasePointer(event.pointerId)}
      onLostPointerCapture={(event) => releasePointer(event.pointerId)}
      onPointerCancel={(event) => releasePointer(event.pointerId)}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (!keyboardHeld.current) {
            keyboardHeld.current = true;
            adapter?.sendKeyDown(action, "button:" + action);
          }
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          releaseKeyboard();
        }
      }}
      onBlur={releaseKeyboard}
    >
      <span>{display}</span>
      {showLetters && letters[action] && <small>{letters[action]}</small>}
    </button>
  );
}
export function PhoneKeypad({
  configuration,
  adapter,
  disabled = false,
  preview = false,
}: {
  configuration?: TouchControlsConfiguration;
  adapter?: KeySender;
  disabled?: boolean;
  preview?: boolean;
}) {
  const c = normalizeTouchControls(configuration);
  const style = {
    "--pad-width": c.width + "px",
    "--key-height": c.keyHeight + "px",
    "--requested-gap": c.gap + "px",
    "--key-radius": c.radius + "px",
  } as CSSProperties;
  return (
    <div className={"phone-keypad-align align-" + c.align}>
      <div
        className={
          "phone-keypad theme-" + c.theme + (preview ? " keypad-preview" : "")
        }
        style={style}
        role={preview ? undefined : "group"}
        aria-label={preview ? undefined : "Екранна клавіатура телефона"}
        aria-hidden={preview || undefined}
      >
        <div className="phone-navigation">
          {navigation.map((action, index) =>
            action ? (
              <TouchKey
                key={action}
                action={action}
                adapter={adapter}
                disabled={disabled || preview}
                showLetters={false}
                preview={preview}
              />
            ) : (
              <span key={index} />
            ),
          )}
        </div>
        <div className="phone-numpad">
          {numbers.map((action) => (
            <TouchKey
              key={action}
              action={action}
              adapter={adapter}
              disabled={disabled || preview}
              showLetters={c.showLetters}
              preview={preview}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TouchControlsEditor({
  gameId,
  value,
  onSaved,
}: {
  gameId: string;
  value?: TouchControlsConfiguration;
  onSaved?: (c: TouchControlsConfiguration) => void;
}) {
  const [draft, setDraft] = useState(() => normalizeTouchControls(value)),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const patch = (change: Partial<TouchControlsConfiguration>) => {
    setDraft((c) => ({ ...c, ...change }));
    setSaved(false);
  };
  return (
    <form
      className="touch-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        void (async () => {
          try {
            validateTouchControls(draft);
            await saveTouchControls(gameId, draft);
            setSaved(true);
            onSaved?.(draft);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <p className="muted small">
        Навігація зверху, цифрові клавіші під нею. Вигляд зберігається окремо
        для цієї гри та входить в архів профілю.
      </p>
      <div className="touch-presets">
        {(
          [
            ["compact", "Компактна"],
            ["classic", "Класична"],
            ["large", "Великі кнопки"],
          ] as const
        ).map(([preset, label]) => (
          <button
            className="secondary"
            type="button"
            key={preset}
            onClick={() => {
              setDraft(touchPreset(preset));
              setSaved(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="touch-editor-grid">
        <div className="touch-editor-fields">
          <label>
            Тема клавіатури
            <select
              value={draft.theme}
              onChange={(e) =>
                patch({
                  theme: e.target.value as TouchControlsConfiguration["theme"],
                })
              }
            >
              <option value="graphite">Графіт</option>
              <option value="mint">М’ята</option>
              <option value="violet">Фіолетова</option>
              <option value="light">Світла</option>
            </select>
          </label>
          {(
            [
              ["width", "Ширина клавіатури", 200, 360],
              ["keyHeight", "Висота кнопок", 32, 56],
              ["gap", "Відступ між кнопками", 2, 10],
              ["radius", "Заокруглення кнопок", 2, 20],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <output>{draft[key]} px</output>
              <input
                aria-label={label}
                type="range"
                min={min}
                max={max}
                value={draft[key]}
                onChange={(event) =>
                  patch({ [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
          <label>
            Розташування
            <select
              value={draft.align}
              onChange={(event) =>
                patch({
                  align: event.target
                    .value as TouchControlsConfiguration["align"],
                })
              }
            >
              <option value="center">По центру</option>
              <option value="left">Ліворуч</option>
              <option value="right">Праворуч</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.showLetters}
              onChange={(event) => patch({ showLetters: event.target.checked })}
            />
            Літери під цифрами
          </label>
        </div>
        <div className="touch-preview">
          <span className="eyebrow">ПЕРЕДПЕРЕГЛЯД</span>
          <PhoneKeypad configuration={draft} preview />
        </div>
      </div>
      {error && (
        <p className="danger" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="primary" disabled={busy}>
          {saved ? <Check size={16} /> : <Settings size={16} />}{" "}
          {saved ? "Вигляд збережено" : "Зберегти вигляд"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setDraft(touchPreset("classic"));
            setSaved(false);
          }}
        >
          <RotateCcw size={16} />
          Скинути
        </button>
      </div>
    </form>
  );
}
