import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/repository",
  testMatch: "*.spec.ts",
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4175", headless: true },
  webServer: [
    {
      command: "node tests/repository/server.mjs",
      url: "http://127.0.0.1:8081/healthz",
      reuseExistingServer: false,
    },
    {
      command: "npm run preview -- --port 4175",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: false,
    },
  ],
});
