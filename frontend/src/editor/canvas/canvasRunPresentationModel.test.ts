import test from "node:test";
import assert from "node:assert/strict";

import {
  isCanvasNodeVisuallySelected,
  isHumanReviewRunNode,
  resolveRunNodeClassListForCanvasNode,
  resolveRunNodePresentationForCanvasNode,
} from "./canvasRunPresentationModel.ts";

test("canvas run presentation model treats awaiting-human current node as human review", () => {
  assert.equal(
    isHumanReviewRunNode({
      nodeId: "review",
      currentRunNodeId: "review",
      latestRunStatus: "awaiting_human",
    }),
    true,
  );
  assert.equal(
    isHumanReviewRunNode({
      nodeId: "review",
      currentRunNodeId: "other",
      latestRunStatus: "awaiting_human",
    }),
    false,
  );
  assert.equal(
    isHumanReviewRunNode({
      nodeId: "review",
      currentRunNodeId: "review",
      latestRunStatus: "running",
    }),
    false,
  );
});

test("canvas run presentation model forces human-review current node to paused presentation", () => {
  assert.deepEqual(
    resolveRunNodePresentationForCanvasNode({
      nodeId: "review",
      currentRunNodeId: "review",
      latestRunStatus: "awaiting_human",
      runNodeStatusByNodeId: { review: "running" },
    }),
    {
      haloClass: "editor-canvas__node-halo--paused",
      shellClass: "editor-canvas__node--paused",
    },
  );
});

test("canvas run presentation model otherwise follows per-node run status", () => {
  assert.deepEqual(
    resolveRunNodePresentationForCanvasNode({
      nodeId: "agent",
      currentRunNodeId: "review",
      latestRunStatus: "awaiting_human",
      runNodeStatusByNodeId: { agent: "success" },
    }),
    {
      haloClass: null,
      shellClass: "editor-canvas__node--success",
    },
  );
  assert.equal(
    resolveRunNodePresentationForCanvasNode({
      nodeId: "agent",
      currentRunNodeId: null,
      latestRunStatus: null,
      runNodeStatusByNodeId: {},
    }),
    null,
  );
});

test("canvas run presentation model builds class lists and visual selection", () => {
  assert.deepEqual(
    resolveRunNodeClassListForCanvasNode({
      nodeId: "agent",
      runNodeStatusByNodeId: { agent: "failed" },
    }),
    ["editor-canvas__node--failed"],
  );
  assert.deepEqual(resolveRunNodeClassListForCanvasNode({ nodeId: "agent" }), []);

  assert.equal(isCanvasNodeVisuallySelected({ nodeId: "agent", selectedNodeId: "agent" }), true);
  assert.equal(
    isCanvasNodeVisuallySelected({
      nodeId: "review",
      selectedNodeId: null,
      currentRunNodeId: "review",
      latestRunStatus: "awaiting_human",
    }),
    true,
  );
  assert.equal(isCanvasNodeVisuallySelected({ nodeId: "agent", selectedNodeId: "other" }), false);
});
