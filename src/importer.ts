import { safeUnzip, binaryBlob } from "./archive";
import { defaultConfiguration } from "./config";
import type { GameCompatibility, GameMetadata, Phone } from "./types";
export function parseManifest(text: string): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  let key = "";
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith(" ") && key) {
      out[key] += line.slice(1);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon > 0) {
      key = line.slice(0, colon).trim();
      out[key] = line.slice(colon + 1).trim();
    } else key = "";
  }
  return out;
}
export class CompatibilityAnalyzer {
  static analyze(
    manifest: Record<string, string>,
    files: Record<string, Uint8Array>,
  ): GameCompatibility {
    const refs = Object.entries(files)
      .filter(([n]) => n.endsWith(".class"))
      .map(([, b]) => new TextDecoder("latin1").decode(b))
      .join("\n");
    const apis: string[] = [];
    for (const [pattern, label] of [
      ["javax/microedition/m3g", "M3G / JSR-184"],
      ["com/mascotcapsule", "Mascot Capsule v3"],
      ["com/nokia", "Nokia UI"],
      ["com/sony", "Sony Ericsson"],
      ["com/motorola", "Motorola"],
      ["com/samsung", "Samsung"],
      ["javax/wireless/messaging", "WMA"],
      ["javax/bluetooth", "Bluetooth"],
    ])
      if (refs.includes(pattern)) apis.push(label);
    let phone: Phone = "Nokia";
    let confidence = 0.35;
    let evidence = "Типове припущення; перевірте вручну.";
    for (const [api, p] of [
      ["Nokia UI", "Nokia"],
      ["Sony Ericsson", "SonyEricsson"],
      ["Motorola", "Motorola"],
    ] as const)
      if (apis.includes(api)) {
        phone = p;
        confidence = 0.8;
        evidence = `Посилання на ${api} у class-файлах.`;
      }
    const width = Number(
      manifest["Nokia-MIDlet-Original-Display-Size"]?.split(",")[0] ||
        manifest["MIDlet-Screen-Width"],
    );
    const height = Number(
      manifest["Nokia-MIDlet-Original-Display-Size"]?.split(",")[1] ||
        manifest["MIDlet-Screen-Height"],
    );
    const known =
      width >= 64 && width <= 1024 && height >= 64 && height <= 1024;
    const warnings = ["Статичний аналіз не гарантує сумісність."];
    if (apis.some((a) => ["Bluetooth", "WMA", "Samsung"].includes(a)))
      warnings.push("Виявлено API, для яких повна підтримка не гарантується.");
    if (apis.some((a) => a.includes("M3G") || a.includes("Mascot")))
      warnings.push("3D потребує WebGL 2; API перевіряються окремо.");
    return {
      apis,
      phone: { value: phone, confidence, evidence },
      screen: {
        value: known ? [width, height] : [240, 320],
        confidence: known ? 0.9 : 0.25,
        evidence: known ? "Параметри manifest/JAD." : "240 × 320 — припущення.",
      },
      warnings,
    };
  }
}
export async function analyzeJar(jar: Blob, filename: string, jad?: Blob) {
  if (
    !filename.toLowerCase().endsWith(".jar") ||
    jar.size === 0 ||
    jar.size > 32 * 1024 * 1024
  )
    throw Error("Виберіть JAR розміром до 32 МБ.");
  if (jad && jad.size > 256 * 1024) throw Error("JAD завеликий.");
  const bytes = new Uint8Array(await jar.arrayBuffer());
  const files = safeUnzip(bytes);
  const entry = Object.keys(files).find(
    (n) => n.toUpperCase() === "META-INF/MANIFEST.MF",
  );
  const manifest = {
    ...parseManifest(entry ? new TextDecoder().decode(files[entry]) : ""),
    ...parseManifest(jad ? await jad.text() : ""),
  };
  const midlets = Object.keys(manifest)
    .filter((k) => /^MIDlet-\d+$/.test(k))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
    .map((k) => {
      const [name, icon, className] = manifest[k]
        .split(",")
        .map((v) => v.trim());
      return { name, icon, className };
    });
  if (
    !midlets.length ||
    midlets.some(
      (m) =>
        !m.className || !files[m.className.replaceAll(".", "/") + ".class"],
    )
  )
    throw Error(
      "У JAR не знайдено коректного MIDlet. Додайте відповідний JAD.",
    );
  const metadata: GameMetadata = {
    name: manifest["MIDlet-Name"] || midlets[0].name || filename,
    vendor: manifest["MIDlet-Vendor"] || "Невідомий розробник",
    version: manifest["MIDlet-Version"] || "—",
    midp: manifest["MicroEdition-Profile"] || "Невідомо",
    cldc: manifest["MicroEdition-Configuration"] || "Невідомо",
    manifest,
    midlets,
  };
  const compatibility = CompatibilityAnalyzer.analyze(manifest, files);
  const configuration = defaultConfiguration();
  [configuration.width, configuration.height] = compatibility.screen.value;
  configuration.phone = compatibility.phone.value;
  configuration.midlet = midlets[0].className;
  const iconPath = (manifest["MIDlet-Icon"] || midlets[0].icon || "").replace(
    /^\//,
    "",
  );
  const iconBytes = files[iconPath];
  const icon =
    iconBytes &&
    iconBytes.length < 1024 * 1024 &&
    iconBytes[0] === 137 &&
    iconBytes[1] === 80
      ? binaryBlob(iconBytes, "image/png")
      : undefined;
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return { metadata, compatibility, configuration, hash, icon };
}
