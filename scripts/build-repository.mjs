import { build } from "esbuild";
await build({
  entryPoints: ["server/main.mjs"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "dist-repository/server.mjs",
});
