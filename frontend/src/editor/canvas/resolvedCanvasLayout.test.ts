import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "../../types/node-system.ts";
import { resolveCanvasLayout } from "./resolvedCanvasLayout.ts";
import { buildSequenceFlowPath } from "./flowEdgePath.ts";

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

test("resolveCanvasLayout prefers measured output slot offsets over formula-based state anchors", () => {
  const layout = resolveCanvasLayout(graph, {
    "input_question:state-out:question": {
      offsetX: 392,
      offsetY: 141,
    },
  });

  const measuredAnchor = layout.anchors.find((anchor) => anchor.id === "input_question:state-out:question");
  const dataEdge = layout.edges.find((edge) => edge.id === "data:input_question:question->answer_helper");
  const flowEdge = layout.edges.find((edge) => edge.id === "flow:input_question->answer_helper");

  assert.deepEqual(
    measuredAnchor && { x: measuredAnchor.x, y: measuredAnchor.y },
    {
      x: 472,
      y: 361,
    },
  );
  assert.match(dataEdge?.path ?? "", /^M 472 361 C /);
  assert.equal(
    flowEdge?.path ?? "",
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
});

test("resolveCanvasLayout also uses measured flow anchor offsets for card-to-card flow edges", () => {
  const layout = resolveCanvasLayout(graph, {
    "input_question:flow-out": {
      offsetX: 460,
      offsetY: 110,
    },
    "answer_helper:flow-in": {
      offsetX: 0,
      offsetY: 110,
    },
  });

  const flowEdge = layout.edges.find((edge) => edge.id === "flow:input_question->answer_helper");

  assert.equal(
    flowEdge?.path ?? "",
    buildSequenceFlowPath({
      sourceX: 540,
      sourceY: 330,
      targetX: 520,
      targetY: 330,
      sourceNodeX: 80,
      sourceNodeY: 220,
      targetNodeX: 520,
      targetNodeY: 220,
    }),
  );
});

test("resolveCanvasLayout keeps condition route handles tied to the current node size", () => {
  const layout = resolveCanvasLayout(
    {
      graph_id: null,
      name: "Route resize graph",
      state_schema: {},
      nodes: {
        route_gate: {
          kind: "condition",
          name: "route_gate",
          description: "",
          ui: {
            position: { x: 100, y: 100 },
            size: { width: 560, height: 280 },
          },
          reads: [],
          writes: [],
          config: {
            branches: ["true", "false", "exhausted"],
            loopLimit: 5,
            branchMapping: { true: "true", false: "false" },
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
    },
    {
      "route_gate:branch:true": { offsetX: 554, offsetY: 145 },
      "route_gate:branch:false": { offsetX: 554, offsetY: 199 },
      "route_gate:branch:exhausted": { offsetX: 554, offsetY: 252 },
    },
    {
      route_gate: { width: 720, height: 360 },
    },
  );

  const routeHandles = layout.anchors.filter((anchor) => anchor.kind === "route-out");

  assert.deepEqual(
    routeHandles.map((anchor) => ({
      branch: anchor.branch,
      x: anchor.x,
      y: anchor.y,
    })),
    [
      { branch: "true", x: 820, y: 245 },
      { branch: "false", x: 820, y: 301 },
      { branch: "exhausted", x: 820, y: 357 },
    ],
  );
});
