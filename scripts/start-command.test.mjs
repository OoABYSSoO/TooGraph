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

test("start launcher supports an explicit bind host for container deployment", () => {
  const startSource = readFileSync(resolve(rootDir, "scripts", "start.mjs"), "utf8");

  assert.match(startSource, /process\.env\.TOOGRAPH_HOST/);
  assert.match(startSource, /process\.env\.HOST/);
  assert.match(startSource, /const appBindHost =/);
  assert.match(startSource, /"--host",\s*appBindHost/);
  assert.match(startSource, /appPublicHost/);
});

test("start launcher installs project dependencies before build and server start", () => {
  const startSource = readFileSync(resolve(rootDir, "scripts", "start.mjs"), "utf8");

  assert.match(startSource, /resolveFrontendDependencyPlan/);
  assert.match(startSource, /resolveBackendDependencyPlan/);
  assert.match(startSource, /ensureFrontendDependencies/);
  assert.match(startSource, /ensureBackendDependencies/);
  assert.match(startSource, /await ensureFrontendDependencies\(\);\s+const python = await ensureBackendDependencies\(basePython\);\s+await buildFrontend\(\);/);
});

test("start launcher uses temporary selected download sources for dependency installs", () => {
  const startSource = readFileSync(resolve(rootDir, "scripts", "start.mjs"), "utf8");

  assert.match(startSource, /selectDownloadSource/);
  assert.match(startSource, /kind:\s*"npm"/);
  assert.match(startSource, /kind:\s*"pip"/);
  assert.match(startSource, /\["install",\s*"--registry",\s*npmSource\.url\]/);
  assert.match(startSource, /\[\s*"-m",\s*"pip",\s*"install",\s*"--index-url",\s*pipSource\.url/);
  assert.match(startSource, /logDownloadSource\("npm install source"/);
  assert.match(startSource, /logDownloadSource\("pip install source"/);
});
