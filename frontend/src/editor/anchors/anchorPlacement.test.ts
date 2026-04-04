import test from "node:test";
import assert from "node:assert/strict";

import { buildAnchorModel } from "./anchorModel.ts";
import { placeAnchors, resolveRouteOutputRowGap } from "./anchorPlacement.ts";
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
    skillKey: "",
    taskInstruction: "请直接回答。",
    modelSource: "global",
    model: "",
    thinkingMode: "on",
    temperature: 0.2,
  },
};

const conditionNode: GraphNode = {
  kind: "condition",
  name: "score_gate",
  description: "Route based on score.",
  ui: {
    position: { x: 780, y: 220 },
  },
  reads: [{ state: "score", required: true }],
  writes: [],
  config: {
    branches: ["true", "false", "exhausted"],
    loopLimit: 3,
    branchMapping: {
      true: "true",
      false: "false",
    },
    rule: {
      source: "score",
      operator: ">=",
      value: 60,
    },
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

test("placeAnchors gives condition nodes a left flow entry and right-side route exits", () => {
  const model = buildAnchorModel("score_gate", conditionNode);
  const placement = placeAnchors(model, {
    x: 780,
    y: 220,
    width: 460,
    headerHeight: 68,
    bodyTop: 116,
    rowGap: 52,
    footerTop: 148,
  });

  assert.deepEqual(placement.flowIn, {
    id: "flow-in",
    x: 786,
    y: 254,
    side: "left",
  });
  assert.equal(placement.flowOut, null);
  assert.deepEqual(placement.stateInputs[0], {
    id: "state-in:score",
    stateKey: "score",
    x: 786,
    y: 365,
    side: "left",
  });
  assert.deepEqual(
    placement.routeOutputs.map((anchor) => ({
      id: anchor.id,
      branch: anchor.branch,
      x: anchor.x,
      y: anchor.y,
      side: anchor.side,
    })),
    [
      { id: "branch:true", branch: "true", x: 1240, y: 365, side: "right" },
      { id: "branch:false", branch: "false", x: 1240, y: 421, side: "right" },
      { id: "branch:exhausted", branch: "exhausted", x: 1240, y: 477, side: "right" },
    ],
  );
});

test("placeAnchors keeps condition route exits inside the rendered frame height", () => {
  const model = buildAnchorModel("score_gate", conditionNode);
  const placement = placeAnchors(model, {
    x: 780,
    y: 220,
    width: 320,
    height: 220,
    headerHeight: 68,
    bodyTop: 116,
    rowGap: 44,
    footerTop: 148,
  });

  assert.deepEqual(
    placement.routeOutputs.map((anchor) => ({
      branch: anchor.branch,
      x: anchor.x,
      y: anchor.y,
    })),
    [
      { branch: "true", x: 1100, y: 300 },
      { branch: "false", x: 1100, y: 356 },
      { branch: "exhausted", x: 1100, y: 412 },
    ],
  );
});

test("placeAnchors keeps condition route exits pinned while the frame grows taller", () => {
  const model = buildAnchorModel("score_gate", conditionNode);
  const baseFrame = {
    x: 780,
    y: 220,
    width: 460,
    headerHeight: 68,
    bodyTop: 116,
    rowGap: 44,
    footerTop: 148,
  };

  const compactPlacement = placeAnchors(model, { ...baseFrame, height: 320 });
  const tallPlacement = placeAnchors(model, { ...baseFrame, height: 620 });

  assert.deepEqual(
    compactPlacement.routeOutputs.map((anchor) => anchor.y),
    tallPlacement.routeOutputs.map((anchor) => anchor.y),
  );
});

test("resolveRouteOutputRowGap keeps route handles compact without overlapping", () => {
  assert.equal(resolveRouteOutputRowGap(0, 52), 52);
  assert.equal(resolveRouteOutputRowGap(1, 52), 52);
  assert.equal(resolveRouteOutputRowGap(3, 52), 56);
});
