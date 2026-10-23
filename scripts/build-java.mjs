import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
await mkdir(".cache", { recursive: true });
const compiler = ".cache/ecj-4.6.1.jar";
try {
  await readFile(compiler);
} catch {
  const r = await fetch(
    "https://repo.maven.apache.org/maven2/org/eclipse/jdt/core/compiler/ecj/4.6.1/ecj-4.6.1.jar",
  );
  if (!r.ok) throw Error("Compiler download failed");
  await writeFile(compiler, new Uint8Array(await r.arrayBuffer()));
}
if (
  createHash("sha256")
    .update(await readFile(compiler))
    .digest("hex") !==
  "9cddda75f4a1b4469e73f44e7b61a3e897d0f657df4797f9106ffe88c4eeade0"
)
  throw Error("ECJ compiler integrity check failed");
await mkdir(".cache/classes", { recursive: true });
const result = spawnSync(
  "java",
  [
    "-jar",
    compiler,
    "-1.8",
    "-encoding",
    "UTF-8",
    "-cp",
    "vendor/freej2me-web/web/freej2me-web.jar",
    "-d",
    ".cache/classes",
    "java/RetroBridge.java",
    "java/RmsProbe.java",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
await mkdir("public/fixtures", { recursive: true });
await mkdir("public/engine", { recursive: true });
await writeFile(
  "public/engine/retro-bridge.jar",
  zipSync(
    {
      "retro/RetroBridge.class": new Uint8Array(
        await readFile(".cache/classes/retro/RetroBridge.class"),
      ),
    },
    { mtime: new Date("2000-01-01T00:00:00Z") },
  ),
);
const probe = {
  "META-INF/MANIFEST.MF": strToU8(
    "Manifest-Version: 1.0\r\nMIDlet-Name: RMS Probe\r\nMIDlet-Vendor: Java Retro\r\nMIDlet-Version: 1.0.0\r\nMIDlet-1: RMS Probe,,RmsProbe\r\nMicroEdition-Profile: MIDP-2.0\r\nMicroEdition-Configuration: CLDC-1.1\r\n\r\n",
  ),
};
for (const file of await readdir(".cache/classes"))
  if (file.startsWith("RmsProbe") && file.endsWith(".class"))
    probe[file] = new Uint8Array(await readFile(".cache/classes/" + file));
await writeFile(
  "public/fixtures/rms-probe.jar",
  zipSync(probe, { mtime: new Date("2000-01-01T00:00:00Z") }),
);
