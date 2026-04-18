import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunNodeTimingByNodeIdFromRun,
  reduceRunNodeTimingEvent,
  type RunNodeTimingByNodeId,
} from "./runNodeTimingModel.ts";

function graphDocument() {
  return {
    nodes: {
      agent: {
        kind: "agent",
        reads: [],
        writes: [{ state: "reply" }],
      },
      output: {
        kind: "output",
        reads: [{ state: "reply" }],
        writes: [],
      },
    },
  };
}

test("reduceRunNodeTimingEvent starts and completes node timing", () => {
  let timings: RunNodeTimingByNodeId = {};

  timings = reduceRunNodeTimingEvent(timings, "node.started", { node_id: "agent" }, 1000);
  assert.deepEqual(timings.agent, { status: "running", startedAtMs: 1000, durationMs: null });

  timings = reduceRunNodeTimingEvent(timings, "node.completed", { node_id: "agent", duration_ms: 875 }, 2000);
  assert.deepEqual(timings.agent, { status: "success", startedAtMs: 1000, durationMs: 875 });
});

test("reduceRunNodeTimingEvent starts output timing from its upstream writer", () => {
  let timings: RunNodeTimingByNodeId = {};

  timings = reduceRunNodeTimingEvent(timings, "node.started", { node_id: "agent" }, 1000, graphDocument());
  assert.deepEqual(timings.agent, { status: "running", startedAtMs: 1000, durationMs: null });
  assert.deepEqual(timings.output, { status: "running", startedAtMs: 1000, durationMs: null });

  timings = reduceRunNodeTimingEvent(timings, "state.updated", { node_id: "agent", state_key: "reply" }, 3250, graphDocument());
  assert.deepEqual(timings.output, { status: "success", startedAtMs: 1000, durationMs: 2250 });
});

test("reduceRunNodeTimingEvent marks failed nodes and computes duration when the payload omits it", () => {
  let timings: RunNodeTimingByNodeId = {};

  timings = reduceRunNodeTimingEvent(timings, "node.started", { node_id: "agent" }, 1000);
  timings = reduceRunNodeTimingEvent(timings, "node.failed", { node_id: "agent" }, 2250);

  assert.deepEqual(timings.agent, { status: "failed", startedAtMs: 1000, durationMs: 1250 });
});

test("buildRunNodeTimingByNodeIdFromRun uses node executions", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun({
    node_executions: [
      { node_id: "input", status: "success", duration_ms: 3 },
      { node_id: "agent", status: "failed", duration_ms: 1200 },
    ],
  });

  assert.equal(timings.input.durationMs, 3);
  assert.equal(timings.agent.status, "failed");
  assert.equal(timings.agent.durationMs, 1200);
});

test("buildRunNodeTimingByNodeIdFromRun derives output timing from writer state events", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun(
    {
      node_executions: [
        { node_id: "agent", status: "success", duration_ms: 8537 },
      ],
      artifacts: {
        state_events: [
          { node_id: "agent", state_key: "reply" },
        ],
      },
    },
    graphDocument(),
  );

  assert.equal(timings.agent.durationMs, 8537);
  assert.equal(timings.output.status, "success");
  assert.equal(timings.output.durationMs, 8537);
});
