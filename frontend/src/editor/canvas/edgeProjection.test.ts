import test from "node:test";
import assert from "node:assert/strict";

import { projectCanvasAnchors, projectCanvasEdges } from "./edgeProjection.ts";
import type { GraphPayload } from "../../types/node-system.ts";

const graph: GraphPayload = {
  graph_id: null,
  name: "Hello World",
  state_schema: {},
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
        systemInstruction: "",
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
  assert.match(projected[0]!.path, /^M /);
  assert.match(projected[1]!.path, /^M /);
});

test("projectCanvasAnchors returns flow and state dots for visible nodes", () => {
  const anchors = projectCanvasAnchors(graph);

  assert.ok(anchors.some((anchor) => anchor.kind === "flow-out" && anchor.nodeId === "input_question"));
  assert.ok(anchors.some((anchor) => anchor.kind === "flow-in" && anchor.nodeId === "answer_helper"));
  assert.ok(anchors.some((anchor) => anchor.kind === "state-out" && anchor.stateKey === "question"));
  assert.ok(anchors.some((anchor) => anchor.kind === "state-in" && anchor.stateKey === "question"));
});

test("projectCanvasEdges skips ambiguous data writers", () => {
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
          skills: [],
          systemInstruction: "",
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
          skills: [],
          systemInstruction: "",
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
  assert.equal(projected.filter((edge) => edge.kind === "data" && edge.target === "sink").length, 0);
});
