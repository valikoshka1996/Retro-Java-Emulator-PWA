import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/webkit",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  use: {
    browserName: "webkit",
    baseURL: "http://127.0.0.1:5173",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
