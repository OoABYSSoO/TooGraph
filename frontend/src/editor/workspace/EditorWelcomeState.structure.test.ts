import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorWelcomeState.vue"), "utf8");

test("EditorWelcomeState exposes Python graph import before a workspace tab exists", () => {
  assert.match(componentSource, /import-python-graph/);
  assert.match(componentSource, /t\("editorWelcome\.importPython"\)/);
});
