import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("public/engine", { recursive: true });
for (const name of ["freej2me-web.jar", "libjs", "libmidi", "libmedia", "src"])
  await cp("vendor/freej2me-web/web/" + name, "public/engine/" + name, {
    recursive: true,
  });
await cp("vendor/freej2me-web/LICENSE", "public/engine/LICENSE");
let main = (
  await readFile("vendor/freej2me-web/web/src/main.js", "utf8")
).replaceAll("\r\n", "\n");
main =
  'import { bridge } from "../bridge.js";\nimport { loadRuntimeLibraries } from "../runtime.js";\nimport { installOfflineRuntimeCache } from "../offline.js";\n' +
  main;
main = main.replace(
  "const isDown = e.type",
  "if (bridge.keyboard(e)) return;\n        const isDown = e.type",
);
const launchStart = main.indexOf("    let args;");
const launchEnd = main.indexOf("    FreeJ2ME.main(args)", launchStart);
if (launchStart < 0 || launchEnd < 0)
  throw Error(
    "Upstream launch block changed; review integration before building.",
  );
main =
  main.slice(0, launchStart) +
  '    await bridge.prepare(lib);\n    const args = ["app", bridge.appId];\n    fractionScale = !bridge.integerScale;\n\n' +
  main.slice(launchEnd);
main = main.replace(
  'cheerpjRunLibrary(cheerpjWebRoot+"/freej2me-web.jar")',
  "loadRuntimeLibraries(message => bridge.stage(message))",
);
if (!main.includes("await loadRuntimeLibraries("))
  throw Error(
    "Upstream library loader changed; review the runtime integration.",
  );
main = main.replace(
  'document.getElementById("loading").textContent = "Loading CheerpJ...";',
  'bridge.stage("Ініціалізація CheerpJ та звуку…");',
);
main = main
  .replace("location.reload();", "bridge.restart();")
  .replace("location.href = './';", "bridge.exit();");
main = main.replace(
  "autoscale();\n            },",
  "autoscale();\n                bridge.ready();\n            },",
);
main = main.replace(
  /FreeJ2ME\.main\(args\)\.catch\(e => \{[\s\S]*?\n    \}\);/,
  "FreeJ2ME.main(args).catch(e => bridge.error(e));",
);
main = main.replace("\ninit();", "\ninit().catch(e => bridge.error(e));");
// Application input owns physical mappings and key release across focus changes.
main = main.replace(
  "setListeners();",
  "setListeners();\n    bridge.attach(display, evtQueue);",
);
main = main.replace("console.log('queuin event');", "");
// Keep a fractional fallback if a small mobile viewport cannot fit one native pixel scale.
main = main.replace("scale = scale|0;", "scale = Math.floor(scale) || scale;");
main = main.replace(
  "    const lib = await loadRuntimeLibraries",
  "    await installOfflineRuntimeCache(message => bridge.error(message));\n    const lib = await loadRuntimeLibraries",
);
main = main.replace(
  "setTimeout(() => display.focus(), 10);",
  "// Parent UI retains keyboard focus when opening controls or dialogs.",
);
await writeFile("public/engine/src/main.js", main);
await cp("engine/bridge.js", "public/engine/bridge.js");
await cp("engine/runtime.js", "public/engine/runtime.js");
await cp("engine/offline.js", "public/engine/offline.js");
await cp("engine/player.html", "public/engine/player.html");
const result = spawnSync(process.execPath, ["scripts/build-java.mjs"], {
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status || 1);
