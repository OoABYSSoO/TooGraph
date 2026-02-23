import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorWorkspaceShell.vue"), "utf8").replace(/\r\n/g, "\n");

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

test("EditorWorkspaceShell refreshes settings when an agent model menu opens", () => {
  assert.match(componentSource, /@refresh-agent-models="refreshAgentModels"/);
  assert.match(componentSource, /async function refreshAgentModels\(\)/);
  assert.match(componentSource, /settings\.value = await fetchSettings\(\)/);
});

test("EditorWorkspaceShell persists node resize updates into the graph draft", () => {
  assert.match(componentSource, /import type \{[\s\S]*GraphNodeSize[\s\S]*\} from "@\/types\/node-system";/);
  assert.match(componentSource, /@update:node-size="handleNodeSizeUpdate\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /function handleNodeSizeUpdate\(tabId: string, payload: \{ nodeId: string; position: GraphPosition; size: GraphNodeSize \}\)/);
  assert.match(componentSource, /nextDocument\.nodes\[payload\.nodeId\]\.ui\.position = payload\.position;/);
  assert.match(componentSource, /nextDocument\.nodes\[payload\.nodeId\]\.ui\.size = payload\.size;/);
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
  assert.match(componentSource, /import \{ buildPresetPayloadForNode \} from "\.\/presetPersistence\.ts";/);
  assert.match(componentSource, /@update-node-metadata="updateNodeMetadataForTab\(tab\.tabId, \$event\.nodeId, \$event\.patch\)"/);
  assert.doesNotMatch(componentSource, /@rename-state="renameStateField/);
  assert.doesNotMatch(componentSource, /function renameStateField/);
  assert.match(componentSource, /@update-state="updateStateField\(tab\.tabId, \$event\.stateKey, \$event\.patch\)"/);
  assert.match(componentSource, /@remove-port-state="removeNodePortStateForTab\(tab\.tabId, \$event\.nodeId, \$event\.side, \$event\.stateKey\)"/);
  assert.match(componentSource, /@disconnect-data-edge="disconnectDataEdgeForTab\(tab\.tabId, \$event\.sourceNodeId, \$event\.targetNodeId, \$event\.stateKey, \$event\.mode\)"/);
  assert.match(componentSource, /@delete-node="deleteNodeForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /@save-node-preset="saveNodePresetForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /function updateNodeMetadataForTab\(tabId: string, nodeId: string, patch: Partial<Pick<GraphNode, "name" \| "description">>\)/);
  assert.match(componentSource, /function removeNodePortStateForTab\(tabId: string, nodeId: string, side: "input" \| "output", stateKey: string\)/);
  assert.match(componentSource, /function disconnectDataEdgeForTab\(tabId: string, sourceNodeId: string, targetNodeId: string, stateKey: string, mode: "state" \| "flow"\)/);
  assert.match(componentSource, /async function saveNodePresetForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /function deleteNodeForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /persistedPresets\.value = \[savedPreset, \.\.\.persistedPresets\.value\.filter/);
  assert.doesNotMatch(componentSource, /Only agent nodes can be saved as presets\./);
  assert.match(componentSource, /showPresetSaveToast\("success", t\("feedback\.presetSaved"/);
  assert.match(componentSource, /showPresetSaveToast\("error", error instanceof Error \? error\.message : t\("feedback\.presetSaveFailed"\)\)/);
});

test("EditorWorkspaceShell blocks deleting State definitions that are still referenced by nodes", () => {
  assert.match(componentSource, /import \{[\s\S]*deleteStateFieldFromDocument[\s\S]*listStateFieldUsageLabels[\s\S]*\} from "\.\/statePanelFields\.ts";/);
  assert.match(componentSource, /function deleteStateField\(tabId: string, stateKey: string\)/);
  assert.match(componentSource, /if \(!document\.state_schema\[stateKey\]\) \{/);
  assert.match(componentSource, /t\("statePanel\.deleteStateMissing"\)/);
  assert.match(componentSource, /const usageLabels = listStateFieldUsageLabels\(document, stateKey\);/);
  assert.match(componentSource, /if \(usageLabels\.length > 0\) \{/);
  assert.match(componentSource, /t\("statePanel\.deleteStateBlocked", \{ nodes: formatStateUsageLabelList\(usageLabels\) \}\)/);
  assert.match(componentSource, /showStateDeleteBlockedToast\(message\);/);
  assert.match(componentSource, /t\("statePanel\.deleteStateDeleted", \{ state: formatStateDefinitionLabel\(document, stateKey\) \}\)/);
});

test("EditorWorkspaceShell floats the right side panel above the canvas while preserving responsive panel widths", () => {
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*clamp\(340px,\s*32vw,\s*480px\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-human-review-panel-open-width:\s*var\(--editor-state-panel-open-width\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100vh;/);
  assert.match(componentSource, /class="editor-workspace-shell__side-panel-layer"/);
  assert.match(componentSource, /v-if="isStatePanelOpen\(tab\.tabId\) && documentsByTabId\[tab\.tabId\]"/);
  assert.match(componentSource, /<EditorHumanReviewPanel[\s\S]*v-if="shouldShowHumanReviewPanel\(tab\.tabId\)"/);
  assert.match(componentSource, /<EditorStatePanel[\s\S]*v-else/);
  assert.match(componentSource, /:style="sidePanelLayerStyle\(tab\.tabId\)"/);
  assert.match(componentSource, /class="editor-workspace-shell__editor-main"[\s\S]*:style="editorMainStyle\(tab\.tabId\)"/);
  assert.match(componentSource, /function editorMainStyle\(tabId: string\)/);
  assert.match(componentSource, /"--editor-canvas-minimap-right-clearance":\s*`calc\(\$\{sidePanelOpenWidth\(tabId\)\} \+ 12px\)`/);
  assert.match(componentSource, /function sidePanelLayerStyle\(tabId: string\)/);
  assert.match(componentSource, /width:\s*sidePanelOpenWidth\(tabId\),/);
  assert.doesNotMatch(componentSource, /56px/);
  assert.match(componentSource, /@media \(max-width:\s*760px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*min\(320px,\s*calc\(100vw - var\(--app-sidebar-width\) - 24px\)\);/);
  assert.match(componentSource, /@media \(max-width:\s*760px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-human-review-panel-open-width:\s*var\(--editor-state-panel-open-width\);/);
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
  assert.match(componentSource, /const dataEdgeStateEditorRequestByTabId = ref<Record<string, DataEdgeStateEditorRequest \| null>>\(\{\}\);/);
  assert.match(componentSource, /:state-editor-request="dataEdgeStateEditorRequestByTabId\[tab\.tabId\] \?\? null"/);
  assert.match(componentSource, /const result = createNodeFromCreationEntry\(document, \{/);
  assert.match(componentSource, /const result = await createNodeFromDroppedFile\(document, \{/);
  assert.match(componentSource, /markDocumentDirty\(tabId, result\.document\)/);
  assert.match(componentSource, /openCreatedStateEdgeEditorForTab\(tabId, menuState\.context, result\)/);
  assert.match(componentSource, /function openCreatedStateEdgeEditorForTab/);
  assert.match(componentSource, /createdStateKey: string \| null/);
  assert.doesNotMatch(componentSource, /focusNodeForTab\(tabId, result\.createdNodeId\)/);
  assert.doesNotMatch(componentSource, /requestNodeFocusForTab\(tabId, result\.createdNodeId\)/);
  assert.match(componentSource, /closeNodeCreationMenu\(tabId\)/);
});

test("EditorWorkspaceShell keeps canvas viewport state in local editor drafts", () => {
  assert.match(componentSource, /readPersistedEditorViewportDraft/);
  assert.match(componentSource, /writePersistedEditorViewportDraft/);
  assert.match(componentSource, /prunePersistedEditorViewportDrafts/);
  assert.match(componentSource, /removePersistedEditorViewportDraft/);
  assert.match(componentSource, /const viewportByTabId = ref<Record<string, CanvasViewport>>\(\{\}\);/);
  assert.match(componentSource, /:initial-viewport="viewportByTabId\[tab\.tabId\] \?\? null"/);
  assert.match(componentSource, /@update:viewport="updateCanvasViewportForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /function ensureTabViewportDrafts\(\)/);
  assert.match(componentSource, /function updateCanvasViewportForTab\(tabId: string, viewport: CanvasViewport\)/);
  assert.match(componentSource, /writePersistedEditorViewportDraft\(tabId, viewport\)/);
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
  assert.match(componentSource, /function canShowHumanReviewPanel\(tabId: string\)/);
  assert.match(componentSource, /function shouldShowHumanReviewPanel\(tabId: string\)/);
  assert.match(componentSource, /function openHumanReviewPanelForTab\(tabId: string, nodeId: string \| null\)/);
  assert.match(componentSource, /@open-human-review="openHumanReviewPanelForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /<EditorHumanReviewPanel/);
  assert.match(componentSource, /class="editor-workspace-shell__side-panel-layer"/);
  assert.match(componentSource, /v-if="isStatePanelOpen\(tab\.tabId\) && documentsByTabId\[tab\.tabId\]"/);
  assert.match(componentSource, /<EditorHumanReviewPanel[\s\S]*v-if="shouldShowHumanReviewPanel\(tab\.tabId\)"/);
  assert.match(componentSource, /:run="latestRunDetailByTabId\[tab\.tabId\] \?\? null"/);
  assert.match(componentSource, /if \(run\.status === "awaiting_human" && run\.current_node_id\) \{/);
  assert.match(componentSource, /openHumanReviewPanelForTab\(tabId, run\.current_node_id\);/);
  assert.match(componentSource, /if \(visualRun\.status === "awaiting_human" && visualRun\.current_node_id\) \{/);
  assert.match(componentSource, /openHumanReviewPanelForTab\(tab\.tabId, visualRun\.current_node_id\);/);
  assert.match(componentSource, /<EditorStatePanel[\s\S]*v-else[\s\S]*:run="latestRunDetailByTabId\[tab\.tabId\] \?\? null"/);
});

test("EditorWorkspaceShell keeps Human Review locked open while awaiting human input", () => {
  const toggleStatePanelSource = componentSource.match(/function toggleStatePanel\(tabId: string\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  const toggleActiveStatePanelSource = componentSource.match(/function toggleActiveStatePanel\(\) \{[\s\S]*?function editorMainStyle/)?.[0] ?? "";
  const openHumanReviewSource = componentSource.match(/function openHumanReviewPanelForTab\(tabId: string, nodeId: string \| null\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(componentSource, /function isHumanReviewPanelLockedOpen\(tabId: string\)/);
  assert.match(componentSource, /return canShowHumanReviewPanel\(tabId\) && sidePanelMode\(tabId\) === "human-review";/);
  assert.match(toggleStatePanelSource, /if \(isHumanReviewPanelLockedOpen\(tabId\)\) \{/);
  assert.match(toggleActiveStatePanelSource, /if \(isHumanReviewPanelLockedOpen\(tabId\)\) \{/);
  assert.match(toggleActiveStatePanelSource, /openHumanReviewPanelForTab\(tabId, latestRunDetailByTabId\.value\[tabId\]\?\.current_node_id \?\? null\);/);
  assert.match(openHumanReviewSource, /if \(!canShowHumanReviewPanel\(tabId\)\) \{/);
  assert.match(openHumanReviewSource, /return;/);
});

test("EditorWorkspaceShell resumes restored pause snapshots against their original snapshot checkpoint", () => {
  assert.match(componentSource, /resumeRun\(run\.run_id, payload, restoredRunSnapshotIdByTabId\.value\[tabId\] \?\? null\)/);
  assert.match(componentSource, /restoredRunSnapshotIdByTabId\.value = \{[\s\S]*\[tabId\]: null,/);
});

test("EditorWorkspaceShell locks graph editing while a run is awaiting human review", () => {
  const guardFunctionSource = componentSource.match(/function guardGraphEditForTab\(tabId: string\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(componentSource, /import \{ ElMessage \} from "element-plus";/);
  assert.match(componentSource, /:interaction-locked="isGraphInteractionLocked\(tab\.tabId\)"/);
  assert.match(componentSource, /function isGraphInteractionLocked\(tabId: string\)/);
  assert.match(componentSource, /return latestRunDetailByTabId\.value\[tabId\]\?\.status === "awaiting_human";/);
  assert.match(componentSource, /function guardGraphEditForTab\(tabId: string\)/);
  assert.match(componentSource, /function showGraphLockedEditToast\(\)/);
  assert.match(
    componentSource,
    /ElMessage\(\{[\s\S]*customClass:\s*"editor-workspace-shell__locked-toast",[\s\S]*type:\s*"warning",[\s\S]*duration:\s*4200,[\s\S]*grouping:\s*true,/,
  );
  assert.match(componentSource, /message:\s*t\("editor\.lockedToast"\)/);
  assert.match(componentSource, /@locked-edit-attempt="showGraphLockedEditToast"/);
  assert.match(componentSource, /:global\(\.editor-workspace-shell__locked-toast\.el-message\) \{[\s\S]*top:\s*50% !important;/);
  assert.match(componentSource, /:global\(\.editor-workspace-shell__locked-toast\.el-message\) \{[\s\S]*min-width:\s*min\(620px,\s*calc\(100vw - 40px\)\);/);
  assert.match(componentSource, /:global\(\.editor-workspace-shell__locked-toast\.el-message\) \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.56\);/);
  assert.match(componentSource, /:global\(\.editor-workspace-shell__locked-toast \.el-message__content\) \{[\s\S]*font-size:\s*1\.08rem;/);
  assert.match(componentSource, /:global\(\.editor-workspace-shell__locked-toast\.el-message\) \{[\s\S]*animation:\s*editor-workspace-shell-locked-toast-float 4\.2s ease forwards;/);
  assert.match(componentSource, /76% \{[\s\S]*transform:\s*translate\(-50%, -50%\) scale\(1\);/);
  assert.match(componentSource, /@keyframes editor-workspace-shell-locked-toast-float/);
  assert.match(componentSource, /if \(guardGraphEditForTab\(tabId\)\) \{/);
  assert.match(guardFunctionSource, /showGraphLockedEditToast\(\);/);
  assert.doesNotMatch(guardFunctionSource, /setMessageFeedbackForTab/);
});

test("EditorWorkspaceShell removes the persistent bottom-left status feedback overlay", () => {
  assert.doesNotMatch(componentSource, /class="editor-workspace-shell__feedback"/);
  assert.doesNotMatch(componentSource, /editor-workspace-shell__feedback--/);
  assert.doesNotMatch(componentSource, /\.editor-workspace-shell__feedback/);
  assert.match(componentSource, /:latest-run-status="feedbackForTab\(tab\.tabId\)\?\.activeRunStatus \?\? null"/);
});

test("EditorWorkspaceShell subscribes to run events for live output previews", () => {
  assert.match(componentSource, /const runEventSourceByTabId = new Map<string, EventSource>\(\);/);
  assert.match(componentSource, /function startRunEventStreamForTab\(tabId: string, runId: string\)/);
  assert.match(componentSource, /new EventSource\(`\/api\/runs\/\$\{runId\}\/events`\)/);
  assert.match(componentSource, /addEventListener\("node\.output\.delta"/);
  assert.match(componentSource, /function applyStreamingOutputPreviewToTab/);
  assert.match(componentSource, /resolveStreamingOutputNodeIds/);
  assert.match(componentSource, /startRunEventStreamForTab\(tab\.tabId, response\.run_id\);/);
});

test("EditorWorkspaceShell runs the latest document after async model refresh", () => {
  const runActiveGraphSource = componentSource.match(/async function runActiveGraph\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(runActiveGraphSource, /await refreshAgentModels\(\);/);
  assert.match(runActiveGraphSource, /const latestDocument = documentsByTabId\.value\[tab\.tabId\];/);
  assert.match(runActiveGraphSource, /if \(!latestDocument\) \{[\s\S]*?return;[\s\S]*?\}/);
  assert.match(runActiveGraphSource, /const response = await runGraph\(latestDocument\);/);
  assert.doesNotMatch(runActiveGraphSource, /const response = await runGraph\(document\);/);
});

test("EditorWorkspaceShell persists graph document drafts across route changes and app restarts", () => {
  assert.match(componentSource, /readPersistedEditorDocumentDraft/);
  assert.match(componentSource, /writePersistedEditorDocumentDraft/);
  assert.match(componentSource, /removePersistedEditorDocumentDraft/);
  assert.match(componentSource, /prunePersistedEditorDocumentDrafts/);
  assert.match(componentSource, /const persistedDraft = readPersistedEditorDocumentDraft\(tab\.tabId\);/);
  assert.match(componentSource, /registerDocumentForTab\(tab\.tabId, persistedDraft \?\? createDraftForTab\(tab\)\);/);
  assert.match(componentSource, /const persistedDraft = readPersistedEditorDocumentDraft\(tabId\);[\s\S]*if \(persistedDraft\) \{[\s\S]*registerDocumentForTab\(tabId, persistedDraft\);[\s\S]*return;/);
  assert.match(componentSource, /writePersistedEditorDocumentDraft\(tabId, syncedDocument\);/);
  assert.match(componentSource, /removePersistedEditorDocumentDraft\(tabId\);/);
  assert.match(componentSource, /prunePersistedEditorDocumentDrafts\(nextWorkspace\.tabs\.map\(\(tab\) => tab\.tabId\)\);/);
});

test("EditorWorkspaceShell persists terminal run state values into the graph draft", () => {
  assert.match(componentSource, /import \{ applyRunWrittenStateValuesToDocument \} from "\.\/runStatePersistence\.ts";/);
  assert.match(componentSource, /function persistRunStateValuesForTab\(tabId: string, run: RunDetail\)/);
  assert.match(componentSource, /const nextDocument = applyRunWrittenStateValuesToDocument\(document, run\);/);
  assert.match(componentSource, /if \(nextDocument !== document\) \{[\s\S]*setDocumentForTab\(tabId, nextDocument\);[\s\S]*\}/);
  assert.match(componentSource, /persistRunStateValuesForTab\(tabId, run\);/);
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
