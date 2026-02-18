import assert from "node:assert/strict";
import test from "node:test";

import type { RunSummary } from "../types/run.ts";

import {
  RUN_STATUS_FILTER_OPTIONS,
  buildRunRestoreTargets,
  buildRunStatusOverview,
  resolveRunsCardDetail,
  resolveRunsEmptyAction,
} from "./runsPageModel.ts";

test("resolveRunsEmptyAction points empty runs state back to the editor entry", () => {
  assert.deepEqual(resolveRunsEmptyAction(), {
    href: "/editor",
    label: "打开编排器",
  });
});

test("resolveRunsCardDetail keeps list cards on the legacy detail affordance", () => {
  assert.equal(resolveRunsCardDetail(), "查看详情");
});

test("RUN_STATUS_FILTER_OPTIONS exposes high frequency status filters in display order", () => {
  assert.deepEqual(
    RUN_STATUS_FILTER_OPTIONS.map((option) => option.value),
    ["", "queued", "running", "resuming", "awaiting_human", "completed", "failed"],
  );
  assert.equal(RUN_STATUS_FILTER_OPTIONS.find((option) => option.value === "awaiting_human")?.label, "断点暂停");
});

test("buildRunStatusOverview summarizes total, attention, active, and completed runs", () => {
  const runs = [
    createRun("run_1", "queued"),
    createRun("run_2", "running"),
    createRun("run_3", "awaiting_human"),
    createRun("run_4", "failed"),
    createRun("run_5", "completed"),
  ];

  assert.deepEqual(buildRunStatusOverview(runs), [
    { key: "total", label: "全部运行", value: 5 },
    { key: "attention", label: "需要关注", value: 2 },
    { key: "active", label: "进行中", value: 2 },
    { key: "completed", label: "已完成", value: 1 },
  ]);
});

test("buildRunRestoreTargets exposes all breakpoints with node names before final result restore choices", () => {
  assert.deepEqual(
    buildRunRestoreTargets({
      ...createRun("run_1", "completed"),
      restorable_snapshot_available: true,
      run_snapshot_options: [
        {
          snapshot_id: "completed_1",
          kind: "completed",
          label: "Completed",
          status: "completed",
          current_node_id: null,
        },
        {
          snapshot_id: "pause_1",
          kind: "pause",
          label: "Paused at draft_writer",
          status: "awaiting_human",
          current_node_id: "draft_writer",
        },
        {
          snapshot_id: "pause_2",
          kind: "pause",
          label: "Paused at reviewer",
          status: "awaiting_human",
          current_node_id: "reviewer",
        },
      ],
    }),
    [
      {
        key: "pause_2",
        label: "断点 · reviewer",
        detail: "reviewer",
        snapshotId: "pause_2",
      },
      {
        key: "pause_1",
        label: "断点 · draft_writer",
        detail: "draft_writer",
        snapshotId: "pause_1",
      },
      {
        key: "completed_1",
        label: "最终结果",
        detail: "completed",
        snapshotId: "completed_1",
      },
    ],
  );
});

test("buildRunRestoreTargets falls back to the current run when no explicit terminal snapshot exists", () => {
  assert.deepEqual(
    buildRunRestoreTargets({
      ...createRun("run_1", "completed"),
      restorable_snapshot_available: true,
      run_snapshot_options: [],
    }),
    [
      {
        key: "current",
        label: "最终结果",
        detail: "completed",
        snapshotId: null,
      },
    ],
  );
});

function createRun(runId: string, status: string): RunSummary {
  return {
    run_id: runId,
    graph_id: "graph_1",
    graph_name: "Graph",
    status,
    runtime_backend: "langgraph",
    lifecycle: {
      updated_at: "2026-04-18T00:00:00Z",
      resume_count: 0,
    },
    checkpoint_metadata: {
      available: false,
    },
    revision_round: 0,
    started_at: "2026-04-18T00:00:00Z",
  };
}
