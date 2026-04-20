import path from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const backendTarget = process.env.INTERNAL_API_BASE_URL || "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: [
      "web.subsume-abyss0.online",
    ],
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
