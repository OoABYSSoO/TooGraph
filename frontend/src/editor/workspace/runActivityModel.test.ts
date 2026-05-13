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

test("appendRunActivityEvent titles state updates with state names when available", () => {
  let state: RunActivityState = { entries: [], autoFollow: true };
  state = appendRunActivityEvent(
    state,
    {
      eventType: "state.updated",
      payload: { node_id: "agent", state_key: "answer", value: "Hello", sequence: 1, created_at: "2026-05-03T01:00:02Z" },
    },
    { answer: "Final Answer" },
  );

  assert.equal(state.entries[0]?.title, "Final Answer");
  assert.equal(state.entries[0]?.stateKey, "answer");
});

test("appendRunActivityEvent appends low-level activity events", () => {
  let state: RunActivityState = { entries: [], autoFollow: true };
  state = appendRunActivityEvent(state, {
    eventType: "activity.event",
    payload: {
      sequence: 2,
      kind: "skill_invocation",
      summary: "Skill 'web_search' succeeded.",
      node_id: "execute_capability",
      status: "succeeded",
      detail: { skill_key: "web_search" },
      created_at: "2026-05-03T01:00:02Z",
    },
  });

  assert.deepEqual(
    state.entries.map((entry) => ({ kind: entry.kind, title: entry.title, nodeId: entry.nodeId, preview: entry.preview, sequence: entry.sequence })),
    [
      {
        kind: "activity-event",
        title: "Skill 'web_search' succeeded.",
        nodeId: "execute_capability",
        preview: '{\n  "skill_key": "web_search"\n}',
        sequence: 2,
      },
    ],
  );
});

test("appendRunActivityEvent updates the current stream entry for repeated node output chunks", () => {
  let state: RunActivityState = { entries: [], autoFollow: true };
  state = appendRunActivityEvent(state, {
    eventType: "node.started",
    payload: { node_id: "agent", node_type: "agent", created_at: "2026-05-03T01:00:00Z" },
  });
  state = appendRunActivityEvent(state, {
    eventType: "node.output.delta",
    payload: { node_id: "agent", text: "Hel", chunk_count: 1, created_at: "2026-05-03T01:00:01Z" },
  });
  state = appendRunActivityEvent(state, {
    eventType: "node.output.delta",
    payload: { node_id: "agent", text: "Hello", chunk_count: 2, created_at: "2026-05-03T01:00:02Z" },
  });
  state = appendRunActivityEvent(state, {
    eventType: "node.output.completed",
    payload: { node_id: "agent", text: "Hello!", completed: true, created_at: "2026-05-03T01:00:03Z" },
  });

  assert.deepEqual(
    state.entries.map((entry) => ({ kind: entry.kind, nodeId: entry.nodeId, preview: entry.preview, active: entry.active, sequence: entry.sequence })),
    [
      { kind: "node-started", nodeId: "agent", preview: "agent running", active: false, sequence: 1 },
      { kind: "node-stream", nodeId: "agent", preview: "Hello!", active: true, sequence: 2 },
    ],
  );
  assert.equal((state.entries[1]?.detail as Record<string, unknown>).completed, true);
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

test("buildRunActivityEntriesFromRun restores node lifecycle entries from node executions", () => {
  const run = {
    run_id: "run_1",
    node_executions: [
      {
        node_id: "agent",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-13T10:00:00.000Z",
        finished_at: "2026-05-13T10:00:01.200Z",
        duration_ms: 1200,
        input_summary: "",
        output_summary: "Answer",
        artifacts: {
          inputs: {},
          outputs: { answer: "Hello" },
          family: "agent",
          state_reads: [],
          state_writes: [],
        },
        warnings: [],
        errors: [],
      },
    ],
    artifacts: {
      state_events: [
        {
          node_id: "agent",
          state_key: "answer",
          output_key: "answer",
          mode: "replace",
          value: "Hello",
          sequence: 1,
          created_at: "2026-05-13T10:00:01.000Z",
        },
      ],
      activity_events: [],
    },
  } as unknown as RunDetail;

  assert.deepEqual(
    buildRunActivityEntriesFromRun(run).map((entry) => entry.kind),
    ["node-started", "state-updated", "node-completed"],
  );
});

test("buildRunActivityEntriesFromRun replays stored low-level activity events", () => {
  const run = {
    run_id: "run_1",
    artifacts: {
      activity_events: [
        {
          node_id: "execute_capability",
          kind: "skill_invocation",
          summary: "Skill 'web_search' succeeded.",
          status: "succeeded",
          detail: { skill_key: "web_search" },
          sequence: 1,
          created_at: "2026-05-03T01:00:02Z",
        },
      ],
    },
    node_executions: [],
  } as unknown as RunDetail;

  assert.deepEqual(
    buildRunActivityEntriesFromRun(run).map((entry) => ({ kind: entry.kind, title: entry.title, nodeId: entry.nodeId, preview: entry.preview })),
    [
      {
        kind: "activity-event",
        title: "Skill 'web_search' succeeded.",
        nodeId: "execute_capability",
        preview: '{\n  "skill_key": "web_search"\n}',
      },
    ],
  );
});

test("buildRunActivityEntriesFromRun replays file write activity summaries", () => {
  const run = {
    run_id: "run_1",
    artifacts: {
      activity_events: [
        {
          node_id: "execute_capability",
          kind: "file_write",
          summary: "Editing skill/user/demo/SKILL.md +3 -0",
          status: "succeeded",
          detail: { path: "skill/user/demo/SKILL.md", added: 3, removed: 0 },
          sequence: 1,
          created_at: "2026-05-12T01:00:00Z",
        },
      ],
    },
    node_executions: [],
  } as unknown as RunDetail;

  assert.deepEqual(
    buildRunActivityEntriesFromRun(run).map((entry) => ({ title: entry.title, nodeId: entry.nodeId })),
    [{ title: "Editing skill/user/demo/SKILL.md +3 -0", nodeId: "execute_capability" }],
  );
});

test("buildRunActivityEntriesFromRun formats Buddy Home writeback activity", () => {
  const run = {
    run_id: "run_1",
    artifacts: {
      activity_events: [
        {
          node_id: "apply_buddy_home_writeback",
          kind: "buddy_home_write",
          summary: "Applied 1 Buddy Home command. Skipped 1 unsafe or invalid command.",
          status: "failed",
          detail: {
            applied_count: 1,
            skipped_count: 1,
            revision_ids: ["rev_memory_1"],
          },
          sequence: 1,
          created_at: "2026-05-12T01:00:00Z",
        },
      ],
    },
    node_executions: [],
  } as unknown as RunDetail;

  assert.deepEqual(
    buildRunActivityEntriesFromRun(run).map((entry) => ({ title: entry.title, nodeId: entry.nodeId, preview: entry.preview })),
    [
      {
        title: "Buddy Home writeback",
        nodeId: "apply_buddy_home_writeback",
        preview: "applied 1 | skipped 1 | revisions rev_memory_1",
      },
    ],
  );
});

test("buildRunActivityEntriesFromRun titles stored state events with state names", () => {
  const run = {
    run_id: "run_1",
    artifacts: {
      state_events: [
        {
          node_id: "agent",
          state_key: "state_2",
          output_key: "poem_zh",
          mode: "replace",
          value: "短诗",
          sequence: 1,
          created_at: "2026-05-03T01:00:02Z",
        },
      ],
    },
    node_executions: [],
  } as unknown as RunDetail;

  assert.deepEqual(
    buildRunActivityEntriesFromRun(run, { state_2: "poem_zh" }).map((entry) => ({ title: entry.title, stateKey: entry.stateKey })),
    [{ title: "poem_zh", stateKey: "state_2" }],
  );
});
