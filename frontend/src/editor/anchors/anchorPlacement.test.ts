import test from "node:test";
import assert from "node:assert/strict";

import { buildAnchorModel } from "./anchorModel.ts";
import { placeAnchors } from "./anchorPlacement.ts";
import type { GraphNode } from "../../types/node-system.ts";

const agentNode: GraphNode = {
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

test("placeAnchors projects model anchors onto canvas coordinates", () => {
  const model = buildAnchorModel("answer_helper", agentNode);
  const placement = placeAnchors(model, {
    x: 520,
    y: 220,
    width: 360,
    headerHeight: 64,
    bodyTop: 92,
    rowGap: 26,
  });

  assert.deepEqual(placement.flowIn, {
    id: "flow-in",
    x: 520,
    y: 252,
  });
  assert.deepEqual(placement.flowOut, {
    id: "flow-out",
    x: 880,
    y: 252,
  });
  assert.deepEqual(placement.stateInputs[0], {
    id: "state-in:question",
    stateKey: "question",
    x: 520,
    y: 312,
  });
  assert.deepEqual(placement.stateOutputs[0], {
    id: "state-out:answer",
    stateKey: "answer",
    x: 880,
    y: 312,
  });
});
