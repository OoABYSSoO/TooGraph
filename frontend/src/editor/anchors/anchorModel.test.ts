import test from "node:test";
import assert from "node:assert/strict";

import { buildAnchorModel } from "./anchorModel.ts";
import { VIRTUAL_ANY_INPUT_STATE_KEY } from "../../lib/virtual-any-input.ts";
import type { GraphNode } from "../../types/node-system.ts";

test("buildAnchorModel creates flow and state anchors for agent nodes", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "answer_helper",
    description: "Answer the user question.",
    ui: {
      position: { x: 520, y: 220 },
    },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skills: [],
      taskInstruction: "请直接回答。",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };

  const model = buildAnchorModel("answer_helper", node);

  assert.equal(model.nodeId, "answer_helper");
  assert.equal(model.flowIn?.id, "flow-in");
  assert.equal(model.flowOut?.id, "flow-out");
  assert.equal(model.stateInputs.length, 1);
  assert.equal(model.stateOutputs.length, 1);
  assert.equal(model.stateInputs[0]?.stateKey, "question");
  assert.equal(model.stateOutputs[0]?.stateKey, "answer");
});

test("buildAnchorModel creates route outputs for condition nodes", () => {
  const node: GraphNode = {
    kind: "condition",
    name: "continue_check",
    description: "Continue or retry.",
    ui: {
      position: { x: 780, y: 220 },
    },
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

  const model = buildAnchorModel("continue_check", node);

  assert.equal(model.flowIn?.id, "flow-in");
  assert.equal(model.flowOut, null);
  assert.equal(model.routeOutputs.length, 2);
  assert.equal(model.routeOutputs[0]?.id, "branch:continue");
  assert.equal(model.routeOutputs[1]?.id, "branch:retry");
});

test("buildAnchorModel exposes a virtual any state input for non-input nodes without reads", () => {
  const emptyAgent: GraphNode = {
    kind: "agent",
    name: "empty_agent",
    description: "Blank agent.",
    ui: { position: { x: 520, y: 220 } },
    reads: [],
    writes: [],
    config: {
      skills: [],
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };
  const emptyOutput: GraphNode = {
    kind: "output",
    name: "output",
    description: "Preview output.",
    ui: { position: { x: 920, y: 220 } },
    reads: [],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };
  const inputNode: GraphNode = {
    kind: "input",
    name: "input",
    description: "Provide input.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "value", mode: "replace" }],
    config: {
      value: "",
    },
  };

  const agentModel = buildAnchorModel("empty_agent", emptyAgent);
  const outputModel = buildAnchorModel("output", emptyOutput);
  const inputModel = buildAnchorModel("input", inputNode);

  assert.deepEqual(agentModel.stateInputs.map((anchor) => anchor.stateKey), [VIRTUAL_ANY_INPUT_STATE_KEY]);
  assert.deepEqual(outputModel.stateInputs.map((anchor) => anchor.stateKey), [VIRTUAL_ANY_INPUT_STATE_KEY]);
  assert.deepEqual(inputModel.stateInputs, []);
});
