import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRepository } from "../../dist-repository/server.mjs";
const directory = await mkdtemp(join(tmpdir(), "retro-store-browser-"));
process.env.ADMIN_PASSWORD = "test-only-password-0123456789";
const server = await startRepository({
  directory,
  port: 8081,
  host: "127.0.0.1",
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(async () => {
      await rm(directory, { recursive: true, force: true });
      process.exit(0);
    }),
  );
