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
    x: 526,
    y: 252,
    side: "left",
  });
  assert.deepEqual(placement.flowOut, {
    id: "flow-out",
    x: 874,
    y: 252,
    side: "right",
  });
  assert.deepEqual(placement.stateInputs[0], {
    id: "state-in:question",
    stateKey: "question",
    x: 526,
    y: 341,
    side: "left",
  });
  assert.deepEqual(placement.stateOutputs[0], {
    id: "state-out:answer",
    stateKey: "answer",
    x: 840,
    y: 341,
    side: "right",
  });
});
