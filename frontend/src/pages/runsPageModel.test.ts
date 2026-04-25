import assert from "node:assert/strict";
import test from "node:test";

import type { RunSummary } from "../types/run.ts";

import { RUN_STATUS_FILTER_OPTIONS, buildRunStatusOverview, resolveRunsCardDetail, resolveRunsEmptyAction } from "./runsPageModel.ts";

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
    ["", "queued", "running", "resuming", "awaiting_human", "paused", "completed", "failed"],
  );
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
