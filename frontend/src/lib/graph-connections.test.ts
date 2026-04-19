import assert from "node:assert/strict";
import test from "node:test";

import {
  canCompleteGraphConnection,
  canStartGraphConnection,
  type PendingGraphConnection,
} from "./graph-connections.ts";
import type { GraphPayload } from "../types/node-system.ts";

const document: GraphPayload = {
  graph_id: null,
  name: "Graph Connections",
  state_schema: {},
  nodes: {
    input_question: {
      kind: "input",
      name: "input_question",
      description: "Question input",
      ui: { position: { x: 0, y: 0 } },
      reads: [],
      writes: [{ state: "question", mode: "replace" }],
      config: {
        value: "",
      },
    },
    answer_helper: {
      kind: "agent",
      name: "answer_helper",
      description: "Answer the question",
      ui: { position: { x: 120, y: 0 } },
      reads: [{ state: "question", required: true }],
      writes: [],
      config: {
        skills: [],
        systemInstruction: "",
        taskInstruction: "",
        modelSource: "global",
        model: "",
        thinkingMode: "on",
        temperature: 0.2,
      },
    },
    route_result: {
      kind: "condition",
      name: "route_result",
      description: "Route the result",
      ui: { position: { x: 240, y: 0 } },
      reads: [],
      writes: [],
      config: {
        branches: ["continue", "retry"],
        loopLimit: -1,
        branchMapping: {},
        rule: {
          source: "question",
          operator: "exists",
          value: null,
        },
      },
    },
    output_answer: {
      kind: "output",
      name: "output_answer",
      description: "Preview output",
      ui: { position: { x: 360, y: 0 } },
      reads: [],
      writes: [],
      config: {
        displayMode: "auto",
        persistEnabled: false,
        persistFormat: "auto",
        fileNameTemplate: "",
      },
    },
  },
  edges: [{ source: "input_question", target: "answer_helper" }],
  conditional_edges: [
    {
      source: "route_result",
      branches: {
        continue: "output_answer",
      },
    },
  ],
  metadata: {},
};

test("canStartGraphConnection starts from flow, route, and state output anchors", () => {
  assert.equal(canStartGraphConnection("flow-out"), true);
  assert.equal(canStartGraphConnection("route-out"), true);
  assert.equal(canStartGraphConnection("state-out"), true);
  assert.equal(canStartGraphConnection("flow-in"), false);
  assert.equal(canStartGraphConnection("state-in"), false);
});

test("canCompleteGraphConnection allows flow-out sources to target flow-in anchors with valid flow semantics", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "answer_helper",
    sourceKind: "flow-out",
  };

  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "route_result",
      kind: "flow-in",
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "input_question",
      kind: "flow-in",
    }),
    false,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
    }),
    false,
  );
});

test("canCompleteGraphConnection allows route-out sources to target valid flow-in anchors and rejects duplicate or invalid routes", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "route_result",
    sourceKind: "route-out",
    branchKey: "retry",
  };

  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "answer_helper",
      kind: "flow-in",
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "route_result",
      kind: "flow-in",
    }),
    false,
  );
  assert.equal(
    canCompleteGraphConnection(document, {
      sourceNodeId: "route_result",
      sourceKind: "route-out",
      branchKey: "continue",
    }, {
      nodeId: "output_answer",
      kind: "flow-in",
    }),
    false,
  );
});

test("canCompleteGraphConnection allows reconnecting an existing flow edge to a different valid target", () => {
  const reconnectingFlow: PendingGraphConnection = {
    sourceNodeId: "input_question",
    sourceKind: "flow-out",
    mode: "reconnect",
    currentTargetNodeId: "answer_helper",
  };

  assert.equal(
    canCompleteGraphConnection(document, reconnectingFlow, {
      nodeId: "output_answer",
      kind: "flow-in",
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, reconnectingFlow, {
      nodeId: "answer_helper",
      kind: "flow-in",
    }),
    false,
  );
  assert.equal(
    canCompleteGraphConnection(document, reconnectingFlow, {
      nodeId: "input_question",
      kind: "flow-in",
    }),
    false,
  );
});

test("canCompleteGraphConnection allows reconnecting an existing route edge to a different valid target", () => {
  const reconnectingRoute: PendingGraphConnection = {
    sourceNodeId: "route_result",
    sourceKind: "route-out",
    branchKey: "continue",
    mode: "reconnect",
    currentTargetNodeId: "output_answer",
  };

  assert.equal(
    canCompleteGraphConnection(document, reconnectingRoute, {
      nodeId: "answer_helper",
      kind: "flow-in",
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, reconnectingRoute, {
      nodeId: "output_answer",
      kind: "flow-in",
    }),
    false,
  );
  assert.equal(
    canCompleteGraphConnection(document, {
      ...reconnectingRoute,
      currentTargetNodeId: "missing_target",
    }, {
      nodeId: "answer_helper",
      kind: "flow-in",
    }),
    false,
  );
});

test("canCompleteGraphConnection allows state-out sources to target a concrete state-in binding", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "input_question",
    sourceKind: "state-out",
    sourceStateKey: "question",
  };

  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
      stateKey: "question",
    }),
    false,
  );

  assert.equal(
    canCompleteGraphConnection(
      {
        ...document,
        nodes: {
          ...document.nodes,
          answer_helper: {
            ...document.nodes.answer_helper,
            reads: [{ state: "draft_question", required: true }],
            writes: [],
          },
        },
      },
      pending,
      {
        nodeId: "answer_helper",
        kind: "state-in",
        stateKey: "draft_question",
      },
    ),
    true,
  );
});
