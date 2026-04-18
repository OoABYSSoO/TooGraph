<template>
  <section class="editor-workspace-shell">
    <div v-if="workspace.tabs.length === 0" class="editor-workspace-shell__welcome">
      <EditorWelcomeState
        :templates="templates"
        :graphs="graphs"
        @create-new="openNewTab(null)"
        @open-template="openNewTab"
        @open-graph="openExistingGraph"
      />
    </div>

    <template v-else>
      <div class="editor-workspace-shell__chrome">
        <EditorTabBar
          :tabs="workspace.tabs"
          :active-tab-id="workspace.activeTabId"
          :templates="templates"
          :graphs="graphs"
          :active-graph-name="activeTabTitle"
          :active-state-count="activeStateCount"
          :is-state-panel-open="activeStatePanelOpen"
          @activate-tab="activateTab"
          @close-tab="requestCloseTab"
          @create-new="openNewTab(null)"
          @create-from-template="openNewTab"
          @open-graph="openExistingGraph"
          @rename-active-graph="renameActiveGraph"
          @toggle-state-panel="toggleActiveStatePanel"
          @save-active-graph="saveActiveGraph"
          @validate-active-graph="validateActiveGraph"
          @run-active-graph="runActiveGraph"
        />
      </div>

      <div class="editor-workspace-shell__body">
        <div
          v-for="tab in workspace.tabs"
          :key="tab.tabId"
          class="editor-workspace-shell__editor"
          :class="{ 'editor-workspace-shell__editor--active': tab.tabId === workspace.activeTabId }"
        >
          <div class="editor-workspace-shell__editor-grid" :style="editorGridStyle(tab.tabId)">
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
                :focused-node-id="focusedNodeIdByTabId[tab.tabId] ?? null"
                @select-node="focusNodeForTab(tab.tabId, $event)"
                @update-input-config="updateInputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-agent-config="updateAgentConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-condition-config="updateConditionConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update-condition-branch="updateConditionBranchForTab(tab.tabId, $event.nodeId, $event.currentKey, $event.nextKey, $event.mappingKeys)"
                @add-condition-branch="addConditionBranchForTab(tab.tabId, $event.nodeId)"
                @remove-condition-branch="removeConditionBranchForTab(tab.tabId, $event.nodeId, $event.branchKey)"
                @update-output-config="updateOutputConfigForTab(tab.tabId, $event.nodeId, $event.patch)"
                @update:node-position="(payload) => handleNodePositionUpdate(tab.tabId, payload)"
              />
            </div>

            <EditorStatePanel
              v-if="documentsByTabId[tab.tabId]"
              :open="isStatePanelOpen(tab.tabId)"
              :document="documentsByTabId[tab.tabId]!"
              :focused-node-id="focusedNodeIdByTabId[tab.tabId] ?? null"
              @toggle="toggleStatePanel(tab.tabId)"
              @focus-node="focusNodeForTab(tab.tabId, $event)"
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
    </template>

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

import { fetchGraph, runGraph, saveGraph, validateGraph } from "@/api/graphs";
import EditorCanvas from "@/editor/canvas/EditorCanvas.vue";
import { resolveEditorRouteInstruction } from "@/lib/editor-route-sync";
import {
  addConditionBranchToDocument,
  cloneGraphDocument,
  createDraftFromTemplate,
  createEmptyDraftGraph,
  removeConditionBranchFromDocument,
  updateAgentNodeConfigInDocument,
  updateConditionBranchInDocument,
  updateConditionNodeConfigInDocument,
  updateInputNodeConfigInDocument,
  updateOutputNodeConfigInDocument,
} from "@/lib/graph-document";
import {
  applyDocumentMetaToWorkspaceTab,
  closeWorkspaceTabTransition,
  createUnsavedWorkspaceTab,
  ensureSavedGraphTab,
  readPersistedEditorWorkspace,
  resolveEditorUrl,
  resolveWorkspaceTabUrl,
  writePersistedEditorWorkspace,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "@/lib/editor-workspace";
import { useGraphDocumentStore } from "@/stores/graphDocument";
import type { AgentNode, ConditionNode, GraphDocument, GraphPayload, GraphPosition, InputNode, OutputNode, StateDefinition, TemplateRecord } from "@/types/node-system";

import EditorCloseConfirmDialog from "./EditorCloseConfirmDialog.vue";
import EditorStatePanel from "./EditorStatePanel.vue";
import EditorTabBar from "./EditorTabBar.vue";
import EditorWelcomeState from "./EditorWelcomeState.vue";
import { addStateBindingToDocument, removeStateBindingFromDocument } from "./statePanelBindings.ts";
import { addStateFieldToDocument, deleteStateFieldFromDocument, renameStateFieldInDocument, updateStateFieldInDocument } from "./statePanelFields.ts";

const props = defineProps<{
  routeMode: "root" | "new" | "existing";
  routeGraphId?: string | null;
  defaultTemplateId?: string | null;
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
const closeBusy = ref(false);
const closeError = ref<string | null>(null);
const handledRouteSignature = ref<string | null>(null);
const statePanelOpenByTabId = ref<Record<string, boolean>>({});
const focusedNodeIdByTabId = ref<Record<string, string | null>>({});

const templateById = computed(() => new Map(props.templates.map((template) => [template.template_id, template])));
const graphById = computed(() => new Map(props.graphs.map((graph) => [graph.graph_id, graph])));
const activeTab = computed(() => workspace.value.tabs.find((tab) => tab.tabId === workspace.value.activeTabId) ?? null);
const pendingCloseTab = computed(() =>
  pendingCloseTabId.value ? workspace.value.tabs.find((tab) => tab.tabId === pendingCloseTabId.value) ?? null : null,
);
const activeTabTitle = computed(() => activeTab.value?.title ?? "Untitled Graph");
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
const routeSignature = computed(() => {
  if (props.routeMode === "existing") {
    return `existing:${props.routeGraphId ?? ""}`;
  }
  if (props.routeMode === "new") {
    return `new:${props.defaultTemplateId ?? ""}`;
  }
  return "root";
});

function applyCurrentRouteInstruction() {
  const instruction = resolveEditorRouteInstruction({
    routeMode: props.routeMode,
    routeGraphId: props.routeGraphId ?? null,
    defaultTemplateId: props.defaultTemplateId ?? null,
    routeSignature: routeSignature.value,
    handledRouteSignature: handledRouteSignature.value,
  });

  if (instruction.type === "open-new") {
    openNewTab(instruction.templateId, instruction.navigation);
    return;
  }

  if (instruction.type === "open-existing") {
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
  documentsByTabId.value = {
    ...documentsByTabId.value,
    [tabId]: graph,
  };
  loadingByTabId.value = {
    ...loadingByTabId.value,
    [tabId]: false,
  };
  errorByTabId.value = {
    ...errorByTabId.value,
    [tabId]: null,
  };
}

function clearTabRuntime(tabId: string) {
  const nextDocuments = { ...documentsByTabId.value };
  const nextLoading = { ...loadingByTabId.value };
  const nextErrors = { ...errorByTabId.value };
  delete nextDocuments[tabId];
  delete nextLoading[tabId];
  delete nextErrors[tabId];
  const nextPanels = { ...statePanelOpenByTabId.value };
  delete nextPanels[tabId];
  const nextFocusedNodes = { ...focusedNodeIdByTabId.value };
  delete nextFocusedNodes[tabId];
  documentsByTabId.value = nextDocuments;
  loadingByTabId.value = nextLoading;
  errorByTabId.value = nextErrors;
  statePanelOpenByTabId.value = nextPanels;
  focusedNodeIdByTabId.value = nextFocusedNodes;
}

function createDraftForTab(tab: EditorWorkspaceTab): GraphPayload {
  if (tab.templateId) {
    const template = templateById.value.get(tab.templateId);
    if (template) {
      const draft = createDraftFromTemplate(template);
      draft.name = tab.title;
      return draft;
    }
  }
  return createEmptyDraftGraph(tab.title);
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
  const tab = createUnsavedWorkspaceTab({
    kind: template ? "template" : "new",
    title: template?.label ?? "Untitled Graph",
    templateId: template?.template_id ?? null,
    defaultTemplateId: template?.template_id ?? null,
  });

  registerDocumentForTab(tab.tabId, template ? createDraftFromTemplate(template) : createEmptyDraftGraph(tab.title));
  updateWorkspace({
    activeTabId: tab.tabId,
    tabs: [...workspace.value.tabs, tab],
  });

  if (navigation !== "none") {
    syncRouteToTab(tab, navigation === "replace" ? "replace" : "push");
  }
  handledRouteSignature.value = templateId ? `new:${templateId}` : "new:";
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
  documentsByTabId.value = {
    ...documentsByTabId.value,
    [tabId]: nextDocument,
  };
}

function isStatePanelOpen(tabId: string) {
  return statePanelOpenByTabId.value[tabId] ?? false;
}

function toggleStatePanel(tabId: string) {
  statePanelOpenByTabId.value = {
    ...statePanelOpenByTabId.value,
    [tabId]: !isStatePanelOpen(tabId),
  };
}

function focusNodeForTab(tabId: string, nodeId: string | null) {
  focusedNodeIdByTabId.value = {
    ...focusedNodeIdByTabId.value,
    [tabId]: nodeId,
  };
}

function toggleActiveStatePanel() {
  if (!activeTab.value) {
    return;
  }
  toggleStatePanel(activeTab.value.tabId);
}

function editorGridStyle(tabId: string) {
  return {
    gridTemplateColumns: isStatePanelOpen(tabId) ? "minmax(0, 1fr) 380px" : "minmax(0,1fr) 56px",
  };
}

function handleNodePositionUpdate(tabId: string, payload: { nodeId: string; position: GraphPosition }) {
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

  const response = await saveGraph(document);
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
  return response.saved;
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
  const response = await validateGraph(document);
  window.alert(response.valid ? "校验通过。" : `校验失败：${response.issues.map((issue) => issue.message).join("\n")}`);
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
  const response = await runGraph(document);
  window.alert(`已触发运行：${response.run_id}`);
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
  updateWorkspace(readPersistedEditorWorkspace());
  hydrated.value = true;
  ensureUnsavedTabDocuments();
  applyCurrentRouteInstruction();
});
</script>

<style scoped>
.editor-workspace-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  background: radial-gradient(circle at top, rgba(154, 52, 18, 0.1), transparent 22%),
    linear-gradient(180deg, #f5efe2 0%, #ede4d2 100%);
}

.editor-workspace-shell__welcome {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow: auto;
}

.editor-workspace-shell__chrome {
  padding: 16px 16px 12px;
}

.editor-workspace-shell__body {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 0 16px 16px;
}

.editor-workspace-shell__editor {
  position: absolute;
  inset: 0;
  visibility: hidden;
  pointer-events: none;
  opacity: 0;
}

.editor-workspace-shell__editor--active {
  visibility: visible;
  pointer-events: auto;
  opacity: 1;
}

.editor-workspace-shell__editor-grid {
  display: grid;
  height: 100%;
  min-height: 0;
  transition: grid-template-columns 220ms ease;
}

.editor-workspace-shell__editor-main {
  min-width: 0;
  min-height: 0;
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
</style>
