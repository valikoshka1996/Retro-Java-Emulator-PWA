export interface Profile {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
}
export type Phone =
  "Standard" | "Nokia" | "SonyEricsson" | "Motorola" | "Siemens";
export type Action =
  | "up"
  | "down"
  | "left"
  | "right"
  | "fire"
  | "softLeft"
  | "softRight"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "star"
  | "hash";
export type KeyboardMapping = Record<Action, string>;
export interface TouchControlsConfiguration {
  theme: "graphite" | "mint" | "violet" | "light";
  width: number;
  keyHeight: number;
  gap: number;
  radius: number;
  showLetters: boolean;
  align: "left" | "center" | "right";
}
export interface EmulatorConfiguration {
  mode: "auto" | "advanced";
  width: number;
  height: number;
  phone: Phone;
  sound: boolean;
  volume: number;
  integerScale: boolean;
  forceFullscreen: boolean;
  queuedPaint: boolean;
  textureDisableFilter: boolean;
  fps: number;
  midlet: string;
  keys: KeyboardMapping;
  touchControls?: TouchControlsConfiguration;
}
export interface GameMetadata {
  name: string;
  vendor: string;
  version: string;
  midp: string;
  cldc: string;
  manifest: Record<string, string>;
  midlets: { name: string; icon: string; className: string }[];
}
export interface Detection<T> {
  value: T;
  confidence: number;
  evidence: string;
}
export interface GameCompatibility {
  apis: string[];
  phone: Detection<Phone>;
  screen: Detection<[number, number]>;
  warnings: string[];
}
export interface Game {
  id: string;
  profileId: string;
  hash: string;
  metadata: GameMetadata;
  compatibility: GameCompatibility;
  configuration: EmulatorConfiguration;
  icon?: Blob;
  favorite: boolean;
  importedAt: number;
  lastPlayed?: number;
}
export interface GameFile {
  id: string;
  jar: Blob;
  jad?: Blob;
  filename: string;
}
export interface GameSave {
  id: string;
  profileId: string;
  gameId: string;
  data: Blob;
  updatedAt: number;
  format: 1;
}
export interface SaveSlot {
  id: string;
  profileId: string;
  gameId: string;
  name: string;
  data: Blob;
  screenshot?: Blob;
  createdAt: number;
  format: 1;
}
export interface PlaySession {
  id: string;
  profileId: string;
  gameId: string;
  startedAt: number;
  endedAt?: number;
  seconds: number;
}
export interface EmulatorCapabilities {
  rms: boolean;
  backupSlots: boolean;
  snapshots: false;
  pause: false;
  screenshot: boolean;
  m3g: boolean;
  mascotCapsule: "v3";
  webgl2: boolean;
  volume: boolean;
}
