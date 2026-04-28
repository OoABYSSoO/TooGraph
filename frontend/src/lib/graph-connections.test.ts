import assert from "node:assert/strict";
import test from "node:test";

import {
  canCompleteGraphConnection,
  canConnectStateInputSource,
  canDisconnectSequenceEdgeForDataConnection,
  canStartGraphConnection,
  type PendingGraphConnection,
} from "./graph-connections.ts";
import { CREATE_AGENT_INPUT_STATE_KEY, VIRTUAL_ANY_INPUT_STATE_KEY, VIRTUAL_ANY_OUTPUT_STATE_KEY } from "./virtual-any-input.ts";
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

test("canStartGraphConnection starts from flow, route, state output, and state input anchors", () => {
  assert.equal(canStartGraphConnection("flow-out"), true);
  assert.equal(canStartGraphConnection("route-out"), true);
  assert.equal(canStartGraphConnection("state-out"), true);
  assert.equal(canStartGraphConnection("state-in"), true);
  assert.equal(canStartGraphConnection("flow-in"), false);
});

test("canDisconnectSequenceEdgeForDataConnection follows existing sequence edges without requiring agent endpoints", () => {
  assert.equal(canDisconnectSequenceEdgeForDataConnection(document, "input_question", "answer_helper"), true);
  assert.equal(canDisconnectSequenceEdgeForDataConnection(document, "answer_helper", "input_question"), false);
  assert.equal(canDisconnectSequenceEdgeForDataConnection(document, "input_question", "output_answer"), false);
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

test("canCompleteGraphConnection allows an existing state binding to restore a missing ordering edge", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "input_question",
    sourceKind: "state-out",
    sourceStateKey: "question",
  };
  const disconnectedGraph: GraphPayload = {
    ...document,
    edges: [],
  };

  assert.equal(
    canCompleteGraphConnection(disconnectedGraph, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
      stateKey: "question",
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
      stateKey: "question",
    }),
    false,
  );
});

test("canCompleteGraphConnection allows state outputs to target virtual any inputs on empty non-input nodes", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "input_question",
    sourceKind: "state-out",
    sourceStateKey: "question",
  };

  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "route_result",
      kind: "state-in",
      stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "output_answer",
      kind: "state-in",
      stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "input_question",
      kind: "state-in",
      stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
    }),
    false,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
      stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
    }),
    false,
  );
});

test("canCompleteGraphConnection allows state outputs to target a transient new agent input", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "input_question",
    sourceKind: "state-out",
    sourceStateKey: "question",
  };
  const graphWithAgentMissingQuestion: GraphPayload = {
    ...document,
    nodes: {
      ...document.nodes,
      answer_helper: {
        ...document.nodes.answer_helper,
        reads: [{ state: "draft_question", required: true }],
      },
    },
  };

  assert.equal(
    canCompleteGraphConnection(graphWithAgentMissingQuestion, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
      stateKey: CREATE_AGENT_INPUT_STATE_KEY,
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
      stateKey: CREATE_AGENT_INPUT_STATE_KEY,
    }),
    false,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "route_result",
      kind: "state-in",
      stateKey: CREATE_AGENT_INPUT_STATE_KEY,
    }),
    false,
  );
  assert.equal(
    canCompleteGraphConnection(document, pending, {
      nodeId: "output_answer",
      kind: "state-in",
      stateKey: CREATE_AGENT_INPUT_STATE_KEY,
    }),
    false,
  );
});

test("canCompleteGraphConnection allows virtual state outputs to materialize into eligible existing targets", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "answer_helper",
    sourceKind: "state-out",
    sourceStateKey: VIRTUAL_ANY_OUTPUT_STATE_KEY,
  };
  const graphWithReviewAgent: GraphPayload = {
    ...document,
    nodes: {
      ...document.nodes,
      review_agent: {
        kind: "agent",
        name: "review_agent",
        description: "",
        ui: { position: { x: 480, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
    },
  };

  assert.equal(
    canCompleteGraphConnection(graphWithReviewAgent, pending, {
      nodeId: "review_agent",
      kind: "state-in",
      stateKey: CREATE_AGENT_INPUT_STATE_KEY,
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(graphWithReviewAgent, pending, {
      nodeId: "route_result",
      kind: "state-in",
      stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(graphWithReviewAgent, pending, {
      nodeId: "output_answer",
      kind: "state-in",
      stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
    }),
    true,
  );
  assert.equal(
    canCompleteGraphConnection(
      {
        ...graphWithReviewAgent,
        nodes: {
          ...graphWithReviewAgent.nodes,
          output_answer: {
            ...graphWithReviewAgent.nodes.output_answer,
            reads: [{ state: "question", required: true }],
          },
        },
      },
      pending,
      {
        nodeId: "output_answer",
        kind: "state-in",
        stateKey: VIRTUAL_ANY_INPUT_STATE_KEY,
      },
    ),
    false,
  );
});

test("canCompleteGraphConnection allows state connections that can create a safe ordering edge", () => {
  const pending: PendingGraphConnection = {
    sourceNodeId: "input_question",
    sourceKind: "state-out",
    sourceStateKey: "question",
  };
  const disconnectedGraph: GraphPayload = {
    ...document,
    edges: [],
    nodes: {
      ...document.nodes,
      answer_helper: {
        ...document.nodes.answer_helper,
        reads: [{ state: "draft_question", required: true }],
      },
    },
  };

  assert.equal(
    canCompleteGraphConnection(disconnectedGraph, pending, {
      nodeId: "answer_helper",
      kind: "state-in",
      stateKey: CREATE_AGENT_INPUT_STATE_KEY,
    }),
    true,
  );
});

test("canCompleteGraphConnection rejects state connections that would remain writer-ambiguous", () => {
  const ambiguousGraph: GraphPayload = {
    ...document,
    state_schema: {
      answer: { name: "answer", description: "", type: "text", value: "", color: "#d97706" },
      draft_question: { name: "draft_question", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      writer_left: {
        kind: "agent",
        name: "writer_left",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
      writer_right: {
        kind: "agent",
        name: "writer_right",
        description: "",
        ui: { position: { x: 200, y: 0 } },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
      sink: {
        kind: "agent",
        name: "sink",
        description: "",
        ui: { position: { x: 440, y: 0 } },
        reads: [{ state: "draft_question", required: true }],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
    },
    edges: [
      { source: "writer_left", target: "sink" },
      { source: "writer_right", target: "sink" },
    ],
    conditional_edges: [],
  };

  assert.equal(
    canCompleteGraphConnection(
      ambiguousGraph,
      {
        sourceNodeId: "writer_left",
        sourceKind: "state-out",
        sourceStateKey: "answer",
      },
      {
        nodeId: "sink",
        kind: "state-in",
        stateKey: CREATE_AGENT_INPUT_STATE_KEY,
      },
    ),
    false,
  );
});

test("canConnectStateInputSource allows reverse drags from inputs to existing writer nodes", () => {
  const graphWithEmptyInput: GraphPayload = {
    ...document,
    nodes: {
      ...document.nodes,
      empty_input: {
        kind: "input",
        name: "empty_input",
        description: "",
        ui: { position: { x: -120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
      filled_input: {
        kind: "input",
        name: "filled_input",
        description: "",
        ui: { position: { x: -120, y: 80 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
    },
    edges: [],
  };

  assert.equal(canConnectStateInputSource(graphWithEmptyInput, "empty_input", "answer_helper", "question"), true);
  assert.equal(canConnectStateInputSource(graphWithEmptyInput, "answer_helper", "output_answer", VIRTUAL_ANY_INPUT_STATE_KEY), true);
  assert.equal(canConnectStateInputSource(graphWithEmptyInput, "filled_input", "answer_helper", "question"), false);
  assert.equal(canConnectStateInputSource(graphWithEmptyInput, "route_result", "answer_helper", "question"), false);
  assert.equal(canConnectStateInputSource(graphWithEmptyInput, "answer_helper", "input_question", "question"), false);
});
