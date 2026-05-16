<template>
  <section class="editor-workspace-shell">
    <input
      ref="pythonGraphImportInput"
      class="editor-workspace-shell__file-input"
      type="file"
      accept=".py,text/x-python,text/plain"
      @change="handlePythonGraphImportSelection"
    />
    <input
      ref="graphReplayPythonImportInput"
      class="editor-workspace-shell__file-input"
      type="file"
      accept=".py,text/x-python,text/plain"
      @change="handleGraphReplayPythonImportSelection"
    />

    <div v-if="workspace.tabs.length === 0" class="editor-workspace-shell__welcome">
      <div v-if="routeRestoreError" class="editor-workspace-shell__status-card editor-workspace-shell__status-card--danger">
        <div class="editor-workspace-shell__status-eyebrow">{{ t("common.restore") }}</div>
        <h2>{{ t("runDetail.restoreSnapshotFailed") }}</h2>
        <p>{{ routeRestoreError }}</p>
      </div>
      <div v-else class="editor-workspace-shell__status-card">
        <div class="editor-workspace-shell__status-eyebrow">{{ t("common.graph") }}</div>
        <h2>{{ t("common.loadingGraph") }}</h2>
      </div>
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
          @import-python-graph="openPythonGraphImportDialog"
          @open-graph-replay-debug="openGraphReplayDebugDialog"
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
            :show-revision-history="canOpenActiveGraphRevisionHistory"
            @toggle-state-panel="toggleActiveStatePanel"
            @toggle-run-activity-panel="toggleActiveRunActivityPanelFromActionCapsule"
            @save-active-graph="saveActiveGraph"
            @save-active-graph-as-new="saveActiveGraphAsNewGraph"
            @save-active-graph-as-template="saveActiveGraphAsTemplate"
            @open-active-graph-revisions="openActiveGraphRevisionHistory"
            @validate-active-graph="validateActiveGraph"
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
                :action-definitions="actionDefinitions"
                :tool-definitions="toolDefinitions"
                :action-definitions-loading="actionDefinitionsLoading"
                :action-definitions-error="actionDefinitionsError"
                :tool-definitions-loading="toolDefinitionsLoading"
                :tool-definitions-error="toolDefinitionsError"
                :templates="graphTemplates"
                :available-agent-model-refs="agentRuntimeCatalog.availableModelRefs"
                :agent-model-display-lookup="agentRuntimeCatalog.modelDisplayLookup"
                :global-text-model-ref="agentRuntimeCatalog.globalTextModelRef"
                :selected-node-id="focusedNodeIdByTabId[tab.tabId] ?? null"
                :selected-node-ids="selectedNodeIdsByTabId[tab.tabId] ?? []"
                :focus-request="focusRequestByTabId[tab.tabId] ?? null"
                :run-node-status-by-node-id="runNodeStatusByTabId[tab.tabId] ?? undefined"
                :run-node-timing-by-node-id="runNodeTimingByTabId[tab.tabId] ?? undefined"
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
                @select-nodes="selectNodesForTab(tab.tabId, $event)"
                @update-node-metadata="updateNodeMetadataForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-config="updateInputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-input-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @update-state="updateStateField(tab.tabId, $event.stateKey, $event.patch)"
                @remove-port-state="removeNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey)"
                @reorder-port-state="reorderNodePortStateForTab(tab.tabId, $event.nodeId, $event.side, $event.stateKey, $event.targetIndex)"
                @disconnect-data-edge="disconnectDataEdgeForTab(tab.tabId, $event.sourceNodeId, $event.targetNodeId, $event.stateKey, $event.mode)"
                @update-agent-config="updateAgentConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-tool-config="updateToolConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-batch-config="updateBatchConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-batch-worker="updateBatchWorkerForTab(tab.tabId, $event.nodeId, resolveBatchWorkerSelection($event.workerValue))"
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

    <ElDialog
      v-model="editorGraphRevisionDialogOpen"
      class="editor-workspace-shell__revision-dialog"
      :title="editorGraphRevisionDialogTitle"
      width="min(720px, calc(100vw - 32px))"
      :close-on-click-modal="false"
    >
      <section class="editor-workspace-shell__revision-panel">
        <p class="editor-workspace-shell__revision-body">{{ t("graphLibrary.revisionDialogBody") }}</p>
        <article v-if="editorGraphRevisionLoading" class="editor-workspace-shell__revision-empty">
          {{ t("graphLibrary.loadingRevisions") }}
        </article>
        <article v-else-if="editorGraphRevisionError" class="editor-workspace-shell__revision-notice">
          {{ t("common.failedToLoad", { error: editorGraphRevisionError }) }}
        </article>
        <article v-else-if="editorGraphRevisionRows.length === 0" class="editor-workspace-shell__revision-empty">
          {{ t("graphLibrary.noRevisions") }}
        </article>
        <div v-else class="editor-workspace-shell__revision-list">
          <article v-for="row in editorGraphRevisionRows" :key="row.revisionId" class="editor-workspace-shell__revision-row">
            <div class="editor-workspace-shell__revision-main">
              <div>
                <div class="editor-workspace-shell__revision-id">{{ row.revisionId }}</div>
                <h3>{{ row.reason || t("graphLibrary.revisionNoReason") }}</h3>
                <p>{{ formatEditorRevisionTimestamp(row.createdAt) }}</p>
              </div>
              <ElButton
                size="small"
                :type="row.restoresToDeletion ? 'danger' : 'primary'"
                :loading="editorRestoreRevisionActionId === row.revisionId"
                :disabled="Boolean(editorRestoreRevisionActionId)"
                :data-virtual-affordance-id="`editor.graph.${editorGraphRevisionGraphId}.revision.${row.revisionId}.restore`"
                :data-virtual-affordance-label="
                  row.restoresToDeletion
                    ? t('graphLibrary.restoreRevisionDeletesGraph')
                    : t('graphLibrary.restoreRevisionAction')
                "
                data-virtual-affordance-role="button"
                data-virtual-affordance-zone="editor.revisionHistory"
                data-virtual-affordance-actions="click"
                @click="restoreActiveGraphRevisionFromHistory(row)"
              >
                {{
                  row.restoresToDeletion
                    ? t("graphLibrary.restoreRevisionDeletesGraph")
                    : t("graphLibrary.restoreRevisionAction")
                }}
              </ElButton>
            </div>
            <div class="editor-workspace-shell__revision-path">
              <span>
                {{ t("graphLibrary.revisionRestoreTarget", { name: row.previousName || t("graphLibrary.deletedGraph") }) }}
              </span>
              <span>
                {{ t("graphLibrary.revisionChangedTo", { name: row.nextName || t("graphLibrary.deletedGraph") }) }}
              </span>
            </div>
            <div class="editor-workspace-shell__revision-meta">
              <span>{{ t("graphLibrary.revisionActor", { actor: row.actor || t("common.none") }) }}</span>
              <span>{{ t("graphLibrary.revisionDiffCount", { count: row.diffCount }) }}</span>
              <span v-if="row.runId">{{ t("graphLibrary.revisionRun", { runId: row.runId }) }}</span>
            </div>
          </article>
        </div>
      </section>
    </ElDialog>

    <ElDialog
      v-model="graphReplayDebugDialogOpen"
      class="editor-workspace-shell__graph-replay-dialog"
      :title="t('editor.graphReplayDebugTitle')"
      width="min(760px, calc(100vw - 32px))"
      :close-on-click-modal="false"
    >
      <div class="editor-workspace-shell__graph-replay-body">
        <p class="editor-workspace-shell__graph-replay-copy">
          {{ t("editor.graphReplayDebugCopy") }}
        </p>
        <ElInput
          v-model="graphReplayDebugJsonText"
          type="textarea"
          :autosize="{ minRows: 12, maxRows: 18 }"
          :placeholder="t('editor.graphReplayDebugJsonPlaceholder')"
        />
        <div v-if="graphReplayDebugCompileResult" class="editor-workspace-shell__graph-replay-summary">
          <span>{{ t("editor.graphReplayDebugSummaryStates", { count: graphReplayDebugCompileResult.summary.states }) }}</span>
          <span>{{ t("editor.graphReplayDebugSummaryNodes", { count: graphReplayDebugCompileResult.summary.nodes }) }}</span>
          <span>{{ t("editor.graphReplayDebugSummaryEdges", { count: graphReplayDebugCompileResult.summary.flowEdges }) }}</span>
          <span>{{ t("editor.graphReplayDebugSummaryCommands", { count: graphReplayDebugCompileResult.summary.playbackIntents }) }}</span>
        </div>
        <div v-if="graphReplayDebugError" class="editor-workspace-shell__graph-replay-alert editor-workspace-shell__graph-replay-alert--danger">
          {{ graphReplayDebugError }}
        </div>
        <div
          v-if="graphReplayDebugCompileResult?.warnings.length"
          class="editor-workspace-shell__graph-replay-alert editor-workspace-shell__graph-replay-alert--warning"
        >
          <div v-for="warning in graphReplayDebugCompileResult.warnings" :key="warning">{{ warning }}</div>
        </div>
      </div>
      <template #footer>
        <div class="editor-workspace-shell__graph-replay-actions">
          <ElButton @click="openGraphReplayPythonImportDialog">{{ t("editor.graphReplayDebugImportPython") }}</ElButton>
          <ElButton @click="previewGraphReplayDebugJson">{{ t("editor.graphReplayDebugPreview") }}</ElButton>
          <ElButton
            type="primary"
            :loading="graphReplayDebugBusy"
            :disabled="!graphReplayDebugCanStart"
            @click="startGraphReplayDebugPlayback"
          >
            {{ t("editor.graphReplayDebugStart") }}
          </ElButton>
        </div>
      </template>
    </ElDialog>

    <ElDialog
      :model-value="saveMetadataDialog.open"
      class="editor-workspace-shell__save-metadata-dialog"
      :title="saveMetadataDialogTitle"
      width="min(520px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      @update:model-value="handleSaveMetadataDialogModelValue"
    >
      <div class="editor-workspace-shell__save-metadata-body">
        <p class="editor-workspace-shell__save-metadata-copy">{{ saveMetadataDialogCopy }}</p>
        <label class="editor-workspace-shell__save-metadata-field">
          <span>{{ saveMetadataDialogNameLabel }}</span>
          <ElInput
            v-model="saveMetadataDialog.name"
            :placeholder="saveMetadataDialogNamePlaceholder"
            maxlength="80"
            show-word-limit
            @keyup.enter="confirmSaveMetadataDialog"
          />
        </label>
        <label class="editor-workspace-shell__save-metadata-field">
          <span>{{ t("editor.saveMetadataDescription") }}</span>
          <ElInput
            v-model="saveMetadataDialog.description"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :placeholder="t('editor.saveMetadataDescriptionPlaceholder')"
            maxlength="240"
            show-word-limit
          />
        </label>
        <p v-if="saveMetadataDialog.error" class="editor-workspace-shell__save-metadata-error">
          {{ saveMetadataDialog.error }}
        </p>
      </div>
      <template #footer>
        <div class="editor-workspace-shell__save-metadata-actions">
          <ElButton @click="cancelSaveMetadataDialog">{{ t("common.cancel") }}</ElButton>
          <ElButton type="primary" @click="confirmSaveMetadataDialog">{{ t("common.save") }}</ElButton>
        </div>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElButton, ElDialog, ElInput, ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";

import { fetchPreset, fetchPresets, savePreset } from "@/api/presets";
import { fetchKnowledgeBases } from "@/api/knowledge";
import { fetchRun, resumeRun } from "@/api/runs";
import { fetchSettings } from "@/api/settings";
import { fetchActionDefinitions } from "@/api/actions";
import { fetchToolCatalog } from "@/api/tools";
import { attachPageOperationRuntimeContext, buildPageOperationRuntimeContext } from "@/buddy/pageOperationAffordances";
import { resolveBuddyVirtualOperationPlanFromActivityEvent } from "@/buddy/virtualOperationProtocol";
import {
  exportLangGraphPython,
  fetchGraph,
  fetchGraphRevisions,
  importGraphFromPythonSource,
  restoreGraphRevision,
  runGraph,
  saveGraph,
  saveGraphAsTemplate,
  validateGraph,
} from "@/api/graphs";
import { resolveAgentRuntimeCatalog } from "@/editor/nodes/agentConfigModel";
import EditorCanvas from "@/editor/canvas/EditorCanvas.vue";
import { clonePlainValue, reconcileAgentActionOutputBindingsInDocument } from "@/lib/graph-document";
import { buildGraphRevisionHistoryRows, type GraphRevisionHistoryRow } from "@/lib/graphRevisionHistoryModel";
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
import { useBuddyContextStore } from "@/stores/buddyContext";
import { useBuddyMascotDebugStore } from "@/stores/buddyMascotDebug";
import { useGraphDocumentStore } from "@/stores/graphDocument";
import type { RunDetail } from "@/types/run";
import type {
  GraphDocument,
  GraphPayload,
  GraphRevisionRecord,
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
import {
  resolveWorkspaceDraftPersistenceRequest,
  shouldRunWorkspaceDraftHydration,
} from "./editorDraftPersistenceModel.ts";
import type { WorkspaceSidePanelMode } from "./workspaceSidePanelModel.ts";
import { downloadPythonSource } from "./pythonExportModel.ts";
import { isTooGraphPythonExportFile, isTooGraphPythonExportSource } from "./pythonImportModel.ts";
import {
  applyGraphSaveMetadata,
  isDefaultGraphSaveName,
  readGraphSaveDescription,
  type SaveMetadataRequest,
  type SaveMetadataTarget,
} from "./saveMetadataModel.ts";
import {
  applyGraphEditCommandToDocument,
  buildGraphEditPlaybackPlan,
  type GraphEditCommand,
  type GraphEditIntent,
} from "./graphEditPlaybackModel.ts";
import { buildGraphEditPlaybackDocumentDiff } from "./graphEditPlaybackDiffModel.ts";
import {
  buildGraphReplayIntentsFromTargetGraph,
  parseGraphReplayTargetJson,
  type GraphReplayTargetCompileResult,
} from "./graphReplayTargetModel.ts";
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
import type { RunNodeTimingByNodeId } from "./runNodeTimingModel.ts";

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
const buddyContextStore = useBuddyContextStore();
const buddyMascotDebugStore = useBuddyMascotDebugStore();
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
const graphReplayPythonImportInput = ref<HTMLInputElement | null>(null);
const closeBusy = ref(false);
const closeError = ref<string | null>(null);
const handledRouteSignature = ref<string | null>(null);
const statePanelOpenByTabId = ref<Record<string, boolean>>({});
const sidePanelModeByTabId = ref<Record<string, WorkspaceSidePanelMode>>({});
const focusedNodeIdByTabId = ref<Record<string, string | null>>({});
const selectedNodeIdsByTabId = ref<Record<string, string[]>>({});
const focusRequestByTabId = ref<Record<string, NodeFocusRequest | null>>({});
const viewportByTabId = ref<Record<string, CanvasViewport>>({});
const dataEdgeStateEditorRequestByTabId = ref<Record<string, DataEdgeStateEditorRequest | null>>({});
const runNodeStatusByTabId = ref<Record<string, Record<string, string>>>({});
const runNodeTimingByTabId = ref<Record<string, RunNodeTimingByNodeId>>({});
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
const graphReplayDebugDialogOpen = ref(false);
const graphReplayDebugJsonText = ref("");
const graphReplayDebugCompileResult = ref<GraphReplayTargetCompileResult | null>(null);
const graphReplayDebugError = ref<string | null>(null);
const graphReplayDebugBusy = ref(false);
const {
  knowledgeBases,
  settings,
  actionDefinitions,
  actionDefinitionsLoading,
  actionDefinitionsError,
  toolDefinitions,
  toolDefinitionsLoading,
  toolDefinitionsError,
  persistedPresets,
  loadInitialWorkspaceResources,
  refreshAgentModels,
} = useWorkspaceResourceController({
  fetchKnowledgeBases,
  fetchSettings,
  fetchActionDefinitions,
  fetchToolDefinitions: fetchToolCatalog,
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
const canOpenActiveGraphRevisionHistory = computed(() => {
  const tab = activeTab.value;
  return Boolean(tab?.kind === "existing" && tab.graphId);
});
const editorGraphRevisionDialogOpen = ref(false);
const editorGraphRevisionGraphId = ref("");
const editorGraphRevisionGraphTitle = ref("");
const editorGraphRevisionTabId = ref("");
const editorGraphRevisionLoading = ref(false);
const editorGraphRevisionError = ref<string | null>(null);
const editorGraphRevisions = ref<GraphRevisionRecord[]>([]);
const editorRestoreRevisionActionId = ref("");
const editorGraphRevisionRows = computed(() => buildGraphRevisionHistoryRows(editorGraphRevisions.value));
const editorGraphRevisionDialogTitle = computed(() =>
  editorGraphRevisionGraphTitle.value
    ? t("graphLibrary.revisionDialogTitle", { name: editorGraphRevisionGraphTitle.value })
    : t("graphLibrary.history"),
);
const graphReplayDebugCanStart = computed(() => {
  const compileResult = graphReplayDebugCompileResult.value;
  return (
    !graphReplayDebugBusy.value &&
    (Boolean(compileResult?.valid && compileResult.intentPackage.operations.length > 0) || graphReplayDebugJsonText.value.trim().length > 0)
  );
});

type SaveMetadataDialogState = {
  open: boolean;
  target: SaveMetadataTarget;
  document: GraphPayload | GraphDocument | null;
  name: string;
  description: string;
  error: string;
  resolve: ((document: GraphPayload | GraphDocument | null) => void) | null;
};

function createClosedSaveMetadataDialog(): SaveMetadataDialogState {
  return {
    open: false,
    target: "graph",
    document: null,
    name: "",
    description: "",
    error: "",
    resolve: null,
  };
}

const saveMetadataDialog = ref<SaveMetadataDialogState>(createClosedSaveMetadataDialog());
const saveMetadataDialogTitle = computed(() =>
  saveMetadataDialog.value.target === "template" ? t("editor.saveMetadataTemplateTitle") : t("editor.saveMetadataGraphTitle"),
);
const saveMetadataDialogCopy = computed(() =>
  saveMetadataDialog.value.target === "template" ? t("editor.saveMetadataTemplateCopy") : t("editor.saveMetadataGraphCopy"),
);
const saveMetadataDialogNameLabel = computed(() =>
  saveMetadataDialog.value.target === "template" ? t("editor.saveMetadataTemplateName") : t("editor.saveMetadataGraphName"),
);
const saveMetadataDialogNamePlaceholder = computed(() =>
  saveMetadataDialog.value.target === "template" ? t("editor.saveMetadataTemplateNamePlaceholder") : t("editor.saveMetadataGraphNamePlaceholder"),
);

function requestSaveMetadataForDocument(request: SaveMetadataRequest) {
  return new Promise<GraphPayload | GraphDocument | null>((resolve) => {
    saveMetadataDialog.value = {
      open: true,
      target: request.target,
      document: request.document,
      name: "",
      description: readGraphSaveDescription(request.document),
      error: "",
      resolve,
    };
  });
}

function settleSaveMetadataDialog(document: GraphPayload | GraphDocument | null) {
  const resolve = saveMetadataDialog.value.resolve;
  saveMetadataDialog.value = createClosedSaveMetadataDialog();
  resolve?.(document);
}

function resolveBatchWorkerSelection(workerValue: string) {
  if (workerValue === "default_llm") {
    return { source: "default_llm" as const };
  }
  const templateId = workerValue.startsWith("template:") ? workerValue.slice("template:".length) : "";
  const template = graphTemplates.value.find((candidate) => candidate.template_id === templateId) ?? null;
  return template ? { source: "template" as const, template } : { source: "default_llm" as const };
}

function handleSaveMetadataDialogModelValue(value: boolean) {
  if (!value && saveMetadataDialog.value.open) {
    cancelSaveMetadataDialog();
  }
}

function cancelSaveMetadataDialog() {
  settleSaveMetadataDialog(null);
}

function confirmSaveMetadataDialog() {
  const document = saveMetadataDialog.value.document;
  if (!document) {
    settleSaveMetadataDialog(null);
    return;
  }

  const name = saveMetadataDialog.value.name.trim();
  if (isDefaultGraphSaveName(name)) {
    saveMetadataDialog.value = {
      ...saveMetadataDialog.value,
      error: t("editor.saveMetadataNameRequired"),
    };
    return;
  }

  settleSaveMetadataDialog(
    applyGraphSaveMetadata(document, {
      name,
      description: saveMetadataDialog.value.description,
    }),
  );
}

async function openActiveGraphRevisionHistory() {
  const tab = activeTab.value;
  const graphId = tab?.kind === "existing" ? tab.graphId?.trim() ?? "" : "";
  if (!tab || !graphId) {
    return;
  }
  editorGraphRevisionDialogOpen.value = true;
  editorGraphRevisionGraphId.value = graphId;
  editorGraphRevisionGraphTitle.value = documentsByTabId.value[tab.tabId]?.name ?? tab.title;
  editorGraphRevisionTabId.value = tab.tabId;
  await loadActiveGraphRevisionHistory(graphId);
}

async function loadActiveGraphRevisionHistory(graphId = editorGraphRevisionGraphId.value) {
  if (!graphId) {
    return;
  }
  editorGraphRevisionLoading.value = true;
  editorGraphRevisionError.value = null;
  try {
    editorGraphRevisions.value = await fetchGraphRevisions(graphId);
  } catch (loadError) {
    editorGraphRevisionError.value = loadError instanceof Error ? loadError.message : t("common.loading");
  } finally {
    editorGraphRevisionLoading.value = false;
  }
}

async function restoreActiveGraphRevisionFromHistory(row: GraphRevisionHistoryRow) {
  const targetTabId = editorGraphRevisionTabId.value;
  if (!editorGraphRevisionGraphId.value || !targetTabId || editorRestoreRevisionActionId.value) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      row.restoresToDeletion
        ? t("graphLibrary.restoreRevisionDeletesConfirm")
        : t("graphLibrary.restoreRevisionConfirm", { name: row.previousName || t("common.none") }),
      t("graphLibrary.restoreRevisionTitle"),
      {
        confirmButtonText: row.restoresToDeletion
          ? t("graphLibrary.restoreRevisionDeletesGraph")
          : t("graphLibrary.restoreRevisionAction"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      },
    );
  } catch {
    return;
  }

  editorRestoreRevisionActionId.value = row.revisionId;
  editorGraphRevisionError.value = null;
  try {
    const response = await restoreGraphRevision(editorGraphRevisionGraphId.value, row.revisionId);
    await graphStore.loadGraphs();
    if (response.graph) {
      registerDocumentForTab(targetTabId, response.graph);
      updateWorkspaceTab(targetTabId, (tab) => ({
        ...tab,
        kind: "existing",
        graphId: response.graph!.graph_id,
        title: response.graph!.name,
        dirty: false,
      }));
      editorGraphRevisionGraphId.value = response.graph.graph_id;
      editorGraphRevisionGraphTitle.value = response.graph.name;
      await loadActiveGraphRevisionHistory(response.graph.graph_id);
      const restoredTab = workspace.value.tabs.find((tab) => tab.tabId === targetTabId);
      if (restoredTab && workspace.value.activeTabId === targetTabId) {
        syncRouteToTab(restoredTab, "replace");
      }
    } else {
      updateWorkspaceTab(targetTabId, (tab) => ({ ...tab, dirty: false }));
      editorGraphRevisionDialogOpen.value = false;
      editorGraphRevisions.value = [];
      editorGraphRevisionGraphId.value = "";
      editorGraphRevisionGraphTitle.value = "";
      editorGraphRevisionTabId.value = "";
      requestCloseTab(targetTabId);
    }
    ElMessage.success(t("graphLibrary.revisionRestored", { revisionId: response.restored_revision_id }));
  } catch (restoreError) {
    editorGraphRevisionError.value = restoreError instanceof Error ? restoreError.message : t("common.failedToSave", { error: "" });
  } finally {
    editorRestoreRevisionActionId.value = "";
  }
}

function formatEditorRevisionTimestamp(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return createdAt;
  }
  return parsed.toLocaleString();
}

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
  selectNodesForTab,
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
  selectedNodeIdsByTabId,
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
  runNodeTimingByTabId,
  currentRunNodeIdByTabId,
  runOutputPreviewByTabId,
  runFailureMessageByTabId,
  activeRunEdgeIdsByTabId,
  subgraphRunStatusByTabId,
  feedbackByTabId,
});
const activeBuddyEditorSnapshot = computed(() => {
  const tab = activeTab.value;
  if (!tab) {
    return null;
  }

  return {
    activeTabId: tab.tabId,
    activeTabTitle: tab.title,
    activeTabKind: tab.kind,
    activeGraphId: resolveActiveGraphIdForPageFacts(tab, documentsByTabId.value[tab.tabId] ?? null),
    activeGraphName: documentsByTabId.value[tab.tabId]?.name ?? tab.title,
    activeGraphDirty: tab.dirty,
    document: documentsByTabId.value[tab.tabId] ?? null,
    focusedNodeId: focusedNodeIdByTabId.value[tab.tabId] ?? null,
    selectedNodeIds: selectedNodeIdsByTabId.value[tab.tabId] ?? [],
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
  handleActivityEvent: handleWorkspaceRunActivityEvent,
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

function ensureWorkspaceHasCanvas() {
  if (!hydrated.value || workspace.value.tabs.length > 0 || props.restoreRunId) {
    return;
  }
  openNewTab(null, "replace");
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
  startRunEventStreamForTab,
  pollRunForTab,
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
  requestSaveMetadata: requestSaveMetadataForDocument,
  showSaveSuccessToast,
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
  isTooGraphPythonExportSource,
  setMessageFeedbackForTab,
});

function openGraphReplayDebugDialog() {
  graphReplayDebugDialogOpen.value = true;
  graphReplayDebugError.value = null;
}

function openGraphReplayPythonImportDialog() {
  graphReplayPythonImportInput.value?.click();
}

async function handleGraphReplayPythonImportSelection(event: Event) {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  const file = target?.files?.[0] ?? null;
  if (target) {
    target.value = "";
  }
  if (!file) {
    return;
  }

  graphReplayDebugBusy.value = true;
  graphReplayDebugError.value = null;
  try {
    const source = await file.text();
    const importedGraph = await importGraphFromPythonSource(source);
    graphReplayDebugDialogOpen.value = true;
    graphReplayDebugJsonText.value = JSON.stringify(importedGraph, null, 2);
    previewGraphReplayDebugTarget(importedGraph);
  } catch (error) {
    graphReplayDebugDialogOpen.value = true;
    graphReplayDebugCompileResult.value = null;
    graphReplayDebugError.value = error instanceof Error ? error.message : t("editor.graphReplayDebugImportFailed");
  } finally {
    graphReplayDebugBusy.value = false;
  }
}

function previewGraphReplayDebugJson() {
  const parsed = parseGraphReplayTargetJson(graphReplayDebugJsonText.value);
  if (!parsed.graph) {
    graphReplayDebugCompileResult.value = null;
    graphReplayDebugError.value = parsed.issues.join("\n");
    return false;
  }

  return previewGraphReplayDebugTarget(parsed.graph);
}

function previewGraphReplayDebugTarget(graph: GraphPayload | GraphDocument) {
  const compileResult = buildGraphReplayIntentsFromTargetGraph(graph);
  graphReplayDebugCompileResult.value = compileResult;
  graphReplayDebugError.value = compileResult.valid ? null : compileResult.issues.join("\n");
  return compileResult.valid;
}

async function startGraphReplayDebugPlayback() {
  if (graphReplayDebugBusy.value) {
    return;
  }

  graphReplayDebugBusy.value = true;
  try {
    if (!previewGraphReplayDebugJson()) {
      return;
    }
    const compileResult = graphReplayDebugCompileResult.value;
    if (!compileResult?.valid || compileResult.intentPackage.operations.length === 0) {
      graphReplayDebugError.value = t("editor.graphReplayDebugNoCommands");
      return;
    }

    openNewTab(null);
    await nextTick();
    const tab = activeTab.value;
    buddyMascotDebugStore.requestVirtualOperation({
      version: 1,
      commands: ["graph_edit editor.graph.playback"],
      operations: [
        {
          kind: "graph_edit",
          targetId: "editor.canvas.surface",
          graphEditIntents: compileResult.intentPackage.operations,
        },
      ],
      cursorLifecycle: "return_at_end",
      reason: t("editor.graphReplayDebugReason"),
    });
    graphReplayDebugDialogOpen.value = false;
    if (tab) {
      setMessageFeedbackForTab(tab.tabId, {
        tone: "neutral",
        message: t("editor.graphReplayDebugStarted"),
      });
    }
  } finally {
    graphReplayDebugBusy.value = false;
  }
}
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
  isTooGraphPythonExportFile,
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
  runNodeTimingByTabId,
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
  runNodeTimingByTabId,
  currentRunNodeIdByTabId,
  runOutputPreviewByTabId,
  runFailureMessageByTabId,
  activeRunEdgeIdsByTabId,
  runActivityByTabId,
  refreshAgentModels,
  runGraph: runGraphWithPageOperationContext,
  consumeVirtualOperationRunAttribution: (targetId) => buddyMascotDebugStore.consumeVirtualOperationRunAttribution(targetId),
  recordVirtualOperationTriggeredRun: (record) => buddyMascotDebugStore.recordVirtualOperationTriggeredRun(record),
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

async function runGraphWithPageOperationContext(payload: GraphPayload | GraphDocument) {
  const pageOperationContext = buildPageOperationRuntimeContext({
    routePath: route.fullPath,
    root: typeof document === "undefined" ? null : document,
    editor: buildActivePageOperationEditorFacts(),
    latestForegroundRun: buildLatestForegroundRunFact(),
  });
  return runGraph(attachPageOperationRuntimeContext(payload, pageOperationContext));
}

function buildActivePageOperationEditorFacts() {
  const tab = activeTab.value;
  if (!tab) {
    return null;
  }
  const activeDocument = documentsByTabId.value[tab.tabId] ?? null;
  return {
    activeTabId: tab.tabId,
    activeTabTitle: tab.title,
    activeTabKind: tab.kind,
    activeGraphId: resolveActiveGraphIdForPageFacts(tab, activeDocument),
    activeGraphName: activeDocument?.name ?? tab.title,
    activeGraphDirty: tab.dirty,
  };
}

function buildLatestForegroundRunFact() {
  const tab = activeTab.value;
  const run = tab ? latestRunDetailByTabId.value[tab.tabId] ?? null : null;
  if (!run) {
    return null;
  }
  return {
    runId: run.run_id,
    status: run.status,
    resultSummary: compactPageFactText(run.final_result),
  };
}

function resolveActiveGraphIdForPageFacts(tab: EditorWorkspaceTab, activeDocument: GraphPayload | GraphDocument | null) {
  if (activeDocument && "graph_id" in activeDocument && activeDocument.graph_id) {
    return activeDocument.graph_id;
  }
  return tab.graphId;
}

function compactPageFactText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function handleWorkspaceRunActivityEvent(payload: Record<string, unknown>) {
  const operationPlan = resolveBuddyVirtualOperationPlanFromActivityEvent(payload);
  if (!operationPlan) {
    return;
  }
  buddyMascotDebugStore.requestVirtualOperation(operationPlan);
}

type GraphEditPlaybackPlanRequestDetail = {
  requestId?: unknown;
  graphEditIntents?: GraphEditIntent[];
  response?: unknown;
};

type GraphEditPlaybackApplyCommandDetail = {
  command?: GraphEditCommand;
  response?: unknown;
};

type GraphEditPlaybackSaveRequestResponse = {
  ok: boolean;
  graphId: string | null;
  revisionId: string | null;
  issues: string[];
};

type GraphEditPlaybackSaveRequestDetail = {
  requestId: string;
  runId?: string;
  nodeId?: string;
  reason?: string;
  response?: GraphEditPlaybackSaveRequestResponse | Promise<GraphEditPlaybackSaveRequestResponse> | null;
};

function handleGraphEditPlaybackPlanRequest(event: Event) {
  const detail = (event as CustomEvent<GraphEditPlaybackPlanRequestDetail>).detail;
  if (!detail || !Array.isArray(detail.graphEditIntents)) {
    return;
  }
  const requestId = String(detail.requestId ?? "").trim();
  if (!requestId) {
    return;
  }
  const tab = ensureGraphEditPlaybackTab();
  const document = tab ? documentsByTabId.value[tab.tabId] : null;
  if (!tab || !document) {
    detail.response = {
      requestId,
      ok: false,
      graphCommands: [],
      playbackSteps: [],
      issues: ["No editable graph tab is open."],
    };
    return;
  }

  const plan = buildGraphEditPlaybackPlan(document, { operations: detail.graphEditIntents });
  detail.response = {
    requestId,
    ok: plan.valid,
    graphCommands: plan.graphCommands,
    playbackSteps: plan.playbackSteps,
    issues: plan.issues,
  };
}

function handleGraphEditPlaybackApplyCommand(event: Event) {
  const detail = (event as CustomEvent<GraphEditPlaybackApplyCommandDetail>).detail;
  const command = detail?.command;
  if (!detail || !command) {
    return;
  }
  const tab = ensureGraphEditPlaybackTab();
  const document = tab ? documentsByTabId.value[tab.tabId] : null;
  if (!tab || !document) {
    detail.response = {
      ok: false,
      applied: false,
      issues: ["No editable graph tab is open."],
    };
    return;
  }

  const nextDocument = applyGraphEditCommandToDocument(document, command);
  const diff = nextDocument !== document ? buildGraphEditPlaybackDocumentDiff(document, nextDocument) : [];
  if (nextDocument !== document) {
    markDocumentDirty(tab.tabId, nextDocument);
  }
  detail.response = {
    ok: true,
    applied: nextDocument !== document,
    issues: [],
    diff,
  };
}

function handleGraphEditPlaybackSaveRequest(event: Event) {
  const detail = (event as CustomEvent<GraphEditPlaybackSaveRequestDetail>).detail;
  if (!detail) {
    return;
  }
  detail.response = saveGraphEditPlaybackRevision(detail);
}

async function saveGraphEditPlaybackRevision(detail: GraphEditPlaybackSaveRequestDetail): Promise<GraphEditPlaybackSaveRequestResponse> {
  const requestId = String(detail.requestId ?? "").trim();
  if (!requestId) {
    return {
      ok: false,
      graphId: null,
      revisionId: null,
      issues: ["Graph edit playback save request is missing a request id."],
    };
  }
  const tab = activeTab.value;
  const document = tab ? documentsByTabId.value[tab.tabId] : null;
  if (!tab || !document) {
    return {
      ok: false,
      graphId: null,
      revisionId: null,
      issues: ["No editable graph tab is open."],
    };
  }
  const graphId = tab.graphId ?? ("graph_id" in document ? document.graph_id : null);
  if (!graphId) {
    return {
      ok: false,
      graphId: null,
      revisionId: null,
      issues: ["Graph edit playback can only persist an already saved graph."],
    };
  }

  try {
    const documentToSave = { ...document, graph_id: graphId };
    const saveResponse = await saveGraph(documentToSave, {
      revisionContext: {
        actor: "buddy",
        run_id: detail.runId ?? "",
        node_id: detail.nodeId ?? "",
        reason: detail.reason ?? `Persist Buddy graph edit playback (${detail.requestId}).`,
      },
    });
    const savedGraph = await fetchGraph(saveResponse.graph_id);
    registerDocumentForTab(tab.tabId, savedGraph);
    updateWorkspaceTab(tab.tabId, (currentTab) => ({
      ...currentTab,
      kind: "existing",
      graphId: savedGraph.graph_id,
      title: savedGraph.name,
      dirty: false,
      templateId: null,
      defaultTemplateId: null,
      subgraphSource: null,
    }));
    await graphStore.loadGraphs();
    return {
      ok: true,
      graphId: saveResponse.graph_id,
      revisionId: saveResponse.revision_id,
      issues: [],
    };
  } catch (error) {
    return {
      ok: false,
      graphId,
      revisionId: null,
      issues: [error instanceof Error ? error.message : "Failed to save graph edit playback revision."],
    };
  }
}

function ensureGraphEditPlaybackTab() {
  if (!activeTab.value && workspace.value.tabs.length === 0) {
    openNewTab(null, "replace");
  }
  return activeTab.value;
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
  updateToolConfigForTab,
  updateBatchConfigForTab,
  updateBatchWorkerForTab,
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
  actionDefinitions,
  toolDefinitions,
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

function showSaveSuccessToast(message: string) {
  ElMessage({
    customClass: "editor-workspace-shell__save-toast",
    type: "success",
    duration: 3200,
    grouping: false,
    placement: "top",
    showClose: false,
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
  activeBuddyEditorSnapshot,
  (snapshot) => buddyContextStore.setEditorSnapshot(snapshot),
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

function reconcileOpenDocumentsWithActionDefinitions() {
  if (!hydrated.value || actionDefinitions.value.length === 0) {
    return;
  }

  for (const [tabId, document] of Object.entries(documentsByTabId.value)) {
    const tab = workspace.value.tabs.find((candidate) => candidate.tabId === tabId) ?? null;
    if (!tab?.dirty) {
      continue;
    }
    const nextDocument = reconcileAgentActionOutputBindingsInDocument(document, actionDefinitions.value);
    if (nextDocument !== document) {
      markDocumentDirty(tabId, nextDocument);
    }
  }
}

watch(
  [() => documentsByTabId.value, () => actionDefinitions.value],
  reconcileOpenDocumentsWithActionDefinitions,
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

watch(
  () => workspace.value.tabs.length,
  () => {
    ensureWorkspaceHasCanvas();
  },
);

onBeforeUnmount(() => {
  window.removeEventListener("toograph:graph-edit-playback-plan-request", handleGraphEditPlaybackPlanRequest as EventListener);
  window.removeEventListener("toograph:graph-edit-playback-apply-command", handleGraphEditPlaybackApplyCommand as EventListener);
  window.removeEventListener("toograph:graph-edit-playback-save-request", handleGraphEditPlaybackSaveRequest as EventListener);
  buddyContextStore.clearEditorSnapshot();
  teardownRunLifecycle();
});

onMounted(() => {
  window.addEventListener("toograph:graph-edit-playback-plan-request", handleGraphEditPlaybackPlanRequest as EventListener);
  window.addEventListener("toograph:graph-edit-playback-apply-command", handleGraphEditPlaybackApplyCommand as EventListener);
  window.addEventListener("toograph:graph-edit-playback-save-request", handleGraphEditPlaybackSaveRequest as EventListener);
  loadInitialWorkspaceResources();
  updateWorkspace(readPersistedEditorWorkspace());
  ensureTabViewportDrafts();
  hydrated.value = true;
  ensureUnsavedTabDocuments();
  applyCurrentRouteInstruction();
  ensureWorkspaceHasCanvas();
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
  background: var(--toograph-page-bg);
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

:global(.editor-workspace-shell__save-toast.el-message) {
  left: 50%;
  min-width: min(360px, calc(100vw - 40px));
  max-width: min(620px, calc(100vw - 40px));
  justify-content: flex-start;
  border: 1px solid rgba(22, 101, 52, 0.42);
  border-radius: 28px;
  padding: 18px 24px;
  background: rgba(240, 253, 244, 0.97);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.7) inset,
    0 24px 62px rgba(20, 83, 45, 0.24),
    0 0 42px rgba(34, 197, 94, 0.24);
  backdrop-filter: blur(26px) saturate(1.6) contrast(1.04);
  transform: translateX(-50%);
  animation: editor-workspace-shell-save-toast-float 3.2s ease forwards;
}

:global(.editor-workspace-shell__save-toast .el-message__content) {
  color: #14532d;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.45;
}

:global(.editor-workspace-shell__save-toast .el-message__icon) {
  color: #16a34a;
  font-size: 21px;
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

:global(.editor-workspace-shell__graph-replay-dialog.el-dialog) {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 20px;
  background:
    linear-gradient(140deg, rgba(255, 252, 247, 0.98), rgba(247, 250, 252, 0.97)),
    rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 70px rgba(60, 41, 20, 0.2);
  overflow: hidden;
}

:global(.editor-workspace-shell__graph-replay-dialog .el-dialog__header) {
  padding: 22px 24px 8px;
}

:global(.editor-workspace-shell__graph-replay-dialog .el-dialog__title) {
  color: #1f2937;
  font-size: 1.12rem;
  font-weight: 850;
}

:global(.editor-workspace-shell__graph-replay-dialog .el-dialog__body) {
  padding: 10px 24px 4px;
}

:global(.editor-workspace-shell__graph-replay-dialog .el-dialog__footer) {
  padding: 14px 24px 22px;
}

.editor-workspace-shell__graph-replay-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-workspace-shell__graph-replay-copy {
  margin: 0;
  color: #6b5a4a;
  font-size: 0.9rem;
  line-height: 1.55;
}

.editor-workspace-shell__graph-replay-body :deep(.el-textarea__inner) {
  border-radius: 14px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
  line-height: 1.5;
  resize: none;
  box-shadow:
    0 0 0 1px rgba(154, 52, 18, 0.14) inset,
    0 8px 22px rgba(60, 41, 20, 0.06);
}

.editor-workspace-shell__graph-replay-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.editor-workspace-shell__graph-replay-summary span {
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.82);
  padding: 5px 10px;
  color: rgba(30, 64, 175, 0.96);
  font-size: 0.78rem;
  font-weight: 750;
}

.editor-workspace-shell__graph-replay-alert {
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1.5;
  white-space: pre-wrap;
}

.editor-workspace-shell__graph-replay-alert--danger {
  border: 1px solid rgba(190, 18, 60, 0.2);
  background: rgba(255, 241, 242, 0.92);
  color: #881337;
}

.editor-workspace-shell__graph-replay-alert--warning {
  border: 1px solid rgba(217, 119, 6, 0.24);
  background: rgba(255, 251, 235, 0.92);
  color: #92400e;
}

.editor-workspace-shell__graph-replay-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
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

@keyframes editor-workspace-shell-save-toast-float {
  0% {
    opacity: 0;
    transform: translate(-50%, -10px) scale(0.96);
  }

  14%,
  68% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -18px) scale(0.98);
  }
}

:global(.editor-workspace-shell__save-metadata-dialog.el-dialog) {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 20px;
  background:
    linear-gradient(140deg, rgba(255, 252, 247, 0.98), rgba(255, 247, 237, 0.96)),
    rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 70px rgba(60, 41, 20, 0.2);
  overflow: hidden;
}

:global(.editor-workspace-shell__save-metadata-dialog .el-dialog__header) {
  padding: 22px 24px 8px;
}

:global(.editor-workspace-shell__save-metadata-dialog .el-dialog__title) {
  color: #1f2937;
  font-size: 1.12rem;
  font-weight: 850;
}

:global(.editor-workspace-shell__save-metadata-dialog .el-dialog__body) {
  padding: 10px 24px 4px;
}

:global(.editor-workspace-shell__save-metadata-dialog .el-dialog__footer) {
  padding: 14px 24px 22px;
}

:global(.editor-workspace-shell__revision-dialog.el-dialog) {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 20px;
  background:
    linear-gradient(140deg, rgba(255, 252, 247, 0.98), rgba(255, 247, 237, 0.96)),
    rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 70px rgba(60, 41, 20, 0.2);
  overflow: hidden;
}

:global(.editor-workspace-shell__revision-dialog .el-dialog__header) {
  padding: 22px 24px 8px;
}

:global(.editor-workspace-shell__revision-dialog .el-dialog__title) {
  color: #1f2937;
  font-size: 1.12rem;
  font-weight: 850;
}

:global(.editor-workspace-shell__revision-dialog .el-dialog__body) {
  padding: 10px 24px 24px;
}

.editor-workspace-shell__revision-panel,
.editor-workspace-shell__revision-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-workspace-shell__revision-body,
.editor-workspace-shell__revision-row p,
.editor-workspace-shell__revision-meta,
.editor-workspace-shell__revision-path {
  margin: 0;
  color: #6b5a4a;
  font-size: 0.86rem;
  line-height: 1.45;
}

.editor-workspace-shell__revision-empty,
.editor-workspace-shell__revision-notice,
.editor-workspace-shell__revision-row {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  background: rgba(255, 250, 245, 0.9);
  padding: 14px;
}

.editor-workspace-shell__revision-notice {
  border-color: rgba(190, 18, 60, 0.22);
  color: #be123c;
}

.editor-workspace-shell__revision-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.editor-workspace-shell__revision-main h3 {
  margin: 4px 0;
  color: #2f241a;
  font-size: 0.98rem;
  line-height: 1.3;
}

.editor-workspace-shell__revision-id {
  color: #9a3412;
  font-family: var(--toograph-mono-font, "SFMono-Regular", Consolas, monospace);
  font-size: 0.76rem;
  font-weight: 800;
}

.editor-workspace-shell__revision-path,
.editor-workspace-shell__revision-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.editor-workspace-shell__revision-path span,
.editor-workspace-shell__revision-meta span {
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.08);
  padding: 4px 8px;
}

.editor-workspace-shell__save-metadata-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-workspace-shell__save-metadata-copy {
  margin: 0;
  color: #6b5a4a;
  font-size: 0.9rem;
  line-height: 1.55;
}

.editor-workspace-shell__save-metadata-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #7c2d12;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.editor-workspace-shell__save-metadata-field :deep(.el-input__wrapper),
.editor-workspace-shell__save-metadata-field :deep(.el-textarea__inner) {
  border-radius: 14px;
  box-shadow:
    0 0 0 1px rgba(154, 52, 18, 0.14) inset,
    0 8px 22px rgba(60, 41, 20, 0.06);
}

.editor-workspace-shell__save-metadata-field :deep(.el-textarea__inner) {
  resize: none;
}

.editor-workspace-shell__save-metadata-error {
  margin: 0;
  color: #be123c;
  font-size: 0.84rem;
  font-weight: 750;
}

.editor-workspace-shell__save-metadata-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
