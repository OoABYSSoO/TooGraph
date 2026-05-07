import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viteConfigSource = readFileSync(resolve(__dirname, "vite.config.ts"), "utf8");

test("vite config does not preserve the removed dev-server api proxy", () => {
  assert.doesNotMatch(viteConfigSource, /INTERNAL_API_BASE_URL/);
  assert.doesNotMatch(viteConfigSource, /proxy:\s*\{[\s\S]*"\/api"/);
});

test("vite production build splits framework and UI dependencies out of the entry chunk", () => {
  assert.match(viteConfigSource, /manualChunks\(id\)/);
  assert.match(viteConfigSource, /chunkSizeWarningLimit:\s*1000/);
  assert.match(viteConfigSource, /vendor-vue/);
  assert.match(viteConfigSource, /vendor-element-plus/);
  assert.match(viteConfigSource, /normalizedId\.includes\("node_modules"\)/);
  assert.match(viteConfigSource, /return undefined;/);
});
