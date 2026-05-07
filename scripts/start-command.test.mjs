import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("root package exposes npm start as the formal launcher without a dev alias", () => {
  const rootPackage = readJson(resolve(rootDir, "package.json"));

  assert.equal(rootPackage.scripts.start, "node scripts/start.mjs");
  assert.equal(Object.hasOwn(rootPackage.scripts, "dev"), false);
});

test("frontend package does not expose a separate vite dev launcher", () => {
  const frontendPackage = readJson(resolve(rootDir, "frontend", "package.json"));

  assert.equal(Object.hasOwn(frontendPackage.scripts, "dev"), false);
});
