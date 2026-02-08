import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorWorkspaceShell.vue"), "utf8");

test("EditorWorkspaceShell renders workspace panes without reka-ui tab primitives", () => {
  assert.doesNotMatch(componentSource, /from "reka-ui"/);
  assert.doesNotMatch(componentSource, /<TabsRoot/);
  assert.doesNotMatch(componentSource, /<TabsContent/);
  assert.match(componentSource, /<div[\s\S]*v-for="tab in workspace\.tabs"/);
  assert.match(componentSource, /v-show="tab\.tabId === workspace\.activeTabId"/);
  assert.match(componentSource, /editor-workspace-shell__editor--active/);
});
