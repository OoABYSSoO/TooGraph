import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viteConfigSource = readFileSync(resolve(__dirname, "vite.config.ts"), "utf8");

test("vite dev server accepts the external frontend host", () => {
  assert.match(viteConfigSource, /allowedHosts:\s*\[[\s\S]*"web\.subsume-abyss0\.online"/);
});

test("vite dev server proxies api requests to the local backend", () => {
  assert.match(viteConfigSource, /INTERNAL_API_BASE_URL/);
  assert.match(viteConfigSource, /proxy:\s*\{[\s\S]*"\/api"/);
  assert.match(viteConfigSource, /target:\s*backendTarget/);
});
