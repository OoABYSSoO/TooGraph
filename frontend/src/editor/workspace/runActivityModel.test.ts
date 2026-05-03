import assert from "node:assert/strict";
import test from "node:test";

import { appendRunActivityEvent, buildRunActivityEntriesFromRun, type RunActivityState } from "./runActivityModel.ts";
import type { RunDetail } from "@/types/run";

test("appendRunActivityEvent appends node streams and state updates in event order", () => {
  let state: RunActivityState = { entries: [], autoFollow: true };
  state = appendRunActivityEvent(state, {
    eventType: "node.started",
    payload: { node_id: "agent", node_type: "agent", created_at: "2026-05-03T01:00:00Z" },
  });
  state = appendRunActivityEvent(state, {
    eventType: "node.output.delta",
    payload: { node_id: "agent", text: '{"answer":"Hel', output_keys: ["answer"], created_at: "2026-05-03T01:00:01Z" },
  });
  state = appendRunActivityEvent(state, {
    eventType: "state.updated",
    payload: { node_id: "agent", state_key: "answer", value: "Hello", sequence: 1, created_at: "2026-05-03T01:00:02Z" },
  });

  assert.deepEqual(
    state.entries.map((entry) => ({ kind: entry.kind, nodeId: entry.nodeId, stateKey: entry.stateKey, preview: entry.preview })),
    [
      { kind: "node-started", nodeId: "agent", stateKey: null, preview: "agent running" },
      { kind: "node-stream", nodeId: "agent", stateKey: null, preview: '{"answer":"Hel' },
      { kind: "state-updated", nodeId: "agent", stateKey: "answer", preview: "Hello" },
    ],
  );
});

test("buildRunActivityEntriesFromRun replays stored state events for completed run details", () => {
  const run = {
    run_id: "run_1",
    artifacts: {
      state_events: [
        {
          node_id: "agent",
          state_key: "answer",
          output_key: "answer",
          mode: "replace",
          value: "Hello",
          sequence: 1,
          created_at: "2026-05-03T01:00:02Z",
        },
      ],
    },
    node_executions: [],
  } as unknown as RunDetail;

  assert.deepEqual(
    buildRunActivityEntriesFromRun(run).map((entry) => ({ kind: entry.kind, stateKey: entry.stateKey, preview: entry.preview })),
    [{ kind: "state-updated", stateKey: "answer", preview: "Hello" }],
  );
});
