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
  assert.match(componentSource, /import \{[\s\S]*fetchPresets[\s\S]*\} from "@\/api\/presets";/);
  assert.match(componentSource, /const persistedPresets = ref<PresetDocument\[\]>\(\[\]\);/);
  assert.match(componentSource, /async function loadPersistedPresets\(\)/);
  assert.match(componentSource, /persistedPresets\.value = await fetchPresets\(\)/);
});

test("EditorWorkspaceShell wires node top-action events into state updates, node deletion, and preset persistence", () => {
  assert.match(componentSource, /import \{ fetchPreset, fetchPresets, savePreset \} from "@\/api\/presets";/);
  assert.match(componentSource, /@update-node-metadata="updateNodeMetadataForTab\(tab\.tabId, \$event\.nodeId, \$event\.patch\)"/);
  assert.match(componentSource, /@rename-state="renameStateField\(tab\.tabId, \$event\.currentKey, \$event\.nextKey\)"/);
  assert.match(componentSource, /@update-state="updateStateField\(tab\.tabId, \$event\.stateKey, \$event\.patch\)"/);
  assert.match(componentSource, /@delete-node="deleteNodeForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /@save-node-preset="saveNodePresetForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /function updateNodeMetadataForTab\(tabId: string, nodeId: string, patch: Partial<Pick<GraphNode, "name" \| "description">>\)/);
  assert.match(componentSource, /async function saveNodePresetForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /function deleteNodeForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /persistedPresets\.value = \[savedPreset, \.\.\.persistedPresets\.value\.filter/);
});

test("EditorWorkspaceShell routes menu selections and dropped files through the node-creation execution helpers", () => {
  assert.match(componentSource, /import \{ createNodeFromCreationEntry, createNodeFromDroppedFile \} from "\.\/nodeCreationExecution\.ts";/);
  assert.match(componentSource, /const result = createNodeFromCreationEntry\(document, \{/);
  assert.match(componentSource, /const result = await createNodeFromDroppedFile\(document, \{/);
  assert.match(componentSource, /markDocumentDirty\(tabId, result\.document\)/);
  assert.doesNotMatch(componentSource, /focusNodeForTab\(tabId, result\.createdNodeId\)/);
  assert.doesNotMatch(componentSource, /requestNodeFocusForTab\(tabId, result\.createdNodeId\)/);
  assert.match(componentSource, /closeNodeCreationMenu\(tabId\)/);
});
