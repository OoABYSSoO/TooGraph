import assert from "node:assert/strict";
import test from "node:test";

import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import { buildBuddyPublicOutputBindings } from "./buddyPublicOutput.ts";
import { buildPublicOutputRuntimeStateFromRunDetail } from "./useBuddyRunDisplayMessages.ts";

function outputTimelineGraph(): GraphPayload {
  return {
    graph_id: null,
    name: "Buddy",
    state_schema: {
      answer: { name: "answer", description: "", type: "markdown", value: "", color: "#000" },
    },
    nodes: {
      gate: {
        kind: "condition",
        name: "Needs capability?",
        description: "",
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: { branches: ["true", "false"], loopLimit: 5, branchMapping: {}, rule: null },
        ui: { position: { x: 0, y: 0 } },
      },
      output_answer: {
        kind: "output",
        name: "Answer",
        description: "",
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: { displayMode: "markdown", persistEnabled: false, persistFormat: "auto", fileNameTemplate: "" },
        ui: { position: { x: 0, y: 0 } },
      },
    },
    edges: [],
    conditional_edges: [{ source: "gate", branches: { false: "output_answer" } }],
    metadata: {},
  };
}

test("buildPublicOutputRuntimeStateFromRunDetail preserves repeated output state writes from run history", () => {
  const graph = outputTimelineGraph();
  const bindings = buildBuddyPublicOutputBindings(graph);
  const run = {
    status: "completed",
    output_previews: [
      {
        node_id: "output_answer",
        source_kind: "state",
        source_key: "answer",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "final",
      },
    ],
    artifacts: {
      state_events: [
        {
          node_id: "writer",
          state_key: "answer",
          output_key: "answer",
          value: "progress",
          sequence: 1,
          created_at: "2026-05-24T03:14:04.000Z",
        },
        {
          node_id: "writer",
          state_key: "answer",
          output_key: "answer",
          value: "final",
          sequence: 2,
          created_at: "2026-05-24T03:14:41.000Z",
        },
      ],
    },
    node_executions: [],
  } as Partial<RunDetail> as RunDetail;

  const state = buildPublicOutputRuntimeStateFromRunDetail(run, bindings, graph);

  assert.deepEqual(state.order, ["output_answer", "output_answer:2"]);
  assert.equal(state.messagesByOutputNodeId.output_answer.content, "progress");
  assert.equal(state.messagesByOutputNodeId["output_answer:2"].content, "final");
});
