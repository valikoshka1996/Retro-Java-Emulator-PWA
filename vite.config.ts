import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pwaShell } from "./build/pwa";
export default defineConfig({
  plugins: [react(), pwaShell()],
  optimizeDeps: { entries: ["index.html"] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/repository": {
        target: "http://127.0.0.1:8081",
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api/repository": {
        target: "http://127.0.0.1:8081",
        changeOrigin: false,
      },
    },
  },
});
