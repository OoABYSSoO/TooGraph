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

test("EditorWorkspaceShell wires canvas node-creation intents into a dedicated creation menu component", () => {
  assert.match(componentSource, /import EditorNodeCreationMenu from "\.\/EditorNodeCreationMenu\.vue";/);
  assert.match(componentSource, /@open-node-creation-menu="openNodeCreationMenuForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /@create-node-from-file="createNodeFromFileForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /<EditorNodeCreationMenu/);
  assert.match(componentSource, /@select-entry="createNodeFromMenuForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /@close="closeNodeCreationMenu\(tab\.tabId\)"/);
});

test("EditorWorkspaceShell loads persisted presets for the node creation menu", () => {
  assert.match(componentSource, /import \{ fetchPresets \} from "@\/api\/presets";/);
  assert.match(componentSource, /const persistedPresets = ref<PresetDocument\[\]>\(\[\]\);/);
  assert.match(componentSource, /async function loadPersistedPresets\(\)/);
  assert.match(componentSource, /persistedPresets\.value = await fetchPresets\(\)/);
});

test("EditorWorkspaceShell routes menu selections and dropped files through the node-creation execution helpers", () => {
  assert.match(componentSource, /import \{ createNodeFromCreationEntry, createNodeFromDroppedFile \} from "\.\/nodeCreationExecution\.ts";/);
  assert.match(componentSource, /const result = createNodeFromCreationEntry\(document, \{/);
  assert.match(componentSource, /const result = await createNodeFromDroppedFile\(document, \{/);
  assert.match(componentSource, /markDocumentDirty\(tabId, result\.document\)/);
  assert.match(componentSource, /focusNodeForTab\(tabId, result\.createdNodeId\)/);
  assert.match(componentSource, /closeNodeCreationMenu\(tabId\)/);
});
