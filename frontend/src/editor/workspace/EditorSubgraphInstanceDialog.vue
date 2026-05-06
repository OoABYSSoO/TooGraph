<template>
  <ElDialog
    class="editor-subgraph-instance-dialog"
    :model-value="open"
    :show-close="false"
    :close-on-click-modal="false"
    :modal-class="'editor-subgraph-instance-dialog__overlay'"
    width="min(1280px, calc(100vw - 40px))"
    append-to-body
    @update:model-value="handleOpenChange"
  >
    <section class="editor-subgraph-instance-dialog__shell">
      <header class="editor-subgraph-instance-dialog__header">
        <div>
          <span class="editor-subgraph-instance-dialog__eyebrow">Subgraph Instance</span>
          <h2 class="editor-subgraph-instance-dialog__title">{{ resolvedTitle }}</h2>
        </div>
        <p class="editor-subgraph-instance-dialog__copy">Editing this embedded copy only.</p>
        <ElButton
          class="editor-subgraph-instance-dialog__close-button"
          circle
          :aria-label="t('common.close')"
          @click="handleOpenChange(false)"
        >
          <ElIcon aria-hidden="true"><Close /></ElIcon>
        </ElButton>
      </header>

      <div class="editor-subgraph-instance-dialog__canvas-shell">
        <EditorCanvas
          v-if="subgraphDocument"
          :document="subgraphDocument"
          :knowledge-bases="knowledgeBases"
          :skill-definitions="skillDefinitions"
          :skill-definitions-loading="skillDefinitionsLoading"
          :skill-definitions-error="skillDefinitionsError"
          :available-agent-model-refs="availableAgentModelRefs"
          :agent-model-display-lookup="agentModelDisplayLookup"
          :global-text-model-ref="globalTextModelRef"
          :selected-node-id="focusedNodeIdByTabId[SUBGRAPH_EDITOR_TAB_ID] ?? null"
          :initial-viewport="viewportByTabId[SUBGRAPH_EDITOR_TAB_ID] ?? null"
          :state-editor-request="dataEdgeStateEditorRequestByTabId[SUBGRAPH_EDITOR_TAB_ID] ?? null"
          @select-node="focusNodeForTab(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @update-node-metadata="updateNodeMetadataForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.patch)"
          @update-input-config="updateInputConfigForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.patch)"
          @update-input-state="updateStateField(SUBGRAPH_EDITOR_TAB_ID, $event.stateKey, $event.patch)"
          @update-state="updateStateField(SUBGRAPH_EDITOR_TAB_ID, $event.stateKey, $event.patch)"
          @remove-port-state="removeNodePortStateForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.side, $event.stateKey)"
          @reorder-port-state="reorderNodePortStateForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.side, $event.stateKey, $event.targetIndex)"
          @disconnect-data-edge="disconnectDataEdgeForTab(SUBGRAPH_EDITOR_TAB_ID, $event.sourceNodeId, $event.targetNodeId, $event.stateKey, $event.mode)"
          @update-agent-config="updateAgentConfigForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.patch)"
          @toggle-agent-breakpoint="toggleAgentBreakpointForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.enabled)"
          @update-agent-breakpoint-timing="updateAgentBreakpointTimingForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.timing)"
          @update-condition-config="updateConditionConfigForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.patch)"
          @update-condition-branch="updateConditionBranchForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.currentKey, $event.nextKey, $event.mappingKeys)"
          @add-condition-branch="addConditionBranchForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId)"
          @remove-condition-branch="removeConditionBranchForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.branchKey)"
          @bind-port-state="bindNodePortStateForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.side, $event.stateKey)"
          @create-port-state="createNodePortStateForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.side, $event.field)"
          @delete-node="deleteNodeForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId)"
          @connect-state="connectStateBindingForTab(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @connect-state-input-source="connectStateInputSourceForTab(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @connect-flow="connectFlowNodesForTab(SUBGRAPH_EDITOR_TAB_ID, $event.sourceNodeId, $event.targetNodeId)"
          @connect-route="connectConditionRouteForTab(SUBGRAPH_EDITOR_TAB_ID, $event.sourceNodeId, $event.branchKey, $event.targetNodeId)"
          @reconnect-flow="reconnectFlowEdgeForTab(SUBGRAPH_EDITOR_TAB_ID, $event.sourceNodeId, $event.currentTargetNodeId, $event.nextTargetNodeId)"
          @reconnect-route="reconnectConditionRouteForTab(SUBGRAPH_EDITOR_TAB_ID, $event.sourceNodeId, $event.branchKey, $event.nextTargetNodeId)"
          @remove-flow="removeFlowEdgeForTab(SUBGRAPH_EDITOR_TAB_ID, $event.sourceNodeId, $event.targetNodeId)"
          @remove-route="removeConditionRouteForTab(SUBGRAPH_EDITOR_TAB_ID, $event.sourceNodeId, $event.branchKey)"
          @update-output-config="updateOutputConfigForTab(SUBGRAPH_EDITOR_TAB_ID, $event.nodeId, $event.patch)"
          @update:node-position="handleNodePositionUpdate(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @update:node-size="handleNodeSizeUpdate(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @update:viewport="updateCanvasViewportForTab(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @open-node-creation-menu="openNodeCreationMenuForTab(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @create-node-from-file="createNodeFromFileForTab(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @locked-edit-attempt="showGraphLockedEditToast"
          @refresh-agent-models="emit('refresh-agent-models')"
        />
        <div v-else class="editor-subgraph-instance-dialog__empty">No subgraph graph selected.</div>
        <EditorNodeCreationMenu
          :open="Boolean(nodeCreationMenuState(SUBGRAPH_EDITOR_TAB_ID)?.open)"
          :entries="nodeCreationEntriesForTab(SUBGRAPH_EDITOR_TAB_ID)"
          :context="nodeCreationMenuState(SUBGRAPH_EDITOR_TAB_ID)?.context ?? null"
          :query="nodeCreationMenuState(SUBGRAPH_EDITOR_TAB_ID)?.query ?? ''"
          :position="nodeCreationMenuState(SUBGRAPH_EDITOR_TAB_ID)?.position ?? null"
          @update:query="updateNodeCreationQuery(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @select-entry="createNodeFromMenuForTab(SUBGRAPH_EDITOR_TAB_ID, $event)"
          @close="closeNodeCreationMenu(SUBGRAPH_EDITOR_TAB_ID)"
        />
      </div>
    </section>
  </ElDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Close } from "@element-plus/icons-vue";
import { ElButton, ElDialog, ElIcon, ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";

import EditorCanvas from "@/editor/canvas/EditorCanvas.vue";
import type { CanvasViewport } from "@/editor/canvas/canvasViewport";
import { clonePlainValue } from "@/lib/graph-document";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type {
  GraphCorePayload,
  GraphDocument,
  GraphPayload,
  PresetDocument,
} from "@/types/node-system";
import type { RunDetail } from "@/types/run";
import type { SkillDefinition } from "@/types/skills";

import EditorNodeCreationMenu from "./EditorNodeCreationMenu.vue";
import type { CreatedStateEdgeEditorRequest, NodeCreationMenuState } from "./nodeCreationMenuModel";
import { setTabScopedRecordEntry } from "./editorTabRuntimeModel";
import { useWorkspaceEditGuardController } from "./useWorkspaceEditGuardController";
import { useWorkspaceGraphMutationActions } from "./useWorkspaceGraphMutationActions";
import { useWorkspaceNodeCreationController } from "./useWorkspaceNodeCreationController";

const SUBGRAPH_EDITOR_TAB_ID = "subgraph-instance";
const SUBGRAPH_DIALOG_BODY_CLASS = "editor-subgraph-instance-dialog-open";

const props = defineProps<{
  open: boolean;
  title?: string | null;
  graph: GraphCorePayload | null;
  knowledgeBases: KnowledgeBaseRecord[];
  skillDefinitions: SkillDefinition[];
  skillDefinitionsLoading: boolean;
  skillDefinitionsError: string | null;
  availableAgentModelRefs: string[];
  agentModelDisplayLookup: Record<string, string>;
  globalTextModelRef: string;
  persistedPresets: PresetDocument[];
  graphs: GraphDocument[];
}>();

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "update:graph", graph: GraphCorePayload): void;
  (event: "refresh-agent-models"): void;
}>();

const { t } = useI18n();

const documentsByTabId = ref<Record<string, GraphPayload | GraphDocument>>({});
const focusedNodeIdByTabId = ref<Record<string, string | null>>({});
const viewportByTabId = ref<Record<string, CanvasViewport>>({});
const latestRunDetailByTabId = ref<Record<string, RunDetail | null>>({});
const dataEdgeStateEditorRequestByTabId = ref<Record<string, CreatedStateEdgeEditorRequest | null>>({});
const nodeCreationMenuByTabId = ref<Record<string, NodeCreationMenuState>>({});
const skillDefinitionsRef = ref<SkillDefinition[]>([]);
const persistedPresetsRef = ref<PresetDocument[]>([]);
const graphsRef = ref<GraphDocument[]>([]);
const localGraphSignature = ref<string | null>(null);

const resolvedTitle = computed(() => props.title?.trim() || "Subgraph");
const subgraphDocument = computed(() => documentsByTabId.value[SUBGRAPH_EDITOR_TAB_ID] ?? null);

watch(
  () => props.skillDefinitions,
  (nextDefinitions) => {
    skillDefinitionsRef.value = [...nextDefinitions];
  },
  { immediate: true },
);

watch(
  () => props.persistedPresets,
  (nextPresets) => {
    persistedPresetsRef.value = [...nextPresets];
  },
  { immediate: true },
);

watch(
  () => props.graphs,
  (nextGraphs) => {
    graphsRef.value = [...nextGraphs];
  },
  { immediate: true },
);

watch(
  [() => props.open, () => props.graph, resolvedTitle],
  () => {
    syncLocalDocumentFromProps();
  },
  { immediate: true, deep: true },
);

watch(
  () => props.open,
  (open) => {
    if (typeof document === "undefined") {
      return;
    }
    document.body.classList.toggle(SUBGRAPH_DIALOG_BODY_CLASS, open);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof document !== "undefined") {
    document.body.classList.remove(SUBGRAPH_DIALOG_BODY_CLASS);
  }
});

function syncLocalDocumentFromProps() {
  if (!props.open || !props.graph) {
    documentsByTabId.value = {};
    focusedNodeIdByTabId.value = {};
    dataEdgeStateEditorRequestByTabId.value = {};
    nodeCreationMenuByTabId.value = {};
    localGraphSignature.value = null;
    return;
  }

  const nextSignature = JSON.stringify(props.graph);
  if (localGraphSignature.value === nextSignature && documentsByTabId.value[SUBGRAPH_EDITOR_TAB_ID]) {
    return;
  }

  documentsByTabId.value = setTabScopedRecordEntry(
    {},
    SUBGRAPH_EDITOR_TAB_ID,
    createEditorDocumentFromCoreGraph(props.graph, resolvedTitle.value),
  );
  localGraphSignature.value = nextSignature;
}

function createEditorDocumentFromCoreGraph(graph: GraphCorePayload, title: string): GraphPayload {
  return clonePlainValue({
    graph_id: null,
    name: title,
    state_schema: graph.state_schema,
    nodes: graph.nodes,
    edges: graph.edges,
    conditional_edges: graph.conditional_edges,
    metadata: graph.metadata,
  });
}

function extractCoreGraphFromDocument(document: GraphPayload | GraphDocument): GraphCorePayload {
  return clonePlainValue({
    state_schema: document.state_schema,
    nodes: document.nodes,
    edges: document.edges,
    conditional_edges: document.conditional_edges,
    metadata: document.metadata,
  });
}

function markDocumentDirty(tabId: string, nextDocument: GraphPayload | GraphDocument) {
  if (tabId !== SUBGRAPH_EDITOR_TAB_ID) {
    return;
  }

  documentsByTabId.value = setTabScopedRecordEntry(documentsByTabId.value, tabId, nextDocument);
  const nextGraph = extractCoreGraphFromDocument(nextDocument);
  localGraphSignature.value = JSON.stringify(nextGraph);
  emit("update:graph", nextGraph);
}

function focusNodeForTab(tabId: string, nodeId: string | null) {
  focusedNodeIdByTabId.value = setTabScopedRecordEntry(focusedNodeIdByTabId.value, tabId, nodeId);
}

function setMessageFeedbackForTab(_tabId: string, feedback: { tone: "neutral" | "success" | "warning" | "danger"; message: string }) {
  ElMessage({
    customClass: "editor-subgraph-instance-dialog__toast",
    type: feedback.tone === "danger" ? "error" : feedback.tone === "neutral" ? "info" : feedback.tone,
    duration: 3200,
    grouping: true,
    showClose: true,
    message: feedback.message,
  });
}

function showStateDeleteBlockedToast(message: string) {
  setMessageFeedbackForTab(SUBGRAPH_EDITOR_TAB_ID, { tone: "warning", message });
}

function showGraphLockedEditToast() {
  ElMessage({
    customClass: "editor-subgraph-instance-dialog__toast",
    type: "warning",
    duration: 3200,
    grouping: true,
    showClose: true,
    message: t("editor.lockedToast"),
  });
}

function commitDirtyDocumentForTab(tabId: string, nextDocument: GraphPayload | GraphDocument) {
  markDocumentDirty(tabId, nextDocument);
}

const editGuardController = useWorkspaceEditGuardController({
  documentsByTabId,
  latestRunDetailByTabId,
  commitDirtyDocumentForTab,
  showLockedEditToast: showGraphLockedEditToast,
});

const { guardGraphEditForTab, handleNodePositionUpdate, handleNodeSizeUpdate } = editGuardController;

function updateCanvasViewportForTab(tabId: string, viewport: CanvasViewport) {
  viewportByTabId.value = setTabScopedRecordEntry(viewportByTabId.value, tabId, viewport);
}

async function importPythonGraphFile() {
  setMessageFeedbackForTab(SUBGRAPH_EDITOR_TAB_ID, {
    tone: "warning",
    message: "Python graph import is available from the main workspace.",
  });
  return false;
}

function isGraphiteUiPythonExportFile() {
  return false;
}

const {
  closeNodeCreationMenu,
  createNodeFromFileForTab,
  createNodeFromMenuForTab,
  nodeCreationEntriesForTab,
  nodeCreationMenuState,
  openCreatedStateEdgeEditorForTab,
  openNodeCreationMenuForTab,
  updateNodeCreationQuery,
} = useWorkspaceNodeCreationController({
  documentsByTabId,
  dataEdgeStateEditorRequestByTabId,
  nodeCreationMenuByTabId,
  persistedPresets: persistedPresetsRef,
  graphs: graphsRef,
  guardGraphEditForTab,
  markDocumentDirty,
  setMessageFeedbackForTab,
  importPythonGraphFile,
  isGraphiteUiPythonExportFile,
});

const {
  bindNodePortStateForTab,
  removeNodePortStateForTab,
  reorderNodePortStateForTab,
  disconnectDataEdgeForTab,
  createNodePortStateForTab,
  deleteNodeForTab,
  connectFlowNodesForTab,
  connectStateBindingForTab,
  connectStateInputSourceForTab,
  connectConditionRouteForTab,
  removeFlowEdgeForTab,
  reconnectFlowEdgeForTab,
  removeConditionRouteForTab,
  reconnectConditionRouteForTab,
  updateInputConfigForTab,
  updateNodeMetadataForTab,
  updateAgentConfigForTab,
  toggleAgentBreakpointForTab,
  updateAgentBreakpointTimingForTab,
  updateConditionConfigForTab,
  updateConditionBranchForTab,
  addConditionBranchForTab,
  removeConditionBranchForTab,
  updateOutputConfigForTab,
  updateStateField,
} = useWorkspaceGraphMutationActions({
  documentsByTabId,
  focusedNodeIdByTabId,
  skillDefinitions: skillDefinitionsRef,
  markDocumentDirty,
  focusNodeForTab,
  setMessageFeedbackForTab,
  showStateDeleteBlockedToast,
  openCreatedStateEdgeEditorForTab,
  translate: t,
});

function handleOpenChange(open: boolean) {
  emit("update:open", open);
}
</script>

<style scoped>
:global(.editor-subgraph-instance-dialog__overlay.el-overlay) {
  z-index: 4700 !important;
  background: rgba(42, 24, 14, 0.22);
  backdrop-filter: blur(8px) saturate(0.98);
}

:global(body.editor-subgraph-instance-dialog-open .graphite-select-popper.el-popper),
:global(body.editor-subgraph-instance-dialog-open .node-card__agent-add-popover-popper.el-popper),
:global(body.editor-subgraph-instance-dialog-open .node-card__action-popover.el-popper),
:global(body.editor-subgraph-instance-dialog-open .node-card__confirm-popover.el-popper),
:global(body.editor-subgraph-instance-dialog-open .node-card__state-editor-popper.el-popper),
:global(body.editor-subgraph-instance-dialog-open .node-card__text-editor-popper.el-popper),
:global(body.editor-subgraph-instance-dialog-open .node-card__toggle-hint-popper.el-popper) {
  z-index: 4800 !important;
}

:global(.editor-subgraph-instance-dialog.el-dialog) {
  overflow: hidden;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 22px;
  padding: 0;
  background:
    var(--graphite-glass-specular),
    linear-gradient(180deg, rgb(255, 253, 248), rgb(255, 249, 239));
  background-blend-mode: screen, normal;
  box-shadow:
    0 24px 72px rgba(66, 31, 17, 0.18),
    var(--graphite-glass-highlight),
    var(--graphite-glass-rim);
  backdrop-filter: blur(30px) saturate(1.55) contrast(1.02);
}

:global(.editor-subgraph-instance-dialog.el-dialog .el-dialog__header) {
  display: none;
}

:global(.editor-subgraph-instance-dialog.el-dialog .el-dialog__body) {
  padding: 0;
}

:global(.editor-subgraph-instance-dialog.el-dialog .el-dialog__headerbtn) {
  z-index: 4;
  top: 20px;
  right: 20px;
}

.editor-subgraph-instance-dialog__shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: min(780px, calc(100vh - 92px));
  overflow: hidden;
  background: rgb(255, 250, 241);
}

.editor-subgraph-instance-dialog__header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid rgba(154, 52, 18, 0.1);
  padding: 24px 70px 20px 28px;
}

.editor-subgraph-instance-dialog__eyebrow {
  color: rgba(154, 52, 18, 0.78);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.editor-subgraph-instance-dialog__title {
  margin: 8px 0 0;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 1.36rem;
  line-height: 1.22;
}

.editor-subgraph-instance-dialog__copy {
  max-width: 320px;
  margin: 0;
  color: rgba(60, 41, 20, 0.64);
  font-size: 0.88rem;
  line-height: 1.45;
}

.editor-subgraph-instance-dialog__close-button {
  position: absolute;
  top: 20px;
  right: 20px;
  border-color: rgba(154, 52, 18, 0.12);
  background: rgba(255, 255, 255, 0.36);
  color: rgba(124, 45, 18, 0.84);
}

.editor-subgraph-instance-dialog__close-button:hover {
  border-color: rgba(154, 52, 18, 0.18);
  background: rgba(255, 255, 255, 0.52);
  color: rgba(124, 45, 18, 0.96);
}

.editor-subgraph-instance-dialog__canvas-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: min(680px, calc(100vh - 190px));
  overflow: hidden;
  background: rgb(255, 250, 241);
}

.editor-subgraph-instance-dialog__canvas-shell :deep(.editor-canvas) {
  height: 100%;
  border-radius: 0;
}

.editor-subgraph-instance-dialog__empty {
  display: grid;
  height: 100%;
  place-items: center;
  color: rgba(60, 41, 20, 0.62);
  font-weight: 700;
}

:global(.editor-subgraph-instance-dialog__toast.el-message) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.98);
  box-shadow: 0 14px 34px rgba(60, 41, 20, 0.14);
  backdrop-filter: blur(20px) saturate(1.45);
}

@media (max-width: 760px) {
  .editor-subgraph-instance-dialog__shell {
    min-height: min(720px, calc(100vh - 52px));
  }

  .editor-subgraph-instance-dialog__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    padding: 22px 60px 18px 22px;
  }

  .editor-subgraph-instance-dialog__canvas-shell {
    height: min(620px, calc(100vh - 196px));
  }
}
</style>
