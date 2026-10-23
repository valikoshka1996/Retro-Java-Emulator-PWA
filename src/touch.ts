import type { TouchControlsConfiguration } from "./types";
export const defaultTouchControls = (): TouchControlsConfiguration => ({
  theme: "graphite",
  width: 272,
  keyHeight: 38,
  gap: 4,
  radius: 9,
  showLetters: true,
  align: "center",
});
export const touchLimits = {
  width: [200, 360],
  keyHeight: [32, 56],
  gap: [2, 10],
  radius: [2, 20],
} as const;
export function validateTouchControls(value: TouchControlsConfiguration) {
  if (
    !value ||
    !["graphite", "mint", "violet", "light"].includes(value.theme) ||
    !["left", "center", "right"].includes(value.align) ||
    typeof value.showLetters !== "boolean"
  )
    throw Error("Некоректний вигляд екранної клавіатури.");
  for (const name of Object.keys(touchLimits) as (keyof typeof touchLimits)[]) {
    const [min, max] = touchLimits[name];
    if (
      !Number.isInteger(value[name]) ||
      value[name] < min ||
      value[name] > max
    )
      throw Error("Розміри екранної клавіатури поза допустимими межами.");
  }
}
// Older libraries and profile archives have no touchControls field.
export function normalizeTouchControls(
  value?: TouchControlsConfiguration,
): TouchControlsConfiguration {
  if (!value) return defaultTouchControls();
  try {
    validateTouchControls(value);
    return { ...value };
  } catch {
    return defaultTouchControls();
  }
}
export function touchPreset(
  name: "compact" | "classic" | "large",
): TouchControlsConfiguration {
  const base = defaultTouchControls();
  if (name === "compact")
    return { ...base, width: 248, keyHeight: 34, gap: 3, radius: 7 };
  if (name === "large")
    return { ...base, width: 320, keyHeight: 48, gap: 6, radius: 12 };
  return base;
}
