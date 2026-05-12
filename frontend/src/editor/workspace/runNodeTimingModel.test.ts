import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunNodeTimingByNodeIdFromRun,
  reduceRunNodeTimingEvent,
  type RunNodeTimingByNodeId,
} from "./runNodeTimingModel.ts";

test("reduceRunNodeTimingEvent starts and completes node timing", () => {
  let timings: RunNodeTimingByNodeId = {};

  timings = reduceRunNodeTimingEvent(timings, "node.started", { node_id: "agent" }, 1000);
  assert.deepEqual(timings.agent, { status: "running", startedAtMs: 1000, durationMs: null });

  timings = reduceRunNodeTimingEvent(timings, "node.completed", { node_id: "agent", duration_ms: 875 }, 2000);
  assert.deepEqual(timings.agent, { status: "success", startedAtMs: 1000, durationMs: 875 });
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
