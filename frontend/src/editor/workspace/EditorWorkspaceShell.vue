<template>
  <section class="editor-workspace-shell">
    <input
      ref="pythonGraphImportInput"
      class="editor-workspace-shell__file-input"
      type="file"
      accept=".py,text/x-python,text/plain"
      @change="handlePythonGraphImportSelection"
    />

    <div v-if="workspace.tabs.length === 0" class="editor-workspace-shell__welcome">
      <div v-if="routeRestoreError" class="editor-workspace-shell__status-card editor-workspace-shell__status-card--danger">
        <div class="editor-workspace-shell__status-eyebrow">{{ t("common.restore") }}</div>
        <h2>{{ t("runDetail.restoreSnapshotFailed") }}</h2>
        <p>{{ routeRestoreError }}</p>
      </div>
      <EditorWelcomeState
        :templates="templates"
        :graphs="graphs"
        @create-new="openNewTab(null)"
        @import-python-graph="openPythonGraphImportDialog"
        @open-template="openNewTab"
        @open-graph="openExistingGraph"
      />
    </div>

    <div v-else class="editor-workspace-shell__workspace">
      <div v-if="routeRestoreError" class="editor-workspace-shell__route-error">
        <span class="editor-workspace-shell__route-error-label">{{ t("common.restore") }}</span>
        <span>{{ routeRestoreError }}</span>
      </div>
      <div class="editor-workspace-shell__chrome">
        <EditorTabBar
          :tabs="workspace.tabs"
          :active-tab-id="workspace.activeTabId"
          :templates="templates"
          :graphs="graphs"
          @activate-tab="activateTab"
          @close-tab="requestCloseTab"
          @reorder-tab="reorderTab"
          @create-new="openNewTab(null)"
          @create-from-template="openNewTab"
          @open-graph="openExistingGraph"
          @rename-active-graph="renameActiveGraph"
        />

        <div class="editor-workspace-shell__action-capsule-row">
          <EditorActionCapsule
            :active-state-count="activeStateCount"
            :is-state-panel-open="activeStatePanelOpen"
            :is-run-activity-panel-open="activeRunActivityPanelOpen"
            :has-run-activity-hint="activeRunActivityPanelHint"
            :save-graph-label="activeTab?.kind === 'subgraph' ? t('editor.saveSubgraph') : t('editor.saveGraph')"
            :show-save-as-graph="activeTab?.kind === 'subgraph'"
            :save-as-graph-label="t('editor.saveAsGraph')"
            @toggle-state-panel="toggleActiveStatePanel"
            @toggle-run-activity-panel="toggleActiveRunActivityPanelFromActionCapsule"
            @save-active-graph="saveActiveGraph"
            @save-active-graph-as-new="saveActiveGraphAsNewGraph"
            @save-active-graph-as-template="saveActiveGraphAsTemplate"
            @validate-active-graph="validateActiveGraph"
            @import-python-graph="openPythonGraphImportDialog"
            @export-active-graph="exportActiveGraph"
            @run-active-graph="runActiveGraph"
          />
        </div>
      </div>

      <div class="editor-workspace-shell__body">
        <div
          v-for="tab in workspace.tabs"
          :key="tab.tabId"
          v-show="tab.tabId === workspace.activeTabId"
          class="editor-workspace-shell__editor"
          :class="{ 'editor-workspace-shell__editor--active': tab.tabId === workspace.activeTabId }"
        >
          <div class="editor-workspace-shell__editor-grid">
            <div class="editor-workspace-shell__editor-main" :style="editorMainStyle(tab.tabId)">
              <div v-if="loadingByTabId[tab.tabId]" class="editor-workspace-shell__status-card">
                <div class="editor-workspace-shell__status-eyebrow">{{ t("common.graph") }}</div>
                <h2>{{ t("common.loadingGraph") }}</h2>
              </div>
              <div v-else-if="errorByTabId[tab.tabId]" class="editor-workspace-shell__status-card">
                <div class="editor-workspace-shell__status-eyebrow">{{ t("common.graph") }}</div>
                <h2>{{ tab.title }}</h2>
                <p>{{ errorByTabId[tab.tabId] }}</p>
              </div>
              <EditorCanvas
                v-else-if="documentsByTabId[tab.tabId]"
                :document="documentsByTabId[tab.tabId]!"
                :knowledge-bases="knowledgeBases"
                :skill-definitions="skillDefinitions"
                :skill-definitions-loading="skillDefinitionsLoading"
                :skill-definitions-error="skillDefinitionsError"
                :available-agent-model-refs="agentRuntimeCatalog.availableModelRefs"
                :agent-model-display-lookup="agentRuntimeCatalog.modelDisplayLookup"
                :global-text-model-ref="agentRuntimeCatalog.globalTextModelRef"
                :selected-node-id="focusedNodeIdByTabId[tab.tabId] ?? null"
                :focus-request="focusRequestByTabId[tab.tabId] ?? null"
                :run-node-status-by-node-id="runNodeStatusByTabId[tab.tabId] ?? undefined"
                :current-run-node-id="currentRunNodeIdByTabId[tab.tabId] ?? null"
                :latest-run-status="feedbackForTab(tab.tabId)?.activeRunStatus ?? null"
                :run-output-preview-by-node-id="runOutputPreviewByTabId[tab.tabId] ?? undefined"
                :run-failure-message-by-node-id="runFailureMessageByTabId[tab.tabId] ?? undefined"
                :subgraph-run-status-by-node-id="subgraphRunStatusByTabId[tab.tabId] ?? undefined"
                :active-run-edge-ids="activeRunEdgeIdsByTabId[tab.tabId] ?? undefined"
                :interaction-locked="isGraphInteractionLocked(tab.tabId)"
                :initial-viewport="viewportByTabId[tab.tabId] ?? null"
                :state-editor-request="dataEdgeStateEditorRequestByTabId[tab.tabId] ?? null"
                :source-context-label="subgraphSourceContextLabel(tab)"
                @select-node="focusNodeForTab(tab.tabId, $event)"
                @update-node-metadata="updateNodeMetadataForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-config="updateInputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @update-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @remove-port-state="removeNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey)"
                @reorder-port-state="reorderNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey, $event.targetIndex)"
                @disconnect-data-edge="disconnectDataEdgeForTab(tab.tabId, $event.sourceNodeId, $event.targetNodeId, $event.stateKey, $event.mode)"
                @update-agent-config="updateAgentConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @toggle-agent-breakpoint="toggleAgentBreakpointForTab(tab.tabId, $event.nodeId, $event.enabled)"
                @update-condition-config="updateConditionConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-condition-branch="updateConditionBranchForTab(tab.tabId, $event.nodeId, $event.currentKey, $event.nextKey, $event.mappingKeys)"
                @add-condition-branch="addConditionBranchForTab(tab.tabId, $event.nodeId)"
                @remove-condition-branch="removeConditionBranchForTab(tab.tabId, $event.nodeId, $event.branchKey)"
                @bind-port-state="bindNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey)"
                @create-port-state="createNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.field)"
                @delete-node="deleteNodeForTab(tab.tabId, $event.nodeId)"
                @save-node-preset="saveNodePresetForTab(tab.tabId, $event.nodeId)"
                @connect-state="connectStateBindingForTab(tab.tabId, $event)"
                @connect-state-input-source="connectStateInputSourceForTab(tab.tabId, $event)"
                @connect-flow="connectFlowNodesForTab(tab.tabId, $event.sourceNodeId, $event.targetNodeId)"
                @connect-route="connectConditionRouteForTab(tab.tabId, $event.sourceNodeId, $event.branchKey, $event.targetNodeId)"
                @reconnect-flow="reconnectFlowEdgeForTab(tab.tabId, $event.sourceNodeId, $event.currentTargetNodeId, $event.nextTargetNodeId)"
                @reconnect-route="reconnectConditionRouteForTab(tab.tabId, $event.sourceNodeId, $event.branchKey, $event.nextTargetNodeId)"
                @remove-flow="removeFlowEdgeForTab(tab.tabId, $event.sourceNodeId, $event.targetNodeId)"
                @remove-route="removeConditionRouteForTab(tab.tabId, $event.sourceNodeId, $event.branchKey)"
                @update-output-config="updateOutputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update:node-position="(payload) => handleNodePositionUpdate(tab.tabId, payload)"
                @update:node-size="handleNodeSizeUpdate(tab.tabId, $event)"
                @update:viewport="updateCanvasViewportForTab(tab.tabId, $event)"
                @open-node-creation-menu="openNodeCreationMenuForTab(tab.tabId, $event)"
                @open-subgraph-editor="openSubgraphEditorForTab(tab.tabId, $event.nodeId)"
                @create-node-from-file="createNodeFromFileForTab(tab.tabId, $event)"
                @open-human-review="openHumanReviewPanelForTab(tab.tabId, $event.nodeId)"
                @locked-edit-attempt="showGraphLockedEditToast"
                @refresh-agent-models="refreshAgentModels"
              />
              <EditorNodeCreationMenu
                :open="Boolean(nodeCreationMenuState(tab.tabId)?.open)"
                :entries="nodeCreationEntriesForTab(tab.tabId)"
                :context="nodeCreationMenuState(tab.tabId)?.context ?? null"
                :query="nodeCreationMenuState(tab.tabId)?.query ?? ''"
                :position="nodeCreationMenuState(tab.tabId)?.position ?? null"
                @update:query="updateNodeCreationQuery(tab.tabId, $event)"
                @select-entry="createNodeFromMenuForTab(tab.tabId, $event)"
                @close="closeNodeCreationMenu(tab.tabId)"
              />
            </div>

            <div
              v-if="isStatePanelOpen(tab.tabId) && documentsByTabId[tab.tabId]"
              class="editor-workspace-shell__side-panel-layer"
              :style="sidePanelLayerStyle(tab.tabId)"
            >
              <EditorHumanReviewPanel
                v-if="shouldShowHumanReviewPanel(tab.tabId)"
                :document="documentsByTabId[tab.tabId]!"
                :run="latestRunDetailByTabId[tab.tabId] ?? null"
                :focused-node-id="focusedNodeIdByTabId[tab.tabId] ?? null"
                :busy="humanReviewBusyByTabId[tab.tabId] ?? false"
                :error="humanReviewErrorByTabId[tab.tabId] ?? null"
                @toggle="toggleStatePanel(tab.tabId)"
                @focus-node="requestNodeFocusForTab(tab.tabId, $event)"
                @resume="resumeHumanReviewRun(tab.tabId, $event)"
              />

              <EditorRunActivityPanel
                v-else-if="shouldShowRunActivityPanel(tab.tabId)"
                :entries="runActivityByTabId[tab.tabId]?.entries ?? []"
                :run-status="latestRunDetailByTabId[tab.tabId]?.status ?? feedbackForTab(tab.tabId)?.activeRunStatus ?? null"
                @toggle="toggleStatePanel(tab.tabId)"
              />

              <EditorStatePanel
                v-else
                :document="documentsByTabId[tab.tabId]!"
                :run="latestRunDetailByTabId[tab.tabId] ?? null"
                :focused-node-id="focusedNodeIdByTabId[tab.tabId] ?? null"
                @toggle="toggleStatePanel(tab.tabId)"
                @focus-node="requestNodeFocusForTab(tab.tabId, $event)"
                @add-state="addStateField(tab.tabId)"
                @delete-state="deleteStateField(tab.tabId, $event)"
                @update-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @add-reader="addStateReaderBinding(tab.tabId, $event.stateKey, $event.nodeId)"
                @remove-reader="removeStateReaderBinding(tab.tabId, $event.stateKey, $event.nodeId)"
                @add-writer="addStateWriterBinding(tab.tabId, $event.stateKey, $event.nodeId)"
                @remove-writer="removeStateWriterBinding(tab.tabId, $event.stateKey, $event.nodeId)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <EditorCloseConfirmDialog
      :tab="pendingCloseTab"
      :busy="closeBusy"
      :error="closeError"
      @cancel="cancelPendingClose"
      @discard="discardPendingClose"
      @save-and-close="saveAndClosePendingTab"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";

import { fetchPreset, fetchPresets, savePreset } from "@/api/presets";
import { fetchKnowledgeBases } from "@/api/knowledge";
import { fetchRun, resumeRun } from "@/api/runs";
import { fetchSettings } from "@/api/settings";
import { fetchSkillDefinitions } from "@/api/skills";
import {
  exportLangGraphPython,
  fetchGraph,
  importGraphFromPythonSource,
  runGraph,
  saveGraph,
  saveGraphAsTemplate,
  validateGraph,
} from "@/api/graphs";
import { resolveAgentRuntimeCatalog } from "@/editor/nodes/agentConfigModel";
import EditorCanvas from "@/editor/canvas/EditorCanvas.vue";
import { clonePlainValue, reconcileAgentSkillOutputBindingsInDocument } from "@/lib/graph-document";
import type { NodeFocusRequest } from "@/editor/canvas/useNodeSelectionFocus";
import type { CreatedStateEdgeEditorRequest, NodeCreationMenuState } from "@/editor/workspace/nodeCreationMenuModel";
import {
  createSubgraphWorkspaceTab,
  prunePersistedEditorDocumentDrafts,
  prunePersistedEditorViewportDrafts,
  readPersistedEditorWorkspace,
  removePersistedEditorDocumentDraft,
  removePersistedEditorViewportDraft,
  writePersistedEditorWorkspace,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "@/lib/editor-workspace";
import type { CanvasViewport } from "@/editor/canvas/canvasViewport";
import { useCompanionContextStore } from "@/stores/companionContext";
import { useGraphDocumentStore } from "@/stores/graphDocument";
import type { RunDetail } from "@/types/run";
import type {
  GraphDocument,
  GraphPayload,
  SubgraphNode,
  TemplateRecord,
} from "@/types/node-system";

import EditorActionCapsule from "./EditorActionCapsule.vue";
import EditorCloseConfirmDialog from "./EditorCloseConfirmDialog.vue";
import EditorHumanReviewPanel from "./EditorHumanReviewPanel.vue";
import EditorNodeCreationMenu from "./EditorNodeCreationMenu.vue";
import EditorRunActivityPanel from "./EditorRunActivityPanel.vue";
import EditorStatePanel from "./EditorStatePanel.vue";
import EditorTabBar from "./EditorTabBar.vue";
import EditorWelcomeState from "./EditorWelcomeState.vue";
import {
  resolveWorkspaceDraftPersistenceRequest,
  shouldRunWorkspaceDraftHydration,
} from "./editorDraftPersistenceModel.ts";
import type { WorkspaceSidePanelMode } from "./workspaceSidePanelModel.ts";
import { downloadPythonSource } from "./pythonExportModel.ts";
import { isGraphiteUiPythonExportFile, isGraphiteUiPythonExportSource } from "./pythonImportModel.ts";
import { useWorkspaceDocumentState } from "./useWorkspaceDocumentState.ts";
import { useWorkspaceEditGuardController } from "./useWorkspaceEditGuardController.ts";
import { useWorkspaceGraphPersistenceController } from "./useWorkspaceGraphPersistenceController.ts";
import { useWorkspaceNodeCreationController } from "./useWorkspaceNodeCreationController.ts";
import { useWorkspaceOpenController } from "./useWorkspaceOpenController.ts";
import { useWorkspacePresetController } from "./useWorkspacePresetController.ts";
import { useWorkspacePythonImportController } from "./useWorkspacePythonImportController.ts";
import { useWorkspaceResourceController } from "./useWorkspaceResourceController.ts";
import { useWorkspaceRouteController } from "./useWorkspaceRouteController.ts";
import { useWorkspaceRunLifecycleController } from "./useWorkspaceRunLifecycleController.ts";
import { useWorkspaceRunController } from "./useWorkspaceRunController.ts";
import { useWorkspaceRunVisualState, type WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";
import { useWorkspaceSidePanelController } from "./useWorkspaceSidePanelController.ts";
import { useWorkspaceTabLifecycleController } from "./useWorkspaceTabLifecycleController.ts";
import { useWorkspaceGraphMutationActions } from "./useWorkspaceGraphMutationActions.ts";
import type { RunActivityState } from "./runActivityModel.ts";

type DataEdgeStateEditorRequest = CreatedStateEdgeEditorRequest;

const props = defineProps<{
  routeMode: "root" | "new" | "existing";
  routeGraphId?: string | null;
  defaultTemplateId?: string | null;
  restoreRunId?: string | null;
  restoreSnapshotId?: string | null;
  templates: TemplateRecord[];
  graphs: GraphDocument[];
}>();

const router = useRouter();
const route = useRoute();
const graphStore = useGraphDocumentStore();
const companionContextStore = useCompanionContextStore();
const { t } = useI18n();

const workspace = ref<PersistedEditorWorkspace>({
  activeTabId: null,
  tabs: [],
});
const hydrated = ref(false);
const documentsByTabId = ref<Record<string, GraphPayload | GraphDocument>>({});
const loadingByTabId = ref<Record<string, boolean>>({});
const errorByTabId = ref<Record<string, string | null>>({});
const pendingCloseTabId = ref<string | null>(null);
const pythonGraphImportInput = ref<HTMLInputElement | null>(null);
const closeBusy = ref(false);
const closeError = ref<string | null>(null);
const handledRouteSignature = ref<string | null>(null);
const statePanelOpenByTabId = ref<Record<string, boolean>>({});
const sidePanelModeByTabId = ref<Record<string, WorkspaceSidePanelMode>>({});
const focusedNodeIdByTabId = ref<Record<string, string | null>>({});
const focusRequestByTabId = ref<Record<string, NodeFocusRequest | null>>({});
const viewportByTabId = ref<Record<string, CanvasViewport>>({});
const dataEdgeStateEditorRequestByTabId = ref<Record<string, DataEdgeStateEditorRequest | null>>({});
const runNodeStatusByTabId = ref<Record<string, Record<string, string>>>({});
const currentRunNodeIdByTabId = ref<Record<string, string | null>>({});
const latestRunDetailByTabId = ref<Record<string, RunDetail | null>>({});
const restoredRunSnapshotIdByTabId = ref<Record<string, string | null>>({});
const humanReviewBusyByTabId = ref<Record<string, boolean>>({});
const humanReviewErrorByTabId = ref<Record<string, string | null>>({});
const runOutputPreviewByTabId = ref<Record<string, Record<string, { text: string; displayMode: string | null }>>>({});
const runFailureMessageByTabId = ref<Record<string, Record<string, string>>>({});
const activeRunEdgeIdsByTabId = ref<Record<string, string[]>>({});
const subgraphRunStatusByTabId = ref<Record<string, Record<string, Record<string, string>>>>({});
const runActivityByTabId = ref<Record<string, RunActivityState>>({});
const runActivityHintByTabId = ref<Record<string, boolean>>({});
const feedbackByTabId = ref<Record<string, WorkspaceRunFeedback | null>>({});
const routeRestoreError = ref<string | null>(null);
const nodeCreationMenuByTabId = ref<Record<string, NodeCreationMenuState>>({});
const {
  knowledgeBases,
  settings,
  skillDefinitions,
  skillDefinitionsLoading,
  skillDefinitionsError,
  persistedPresets,
  loadInitialWorkspaceResources,
  refreshAgentModels,
} = useWorkspaceResourceController({
  fetchKnowledgeBases,
  fetchSettings,
  fetchSkillDefinitions,
  fetchPresets,
});

const graphById = computed(() => new Map(props.graphs.map((graph) => [graph.graph_id, graph])));
const graphTemplates = computed(() => props.templates);
const agentRuntimeCatalog = computed(() => resolveAgentRuntimeCatalog(settings.value));
const activeTab = computed(() => workspace.value.tabs.find((tab) => tab.tabId === workspace.value.activeTabId) ?? null);
const pendingCloseTab = computed(() =>
  pendingCloseTabId.value ? workspace.value.tabs.find((tab) => tab.tabId === pendingCloseTabId.value) ?? null : null,
);
const activeStateCount = computed(() => {
  const tab = activeTab.value;
  if (!tab) {
    return 0;
  }
  const document = documentsByTabId.value[tab.tabId];
  if (!document) {
    return 0;
  }
  return Object.keys(document.state_schema ?? {}).length;
});
let closeNodeCreationMenuFromController: ((tabId: string) => void) | null = null;
function closeNodeCreationMenu(tabId: string) {
  closeNodeCreationMenuFromController?.(tabId);
}
let guardGraphEditForTabFromController: (tabId: string) => boolean = () => {
  throw new Error("Workspace edit guard controller is not initialized.");
};
let handleNodePositionUpdateFromController: (tabId: string, payload: { nodeId: string; position: { x: number; y: number } }) => void = () => {
  throw new Error("Workspace edit guard controller is not initialized.");
};
let handleNodeSizeUpdateFromController: (tabId: string, payload: { nodeId: string; position: { x: number; y: number }; size: { width: number; height: number } }) => void = () => {
  throw new Error("Workspace edit guard controller is not initialized.");
};
let isGraphInteractionLockedFromController: (tabId: string) => boolean = () => false;
let showGraphLockedEditToastFromController: () => void = () => {
  throw new Error("Workspace edit guard controller is not initialized.");
};

function isGraphInteractionLocked(tabId: string) {
  return isGraphInteractionLockedFromController(tabId);
}

function showGraphLockedEditToast() {
  showGraphLockedEditToastFromController();
}

function guardGraphEditForTab(tabId: string) {
  return guardGraphEditForTabFromController(tabId);
}

function handleNodePositionUpdate(tabId: string, payload: { nodeId: string; position: { x: number; y: number } }) {
  handleNodePositionUpdateFromController(tabId, payload);
}

function handleNodeSizeUpdate(tabId: string, payload: { nodeId: string; position: { x: number; y: number }; size: { width: number; height: number } }) {
  handleNodeSizeUpdateFromController(tabId, payload);
}
const {
  activeStatePanelOpen,
  activeRunActivityPanelOpen,
  isStatePanelOpen,
  shouldShowHumanReviewPanel,
  shouldShowRunActivityPanel,
  toggleStatePanel,
  openHumanReviewPanelForTab,
  focusNodeForTab,
  requestNodeFocusForTab,
  toggleActiveStatePanel,
  toggleActiveRunActivityPanel,
  editorMainStyle,
  sidePanelLayerStyle,
} = useWorkspaceSidePanelController({
  activeTab,
  statePanelOpenByTabId,
  sidePanelModeByTabId,
  latestRunDetailByTabId,
  focusedNodeIdByTabId,
  focusRequestByTabId,
  closeNodeCreationMenu,
  showGraphLockedEditToast,
});
const activeRunActivityPanelHint = computed(() => {
  const tab = activeTab.value;
  return Boolean(tab && runActivityHintByTabId.value[tab.tabId] && !activeRunActivityPanelOpen.value);
});

function markRunActivityPanelHintForTab(tabId: string) {
  runActivityHintByTabId.value = {
    ...runActivityHintByTabId.value,
    [tabId]: !shouldShowRunActivityPanel(tabId),
  };
}

function clearRunActivityPanelHintForTab(tabId: string) {
  if (!runActivityHintByTabId.value[tabId]) {
    return;
  }
  runActivityHintByTabId.value = {
    ...runActivityHintByTabId.value,
    [tabId]: false,
  };
}

function toggleActiveRunActivityPanelFromActionCapsule() {
  const tab = activeTab.value;
  if (tab) {
    clearRunActivityPanelHintForTab(tab.tabId);
  }
  toggleActiveRunActivityPanel();
}
const {
  feedbackForTab,
  applyRunEventVisualStateToTab,
  applyRunVisualStateToTab,
  setFeedbackForTab,
  setMessageFeedbackForTab,
} = useWorkspaceRunVisualState({
  latestRunDetailByTabId,
  runNodeStatusByTabId,
  currentRunNodeIdByTabId,
  runOutputPreviewByTabId,
  runFailureMessageByTabId,
  activeRunEdgeIdsByTabId,
  subgraphRunStatusByTabId,
  feedbackByTabId,
});
const activeCompanionEditorSnapshot = computed(() => {
  const tab = activeTab.value;
  if (!tab) {
    return null;
  }

  return {
    activeTabTitle: tab.title,
    document: documentsByTabId.value[tab.tabId] ?? null,
    focusedNodeId: focusedNodeIdByTabId.value[tab.tabId] ?? null,
    feedback: feedbackForTab(tab.tabId),
  };
});
const {
  registerDocumentForTab,
  ensureTabViewportDrafts,
  updateCanvasViewportForTab,
  persistRunStateValuesForTab,
  commitDirtyDocumentForTab,
  markDocumentDirty,
} = useWorkspaceDocumentState({
  workspace,
  documentsByTabId,
  loadingByTabId,
  errorByTabId,
  feedbackByTabId,
  viewportByTabId,
  updateWorkspace,
  setMessageFeedbackForTab,
  guardGraphEditForTab,
});
const workspaceEditGuardController = useWorkspaceEditGuardController({
  documentsByTabId,
  latestRunDetailByTabId,
  commitDirtyDocumentForTab,
  showLockedEditToast: () => {
    ElMessage({
      customClass: "editor-workspace-shell__locked-toast",
      type: "warning",
      duration: 4200,
      grouping: true,
      placement: "top",
      showClose: false,
      message: t("editor.lockedToast"),
    });
  },
});
guardGraphEditForTabFromController = workspaceEditGuardController.guardGraphEditForTab;
handleNodePositionUpdateFromController = workspaceEditGuardController.handleNodePositionUpdate;
handleNodeSizeUpdateFromController = workspaceEditGuardController.handleNodeSizeUpdate;
isGraphInteractionLockedFromController = workspaceEditGuardController.isGraphInteractionLocked;
showGraphLockedEditToastFromController = workspaceEditGuardController.showGraphLockedEditToast;
const {
  cancelRunEventStreamForTab,
  cancelRunPolling,
  getRunGeneration,
  pollRunForTab,
  startRunEventStreamForTab,
  teardownRunLifecycle,
} = useWorkspaceRunLifecycleController({
  documentsByTabId,
  runOutputPreviewByTabId,
  runActivityByTabId,
  restoredRunSnapshotIdByTabId,
  fetchRun,
  applyRunVisualStateToTab,
  applyRunEventVisualStateToTab,
  openHumanReviewPanelForTab,
  persistRunStateValuesForTab,
  clearRunActivityPanelHintForTab,
  setMessageFeedbackForTab,
});
const activeTabRouteSignature = computed(() => {
  const tab = activeTab.value;
  if (!tab) {
    return null;
  }

  if (tab.kind === "subgraph") {
    return tab.subgraphSource?.parentGraphId ? `existing:${tab.subgraphSource.parentGraphId}` : "new:";
  }

  if (tab.graphId) {
    return `existing:${tab.graphId}`;
  }

  return `new:${tab.templateId ?? tab.defaultTemplateId ?? ""}`;
});
const routeSignature = computed(() => {
  if (props.routeMode === "existing") {
    return `existing:${props.routeGraphId ?? ""}`;
  }
  if (props.routeMode === "new") {
    if (props.restoreRunId) {
      return `restore:${props.restoreRunId ?? ""}:${props.restoreSnapshotId ?? ""}`;
    }
    return `new:${props.defaultTemplateId ?? ""}`;
  }
  return "root";
});
let ensureUnsavedTabDocumentsFromController: () => void = () => {
  throw new Error("Workspace open controller is not initialized.");
};
let loadExistingGraphIntoTabFromController: (tabId: string, graphId: string) => Promise<void> = async () => {
  throw new Error("Workspace open controller is not initialized.");
};
let openExistingGraphFromController: (graphId: string, navigation?: "push" | "replace" | "none") => void = () => {
  throw new Error("Workspace open controller is not initialized.");
};
let openNewTabFromController: (templateId: string | null, navigation?: "push" | "replace" | "none") => void = () => {
  throw new Error("Workspace open controller is not initialized.");
};
let openRestoredRunTabFromController: (
  runId: string,
  snapshotId: string | null,
  navigation?: "push" | "replace" | "none",
) => Promise<void> = async () => {
  throw new Error("Workspace open controller is not initialized.");
};

function ensureUnsavedTabDocuments() {
  ensureUnsavedTabDocumentsFromController();
}

function openNewTab(templateId: string | null, navigation: "push" | "replace" | "none" = "push") {
  openNewTabFromController(templateId, navigation);
}

async function openRestoredRunTab(runId: string, snapshotId: string | null = props.restoreSnapshotId ?? null, navigation: "push" | "replace" | "none" = "push") {
  await openRestoredRunTabFromController(runId, snapshotId, navigation);
}

async function loadExistingGraphIntoTab(tabId: string, graphId: string) {
  await loadExistingGraphIntoTabFromController(tabId, graphId);
}

function openExistingGraph(graphId: string, navigation: "push" | "replace" | "none" = "push") {
  openExistingGraphFromController(graphId, navigation);
}
const { applyCurrentRouteInstruction, syncRouteToUrl, syncRouteToTab } = useWorkspaceRouteController({
  routeMode: () => props.routeMode,
  routeGraphId: () => props.routeGraphId ?? null,
  defaultTemplateId: () => props.defaultTemplateId ?? null,
  restoreRunId: () => props.restoreRunId ?? null,
  restoreSnapshotId: () => props.restoreSnapshotId ?? null,
  activeTabRouteSignature,
  routeSignature,
  handledRouteSignature,
  routeRestoreError,
  currentRouteFullPath: () => route.fullPath,
  pushRoute: (targetUrl) => router.push(targetUrl),
  replaceRoute: (targetUrl) => router.replace(targetUrl),
  openRestoredRunTab,
  openNewTab,
  openExistingGraph,
});
const workspaceOpenController = useWorkspaceOpenController({
  workspace,
  documentsByTabId,
  loadingByTabId,
  errorByTabId,
  restoredRunSnapshotIdByTabId,
  routeRestoreError,
  handledRouteSignature,
  routeSignature,
  templates: () => props.templates,
  graphById,
  updateWorkspace,
  registerDocumentForTab,
  fetchGraph,
  fetchRun,
  applyRunVisualStateToTab,
  openHumanReviewPanelForTab,
  syncRouteToTab,
});
ensureUnsavedTabDocumentsFromController = workspaceOpenController.ensureUnsavedTabDocuments;
loadExistingGraphIntoTabFromController = workspaceOpenController.loadExistingGraphIntoTab;
openExistingGraphFromController = workspaceOpenController.openExistingGraph;
openNewTabFromController = workspaceOpenController.openNewTab;
openRestoredRunTabFromController = workspaceOpenController.openRestoredRunTab;
const {
  renameActiveGraph,
  saveActiveGraph,
  saveActiveGraphAsNewGraph,
  saveActiveGraphAsTemplate,
  saveTab,
  validateActiveGraph,
  exportActiveGraph,
} = useWorkspaceGraphPersistenceController({
  activeTab,
  workspace,
  documentsByTabId,
  guardGraphEditForTab,
  commitDirtyDocumentForTab,
  registerDocumentForTab,
  updateWorkspace,
  updateWorkspaceTab,
  syncRouteToTab,
  loadGraphs: () => graphStore.loadGraphs(),
  loadTemplates: () => graphStore.loadTemplates(),
  saveGraph,
  saveGraphAsTemplate,
  fetchGraph,
  validateGraph,
  exportLangGraphPython,
  downloadPythonSource,
  setMessageFeedbackForTab,
});
const {
  handlePythonGraphImportSelection,
  importPythonGraphFile,
  openPythonGraphImportDialog,
} = useWorkspacePythonImportController({
  activeTab,
  workspace,
  handledRouteSignature,
  clickPythonGraphImportInput: () => {
    pythonGraphImportInput.value?.click();
  },
  registerDocumentForTab,
  updateWorkspace,
  syncRouteToTab,
  importGraphFromPythonSource,
  isGraphiteUiPythonExportSource,
  setMessageFeedbackForTab,
});
const {
  closeNodeCreationMenu: closeNodeCreationMenuController,
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
  persistedPresets,
  templates: graphTemplates,
  guardGraphEditForTab,
  markDocumentDirty,
  setMessageFeedbackForTab,
  importPythonGraphFile,
  isGraphiteUiPythonExportFile,
});
closeNodeCreationMenuFromController = closeNodeCreationMenuController;
const { saveNodePresetForTab } = useWorkspacePresetController({
  documentsByTabId,
  persistedPresets,
  savePreset,
  fetchPreset,
  setMessageFeedbackForTab,
  showPresetSaveToast,
  translate: (key, params) => t(key, params ?? {}),
});
const {
  activateTab,
  reorderTab,
  requestCloseTab,
  cancelPendingClose,
  discardPendingClose,
  saveAndClosePendingTab,
} = useWorkspaceTabLifecycleController({
  workspace,
  pendingCloseTabId,
  closeBusy,
  closeError,
  documentsByTabId,
  loadingByTabId,
  errorByTabId,
  feedbackByTabId,
  statePanelOpenByTabId,
  sidePanelModeByTabId,
  focusedNodeIdByTabId,
  focusRequestByTabId,
  viewportByTabId,
  runNodeStatusByTabId,
  currentRunNodeIdByTabId,
  latestRunDetailByTabId,
  restoredRunSnapshotIdByTabId,
  humanReviewBusyByTabId,
  humanReviewErrorByTabId,
  runOutputPreviewByTabId,
  runFailureMessageByTabId,
  activeRunEdgeIdsByTabId,
  subgraphRunStatusByTabId,
  runActivityByTabId,
  cancelRunPolling,
  cancelRunEventStreamForTab,
  updateWorkspace,
  writeWorkspace: writePersistedEditorWorkspace,
  removeDocumentDraft: removePersistedEditorDocumentDraft,
  removeViewportDraft: removePersistedEditorViewportDraft,
  syncRouteToTab,
  syncRouteToUrl,
  saveTab,
  closeSaveFailedMessage: () => t("closeDialog.saveFailed"),
});
const { runActiveGraph, resumeHumanReviewRun } = useWorkspaceRunController({
  activeTab,
  documentsByTabId,
  latestRunDetailByTabId,
  restoredRunSnapshotIdByTabId,
  humanReviewBusyByTabId,
  humanReviewErrorByTabId,
  runNodeStatusByTabId,
  currentRunNodeIdByTabId,
  runOutputPreviewByTabId,
  runFailureMessageByTabId,
  activeRunEdgeIdsByTabId,
  runActivityByTabId,
  refreshAgentModels,
  runGraph,
  resumeRun,
  cancelRunPolling,
  getRunGeneration,
  startRunEventStreamForTab,
  pollRunForTab,
  markRunActivityPanelHintForTab,
  setFeedbackForTab,
  setMessageFeedbackForTab,
  showRunErrorToast,
  translate: (key, params) => t(key, params ?? {}),
});

function updateWorkspace(nextWorkspace: PersistedEditorWorkspace) {
  workspace.value = nextWorkspace;
}

function updateWorkspaceTab(tabId: string, updater: (tab: EditorWorkspaceTab) => EditorWorkspaceTab) {
  updateWorkspace({
    ...workspace.value,
    tabs: workspace.value.tabs.map((tab) => (tab.tabId === tabId ? updater(tab) : tab)),
  });
}

const {
  addStateReaderBinding,
  removeStateReaderBinding,
  addStateWriterBinding,
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
  addStateField,
  updateInputConfigForTab,
  updateNodeMetadataForTab,
  updateAgentConfigForTab,
  toggleAgentBreakpointForTab,
  updateConditionConfigForTab,
  updateConditionBranchForTab,
  addConditionBranchForTab,
  removeConditionBranchForTab,
  updateOutputConfigForTab,
  updateStateField,
  deleteStateField,
  removeStateWriterBinding,
} = useWorkspaceGraphMutationActions({
  documentsByTabId,
  focusedNodeIdByTabId,
  skillDefinitions,
  markDocumentDirty,
  focusNodeForTab,
  setMessageFeedbackForTab,
  showStateDeleteBlockedToast,
  openCreatedStateEdgeEditorForTab,
  translate: t,
});

function openSubgraphEditorForTab(tabId: string, nodeId: string) {
  if (guardGraphEditForTab(tabId)) {
    return;
  }
  const parentTab = workspace.value.tabs.find((tab) => tab.tabId === tabId) ?? null;
  const node = documentsByTabId.value[tabId]?.nodes[nodeId];
  if (!parentTab || !node || node.kind !== "subgraph") {
    return;
  }

  const existingSubgraphTab = workspace.value.tabs.find(
    (tab) => tab.kind === "subgraph" && tab.subgraphSource?.parentTabId === tabId && tab.subgraphSource?.nodeId === nodeId,
  );
  if (existingSubgraphTab) {
    updateWorkspace({
      ...workspace.value,
      activeTabId: existingSubgraphTab.tabId,
    });
    syncRouteToTab(existingSubgraphTab, "replace");
    focusNodeForTab(tabId, nodeId);
    return;
  }

  const subgraphTab = createSubgraphWorkspaceTab({
    parentTabId: tabId,
    parentGraphId: parentTab.graphId,
    parentTitle: parentTab.title,
    nodeId,
    nodeName: node.name,
  });
  registerDocumentForTab(subgraphTab.tabId, createSubgraphDocumentFromNode(node));
  updateWorkspace({
    activeTabId: subgraphTab.tabId,
    tabs: [...workspace.value.tabs, subgraphTab],
  });
  syncRouteToTab(subgraphTab, "replace");
  focusNodeForTab(tabId, nodeId);
}

function createSubgraphDocumentFromNode(node: SubgraphNode): GraphPayload {
  return {
    graph_id: null,
    name: node.name,
    ...clonePlainValue(node.config.graph),
  };
}

function subgraphSourceContextLabel(tab: EditorWorkspaceTab) {
  if (tab.kind !== "subgraph" || !tab.subgraphSource) {
    return null;
  }
  const parentTitle = workspace.value.tabs.find((candidate) => candidate.tabId === tab.subgraphSource!.parentTabId)?.title ?? tab.subgraphSource.parentTitle;
  const parentDocument = documentsByTabId.value[tab.subgraphSource.parentTabId];
  const parentNode = parentDocument?.nodes[tab.subgraphSource.nodeId];
  const nodeName = parentNode?.kind === "subgraph" ? parentNode.name : tab.subgraphSource.nodeName;
  return `来自：${parentTitle} / 节点：${nodeName}`;
}

function showPresetSaveToast(type: "success" | "error", message: string) {
  ElMessage({
    customClass: "editor-workspace-shell__preset-toast",
    type,
    duration: 3200,
    grouping: true,
    placement: "top",
    showClose: true,
    message,
  });
}

function showStateDeleteBlockedToast(message: string) {
  ElMessage({
    customClass: "editor-workspace-shell__state-delete-toast",
    type: "warning",
    duration: 4200,
    grouping: true,
    placement: "top",
    showClose: true,
    message,
  });
}

function showRunErrorToast(message: string) {
  ElMessage({
    customClass: "editor-workspace-shell__run-error-toast",
    type: "error",
    duration: 9000,
    grouping: true,
    placement: "top",
    showClose: true,
    message,
  });
}

watch(
  activeCompanionEditorSnapshot,
  (snapshot) => companionContextStore.setEditorSnapshot(snapshot),
  { immediate: true, deep: true },
);

watch(
  workspace,
  (nextWorkspace) => {
    const persistenceRequest = resolveWorkspaceDraftPersistenceRequest({ hydrated: hydrated.value, workspace: nextWorkspace });
    if (!persistenceRequest) {
      return;
    }
    writePersistedEditorWorkspace(persistenceRequest.workspace);
    prunePersistedEditorDocumentDrafts(persistenceRequest.tabIds);
    prunePersistedEditorViewportDrafts(persistenceRequest.tabIds);
  },
  { deep: true },
);

watch(
  [() => workspace.value.tabs, () => props.templates],
  () => {
    if (!shouldRunWorkspaceDraftHydration(hydrated.value)) {
      return;
    }
    ensureTabViewportDrafts();
    ensureUnsavedTabDocuments();
  },
  { deep: true },
);

function reconcileOpenDocumentsWithSkillDefinitions() {
  if (!hydrated.value || skillDefinitions.value.length === 0) {
    return;
  }

  for (const [tabId, document] of Object.entries(documentsByTabId.value)) {
    const nextDocument = reconcileAgentSkillOutputBindingsInDocument(document, skillDefinitions.value);
    if (nextDocument !== document) {
      markDocumentDirty(tabId, nextDocument);
    }
  }
}

watch(
  [() => documentsByTabId.value, () => skillDefinitions.value],
  reconcileOpenDocumentsWithSkillDefinitions,
  { deep: false },
);

watch(
  routeSignature,
  () => {
    if (!hydrated.value) {
      return;
    }
    applyCurrentRouteInstruction();
  },
  { immediate: false },
);

watch(
  activeTab,
  (tab) => {
    if (!tab?.graphId) {
      return;
    }
    void loadExistingGraphIntoTab(tab.tabId, tab.graphId);
  },
  { immediate: true },
);

watch(
  [() => props.routeMode, activeTab],
  ([routeModeValue, nextActiveTab]) => {
    if (!hydrated.value || routeModeValue !== "root" || !nextActiveTab) {
      return;
    }
    syncRouteToTab(nextActiveTab, "replace");
  },
);

onBeforeUnmount(() => {
  companionContextStore.clearEditorSnapshot();
  teardownRunLifecycle();
});

onMounted(() => {
  loadInitialWorkspaceResources();
  updateWorkspace(readPersistedEditorWorkspace());
  ensureTabViewportDrafts();
  hydrated.value = true;
  ensureUnsavedTabDocuments();
  applyCurrentRouteInstruction();
});
</script>

<style scoped>
.editor-workspace-shell {
  --editor-state-panel-open-width: clamp(340px, 32vw, 480px);
  --editor-human-review-panel-open-width: var(--editor-state-panel-open-width);
  --editor-run-activity-panel-open-width: var(--editor-state-panel-open-width);
  --editor-workspace-floating-top-clearance: 72px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--graphite-page-bg);
}

.editor-workspace-shell__file-input {
  display: none;
}

.editor-workspace-shell__welcome {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow: auto;
}

.editor-workspace-shell__chrome {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
  padding: 0 12px 0 0;
  background: transparent;
  pointer-events: none;
}

.editor-workspace-shell__action-capsule-row {
  z-index: 35;
  display: flex;
  justify-content: flex-end;
  min-width: 0;
  padding: 12px 0 0;
  pointer-events: none;
}

.editor-workspace-shell__action-capsule-row > :deep(*) {
  pointer-events: auto;
}

.editor-workspace-shell__workspace {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.editor-workspace-shell__body {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.editor-workspace-shell__editor {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-workspace-shell__editor-grid {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-workspace-shell__editor-main {
  --editor-canvas-floating-top-clearance: var(--editor-workspace-floating-top-clearance);
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-workspace-shell__side-panel-layer {
  position: absolute;
  top: var(--editor-workspace-floating-top-clearance);
  right: 12px;
  bottom: 12px;
  z-index: 30;
  display: flex;
  min-width: 0;
  min-height: 0;
  max-width: calc(100% - 24px);
  pointer-events: none;
}

.editor-workspace-shell__side-panel-layer > :deep(*) {
  pointer-events: auto;
}

:global(.editor-workspace-shell__locked-toast.el-message) {
  top: 50% !important;
  left: 50%;
  min-width: min(620px, calc(100vw - 40px));
  max-width: min(760px, calc(100vw - 40px));
  justify-content: flex-start;
  border: 1px solid rgba(154, 52, 18, 0.56);
  border-radius: 28px;
  padding: 22px 26px;
  background: rgba(255, 247, 237, 0.97);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.68) inset,
    0 24px 64px rgba(124, 45, 18, 0.28),
    0 0 44px rgba(234, 88, 12, 0.34);
  backdrop-filter: blur(30px) saturate(1.7) contrast(1.04);
  transform: translate(-50%, -50%);
  animation: editor-workspace-shell-locked-toast-float 4.2s ease forwards;
}

:global(.editor-workspace-shell__locked-toast .el-message__content) {
  color: #7c2d12;
  font-size: 1.08rem;
  font-weight: 800;
  line-height: 1.5;
}

:global(.editor-workspace-shell__locked-toast .el-message__icon) {
  color: #c2410c;
  font-size: 22px;
}

:global(.editor-workspace-shell__preset-toast.el-message) {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.98);
  box-shadow: 0 14px 34px rgba(60, 41, 20, 0.14);
  backdrop-filter: blur(20px) saturate(1.45);
}

:global(.editor-workspace-shell__preset-toast .el-message__content) {
  color: #7c2d12;
  font-weight: 700;
}

:global(.editor-workspace-shell__state-delete-toast.el-message) {
  border: 1px solid rgba(154, 52, 18, 0.22);
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.98);
  box-shadow: 0 14px 34px rgba(60, 41, 20, 0.14);
  backdrop-filter: blur(20px) saturate(1.45);
}

:global(.editor-workspace-shell__state-delete-toast .el-message__content) {
  color: #7c2d12;
  font-weight: 700;
}

:global(.editor-workspace-shell__run-error-toast.el-message) {
  min-width: min(560px, calc(100vw - 40px));
  max-width: min(820px, calc(100vw - 40px));
  align-items: flex-start;
  border: 1px solid rgba(190, 18, 60, 0.24);
  border-radius: 16px;
  background: rgba(255, 241, 242, 0.98);
  box-shadow: 0 16px 42px rgba(127, 29, 29, 0.18);
  backdrop-filter: blur(20px) saturate(1.45);
}

:global(.editor-workspace-shell__run-error-toast .el-message__content) {
  color: #881337;
  font-weight: 750;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

@keyframes editor-workspace-shell-locked-toast-float {
  0% {
    opacity: 0;
    transform: translate(-50%, -42%) scale(0.96);
  }

  12%,
  76% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -66%) scale(0.98);
  }
}

.editor-workspace-shell__status-card {
  width: min(100%, 560px);
  margin: 64px auto;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 28px;
  padding: 24px;
  text-align: center;
  background: rgba(255, 250, 241, 0.92);
  box-shadow: 0 20px 60px rgba(60, 41, 20, 0.08);
}

.editor-workspace-shell__status-eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
}

.editor-workspace-shell__status-card h2 {
  margin: 10px 0 8px;
}

.editor-workspace-shell__status-card p {
  margin: 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.74);
}

.editor-workspace-shell__status-card--danger,
.editor-workspace-shell__route-error {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgba(254, 242, 242, 0.94);
}

.editor-workspace-shell__route-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 12px 16px 0;
  border: 1px solid rgba(185, 28, 28, 0.18);
  border-radius: 18px;
  padding: 10px 14px;
  color: rgba(127, 29, 29, 0.9);
}

.editor-workspace-shell__route-error-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

@media (max-width: 920px) {
  .editor-workspace-shell {
    --editor-workspace-floating-top-clearance: 124px;
  }

  .editor-workspace-shell__chrome {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 12px;
    padding: 12px;
  }

  .editor-workspace-shell__action-capsule-row {
    display: flex;
    justify-content: flex-end;
    pointer-events: auto;
    padding: 0;
  }

}

@media (max-width: 760px) {
  .editor-workspace-shell {
    --editor-state-panel-open-width: min(320px, calc(100vw - var(--app-sidebar-width) - 24px));
    --editor-human-review-panel-open-width: var(--editor-state-panel-open-width);
    --editor-run-activity-panel-open-width: var(--editor-state-panel-open-width);
  }
}
</style>
