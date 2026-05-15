import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("SandboxedHtmlFrame renders srcdoc HTML inside a locked-down iframe", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "SandboxedHtmlFrame.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /<iframe[\s\S]*:srcdoc="source"/);
  assert.match(componentSource, /sandbox=""/);
  assert.match(componentSource, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(componentSource, /allow-scripts/);
  assert.doesNotMatch(componentSource, /allow-same-origin/);
});
