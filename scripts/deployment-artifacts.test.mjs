import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readText(path) {
  return readFileSync(resolve(rootDir, path), "utf8");
}

test("Docker packaging runs the standard single-port start flow with persistent data outside the image", () => {
  const dockerfile = readText("Dockerfile");

  assert.match(dockerfile, /FROM node:22-bookworm-slim AS frontend-build/);
  assert.match(dockerfile, /npm ci/);
  assert.match(dockerfile, /npm run build/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS runtime/);
  assert.match(dockerfile, /python3 -m venv \/opt\/toograph\/venv/);
  assert.match(dockerfile, /ENV TOOGRAPH_HOST=0\.0\.0\.0/);
  assert.match(dockerfile, /ENV PORT=3477/);
  assert.match(dockerfile, /VOLUME \["\/app\/backend\/data"\]/);
  assert.match(dockerfile, /EXPOSE 3477/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /CMD \["node", "scripts\/start\.mjs"\]/);
});

test("Docker ignore file keeps local runtime state and generated build output out of images", () => {
  const dockerignore = readText(".dockerignore");

  for (const pattern of [
    ".git",
    "node_modules",
    "frontend/node_modules",
    "frontend/dist",
    "backend/data",
    "buddy_home",
    ".toograph_*",
    ".dev_*",
    ".worktrees",
  ]) {
    assert.match(dockerignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
});

test("consolidated documentation describes source and Docker paths without model environment variables", () => {
  assert.equal(existsSync(resolve(rootDir, "docs", "README.md")), true);
  const docs = readText("docs/README.md");
  const readme = readText("README.md");

  assert.match(docs, /npm start/);
  assert.match(docs, /docker build -t toograph:local \./);
  assert.match(docs, /docker run --rm -p 3477:3477/);
  assert.match(docs, /TOOGRAPH_HOST=0\.0\.0\.0/);
  assert.match(docs, /\/app\/backend\/data/);
  assert.match(docs, /Model Providers/);
  assert.doesNotMatch(docs, /OPENAI_API_KEY/);
  assert.match(readme, /docs\/README\.md/);
});
