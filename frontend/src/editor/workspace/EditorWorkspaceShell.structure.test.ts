import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

function readWorkspaceSource(fileName: string) {
  const filePath = resolve(currentDirectory, fileName);
  return existsSync(filePath) ? readFileSync(filePath, "utf8").replace(/\r\n/g, "\n") : "";
}

const componentSource = readWorkspaceSource("EditorWorkspaceShell.vue");
const subgraphDialogSource = readWorkspaceSource("EditorSubgraphInstanceDialog.vue");
const graphMutationActionsSource = readWorkspaceSource("useWorkspaceGraphMutationActions.ts");
const sidePanelControllerSource = readWorkspaceSource("useWorkspaceSidePanelController.ts");
const runVisualStateSource = readWorkspaceSource("useWorkspaceRunVisualState.ts");
const documentStateSource = readWorkspaceSource("useWorkspaceDocumentState.ts");
const tabLifecycleControllerSource = readWorkspaceSource("useWorkspaceTabLifecycleController.ts");
const routeControllerSource = readWorkspaceSource("useWorkspaceRouteController.ts");
const runControllerSource = readWorkspaceSource("useWorkspaceRunController.ts");
const graphPersistenceControllerSource = readWorkspaceSource("useWorkspaceGraphPersistenceController.ts");
const pythonImportControllerSource = readWorkspaceSource("useWorkspacePythonImportController.ts");
const presetControllerSource = readWorkspaceSource("useWorkspacePresetController.ts");
const nodeCreationControllerSource = readWorkspaceSource("useWorkspaceNodeCreationController.ts");
const runLifecycleControllerSource = readWorkspaceSource("useWorkspaceRunLifecycleController.ts");
const openControllerSource = readWorkspaceSource("useWorkspaceOpenController.ts");
const resourceControllerSource = readWorkspaceSource("useWorkspaceResourceController.ts");
const editGuardControllerSource = readWorkspaceSource("useWorkspaceEditGuardController.ts");

test("EditorWorkspaceShell renders workspace panes without reka-ui tab primitives", () => {
  assert.doesNotMatch(componentSource, /from "reka-ui"/);
  assert.doesNotMatch(componentSource, /<TabsRoot/);
  assert.doesNotMatch(componentSource, /<TabsContent/);
  assert.match(componentSource, /<div[\s\S]*v-for="tab in workspace\.tabs"/);
  assert.match(componentSource, /v-show="tab\.tabId === workspace\.activeTabId"/);
  assert.match(componentSource, /editor-workspace-shell__editor--active/);
});

test("EditorWorkspaceShell publishes the active editor snapshot for advisory buddy context", () => {
  assert.match(componentSource, /import \{ useBuddyContextStore \} from "@\/stores\/buddyContext";/);
  assert.match(componentSource, /const buddyContextStore = useBuddyContextStore\(\);/);
  assert.match(componentSource, /const activeBuddyEditorSnapshot = computed\(\(\) => \{/);
  assert.match(componentSource, /document: documentsByTabId\.value\[tab\.tabId\] \?\? null,/);
  assert.match(componentSource, /focusedNodeId: focusedNodeIdByTabId\.value\[tab\.tabId\] \?\? null,/);
  assert.match(componentSource, /feedback: feedbackForTab\(tab\.tabId\),/);
  assert.match(componentSource, /watch\([\s\S]*activeBuddyEditorSnapshot,[\s\S]*buddyContextStore\.setEditorSnapshot\(snapshot\),[\s\S]*\{ immediate: true, deep: true \},[\s\S]*\);/);
  assert.match(componentSource, /onBeforeUnmount\(\(\) => \{[\s\S]*buddyContextStore\.clearEditorSnapshot\(\);/);
});

test("EditorWorkspaceShell wires canvas node-creation intents into a dedicated creation menu component", () => {
  assert.match(componentSource, /import EditorNodeCreationMenu from "\.\/EditorNodeCreationMenu\.vue";/);
  assert.match(
    nodeCreationControllerSource,
    /import \{[\s\S]*buildClosedNodeCreationMenuState,[\s\S]*buildCreatedStateEdgeEditorRequest,[\s\S]*buildOpenNodeCreationMenuState,[\s\S]*buildUpdatedNodeCreationMenuQuery[\s\S]*\} from "\.\/nodeCreationMenuModel\.ts";/,
  );
  assert.match(componentSource, /@open-node-creation-menu="openNodeCreationMenuForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /@create-node-from-file="createNodeFromFileForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /<EditorNodeCreationMenu/);
  assert.match(componentSource, /@select-entry="createNodeFromMenuForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /@close="closeNodeCreationMenu\(tab\.tabId\)"/);
});

test("EditorWorkspaceShell opens the current subgraph instance as a first-class workspace tab", () => {
  assert.match(componentSource, /@open-subgraph-editor="openSubgraphEditorForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /import \{[\s\S]*createSubgraphWorkspaceTab,[\s\S]*\} from "@\/lib\/editor-workspace";/);
  assert.match(componentSource, /function openSubgraphEditorForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /const existingSubgraphTab = workspace\.value\.tabs\.find\([\s\S]*tab\.kind === "subgraph"[\s\S]*tab\.subgraphSource\?\.parentTabId === tabId[\s\S]*tab\.subgraphSource\?\.nodeId === nodeId/);
  assert.match(componentSource, /const subgraphTab = createSubgraphWorkspaceTab\(\{[\s\S]*parentTabId: tabId,[\s\S]*parentGraphId: parentTab\.graphId,[\s\S]*parentTitle: parentTab\.title,[\s\S]*nodeId,[\s\S]*nodeName: node\.name,/);
  assert.match(componentSource, /registerDocumentForTab\(subgraphTab\.tabId, createSubgraphDocumentFromNode\(node\)\);/);
  assert.match(componentSource, /tabs: \[\.\.\.workspace\.value\.tabs, subgraphTab\]/);
  assert.doesNotMatch(componentSource, /EditorSubgraphInstanceDialog/);
  assert.equal(subgraphDialogSource, "");
});

test("EditorWorkspaceShell gives subgraph tabs save-back and save-as-normal-graph controls", () => {
  assert.match(componentSource, /:save-graph-label="activeTab\?\.kind === 'subgraph' \? t\('editor\.saveSubgraph'\) : t\('editor\.saveGraph'\)"/);
  assert.match(componentSource, /:show-save-as-graph="activeTab\?\.kind === 'subgraph'"/);
  assert.match(componentSource, /:save-as-graph-label="t\('editor\.saveAsGraph'\)"/);
  assert.match(componentSource, /@save-active-graph-as-new="saveActiveGraphAsNewGraph"/);
  assert.match(
    componentSource,
    /const \{[\s\S]*renameActiveGraph,[\s\S]*saveActiveGraph,[\s\S]*saveActiveGraphAsNewGraph,[\s\S]*saveTab,[\s\S]*validateActiveGraph,[\s\S]*exportActiveGraph,[\s\S]*\} = useWorkspaceGraphPersistenceController\(\{/,
  );
});

test("EditorWorkspaceShell shows the subgraph source capsule beside the edge visibility controls", () => {
  assert.match(componentSource, /:source-context-label="subgraphSourceContextLabel\(tab\)"/);
  assert.match(componentSource, /function subgraphSourceContextLabel\(tab: EditorWorkspaceTab\)/);
  assert.match(componentSource, /if \(tab\.kind !== "subgraph" \|\| !tab\.subgraphSource\) \{/);
  assert.match(componentSource, /const parentTitle = workspace\.value\.tabs\.find\(\(candidate\) => candidate\.tabId === tab\.subgraphSource!\.parentTabId\)\?\.title \?\? tab\.subgraphSource\.parentTitle;/);
  assert.match(componentSource, /return `来自：\$\{parentTitle\} \/ 节点：\$\{nodeName\}`;/);
});

test("useWorkspaceGraphPersistenceController saves subgraph tabs back into their parent node and can save them as normal graphs", () => {
  assert.match(graphPersistenceControllerSource, /import \{[\s\S]*updateSubgraphNodeGraphInDocument,[\s\S]*updateNodeMetadataInDocument[\s\S]*\} from "\.\.\/\.\.\/lib\/graph-document\.ts";/);
  assert.match(graphPersistenceControllerSource, /if \(tab\.kind === "subgraph"\) \{/);
  assert.match(graphPersistenceControllerSource, /const source = tab\.subgraphSource;/);
  assert.match(graphPersistenceControllerSource, /const parentDocument = input\.documentsByTabId\.value\[source\.parentTabId\];/);
  assert.match(graphPersistenceControllerSource, /updateSubgraphNodeGraphInDocument\(parentDocument, source\.nodeId, extractCoreGraphFromDocument\(documentToSave\)\)/);
  assert.match(graphPersistenceControllerSource, /updateNodeMetadataInDocument\([\s\S]*source\.nodeId,[\s\S]*name: documentToSave\.name\.trim\(\) \|\| current\.name,/);
  assert.match(graphPersistenceControllerSource, /input\.commitDirtyDocumentForTab\(source\.parentTabId, nextParentDocument\);/);
  assert.match(graphPersistenceControllerSource, /async function saveActiveGraphAsNewGraph\(\)/);
  assert.match(graphPersistenceControllerSource, /async function saveTabAsNewGraph\(tabId: string\)/);
  assert.match(graphPersistenceControllerSource, /ensureSavedGraphTab\(input\.workspace\.value, \{/);
});

test("EditorWorkspaceShell refreshes settings when an agent model menu opens", () => {
  assert.match(componentSource, /import \{ useWorkspaceResourceController \} from "\.\/useWorkspaceResourceController\.ts";/);
  assert.match(componentSource, /@refresh-agent-models="refreshAgentModels"/);
  assert.match(componentSource, /const \{[\s\S]*settings,[\s\S]*refreshAgentModels,[\s\S]*\} = useWorkspaceResourceController\(\{/);
  assert.match(resourceControllerSource, /async function refreshAgentModels\(\)/);
  assert.match(resourceControllerSource, /await loadSettings\(\);/);
  assert.match(resourceControllerSource, /settings\.value = await input\.fetchSettings\(\)/);
});

test("EditorWorkspaceShell persists node resize updates into the graph draft", () => {
  assert.match(componentSource, /import \{ useWorkspaceEditGuardController \} from "\.\/useWorkspaceEditGuardController\.ts";/);
  assert.match(editGuardControllerSource, /import type \{[\s\S]*GraphNodeSize,[\s\S]*GraphPayload,[\s\S]*GraphPosition[\s\S]*\} from "\.\.\/\.\.\/types\/node-system\.ts";/);
  assert.match(componentSource, /@update:node-size="handleNodeSizeUpdate\(tab\.tabId, \$event\)"/);
  assert.match(editGuardControllerSource, /function handleNodeSizeUpdate\(tabId: string, payload: \{ nodeId: string; position: GraphPosition; size: GraphNodeSize \}\)/);
  assert.match(editGuardControllerSource, /nextDocument\.nodes\[payload\.nodeId\]\.ui\.position = payload\.position;/);
  assert.match(editGuardControllerSource, /nextDocument\.nodes\[payload\.nodeId\]\.ui\.size = payload\.size;/);
});

test("EditorWorkspaceShell loads persisted presets for the node creation menu", () => {
  assert.match(componentSource, /import \{[\s\S]*fetchPresets[\s\S]*\} from "@\/api\/presets";/);
  assert.match(componentSource, /const \{[\s\S]*persistedPresets,[\s\S]*loadInitialWorkspaceResources,[\s\S]*\} = useWorkspaceResourceController\(\{/);
  assert.match(resourceControllerSource, /const persistedPresets = ref<PresetDocument\[\]>\(\[\]\);/);
  assert.match(resourceControllerSource, /async function loadPersistedPresets\(\)/);
  assert.match(resourceControllerSource, /persistedPresets\.value = await input\.fetchPresets\(\)/);
});

test("EditorWorkspaceShell creates blank plain new tabs while preserving explicit template tabs", () => {
  assert.match(componentSource, /import \{ useWorkspaceOpenController \} from "\.\/useWorkspaceOpenController\.ts";/);
  assert.match(openControllerSource, /createEmptyDraftGraph/);
  assert.match(openControllerSource, /createDraftFromTemplate/);
  assert.match(openControllerSource, /return createEmptyDraftGraph\(tab\.title\);/);
  assert.match(openControllerSource, /const draft = template \? createDraftFromTemplate\(template\) : createEmptyDraftGraph\(\);/);
  assert.doesNotMatch(openControllerSource, /createEditorSeedDraftGraph/);
  assert.doesNotMatch(openControllerSource, /resolveEditorSeedTemplate/);
  assert.doesNotMatch(componentSource, /createEditorSeedDraftGraph/);
});

test("EditorWorkspaceShell can restore a past run into a new unsaved tab", () => {
  assert.match(componentSource, /restoreRunId\?: string \| null;/);
  assert.match(componentSource, /restoreSnapshotId\?: string \| null;/);
  assert.match(componentSource, /const routeRestoreError = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const restoredRunSnapshotIdByTabId = ref<Record<string, string \| null>>\(\{\}\);/);
  assert.match(componentSource, /async function openRestoredRunTab\(runId: string, snapshotId: string \| null = props\.restoreSnapshotId \?\? null, navigation: "push" \| "replace" \| "none" = "push"\)/);
  assert.match(componentSource, /await openRestoredRunTabFromController\(runId, snapshotId, navigation\);/);
  assert.match(openControllerSource, /const run = await input\.fetchRun\(runId\);/);
  assert.match(openControllerSource, /const visualRun = buildSnapshotScopedRun\(run, snapshotId\);/);
  assert.match(openControllerSource, /const restoredGraph = buildRestoredGraphFromRun\(run, snapshotId\);/);
  assert.match(openControllerSource, /title: resolveRestoredRunTabTitle\(run\),/);
  assert.match(openControllerSource, /input\.restoredRunSnapshotIdByTabId\.value = setTabScopedRecordEntry\(input\.restoredRunSnapshotIdByTabId\.value, tab\.tabId, snapshotId\);/);
  assert.match(componentSource, /import \{ useWorkspaceRouteController \} from "\.\/useWorkspaceRouteController\.ts";/);
  assert.match(routeControllerSource, /if \(instruction\.type === "restore-run"\) \{/);
  assert.match(routeControllerSource, /input\.openRestoredRunTab\(instruction\.runId, instruction\.snapshotId \?\? null, instruction\.navigation\);/);
  assert.match(componentSource, /restoreSnapshotId: \(\) => props\.restoreSnapshotId \?\? null,/);
  assert.match(componentSource, /return `restore:\$\{props\.restoreRunId \?\? ""\}:\$\{props\.restoreSnapshotId \?\? ""\}`;/);
});

test("EditorWorkspaceShell wires node top-action events into state updates, node deletion, and preset persistence", () => {
  assert.match(componentSource, /import \{ fetchPreset, fetchPresets, savePreset \} from "@\/api\/presets";/);
  assert.match(componentSource, /import \{ useWorkspacePresetController \} from "\.\/useWorkspacePresetController\.ts";/);
  assert.match(componentSource, /@update-node-metadata="updateNodeMetadataForTab\(tab\.tabId, \$event\.nodeId, \$event\.patch\)"/);
  assert.doesNotMatch(componentSource, /@rename-state="renameStateField/);
  assert.doesNotMatch(componentSource, /function renameStateField/);
  assert.match(componentSource, /@update-state="updateStateField\(tab\.tabId, \$event\.stateKey, \$event\.patch\)"/);
  assert.match(componentSource, /@remove-port-state="removeNodePortStateForTab\(tab\.tabId, \$event\.nodeId, \$event\.side, \$event\.stateKey\)"/);
  assert.match(componentSource, /@reorder-port-state="reorderNodePortStateForTab\(tab\.tabId, \$event\.nodeId, \$event\.side, \$event\.stateKey, \$event\.targetIndex\)"/);
  assert.match(componentSource, /@disconnect-data-edge="disconnectDataEdgeForTab\(tab\.tabId, \$event\.sourceNodeId, \$event\.targetNodeId, \$event\.stateKey, \$event\.mode\)"/);
  assert.match(componentSource, /@delete-node="deleteNodeForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /@save-node-preset="saveNodePresetForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(graphMutationActionsSource, /function updateNodeMetadataForTab\(tabId: string, nodeId: string, patch: Partial<Pick<GraphNode, "name" \| "description">>\)/);
  assert.match(graphMutationActionsSource, /function removeNodePortStateForTab\(tabId: string, nodeId: string, side: "input" \| "output", stateKey: string\)/);
  assert.match(graphMutationActionsSource, /function reorderNodePortStateForTab\(tabId: string, nodeId: string, side: "input" \| "output", stateKey: string, targetIndex: number\)/);
  assert.match(graphMutationActionsSource, /reorderNodePortStateInDocument\(document, nodeId, side, stateKey, targetIndex\)/);
  assert.match(graphMutationActionsSource, /function disconnectDataEdgeForTab\(tabId: string, sourceNodeId: string, targetNodeId: string, stateKey: string, mode: "state" \| "flow"\)/);
  assert.match(graphMutationActionsSource, /function deleteNodeForTab\(tabId: string, nodeId: string\)/);
  assert.match(componentSource, /const \{ saveNodePresetForTab \} = useWorkspacePresetController\(\{/);
  assert.match(componentSource, /useWorkspacePresetController\(\{[\s\S]*documentsByTabId,[\s\S]*persistedPresets,[\s\S]*savePreset,[\s\S]*fetchPreset,[\s\S]*showPresetSaveToast,[\s\S]*translate: \(key, params\) => t\(key, params \?\? \{\}\),[\s\S]*\}\);/);
  assert.match(presetControllerSource, /buildPresetPayloadForNode\(toRaw\(document\), nodeId\)/);
  assert.match(presetControllerSource, /const saved = await input\.savePreset\(payload\);/);
  assert.match(presetControllerSource, /const savedPreset = await input\.fetchPreset\(saved\.presetId\);/);
  assert.match(presetControllerSource, /input\.persistedPresets\.value = \[/);
  assert.match(presetControllerSource, /input\.showPresetSaveToast\("success", message\);/);
  assert.doesNotMatch(componentSource, /async function saveNodePresetForTab\(tabId: string, nodeId: string\)/);
  assert.doesNotMatch(componentSource, /buildPresetPayloadForNode\(document, nodeId\)/);
  assert.doesNotMatch(componentSource, /Only LLM nodes can be saved as presets\./);
  assert.match(presetControllerSource, /input\.showPresetSaveToast\("error", message\);/);
});

test("EditorWorkspaceShell delegates graph mutation actions to a workspace composable", () => {
  assert.match(componentSource, /import \{ useWorkspaceGraphMutationActions \} from "\.\/useWorkspaceGraphMutationActions\.ts";/);
  assert.match(
    componentSource,
    /const \{[\s\S]*addStateReaderBinding,[\s\S]*removeStateReaderBinding,[\s\S]*addStateWriterBinding,[\s\S]*bindNodePortStateForTab,[\s\S]*createNodePortStateForTab,[\s\S]*deleteNodeForTab,[\s\S]*connectStateBindingForTab,[\s\S]*connectStateInputSourceForTab,[\s\S]*deleteStateField,[\s\S]*removeStateWriterBinding,[\s\S]*\} = useWorkspaceGraphMutationActions\(\{/,
  );
  assert.match(
    componentSource,
    /useWorkspaceGraphMutationActions\(\{[\s\S]*documentsByTabId,[\s\S]*focusedNodeIdByTabId,[\s\S]*markDocumentDirty,[\s\S]*focusNodeForTab,[\s\S]*setMessageFeedbackForTab,[\s\S]*showStateDeleteBlockedToast,[\s\S]*openCreatedStateEdgeEditorForTab,[\s\S]*translate: t,[\s\S]*\}\);/,
  );
  assert.match(graphMutationActionsSource, /export function useWorkspaceGraphMutationActions\(/);
  assert.match(graphMutationActionsSource, /function commitDocumentMutationForTab\(/);
  assert.match(graphMutationActionsSource, /function connectStateBindingForTab\(/);
  assert.match(graphMutationActionsSource, /function connectStateInputSourceForTab\(/);
  assert.match(graphMutationActionsSource, /function deleteStateField\(/);
  assert.match(graphMutationActionsSource, /return \{[\s\S]*addStateReaderBinding,[\s\S]*connectStateBindingForTab,[\s\S]*deleteStateField,[\s\S]*removeStateWriterBinding,[\s\S]*\};/);
  assert.doesNotMatch(componentSource, /function addStateReaderBinding/);
  assert.doesNotMatch(componentSource, /function connectStateBindingForTab/);
  assert.doesNotMatch(componentSource, /function connectStateInputSourceForTab/);
  assert.doesNotMatch(componentSource, /function deleteStateField/);
});

test("EditorWorkspaceShell blocks deleting State definitions that are still referenced by nodes", () => {
  assert.match(graphMutationActionsSource, /import \{[\s\S]*deleteStateFieldFromDocument[\s\S]*listStateFieldUsageLabels[\s\S]*\} from "\.\/statePanelFields\.ts";/);
  assert.match(graphMutationActionsSource, /function deleteStateField\(tabId: string, stateKey: string\)/);
  assert.match(graphMutationActionsSource, /if \(!document\.state_schema\[stateKey\]\) \{/);
  assert.match(graphMutationActionsSource, /input\.translate\("statePanel\.deleteStateMissing"\)/);
  assert.match(graphMutationActionsSource, /const usageLabels = listStateFieldUsageLabels\(document, stateKey\);/);
  assert.match(graphMutationActionsSource, /if \(usageLabels\.length > 0\) \{/);
  assert.match(graphMutationActionsSource, /input\.translate\("statePanel\.deleteStateBlocked", \{ nodes: formatStateUsageLabelList\(usageLabels\) \}\)/);
  assert.match(componentSource, /function showStateDeleteBlockedToast\(message: string\)/);
  assert.match(graphMutationActionsSource, /input\.showStateDeleteBlockedToast\(message\);/);
  assert.match(graphMutationActionsSource, /input\.translate\("statePanel\.deleteStateDeleted", \{ state: formatStateDefinitionLabel\(document, stateKey\) \}\)/);
});

test("EditorWorkspaceShell floats the right side panel above the canvas while preserving responsive panel widths", () => {
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*clamp\(340px,\s*32vw,\s*480px\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-human-review-panel-open-width:\s*var\(--editor-state-panel-open-width\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(componentSource, /\.editor-workspace-shell \{[\s\S]*height:\s*100vh;/);
  assert.match(componentSource, /class="editor-workspace-shell__side-panel-layer"/);
  assert.match(componentSource, /v-if="isStatePanelOpen\(tab\.tabId\) && documentsByTabId\[tab\.tabId\]"/);
  assert.match(componentSource, /<EditorHumanReviewPanel[\s\S]*v-if="shouldShowHumanReviewPanel\(tab\.tabId\)"/);
  assert.match(componentSource, /<EditorRunActivityPanel[\s\S]*v-else-if="shouldShowRunActivityPanel\(tab\.tabId\)"/);
  assert.match(componentSource, /<EditorStatePanel[\s\S]*v-else/);
  assert.match(componentSource, /:style="sidePanelLayerStyle\(tab\.tabId\)"/);
  assert.match(componentSource, /class="editor-workspace-shell__editor-main"[\s\S]*:style="editorMainStyle\(tab\.tabId\)"/);
  assert.match(componentSource, /import \{ useWorkspaceSidePanelController \} from "\.\/useWorkspaceSidePanelController\.ts";/);
  assert.match(sidePanelControllerSource, /function editorMainStyle\(tabId: string\)/);
  assert.match(sidePanelControllerSource, /"--editor-canvas-minimap-right-clearance":\s*`calc\(\$\{sidePanelOpenWidth\(tabId\)\} \+ 12px\)`/);
  assert.match(sidePanelControllerSource, /function sidePanelLayerStyle\(tabId: string\)/);
  assert.match(sidePanelControllerSource, /width:\s*sidePanelOpenWidth\(tabId\),/);
  assert.doesNotMatch(componentSource, /56px/);
  assert.match(componentSource, /@media \(max-width:\s*760px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-state-panel-open-width:\s*min\(320px,\s*calc\(100vw - var\(--app-sidebar-width\) - 24px\)\);/);
  assert.match(componentSource, /@media \(max-width:\s*760px\) \{[\s\S]*\.editor-workspace-shell \{[\s\S]*--editor-human-review-panel-open-width:\s*var\(--editor-state-panel-open-width\);/);
  assert.match(componentSource, /\.editor-workspace-shell \{[\s\S]*--editor-run-activity-panel-open-width:\s*var\(--editor-state-panel-open-width\);/);
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
  assert.match(componentSource, /import \{ useWorkspaceNodeCreationController \} from "\.\/useWorkspaceNodeCreationController\.ts";/);
  assert.match(graphMutationActionsSource, /import \{ connectStateInputSourceToTarget \} from "@\/lib\/graph-node-creation";/);
  assert.match(graphMutationActionsSource, /import \{ isVirtualAnyOutputStateKey \} from "@\/lib\/virtual-any-input";/);
  assert.match(componentSource, /const dataEdgeStateEditorRequestByTabId = ref<Record<string, DataEdgeStateEditorRequest \| null>>\(\{\}\);/);
  assert.match(componentSource, /:state-editor-request="dataEdgeStateEditorRequestByTabId\[tab\.tabId\] \?\? null"/);
  assert.match(componentSource, /@connect-state="connectStateBindingForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /@connect-state-input-source="connectStateInputSourceForTab\(tab\.tabId, \$event\)"/);
  assert.match(
    componentSource,
    /const \{[\s\S]*createNodeFromFileForTab,[\s\S]*createNodeFromMenuForTab,[\s\S]*nodeCreationEntriesForTab,[\s\S]*nodeCreationMenuState,[\s\S]*openCreatedStateEdgeEditorForTab,[\s\S]*openNodeCreationMenuForTab,[\s\S]*updateNodeCreationQuery,[\s\S]*\} = useWorkspaceNodeCreationController\(\{/,
  );
  assert.match(componentSource, /useWorkspaceNodeCreationController\(\{[\s\S]*documentsByTabId,[\s\S]*dataEdgeStateEditorRequestByTabId,[\s\S]*nodeCreationMenuByTabId,[\s\S]*persistedPresets,[\s\S]*guardGraphEditForTab,[\s\S]*markDocumentDirty,[\s\S]*setMessageFeedbackForTab,[\s\S]*importPythonGraphFile,[\s\S]*isTooGraphPythonExportFile,[\s\S]*\}\);/);
  assert.match(nodeCreationControllerSource, /const result = createNodeFromCreationEntry\(document, \{/);
  assert.match(nodeCreationControllerSource, /const result = await createNodeFromDroppedFile\(document, \{/);
  assert.match(nodeCreationControllerSource, /buildOpenNodeCreationMenuState\(context\)/);
  assert.match(nodeCreationControllerSource, /buildClosedNodeCreationMenuState\(\)/);
  assert.match(nodeCreationControllerSource, /buildUpdatedNodeCreationMenuQuery\(currentState, query\)/);
  assert.doesNotMatch(componentSource, /typeof context\.clientX === "number" && typeof context\.clientY === "number"/);
  assert.match(graphMutationActionsSource, /function connectStateBindingForTab\(\s*tabId: string,\s*payload: \{[\s\S]*sourceNodeId: string;[\s\S]*sourceStateKey: string;[\s\S]*targetNodeId: string;[\s\S]*targetStateKey: string;[\s\S]*position: GraphPosition;[\s\S]*sourceValueType\?: string \| null;[\s\S]*\},\s*\)/);
  assert.match(graphMutationActionsSource, /const createdStateKey = resolveCreatedVirtualOutputStateKey\(document, nextDocument, payload\.sourceNodeId, payload\.sourceStateKey\);/);
  assert.match(graphMutationActionsSource, /if \(createdStateKey\) \{[\s\S]*input\.openCreatedStateEdgeEditorForTab\(\s*tabId,[\s\S]*sourceNodeId: payload\.sourceNodeId,[\s\S]*sourceStateKey: payload\.sourceStateKey,[\s\S]*createdStateKey,/);
  assert.match(graphMutationActionsSource, /if \(previousDocument\.state_schema\[createdBinding\.state\]\) \{[\s\S]*return null;/);
  assert.match(graphMutationActionsSource, /return nextDocument\.state_schema\[createdBinding\.state\] \? createdBinding\.state : null;/);
  assert.match(graphMutationActionsSource, /function connectStateInputSourceForTab/);
  assert.match(graphMutationActionsSource, /connectStateInputSourceToTarget\(document, payload\)/);
  assert.match(graphMutationActionsSource, /input\.markDocumentDirty\(tabId, result\.document\)/);
  assert.match(nodeCreationControllerSource, /openCreatedStateEdgeEditorForTab\(tabId, menuState\.context, result\)/);
  assert.match(nodeCreationControllerSource, /function openCreatedStateEdgeEditorForTab/);
  assert.match(nodeCreationControllerSource, /createdStateKey: string \| null/);
  assert.match(nodeCreationControllerSource, /const editorRequest = buildCreatedStateEdgeEditorRequest\(context, result, input\.now\?\.\(\) \?\? Date\.now\(\)\);/);
  assert.match(
    nodeCreationControllerSource,
    /input\.dataEdgeStateEditorRequestByTabId\.value = setTabScopedRecordEntry\(\s*input\.dataEdgeStateEditorRequestByTabId\.value,\s*tabId,\s*editorRequest,\s*\);/,
  );
  assert.doesNotMatch(componentSource, /createNodeFromCreationEntry\(document, \{/);
  assert.doesNotMatch(componentSource, /createNodeFromDroppedFile\(document, \{/);
  assert.doesNotMatch(componentSource, /buildOpenNodeCreationMenuState\(context\)/);
  assert.doesNotMatch(componentSource, /const sourceNodeId = context\.targetNodeId \? result\.createdNodeId : context\.sourceNodeId;/);
  assert.doesNotMatch(componentSource, /const targetNodeId = context\.targetNodeId \?\? result\.createdNodeId;/);
  assert.doesNotMatch(componentSource, /focusNodeForTab\(tabId, result\.createdNodeId\)/);
  assert.doesNotMatch(componentSource, /requestNodeFocusForTab\(tabId, result\.createdNodeId\)/);
  assert.match(nodeCreationControllerSource, /closeNodeCreationMenu\(tabId\)/);
});

test("EditorWorkspaceShell keeps canvas viewport state in local editor drafts", () => {
  const ensureViewportSource =
    documentStateSource.match(/function ensureTabViewportDrafts\(\) \{[\s\S]*?\n  \}\n\n  function updateCanvasViewportForTab/)?.[0] ?? "";
  const updateViewportSource =
    documentStateSource.match(/function updateCanvasViewportForTab\(tabId: string, viewport: CanvasViewport\) \{[\s\S]*?\n  \}\n\n  function persistRunStateValuesForTab/)?.[0] ?? "";

  assert.match(componentSource, /import \{ useWorkspaceDocumentState \} from "\.\/useWorkspaceDocumentState\.ts";/);
  assert.match(documentStateSource, /import \{[\s\S]*buildNextCanvasViewportDrafts,[\s\S]*listTabsMissingViewportDrafts[\s\S]*\} from "\.\/editorDraftPersistenceModel\.ts";/);
  assert.match(documentStateSource, /readPersistedEditorViewportDraft/);
  assert.match(documentStateSource, /writePersistedEditorViewportDraft/);
  assert.match(componentSource, /prunePersistedEditorViewportDrafts/);
  assert.match(componentSource, /removePersistedEditorViewportDraft/);
  assert.match(componentSource, /const viewportByTabId = ref<Record<string, CanvasViewport>>\(\{\}\);/);
  assert.match(componentSource, /:initial-viewport="viewportByTabId\[tab\.tabId\] \?\? null"/);
  assert.match(componentSource, /@update:viewport="updateCanvasViewportForTab\(tab\.tabId, \$event\)"/);
  assert.match(componentSource, /ensureTabViewportDrafts,/);
  assert.match(componentSource, /updateCanvasViewportForTab,/);
  assert.match(ensureViewportSource, /for \(const tabId of listTabsMissingViewportDrafts\(input\.workspace\.value\.tabs, input\.viewportByTabId\.value\)\)/);
  assert.doesNotMatch(ensureViewportSource, /for \(const tab of workspace\.value\.tabs\)/);
  assert.match(updateViewportSource, /const nextViewports = buildNextCanvasViewportDrafts\(input\.viewportByTabId\.value, tabId, viewport\);/);
  assert.doesNotMatch(updateViewportSource, /previousViewport\.x === viewport\.x/);
  assert.match(documentStateSource, /writePersistedEditorViewportDraft\(tabId, viewport\)/);
});

test("EditorWorkspaceShell imports marked TooGraph Python files as new graph tabs", () => {
  assert.match(componentSource, /@import-python-graph="openPythonGraphImportDialog"/);
  assert.match(componentSource, /ref="pythonGraphImportInput"/);
  assert.match(componentSource, /import \{ useWorkspacePythonImportController \} from "\.\/useWorkspacePythonImportController\.ts";/);
  assert.match(
    componentSource,
    /const \{[\s\S]*handlePythonGraphImportSelection,[\s\S]*importPythonGraphFile,[\s\S]*openPythonGraphImportDialog,[\s\S]*\} = useWorkspacePythonImportController\(\{/,
  );
  assert.match(pythonImportControllerSource, /async function importPythonGraphFile\(/);
  assert.match(pythonImportControllerSource, /input\.isTooGraphPythonExportSource\(source\)/);
  assert.match(pythonImportControllerSource, /openImportedGraphTab\(importedGraph, file\.name\)/);
  assert.doesNotMatch(componentSource, /function openImportedGraphTab\(/);
  assert.doesNotMatch(componentSource, /async function importPythonGraphFile\(/);
});

test("EditorWorkspaceShell opens the right sidebar in Human Review mode for awaiting-human runs", () => {
  assert.match(componentSource, /import EditorHumanReviewPanel from "\.\/EditorHumanReviewPanel\.vue";/);
  assert.match(componentSource, /import type \{ WorkspaceSidePanelMode \} from "\.\/workspaceSidePanelModel\.ts";/);
  assert.match(componentSource, /import \{ useWorkspaceSidePanelController \} from "\.\/useWorkspaceSidePanelController\.ts";/);
  assert.match(componentSource, /const sidePanelModeByTabId = ref<Record<string, WorkspaceSidePanelMode>>\(\{\}\);/);
  assert.match(componentSource, /const \{[\s\S]*shouldShowHumanReviewPanel,[\s\S]*openHumanReviewPanelForTab,[\s\S]*\} = useWorkspaceSidePanelController\(\{/);
  assert.match(componentSource, /@open-human-review="openHumanReviewPanelForTab\(tab\.tabId, \$event\.nodeId\)"/);
  assert.match(componentSource, /<EditorHumanReviewPanel/);
  assert.match(componentSource, /class="editor-workspace-shell__side-panel-layer"/);
  assert.match(componentSource, /v-if="isStatePanelOpen\(tab\.tabId\) && documentsByTabId\[tab\.tabId\]"/);
  assert.match(componentSource, /<EditorHumanReviewPanel[\s\S]*v-if="shouldShowHumanReviewPanel\(tab\.tabId\)"/);
  assert.match(componentSource, /:run="latestRunDetailByTabId\[tab\.tabId\] \?\? null"/);
  assert.match(runLifecycleControllerSource, /if \(run\.status === "awaiting_human" && run\.current_node_id\) \{/);
  assert.match(runLifecycleControllerSource, /input\.openHumanReviewPanelForTab\(tabId, run\.current_node_id\);/);
  assert.match(openControllerSource, /if \(visualRun\.status === "awaiting_human" && visualRun\.current_node_id\) \{/);
  assert.match(openControllerSource, /input\.openHumanReviewPanelForTab\(tab\.tabId, visualRun\.current_node_id\);/);
  assert.match(componentSource, /<EditorStatePanel[\s\S]*v-else[\s\S]*:run="latestRunDetailByTabId\[tab\.tabId\] \?\? null"/);
});

test("EditorWorkspaceShell delegates run event stream parsing and URL projection to the shared model", () => {
  assert.match(runLifecycleControllerSource, /import \{[\s\S]*buildRunEventOutputPreviewUpdate,[\s\S]*buildRunEventStreamUrl,[\s\S]*parseRunEventPayload,[\s\S]*shouldPollRunStatus[\s\S]*\} from "\.\.\/\.\.\/lib\/run-event-stream\.ts";/);
  assert.match(runLifecycleControllerSource, /const streamUrl = buildRunEventStreamUrl\(runId\);/);
  assert.match(runLifecycleControllerSource, /return new EventSource\(url\);/);
  assert.doesNotMatch(componentSource, /function parseRunEventPayload\(event: Event\)/);
  assert.doesNotMatch(runLifecycleControllerSource, /parseRunEventPayloadData\(event\.data\)/);
  assert.match(runLifecycleControllerSource, /const nextPreview = buildRunEventOutputPreviewUpdate\(input\.documentsByTabId\.value\[tabId\], currentPreview, payload\);/);
  assert.match(runLifecycleControllerSource, /preserveMissing: shouldPollRunStatus\(run\.status\)/);
  assert.match(runLifecycleControllerSource, /if \(shouldPollRunStatus\(run\.status\)\) \{/);
  assert.match(runLifecycleControllerSource, /source\.addEventListener\("run\.cancelled"/);
  assert.doesNotMatch(componentSource, /function isActiveRunStatus\(status: string \| null \| undefined\)/);
  assert.doesNotMatch(componentSource, /function resolveStreamingOutputNodeIds/);
  assert.doesNotMatch(componentSource, /resolveRunEventText\(payload\)/);
  assert.doesNotMatch(componentSource, /listRunEventOutputKeys\(payload\)/);
  assert.doesNotMatch(componentSource, /resolveRunEventNodeId\(payload\)/);
  assert.doesNotMatch(componentSource, /resolveRunEventPreviewNodeIds\(documentsByTabId\.value\[tabId\]/);
  assert.doesNotMatch(componentSource, /buildRunEventOutputPreviewByNodeId\(currentPreview/);
  assert.doesNotMatch(componentSource, /for \(const nodeId of previewNodeIds\)/);
  assert.doesNotMatch(componentSource, /Array\.isArray\(payload\.output_keys\)/);
  assert.doesNotMatch(componentSource, /String\(payload\.node_id \?\? ""\)\.trim\(\)/);
  assert.doesNotMatch(componentSource, /JSON\.parse\(String\(event\.data \?\? ""\)\)/);
  assert.doesNotMatch(componentSource, /new EventSource\(`\/api\/runs\/\$\{runId\}\/events`\)/);
});

test("EditorWorkspaceShell keeps Human Review locked open while awaiting human input", () => {
  const toggleStatePanelSource = sidePanelControllerSource.match(/function toggleStatePanel\(tabId: string\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  const toggleActiveStatePanelSource =
    sidePanelControllerSource.match(/function toggleActiveStatePanel\(\) \{[\s\S]*?function sidePanelOpenWidth/)?.[0] ?? "";
  const openHumanReviewSource =
    sidePanelControllerSource.match(/function openHumanReviewPanelForTab\(tabId: string, nodeId: string \| null\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(sidePanelControllerSource, /function isHumanReviewPanelLockedOpen\(tabId: string\)/);
  assert.match(sidePanelControllerSource, /return canShowHumanReviewPanel\(tabId\) && sidePanelMode\(tabId\) === "human-review";/);
  assert.match(toggleStatePanelSource, /if \(isHumanReviewPanelLockedOpen\(tabId\)\) \{/);
  assert.match(toggleActiveStatePanelSource, /if \(isHumanReviewPanelLockedOpen\(tabId\)\) \{/);
  assert.match(toggleActiveStatePanelSource, /openHumanReviewPanelForTab\(tabId, input\.latestRunDetailByTabId\.value\[tabId\]\?\.current_node_id \?\? null\);/);
  assert.match(openHumanReviewSource, /if \(!canShowHumanReviewPanel\(tabId\)\) \{/);
  assert.match(openHumanReviewSource, /return;/);
  assert.doesNotMatch(componentSource, /function toggleStatePanel\(tabId: string\)/);
  assert.doesNotMatch(componentSource, /function toggleActiveStatePanel\(\)/);
});

test("EditorWorkspaceShell resumes restored pause snapshots against their original snapshot checkpoint", () => {
  assert.match(componentSource, /useWorkspaceRunController\(\{[\s\S]*restoredRunSnapshotIdByTabId,[\s\S]*resumeRun,[\s\S]*\}\);/);
  assert.match(runControllerSource, /input\.resumeRun\(run\.run_id, payload, input\.restoredRunSnapshotIdByTabId\.value\[tabId\] \?\? null\)/);
  assert.match(
    runControllerSource,
    /input\.restoredRunSnapshotIdByTabId\.value = setTabScopedRecordEntry\(input\.restoredRunSnapshotIdByTabId\.value, tabId, null\);/,
  );
});

test("EditorWorkspaceShell locks graph editing while a run is awaiting human review", () => {
  const guardFunctionSource = editGuardControllerSource.match(/function guardGraphEditForTab\(tabId: string\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(componentSource, /import \{[\s\S]*ElMessage[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /import \{ useWorkspaceEditGuardController \} from "\.\/useWorkspaceEditGuardController\.ts";/);
  assert.match(componentSource, /:interaction-locked="isGraphInteractionLocked\(tab\.tabId\)"/);
  assert.match(editGuardControllerSource, /function isGraphInteractionLocked\(tabId: string\)/);
  assert.match(editGuardControllerSource, /return input\.latestRunDetailByTabId\.value\[tabId\]\?\.status === "awaiting_human";/);
  assert.match(editGuardControllerSource, /function guardGraphEditForTab\(tabId: string\)/);
  assert.match(editGuardControllerSource, /function showGraphLockedEditToast\(\)/);
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
  assert.match(editGuardControllerSource, /if \(guardGraphEditForTab\(tabId\)\) \{/);
  assert.match(guardFunctionSource, /showGraphLockedEditToast\(\);/);
  assert.doesNotMatch(guardFunctionSource, /setMessageFeedbackForTab/);
});

test("EditorWorkspaceShell prompts default-named graph and template saves for metadata with floating success feedback", () => {
  assert.match(componentSource, /import \{[\s\S]*ElButton,[\s\S]*ElDialog,[\s\S]*ElInput,[\s\S]*ElMessage[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /<ElDialog[\s\S]*class="editor-workspace-shell__save-metadata-dialog"/);
  assert.match(componentSource, /const saveMetadataDialog = ref<SaveMetadataDialogState>\(createClosedSaveMetadataDialog\(\)\);/);
  assert.match(componentSource, /function requestSaveMetadataForDocument\(request: SaveMetadataRequest\)/);
  assert.match(componentSource, /readGraphSaveDescription\(request\.document\)/);
  assert.match(componentSource, /isDefaultGraphSaveName\(name\)/);
  assert.match(componentSource, /applyGraphSaveMetadata\(document,[\s\S]*description: saveMetadataDialog\.value\.description,/);
  assert.match(componentSource, /requestSaveMetadata: requestSaveMetadataForDocument,/);
  assert.match(componentSource, /showSaveSuccessToast,/);
  assert.match(componentSource, /function showSaveSuccessToast\(message: string\) \{[\s\S]*customClass:\s*"editor-workspace-shell__save-toast"[\s\S]*type:\s*"success"[\s\S]*duration:\s*3200,/);
  assert.match(componentSource, /:global\(\.editor-workspace-shell__save-toast\.el-message\) \{[\s\S]*border:\s*1px solid rgba\(22,\s*101,\s*52,\s*0\.42\);/);
  assert.match(componentSource, /animation:\s*editor-workspace-shell-save-toast-float 3\.2s ease forwards;/);
  assert.match(componentSource, /@keyframes editor-workspace-shell-save-toast-float/);
  assert.match(graphPersistenceControllerSource, /import \{ shouldRequestSaveMetadata, type SaveMetadataRequest \} from "\.\/saveMetadataModel\.ts";/);
  assert.match(graphPersistenceControllerSource, /requestSaveMetadata\?: \(request: SaveMetadataRequest\) => Promise<GraphPayload \| GraphDocument \| null>;/);
  assert.match(graphPersistenceControllerSource, /showSaveSuccessToast\?: \(message: string\) => void;/);
  assert.match(graphPersistenceControllerSource, /async function prepareDocumentForSave\(/);
  assert.match(graphPersistenceControllerSource, /shouldRequestSaveMetadata\(prunedDocument\)/);
  assert.match(graphPersistenceControllerSource, /const requestedDocument = await input\.requestSaveMetadata\(\{[\s\S]*document: prunedDocument,[\s\S]*target,[\s\S]*\}\);/);
  assert.match(graphPersistenceControllerSource, /input\.showSaveSuccessToast\?\.\(message\);/);
});

test("EditorWorkspaceShell removes the persistent bottom-left status feedback overlay", () => {
  assert.doesNotMatch(componentSource, /class="editor-workspace-shell__feedback"/);
  assert.doesNotMatch(componentSource, /editor-workspace-shell__feedback--/);
  assert.doesNotMatch(componentSource, /\.editor-workspace-shell__feedback/);
  assert.match(componentSource, /:latest-run-status="feedbackForTab\(tab\.tabId\)\?\.activeRunStatus \?\? null"/);
});

test("EditorWorkspaceShell subscribes to run events for live output previews", () => {
  assert.match(componentSource, /import \{ useWorkspaceRunLifecycleController \} from "\.\/useWorkspaceRunLifecycleController\.ts";/);
  assert.match(componentSource, /useWorkspaceRunLifecycleController\(\{[\s\S]*documentsByTabId,[\s\S]*runOutputPreviewByTabId,[\s\S]*restoredRunSnapshotIdByTabId,[\s\S]*fetchRun,[\s\S]*applyRunVisualStateToTab,[\s\S]*openHumanReviewPanelForTab,[\s\S]*persistRunStateValuesForTab,[\s\S]*setMessageFeedbackForTab,[\s\S]*\}\);/);
  assert.match(runLifecycleControllerSource, /const runEventSourceByTabId = new Map<string, RunEventSourceLike>\(\);/);
  assert.match(runLifecycleControllerSource, /function startRunEventStreamForTab\(tabId: string, runId: string\)/);
  assert.match(runLifecycleControllerSource, /return new EventSource\(url\);/);
  assert.match(runLifecycleControllerSource, /addEventListener\("node\.output\.delta"/);
  assert.match(runLifecycleControllerSource, /function applyStreamingOutputPreviewToTab/);
  assert.match(runLifecycleControllerSource, /buildRunEventOutputPreviewUpdate/);
  assert.match(componentSource, /useWorkspaceRunController\(\{[\s\S]*startRunEventStreamForTab,[\s\S]*\}\);/);
  assert.match(runControllerSource, /input\.startRunEventStreamForTab\(tabId, runId\);/);
});

test("EditorWorkspaceShell runs the latest document after async model refresh", () => {
  assert.match(componentSource, /import \{ useWorkspaceRunController \} from "\.\/useWorkspaceRunController\.ts";/);
  assert.match(componentSource, /const \{ runActiveGraph, resumeHumanReviewRun \} = useWorkspaceRunController\(\{/);
  assert.match(runControllerSource, /await input\.refreshAgentModels\(\);/);
  assert.match(runControllerSource, /const latestDocument = input\.documentsByTabId\.value\[tab\.tabId\];/);
  assert.match(runControllerSource, /if \(!latestDocument\) \{[\s\S]*?return;[\s\S]*?\}/);
  assert.match(runControllerSource, /const response = await input\.runGraph\(latestDocument\);/);
  assert.doesNotMatch(runControllerSource, /const response = await input\.runGraph\(document\);/);
});

test("EditorWorkspaceShell surfaces run request errors as a prominent toast", () => {
  assert.match(
    componentSource,
    /useWorkspaceRunController\(\{[\s\S]*setMessageFeedbackForTab,[\s\S]*showRunErrorToast,[\s\S]*translate: \(key, params\) => t\(key, params \?\? \{\}\),[\s\S]*\}\);/,
  );
  assert.match(runControllerSource, /input\.showRunErrorToast\(message\);/);
  assert.match(componentSource, /function showRunErrorToast\(message: string\)/);
  assert.match(
    componentSource,
    /ElMessage\(\{[\s\S]*customClass:\s*"editor-workspace-shell__run-error-toast",[\s\S]*type:\s*"error",[\s\S]*duration:\s*9000,/,
  );
  assert.match(componentSource, /:global\(\.editor-workspace-shell__run-error-toast\.el-message\)/);
  assert.match(componentSource, /:global\(\.editor-workspace-shell__run-error-toast \.el-message__content\) \{[\s\S]*white-space:\s*pre-wrap;/);
});

test("EditorWorkspaceShell persists graph document drafts across route changes and app restarts", () => {
  const ensureDocumentsSource =
    openControllerSource.match(/function ensureUnsavedTabDocuments\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  const loadExistingSource =
    openControllerSource.match(/async function loadExistingGraphIntoTab\(tabId: string, graphId: string\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  const openExistingSource =
    openControllerSource.match(/function openExistingGraph\(graphId: string, navigation: RouteNavigation = "push"\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(openControllerSource, /import \{[\s\S]*listTabsMissingDocumentDrafts,[\s\S]*resolveExistingGraphDocumentHydrationSource,[\s\S]*resolveUnsavedGraphDocumentHydrationSource,[\s\S]*shouldHydrateExistingGraphDocument[\s\S]*\} from "\.\/editorDraftPersistenceModel\.ts";/);
  assert.match(openControllerSource, /readPersistedEditorDocumentDraft/);
  assert.match(documentStateSource, /writePersistedEditorDocumentDraft/);
  assert.match(componentSource, /removePersistedEditorDocumentDraft/);
  assert.match(componentSource, /prunePersistedEditorDocumentDrafts/);
  assert.match(ensureDocumentsSource, /for \(const tab of listTabsMissingDocumentDrafts\(input\.workspace\.value\.tabs, input\.documentsByTabId\.value\)\)/);
  assert.match(ensureDocumentsSource, /const hydrationSource = resolveUnsavedGraphDocumentHydrationSource\(persistedDraft\);/);
  assert.match(ensureDocumentsSource, /hydrationSource\.type === "persisted" \? hydrationSource\.document : createDraftForTab\(tab\)/);
  assert.doesNotMatch(ensureDocumentsSource, /persistedDraft \?\? createDraftForTab\(tab\)/);
  assert.match(loadExistingSource, /!shouldHydrateExistingGraphDocument\(\{[\s\S]*hasDocument: Boolean\(input\.documentsByTabId\.value\[tabId\]\),[\s\S]*isLoading: Boolean\(input\.loadingByTabId\.value\[tabId\]\),[\s\S]*\}\)/);
  assert.match(loadExistingSource, /const hydrationSource = resolveExistingGraphDocumentHydrationSource\(\{ persistedDraft, cachedGraph: null \}\);/);
  assert.match(openExistingSource, /nextTabId &&[\s\S]*shouldHydrateExistingGraphDocument\(\{[\s\S]*hasDocument: Boolean\(input\.documentsByTabId\.value\[nextTabId\]\),[\s\S]*isLoading: Boolean\(input\.loadingByTabId\.value\[nextTabId\]\),[\s\S]*\}\)/);
  assert.match(openExistingSource, /const hydrationSource = resolveExistingGraphDocumentHydrationSource\(\{ persistedDraft, cachedGraph: graph \}\);/);
  assert.match(documentStateSource, /writePersistedEditorDocumentDraft\(tabId, nextDocument\);/);
  assert.match(componentSource, /removeDocumentDraft: removePersistedEditorDocumentDraft,/);
  assert.match(tabLifecycleControllerSource, /input\.removeDocumentDraft\(tabId\);/);
  assert.match(componentSource, /prunePersistedEditorDocumentDrafts\(persistenceRequest\.tabIds\);/);
});

test("EditorWorkspaceShell delegates workspace draft watcher decisions to the draft persistence model", () => {
  const workspacePersistenceWatcherSource =
    componentSource.match(/watch\(\s*workspace,[\s\S]*?\{ deep: true \},\s*\);/)?.[0] ?? "";
  const workspaceHydrationWatcherSource =
    componentSource.match(/watch\(\s*\[\(\) => workspace\.value\.tabs, \(\) => props\.templates\],[\s\S]*?\{ deep: true \},\s*\);/)?.[0] ?? "";

  assert.match(componentSource, /import \{[\s\S]*resolveWorkspaceDraftPersistenceRequest,[\s\S]*shouldRunWorkspaceDraftHydration[\s\S]*\} from "\.\/editorDraftPersistenceModel\.ts";/);
  assert.match(workspacePersistenceWatcherSource, /const persistenceRequest = resolveWorkspaceDraftPersistenceRequest\(\{ hydrated: hydrated\.value, workspace: nextWorkspace \}\);/);
  assert.match(workspacePersistenceWatcherSource, /if \(!persistenceRequest\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(workspacePersistenceWatcherSource, /writePersistedEditorWorkspace\(persistenceRequest\.workspace\);/);
  assert.match(workspacePersistenceWatcherSource, /prunePersistedEditorDocumentDrafts\(persistenceRequest\.tabIds\);/);
  assert.match(workspacePersistenceWatcherSource, /prunePersistedEditorViewportDrafts\(persistenceRequest\.tabIds\);/);
  assert.doesNotMatch(workspacePersistenceWatcherSource, /nextWorkspace\.tabs\.map\(\(tab\) => tab\.tabId\)/);
  assert.match(workspaceHydrationWatcherSource, /if \(!shouldRunWorkspaceDraftHydration\(hydrated\.value\)\) \{[\s\S]*return;[\s\S]*\}/);
  assert.doesNotMatch(workspaceHydrationWatcherSource, /if \(!hydrated\.value\)/);
});

test("EditorWorkspaceShell delegates tab runtime record cleanup to the runtime model", () => {
  const clearTabRuntimeSource = tabLifecycleControllerSource.match(/function clearTabRuntime\(tabId: string\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(componentSource, /import \{ useWorkspaceTabLifecycleController \} from "\.\/useWorkspaceTabLifecycleController\.ts";/);
  assert.match(tabLifecycleControllerSource, /import \{ omitTabScopedRecordEntry \} from "\.\/editorTabRuntimeModel\.ts";/);
  assert.match(clearTabRuntimeSource, /input\.cancelRunPolling\(tabId\);/);
  assert.match(clearTabRuntimeSource, /input\.cancelRunEventStreamForTab\(tabId\);/);
  assert.match(clearTabRuntimeSource, /clearRecord\(input\.documentsByTabId, tabId\);/);
  assert.match(clearTabRuntimeSource, /clearRecord\(input\.loadingByTabId, tabId\);/);
  assert.match(clearTabRuntimeSource, /clearRecord\(input\.feedbackByTabId, tabId\);/);
  assert.match(clearTabRuntimeSource, /clearRecord\(input\.viewportByTabId, tabId\);/);
  assert.match(clearTabRuntimeSource, /clearRecord\(input\.runNodeTimingByTabId, tabId\);/);
  assert.match(clearTabRuntimeSource, /clearRecord\(input\.runOutputPreviewByTabId, tabId\);/);
  assert.match(clearTabRuntimeSource, /clearRecord\(input\.activeRunEdgeIdsByTabId, tabId\);/);
  assert.doesNotMatch(clearTabRuntimeSource, /delete next[A-Za-z]+\[tabId\]/);
});

test("EditorWorkspaceShell delegates tab runtime feedback and preview writes to the runtime model", () => {
  const setFeedbackSource = runVisualStateSource;
  const applyPreviewSource =
    runLifecycleControllerSource.match(/function applyStreamingOutputPreviewToTab\([\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(
    runLifecycleControllerSource,
    /import \{ setTabScopedRecordEntry \} from "\.\/editorTabRuntimeModel\.ts";/,
  );
  assert.match(componentSource, /import \{ useWorkspaceRunVisualState, type WorkspaceRunFeedback \} from "\.\/useWorkspaceRunVisualState\.ts";/);
  assert.match(setFeedbackSource, /input\.feedbackByTabId\.value = setTabScopedRecordEntry\(input\.feedbackByTabId\.value, tabId, feedback\);/);
  assert.match(applyPreviewSource, /input\.runOutputPreviewByTabId\.value = setTabScopedRecordEntry\(input\.runOutputPreviewByTabId\.value, tabId, nextPreview\);/);
  assert.match(
    runVisualStateSource,
    /input\.runOutputPreviewByTabId\.value = setTabScopedRecordEntry\(\s*input\.runOutputPreviewByTabId\.value,\s*tabId,\s*mergeRunOutputPreviewByNodeId/,
  );
  assert.doesNotMatch(setFeedbackSource, /input\.feedbackByTabId\.value = \{/);
  assert.doesNotMatch(applyPreviewSource, /input\.runOutputPreviewByTabId\.value = \{/);
});

test("EditorWorkspaceShell delegates run visual tab-state writes to the runtime model", () => {
  const applyRunVisualSource = runVisualStateSource;
  const pollRunSource = runLifecycleControllerSource;

  assert.match(
    applyRunVisualSource,
    /input\.latestRunDetailByTabId\.value = setTabScopedRecordEntry\(input\.latestRunDetailByTabId\.value, tabId, visualRun\);/,
  );
  assert.match(
    applyRunVisualSource,
    /input\.runNodeStatusByTabId\.value = setTabScopedRecordEntry\(input\.runNodeStatusByTabId\.value, tabId, visualRun\.node_status_map \?\? \{\}\);/,
  );
  assert.match(
    applyRunVisualSource,
    /buildRunNodeTimingByNodeIdFromRun\(visualRun,\s*document\)/,
  );
  assert.match(
    applyRunVisualSource,
    /input\.currentRunNodeIdByTabId\.value = setTabScopedRecordEntry\(input\.currentRunNodeIdByTabId\.value, tabId, visualRun\.current_node_id \?\? null\);/,
  );
  assert.match(
    applyRunVisualSource,
    /input\.runFailureMessageByTabId\.value = setTabScopedRecordEntry\(\s*input\.runFailureMessageByTabId\.value,\s*tabId,\s*runArtifactsModel\.failedMessageByNodeId,/,
  );
  assert.match(
    applyRunVisualSource,
    /input\.activeRunEdgeIdsByTabId\.value = setTabScopedRecordEntry\(input\.activeRunEdgeIdsByTabId\.value, tabId, runArtifactsModel\.activeEdgeIds\);/,
  );
  assert.match(
    pollRunSource,
    /input\.applyRunVisualStateToTab\(tabId, run, input\.documentsByTabId\.value\[tabId\], run, \{ preserveMissing: shouldPollRunStatus\(run\.status\) \}\);/,
  );
  assert.match(
    pollRunSource,
    /input\.restoredRunSnapshotIdByTabId\.value = setTabScopedRecordEntry\(input\.restoredRunSnapshotIdByTabId\.value, tabId, null\);/,
  );
  assert.doesNotMatch(componentSource, /function applyRunVisualStateToTab\(/);
  assert.doesNotMatch(pollRunSource, /\[tabId\]: run,/);
});

test("EditorWorkspaceShell delegates document load tab-state writes to the runtime model", () => {
  const registerDocumentSource = documentStateSource;
  const loadExistingSource =
    openControllerSource.match(/async function loadExistingGraphIntoTab\(tabId: string, graphId: string\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(registerDocumentSource, /input\.documentsByTabId\.value = setTabScopedRecordEntry\(input\.documentsByTabId\.value, tabId, nextDocument\);/);
  assert.match(registerDocumentSource, /input\.loadingByTabId\.value = setTabScopedRecordEntry\(input\.loadingByTabId\.value, tabId, false\);/);
  assert.match(registerDocumentSource, /input\.errorByTabId\.value = setTabScopedRecordEntry\(input\.errorByTabId\.value, tabId, null\);/);
  assert.match(loadExistingSource, /input\.loadingByTabId\.value = setTabScopedRecordEntry\(input\.loadingByTabId\.value, tabId, true\);/);
  assert.match(loadExistingSource, /input\.errorByTabId\.value = setTabScopedRecordEntry\(input\.errorByTabId\.value, tabId, null\);/);
  assert.match(
    loadExistingSource,
    /input\.errorByTabId\.value = setTabScopedRecordEntry\(\s*input\.errorByTabId\.value,\s*tabId,\s*error instanceof Error \? error\.message : "Failed to load graph\.",\s*\);/,
  );
  assert.doesNotMatch(registerDocumentSource, /input\.documentsByTabId\.value = \{/);
  assert.doesNotMatch(loadExistingSource, /input\.loadingByTabId\.value = \{/);
});

test("EditorWorkspaceShell delegates run invocation tab-state writes to the runtime model", () => {
  assert.match(componentSource, /useWorkspaceRunController\(\{/);
  assert.match(componentSource, /runNodeStatusByTabId,/);
  assert.match(componentSource, /runNodeTimingByTabId,/);
  assert.match(componentSource, /humanReviewBusyByTabId,/);
  assert.doesNotMatch(componentSource, /async function runActiveGraph\(\)/);
  assert.doesNotMatch(componentSource, /async function resumeHumanReviewRun\(tabId: string, payload: Record<string, unknown>\)/);
  assert.match(
    runControllerSource,
    /input\.runNodeStatusByTabId\.value = setTabScopedRecordEntry\(input\.runNodeStatusByTabId\.value, tabId, \{\}\);/,
  );
  assert.match(
    runControllerSource,
    /input\.runNodeTimingByTabId\.value = setTabScopedRecordEntry\(input\.runNodeTimingByTabId\.value, tabId, \{\}\);/,
  );
  assert.match(
    runControllerSource,
    /input\.currentRunNodeIdByTabId\.value = setTabScopedRecordEntry\(input\.currentRunNodeIdByTabId\.value, tabId, null\);/,
  );
  assert.match(
    runControllerSource,
    /input\.runOutputPreviewByTabId\.value = setTabScopedRecordEntry\(input\.runOutputPreviewByTabId\.value, tabId, \{\}\);/,
  );
  assert.match(
    runControllerSource,
    /input\.activeRunEdgeIdsByTabId\.value = setTabScopedRecordEntry\(input\.activeRunEdgeIdsByTabId\.value, tabId, \[\]\);/,
  );
  assert.match(
    runControllerSource,
    /input\.humanReviewErrorByTabId\.value = setTabScopedRecordEntry\(input\.humanReviewErrorByTabId\.value, tabId, null\);/,
  );
  assert.match(
    runControllerSource,
    /input\.humanReviewBusyByTabId\.value = setTabScopedRecordEntry\(input\.humanReviewBusyByTabId\.value, tabId, true\);/,
  );
  assert.match(
    runControllerSource,
    /input\.humanReviewErrorByTabId\.value = setTabScopedRecordEntry\(input\.humanReviewErrorByTabId\.value, tabId, null\);/,
  );
  assert.match(
    runControllerSource,
    /input\.latestRunDetailByTabId\.value = setTabScopedRecordEntry\(input\.latestRunDetailByTabId\.value, tabId, \{[\s\S]*\.\.\.run,[\s\S]*run_id: response\.run_id,[\s\S]*status: response\.status,[\s\S]*\}\);/,
  );
  assert.match(
    runControllerSource,
    /input\.restoredRunSnapshotIdByTabId\.value = setTabScopedRecordEntry\(input\.restoredRunSnapshotIdByTabId\.value, tabId, null\);/,
  );
  assert.match(
    runControllerSource,
    /input\.humanReviewErrorByTabId\.value = setTabScopedRecordEntry\(\s*input\.humanReviewErrorByTabId\.value,\s*tabId,\s*error instanceof Error \? error\.message : input\.translate\("humanReview\.resumeFailed"\),\s*\);/,
  );
  assert.match(
    runControllerSource,
    /input\.humanReviewBusyByTabId\.value = setTabScopedRecordEntry\(input\.humanReviewBusyByTabId\.value, tabId, false\);/,
  );
  assert.doesNotMatch(runControllerSource, /value = \{[\s\S]*\[tabId\]:/);
});

test("EditorWorkspaceShell delegates panel and focus tab-state writes to the runtime model", () => {
  const setDocumentSource = documentStateSource;
  const panelFocusSource = sidePanelControllerSource;

  assert.match(setDocumentSource, /input\.documentsByTabId\.value = setTabScopedRecordEntry\(input\.documentsByTabId\.value, tabId, nextDocument\);/);
  assert.match(
    panelFocusSource,
    /input\.statePanelOpenByTabId\.value = setTabScopedRecordEntry\(input\.statePanelOpenByTabId\.value, tabId, !isStatePanelOpen\(tabId\)\);/,
  );
  assert.match(panelFocusSource, /input\.sidePanelModeByTabId\.value = setTabScopedRecordEntry\(input\.sidePanelModeByTabId\.value, tabId, "human-review"\);/);
  assert.match(panelFocusSource, /input\.statePanelOpenByTabId\.value = setTabScopedRecordEntry\(input\.statePanelOpenByTabId\.value, tabId, true\);/);
  assert.match(panelFocusSource, /input\.focusedNodeIdByTabId\.value = setTabScopedRecordEntry\(input\.focusedNodeIdByTabId\.value, tabId, nodeId\);/);
  assert.match(panelFocusSource, /input\.focusRequestByTabId\.value = setTabScopedRecordEntry\(input\.focusRequestByTabId\.value, tabId, null\);/);
  assert.match(
    panelFocusSource,
    /input\.focusRequestByTabId\.value = setTabScopedRecordEntry\(\s*input\.focusRequestByTabId\.value,\s*tabId,\s*\{\s*nodeId,\s*sequence: previousSequence \+ 1,\s*\}\s*\);/,
  );
  assert.match(panelFocusSource, /input\.sidePanelModeByTabId\.value = setTabScopedRecordEntry\(input\.sidePanelModeByTabId\.value, tabId, "state"\);/);
  assert.doesNotMatch(setDocumentSource, /input\.documentsByTabId\.value = \{/);
  assert.doesNotMatch(panelFocusSource, /input\.statePanelOpenByTabId\.value = \{/);
  assert.doesNotMatch(panelFocusSource, /input\.sidePanelModeByTabId\.value = \{/);
  assert.doesNotMatch(panelFocusSource, /input\.focusedNodeIdByTabId\.value = \{/);
  assert.doesNotMatch(panelFocusSource, /input\.focusRequestByTabId\.value = \{/);
});

test("EditorWorkspaceShell centralizes dirty graph document commits", () => {
  const commitSource = documentStateSource;
  const markDocumentDirtySource = documentStateSource;
  const positionSource =
    editGuardControllerSource.match(/function handleNodePositionUpdate\(tabId: string, payload: \{ nodeId: string; position: GraphPosition \}\) \{[\s\S]*?\n  \}/)?.[0] ??
    "";
  const sizeSource =
    editGuardControllerSource.match(/function handleNodeSizeUpdate\(tabId: string, payload: \{ nodeId: string; position: GraphPosition; size: GraphNodeSize \}\) \{[\s\S]*?\n  \}/)?.[0] ??
    "";
  const renameSource =
    graphPersistenceControllerSource.match(/function renameActiveGraph\(name: string\) \{[\s\S]*?\n  \}\n\n  async function saveTab/)?.[0] ?? "";

  assert.match(commitSource, /setDocumentForTab\(tabId, nextDocument\);/);
  assert.match(commitSource, /applyDocumentMetaToWorkspaceTab\(input\.workspace\.value, tabId, \{/);
  assert.match(commitSource, /dirty: true,/);
  assert.match(markDocumentDirtySource, /commitDirtyDocumentForTab\(tabId, nextDocument\);/);
  assert.match(positionSource, /input\.commitDirtyDocumentForTab\(tabId, nextDocument\);/);
  assert.match(sizeSource, /input\.commitDirtyDocumentForTab\(tabId, nextDocument\);/);
  assert.match(renameSource, /input\.commitDirtyDocumentForTab\(tab\.tabId, nextDocument\);/);
  assert.doesNotMatch(positionSource, /updateWorkspace\(/);
  assert.doesNotMatch(sizeSource, /updateWorkspace\(/);
  assert.doesNotMatch(renameSource, /updateWorkspace\(/);
});

test("EditorWorkspaceShell centralizes simple graph mutation commits", () => {
  const mutationHelperSource =
    graphMutationActionsSource.match(
      /function commitDocumentMutationForTab\(\s*tabId: string,[\s\S]*?\n  \}\n\n  function addStateReaderBinding/,
    )?.[0] ?? "";
  const addStateReaderSource =
    graphMutationActionsSource.match(/function addStateReaderBinding\(tabId: string, stateKey: string, nodeId: string\) \{[\s\S]*?\n  \}\n\n  function removeStateReaderBinding/)?.[0] ??
    "";
  const bindPortSource =
    graphMutationActionsSource.match(/function bindNodePortStateForTab\(tabId: string, nodeId: string, side: "input" \| "output", stateKey: string\) \{[\s\S]*?\n  \}\n\n  function removeNodePortStateForTab/)?.[0] ??
    "";
  const connectFlowSource =
    graphMutationActionsSource.match(/function connectFlowNodesForTab\(tabId: string, sourceNodeId: string, targetNodeId: string\) \{[\s\S]*?\n  \}\n\n  function connectStateBindingForTab/)?.[0] ??
    "";
  const updateAgentSource =
    graphMutationActionsSource.match(/function updateAgentConfigForTab\(tabId: string, nodeId: string, patch: Partial<AgentNode\["config"\]>\) \{[\s\S]*?\n  \}\n\n  function toggleAgentBreakpointForTab/)?.[0] ??
    "";
  const updateStateFieldSource =
    graphMutationActionsSource.match(/function updateStateField\(tabId: string, stateKey: string, patch: Partial<StateDefinition>\) \{[\s\S]*?\n  \}\n\n  function formatStateDefinitionLabel/)?.[0] ??
    "";

  assert.match(mutationHelperSource, /const document = input\.documentsByTabId\.value\[tabId\];/);
  assert.match(mutationHelperSource, /const nextDocument = mutate\(document\);/);
  assert.match(mutationHelperSource, /if \(nextDocument === document\) \{/);
  assert.match(mutationHelperSource, /input\.markDocumentDirty\(tabId, nextDocument\);/);
  assert.match(mutationHelperSource, /if \("focusNodeId" in options\) \{/);
  assert.match(mutationHelperSource, /return nextDocument;/);
  assert.match(addStateReaderSource, /commitDocumentMutationForTab\(\s*tabId,[\s\S]*addStateBindingToDocument\(document, stateKey, nodeId, "read"\),[\s\S]*focusNodeId: nodeId,[\s\S]*\);/);
  assert.match(bindPortSource, /commitDocumentMutationForTab\(\s*tabId,[\s\S]*addStateBindingToDocument\(document, stateKey, nodeId, side === "input" \? "read" : "write"\),[\s\S]*focusNodeId: nodeId,[\s\S]*\);/);
  assert.match(
    connectFlowSource,
    /commitDocumentMutationForTab\(\s*tabId,\s*\(document\) => connectFlowNodesInDocument\(document, sourceNodeId, targetNodeId\),\s*\{\s*focusNodeId: targetNodeId,\s*\}\s*\);/,
  );
  assert.match(updateAgentSource, /commitDocumentMutationForTab\(\s*tabId,[\s\S]*updateAgentNodeConfigInDocument\(document, nodeId, \(current\) => \(\{[\s\S]*\.\.\.current,[\s\S]*\.\.\.patch,[\s\S]*\}\), \{ skillDefinitions: input\.skillDefinitions\.value \}\),[\s\S]*focusNodeId: nodeId,[\s\S]*\);/);
  assert.match(updateStateFieldSource, /commitDocumentMutationForTab\(\s*tabId,[\s\S]*updateStateFieldInDocument\(document, stateKey, \(current\) => \(\{[\s\S]*\.\.\.current,[\s\S]*\.\.\.patch,[\s\S]*\}\)\),[\s\S]*\);/);
  assert.doesNotMatch(addStateReaderSource, /const nextDocument = addStateBindingToDocument/);
  assert.doesNotMatch(bindPortSource, /const nextDocument = addStateBindingToDocument/);
  assert.doesNotMatch(updateAgentSource, /const nextDocument = updateAgentNodeConfigInDocument/);
});

test("EditorWorkspaceShell persists terminal run state values into the graph draft", () => {
  assert.match(documentStateSource, /import \{ applyRunWrittenStateValuesToDocument \} from "\.\/runStatePersistence\.ts";/);
  assert.match(documentStateSource, /function persistRunStateValuesForTab\(tabId: string, run: RunDetail\)/);
  assert.match(documentStateSource, /const nextDocument = applyRunWrittenStateValuesToDocument\(document, run\);/);
  assert.match(documentStateSource, /if \(nextDocument !== document\) \{[\s\S]*setDocumentForTab\(tabId, nextDocument\);[\s\S]*\}/);
  assert.match(componentSource, /persistRunStateValuesForTab,/);
  assert.match(runLifecycleControllerSource, /input\.persistRunStateValuesForTab\(tabId, run\);/);
});

test("EditorWorkspaceShell delegates graph persistence actions to a workspace controller", () => {
  assert.match(componentSource, /import \{ useWorkspaceGraphPersistenceController \} from "\.\/useWorkspaceGraphPersistenceController\.ts";/);
  assert.match(
    componentSource,
    /const \{[\s\S]*renameActiveGraph,[\s\S]*saveActiveGraph,[\s\S]*saveTab,[\s\S]*validateActiveGraph,[\s\S]*exportActiveGraph,[\s\S]*\} = useWorkspaceGraphPersistenceController\(\{/,
  );
  assert.match(graphPersistenceControllerSource, /async function saveTab\(tabId: string\)/);
  assert.match(graphPersistenceControllerSource, /const response = await input\.saveGraph\(documentToSave\);/);
  assert.match(graphPersistenceControllerSource, /const savedGraph = await input\.fetchGraph\(response\.graph_id\);/);
  assert.match(graphPersistenceControllerSource, /input\.syncRouteToTab\(/);
  assert.match(graphPersistenceControllerSource, /async function validateActiveGraph\(\)/);
  assert.match(graphPersistenceControllerSource, /formatValidationFeedback\(response\);/);
  assert.match(graphPersistenceControllerSource, /async function exportActiveGraph\(\)/);
  assert.match(graphPersistenceControllerSource, /input\.downloadPythonSource\(source, fileName\);/);
  assert.doesNotMatch(componentSource, /async function saveTab\(tabId: string\)/);
  assert.doesNotMatch(componentSource, /async function validateActiveGraph\(\)/);
  assert.doesNotMatch(componentSource, /async function exportActiveGraph\(\)/);
});

test("EditorWorkspaceShell renders the graph action controls as a detached capsule instead of passing them through EditorTabBar", () => {
  const editorTabBarUsage = componentSource.match(/<EditorTabBar[\s\S]*?\/>/)?.[0] ?? "";

  assert.match(componentSource, /import EditorActionCapsule from "\.\/EditorActionCapsule\.vue";/);
  assert.match(componentSource, /<EditorActionCapsule[\s\S]*:active-state-count="activeStateCount"[\s\S]*:is-state-panel-open="activeStatePanelOpen"[\s\S]*:is-run-activity-panel-open="activeRunActivityPanelOpen"[\s\S]*:has-run-activity-hint="activeRunActivityPanelHint"/);
  assert.match(componentSource, /@toggle-run-activity-panel="toggleActiveRunActivityPanelFromActionCapsule"/);
  assert.match(componentSource, /@save-active-graph="saveActiveGraph"/);
  assert.match(componentSource, /@validate-active-graph="validateActiveGraph"/);
  assert.match(componentSource, /@import-python-graph="openPythonGraphImportDialog"/);
  assert.match(componentSource, /@export-active-graph="exportActiveGraph"/);
  assert.match(componentSource, /@run-active-graph="runActiveGraph"/);
  assert.match(editorTabBarUsage, /<EditorTabBar/);
  assert.doesNotMatch(editorTabBarUsage, /@save-active-graph=/);
  assert.doesNotMatch(editorTabBarUsage, /@run-active-graph=/);
});

test("EditorWorkspaceShell mounts Run Activity as a realtime side panel beside State", () => {
  assert.match(componentSource, /import EditorRunActivityPanel from "\.\/EditorRunActivityPanel\.vue";/);
  assert.match(componentSource, /import type \{ RunActivityState \} from "\.\/runActivityModel\.ts";/);
  assert.match(componentSource, /const runActivityByTabId = ref<Record<string, RunActivityState>>\(\{\}\);/);
  assert.match(
    componentSource,
    /const \{[\s\S]*activeRunActivityPanelOpen,[\s\S]*shouldShowRunActivityPanel,[\s\S]*toggleActiveRunActivityPanel,[\s\S]*\} = useWorkspaceSidePanelController\(\{/,
  );
  assert.match(componentSource, /<EditorRunActivityPanel[\s\S]*:entries="runActivityByTabId\[tab\.tabId\]\?\.entries \?\? \[\]"/);
  assert.match(componentSource, /:run-status="latestRunDetailByTabId\[tab\.tabId\]\?\.status \?\? feedbackForTab\(tab\.tabId\)\?\.activeRunStatus \?\? null"/);
  assert.match(componentSource, /@toggle="toggleStatePanel\(tab\.tabId\)"/);
  assert.match(tabLifecycleControllerSource, /runActivityByTabId: TabScopedRecordRef<RunActivityState>;/);
  assert.match(tabLifecycleControllerSource, /clearRecord\(input\.runActivityByTabId, tabId\);/);
});

test("EditorWorkspaceShell hints Run Activity instead of opening it when a run starts or resumes", () => {
  assert.doesNotMatch(componentSource, /openRunActivityPanelForTab/);
  assert.match(componentSource, /const runActivityHintByTabId = ref<Record<string, boolean>>\(\{\}\);/);
  assert.match(componentSource, /const activeRunActivityPanelHint = computed\(\(\) => \{/);
  assert.match(componentSource, /function markRunActivityPanelHintForTab\(tabId: string\)/);
  assert.match(componentSource, /function toggleActiveRunActivityPanelFromActionCapsule\(\)/);
  assert.match(
    componentSource,
    /useWorkspaceRunController\(\{[\s\S]*startRunEventStreamForTab,[\s\S]*pollRunForTab,[\s\S]*markRunActivityPanelHintForTab,[\s\S]*setFeedbackForTab,[\s\S]*\}\);/,
  );
  assert.match(sidePanelControllerSource, /function openRunActivityPanelForTab\(tabId: string\)/);
  assert.match(sidePanelControllerSource, /if \(isHumanReviewPanelLockedOpen\(tabId\)\) \{[\s\S]*return;/);
  assert.match(sidePanelControllerSource, /input\.sidePanelModeByTabId\.value = setTabScopedRecordEntry\(input\.sidePanelModeByTabId\.value, tabId, "run-activity"\);/);
  assert.match(sidePanelControllerSource, /input\.statePanelOpenByTabId\.value = setTabScopedRecordEntry\(input\.statePanelOpenByTabId\.value, tabId, true\);/);
  assert.match(runControllerSource, /input\.markRunActivityPanelHintForTab\(tab\.tabId\);/);
  assert.match(runControllerSource, /input\.markRunActivityPanelHintForTab\(tabId\);/);
  assert.doesNotMatch(runControllerSource, /input\.openRunActivityPanelForTab/);
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
