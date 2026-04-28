import path from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const backendTarget = process.env.INTERNAL_API_BASE_URL || "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.split(path.sep).join("/");
          if (!normalizedId.includes("node_modules")) {
            return undefined;
          }
          if (
            normalizedId.includes("/node_modules/@vue/") ||
            normalizedId.includes("/node_modules/vue/") ||
            normalizedId.includes("/node_modules/vue-router/") ||
            normalizedId.includes("/node_modules/pinia/") ||
            normalizedId.includes("/node_modules/vue-i18n/") ||
            normalizedId.includes("/node_modules/@intlify/")
          ) {
            return "vendor-vue";
          }
          if (normalizedId.includes("/node_modules/element-plus/") || normalizedId.includes("/node_modules/@element-plus/")) {
            return "vendor-element-plus";
          }
          return undefined;
        },
      },
    },
  },
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
