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
  assert.match(componentSource, /@remove-port-state="removeNodePortStateForTab\(tab\.tabId, \$event\.nodeId, \$event\.side, \$event\.stateKey\)"/);
  assert.match(componentSource, /@delete-node="deleteNodeForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /@save-node-preset="saveNodePresetForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /function updateNodeMetadataForTab\(tabId: string, nodeId: string, patch: Partial<Pick<GraphNode, "name" \| "description">>\)/);
  assert.match(componentSource, /function removeNodePortStateForTab\(tabId: string, nodeId: string, side: "input" \| "output", stateKey: string\)/);
  assert.match(componentSource, /async function saveNodePresetForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /function deleteNodeForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /persistedPresets\.value = \[savedPreset, \.\.\.persistedPresets\.value\.filter/);
});

test("EditorWorkspaceShell inherits editor height and adapts the state side panel width", () => {
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*clamp\(280px,\s*28vw,\s*380px\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100vh;/);
  assert.match(componentSource, /gridTemplateColumns:\s*isStatePanelOpen\(tabId\)\s*\? "minmax\(0, 1fr\) var\(--editor-state-panel-open-width\)"/);
  assert.match(componentSource, /@media \(max-width:\s*760px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*min\(320px,\s*calc\(100vw - var\(--app-sidebar-width\) - 24px\)\);/);
});

test("EditorWorkspaceShell keeps top chrome and editor body from overflowing their container", () => {
  assert.match(componentSource, /\.editor-workspace-shell__chrome \{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/);
  assert.match(componentSource, /\.editor-workspace-shell__body \{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/);
  assert.match(componentSource, /\.editor-workspace-shell__editor-grid \{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/);
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
