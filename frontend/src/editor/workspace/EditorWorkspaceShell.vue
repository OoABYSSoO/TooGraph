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
            @toggle-state-panel="toggleActiveStatePanel"
            @save-active-graph="saveActiveGraph"
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
                :active-run-edge-ids="activeRunEdgeIdsByTabId[tab.tabId] ?? undefined"
                :interaction-locked="isGraphInteractionLocked(tab.tabId)"
                :initial-viewport="viewportByTabId[tab.tabId] ?? null"
                :state-editor-request="dataEdgeStateEditorRequestByTabId[tab.tabId] ?? null"
                @select-node="focusNodeForTab(tab.tabId, $event)"
                @update-node-metadata="updateNodeMetadataForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-config="updateInputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @update-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @remove-port-state="removeNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey)"
                @reorder-port-state="reorderNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey, $event.targetStateKey)"
                @disconnect-data-edge="disconnectDataEdgeForTab(tab.tabId, $event.sourceNodeId, $event.targetNodeId, $event.stateKey, $event.mode)"
                @update-agent-config="updateAgentConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @toggle-agent-breakpoint="toggleAgentBreakpointForTab(tab.tabId, $event.nodeId, $event.enabled)"
                @update-agent-breakpoint-timing="updateAgentBreakpointTimingForTab(tab.tabId, $event.nodeId, $event.timing)"
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
import { exportLangGraphPython, fetchGraph, importGraphFromPythonSource, runGraph, saveGraph, validateGraph } from "@/api/graphs";
import { resolveAgentRuntimeCatalog } from "@/editor/nodes/agentConfigModel";
import EditorCanvas from "@/editor/canvas/EditorCanvas.vue";
import type { NodeFocusRequest } from "@/editor/canvas/useNodeSelectionFocus";
import { buildBuiltinNodeCreationEntries } from "@/editor/workspace/nodeCreationBuiltins";
import { buildNodeCreationEntries } from "@/editor/workspace/nodeCreationMenuModel";
import { createNodeFromCreationEntry, createNodeFromDroppedFile } from "./nodeCreationExecution.ts";
import { connectStateInputSourceToTarget } from "@/lib/graph-node-creation";
import { isVirtualAnyOutputStateKey } from "@/lib/virtual-any-input";
import { resolveEditorRouteInstruction } from "@/lib/editor-route-sync";
import {
  addConditionBranchToDocument,
  cloneGraphDocument,
  connectConditionRouteInDocument,
  connectFlowNodesInDocument,
  connectStateBindingInDocument,
  createEditorSeedDraftGraph,
  reconnectConditionRouteInDocument,
  reconnectFlowEdgeInDocument,
  removeConditionRouteFromDocument,
  removeConditionBranchFromDocument,
  removeFlowEdgeFromDocument,
  removeNodeFromDocument,
  pruneUnreferencedStateSchemaInDocument,
  reorderNodePortStateInDocument,
  resolveEditorSeedTemplate,
  syncKnowledgeBaseSkillsInDocument,
  updateAgentBreakpointInDocument,
  updateAgentBreakpointTimingInDocument,
  updateAgentNodeConfigInDocument,
  updateConditionBranchInDocument,
  updateConditionNodeConfigInDocument,
  updateInputNodeConfigInDocument,
  updateNodeMetadataInDocument,
  updateOutputNodeConfigInDocument,
} from "@/lib/graph-document";
import {
  applyDocumentMetaToWorkspaceTab,
  closeWorkspaceTabTransition,
  createUnsavedWorkspaceTab,
  ensureSavedGraphTab,
  prunePersistedEditorDocumentDrafts,
  prunePersistedEditorViewportDrafts,
  readPersistedEditorDocumentDraft,
  readPersistedEditorViewportDraft,
  readPersistedEditorWorkspace,
  reorderWorkspaceTab,
  removePersistedEditorDocumentDraft,
  removePersistedEditorViewportDraft,
  resolveEditorUrl,
  resolveWorkspaceTabUrl,
  writePersistedEditorDocumentDraft,
  writePersistedEditorViewportDraft,
  writePersistedEditorWorkspace,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "@/lib/editor-workspace";
import type { CanvasViewport } from "@/editor/canvas/canvasViewport";
import { buildRestoredGraphFromRun, buildSnapshotScopedRun, canRestoreRunDetail, resolveRestoredRunTabTitle } from "@/lib/run-restore";
import { useGraphDocumentStore } from "@/stores/graphDocument";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { RunDetail } from "@/types/run";
import type { SettingsPayload } from "@/types/settings";
import type { SkillDefinition } from "@/types/skills";
import type {
  AgentNode,
  ConditionNode,
  GraphDocument,
  GraphNode,
  GraphNodeSize,
  GraphPayload,
  GraphPosition,
  InputNode,
  NodeCreationContext,
  NodeCreationEntry,
  OutputNode,
  PresetDocument,
  StateDefinition,
  TemplateRecord,
} from "@/types/node-system";

import EditorActionCapsule from "./EditorActionCapsule.vue";
import EditorCloseConfirmDialog from "./EditorCloseConfirmDialog.vue";
import EditorHumanReviewPanel from "./EditorHumanReviewPanel.vue";
import EditorNodeCreationMenu from "./EditorNodeCreationMenu.vue";
import EditorStatePanel from "./EditorStatePanel.vue";
import EditorTabBar from "./EditorTabBar.vue";
import EditorWelcomeState from "./EditorWelcomeState.vue";
import { formatRunFeedback, formatValidationFeedback, type RunFeedback, type WorkspaceFeedbackTone } from "./runFeedbackModel.ts";
import { buildRunNodeArtifactsModel, mergeRunOutputPreviewByNodeId } from "./runNodeArtifactsModel.ts";
import { applyRunWrittenStateValuesToDocument } from "./runStatePersistence.ts";
import { addStateBindingToDocument, removeStateBindingFromDocument } from "./statePanelBindings.ts";
import {
  addStateFieldToDocument,
  buildNextDefaultStateField,
  deleteStateFieldFromDocument,
  insertStateFieldIntoDocument,
  listStateFieldUsageLabels,
  updateStateFieldInDocument,
  type StateFieldDraft,
} from "./statePanelFields.ts";
import { buildPythonExportFileName, downloadPythonSource } from "./pythonExportModel.ts";
import { isGraphiteUiPythonExportFile, isGraphiteUiPythonExportSource } from "./pythonImportModel.ts";
import { buildPresetPayloadForNode } from "./presetPersistence.ts";

type DataEdgeStateEditorRequest = {
  requestId: string;
  sourceNodeId: string;
  targetNodeId: string;
  stateKey: string;
  position: GraphPosition;
};

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
const sidePanelModeByTabId = ref<Record<string, "state" | "human-review">>({});
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
const feedbackByTabId = ref<Record<string, (RunFeedback & { activeRunId?: string | null; activeRunStatus?: string | null }) | null>>({});
const routeRestoreError = ref<string | null>(null);
const knowledgeBases = ref<KnowledgeBaseRecord[]>([]);
const settings = ref<SettingsPayload | null>(null);
const skillDefinitions = ref<SkillDefinition[]>([]);
const skillDefinitionsLoading = ref(true);
const skillDefinitionsError = ref<string | null>(null);
const persistedPresets = ref<PresetDocument[]>([]);
const nodeCreationMenuByTabId = ref<
  Record<
    string,
    {
      open: boolean;
      context: NodeCreationContext | null;
      position: { x: number; y: number } | null;
      query: string;
    }
  >
>({});
const runPollGenerationByTabId = new Map<string, number>();
const runPollTimerByTabId = new Map<string, number>();
const runEventSourceByTabId = new Map<string, EventSource>();

const templateById = computed(() => new Map(props.templates.map((template) => [template.template_id, template])));
const graphById = computed(() => new Map(props.graphs.map((graph) => [graph.graph_id, graph])));
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
const activeStatePanelOpen = computed(() => {
  const tab = activeTab.value;
  return tab ? statePanelOpenByTabId.value[tab.tabId] ?? false : false;
});
const activeTabRouteSignature = computed(() => {
  const tab = activeTab.value;
  if (!tab) {
    return null;
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

function feedbackForTab(tabId: string) {
  return feedbackByTabId.value[tabId] ?? null;
}

function applyRunVisualStateToTab(
  tabId: string,
  run: RunDetail,
  document: GraphPayload | GraphDocument,
  visualRun: RunDetail = run,
) {
  const nodeIds = Object.keys(document.nodes);
  const nodeLabelLookup = Object.fromEntries(Object.entries(document.nodes).map(([nodeId, node]) => [nodeId, node.name.trim() || nodeId]));
  const feedback = formatRunFeedback(visualRun, {
    nodeIds,
    nodeLabelLookup,
  });
  const runArtifactsModel = buildRunNodeArtifactsModel(visualRun);
  latestRunDetailByTabId.value = {
    ...latestRunDetailByTabId.value,
    [tabId]: visualRun,
  };
  runNodeStatusByTabId.value = {
    ...runNodeStatusByTabId.value,
    [tabId]: visualRun.node_status_map ?? {},
  };
  currentRunNodeIdByTabId.value = {
    ...currentRunNodeIdByTabId.value,
    [tabId]: visualRun.current_node_id ?? null,
  };
  applyRunOutputPreviewForTab(tabId, runArtifactsModel.outputPreviewByNodeId);
  runFailureMessageByTabId.value = {
    ...runFailureMessageByTabId.value,
    [tabId]: runArtifactsModel.failedMessageByNodeId,
  };
  activeRunEdgeIdsByTabId.value = {
    ...activeRunEdgeIdsByTabId.value,
    [tabId]: runArtifactsModel.activeEdgeIds,
  };
  setFeedbackForTab(tabId, {
    ...feedback,
    activeRunId: run.run_id,
    activeRunStatus: visualRun.status,
  });
}

function setFeedbackForTab(
  tabId: string,
  feedback: RunFeedback & {
    activeRunId?: string | null;
    activeRunStatus?: string | null;
  },
) {
  feedbackByTabId.value = {
    ...feedbackByTabId.value,
    [tabId]: feedback,
  };
}

function setMessageFeedbackForTab(
  tabId: string,
  input: {
    tone: WorkspaceFeedbackTone;
    message: string;
    activeRunId?: string | null;
    activeRunStatus?: string | null;
  },
) {
  setFeedbackForTab(tabId, {
    tone: input.tone,
    message: input.message,
    activeRunId: input.activeRunId ?? null,
    activeRunStatus: input.activeRunStatus ?? null,
    summary: {
      idle: 0,
      running: 0,
      paused: 0,
      success: 0,
      failed: 0,
    },
    currentNodeLabel: null,
  });
}

function cancelRunPolling(tabId: string) {
  runPollGenerationByTabId.set(tabId, (runPollGenerationByTabId.get(tabId) ?? 0) + 1);
  const timerId = runPollTimerByTabId.get(tabId);
  if (typeof timerId === "number") {
    window.clearTimeout(timerId);
    runPollTimerByTabId.delete(tabId);
  }
}

function cancelRunEventStreamForTab(tabId: string) {
  runEventSourceByTabId.get(tabId)?.close();
  runEventSourceByTabId.delete(tabId);
}

function parseRunEventPayload(event: Event) {
  if (!(event instanceof MessageEvent)) {
    return null;
  }
  try {
    const payload = JSON.parse(String(event.data ?? ""));
    return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function resolveStreamingOutputNodeIds(tabId: string, outputKeys: string[]) {
  const document = documentsByTabId.value[tabId];
  if (!document || outputKeys.length === 0) {
    return [];
  }
  const outputKeySet = new Set(outputKeys);
  return Object.entries(document.nodes)
    .filter(([, node]) => node.kind === "output" && node.reads.some((read) => outputKeySet.has(read.state)))
    .map(([nodeId]) => nodeId);
}

function applyStreamingOutputPreviewToTab(tabId: string, payload: Record<string, unknown>) {
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text) {
    return;
  }
  const outputKeys = Array.isArray(payload.output_keys)
    ? payload.output_keys.map((key) => String(key)).filter(Boolean)
    : [];
  const fallbackNodeId = String(payload.node_id ?? "").trim();
  const targetNodeIds = resolveStreamingOutputNodeIds(tabId, outputKeys);
  const previewNodeIds = targetNodeIds.length > 0 ? targetNodeIds : fallbackNodeId ? [fallbackNodeId] : [];
  if (previewNodeIds.length === 0) {
    return;
  }
  const currentPreview = runOutputPreviewByTabId.value[tabId] ?? {};
  const nextPreview = { ...currentPreview };
  for (const nodeId of previewNodeIds) {
    nextPreview[nodeId] = {
      text,
      displayMode: "plain",
    };
  }
  runOutputPreviewByTabId.value = {
    ...runOutputPreviewByTabId.value,
    [tabId]: nextPreview,
  };
}

function applyRunOutputPreviewForTab(
  tabId: string,
  nextPreviewByNodeId: Record<string, { text: string; displayMode: string | null }>,
  options: { preserveMissing?: boolean } = {},
) {
  runOutputPreviewByTabId.value = {
    ...runOutputPreviewByTabId.value,
    [tabId]: mergeRunOutputPreviewByNodeId(runOutputPreviewByTabId.value[tabId] ?? {}, nextPreviewByNodeId, options),
  };
}

function isActiveRunStatus(status: string | null | undefined) {
  return status === "queued" || status === "running" || status === "resuming";
}

function startRunEventStreamForTab(tabId: string, runId: string) {
  cancelRunEventStreamForTab(tabId);
  if (!runId || typeof EventSource === "undefined") {
    return;
  }
  const source = new EventSource(`/api/runs/${runId}/events`);
  runEventSourceByTabId.set(tabId, source);
  source.addEventListener("node.output.delta", (event) => {
    const payload = parseRunEventPayload(event);
    if (payload) {
      applyStreamingOutputPreviewToTab(tabId, payload);
    }
  });
  source.addEventListener("node.output.completed", (event) => {
    const payload = parseRunEventPayload(event);
    if (payload) {
      applyStreamingOutputPreviewToTab(tabId, payload);
    }
  });
  source.addEventListener("run.completed", () => {
    cancelRunEventStreamForTab(tabId);
    void pollRunForTab(tabId, runId);
  });
  source.addEventListener("run.failed", () => {
    cancelRunEventStreamForTab(tabId);
    void pollRunForTab(tabId, runId);
  });
  source.onerror = () => {
    if (runEventSourceByTabId.get(tabId) === source) {
      cancelRunEventStreamForTab(tabId);
    }
  };
}

function scheduleRunPoll(tabId: string, runId: string, delayMs: number, generation: number) {
  const timerId = window.setTimeout(() => {
    void pollRunForTab(tabId, runId, generation);
  }, delayMs);
  runPollTimerByTabId.set(tabId, timerId);
}

async function pollRunForTab(tabId: string, runId: string, generation = runPollGenerationByTabId.get(tabId) ?? 0) {
  if ((runPollGenerationByTabId.get(tabId) ?? 0) !== generation) {
    return;
  }

  try {
    const run = await fetchRun(runId);
    if ((runPollGenerationByTabId.get(tabId) ?? 0) !== generation) {
      return;
    }

    const document = documentsByTabId.value[tabId];
    const nodeIds = document ? Object.keys(document.nodes) : [];
    const nodeLabelLookup = document
      ? Object.fromEntries(Object.entries(document.nodes).map(([nodeId, node]) => [nodeId, node.name.trim() || nodeId]))
      : {};
    const feedback = formatRunFeedback(run, {
      nodeIds,
      nodeLabelLookup,
    });
    const runArtifactsModel = buildRunNodeArtifactsModel(run);
    latestRunDetailByTabId.value = {
      ...latestRunDetailByTabId.value,
      [tabId]: run,
    };
    restoredRunSnapshotIdByTabId.value = {
      ...restoredRunSnapshotIdByTabId.value,
      [tabId]: null,
    };
    runNodeStatusByTabId.value = {
      ...runNodeStatusByTabId.value,
      [tabId]: run.node_status_map ?? {},
    };
    currentRunNodeIdByTabId.value = {
      ...currentRunNodeIdByTabId.value,
      [tabId]: run.current_node_id ?? null,
    };
    applyRunOutputPreviewForTab(tabId, runArtifactsModel.outputPreviewByNodeId, { preserveMissing: isActiveRunStatus(run.status) });
    runFailureMessageByTabId.value = {
      ...runFailureMessageByTabId.value,
      [tabId]: runArtifactsModel.failedMessageByNodeId,
    };
    activeRunEdgeIdsByTabId.value = {
      ...activeRunEdgeIdsByTabId.value,
      [tabId]: runArtifactsModel.activeEdgeIds,
    };
    setFeedbackForTab(tabId, {
      ...feedback,
      activeRunId: run.run_id,
      activeRunStatus: run.status,
    });

    if (run.status === "awaiting_human" && run.current_node_id) {
      openHumanReviewPanelForTab(tabId, run.current_node_id);
    }

    if (run.status === "queued" || run.status === "running" || run.status === "resuming") {
      scheduleRunPoll(tabId, runId, 500, generation);
      return;
    }

    persistRunStateValuesForTab(tabId, run);
    runPollTimerByTabId.delete(tabId);
    cancelRunEventStreamForTab(tabId);
  } catch (error) {
    if ((runPollGenerationByTabId.get(tabId) ?? 0) !== generation) {
      return;
    }

    setMessageFeedbackForTab(tabId, {
      tone: "warning",
      message: error instanceof Error ? error.message : "Failed to load run detail.",
      activeRunId: runId,
      activeRunStatus: "running",
    });
    scheduleRunPoll(tabId, runId, 1000, generation);
  }
}

function applyCurrentRouteInstruction() {
  const instruction = resolveEditorRouteInstruction({
    routeMode: props.routeMode,
    routeGraphId: props.routeGraphId ?? null,
    defaultTemplateId: props.defaultTemplateId ?? null,
    restoreRunId: props.restoreRunId ?? null,
    restoreSnapshotId: props.restoreSnapshotId ?? null,
    activeTabRouteSignature: activeTabRouteSignature.value,
    routeSignature: routeSignature.value,
    handledRouteSignature: handledRouteSignature.value,
  });

  if (instruction.type === "restore-run") {
    void openRestoredRunTab(instruction.runId, instruction.snapshotId ?? null, instruction.navigation);
    return;
  }

  if (instruction.type === "open-new") {
    routeRestoreError.value = null;
    openNewTab(instruction.templateId, instruction.navigation);
    return;
  }

  if (instruction.type === "open-existing") {
    routeRestoreError.value = null;
    openExistingGraph(instruction.graphId, instruction.navigation);
    return;
  }

  handledRouteSignature.value = routeSignature.value;
}

function syncRouteToUrl(targetUrl: string, mode: "push" | "replace" = "push") {
  if (route.fullPath === targetUrl) {
    return;
  }
  if (mode === "replace") {
    void router.replace(targetUrl);
    return;
  }
  void router.push(targetUrl);
}

function syncRouteToTab(
  tab: Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId">,
  mode: "push" | "replace" = "push",
) {
  syncRouteToUrl(resolveWorkspaceTabUrl(tab), mode);
}

function updateWorkspace(nextWorkspace: PersistedEditorWorkspace) {
  workspace.value = nextWorkspace;
}

function updateWorkspaceTab(tabId: string, updater: (tab: EditorWorkspaceTab) => EditorWorkspaceTab) {
  updateWorkspace({
    ...workspace.value,
    tabs: workspace.value.tabs.map((tab) => (tab.tabId === tabId ? updater(tab) : tab)),
  });
}

function registerDocumentForTab(tabId: string, graph: GraphPayload | GraphDocument) {
  const syncedDocument = syncKnowledgeBaseSkillsInDocument(graph);
  documentsByTabId.value = {
    ...documentsByTabId.value,
    [tabId]: syncedDocument,
  };
  writePersistedEditorDocumentDraft(tabId, syncedDocument);
  loadingByTabId.value = {
    ...loadingByTabId.value,
    [tabId]: false,
  };
  errorByTabId.value = {
    ...errorByTabId.value,
    [tabId]: null,
  };
  if (!feedbackByTabId.value[tabId]) {
    setMessageFeedbackForTab(tabId, {
      tone: "neutral",
      message: `Ready to edit ${syncedDocument.name}.`,
    });
  }
}

function ensureTabViewportDrafts() {
  const nextViewports = { ...viewportByTabId.value };
  let changed = false;
  for (const tab of workspace.value.tabs) {
    if (nextViewports[tab.tabId]) {
      continue;
    }
    const persistedViewport = readPersistedEditorViewportDraft(tab.tabId);
    if (!persistedViewport) {
      continue;
    }
    nextViewports[tab.tabId] = persistedViewport;
    changed = true;
  }
  if (changed) {
    viewportByTabId.value = nextViewports;
  }
}

function updateCanvasViewportForTab(tabId: string, viewport: CanvasViewport) {
  const previousViewport = viewportByTabId.value[tabId] ?? null;
  if (
    previousViewport &&
    previousViewport.x === viewport.x &&
    previousViewport.y === viewport.y &&
    previousViewport.scale === viewport.scale
  ) {
    return;
  }

  viewportByTabId.value = {
    ...viewportByTabId.value,
    [tabId]: viewport,
  };
  writePersistedEditorViewportDraft(tabId, viewport);
}

function clearTabRuntime(tabId: string) {
  cancelRunPolling(tabId);
  cancelRunEventStreamForTab(tabId);
  const nextDocuments = { ...documentsByTabId.value };
  const nextLoading = { ...loadingByTabId.value };
  const nextErrors = { ...errorByTabId.value };
  const nextFeedback = { ...feedbackByTabId.value };
  delete nextDocuments[tabId];
  delete nextLoading[tabId];
  delete nextErrors[tabId];
  delete nextFeedback[tabId];
  const nextPanels = { ...statePanelOpenByTabId.value };
  delete nextPanels[tabId];
  const nextSidePanelModes = { ...sidePanelModeByTabId.value };
  delete nextSidePanelModes[tabId];
  const nextFocusedNodes = { ...focusedNodeIdByTabId.value };
  delete nextFocusedNodes[tabId];
  const nextFocusRequests = { ...focusRequestByTabId.value };
  delete nextFocusRequests[tabId];
  const nextViewports = { ...viewportByTabId.value };
  delete nextViewports[tabId];
  const nextRunNodeStatus = { ...runNodeStatusByTabId.value };
  delete nextRunNodeStatus[tabId];
  const nextCurrentRunNode = { ...currentRunNodeIdByTabId.value };
  delete nextCurrentRunNode[tabId];
  const nextLatestRuns = { ...latestRunDetailByTabId.value };
  delete nextLatestRuns[tabId];
  const nextRestoredRunSnapshots = { ...restoredRunSnapshotIdByTabId.value };
  delete nextRestoredRunSnapshots[tabId];
  const nextHumanReviewBusy = { ...humanReviewBusyByTabId.value };
  delete nextHumanReviewBusy[tabId];
  const nextHumanReviewErrors = { ...humanReviewErrorByTabId.value };
  delete nextHumanReviewErrors[tabId];
  const nextOutputPreviews = { ...runOutputPreviewByTabId.value };
  delete nextOutputPreviews[tabId];
  const nextFailureMessages = { ...runFailureMessageByTabId.value };
  delete nextFailureMessages[tabId];
  const nextActiveEdges = { ...activeRunEdgeIdsByTabId.value };
  delete nextActiveEdges[tabId];
  documentsByTabId.value = nextDocuments;
  loadingByTabId.value = nextLoading;
  errorByTabId.value = nextErrors;
  feedbackByTabId.value = nextFeedback;
  statePanelOpenByTabId.value = nextPanels;
  sidePanelModeByTabId.value = nextSidePanelModes;
  focusedNodeIdByTabId.value = nextFocusedNodes;
  focusRequestByTabId.value = nextFocusRequests;
  viewportByTabId.value = nextViewports;
  runNodeStatusByTabId.value = nextRunNodeStatus;
  currentRunNodeIdByTabId.value = nextCurrentRunNode;
  latestRunDetailByTabId.value = nextLatestRuns;
  restoredRunSnapshotIdByTabId.value = nextRestoredRunSnapshots;
  humanReviewBusyByTabId.value = nextHumanReviewBusy;
  humanReviewErrorByTabId.value = nextHumanReviewErrors;
  runOutputPreviewByTabId.value = nextOutputPreviews;
  runFailureMessageByTabId.value = nextFailureMessages;
  activeRunEdgeIdsByTabId.value = nextActiveEdges;
}

function createDraftForTab(tab: EditorWorkspaceTab): GraphPayload {
  if (tab.templateId) {
    const template = templateById.value.get(tab.templateId);
    if (template) {
      const draft = createEditorSeedDraftGraph(props.templates, template.template_id, tab.title);
      draft.name = tab.title;
      return draft;
    }
  }
  return createEditorSeedDraftGraph(props.templates, tab.defaultTemplateId ?? null, tab.title);
}

function ensureUnsavedTabDocuments() {
  for (const tab of workspace.value.tabs) {
    if (tab.graphId || documentsByTabId.value[tab.tabId]) {
      continue;
    }
    const persistedDraft = readPersistedEditorDocumentDraft(tab.tabId);
    registerDocumentForTab(tab.tabId, persistedDraft ?? createDraftForTab(tab));
  }
}

function openNewTab(templateId: string | null, navigation: "push" | "replace" | "none" = "push") {
  const template = templateId ? templateById.value.get(templateId) ?? null : null;
  const seedTemplate = resolveEditorSeedTemplate(props.templates, template?.template_id ?? null);
  const draft = createEditorSeedDraftGraph(props.templates, template?.template_id ?? null);
  const tab = createUnsavedWorkspaceTab({
    kind: template ? "template" : "new",
    title: template?.label ?? seedTemplate?.default_graph_name ?? draft.name,
    templateId: template?.template_id ?? null,
    defaultTemplateId: template?.template_id ?? null,
  });

  registerDocumentForTab(tab.tabId, draft);
  updateWorkspace({
    activeTabId: tab.tabId,
    tabs: [...workspace.value.tabs, tab],
  });

  if (navigation !== "none") {
    syncRouteToTab(tab, navigation === "replace" ? "replace" : "push");
  }
  handledRouteSignature.value = templateId ? `new:${templateId}` : "new:";
}

async function openRestoredRunTab(runId: string, snapshotId: string | null = props.restoreSnapshotId ?? null, navigation: "push" | "replace" | "none" = "push") {
  routeRestoreError.value = null;

  try {
    const run = await fetchRun(runId);
    if (!canRestoreRunDetail(run)) {
      throw new Error(`Run ${runId} cannot be restored into the editor.`);
    }
    const visualRun = buildSnapshotScopedRun(run, snapshotId);
    const restoredGraph = buildRestoredGraphFromRun(run, snapshotId);
    const tab = {
      ...createUnsavedWorkspaceTab({
        kind: "new",
        title: resolveRestoredRunTabTitle(run),
      }),
      dirty: true,
    };

    registerDocumentForTab(tab.tabId, restoredGraph);
    updateWorkspace({
      activeTabId: tab.tabId,
      tabs: [...workspace.value.tabs, tab],
    });
    restoredRunSnapshotIdByTabId.value = {
      ...restoredRunSnapshotIdByTabId.value,
      [tab.tabId]: snapshotId,
    };
    applyRunVisualStateToTab(tab.tabId, run, restoredGraph, visualRun);
    handledRouteSignature.value = routeSignature.value;

    if (visualRun.status === "awaiting_human" && visualRun.current_node_id) {
      openHumanReviewPanelForTab(tab.tabId, visualRun.current_node_id);
    }

    if (navigation !== "none") {
      syncRouteToTab(tab, navigation === "replace" ? "replace" : "push");
    }
  } catch (error) {
    routeRestoreError.value = error instanceof Error ? error.message : `Failed to restore run ${runId}.`;
    handledRouteSignature.value = routeSignature.value;
  }
}

function openImportedGraphTab(graph: GraphPayload, fileName: string) {
  const importedGraph = cloneGraphDocument({
    ...graph,
    graph_id: null,
    name: graph.name?.trim() || fileName.replace(/\.py$/i, "") || "Imported Graph",
  });
  const tab = {
    ...createUnsavedWorkspaceTab({
      kind: "new",
      title: importedGraph.name,
    }),
    dirty: true,
  };

  registerDocumentForTab(tab.tabId, importedGraph);
  updateWorkspace({
    activeTabId: tab.tabId,
    tabs: [...workspace.value.tabs, tab],
  });
  syncRouteToTab(tab);
  handledRouteSignature.value = "new:";
  setMessageFeedbackForTab(tab.tabId, {
    tone: "success",
    message: `Imported graph from ${fileName}.`,
  });
}

async function loadExistingGraphIntoTab(tabId: string, graphId: string) {
  if (documentsByTabId.value[tabId] || loadingByTabId.value[tabId]) {
    return;
  }

  loadingByTabId.value = {
    ...loadingByTabId.value,
    [tabId]: true,
  };
  errorByTabId.value = {
    ...errorByTabId.value,
    [tabId]: null,
  };

  try {
    const persistedDraft = readPersistedEditorDocumentDraft(tabId);
    if (persistedDraft) {
      registerDocumentForTab(tabId, persistedDraft);
      return;
    }
    const graph = await fetchGraph(graphId);
    registerDocumentForTab(tabId, graph);
  } catch (error) {
    loadingByTabId.value = {
      ...loadingByTabId.value,
      [tabId]: false,
    };
    errorByTabId.value = {
      ...errorByTabId.value,
      [tabId]: error instanceof Error ? error.message : "Failed to load graph.",
    };
  }
}

function openExistingGraph(graphId: string, navigation: "push" | "replace" | "none" = "push") {
  const graph = graphById.value.get(graphId) ?? null;
  const nextWorkspace = ensureSavedGraphTab(workspace.value, {
    graphId,
    title: graph?.name ?? graphId,
  });
  updateWorkspace(nextWorkspace);

  const nextTabId = nextWorkspace.activeTabId;
  if (nextTabId && !documentsByTabId.value[nextTabId]) {
    const persistedDraft = readPersistedEditorDocumentDraft(nextTabId);
    if (persistedDraft) {
      registerDocumentForTab(nextTabId, persistedDraft);
    } else if (graph) {
      registerDocumentForTab(nextTabId, cloneGraphDocument(graph));
    } else {
      void loadExistingGraphIntoTab(nextTabId, graphId);
    }
  }

  if (navigation !== "none") {
    syncRouteToTab(
      {
        graphId,
        kind: "existing",
        templateId: null,
        defaultTemplateId: null,
      },
      navigation === "replace" ? "replace" : "push",
    );
  }
  handledRouteSignature.value = `existing:${graphId}`;
}

function activateTab(tabId: string) {
  const tab = workspace.value.tabs.find((entry) => entry.tabId === tabId);
  if (!tab) {
    return;
  }
  updateWorkspace({
    ...workspace.value,
    activeTabId: tabId,
  });
  syncRouteToTab(tab);
}

function reorderTab(sourceTabId: string, targetTabId: string, placement: "before" | "after") {
  updateWorkspace(reorderWorkspaceTab(workspace.value, sourceTabId, targetTabId, placement));
}

function finalizeTabClose(tabId: string) {
  const transition = closeWorkspaceTabTransition(workspace.value, tabId);
  updateWorkspace(transition.workspace);
  writePersistedEditorWorkspace(transition.workspace);
  removePersistedEditorDocumentDraft(tabId);
  removePersistedEditorViewportDraft(tabId);
  clearTabRuntime(tabId);

  if (transition.closedActiveTab) {
    syncRouteToUrl(resolveEditorUrl(transition.nextGraphId));
  }
}

function requestCloseTab(tabId: string) {
  const tab = workspace.value.tabs.find((entry) => entry.tabId === tabId);
  if (!tab) {
    return;
  }

  if (!tab.dirty) {
    finalizeTabClose(tabId);
    return;
  }

  pendingCloseTabId.value = tabId;
  closeError.value = null;
}

function cancelPendingClose() {
  if (closeBusy.value) {
    return;
  }
  pendingCloseTabId.value = null;
  closeError.value = null;
}

function discardPendingClose() {
  if (!pendingCloseTabId.value || closeBusy.value) {
    return;
  }
  finalizeTabClose(pendingCloseTabId.value);
  pendingCloseTabId.value = null;
  closeError.value = null;
}

function setDocumentForTab(tabId: string, nextDocument: GraphPayload | GraphDocument) {
  const syncedDocument = syncKnowledgeBaseSkillsInDocument(nextDocument);
  documentsByTabId.value = {
    ...documentsByTabId.value,
    [tabId]: syncedDocument,
  };
  writePersistedEditorDocumentDraft(tabId, syncedDocument);
}

function persistRunStateValuesForTab(tabId: string, run: RunDetail) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = applyRunWrittenStateValuesToDocument(document, run);
  if (nextDocument !== document) {
    setDocumentForTab(tabId, nextDocument);
  }
}

function isStatePanelOpen(tabId: string) {
  return statePanelOpenByTabId.value[tabId] ?? false;
}

function sidePanelMode(tabId: string) {
  return sidePanelModeByTabId.value[tabId] ?? "state";
}

function canShowHumanReviewPanel(tabId: string) {
  return latestRunDetailByTabId.value[tabId]?.status === "awaiting_human";
}

function shouldShowHumanReviewPanel(tabId: string) {
  return sidePanelMode(tabId) === "human-review" && canShowHumanReviewPanel(tabId);
}

function isHumanReviewPanelLockedOpen(tabId: string) {
  return canShowHumanReviewPanel(tabId) && sidePanelMode(tabId) === "human-review";
}

function toggleStatePanel(tabId: string) {
  if (isHumanReviewPanelLockedOpen(tabId)) {
    showGraphLockedEditToast();
    return;
  }
  statePanelOpenByTabId.value = {
    ...statePanelOpenByTabId.value,
    [tabId]: !isStatePanelOpen(tabId),
  };
}

function openHumanReviewPanelForTab(tabId: string, nodeId: string | null) {
  if (!canShowHumanReviewPanel(tabId)) {
    return;
  }
  closeNodeCreationMenu(tabId);
  sidePanelModeByTabId.value = {
    ...sidePanelModeByTabId.value,
    [tabId]: "human-review",
  };
  statePanelOpenByTabId.value = {
    ...statePanelOpenByTabId.value,
    [tabId]: true,
  };
  focusNodeForTab(tabId, nodeId);
}

function isGraphInteractionLocked(tabId: string) {
  return latestRunDetailByTabId.value[tabId]?.status === "awaiting_human";
}

function showGraphLockedEditToast() {
  ElMessage({
    customClass: "editor-workspace-shell__locked-toast",
    type: "warning",
    duration: 4200,
    grouping: true,
    placement: "top",
    showClose: false,
    message: t("editor.lockedToast"),
  });
}

function guardGraphEditForTab(tabId: string) {
  if (!isGraphInteractionLocked(tabId)) {
    return false;
  }
  showGraphLockedEditToast();
  return true;
}

function focusNodeForTab(tabId: string, nodeId: string | null) {
  focusedNodeIdByTabId.value = {
    ...focusedNodeIdByTabId.value,
    [tabId]: nodeId,
  };
}

function requestNodeFocusForTab(tabId: string, nodeId: string | null) {
  focusNodeForTab(tabId, nodeId);
  if (!nodeId) {
    focusRequestByTabId.value = {
      ...focusRequestByTabId.value,
      [tabId]: null,
    };
    return;
  }

  const previousSequence = focusRequestByTabId.value[tabId]?.sequence ?? 0;
  focusRequestByTabId.value = {
    ...focusRequestByTabId.value,
    [tabId]: {
      nodeId,
      sequence: previousSequence + 1,
    },
  };
}

function toggleActiveStatePanel() {
  if (!activeTab.value) {
    return;
  }
  const tabId = activeTab.value.tabId;
  if (isHumanReviewPanelLockedOpen(tabId)) {
    openHumanReviewPanelForTab(tabId, latestRunDetailByTabId.value[tabId]?.current_node_id ?? null);
    showGraphLockedEditToast();
    return;
  }
  if (sidePanelMode(tabId) !== "state") {
    sidePanelModeByTabId.value = {
      ...sidePanelModeByTabId.value,
      [tabId]: "state",
    };
    statePanelOpenByTabId.value = {
      ...statePanelOpenByTabId.value,
      [tabId]: true,
    };
    return;
  }
  sidePanelModeByTabId.value = {
    ...sidePanelModeByTabId.value,
    [tabId]: "state",
  };
  toggleStatePanel(tabId);
}

function editorMainStyle(tabId: string) {
  if (!isStatePanelOpen(tabId)) {
    return {};
  }

  return {
    "--editor-canvas-minimap-right-clearance": `calc(${sidePanelOpenWidth(tabId)} + 12px)`,
  };
}

function sidePanelLayerStyle(tabId: string) {
  return {
    width: sidePanelOpenWidth(tabId),
  };
}

function sidePanelOpenWidth(tabId: string) {
  return sidePanelMode(tabId) === "human-review"
    ? "var(--editor-human-review-panel-open-width)"
    : "var(--editor-state-panel-open-width)";
}

function nodeCreationMenuState(tabId: string) {
  return nodeCreationMenuByTabId.value[tabId] ?? null;
}

function nodeCreationEntriesForTab(tabId: string): NodeCreationEntry[] {
  const menuState = nodeCreationMenuState(tabId);
  const context = menuState?.context ?? null;
  return buildNodeCreationEntries({
    builtins: buildBuiltinNodeCreationEntries(),
    presets: persistedPresets.value,
    query: menuState?.query ?? "",
    sourceValueType: context?.sourceValueType ?? context?.targetValueType ?? null,
    sourceAnchorKind: context?.sourceAnchorKind ?? context?.targetAnchorKind ?? null,
  });
}

function openNodeCreationMenuForTab(tabId: string, context: NodeCreationContext) {
  if (guardGraphEditForTab(tabId)) {
    return;
  }
  nodeCreationMenuByTabId.value = {
    ...nodeCreationMenuByTabId.value,
    [tabId]: {
      open: true,
      context,
      position:
        typeof context.clientX === "number" && typeof context.clientY === "number"
          ? { x: context.clientX, y: context.clientY }
          : null,
      query: "",
    },
  };
}

function closeNodeCreationMenu(tabId: string) {
  nodeCreationMenuByTabId.value = {
    ...nodeCreationMenuByTabId.value,
    [tabId]: {
      open: false,
      context: null,
      position: null,
      query: "",
    },
  };
}

function updateNodeCreationQuery(tabId: string, query: string) {
  const currentState = nodeCreationMenuState(tabId);
  nodeCreationMenuByTabId.value = {
    ...nodeCreationMenuByTabId.value,
    [tabId]: {
      open: currentState?.open ?? false,
      context: currentState?.context ?? null,
      position: currentState?.position ?? null,
      query,
    },
  };
}

function createNodeFromMenuForTab(tabId: string, _entry: NodeCreationEntry) {
  if (guardGraphEditForTab(tabId)) {
    closeNodeCreationMenu(tabId);
    return;
  }
  const document = documentsByTabId.value[tabId];
  const menuState = nodeCreationMenuState(tabId);
  if (!document || !menuState?.context) {
    closeNodeCreationMenu(tabId);
    return;
  }

  try {
    const result = createNodeFromCreationEntry(document, {
      entry: _entry,
      context: menuState.context,
      persistedPresets: persistedPresets.value,
    });
    markDocumentDirty(tabId, result.document);
    openCreatedStateEdgeEditorForTab(tabId, menuState.context, result);
    setMessageFeedbackForTab(tabId, {
      tone: "neutral",
      message: `Created ${result.document.nodes[result.createdNodeId]?.name ?? _entry.label}.`,
    });
    closeNodeCreationMenu(tabId);
  } catch (error) {
    setMessageFeedbackForTab(tabId, {
      tone: "warning",
      message: error instanceof Error ? error.message : "Failed to create node.",
    });
  }
}

function openCreatedStateEdgeEditorForTab(
  tabId: string,
  context: NodeCreationContext,
  result: { createdNodeId: string; createdStateKey: string | null },
) {
  if (!result.createdStateKey) {
    return;
  }

  const sourceNodeId = context.targetNodeId ? result.createdNodeId : context.sourceNodeId;
  const targetNodeId = context.targetNodeId ?? result.createdNodeId;
  if (!sourceNodeId || !targetNodeId) {
    return;
  }

  dataEdgeStateEditorRequestByTabId.value = {
    ...dataEdgeStateEditorRequestByTabId.value,
    [tabId]: {
      requestId: `${sourceNodeId}:${result.createdStateKey}:${targetNodeId}:${Date.now()}`,
      sourceNodeId,
      targetNodeId,
      stateKey: result.createdStateKey,
      position: context.position,
    },
  };
}

async function createNodeFromFileForTab(tabId: string, _payload: { file: File; position: GraphPosition }) {
  if (guardGraphEditForTab(tabId)) {
    closeNodeCreationMenu(tabId);
    return;
  }
  const document = documentsByTabId.value[tabId];
  if (!document) {
    closeNodeCreationMenu(tabId);
    return;
  }

  try {
    if (isGraphiteUiPythonExportFile(_payload.file) && (await importPythonGraphFile(_payload.file, { fallbackToFileNode: true }))) {
      closeNodeCreationMenu(tabId);
      return;
    }

    const result = await createNodeFromDroppedFile(document, {
      file: _payload.file,
      position: _payload.position,
    });
    markDocumentDirty(tabId, result.document);
    setMessageFeedbackForTab(tabId, {
      tone: "neutral",
      message: `Created ${result.document.nodes[result.createdNodeId]?.name ?? "input node"} from ${_payload.file.name}.`,
    });
  } catch (error) {
    setMessageFeedbackForTab(tabId, {
      tone: "warning",
      message: error instanceof Error ? error.message : "Failed to create input node from file.",
    });
  }
  closeNodeCreationMenu(tabId);
}

function openPythonGraphImportDialog() {
  pythonGraphImportInput.value?.click();
}

async function handlePythonGraphImportSelection(event: Event) {
  const input = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : null;
  const file = input?.files?.[0] ?? null;
  if (input) {
    input.value = "";
  }
  if (!file) {
    return;
  }
  await importPythonGraphFile(file, { fallbackToFileNode: false });
}

async function importPythonGraphFile(file: File, options: { fallbackToFileNode: boolean }) {
  const source = await file.text();
  if (!isGraphiteUiPythonExportSource(source)) {
    if (!options.fallbackToFileNode) {
      const tab = activeTab.value;
      if (tab) {
        setMessageFeedbackForTab(tab.tabId, {
          tone: "warning",
          message: `${file.name} is not a GraphiteUI Python export.`,
        });
      }
    }
    return false;
  }

  try {
    const importedGraph = await importGraphFromPythonSource(source);
    openImportedGraphTab(importedGraph, file.name);
    return true;
  } catch (error) {
    const tab = activeTab.value;
    if (tab) {
      setMessageFeedbackForTab(tab.tabId, {
        tone: "warning",
        message: error instanceof Error ? error.message : "Failed to import GraphiteUI Python export.",
      });
    }
    return true;
  }
}

function handleNodePositionUpdate(tabId: string, payload: { nodeId: string; position: GraphPosition }) {
  if (guardGraphEditForTab(tabId)) {
    return;
  }
  const document = documentsByTabId.value[tabId];
  if (!document?.nodes[payload.nodeId]) {
    return;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[payload.nodeId].ui.position = payload.position;
  setDocumentForTab(tabId, nextDocument);

  updateWorkspace(
    applyDocumentMetaToWorkspaceTab(workspace.value, tabId, {
      title: nextDocument.name,
      dirty: true,
      graphId: "graph_id" in nextDocument ? nextDocument.graph_id ?? null : null,
    }),
  );
}

function handleNodeSizeUpdate(tabId: string, payload: { nodeId: string; position: GraphPosition; size: GraphNodeSize }) {
  if (guardGraphEditForTab(tabId)) {
    return;
  }
  const document = documentsByTabId.value[tabId];
  if (!document?.nodes[payload.nodeId]) {
    return;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.nodes[payload.nodeId].ui.position = payload.position;
  nextDocument.nodes[payload.nodeId].ui.size = payload.size;
  setDocumentForTab(tabId, nextDocument);

  updateWorkspace(
    applyDocumentMetaToWorkspaceTab(workspace.value, tabId, {
      title: nextDocument.name,
      dirty: true,
      graphId: "graph_id" in nextDocument ? nextDocument.graph_id ?? null : null,
    }),
  );
}

function markDocumentDirty(tabId: string, nextDocument: GraphPayload | GraphDocument) {
  if (guardGraphEditForTab(tabId)) {
    return;
  }
  setDocumentForTab(tabId, nextDocument);
  updateWorkspace(
    applyDocumentMetaToWorkspaceTab(workspace.value, tabId, {
      title: nextDocument.name,
      dirty: true,
      graphId: "graph_id" in nextDocument ? nextDocument.graph_id ?? null : null,
    }),
  );
}

function addStateReaderBinding(tabId: string, stateKey: string, nodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  const nextDocument = addStateBindingToDocument(document, stateKey, nodeId, "read");
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function removeStateReaderBinding(tabId: string, stateKey: string, nodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  const nextDocument = removeStateBindingFromDocument(document, stateKey, nodeId, "read");
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
}

function addStateWriterBinding(tabId: string, stateKey: string, nodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  const nextDocument = addStateBindingToDocument(document, stateKey, nodeId, "write");
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function bindNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", stateKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = addStateBindingToDocument(document, stateKey, nodeId, side === "input" ? "read" : "write");
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function removeNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", stateKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = removeStateBindingFromDocument(document, stateKey, nodeId, side === "input" ? "read" : "write");
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function reorderNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", stateKey: string, targetStateKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = reorderNodePortStateInDocument(document, nodeId, side, stateKey, targetStateKey);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function disconnectDataEdgeForTab(tabId: string, sourceNodeId: string, targetNodeId: string, stateKey: string, mode: "state" | "flow") {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument =
    mode === "flow"
      ? removeFlowEdgeFromDocument(document, sourceNodeId, targetNodeId)
      : removeStateBindingFromDocument(document, stateKey, targetNodeId, "read");
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, targetNodeId);
}

function createNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", field: StateFieldDraft) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const stateField = buildNextDefaultStateField(document, field.definition);
  const nextDocumentWithState = insertStateFieldIntoDocument(document, stateField);
  if (nextDocumentWithState === document) {
    return;
  }

  const nextDocument = addStateBindingToDocument(nextDocumentWithState, stateField.key, nodeId, side === "input" ? "read" : "write");
  if (nextDocument === nextDocumentWithState) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function deleteNodeForTab(tabId: string, nodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const deletedNodeName = document.nodes[nodeId]?.name ?? nodeId;
  const nextDocument = removeNodeFromDocument(document, nodeId);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  if (focusedNodeIdByTabId.value[tabId] === nodeId) {
    focusNodeForTab(tabId, null);
  }
  setMessageFeedbackForTab(tabId, {
    tone: "neutral",
    message: `Deleted ${deletedNodeName}.`,
  });
}

async function saveNodePresetForTab(tabId: string, nodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const payload = buildPresetPayloadForNode(document, nodeId);
  if (!payload) {
    setMessageFeedbackForTab(tabId, {
      tone: "danger",
      message: t("feedback.presetSaveFailed"),
    });
    showPresetSaveToast("error", t("feedback.presetSaveFailed"));
    return;
  }

  try {
    const saved = await savePreset(payload);
    const savedPreset = await fetchPreset(saved.presetId);
    const presetLabel = savedPreset.definition.label || savedPreset.presetId;
    persistedPresets.value = [savedPreset, ...persistedPresets.value.filter((preset) => preset.presetId !== savedPreset.presetId)];
    setMessageFeedbackForTab(tabId, {
      tone: "success",
      message: t("feedback.presetSaved", { label: presetLabel }),
    });
    showPresetSaveToast("success", t("feedback.presetSaved", { label: presetLabel }));
  } catch (error) {
    setMessageFeedbackForTab(tabId, {
      tone: "danger",
      message: error instanceof Error ? error.message : t("feedback.presetSaveFailed"),
    });
    showPresetSaveToast("error", error instanceof Error ? error.message : t("feedback.presetSaveFailed"));
  }
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

function connectFlowNodesForTab(tabId: string, sourceNodeId: string, targetNodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = connectFlowNodesInDocument(document, sourceNodeId, targetNodeId);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, targetNodeId);
}

function connectStateBindingForTab(
  tabId: string,
  payload: { sourceNodeId: string; sourceStateKey: string; targetNodeId: string; targetStateKey: string; position: GraphPosition },
) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = connectStateBindingInDocument(
    document,
    payload.sourceNodeId,
    payload.sourceStateKey,
    payload.targetNodeId,
    payload.targetStateKey,
  );
  if (nextDocument === document) {
    return;
  }

  const createdStateKey = resolveCreatedVirtualOutputStateKey(document, nextDocument, payload.sourceNodeId, payload.sourceStateKey);
  markDocumentDirty(tabId, nextDocument);
  if (createdStateKey) {
    openCreatedStateEdgeEditorForTab(
      tabId,
      {
        position: payload.position,
        sourceNodeId: payload.sourceNodeId,
        sourceAnchorKind: "state-out",
        sourceStateKey: payload.sourceStateKey,
        targetNodeId: payload.targetNodeId,
        targetAnchorKind: "state-in",
        targetStateKey: payload.targetStateKey,
      },
      {
        createdNodeId: payload.sourceNodeId,
        createdStateKey,
      },
    );
  }
  focusNodeForTab(tabId, payload.targetNodeId);
}

function resolveCreatedVirtualOutputStateKey(
  previousDocument: GraphPayload | GraphDocument,
  nextDocument: GraphPayload | GraphDocument,
  sourceNodeId: string,
  sourceStateKey: string,
) {
  if (!isVirtualAnyOutputStateKey(sourceStateKey)) {
    return null;
  }

  const previousOutputKeys = new Set(previousDocument.nodes[sourceNodeId]?.writes.map((binding) => binding.state) ?? []);
  return nextDocument.nodes[sourceNodeId]?.writes.find((binding) => !previousOutputKeys.has(binding.state))?.state ?? null;
}

function connectStateInputSourceForTab(
  tabId: string,
  payload: { sourceNodeId: string; targetNodeId: string; targetStateKey: string; targetValueType?: string | null },
) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const result = connectStateInputSourceToTarget(document, payload);
  if (result.document === document) {
    return;
  }

  markDocumentDirty(tabId, result.document);
  openCreatedStateEdgeEditorForTab(
    tabId,
    {
      position: result.document.nodes[payload.sourceNodeId]?.ui.position ?? { x: 0, y: 0 },
      targetNodeId: payload.targetNodeId,
      targetAnchorKind: "state-in",
      targetStateKey: payload.targetStateKey,
      targetValueType: payload.targetValueType ?? null,
    },
    {
      createdNodeId: payload.sourceNodeId,
      createdStateKey: result.createdStateKey,
    },
  );
  focusNodeForTab(tabId, payload.targetNodeId);
}

function connectConditionRouteForTab(tabId: string, sourceNodeId: string, branchKey: string, targetNodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = connectConditionRouteInDocument(document, sourceNodeId, branchKey, targetNodeId);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, targetNodeId);
}

function removeFlowEdgeForTab(tabId: string, sourceNodeId: string, targetNodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = removeFlowEdgeFromDocument(document, sourceNodeId, targetNodeId);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
}

function reconnectFlowEdgeForTab(tabId: string, sourceNodeId: string, currentTargetNodeId: string, nextTargetNodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = reconnectFlowEdgeInDocument(document, sourceNodeId, currentTargetNodeId, nextTargetNodeId);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nextTargetNodeId);
}

function removeConditionRouteForTab(tabId: string, sourceNodeId: string, branchKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = removeConditionRouteFromDocument(document, sourceNodeId, branchKey);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
}

function reconnectConditionRouteForTab(tabId: string, sourceNodeId: string, branchKey: string, nextTargetNodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = reconnectConditionRouteInDocument(document, sourceNodeId, branchKey, nextTargetNodeId);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nextTargetNodeId);
}

function addStateField(tabId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  markDocumentDirty(tabId, addStateFieldToDocument(document));
}

function updateInputConfigForTab(tabId: string, nodeId: string, patch: Partial<InputNode["config"]>) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateInputNodeConfigInDocument(document, nodeId, (current) => ({
    ...current,
    ...patch,
  }));
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function updateNodeMetadataForTab(tabId: string, nodeId: string, patch: Partial<Pick<GraphNode, "name" | "description">>) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateNodeMetadataInDocument(document, nodeId, (current) => ({
    ...current,
    ...patch,
  }));
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function updateAgentConfigForTab(tabId: string, nodeId: string, patch: Partial<AgentNode["config"]>) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateAgentNodeConfigInDocument(document, nodeId, (current) => ({
    ...current,
    ...patch,
  }));
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function toggleAgentBreakpointForTab(tabId: string, nodeId: string, enabled: boolean) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateAgentBreakpointInDocument(document, nodeId, enabled);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function updateAgentBreakpointTimingForTab(tabId: string, nodeId: string, timing: "before" | "after") {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateAgentBreakpointTimingInDocument(document, nodeId, timing);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function updateConditionConfigForTab(tabId: string, nodeId: string, patch: Partial<ConditionNode["config"]>) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateConditionNodeConfigInDocument(document, nodeId, (current) => ({
    ...current,
    ...patch,
  }));
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function updateConditionBranchForTab(tabId: string, nodeId: string, currentKey: string, nextKey: string, mappingKeys: string[]) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateConditionBranchInDocument(document, nodeId, currentKey, nextKey, mappingKeys);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function addConditionBranchForTab(tabId: string, nodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = addConditionBranchToDocument(document, nodeId);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function removeConditionBranchForTab(tabId: string, nodeId: string, branchKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = removeConditionBranchFromDocument(document, nodeId, branchKey);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function updateOutputConfigForTab(tabId: string, nodeId: string, patch: Partial<OutputNode["config"]>) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = updateOutputNodeConfigInDocument(document, nodeId, (current) => ({
    ...current,
    ...patch,
  }));
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, nodeId);
}

function updateStateField(tabId: string, stateKey: string, patch: Partial<StateDefinition>) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  const nextDocument = updateStateFieldInDocument(document, stateKey, (current) => ({
    ...current,
    ...patch,
  }));
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
}

function formatStateDefinitionLabel(document: GraphPayload | GraphDocument, stateKey: string) {
  return document.state_schema[stateKey]?.name.trim() || stateKey;
}

function formatStateUsageLabelList(labels: string[]) {
  const visibleLabels = labels.slice(0, 3);
  const remainingCount = labels.length - visibleLabels.length;
  return remainingCount > 0 ? `${visibleLabels.join(", ")} +${remainingCount}` : visibleLabels.join(", ");
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

function deleteStateField(tabId: string, stateKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  if (!document.state_schema[stateKey]) {
    const message = t("statePanel.deleteStateMissing");
    setMessageFeedbackForTab(tabId, {
      tone: "warning",
      message,
    });
    showStateDeleteBlockedToast(message);
    return;
  }
  const usageLabels = listStateFieldUsageLabels(document, stateKey);
  if (usageLabels.length > 0) {
    const message = t("statePanel.deleteStateBlocked", { nodes: formatStateUsageLabelList(usageLabels) });
    setMessageFeedbackForTab(tabId, {
      tone: "warning",
      message,
    });
    showStateDeleteBlockedToast(message);
    return;
  }
  const nextDocument = deleteStateFieldFromDocument(document, stateKey);
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
  setMessageFeedbackForTab(tabId, {
    tone: "neutral",
    message: t("statePanel.deleteStateDeleted", { state: formatStateDefinitionLabel(document, stateKey) }),
  });
}

function removeStateWriterBinding(tabId: string, stateKey: string, nodeId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  const nextDocument = removeStateBindingFromDocument(document, stateKey, nodeId, "write");
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
}

function renameActiveGraph(name: string) {
  const tab = activeTab.value;
  if (!tab) {
    return;
  }
  if (guardGraphEditForTab(tab.tabId)) {
    return;
  }
  const document = documentsByTabId.value[tab.tabId];
  if (!document) {
    return;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.name = name;
  setDocumentForTab(tab.tabId, nextDocument);
  updateWorkspace(
    applyDocumentMetaToWorkspaceTab(workspace.value, tab.tabId, {
      title: name,
      dirty: true,
      graphId: "graph_id" in nextDocument ? nextDocument.graph_id ?? null : null,
    }),
  );
}

async function saveTab(tabId: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return false;
  }

  try {
    const documentToSave = pruneUnreferencedStateSchemaInDocument(document);
    const response = await saveGraph(documentToSave);
    const savedGraph = await fetchGraph(response.graph_id);
    registerDocumentForTab(tabId, savedGraph);

    updateWorkspaceTab(tabId, (tab) => ({
      ...tab,
      kind: "existing",
      graphId: savedGraph.graph_id,
      title: savedGraph.name,
      dirty: false,
      templateId: null,
    }));
    updateWorkspace(
      applyDocumentMetaToWorkspaceTab(workspace.value, tabId, {
        title: savedGraph.name,
        dirty: false,
        graphId: savedGraph.graph_id,
      }),
    );
    await graphStore.loadGraphs();
    if (workspace.value.activeTabId === tabId) {
      syncRouteToTab(
        {
          graphId: savedGraph.graph_id,
          kind: "existing",
          templateId: null,
          defaultTemplateId: null,
        },
        "replace",
      );
    }

    setMessageFeedbackForTab(tabId, {
      tone: "success",
      message: `Saved graph ${savedGraph.graph_id}.`,
    });
    return response.saved;
  } catch (error) {
    setMessageFeedbackForTab(tabId, {
      tone: "danger",
      message: error instanceof Error ? error.message : "Failed to save graph.",
    });
    throw error;
  }
}

async function saveActiveGraph() {
  if (!activeTab.value) {
    return;
  }
  await saveTab(activeTab.value.tabId);
}

async function saveAndClosePendingTab() {
  if (!pendingCloseTabId.value || closeBusy.value) {
    return;
  }

  closeBusy.value = true;
  closeError.value = null;

  try {
    const success = await saveTab(pendingCloseTabId.value);
    if (!success) {
      closeError.value = t("closeDialog.saveFailed");
      return;
    }
    finalizeTabClose(pendingCloseTabId.value);
    pendingCloseTabId.value = null;
    closeError.value = null;
  } catch (error) {
    closeError.value = error instanceof Error ? error.message : t("closeDialog.saveFailed");
  } finally {
    closeBusy.value = false;
  }
}

async function validateActiveGraph() {
  const tab = activeTab.value;
  if (!tab) {
    return;
  }
  const document = documentsByTabId.value[tab.tabId];
  if (!document) {
    return;
  }

  try {
    const response = await validateGraph(document);
    const feedback = formatValidationFeedback(response);
    setMessageFeedbackForTab(tab.tabId, feedback);
  } catch (error) {
    setMessageFeedbackForTab(tab.tabId, {
      tone: "danger",
      message: error instanceof Error ? error.message : "Failed to validate graph.",
    });
  }
}

async function exportActiveGraph() {
  const tab = activeTab.value;
  if (!tab) {
    return;
  }
  const document = documentsByTabId.value[tab.tabId];
  if (!document) {
    return;
  }

  try {
    const exportDocument = cloneGraphDocument(document);
    const source = await exportLangGraphPython(exportDocument);
    const fileName = buildPythonExportFileName(exportDocument.name || tab.title);
    downloadPythonSource(source, fileName);
    setMessageFeedbackForTab(tab.tabId, {
      tone: "success",
      message: `Exported ${fileName}.`,
    });
  } catch (error) {
    setMessageFeedbackForTab(tab.tabId, {
      tone: "danger",
      message: error instanceof Error ? error.message : "Failed to export Python code.",
    });
  }
}

async function runActiveGraph() {
  const tab = activeTab.value;
  if (!tab) {
    return;
  }
  const document = documentsByTabId.value[tab.tabId];
  if (!document) {
    return;
  }

  try {
    await refreshAgentModels();
    const latestDocument = documentsByTabId.value[tab.tabId];
    if (!latestDocument) {
      return;
    }

    const response = await runGraph(latestDocument);
    cancelRunPolling(tab.tabId);
    const generation = runPollGenerationByTabId.get(tab.tabId) ?? 0;
    runNodeStatusByTabId.value = {
      ...runNodeStatusByTabId.value,
      [tab.tabId]: {},
    };
    currentRunNodeIdByTabId.value = {
      ...currentRunNodeIdByTabId.value,
      [tab.tabId]: null,
    };
    runOutputPreviewByTabId.value = {
      ...runOutputPreviewByTabId.value,
      [tab.tabId]: {},
    };
    runFailureMessageByTabId.value = {
      ...runFailureMessageByTabId.value,
      [tab.tabId]: {},
    };
    activeRunEdgeIdsByTabId.value = {
      ...activeRunEdgeIdsByTabId.value,
      [tab.tabId]: [],
    };
    latestRunDetailByTabId.value = {
      ...latestRunDetailByTabId.value,
      [tab.tabId]: null,
    };
    humanReviewErrorByTabId.value = {
      ...humanReviewErrorByTabId.value,
      [tab.tabId]: null,
    };
    setFeedbackForTab(tab.tabId, {
      tone: "warning",
      message: t("feedback.runQueued", { runId: response.run_id, pending: Object.keys(latestDocument.nodes).length, cycle: "" }),
      activeRunId: response.run_id,
      activeRunStatus: response.status,
      summary: {
        idle: Object.keys(latestDocument.nodes).length,
        running: 0,
        paused: 0,
        success: 0,
        failed: 0,
      },
      currentNodeLabel: null,
    });
    startRunEventStreamForTab(tab.tabId, response.run_id);
    void pollRunForTab(tab.tabId, response.run_id, generation);
  } catch (error) {
    setMessageFeedbackForTab(tab.tabId, {
      tone: "danger",
      message: error instanceof Error ? error.message : t("feedback.runFailed", { runId: "" }),
    });
  }
}

async function resumeHumanReviewRun(tabId: string, payload: Record<string, unknown>) {
  const run = latestRunDetailByTabId.value[tabId];
  if (!run) {
    return;
  }

  humanReviewBusyByTabId.value = {
    ...humanReviewBusyByTabId.value,
    [tabId]: true,
  };
  humanReviewErrorByTabId.value = {
    ...humanReviewErrorByTabId.value,
    [tabId]: null,
  };

  try {
    const response = await resumeRun(run.run_id, payload, restoredRunSnapshotIdByTabId.value[tabId] ?? null);
    cancelRunPolling(tabId);
    const generation = runPollGenerationByTabId.get(tabId) ?? 0;
    latestRunDetailByTabId.value = {
      ...latestRunDetailByTabId.value,
      [tabId]: {
        ...run,
        run_id: response.run_id,
        status: response.status,
      },
    };
    restoredRunSnapshotIdByTabId.value = {
      ...restoredRunSnapshotIdByTabId.value,
      [tabId]: null,
    };
    setMessageFeedbackForTab(tabId, {
      tone: "warning",
      message: t("feedback.runResuming", { runId: response.run_id }),
      activeRunId: response.run_id,
      activeRunStatus: response.status,
    });
    startRunEventStreamForTab(tabId, response.run_id);
    void pollRunForTab(tabId, response.run_id, generation);
  } catch (error) {
    humanReviewErrorByTabId.value = {
      ...humanReviewErrorByTabId.value,
      [tabId]: error instanceof Error ? error.message : t("humanReview.resumeFailed"),
    };
  } finally {
    humanReviewBusyByTabId.value = {
      ...humanReviewBusyByTabId.value,
      [tabId]: false,
    };
  }
}

async function loadKnowledgeBases() {
  try {
    knowledgeBases.value = await fetchKnowledgeBases();
  } catch {
    knowledgeBases.value = [];
  }
}

async function loadSettings() {
  try {
    settings.value = await fetchSettings();
  } catch {
    settings.value = null;
  }
}

async function refreshAgentModels() {
  await loadSettings();
}

async function loadSkillDefinitions() {
  try {
    skillDefinitionsLoading.value = true;
    skillDefinitions.value = await fetchSkillDefinitions();
    skillDefinitionsError.value = null;
  } catch (error) {
    skillDefinitions.value = [];
    skillDefinitionsError.value = error instanceof Error ? error.message : "Failed to load skills.";
  } finally {
    skillDefinitionsLoading.value = false;
  }
}

async function loadPersistedPresets() {
  persistedPresets.value = await fetchPresets();
}

watch(
  workspace,
  (nextWorkspace) => {
    if (!hydrated.value) {
      return;
    }
    writePersistedEditorWorkspace(nextWorkspace);
    prunePersistedEditorDocumentDrafts(nextWorkspace.tabs.map((tab) => tab.tabId));
    prunePersistedEditorViewportDrafts(nextWorkspace.tabs.map((tab) => tab.tabId));
  },
  { deep: true },
);

watch(
  [() => workspace.value.tabs, () => props.templates],
  () => {
    if (!hydrated.value) {
      return;
    }
    ensureTabViewportDrafts();
    ensureUnsavedTabDocuments();
  },
  { deep: true },
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
  for (const tabId of Array.from(runEventSourceByTabId.keys())) {
    cancelRunEventStreamForTab(tabId);
  }
  for (const tabId of Array.from(runPollTimerByTabId.keys())) {
    cancelRunPolling(tabId);
  }
});

onMounted(() => {
  void loadKnowledgeBases();
  void loadSettings();
  void loadSkillDefinitions();
  void loadPersistedPresets();
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
  }
}
</style>
