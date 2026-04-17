import test from "node:test";
import assert from "node:assert/strict";

import type { CanonicalGraphPayload } from "./node-system-canonical.ts";
import {
  buildDisplayPortsForCanonicalNode,
  buildStateBindingNodeOptions,
  buildStateBindingsByKeyFromCanonicalGraph,
  listStateBindingNodeIdsForCanonicalState,
} from "./node-system-state-panel.ts";

const GRAPH: CanonicalGraphPayload = {
  graph_id: null,
  name: "Hello World",
  state_schema: {
    question: {
      name: "User Question",
      description: "Question from the user.",
      type: "text",
      value: "什么是 GraphiteUI？",
      color: "#d97706",
    },
    answer: {
      name: "Final Answer",
      description: "Answer from the assistant.",
      type: "text",
      value: "",
      color: "#7c3aed",
    },
  },
  nodes: {
    input_question: {
      kind: "input",
      name: "Question Input",
      description: "Provide the user question.",
      ui: {
        position: { x: 80, y: 220 },
        collapsed: false,
      },
      reads: [],
      writes: [{ state: "question", mode: "replace" }],
      config: {
        value: "什么是 GraphiteUI？",
      },
    },
    answer_helper: {
      kind: "agent",
      name: "Answer Helper",
      description: "Answer the question directly.",
      ui: {
        position: { x: 520, y: 220 },
        collapsed: false,
      },
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
      name: "Answer Output",
      description: "Preview the final answer.",
      ui: {
        position: { x: 980, y: 220 },
        collapsed: false,
      },
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
  edges: [],
  conditional_edges: [],
  metadata: {},
};

test("buildStateBindingNodeOptions uses canonical node and state labels", () => {
  const options = buildStateBindingNodeOptions(GRAPH);

  assert.equal(options.length, 3);
  assert.deepEqual(
    options.map((option) => option.label),
    ["Question Input", "Answer Helper", "Answer Output"],
  );
  assert.deepEqual(options[0].outputs.map((port) => port.label), ["User Question"]);
  assert.deepEqual(options[1].inputs.map((port) => port.label), ["User Question"]);
  assert.deepEqual(options[1].outputs.map((port) => port.label), ["Final Answer"]);
  assert.deepEqual(options[2].inputs.map((port) => port.label), ["Final Answer"]);
});

test("buildDisplayPortsForCanonicalNode derives visible port labels directly from canonical state names", () => {
  const ports = buildDisplayPortsForCanonicalNode(GRAPH, "answer_helper");

  assert.deepEqual(ports.inputs.map((port) => port.label), ["User Question"]);
  assert.deepEqual(ports.outputs.map((port) => port.label), ["Final Answer"]);
});

test("output nodes are not exposed as writer candidates in state binding options", () => {
  const options = buildStateBindingNodeOptions(GRAPH);

  const outputNode = options.find((option) => option.id === "output_answer");

  assert.ok(outputNode);
  assert.deepEqual(outputNode.inputs.map((port) => port.label), ["Final Answer"]);
  assert.deepEqual(outputNode.outputs, []);
});

test("buildStateBindingsByKeyFromCanonicalGraph summarizes readers and writers from canonical bindings", () => {
  const bindings = buildStateBindingsByKeyFromCanonicalGraph(GRAPH);

  assert.deepEqual(bindings.writersByKey.question?.map((binding) => binding.nodeLabel), ["Question Input"]);
  assert.deepEqual(bindings.readersByKey.question?.map((binding) => binding.nodeLabel), ["Answer Helper"]);
  assert.deepEqual(bindings.writersByKey.answer?.map((binding) => binding.nodeLabel), ["Answer Helper"]);
  assert.deepEqual(bindings.readersByKey.answer?.map((binding) => binding.nodeLabel), ["Answer Output"]);
  assert.deepEqual(bindings.readersByKey.question?.map((binding) => binding.portLabel), ["User Question"]);
  assert.deepEqual(bindings.writersByKey.answer?.map((binding) => binding.portLabel), ["Final Answer"]);
});

test("buildStateBindingNodeOptions ignores editor-only port mirrors and stays fully canonical", () => {
  const options = buildStateBindingNodeOptions(GRAPH);

  const helper = options.find((option) => option.id === "answer_helper");

  assert.ok(helper);
  assert.deepEqual(helper.inputs.map((port) => port.key), ["question"]);
  assert.deepEqual(helper.inputs.map((port) => port.label), ["User Question"]);
  assert.deepEqual(helper.outputs.map((port) => port.key), ["answer"]);
  assert.deepEqual(helper.outputs.map((port) => port.label), ["Final Answer"]);
});

test("listStateBindingNodeIdsForCanonicalState returns reader and writer node ids from canonical bindings", () => {
  const bindingNodeIds = listStateBindingNodeIdsForCanonicalState(GRAPH, "question");

  assert.deepEqual(bindingNodeIds.readerNodeIds, ["answer_helper"]);
  assert.deepEqual(bindingNodeIds.writerNodeIds, ["input_question"]);
});
