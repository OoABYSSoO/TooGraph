import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { EditorWorkspaceTab } from "@/lib/editor-workspace";
import type { GraphPayload, GraphRunResponse } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import type { RunActivityState } from "./runActivityModel.ts";
import { useWorkspaceRunController } from "./useWorkspaceRunController.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

function graphDocument(name: string, nodeIds: string[] = ["node_a"]): GraphPayload {
  return {
    graph_id: null,
    name,
    nodes: Object.fromEntries(
      nodeIds.map((nodeId) => [
        nodeId,
        {
          id: nodeId,
          kind: "agent",
          name: nodeId,
          description: "",
          config: {},
          ui: { position: { x: 0, y: 0 } },
        },
      ]),
    ),
    edges: [],
    conditional_edges: [],
    state_schema: {},
    metadata: {},
    version: 1,
  } as unknown as GraphPayload;
}

function createRunHarness() {
  const activeTab = ref<EditorWorkspaceTab | null>({
    tabId: "tab_a",
    kind: "new",
    graphId: null,
    title: "Draft",
    dirty: false,
    templateId: null,
    defaultTemplateId: null,
  });
  const documentsByTabId = ref<Record<string, GraphPayload>>({
    tab_a: graphDocument("Before", ["old_node"]),
  });
  const latestRunDetailByTabId = ref<Record<string, RunDetail | null>>({});
  const restoredRunSnapshotIdByTabId = ref<Record<string, string | null>>({ tab_a: "snapshot_a" });
  const humanReviewBusyByTabId = ref<Record<string, boolean>>({});
  const humanReviewErrorByTabId = ref<Record<string, string | null>>({});
  const runNodeStatusByTabId = ref<Record<string, Record<string, string>>>({ tab_a: { old_node: "success" } });
  const currentRunNodeIdByTabId = ref<Record<string, string | null>>({ tab_a: "old_node" });
  const runOutputPreviewByTabId = ref<Record<string, Record<string, { text: string; displayMode: string | null }>>>({
    tab_a: { old_node: { text: "old", displayMode: null } },
  });
  const runFailureMessageByTabId = ref<Record<string, Record<string, string>>>({ tab_a: { old_node: "old failed" } });
  const activeRunEdgeIdsByTabId = ref<Record<string, string[]>>({ tab_a: ["old_edge"] });
  const runActivityByTabId = ref<Record<string, RunActivityState>>({
    tab_a: {
      entries: [
        {
          id: "old-entry",
          kind: "state-updated",
          nodeId: "old_node",
          nodeType: null,
          stateKey: "answer",
          title: "answer",
          preview: "old",
          detail: {},
          createdAt: "",
          sequence: 1,
          active: true,
        },
      ],
      autoFollow: true,
    },
  });
  const feedbackByTabId = ref<Record<string, WorkspaceRunFeedback | null>>({});
  const runGraphDocuments: GraphPayload[] = [];
  const resumedRuns: Array<{ runId: string; payload: Record<string, unknown>; snapshotId: string | null }> = [];
  const cancelledPolling: string[] = [];
  const streams: Array<{ tabId: string; runId: string }> = [];
  const polls: Array<{ tabId: string; runId: string; generation: number }> = [];
  const runActivityHints: string[] = [];
  let generation = 7;

  const controller = useWorkspaceRunController({
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
    refreshAgentModels: async () => {
      documentsByTabId.value = {
        tab_a: graphDocument("After", ["new_node", "output_node"]),
      };
    },
    runGraph: async (document) => {
      runGraphDocuments.push(document);
      return { run_id: "run_started", status: "queued" } satisfies GraphRunResponse;
    },
    resumeRun: async (runId, payload, snapshotId) => {
      resumedRuns.push({ runId, payload, snapshotId });
      return { run_id: "run_resumed", status: "queued" } satisfies GraphRunResponse;
    },
    cancelRunPolling: (tabId) => {
      cancelledPolling.push(tabId);
      generation += 1;
    },
    getRunGeneration: () => generation,
    startRunEventStreamForTab: (tabId, runId) => {
      streams.push({ tabId, runId });
    },
    pollRunForTab: (tabId, runId, nextGeneration) => {
      polls.push({ tabId, runId, generation: nextGeneration });
    },
    markRunActivityPanelHintForTab: (tabId) => {
      runActivityHints.push(tabId);
    },
    setFeedbackForTab: (tabId, feedback) => {
      feedbackByTabId.value = { ...feedbackByTabId.value, [tabId]: feedback };
    },
    setMessageFeedbackForTab: (tabId, feedback) => {
      feedbackByTabId.value = {
        ...feedbackByTabId.value,
        [tabId]: {
          tone: feedback.tone,
          message: feedback.message,
          activeRunId: feedback.activeRunId ?? null,
          activeRunStatus: feedback.activeRunStatus ?? null,
          summary: { idle: 0, running: 0, paused: 0, success: 0, failed: 0 },
          currentNodeLabel: null,
        },
      };
    },
    translate: (key, params) => `${key}:${params?.runId ?? ""}`,
  });

  return {
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
    feedbackByTabId,
    runGraphDocuments,
    resumedRuns,
    cancelledPolling,
    streams,
    polls,
    runActivityHints,
    controller,
  };
}

test("useWorkspaceRunController runs the latest document after model refresh and resets run visuals", async () => {
  const harness = createRunHarness();

  await harness.controller.runActiveGraph();

  assert.equal(harness.runGraphDocuments[0]?.name, "After");
  assert.deepEqual(harness.cancelledPolling, ["tab_a"]);
  assert.deepEqual(harness.runNodeStatusByTabId.value.tab_a, {});
  assert.equal(harness.currentRunNodeIdByTabId.value.tab_a, null);
  assert.deepEqual(harness.runOutputPreviewByTabId.value.tab_a, {});
  assert.deepEqual(harness.runFailureMessageByTabId.value.tab_a, {});
  assert.deepEqual(harness.activeRunEdgeIdsByTabId.value.tab_a, []);
  assert.deepEqual(harness.runActivityByTabId.value.tab_a, { entries: [], autoFollow: true });
  assert.equal(harness.latestRunDetailByTabId.value.tab_a, null);
  assert.equal(harness.humanReviewErrorByTabId.value.tab_a, null);
  assert.equal(harness.feedbackByTabId.value.tab_a?.activeRunId, "run_started");
  assert.equal(harness.feedbackByTabId.value.tab_a?.summary.idle, 2);
  assert.deepEqual(harness.runActivityHints, ["tab_a"]);
  assert.deepEqual(harness.streams, [{ tabId: "tab_a", runId: "run_started" }]);
  assert.deepEqual(harness.polls, [{ tabId: "tab_a", runId: "run_started", generation: 8 }]);
});

test("useWorkspaceRunController resumes Human Review runs with the restored snapshot", async () => {
  const harness = createRunHarness();
  harness.latestRunDetailByTabId.value = {
    tab_a: {
      run_id: "run_paused",
      status: "awaiting_human",
    } as RunDetail,
  };

  await harness.controller.resumeHumanReviewRun("tab_a", { answer: "approved" });

  assert.deepEqual(harness.resumedRuns, [{ runId: "run_paused", payload: { answer: "approved" }, snapshotId: "snapshot_a" }]);
  assert.deepEqual(harness.latestRunDetailByTabId.value.tab_a, {
    run_id: "run_resumed",
    status: "queued",
  });
  assert.equal(harness.restoredRunSnapshotIdByTabId.value.tab_a, null);
  assert.equal(harness.humanReviewBusyByTabId.value.tab_a, false);
  assert.equal(harness.humanReviewErrorByTabId.value.tab_a, null);
  assert.equal(harness.feedbackByTabId.value.tab_a?.activeRunId, "run_resumed");
  assert.deepEqual(harness.runActivityHints, ["tab_a"]);
  assert.deepEqual(harness.streams, [{ tabId: "tab_a", runId: "run_resumed" }]);
  assert.deepEqual(harness.polls, [{ tabId: "tab_a", runId: "run_resumed", generation: 8 }]);
});
