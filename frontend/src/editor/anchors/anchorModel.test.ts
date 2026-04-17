import test from "node:test";
import assert from "node:assert/strict";

import { buildAnchorModel } from "./anchorModel.ts";
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
      systemInstruction: "",
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
