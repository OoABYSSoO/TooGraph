import assert from "node:assert/strict";
import test from "node:test";

import type { NodeSystemRunDetail } from "./node-system-schema.ts";
import {
  buildCycleVisualization,
  describeCycleStopReason,
  formatCycleStopReason,
} from "./run-cycle-visualization.ts";

function createRunDetail(overrides: Partial<NodeSystemRunDetail> = {}): NodeSystemRunDetail {
  return {
    run_id: "run_1",
    graph_id: "graph_1",
    graph_name: "Hello World",
    status: "completed",
    revision_round: 0,
    started_at: "2026-04-17T00:00:00Z",
    node_executions: [],
    artifacts: {},
    ...overrides,
  };
}

test("buildCycleVisualization prefers top-level cycle summary and normalizes iteration arrays", () => {
  const visualization = buildCycleVisualization(
    createRunDetail({
      cycle_summary: {
        has_cycle: true,
        iteration_count: 2,
        max_iterations: 12,
        stop_reason: "completed",
        back_edges: ["edge_a"],
      },
      artifacts: {
        cycle_iterations: [
          {
            iteration: 1,
            executed_node_ids: ["loop_start"],
            activated_edge_ids: ["edge_a"],
          },
          {
            iteration: 2,
            stop_reason: "completed",
          },
        ],
      },
    }),
  );

  assert.equal(visualization.hasCycle, true);
  assert.equal(visualization.summary?.max_iterations, 12);
  assert.deepEqual(visualization.backEdges, ["edge_a"]);
  assert.equal(visualization.iterations.length, 2);
  assert.deepEqual(visualization.iterations[0]?.executedNodeIds, ["loop_start"]);
  assert.deepEqual(visualization.iterations[0]?.incomingEdgeIds, []);
  assert.equal(visualization.iterations[1]?.stopReason, "completed");
});

test("buildCycleVisualization falls back to artifact summary when top-level summary is absent", () => {
  const visualization = buildCycleVisualization(
    createRunDetail({
      artifacts: {
        cycle_summary: {
          has_cycle: true,
          iteration_count: 1,
          max_iterations: 8,
          stop_reason: "max_iterations_exceeded",
          back_edges: ["edge_cycle"],
        },
      },
    }),
  );

  assert.equal(visualization.hasCycle, true);
  assert.equal(visualization.summary?.stop_reason, "max_iterations_exceeded");
  assert.deepEqual(visualization.backEdges, ["edge_cycle"]);
});

test("formatCycleStopReason turns stored stop reasons into readable labels", () => {
  assert.equal(formatCycleStopReason("empty_iteration"), "Empty iteration");
  assert.equal(formatCycleStopReason("max_iterations_exceeded"), "Max iterations exceeded");
  assert.equal(formatCycleStopReason("no_state_change"), "No state change");
  assert.equal(formatCycleStopReason("completed"), "Completed");
  assert.equal(formatCycleStopReason(null), "");
});

test("describeCycleStopReason explains cycle stop semantics", () => {
  assert.equal(
    describeCycleStopReason("empty_iteration"),
    "The loop scheduled another pass, but no node ran in that iteration.",
  );
  assert.equal(
    describeCycleStopReason("no_state_change"),
    "The loop selected another back edge without changing any tracked state in that iteration.",
  );
  assert.equal(
    describeCycleStopReason("max_iterations_exceeded"),
    "The loop hit the configured loopLimit for its controlling condition node.",
  );
  assert.equal(describeCycleStopReason("completed"), "The loop exited through a non-back-edge path.");
  assert.equal(describeCycleStopReason(null), "");
});
