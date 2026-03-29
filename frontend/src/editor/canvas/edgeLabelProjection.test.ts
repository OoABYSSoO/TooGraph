import test from "node:test";
import assert from "node:assert/strict";

import { projectCanvasEdges } from "./edgeProjection.ts";
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

test("projectCanvasEdges does not expose inline label pills for data edges", () => {
  const projected = projectCanvasEdges(graph);
  const dataEdge = projected.find((edge) => edge.kind === "data" && edge.state === "answer");

  assert.ok(dataEdge);
  assert.equal(dataEdge?.label, undefined);
});
