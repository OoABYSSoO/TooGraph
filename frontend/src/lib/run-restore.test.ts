import test from "node:test";
import assert from "node:assert/strict";
import { reactive } from "vue";

import type { RunDetail, RunSummary } from "@/types/run";

import {
  buildRestoredGraphFromRun,
  buildSnapshotScopedRun,
  canRestoreRunDetail,
  canRestoreRunStatus,
  canRestoreRunSummary,
  resolveRestoredRunTabTitle,
  resolveRunRestoreUrl,
  resolveRunSnapshot,
} from "./run-restore.ts";

test("canRestoreRunStatus only enables restore for terminal run states", () => {
  assert.equal(canRestoreRunStatus("completed"), true);
  assert.equal(canRestoreRunStatus("failed"), true);
  assert.equal(canRestoreRunStatus("paused"), true);
  assert.equal(canRestoreRunStatus("awaiting_human"), true);
  assert.equal(canRestoreRunStatus("running"), false);
  assert.equal(canRestoreRunStatus("queued"), false);
  assert.equal(canRestoreRunStatus("pending"), false);
});

test("resolveRunRestoreUrl routes into editor restore mode", () => {
  assert.equal(resolveRunRestoreUrl("run_123"), "/editor/new?restoreRun=run_123");
  assert.equal(resolveRunRestoreUrl("run_123", "pause_1"), "/editor/new?restoreRun=run_123&snapshot=pause_1");
});

test("canRestoreRunSummary follows the summary status gate", () => {
  const run = {
    run_id: "run_123",
    status: "completed",
    restorable_snapshot_available: true,
  } as RunSummary;

  assert.equal(canRestoreRunSummary(run), true);
});

test("canRestoreRunSummary rejects runs without a restorable snapshot flag", () => {
  const run = {
    run_id: "run_123",
    status: "completed",
    restorable_snapshot_available: false,
  } as RunSummary;

  assert.equal(canRestoreRunSummary(run), false);
});

test("canRestoreRunDetail requires both a restorable status and graph snapshot", () => {
  const completedRun = createRunDetail();
  const runningRun = createRunDetail({ status: "running" });
  const missingSnapshotRun = createRunDetail({ graph_snapshot: null as unknown as Record<string, unknown> });
  const malformedSnapshotRun = createRunDetail({ graph_snapshot: {} });

  assert.equal(canRestoreRunDetail(completedRun), true);
  assert.equal(canRestoreRunDetail(runningRun), false);
  assert.equal(canRestoreRunDetail(missingSnapshotRun), false);
  assert.equal(canRestoreRunDetail(malformedSnapshotRun), false);
});

test("buildRestoredGraphFromRun clones the graph snapshot and hydrates state values from the run snapshot", () => {
  const run = createRunDetail({
    graph_name: "复盘图",
    graph_snapshot: {
      graph_id: "graph_1",
      name: "原图",
      metadata: {},
      state_schema: {
        answer: {
          name: "Answer",
          description: "",
          type: "text",
          value: "old",
          color: "#d97706",
        },
      },
      nodes: {},
      edges: [],
      conditional_edges: [],
    },
    state_snapshot: {
      values: {
        answer: "new",
      },
      last_writers: {},
    },
  });

  const restored = buildRestoredGraphFromRun(run);

  assert.equal(restored.graph_id, null);
  assert.equal(restored.name, "复盘图");
  assert.equal(restored.state_schema.answer?.value, "new");
});

test("resolveRunSnapshot defaults to the latest pause snapshot for awaiting-human runs", () => {
  const run = createRunDetail({
    status: "awaiting_human",
    run_snapshots: [
      createRunSnapshot("pause_1", "pause", "awaiting_human", {
        values: {
          answer: "draft",
        },
      }),
      createRunSnapshot("pause_2", "pause", "awaiting_human", {
        values: {
          answer: "final draft",
        },
      }),
    ],
  });

  assert.equal(resolveRunSnapshot(run)?.snapshot_id, "pause_2");
});

test("buildSnapshotScopedRun projects the selected snapshot into the run detail view", () => {
  const run = createRunDetail({
    status: "completed",
    current_node_id: null,
    final_result: "complete",
    output_previews: [
      {
        node_id: "output",
        source_kind: "state",
        source_key: "answer",
        display_mode: "text",
        persist_enabled: false,
        persist_format: "txt",
        value: "complete",
      },
    ],
    run_snapshots: [
      createRunSnapshot("pause_1", "pause", "awaiting_human", {
        current_node_id: "writer",
        values: {
          answer: "draft",
        },
        final_result: "draft",
      }),
      createRunSnapshot("completed_1", "completed", "completed", {
        current_node_id: null,
        values: {
          answer: "complete",
        },
        final_result: "complete",
      }),
    ],
  });

  const scoped = buildSnapshotScopedRun(run, "pause_1");

  assert.equal(scoped.status, "awaiting_human");
  assert.equal(scoped.current_node_id, "writer");
  assert.equal(scoped.state_snapshot.values.answer, "draft");
  assert.equal(scoped.final_result, "draft");
});

test("buildSnapshotScopedRun accepts Vue reactive run snapshots", () => {
  const run = reactive(
    createRunDetail({
      status: "awaiting_human",
      run_snapshots: [
        createRunSnapshot("pause_1", "pause", "awaiting_human", {
          current_node_id: "writer",
          values: {
            answer: "draft",
          },
          final_result: "draft",
        }),
      ],
    }),
  ) as RunDetail;

  const scoped = buildSnapshotScopedRun(run, "pause_1");

  assert.equal(scoped.status, "awaiting_human");
  assert.equal(scoped.current_node_id, "writer");
  assert.equal(scoped.state_snapshot.values.answer, "draft");
  assert.equal(scoped.final_result, "draft");
});

test("buildSnapshotScopedRun projects snapshot checkpoint metadata into the restored run context", () => {
  const run = createRunDetail({
    status: "completed",
    checkpoint_metadata: {
      available: true,
      checkpoint_id: "checkpoint-final",
      thread_id: "run_1",
      checkpoint_ns: "",
      saver: "json_checkpoint_saver",
    },
    run_snapshots: [
      {
        ...createRunSnapshot("pause_1", "pause", "awaiting_human", {
          current_node_id: "writer",
          values: {
            answer: "draft",
          },
        }),
        checkpoint_metadata: {
          available: true,
          checkpoint_id: "checkpoint-pause",
          thread_id: "run_1",
          checkpoint_ns: "",
          saver: "json_checkpoint_saver",
        },
      },
    ],
  });

  const scoped = buildSnapshotScopedRun(run, "pause_1");

  assert.equal(scoped.checkpoint_metadata.checkpoint_id, "checkpoint-pause");
});

test("buildRestoredGraphFromRun restores from the explicitly selected snapshot", () => {
  const run = createRunDetail({
    graph_snapshot: {
      graph_id: "graph_1",
      name: "原图",
      metadata: {},
      state_schema: {
        answer: {
          name: "Answer",
          description: "",
          type: "text",
          value: "old",
          color: "#d97706",
        },
      },
      nodes: {},
      edges: [],
      conditional_edges: [],
    },
    run_snapshots: [
      createRunSnapshot("pause_1", "pause", "awaiting_human", {
        values: {
          answer: "draft",
        },
      }),
      createRunSnapshot("completed_1", "completed", "completed", {
        values: {
          answer: "final",
        },
      }),
    ],
  });

  const restored = buildRestoredGraphFromRun(run, "pause_1");

  assert.equal(restored.state_schema.answer?.value, "draft");
});

test("resolveRestoredRunTabTitle keeps graph name and short run identifier together", () => {
  assert.equal(resolveRestoredRunTabTitle(createRunDetail({ graph_name: "知识库验证", run_id: "run_abcdef123456" })), "知识库验证 · run abcdef12");
});

test("buildRestoredGraphFromRun rejects malformed graph snapshots", () => {
  assert.throws(
    () =>
      buildRestoredGraphFromRun(
        createRunDetail({
          graph_snapshot: {},
          state_snapshot: {
            values: {
              request: "hello",
            },
            last_writers: {},
          },
        }),
      ),
    /does not contain a restorable graph snapshot/,
  );
});

function createRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run_1",
    graph_id: "graph_1",
    graph_name: "Hello World",
    status: "completed",
    restorable_snapshot_available: true,
    runtime_backend: "langgraph",
    lifecycle: {
      updated_at: "2026-04-24T00:00:00Z",
      resume_count: 0,
    },
    checkpoint_metadata: {
      available: false,
    },
    revision_round: 0,
    started_at: "2026-04-24T00:00:00Z",
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    knowledge_summary: "",
    memory_summary: "",
    final_result: "",
    node_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: {
      skill_outputs: [],
      output_previews: [],
      saved_outputs: [],
      exported_outputs: [],
      node_outputs: {},
      active_edge_ids: [],
      state_events: [],
      state_values: {},
      cycle_iterations: [],
      cycle_summary: {
        has_cycle: false,
        back_edges: [],
        iteration_count: 0,
        max_iterations: 0,
        stop_reason: null,
      },
    },
    state_snapshot: {
      values: {},
      last_writers: {},
    },
    graph_snapshot: {
      graph_id: "graph_1",
      name: "Hello World",
      metadata: {},
      state_schema: {},
      nodes: {},
      edges: [],
      conditional_edges: [],
    },
    cycle_summary: {
      has_cycle: false,
      back_edges: [],
      iteration_count: 0,
      max_iterations: 0,
      stop_reason: null,
    },
    run_snapshots: [],
    ...overrides,
  };
}

function createRunSnapshot(
  snapshotId: string,
  kind: string,
  status: string,
  overrides: {
    current_node_id?: string | null;
    values?: Record<string, unknown>;
    final_result?: string;
  } = {},
) {
  return {
    snapshot_id: snapshotId,
    kind,
    label: snapshotId,
    created_at: "2026-04-24T00:00:00Z",
    status,
    current_node_id: overrides.current_node_id ?? null,
    state_snapshot: {
      values: overrides.values ?? {},
      last_writers: {},
    },
    graph_snapshot: {
      graph_id: "graph_1",
      name: "Hello World",
      metadata: {},
      state_schema: {
        answer: {
          name: "Answer",
          description: "",
          type: "text",
          value: "",
          color: "#d97706",
        },
      },
      nodes: {},
      edges: [],
      conditional_edges: [],
    },
    artifacts: {
      skill_outputs: [],
      output_previews: [],
      saved_outputs: [],
      exported_outputs: [],
      node_outputs: {},
      active_edge_ids: [],
      state_events: [],
      state_values: {},
      cycle_iterations: [],
      cycle_summary: {
        has_cycle: false,
        back_edges: [],
        iteration_count: 0,
        max_iterations: 0,
        stop_reason: null,
      },
    },
    node_status_map: {},
    output_previews: [],
    final_result: overrides.final_result ?? "",
  };
}
