import type { Action, EmulatorConfiguration, KeyboardMapping } from "./types";
import { defaultTouchControls, validateTouchControls } from "./touch";
export const actions: Action[] = [
  "up",
  "down",
  "left",
  "right",
  "fire",
  "softLeft",
  "softRight",
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
export const labels: Record<Action, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  fire: "OK",
  softLeft: "Ліва soft",
  softRight: "Права soft",
  star: "*",
  hash: "#",
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
};
export const engineCodes: KeyboardMapping = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  fire: "Enter",
  softLeft: "F1",
  softRight: "F2",
  star: "KeyE",
  hash: "KeyR",
  "0": "Digit0",
  "1": "Digit1",
  "2": "Digit2",
  "3": "Digit3",
  "4": "Digit4",
  "5": "Digit5",
  "6": "Digit6",
  "7": "Digit7",
  "8": "Digit8",
  "9": "Digit9",
};
export function keyboardPreset(name: string): KeyboardMapping {
  const keys = { ...engineCodes };
  if (name === "Sony Ericsson") {
    keys.softLeft = "KeyQ";
    keys.softRight = "KeyW";
  }
  return keys;
}
export const defaultConfiguration = (): EmulatorConfiguration => ({
  mode: "auto",
  width: 240,
  height: 320,
  phone: "Nokia",
  sound: true,
  volume: 80,
  integerScale: true,
  forceFullscreen: false,
  queuedPaint: false,
  textureDisableFilter: false,
  fps: 0,
  midlet: "",
  keys: keyboardPreset("Nokia Classic"),
  touchControls: defaultTouchControls(),
});
export function validateConfiguration(c: EmulatorConfiguration) {
  if (
    c.displayRotation !== undefined &&
    ![0, 90, 180, 270].includes(c.displayRotation)
  )
    throw Error("Непідтримуваний поворот екрана.");
  if (
    c.inputMode !== undefined &&
    !["both", "keypad", "touch"].includes(c.inputMode)
  )
    throw Error("Непідтримуваний режим керування.");
  if (c.touchControls !== undefined) validateTouchControls(c.touchControls);
  if (
    !Number.isInteger(c.width) ||
    !Number.isInteger(c.height) ||
    c.width < 64 ||
    c.height < 64 ||
    c.width > 1024 ||
    c.height > 1024
  )
    throw Error("Роздільність має бути від 64 до 1024 px.");
  if (
    !["Standard", "Nokia", "SonyEricsson", "Motorola", "Siemens"].includes(
      c.phone,
    )
  )
    throw Error("Непідтримуваний телефон.");
  if (
    !Number.isFinite(c.volume) ||
    c.volume < 0 ||
    c.volume > 100 ||
    ![0, 15, 30, 60].includes(c.fps)
  )
    throw Error("Некоректні налаштування звуку або FPS.");
  const values = actions.map((a) => c.keys[a]);
  if (
    values.some((v) => typeof v !== "string" || !v) ||
    new Set(values).size !== values.length
  )
    throw Error("Клавіші мають бути унікальними.");
}
