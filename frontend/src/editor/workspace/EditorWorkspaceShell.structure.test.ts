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

test("EditorWorkspaceShell seeds plain new tabs from the baseline default template", () => {
  assert.match(componentSource, /createEditorSeedDraftGraph/);
  assert.match(componentSource, /resolveEditorSeedTemplate/);
  assert.match(componentSource, /return createEditorSeedDraftGraph\(props\.templates, tab\.defaultTemplateId \?\? null, tab\.title\);/);
  assert.match(componentSource, /const seedTemplate = resolveEditorSeedTemplate\(props\.templates, template\?\.template_id \?\? null\);/);
  assert.match(componentSource, /const draft = createEditorSeedDraftGraph\(props\.templates, template\?\.template_id \?\? null\);/);
});

test("EditorWorkspaceShell can restore a past run into a new unsaved tab", () => {
  assert.match(componentSource, /restoreRunId\?: string \| null;/);
  assert.match(componentSource, /restoreSnapshotId\?: string \| null;/);
  assert.match(componentSource, /const routeRestoreError = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const restoredRunSnapshotIdByTabId = ref<Record<string, string \| null>>\(\{\}\);/);
  assert.match(componentSource, /async function openRestoredRunTab\(runId: string, snapshotId: string \| null = props\.restoreSnapshotId \?\? null, navigation: "push" \| "replace" \| "none" = "push"\)/);
  assert.match(componentSource, /const run = await fetchRun\(runId\);/);
  assert.match(componentSource, /const visualRun = buildSnapshotScopedRun\(run, snapshotId\);/);
  assert.match(componentSource, /const restoredGraph = buildRestoredGraphFromRun\(run, snapshotId\);/);
  assert.match(componentSource, /title: resolveRestoredRunTabTitle\(run\),/);
  assert.match(componentSource, /restoredRunSnapshotIdByTabId\.value = \{[\s\S]*\[tab\.tabId\]: snapshotId,/);
  assert.match(componentSource, /if \(instruction\.type === "restore-run"\) \{/);
  assert.match(componentSource, /openRestoredRunTab\(instruction\.runId, instruction\.snapshotId \?\? null, instruction\.navigation\);/);
  assert.match(componentSource, /restoreSnapshotId: props\.restoreSnapshotId \?\? null,/);
  assert.match(componentSource, /return `restore:\$\{props\.restoreRunId \?\? ""\}:\$\{props\.restoreSnapshotId \?\? ""\}`;/);
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

test("EditorWorkspaceShell floats the right side panel above the canvas while preserving responsive panel widths", () => {
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*clamp\(340px,\s*32vw,\s*480px\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-human-review-panel-open-width:\s*clamp\(360px,\s*34vw,\s*520px\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100vh;/);
  assert.match(componentSource, /class="editor-workspace-shell__side-panel-layer"/);
  assert.match(componentSource, /v-if="isStatePanelOpen\(tab\.tabId\) && documentsByTabId\[tab\.tabId\]"/);
  assert.match(componentSource, /<EditorHumanReviewPanel[\s\S]*v-if="sidePanelMode\(tab\.tabId\) === 'human-review'"/);
  assert.match(componentSource, /<EditorStatePanel[\s\S]*v-else/);
  assert.match(componentSource, /:style="sidePanelLayerStyle\(tab\.tabId\)"/);
  assert.match(componentSource, /class="editor-workspace-shell__editor-main"[\s\S]*:style="editorMainStyle\(tab\.tabId\)"/);
  assert.match(componentSource, /function editorMainStyle\(tabId: string\)/);
  assert.match(componentSource, /"--editor-canvas-minimap-right-clearance":\s*`calc\(\$\{sidePanelOpenWidth\(tabId\)\} \+ 12px\)`/);
  assert.match(componentSource, /function sidePanelLayerStyle\(tabId: string\)/);
  assert.match(componentSource, /width:\s*sidePanelOpenWidth\(tabId\),/);
  assert.doesNotMatch(componentSource, /56px/);
  assert.match(componentSource, /@media \(max-width:\s*760px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*min\(320px,\s*calc\(100vw - var\(--app-sidebar-width\) - 24px\)\);/);
  assert.match(componentSource, /@media \(max-width:\s*760px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-human-review-panel-open-width:\s*min\(360px,\s*calc\(100vw - var\(--app-sidebar-width\) - 24px\)\);/);
  assert.match(componentSource, /\.editor-workspace-shell__editor-grid \{[\s\S]*position:\s*relative;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-workspace-floating-top-clearance:\s*72px;/);
  assert.match(componentSource, /\.editor-workspace-shell__side-panel-layer \{[\s\S]*position:\s*absolute;[\s\S]*top:\s*var\(--editor-workspace-floating-top-clearance\);[\s\S]*right:\s*12px;[\s\S]*bottom:\s*12px;[\s\S]*z-index:\s*30;/);
  assert.match(componentSource, /\.editor-workspace-shell__side-panel-layer \{[\s\S]*max-width:\s*calc\(100% - 24px\);[\s\S]*pointer-events:\s*none;/);
  assert.match(componentSource, /\.editor-workspace-shell__side-panel-layer > :deep\(\*\) \{[\s\S]*pointer-events:\s*auto;/);
});

test("EditorWorkspaceShell keeps top chrome and editor body from overflowing their container", () => {
  assert.match(componentSource, /\.editor-workspace-shell__workspace \{[\s\S]*position:\s*relative;/);
  assert.match(componentSource, /\.editor-workspace-shell__chrome \{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*40;/);
  assert.match(componentSource, /\.editor-workspace-shell__chrome \{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[\s\S]*gap:\s*12px;/);
  assert.match(componentSource, /\.editor-workspace-shell__chrome \{[\s\S]*pointer-events:\s*none;/);
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

test("EditorWorkspaceShell imports marked GraphiteUI Python files as new graph tabs", () => {
  assert.match(componentSource, /@import-python-graph="openPythonGraphImportDialog"/);
  assert.match(componentSource, /ref="pythonGraphImportInput"/);
  assert.match(componentSource, /async function importPythonGraphFile\(/);
  assert.match(componentSource, /isGraphiteUiPythonExportSource\(source\)/);
  assert.match(componentSource, /openImportedGraphTab\(importedGraph, file\.name\)/);
});

test("EditorWorkspaceShell opens the right sidebar in Human Review mode for awaiting-human runs", () => {
  assert.match(componentSource, /import EditorHumanReviewPanel from "\.\/EditorHumanReviewPanel\.vue";/);
  assert.match(componentSource, /const sidePanelModeByTabId = ref<Record<string, "state" \| "human-review">>\(\{\}\);/);
  assert.match(componentSource, /function openHumanReviewPanelForTab\(tabId: string, nodeId: string \| null\)/);
  assert.match(componentSource, /@open-human-review="openHumanReviewPanelForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /<EditorHumanReviewPanel/);
  assert.match(componentSource, /class="editor-workspace-shell__side-panel-layer"/);
  assert.match(componentSource, /v-if="isStatePanelOpen\(tab\.tabId\) && documentsByTabId\[tab\.tabId\]"/);
  assert.match(componentSource, /<EditorHumanReviewPanel[\s\S]*v-if="sidePanelMode\(tab\.tabId\) === 'human-review'"/);
  assert.match(componentSource, /:run="latestRunDetailByTabId\[tab\.tabId\] \?\? null"/);
  assert.match(componentSource, /if \(run\.status === "awaiting_human" && run\.current_node_id\) \{/);
  assert.match(componentSource, /openHumanReviewPanelForTab\(tabId, run\.current_node_id\);/);
  assert.match(componentSource, /if \(visualRun\.status === "awaiting_human" && visualRun\.current_node_id\) \{/);
  assert.match(componentSource, /openHumanReviewPanelForTab\(tab\.tabId, visualRun\.current_node_id\);/);
  assert.match(componentSource, /<EditorStatePanel[\s\S]*v-else[\s\S]*:run="latestRunDetailByTabId\[tab\.tabId\] \?\? null"/);
});

test("EditorWorkspaceShell resumes restored pause snapshots against their original snapshot checkpoint", () => {
  assert.match(componentSource, /resumeRun\(run\.run_id, payload, restoredRunSnapshotIdByTabId\.value\[tabId\] \?\? null\)/);
  assert.match(componentSource, /restoredRunSnapshotIdByTabId\.value = \{[\s\S]*\[tabId\]: null,/);
});

test("EditorWorkspaceShell locks graph editing while a run is awaiting human review", () => {
  assert.match(componentSource, /:interaction-locked="isGraphInteractionLocked\(tab\.tabId\)"/);
  assert.match(componentSource, /function isGraphInteractionLocked\(tabId: string\)/);
  assert.match(componentSource, /return latestRunDetailByTabId\.value\[tabId\]\?\.status === "awaiting_human";/);
  assert.match(componentSource, /function guardGraphEditForTab\(tabId: string\)/);
  assert.match(componentSource, /if \(guardGraphEditForTab\(tabId\)\) \{/);
});

test("EditorWorkspaceShell renders the graph action controls as a detached capsule instead of passing them through EditorTabBar", () => {
  const editorTabBarUsage = componentSource.match(/<EditorTabBar[\s\S]*?\/>/)?.[0] ?? "";

  assert.match(componentSource, /import EditorActionCapsule from "\.\/EditorActionCapsule\.vue";/);
  assert.match(componentSource, /<EditorActionCapsule[\s\S]*:active-state-count="activeStateCount"[\s\S]*:is-state-panel-open="activeStatePanelOpen"/);
  assert.match(componentSource, /@save-active-graph="saveActiveGraph"/);
  assert.match(componentSource, /@validate-active-graph="validateActiveGraph"/);
  assert.match(componentSource, /@import-python-graph="openPythonGraphImportDialog"/);
  assert.match(componentSource, /@export-active-graph="exportActiveGraph"/);
  assert.match(componentSource, /@run-active-graph="runActiveGraph"/);
  assert.match(editorTabBarUsage, /<EditorTabBar/);
  assert.doesNotMatch(editorTabBarUsage, /@save-active-graph=/);
  assert.doesNotMatch(editorTabBarUsage, /@run-active-graph=/);
});

test("EditorWorkspaceShell lays out the tab strip tight to the right action capsule", () => {
  assert.match(componentSource, /class="editor-workspace-shell__action-capsule-row"/);
  assert.match(componentSource, /\.editor-workspace-shell__chrome \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[\s\S]*gap:\s*12px;[\s\S]*padding:\s*0 12px 0 0;/);
  assert.match(componentSource, /\.editor-workspace-shell__action-capsule-row \{[\s\S]*z-index:\s*35;[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*flex-end;[\s\S]*padding:\s*12px 0 0;/);
  assert.match(componentSource, /\.editor-workspace-shell__editor-main \{[\s\S]*--editor-canvas-floating-top-clearance:\s*var\(--editor-workspace-floating-top-clearance\);/);
  assert.match(componentSource, /@media \(max-width:\s*920px\) \{[\s\S]*\.editor-workspace-shell__chrome \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*padding:\s*12px;/);
  assert.match(componentSource, /@media \(max-width:\s*920px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-workspace-floating-top-clearance:\s*124px;/);
  assert.match(componentSource, /@media \(max-width:\s*920px\) \{[\s\S]*\.editor-workspace-shell__action-capsule-row \{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*flex-end;[\s\S]*padding:\s*0;/);
  assert.doesNotMatch(componentSource, /@media \(max-width:\s*920px\) \{[\s\S]*\.editor-workspace-shell__action-capsule-row \{[\s\S]*display:\s*none;/);
});
