import test from "node:test";
import assert from "node:assert/strict";

import { buildNodeCardViewModel } from "./nodeCardViewModel.ts";
import type { GraphNode, StateDefinition } from "../../types/node-system.ts";

const stateSchema: Record<string, StateDefinition> = {
  question: {
    name: "question",
    description: "User question for the workflow.",
    type: "text",
    value: "什么是 GraphiteUI？",
    color: "#d97706",
  },
  answer: {
    name: "answer",
    description: "Answer produced by the agent.",
    type: "text",
    value: "",
    color: "#7c3aed",
  },
};

test("buildNodeCardViewModel derives input body and output label", () => {
  const node: GraphNode = {
    kind: "input",
    name: "input_question",
    description: "Provide the user question.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "question", mode: "replace" }],
    config: {
      value: "什么是 GraphiteUI？",
    },
  };

  const model = buildNodeCardViewModel("input_question", node, stateSchema);

  assert.equal(model.body.kind, "input");
  assert.equal(model.body.valueText, "什么是 GraphiteUI？");
  assert.equal(model.body.primaryOutput?.label, "question");
});

test("buildNodeCardViewModel derives agent body, ports, and labels", () => {
  const node: GraphNode = {
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
  };

  const model = buildNodeCardViewModel("answer_helper", node, stateSchema);

  assert.equal(model.kindLabel, "AGENT");
  assert.deepEqual(model.inputs.map((port) => port.label), ["question"]);
  assert.deepEqual(model.outputs.map((port) => port.label), ["answer"]);
  assert.equal(model.body.kind, "agent");
  assert.equal(model.body.taskInstruction, "请直接用中文回答用户问题。");
  assert.equal(model.body.primaryInput?.label, "question");
  assert.equal(model.body.primaryOutput?.label, "answer");
});

test("buildNodeCardViewModel derives output preview source from state schema", () => {
  const node: GraphNode = {
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
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema);

  assert.equal(model.kindLabel, "OUTPUT");
  assert.equal(model.body.kind, "output");
  assert.equal(model.body.previewTitle, "Preview");
  assert.equal(model.body.connectedStateLabel, "answer");
  assert.equal(model.body.displayModeLabel, "AUTO");
});

test("buildNodeCardViewModel derives condition branches and rule summary", () => {
  const node: GraphNode = {
    kind: "condition",
    name: "continue_check",
    description: "Continue or retry.",
    ui: { position: { x: 780, y: 220 } },
    reads: [{ state: "answer", required: true }],
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
  };

  const model = buildNodeCardViewModel("continue_check", node, stateSchema);

  assert.equal(model.body.kind, "condition");
  assert.deepEqual(model.branches.map((branch) => branch.label), ["continue", "retry"]);
  assert.equal(model.body.ruleSummary, "answer exists");
  assert.equal(model.body.loopLimitLabel, "Loop · 5");
  assert.deepEqual(model.body.branchMappings, [
    { branch: "continue", matchValues: ["true"] },
    { branch: "retry", matchValues: ["false"] },
  ]);
});
