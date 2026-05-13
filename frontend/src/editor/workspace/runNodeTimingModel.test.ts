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
  assert.deepEqual(timings.agent, { status: "running", startedAtEpochMs: 1000, durationMs: null });

  timings = reduceRunNodeTimingEvent(timings, "node.completed", { node_id: "agent", duration_ms: 875 }, 2000);
  assert.deepEqual(timings.agent, { status: "success", startedAtEpochMs: 1000, durationMs: 875 });
});

test("reduceRunNodeTimingEvent starts output timing from its upstream writer", () => {
  let timings: RunNodeTimingByNodeId = {};

  timings = reduceRunNodeTimingEvent(timings, "node.started", { node_id: "agent" }, 1000, graphDocument());
  assert.deepEqual(timings.agent, { status: "running", startedAtEpochMs: 1000, durationMs: null });
  assert.deepEqual(timings.output, { status: "running", startedAtEpochMs: 1000, durationMs: null });

  timings = reduceRunNodeTimingEvent(timings, "state.updated", { node_id: "agent", state_key: "reply" }, 3250, graphDocument());
  assert.deepEqual(timings.output, { status: "success", startedAtEpochMs: 1000, durationMs: 2250 });
});

test("reduceRunNodeTimingEvent marks failed nodes and computes duration when the payload omits it", () => {
  let timings: RunNodeTimingByNodeId = {};

  timings = reduceRunNodeTimingEvent(timings, "node.started", { node_id: "agent" }, 1000);
  timings = reduceRunNodeTimingEvent(timings, "node.failed", { node_id: "agent" }, 2250);

  assert.deepEqual(timings.agent, { status: "failed", startedAtEpochMs: 1000, durationMs: 1250 });
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

test("buildRunNodeTimingByNodeIdFromRun restores model token usage on the writer node only", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun(
    {
      node_executions: [
        {
          node_id: "agent",
          status: "success",
          started_at: "2026-05-13T10:00:00.000Z",
          finished_at: "2026-05-13T10:00:03.500Z",
          duration_ms: 3500,
          artifacts: {
            runtime_config: {
              provider_usage: {
                input_tokens: 1200,
                output_tokens: 280,
              },
              structured_output_repair_provider_usage: {
                prompt_tokens: 35,
                completion_tokens: 15,
              },
              skill_input_provider_usage: {
                total_tokens: 420,
              },
            },
          },
        },
      ],
      artifacts: {
        state_events: [
          {
            node_id: "agent",
            state_key: "reply",
            created_at: "2026-05-13T10:00:02.250Z",
          },
        ],
      },
    },
    graphDocument(),
  );

  assert.equal(timings.agent.tokenCount, 1950);
  assert.equal(timings.output.tokenCount, undefined);
});

test("buildRunNodeTimingByNodeIdFromRun restores running node timing from started_at", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun({
    node_executions: [
      {
        node_id: "agent",
        status: "running",
        started_at: "2026-05-13T10:00:00.000Z",
        finished_at: null,
        duration_ms: 0,
      },
    ],
  });

  assert.equal(timings.agent.status, "running");
  assert.equal(timings.agent.startedAtEpochMs, Date.parse("2026-05-13T10:00:00.000Z"));
  assert.equal(timings.agent.durationMs, null);
});

test("buildRunNodeTimingByNodeIdFromRun starts output timing from a running upstream writer", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun(
    {
      node_executions: [
        {
          node_id: "agent",
          status: "running",
          started_at: "2026-05-13T10:00:00.000Z",
          finished_at: null,
          duration_ms: 0,
        },
      ],
      artifacts: {
        state_events: [],
      },
    },
    graphDocument(),
  );

  assert.deepEqual(timings.output, {
    status: "running",
    startedAtEpochMs: Date.parse("2026-05-13T10:00:00.000Z"),
    durationMs: null,
  });
});

test("buildRunNodeTimingByNodeIdFromRun derives output timing from writer state events", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun(
    {
      node_executions: [
        {
          node_id: "agent",
          status: "success",
          started_at: "2026-05-13T10:00:00.000Z",
          finished_at: "2026-05-13T10:00:03.500Z",
          duration_ms: 3500,
        },
      ],
      artifacts: {
        state_events: [
          {
            node_id: "agent",
            state_key: "reply",
            created_at: "2026-05-13T10:00:02.250Z",
          },
        ],
      },
    },
    graphDocument(),
  );

  assert.equal(timings.agent.durationMs, 3500);
  assert.equal(timings.output.status, "success");
  assert.equal(timings.output.startedAtEpochMs, Date.parse("2026-05-13T10:00:00.000Z"));
  assert.equal(timings.output.durationMs, 2250);
});
