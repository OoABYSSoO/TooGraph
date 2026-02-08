import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "../../types/node-system.ts";
import { resolveCanvasLayout } from "./resolvedCanvasLayout.ts";

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
      config: { value: "什么是 GraphiteUI？" },
    },
    answer_helper: {
      kind: "agent",
      name: "answer_helper",
      description: "Answer the question directly without external tools.",
      ui: { position: { x: 520, y: 220 } },
      reads: [{ state: "question", required: true }],
      writes: [{ state: "answer", mode: "replace" }],
      config: {
        skills: [],
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
  assert.match(flowEdge?.path ?? "", /^M 534 254 C /);
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

  assert.match(flowEdge?.path ?? "", /^M 540 330 C /);
});
