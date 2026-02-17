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
        <div class="editor-workspace-shell__status-eyebrow">Restore</div>
        <h2>无法恢复运行快照</h2>
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
        <span class="editor-workspace-shell__route-error-label">Restore</span>
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
            <div class="editor-workspace-shell__editor-main">
              <div v-if="loadingByTabId[tab.tabId]" class="editor-workspace-shell__status-card">
                <div class="editor-workspace-shell__status-eyebrow">Graph</div>
                <h2>Loading saved graph…</h2>
              </div>
              <div v-else-if="errorByTabId[tab.tabId]" class="editor-workspace-shell__status-card">
                <div class="editor-workspace-shell__status-eyebrow">Graph</div>
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
                @select-node="focusNodeForTab(tab.tabId, $event)"
                @update-node-metadata="updateNodeMetadataForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-config="updateInputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @rename-state="renameStateField(tab.tabId, $event.currentKey, $event.nextKey)"
                @update-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @remove-port-state="removeNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey)"
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
                @connect-state="connectStateBindingForTab(tab.tabId, $event.sourceNodeId, $event.sourceStateKey, $event.targetNodeId, $event.targetStateKey)"
                @connect-flow="connectFlowNodesForTab(tab.tabId, $event.sourceNodeId, $event.targetNodeId)"
                @connect-route="connectConditionRouteForTab(tab.tabId, $event.sourceNodeId, $event.branchKey, $event.targetNodeId)"
                @reconnect-flow="reconnectFlowEdgeForTab(tab.tabId, $event.sourceNodeId, $event.currentTargetNodeId, $event.nextTargetNodeId)"
                @reconnect-route="reconnectConditionRouteForTab(tab.tabId, $event.sourceNodeId, $event.branchKey, $event.nextTargetNodeId)"
                @remove-flow="removeFlowEdgeForTab(tab.tabId, $event.sourceNodeId, $event.targetNodeId)"
                @remove-route="removeConditionRouteForTab(tab.tabId, $event.sourceNodeId, $event.branchKey)"
                @update-output-config="updateOutputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update:node-position="(payload) => handleNodePositionUpdate(tab.tabId, payload)"
                @open-node-creation-menu="openNodeCreationMenuForTab(tab.tabId, $event)"
                @create-node-from-file="createNodeFromFileForTab(tab.tabId, $event)"
                @open-human-review="openHumanReviewPanelForTab(tab.tabId, $event.nodeId)"
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
              <div
                v-if="feedbackForTab(tab.tabId)"
                class="editor-workspace-shell__feedback"
                :class="`editor-workspace-shell__feedback--${feedbackForTab(tab.tabId)?.tone ?? 'neutral'}`"
              >
                <span class="editor-workspace-shell__feedback-label">Status</span>
                <span class="editor-workspace-shell__feedback-message">{{ feedbackForTab(tab.tabId)?.message }}</span>
                <span v-if="feedbackForTab(tab.tabId)?.activeRunStatus" class="editor-workspace-shell__feedback-run">
                  <span class="editor-workspace-shell__feedback-badge">{{ feedbackForTab(tab.tabId)?.activeRunStatus }}</span>
                  <span>OK {{ feedbackForTab(tab.tabId)?.summary?.success ?? 0 }}</span>
                  <span>Running {{ feedbackForTab(tab.tabId)?.summary?.running ?? 0 }}</span>
                  <span>Pending {{ feedbackForTab(tab.tabId)?.summary?.idle ?? 0 }}</span>
                  <span>Failed {{ feedbackForTab(tab.tabId)?.summary?.failed ?? 0 }}</span>
                  <span v-if="feedbackForTab(tab.tabId)?.currentNodeLabel">Current {{ feedbackForTab(tab.tabId)?.currentNodeLabel }}</span>
                </span>
                <RouterLink
                  v-if="feedbackForTab(tab.tabId)?.activeRunId"
                  class="editor-workspace-shell__feedback-link"
                  :to="`/runs/${feedbackForTab(tab.tabId)?.activeRunId}`"
                >
                  Latest run {{ feedbackForTab(tab.tabId)?.activeRunId }}
                </RouterLink>
              </div>
            </div>

            <div
              v-if="isStatePanelOpen(tab.tabId) && documentsByTabId[tab.tabId]"
              class="editor-workspace-shell__side-panel-layer"
              :style="sidePanelLayerStyle(tab.tabId)"
            >
              <EditorHumanReviewPanel
                v-if="sidePanelMode(tab.tabId) === 'human-review'"
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
                @rename-state="renameStateField(tab.tabId, $event.currentKey, $event.nextKey)"
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
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

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
  readPersistedEditorWorkspace,
  reorderWorkspaceTab,
  resolveEditorUrl,
  resolveWorkspaceTabUrl,
  writePersistedEditorWorkspace,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "@/lib/editor-workspace";
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
import { buildRunNodeArtifactsModel } from "./runNodeArtifactsModel.ts";
import { addStateBindingToDocument, removeStateBindingFromDocument } from "./statePanelBindings.ts";
import { addStateFieldToDocument, deleteStateFieldFromDocument, insertStateFieldIntoDocument, renameStateFieldInDocument, updateStateFieldInDocument, type StateFieldDraft } from "./statePanelFields.ts";
import { buildPythonExportFileName, downloadPythonSource } from "./pythonExportModel.ts";
import { isGraphiteUiPythonExportFile, isGraphiteUiPythonExportSource } from "./pythonImportModel.ts";

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
  runOutputPreviewByTabId.value = {
    ...runOutputPreviewByTabId.value,
    [tabId]: runArtifactsModel.outputPreviewByNodeId,
  };
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
    runOutputPreviewByTabId.value = {
      ...runOutputPreviewByTabId.value,
      [tabId]: runArtifactsModel.outputPreviewByNodeId,
    };
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

    runPollTimerByTabId.delete(tabId);
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
  const nextDocument = syncKnowledgeBaseSkillsInDocument(graph);
  documentsByTabId.value = {
    ...documentsByTabId.value,
    [tabId]: nextDocument,
  };
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
      message: `Ready to edit ${nextDocument.name}.`,
    });
  }
}

function clearTabRuntime(tabId: string) {
  cancelRunPolling(tabId);
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
    registerDocumentForTab(tab.tabId, createDraftForTab(tab));
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
  if (nextTabId && graph) {
    registerDocumentForTab(nextTabId, cloneGraphDocument(graph));
  } else if (nextTabId) {
    void loadExistingGraphIntoTab(nextTabId, graphId);
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
}

function isStatePanelOpen(tabId: string) {
  return statePanelOpenByTabId.value[tabId] ?? false;
}

function sidePanelMode(tabId: string) {
  return sidePanelModeByTabId.value[tabId] ?? "state";
}

function toggleStatePanel(tabId: string) {
  statePanelOpenByTabId.value = {
    ...statePanelOpenByTabId.value,
    [tabId]: !isStatePanelOpen(tabId),
  };
}

function openHumanReviewPanelForTab(tabId: string, nodeId: string | null) {
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

function guardGraphEditForTab(tabId: string) {
  if (!isGraphInteractionLocked(tabId)) {
    return false;
  }
  const run = latestRunDetailByTabId.value[tabId] ?? null;
  setMessageFeedbackForTab(tabId, {
    tone: "warning",
    message: "Run is paused for human review. Continue or cancel the paused run before editing the graph.",
    activeRunId: run?.run_id ?? undefined,
    activeRunStatus: run?.status ?? "awaiting_human",
  });
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
  return buildNodeCreationEntries({
    builtins: buildBuiltinNodeCreationEntries(),
    presets: persistedPresets.value,
    query: menuState?.query ?? "",
    sourceValueType: menuState?.context?.sourceValueType ?? null,
    sourceAnchorKind: menuState?.context?.sourceAnchorKind ?? null,
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

function createNodePortStateForTab(tabId: string, nodeId: string, side: "input" | "output", field: StateFieldDraft) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocumentWithState = insertStateFieldIntoDocument(document, field);
  if (nextDocumentWithState === document) {
    return;
  }

  const nextDocument = addStateBindingToDocument(nextDocumentWithState, field.key, nodeId, side === "input" ? "read" : "write");
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

function slugifyPresetBase(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "node";
}

function buildPresetPayloadForNode(document: GraphPayload | GraphDocument, nodeId: string): {
  presetId: string;
  sourcePresetId: string | null;
  definition: PresetDocument["definition"];
} | null {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "agent") {
    return null;
  }

  const referencedStateKeys = Array.from(new Set([...node.reads.map((binding) => binding.state), ...node.writes.map((binding) => binding.state)]));
  const stateSchema = Object.fromEntries(
    referencedStateKeys
      .map((stateKey) => [stateKey, document.state_schema[stateKey]] as const)
      .filter((entry): entry is readonly [string, StateDefinition] => Boolean(entry[1])),
  );

  return {
    presetId: `preset.local.${slugifyPresetBase(node.name)}.${crypto.randomUUID().slice(0, 6)}`,
    sourcePresetId: null,
    definition: {
      label: node.name,
      description: node.description,
      state_schema: stateSchema,
      node: structuredClone(node),
    },
  };
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
      message: "Only agent nodes can be saved as presets.",
    });
    return;
  }

  try {
    const saved = await savePreset(payload);
    const savedPreset = await fetchPreset(saved.presetId);
    persistedPresets.value = [savedPreset, ...persistedPresets.value.filter((preset) => preset.presetId !== savedPreset.presetId)];
    setMessageFeedbackForTab(tabId, {
      tone: "success",
      message: `Saved preset ${savedPreset.definition.label || savedPreset.presetId}.`,
    });
  } catch (error) {
    setMessageFeedbackForTab(tabId, {
      tone: "danger",
      message: error instanceof Error ? error.message : "Failed to save preset.",
    });
  }
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
  sourceNodeId: string,
  sourceStateKey: string,
  targetNodeId: string,
  targetStateKey: string,
) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }

  const nextDocument = connectStateBindingInDocument(document, sourceNodeId, sourceStateKey, targetNodeId, targetStateKey);
  if (nextDocument === document) {
    return;
  }

  markDocumentDirty(tabId, nextDocument);
  focusNodeForTab(tabId, targetNodeId);
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

function renameStateField(tabId: string, currentKey: string, nextKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  const nextDocument = renameStateFieldInDocument(document, currentKey, nextKey);
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
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

function deleteStateField(tabId: string, stateKey: string) {
  const document = documentsByTabId.value[tabId];
  if (!document) {
    return;
  }
  const nextDocument = deleteStateFieldFromDocument(document, stateKey);
  if (nextDocument === document) {
    return;
  }
  markDocumentDirty(tabId, nextDocument);
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
      closeError.value = "保存失败，标签页已保留。";
      return;
    }
    finalizeTabClose(pendingCloseTabId.value);
    pendingCloseTabId.value = null;
    closeError.value = null;
  } catch (error) {
    closeError.value = error instanceof Error ? error.message : "保存失败，标签页已保留。";
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
    const response = await runGraph(document);
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
      message: `Run ${response.run_id} queued. Pending ${Object.keys(document.nodes).length} nodes.`,
      activeRunId: response.run_id,
      activeRunStatus: response.status,
      summary: {
        idle: Object.keys(document.nodes).length,
        running: 0,
        paused: 0,
        success: 0,
        failed: 0,
      },
      currentNodeLabel: null,
    });
    void pollRunForTab(tab.tabId, response.run_id, generation);
  } catch (error) {
    setMessageFeedbackForTab(tab.tabId, {
      tone: "danger",
      message: error instanceof Error ? error.message : "Failed to run graph.",
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
      message: `Run ${response.run_id} resuming.`,
      activeRunId: response.run_id,
      activeRunStatus: response.status,
    });
    void pollRunForTab(tabId, response.run_id, generation);
  } catch (error) {
    humanReviewErrorByTabId.value = {
      ...humanReviewErrorByTabId.value,
      [tabId]: error instanceof Error ? error.message : "Failed to resume run.",
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
  },
  { deep: true },
);

watch(
  [() => workspace.value.tabs, () => props.templates],
  () => {
    if (!hydrated.value) {
      return;
    }
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

onMounted(() => {
  void loadKnowledgeBases();
  void loadSettings();
  void loadSkillDefinitions();
  void loadPersistedPresets();
  updateWorkspace(readPersistedEditorWorkspace());
  hydrated.value = true;
  ensureUnsavedTabDocuments();
  applyCurrentRouteInstruction();
});
</script>

<style scoped>
.editor-workspace-shell {
  --editor-state-panel-open-width: clamp(340px, 32vw, 480px);
  --editor-human-review-panel-open-width: clamp(360px, 34vw, 520px);
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: radial-gradient(circle at top, rgba(154, 52, 18, 0.1), transparent 22%),
    linear-gradient(180deg, #f5efe2 0%, #ede4d2 100%);
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
  position: relative;
  display: block;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  background: transparent;
}

.editor-workspace-shell__action-capsule-row {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 35;
  display: flex;
  min-width: 0;
  pointer-events: none;
}

.editor-workspace-shell__action-capsule-row > :deep(*) {
  pointer-events: auto;
}

.editor-workspace-shell__workspace {
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
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-workspace-shell__side-panel-layer {
  position: absolute;
  top: 12px;
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

.editor-workspace-shell__feedback {
  position: absolute;
  left: 18px;
  bottom: 18px;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  max-width: min(720px, calc(100% - 36px));
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 20px;
  padding: 10px 14px;
  background: rgba(255, 250, 241, 0.94);
  box-shadow: 0 18px 32px rgba(60, 41, 20, 0.12);
  backdrop-filter: blur(12px);
}

.editor-workspace-shell__feedback--success {
  border-color: rgba(21, 128, 61, 0.16);
  background: rgba(240, 253, 244, 0.92);
}

.editor-workspace-shell__feedback--warning {
  border-color: rgba(217, 119, 6, 0.18);
  background: rgba(255, 251, 235, 0.94);
}

.editor-workspace-shell__feedback--danger {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(254, 242, 242, 0.94);
}

.editor-workspace-shell__feedback-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
}

.editor-workspace-shell__feedback-message {
  color: rgba(60, 41, 20, 0.92);
  font-size: 0.92rem;
  line-height: 1.55;
}

.editor-workspace-shell__feedback-run {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.76rem;
  color: rgba(60, 41, 20, 0.76);
}

.editor-workspace-shell__feedback-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.74);
  color: rgba(154, 52, 18, 0.9);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.editor-workspace-shell__feedback-link {
  color: rgba(154, 52, 18, 0.96);
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: underline;
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
  .editor-workspace-shell__chrome {
    display: grid;
    gap: 12px;
  }

  .editor-workspace-shell__action-capsule-row {
    position: static;
    display: flex;
    justify-content: flex-end;
    pointer-events: auto;
    padding: 0 12px 12px;
  }
}

@media (max-width: 760px) {
  .editor-workspace-shell {
    --editor-state-panel-open-width: min(320px, calc(100vw - var(--app-sidebar-width) - 24px));
    --editor-human-review-panel-open-width: min(360px, calc(100vw - var(--app-sidebar-width) - 24px));
  }
}
</style>
