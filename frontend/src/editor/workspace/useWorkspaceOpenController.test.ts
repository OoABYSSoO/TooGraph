import assert from "node:assert/strict";
import test from "node:test";
import { computed, ref } from "vue";

import type { PersistedEditorWorkspace } from "@/lib/editor-workspace";
import type { GraphDocument, GraphPayload, TemplateRecord } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import { useWorkspaceOpenController } from "./useWorkspaceOpenController.ts";

function createGraph(graphId = "graph_a", name = "Saved Graph"): GraphDocument {
  return {
    graph_id: graphId,
    name,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function createTemplate(templateId = "template_a", name = "Template Graph"): TemplateRecord {
  return {
    template_id: templateId,
    label: "Template",
    description: "",
    default_graph_name: name,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function createRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run_1",
    graph_id: "graph_a",
    graph_name: "Saved Graph",
    status: "awaiting_human",
    restorable_snapshot_available: true,
    runtime_backend: "langgraph",
    lifecycle: { updated_at: "", resume_count: 0 },
    checkpoint_metadata: { available: false },
    current_node_id: "agent_review",
    revision_round: 1,
    started_at: "",
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    memory_summary: "",
    final_result: "",
    node_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: { outputs: [], state_events: [] },
    state_snapshot: { values: {}, last_writers: {} },
    graph_snapshot: createGraph(),
    run_snapshots: [],
    ...overrides,
  } as RunDetail;
}

function createHarness(options: { templates?: TemplateRecord[]; graphs?: GraphDocument[]; documentDrafts?: Record<string, GraphPayload | GraphDocument> } = {}) {
  const workspace = ref<PersistedEditorWorkspace>({ activeTabId: null, tabs: [] });
  const documentsByTabId = ref<Record<string, GraphPayload | GraphDocument>>({});
  const loadingByTabId = ref<Record<string, boolean>>({});
  const errorByTabId = ref<Record<string, string | null>>({});
  const restoredRunSnapshotIdByTabId = ref<Record<string, string | null>>({});
  const routeRestoreError = ref<string | null>(null);
  const handledRouteSignature = ref<string | null>(null);
  const routeSignature = ref("restore:run_1:");
  const templates = ref(options.templates ?? [createTemplate()]);
  const graphs = ref(options.graphs ?? [createGraph()]);
  const documentDrafts = options.documentDrafts ?? {};
  const routeSyncs: Array<{ mode: "push" | "replace"; tab: { graphId: string | null; kind: string; templateId: string | null } }> = [];
  const visualStates: Array<{ tabId: string; status: string; documentName: string | undefined }> = [];
  const openedHumanReview: Array<{ tabId: string; nodeId: string | null }> = [];
  const fetchedGraphIds: string[] = [];

  const controller = useWorkspaceOpenController({
    workspace,
    documentsByTabId,
    loadingByTabId,
    errorByTabId,
    restoredRunSnapshotIdByTabId,
    routeRestoreError,
    handledRouteSignature,
    routeSignature,
    templates: () => templates.value,
    graphById: computed(() => new Map(graphs.value.map((graph) => [graph.graph_id, graph]))),
    updateWorkspace: (nextWorkspace) => {
      workspace.value = nextWorkspace;
    },
    registerDocumentForTab: (tabId, graph) => {
      documentsByTabId.value = { ...documentsByTabId.value, [tabId]: graph };
      loadingByTabId.value = { ...loadingByTabId.value, [tabId]: false };
      errorByTabId.value = { ...errorByTabId.value, [tabId]: null };
    },
    readDocumentDraft: (tabId) => documentDrafts[tabId] ?? null,
    fetchGraph: async (graphId) => {
      fetchedGraphIds.push(graphId);
      return createGraph(graphId, "Fetched Graph");
    },
    fetchRun: async () => createRunDetail(),
    applyRunVisualStateToTab: (tabId, run, document) => {
      visualStates.push({ tabId, status: run.status, documentName: document?.name });
    },
    openHumanReviewPanelForTab: (tabId, nodeId) => {
      openedHumanReview.push({ tabId, nodeId });
    },
    syncRouteToTab: (tab, mode) => {
      routeSyncs.push({ mode: mode ?? "push", tab });
    },
  });

  return {
    controller,
    documentsByTabId,
    errorByTabId,
    fetchedGraphIds,
    handledRouteSignature,
    loadingByTabId,
    openedHumanReview,
    restoredRunSnapshotIdByTabId,
    routeRestoreError,
    routeSyncs,
    visualStates,
    workspace,
  };
}

test("useWorkspaceOpenController opens new template tabs and syncs the route", () => {
  const harness = createHarness();

  harness.controller.openNewTab("template_a", "push");

  const tab = harness.workspace.value.tabs[0];
  assert.ok(tab);
  assert.equal(harness.workspace.value.activeTabId, tab.tabId);
  assert.equal(tab.kind, "template");
  assert.equal(tab.templateId, "template_a");
  assert.equal(tab.title, "Template");
  assert.equal(harness.documentsByTabId.value[tab.tabId]?.name, "Template Graph");
  assert.equal(harness.routeSyncs[0]?.mode, "push");
  assert.equal(harness.routeSyncs[0]?.tab.templateId, "template_a");
  assert.equal(harness.handledRouteSignature.value, "new:template_a");
});

test("useWorkspaceOpenController opens cached existing graphs without fetching", () => {
  const graph = createGraph("graph_cached", "Cached Graph");
  const harness = createHarness({ graphs: [graph] });

  harness.controller.openExistingGraph("graph_cached", "push");

  const tab = harness.workspace.value.tabs[0];
  assert.ok(tab);
  assert.equal(tab.graphId, "graph_cached");
  assert.equal(tab.title, "Cached Graph");
  assert.equal(harness.documentsByTabId.value[tab.tabId]?.name, "Cached Graph");
  assert.notEqual(harness.documentsByTabId.value[tab.tabId], graph);
  assert.deepEqual(harness.fetchedGraphIds, []);
  assert.equal(harness.routeSyncs[0]?.mode, "push");
  assert.equal(harness.handledRouteSignature.value, "existing:graph_cached");
});

test("useWorkspaceOpenController prefers persisted drafts when loading existing graph tabs", async () => {
  const draft = createGraph("graph_draft", "Persisted Draft");
  const harness = createHarness({ documentDrafts: { tab_existing: draft } });

  await harness.controller.loadExistingGraphIntoTab("tab_existing", "graph_saved");

  assert.equal(harness.documentsByTabId.value.tab_existing?.name, "Persisted Draft");
  assert.equal(harness.loadingByTabId.value.tab_existing, false);
  assert.equal(harness.errorByTabId.value.tab_existing, null);
  assert.deepEqual(harness.fetchedGraphIds, []);
});

test("useWorkspaceOpenController restores runs into dirty tabs and opens Human Review", async () => {
  const harness = createHarness();

  await harness.controller.openRestoredRunTab("run_1", null, "replace");

  const tab = harness.workspace.value.tabs[0];
  assert.ok(tab);
  assert.equal(tab.kind, "new");
  assert.equal(tab.dirty, true);
  assert.equal(harness.documentsByTabId.value[tab.tabId]?.graph_id, null);
  assert.equal(harness.restoredRunSnapshotIdByTabId.value[tab.tabId], null);
  assert.deepEqual(harness.visualStates, [{ tabId: tab.tabId, status: "awaiting_human", documentName: "Saved Graph" }]);
  assert.deepEqual(harness.openedHumanReview, [{ tabId: tab.tabId, nodeId: "agent_review" }]);
  assert.equal(harness.routeSyncs[0]?.mode, "replace");
  assert.equal(harness.handledRouteSignature.value, "restore:run_1:");
  assert.equal(harness.routeRestoreError.value, null);
});
