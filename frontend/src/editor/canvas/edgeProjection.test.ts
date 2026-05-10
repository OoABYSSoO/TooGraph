import test from "node:test";
import assert from "node:assert/strict";

import { buildSequenceFlowPath } from "./flowEdgePath.ts";
import { groupProjectedCanvasAnchors, groupProjectedCanvasEdges, projectCanvasAnchors, projectCanvasEdges } from "./edgeProjection.ts";
import type { GraphPayload } from "../../types/node-system.ts";

const graph: GraphPayload = {
  graph_id: null,
  name: "Hello World",
  state_schema: {
    question: {
      name: "question",
      description: "",
      type: "text",
      value: "",
      color: "#d97706",
    },
    answer: {
      name: "answer",
      description: "",
      type: "text",
      value: "",
      color: "#a855f7",
    },
  },
  nodes: {
    input_question: {
      kind: "input",
      name: "input_question",
      description: "Provide the user question.",
      ui: { position: { x: 80, y: 220 } },
      reads: [],
      writes: [{ state: "question", mode: "replace" }],
      config: { value: "什么是 TooGraph？" },
    },
    answer_helper: {
      kind: "agent",
      name: "answer_helper",
      description: "Answer the question directly without external tools.",
      ui: { position: { x: 520, y: 220 } },
      reads: [{ state: "question", required: true }],
      writes: [{ state: "answer", mode: "replace" }],
      config: {
        skillKey: "",
        taskInstruction: "请直接用中文回答用户问题。",
        modelSource: "global",
        model: "",
        thinkingMode: "on",
        temperature: 0.2,
      },
    },
    output_answer: {
      kind: "output",
      name: "output_answer",
      description: "Preview the final answer.",
      ui: { position: { x: 980, y: 220 } },
      reads: [{ state: "answer", required: true }],
      writes: [],
      config: {
        displayMode: "auto",
        persistEnabled: false,
        persistFormat: "auto",
        fileNameTemplate: "",
      },
    },
  },
  edges: [
    { source: "input_question", target: "answer_helper" },
    { source: "answer_helper", target: "output_answer" },
  ],
  conditional_edges: [],
  metadata: {},
};

test("projectCanvasEdges creates projected flow edges from graph edges", () => {
  const projected = projectCanvasEdges(graph);

  assert.equal(projected.length, 4);
  assert.deepEqual(
    projected.map((edge) => ({ id: edge.id, kind: edge.kind, source: edge.source, target: edge.target, state: edge.state ?? null })),
    [
      { id: "flow:input_question->answer_helper", kind: "flow", source: "input_question", target: "answer_helper", state: null },
      { id: "flow:answer_helper->output_answer", kind: "flow", source: "answer_helper", target: "output_answer", state: null },
      { id: "data:input_question:question->answer_helper", kind: "data", source: "input_question", target: "answer_helper", state: "question" },
      { id: "data:answer_helper:answer->output_answer", kind: "data", source: "answer_helper", target: "output_answer", state: "answer" },
    ],
  );
  assert.equal(
    projected[0]!.path,
    buildSequenceFlowPath({
      sourceX: 534,
      sourceY: 254,
      targetX: 526,
      targetY: 254,
      sourceNodeX: 80,
      sourceNodeY: 220,
      targetNodeX: 520,
      targetNodeY: 220,
    }),
  );
  assert.equal(
    projected[1]!.path,
    buildSequenceFlowPath({
      sourceX: 974,
      sourceY: 254,
      targetX: 986,
      targetY: 254,
      sourceNodeX: 520,
      sourceNodeY: 220,
      targetNodeX: 980,
      targetNodeY: 220,
    }),
  );
});

test("groupProjectedCanvasEdges separates flow-route and data edges", () => {
  const edges = [
    { id: "flow:input->agent", kind: "flow", source: "input", target: "agent", path: "M 0 0" },
    { id: "route:condition:true->output", kind: "route", source: "condition", target: "output", branch: "true", path: "M 1 1" },
    { id: "data:agent:answer->output", kind: "data", source: "agent", target: "output", state: "answer", path: "M 2 2" },
  ] satisfies ReturnType<typeof projectCanvasEdges>;

  const groups = groupProjectedCanvasEdges(edges);

  assert.deepEqual(groups.flowRouteEdges.map((edge) => edge.id), ["flow:input->agent", "route:condition:true->output"]);
  assert.deepEqual(groups.dataEdges.map((edge) => edge.id), ["data:agent:answer->output"]);
});

test("projectCanvasAnchors returns flow and state dots for visible nodes", () => {
  const anchors = projectCanvasAnchors(graph);

  assert.ok(anchors.some((anchor) => anchor.kind === "flow-out" && anchor.nodeId === "input_question"));
  assert.ok(anchors.some((anchor) => anchor.kind === "flow-in" && anchor.nodeId === "answer_helper"));
  assert.ok(anchors.some((anchor) => anchor.kind === "state-out" && anchor.stateKey === "question" && anchor.color === "#d97706"));
  assert.ok(anchors.some((anchor) => anchor.kind === "state-in" && anchor.stateKey === "question" && anchor.color === "#d97706"));
});

test("groupProjectedCanvasAnchors separates flow, route, and point anchors", () => {
  const anchors = [
    { id: "flow-in:agent", nodeId: "agent", kind: "flow-in", x: 1, y: 1, side: "left" },
    { id: "flow-out:agent", nodeId: "agent", kind: "flow-out", x: 2, y: 2, side: "right" },
    { id: "route-out:condition:true", nodeId: "condition", kind: "route-out", x: 3, y: 3, side: "right" },
    { id: "state-in:agent:question", nodeId: "agent", kind: "state-in", x: 4, y: 4, side: "left" },
    { id: "state-out:agent:answer", nodeId: "agent", kind: "state-out", x: 5, y: 5, side: "right" },
  ] satisfies ReturnType<typeof projectCanvasAnchors>;

  const groups = groupProjectedCanvasAnchors(anchors);

  assert.deepEqual(groups.flowAnchors.map((anchor) => anchor.id), ["flow-in:agent", "flow-out:agent"]);
  assert.deepEqual(groups.routeHandles.map((anchor) => anchor.id), ["route-out:condition:true"]);
  assert.deepEqual(groups.pointAnchors.map((anchor) => anchor.id), ["state-in:agent:question", "state-out:agent:answer"]);
});

test("projectCanvasEdges colors data links from the state schema", () => {
  const projected = projectCanvasEdges(graph);
  const dataEdge = projected.find((edge) => edge.kind === "data" && edge.state === "answer");

  assert.ok(dataEdge);
  assert.equal(dataEdge?.color, "#a855f7");
  assert.match(dataEdge?.path ?? "", /^M .* C /);
});

test("projectCanvasEdges shows every reachable data writer for a state read", () => {
  const branchingGraph: GraphPayload = {
    graph_id: null,
    name: "Branching data",
    state_schema: {
      answer: {
        name: "answer",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
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
          skillKey: "",
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
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
      sink: {
        kind: "output",
        name: "sink",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "writer_left", target: "sink" },
      { source: "writer_right", target: "sink" },
    ],
    conditional_edges: [],
    metadata: {},
  };

  const projected = projectCanvasEdges(branchingGraph);
  assert.deepEqual(
    projected
      .filter((edge) => edge.kind === "data" && edge.target === "sink")
      .map((edge) => edge.id)
      .sort(),
    ["data:writer_left:answer->sink", "data:writer_right:answer->sink"],
  );
});

test("projectCanvasEdges shows the web research search query flowing from the planner", () => {
  const searchGraph: GraphPayload = {
    graph_id: null,
    name: "Manual search graph",
    state_schema: {
      search_query: { name: "search_query", description: "", type: "text", value: "", color: "#2563eb" },
      search_result: { name: "search_result", description: "", type: "json", value: {}, color: "#7c3aed" },
    },
    nodes: {
      plan_search_query: {
        kind: "agent",
        name: "plan_search_query",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "search_query", mode: "replace" }],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "off", temperature: 0 },
      },
      web_search_agent: {
        kind: "agent",
        name: "web_search_agent",
        description: "",
        ui: { position: { x: 480, y: 0 } },
        reads: [{ state: "search_query", required: true }],
        writes: [{ state: "search_result", mode: "replace" }],
        config: { skillKey: "web_search", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "off", temperature: 0 },
      },
    },
    edges: [{ source: "plan_search_query", target: "web_search_agent" }],
    conditional_edges: [],
    metadata: {},
  };
  const projected = projectCanvasEdges(searchGraph);
  const queryEdge = projected.find((edge) => edge.kind === "data" && edge.state === "search_query" && edge.target === "web_search_agent");

  assert.ok(queryEdge);
  assert.equal(queryEdge.source, "plan_search_query");
  assert.equal(queryEdge.id, "data:plan_search_query:search_query->web_search_agent");
});

test("projectCanvasEdges shows a self feedback data edge for nodes that read and write the same state", () => {
  const feedbackGraph: GraphPayload = {
    graph_id: null,
    name: "Manual feedback graph",
    state_schema: {
      retry_state: { name: "retry_state", description: "", type: "json", value: {}, color: "#7c3aed" },
    },
    nodes: {
      assess_search_sufficiency: {
        kind: "agent",
        name: "assess_search_sufficiency",
        description: "",
        ui: { position: { x: 120, y: 120 } },
        reads: [{ state: "retry_state", required: false }],
        writes: [{ state: "retry_state", mode: "replace" }],
        config: { skillKey: "", taskInstruction: "", modelSource: "global", model: "", thinkingMode: "off", temperature: 0 },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const projected = projectCanvasEdges(feedbackGraph);
  const feedbackEdge = projected.find(
    (edge) =>
      edge.kind === "data" &&
      edge.source === "assess_search_sufficiency" &&
      edge.target === "assess_search_sufficiency" &&
      edge.state === "retry_state",
  );

  assert.ok(feedbackEdge);
  assert.equal(feedbackEdge.id, "data:assess_search_sufficiency:retry_state->assess_search_sufficiency");
  assert.equal(feedbackEdge.color, "#7c3aed");
  assert.match(feedbackEdge.path, /^M .* Q /);
});

test("projectCanvasEdges exposes branch metadata for condition routes", () => {
  const routeGraph: GraphPayload = {
    graph_id: null,
    name: "Route graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: 5,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "",
        ui: { position: { x: 480, y: 120 } },
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
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          retry: "output_answer",
        },
      },
    ],
    metadata: {},
  };

  const projected = projectCanvasEdges(routeGraph);
  const routeEdge = projected.find((edge) => edge.kind === "route");

  assert.ok(routeEdge);
  assert.equal(routeEdge?.branch, "retry");
  assert.equal(
    routeEdge?.path,
    buildSequenceFlowPath({
      sourceX: 560,
      sourceY: 201,
      targetX: 486,
      targetY: 154,
      sourceNodeX: 0,
      sourceNodeY: 0,
      targetNodeX: 480,
      targetNodeY: 120,
    }),
  );
});

test("projectCanvasAnchors respects persisted condition node size for route handles", () => {
  const routeGraph: GraphPayload = {
    graph_id: null,
    name: "Sized route graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "",
        ui: {
          position: { x: 10, y: 20 },
          size: { width: 360, height: 240 },
        },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false", "exhausted"],
          loopLimit: 5,
          branchMapping: {
            true: "true",
            false: "false",
          },
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const routeHandles = projectCanvasAnchors(routeGraph).filter((anchor) => anchor.kind === "route-out");

  assert.deepEqual(
    routeHandles.map((anchor) => ({
      branch: anchor.branch,
      x: anchor.x,
      y: anchor.y,
    })),
    [
      { branch: "true", x: 370, y: 120 },
      { branch: "false", x: 370, y: 176 },
      { branch: "exhausted", x: 370, y: 232 },
    ],
  );
});

test("projectCanvasEdges assigns separate routing lanes to sibling outgoing flow edges", () => {
  const fanoutGraph: GraphPayload = {
    ...graph,
    nodes: {
      ...graph.nodes,
      reviewer: {
        kind: "agent",
        name: "reviewer",
        description: "",
        ui: { position: { x: 980, y: 420 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
    },
    edges: [
      { source: "answer_helper", target: "output_answer" },
      { source: "answer_helper", target: "reviewer" },
    ],
  };

  const projected = projectCanvasEdges(fanoutGraph).filter((edge) => edge.kind === "flow");

  assert.equal(projected.length, 2);
  const primary = projected.find((edge) => edge.target === "output_answer");
  const secondary = projected.find((edge) => edge.target === "reviewer");
  assert.ok(primary?.routing);
  assert.ok(secondary?.routing);
  assert.equal(primary?.routing?.sourceLaneCount, 2);
  assert.equal(secondary?.routing?.sourceLaneCount, 2);
  assert.notEqual(primary?.routing?.sourceLaneIndex, secondary?.routing?.sourceLaneIndex);
});

test("projectCanvasEdges routes upstream flow edges over the cards", () => {
  const upstreamGraph: GraphPayload = {
    ...graph,
    nodes: {
      ...graph.nodes,
      input_question: {
        ...graph.nodes.input_question!,
        ui: { position: { x: 520, y: 220 } },
      },
      answer_helper: {
        ...graph.nodes.answer_helper!,
        ui: { position: { x: 80, y: 220 } },
      },
    },
    edges: [{ source: "input_question", target: "answer_helper" }],
  };

  const projected = projectCanvasEdges(upstreamGraph);
  const flowEdge = projected.find((edge) => edge.id === "flow:input_question->answer_helper");

  assert.ok(flowEdge);
  assert.equal(
    flowEdge.path,
    buildSequenceFlowPath({
      sourceX: 974,
      sourceY: 254,
      targetX: 86,
      targetY: 254,
      sourceNodeX: 520,
      sourceNodeY: 220,
      targetNodeX: 80,
      targetNodeY: 220,
    }),
  );
  assert.match(flowEdge.path, /^M .* Q /);
});

test("projectCanvasEdges routes upstream data edges over the cards", () => {
  const upstreamGraph: GraphPayload = {
    ...graph,
    nodes: {
      ...graph.nodes,
      input_question: {
        ...graph.nodes.input_question!,
        ui: { position: { x: 520, y: 220 } },
      },
      answer_helper: {
        ...graph.nodes.answer_helper!,
        ui: { position: { x: 80, y: 220 } },
      },
    },
    edges: [{ source: "input_question", target: "answer_helper" }],
  };

  const projected = projectCanvasEdges(upstreamGraph);
  const dataEdge = projected.find((edge) => edge.id === "data:input_question:question->answer_helper");

  assert.ok(dataEdge);
  assert.match(dataEdge.path, /^M .* Q /);
});
