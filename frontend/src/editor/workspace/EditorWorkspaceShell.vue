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
          @activate-tab="activateTab"
          @close-tab="requestCloseTab"
          @create-new="openNewTab(null)"
          @create-from-template="openNewTab"
          @open-graph="openExistingGraph"
          @rename-active-graph="renameActiveGraph"
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
            @update:node-position="(payload) => handleNodePositionUpdate(tab.tabId, payload)"
          />
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
import { cloneGraphDocument, createDraftFromTemplate, createEmptyDraftGraph } from "@/lib/graph-document";
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
import type { GraphDocument, GraphPayload, GraphPosition, TemplateRecord } from "@/types/node-system";

import EditorCloseConfirmDialog from "./EditorCloseConfirmDialog.vue";
import EditorTabBar from "./EditorTabBar.vue";
import EditorWelcomeState from "./EditorWelcomeState.vue";

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

const templateById = computed(() => new Map(props.templates.map((template) => [template.template_id, template])));
const graphById = computed(() => new Map(props.graphs.map((graph) => [graph.graph_id, graph])));
const activeTab = computed(() => workspace.value.tabs.find((tab) => tab.tabId === workspace.value.activeTabId) ?? null);
const pendingCloseTab = computed(() =>
  pendingCloseTabId.value ? workspace.value.tabs.find((tab) => tab.tabId === pendingCloseTabId.value) ?? null : null,
);
const activeTabTitle = computed(() => activeTab.value?.title ?? "Untitled Graph");
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
  documentsByTabId.value = nextDocuments;
  loadingByTabId.value = nextLoading;
  errorByTabId.value = nextErrors;
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
