import test from "node:test";
import assert from "node:assert/strict";

import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
  VIRTUAL_ANY_INPUT_STATE_KEY,
  VIRTUAL_ANY_OUTPUT_STATE_KEY,
} from "../../lib/virtual-any-input.ts";
import type { GraphPayload } from "../../types/node-system.ts";
import {
  buildPendingAgentInputSourceByNodeId,
  buildPendingStateInputSourceTargetByNodeId,
  buildPendingStateOutputTargetByNodeId,
  resolveStatePortPreview,
} from "./canvasPendingStatePortModel.ts";

const document: GraphPayload = {
  name: "Pending ports",
  state_schema: {
    answer: { name: " Answer ", description: "", type: "string", color: " #2563eb " },
    blank: { name: "   ", description: "", type: "string", color: "   " },
  },
  metadata: {},
  nodes: {
    writer: agentNode("Writer", ["answer"], []),
    target: agentNode("Target", [], []),
    blocked: agentNode("Blocked", [], []),
  },
  edges: [],
  conditional_edges: [],
};

test("pending state port model resolves concrete state previews", () => {
  assert.deepEqual(resolveStatePortPreview(document.state_schema, "answer"), {
    stateKey: "answer",
    label: "Answer",
    stateColor: "#2563eb",
  });
  assert.deepEqual(resolveStatePortPreview(document.state_schema, "blank"), {
    stateKey: "blank",
    label: "blank",
    stateColor: "#d97706",
  });
  assert.equal(resolveStatePortPreview(document.state_schema, VIRTUAL_ANY_INPUT_STATE_KEY), null);
  assert.equal(resolveStatePortPreview(document.state_schema, "missing"), null);
});

test("pending state port model builds pending agent input sources", () => {
  const connection: PendingGraphConnection = {
    sourceNodeId: "writer",
    sourceKind: "state-out",
    sourceStateKey: "answer",
  };

  assert.deepEqual(
    buildPendingAgentInputSourceByNodeId({
      document,
      connection,
      canCompleteAgentInput: (nodeId) => nodeId === "target",
    }),
    {
      target: {
        stateKey: "answer",
        label: "Answer",
        stateColor: "#2563eb",
      },
    },
  );
  assert.deepEqual(
    buildPendingAgentInputSourceByNodeId({
      document,
      connection: { ...connection, sourceStateKey: CREATE_AGENT_INPUT_STATE_KEY },
      canCompleteAgentInput: () => false,
    }),
    {},
  );
});

test("pending state port model preserves virtual output sources for create-input snapping", () => {
  assert.deepEqual(
    buildPendingAgentInputSourceByNodeId({
      document,
      connection: {
        sourceNodeId: "writer",
        sourceKind: "state-out",
        sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      },
      canCompleteAgentInput: (nodeId) => nodeId === "target",
    }),
    {
      target: {
        stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
        label: "new state",
        stateColor: "#9a3412",
      },
    },
  );
});

test("pending state port model builds virtual input and output target previews", () => {
  assert.deepEqual(
    buildPendingStateInputSourceTargetByNodeId({
      connection: {
        sourceNodeId: "target",
        sourceKind: "state-in",
        sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
      stateSchema: document.state_schema,
      autoSnappedTargetStateKey: "answer",
    }),
    {
      target: {
        stateKey: "answer",
        label: "Answer",
        stateColor: "#2563eb",
      },
    },
  );
  assert.deepEqual(
    buildPendingStateOutputTargetByNodeId({
      connection: {
        sourceNodeId: "writer",
        sourceKind: "state-out",
        sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      },
      stateSchema: document.state_schema,
      autoSnappedTargetStateKey: "answer",
    }),
    {
      writer: {
        stateKey: "answer",
        label: "Answer",
        stateColor: "#2563eb",
      },
    },
  );
  assert.deepEqual(
    buildPendingStateInputSourceTargetByNodeId({
      connection: {
        sourceNodeId: "target",
        sourceKind: "state-in",
        sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
      stateSchema: document.state_schema,
      autoSnappedTargetStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    }),
    {
      target: {
        stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
        label: "new state",
        stateColor: "#9a3412",
      },
    },
  );
  assert.deepEqual(
    buildPendingStateOutputTargetByNodeId({
      connection: {
        sourceNodeId: "target",
        sourceKind: "state-in",
        sourceStateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
      stateSchema: document.state_schema,
      autoSnappedTargetNodeId: "writer",
      autoSnappedTargetStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
    }),
    {
      writer: {
        stateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
        label: "new state",
        stateColor: "#9a3412",
      },
    },
  );
  assert.deepEqual(
    buildPendingStateOutputTargetByNodeId({
      connection: null,
      stateSchema: document.state_schema,
      autoSnappedTargetStateKey: "answer",
    }),
    {},
  );
});

function agentNode(name: string, writes: string[], reads: string[]) {
  return {
    kind: "agent" as const,
    name,
    description: "",
    ui: { position: { x: 0, y: 0 } },
    reads: reads.map((state) => ({ state })),
    writes: writes.map((state) => ({ state })),
    config: {
      skillKey: "",
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "off" as const,
      temperature: 0.2,
    },
  };
}
