import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import { useWorkspaceRunVisualState, type WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

function createVisualHarness() {
  const latestRunDetailByTabId = ref<Record<string, RunDetail | null>>({});
  const runNodeStatusByTabId = ref<Record<string, Record<string, string>>>({});
  const currentRunNodeIdByTabId = ref<Record<string, string | null>>({});
  const runOutputPreviewByTabId = ref<Record<string, Record<string, { text: string; displayMode: string | null }>>>({});
  const runFailureMessageByTabId = ref<Record<string, Record<string, string>>>({});
  const activeRunEdgeIdsByTabId = ref<Record<string, string[]>>({});
  const subgraphRunStatusByTabId = ref<Record<string, Record<string, Record<string, string>>>>({});
  const feedbackByTabId = ref<Record<string, WorkspaceRunFeedback | null>>({});

  const controller = useWorkspaceRunVisualState({
    latestRunDetailByTabId,
    runNodeStatusByTabId,
    currentRunNodeIdByTabId,
    runOutputPreviewByTabId,
    runFailureMessageByTabId,
    activeRunEdgeIdsByTabId,
    subgraphRunStatusByTabId,
    feedbackByTabId,
  });

  return {
    latestRunDetailByTabId,
    runNodeStatusByTabId,
    currentRunNodeIdByTabId,
    runOutputPreviewByTabId,
    runFailureMessageByTabId,
    activeRunEdgeIdsByTabId,
    subgraphRunStatusByTabId,
    feedbackByTabId,
    controller,
  };
}

function graphDocument(): GraphPayload {
  return {
    graph_id: "graph_a",
    name: "Graph",
    nodes: {
      input_a: {
        id: "input_a",
        kind: "input",
        name: "Input A",
        description: "",
        config: {},
        ui: { position: { x: 0, y: 0 } },
      },
      agent_a: {
        id: "agent_a",
        kind: "agent",
        name: "Agent A",
        description: "",
        config: {},
        ui: { position: { x: 100, y: 0 } },
      },
    },
    edges: [],
    state_schema: {},
    version: 1,
  } as unknown as GraphPayload;
}

function runDetail(status: string = "running"): RunDetail {
  return {
    run_id: "run_a",
    status,
    current_node_id: "agent_a",
    node_status_map: {
      input_a: "success",
      agent_a: status === "failed" ? "failed" : "running",
    },
    node_executions: [
      {
        node_id: "agent_a",
        status: "failed",
        errors: ["agent failed"],
      },
    ],
    artifacts: {
      exported_outputs: [
        {
          node_id: "output_a",
          value: { ok: true },
          display_mode: "json",
        },
      ],
      active_edge_ids: ["edge_a"],
    },
    errors: status === "failed" ? ["run failed"] : [],
  } as unknown as RunDetail;
}

test("useWorkspaceRunVisualState applies run visual state without mutating unrelated tabs", () => {
  const harness = createVisualHarness();
  harness.runOutputPreviewByTabId.value = {
    tab_b: {
      output_b: { text: "keep", displayMode: null },
    },
  };

  const run = runDetail();
  harness.controller.applyRunVisualStateToTab("tab_a", run, graphDocument());

  assert.deepEqual(harness.latestRunDetailByTabId.value.tab_a, run);
  assert.deepEqual(harness.runNodeStatusByTabId.value.tab_a, run.node_status_map);
  assert.equal(harness.currentRunNodeIdByTabId.value.tab_a, "agent_a");
  assert.deepEqual(harness.activeRunEdgeIdsByTabId.value.tab_a, ["edge_a"]);
  assert.deepEqual(harness.runFailureMessageByTabId.value.tab_a, { agent_a: "agent failed" });
  assert.deepEqual(harness.runOutputPreviewByTabId.value.tab_a, {
    output_a: { text: '{\n  "ok": true\n}', displayMode: "json" },
  });
  assert.equal(harness.runOutputPreviewByTabId.value.tab_b.output_b.text, "keep");
  assert.equal(harness.feedbackByTabId.value.tab_a?.activeRunId, "run_a");
  assert.equal(harness.feedbackByTabId.value.tab_a?.activeRunStatus, "running");
});

test("useWorkspaceRunVisualState can preserve existing previews while polling active runs", () => {
  const harness = createVisualHarness();
  harness.runOutputPreviewByTabId.value = {
    tab_a: {
      live_output: { text: "streaming", displayMode: "plain" },
    },
  };

  harness.controller.applyRunVisualStateToTab("tab_a", runDetail(), graphDocument(), undefined, { preserveMissing: true });

  assert.deepEqual(harness.runOutputPreviewByTabId.value.tab_a.live_output, { text: "streaming", displayMode: "plain" });
  assert.deepEqual(harness.runOutputPreviewByTabId.value.tab_a.output_a, { text: '{\n  "ok": true\n}', displayMode: "json" });
});

test("useWorkspaceRunVisualState projects subgraph status from run detail and live events", () => {
  const harness = createVisualHarness();
  const run = runDetail("running");
  run.subgraph_status_map = {
    research_subgraph: {
      search_sources: "success",
      summarize: "running",
    },
  };

  harness.controller.applyRunVisualStateToTab("tab_a", run, graphDocument());

  assert.deepEqual(harness.subgraphRunStatusByTabId.value.tab_a, {
    research_subgraph: {
      search_sources: "success",
      summarize: "running",
    },
  });

  harness.controller.applyRunEventVisualStateToTab("tab_a", "node.completed", {
    subgraph_node_id: "research_subgraph",
    node_id: "summarize",
    status: "success",
  });

  assert.deepEqual(harness.subgraphRunStatusByTabId.value.tab_a, {
    research_subgraph: {
      search_sources: "success",
      summarize: "success",
    },
  });
});

test("useWorkspaceRunVisualState exposes direct feedback and message helpers", () => {
  const harness = createVisualHarness();

  assert.equal(harness.controller.feedbackForTab("tab_missing"), null);

  harness.controller.setMessageFeedbackForTab("tab_a", {
    tone: "warning",
    message: "Saved locally",
    activeRunId: "run_a",
  });

  assert.deepEqual(harness.controller.feedbackForTab("tab_a"), {
    tone: "warning",
    message: "Saved locally",
    activeRunId: "run_a",
    activeRunStatus: null,
    summary: {
      idle: 0,
      running: 0,
      paused: 0,
      success: 0,
      failed: 0,
    },
    currentNodeLabel: null,
  });
});
