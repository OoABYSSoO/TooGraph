import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { CanvasViewport } from "@/editor/canvas/canvasViewport";
import type { PersistedEditorWorkspace } from "@/lib/editor-workspace";
import type { GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import type { RunActivityState } from "./runActivityModel.ts";
import type { RunNodeTimingByNodeId } from "./runNodeTimingModel.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";
import { useWorkspaceTabLifecycleController } from "./useWorkspaceTabLifecycleController.ts";
import type { WorkspaceSidePanelMode } from "./workspaceSidePanelModel.ts";

function createLifecycleHarness() {
  const workspace = ref<PersistedEditorWorkspace>({
    activeTabId: "tab_a",
    tabs: [
      {
        tabId: "tab_a",
        kind: "new",
        graphId: null,
        title: "Draft A",
        dirty: false,
        templateId: null,
        defaultTemplateId: null,
      },
      {
        tabId: "tab_b",
        kind: "existing",
        graphId: "graph_b",
        title: "Graph B",
        dirty: true,
        templateId: null,
        defaultTemplateId: null,
      },
    ],
  });
  const pendingCloseTabId = ref<string | null>(null);
  const closeBusy = ref(false);
  const closeError = ref<string | null>(null);
  const documentsByTabId = ref<Record<string, GraphPayload>>({ tab_a: {} as GraphPayload, tab_b: {} as GraphPayload });
  const loadingByTabId = ref<Record<string, boolean>>({ tab_a: false, tab_b: true });
  const errorByTabId = ref<Record<string, string | null>>({ tab_a: null, tab_b: "error" });
  const feedbackByTabId = ref<Record<string, WorkspaceRunFeedback | null>>({ tab_a: null, tab_b: null });
  const statePanelOpenByTabId = ref<Record<string, boolean>>({ tab_a: true, tab_b: true });
  const sidePanelModeByTabId = ref<Record<string, WorkspaceSidePanelMode>>({ tab_a: "state", tab_b: "human-review" });
  const focusedNodeIdByTabId = ref<Record<string, string | null>>({ tab_a: "node_a", tab_b: "node_b" });
  const focusRequestByTabId = ref<Record<string, { nodeId: string; sequence: number } | null>>({
    tab_a: { nodeId: "node_a", sequence: 1 },
    tab_b: { nodeId: "node_b", sequence: 1 },
  });
  const viewportByTabId = ref<Record<string, CanvasViewport>>({
    tab_a: { x: 1, y: 2, scale: 1 },
    tab_b: { x: 3, y: 4, scale: 2 },
  });
  const runNodeStatusByTabId = ref<Record<string, Record<string, string>>>({ tab_a: { node_a: "running" }, tab_b: {} });
  const runNodeTimingByTabId = ref<Record<string, RunNodeTimingByNodeId>>({
    tab_a: { node_a: { status: "running", startedAtMs: 1000, durationMs: null } },
    tab_b: {},
  });
  const currentRunNodeIdByTabId = ref<Record<string, string | null>>({ tab_a: "node_a", tab_b: null });
  const latestRunDetailByTabId = ref<Record<string, RunDetail | null>>({ tab_a: {} as RunDetail, tab_b: null });
  const restoredRunSnapshotIdByTabId = ref<Record<string, string | null>>({ tab_a: "snapshot_a", tab_b: null });
  const humanReviewBusyByTabId = ref<Record<string, boolean>>({ tab_a: true, tab_b: false });
  const humanReviewErrorByTabId = ref<Record<string, string | null>>({ tab_a: "busy", tab_b: null });
  const runOutputPreviewByTabId = ref<Record<string, Record<string, { text: string; displayMode: string | null }>>>({
    tab_a: { node_a: { text: "stream", displayMode: null } },
    tab_b: {},
  });
  const runFailureMessageByTabId = ref<Record<string, Record<string, string>>>({ tab_a: { node_a: "failed" }, tab_b: {} });
  const activeRunEdgeIdsByTabId = ref<Record<string, string[]>>({ tab_a: ["edge_a"], tab_b: [] });
  const subgraphRunStatusByTabId = ref<Record<string, Record<string, Record<string, string>>>>({
    tab_a: { subgraph_a: { inner_a: "running" } },
    tab_b: {},
  });
  const runActivityByTabId = ref<Record<string, RunActivityState>>({
    tab_a: { entries: [], autoFollow: true },
    tab_b: { entries: [], autoFollow: true },
  });
  const cancelledPolling: string[] = [];
  const cancelledStreams: string[] = [];
  const syncedRoutes: string[] = [];
  const removedDocumentDrafts: string[] = [];
  const removedViewportDrafts: string[] = [];

  const controller = useWorkspaceTabLifecycleController({
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
    cancelRunPolling: (tabId) => {
      cancelledPolling.push(tabId);
    },
    cancelRunEventStreamForTab: (tabId) => {
      cancelledStreams.push(tabId);
    },
    updateWorkspace: (nextWorkspace) => {
      workspace.value = nextWorkspace;
    },
    writeWorkspace: () => {},
    removeDocumentDraft: (tabId) => {
      removedDocumentDrafts.push(tabId);
    },
    removeViewportDraft: (tabId) => {
      removedViewportDrafts.push(tabId);
    },
    syncRouteToTab: (tab) => {
      syncedRoutes.push(tab.graphId ?? tab.kind);
    },
    syncRouteToUrl: (url) => {
      syncedRoutes.push(url);
    },
    saveTab: async () => true,
    closeSaveFailedMessage: () => "Save failed",
  });

  return {
    workspace,
    pendingCloseTabId,
    closeBusy,
    closeError,
    records: {
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
    },
    cancelledPolling,
    cancelledStreams,
    syncedRoutes,
    removedDocumentDrafts,
    removedViewportDrafts,
    controller,
  };
}

test("useWorkspaceTabLifecycleController clears all tab-scoped runtime records", () => {
  const harness = createLifecycleHarness();

  harness.controller.clearTabRuntime("tab_a");

  assert.deepEqual(harness.cancelledPolling, ["tab_a"]);
  assert.deepEqual(harness.cancelledStreams, ["tab_a"]);
  for (const recordRef of Object.values(harness.records)) {
    assert.equal("tab_a" in recordRef.value, false);
    assert.equal("tab_b" in recordRef.value, true);
  }
});

test("useWorkspaceTabLifecycleController requests confirmation for dirty tabs and finalizes clean tabs", () => {
  const harness = createLifecycleHarness();

  harness.controller.requestCloseTab("tab_b");
  assert.equal(harness.pendingCloseTabId.value, "tab_b");
  assert.deepEqual(harness.removedDocumentDrafts, []);

  harness.controller.requestCloseTab("tab_a");
  assert.equal(harness.workspace.value.tabs.some((tab) => tab.tabId === "tab_a"), false);
  assert.deepEqual(harness.removedDocumentDrafts, ["tab_a"]);
  assert.deepEqual(harness.removedViewportDrafts, ["tab_a"]);
  assert.deepEqual(harness.cancelledPolling, ["tab_a"]);
  assert.deepEqual(harness.cancelledStreams, ["tab_a"]);
  assert.deepEqual(harness.syncedRoutes, ["/editor/graph_b"]);
});
