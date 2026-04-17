import assert from "node:assert/strict";
import test from "node:test";
import type { Edge } from "@xyflow/react";

import { decorateFlowEdges } from "./node-system-edge-visuals.ts";

const baseEdge: Edge = {
  id: "edge:a:output:q:b:input:q",
  source: "a",
  target: "b",
  sourceHandle: "output:q",
  targetHandle: "input:q",
  style: {
    stroke: "#d97706",
    strokeWidth: 1.8,
  },
};

test("decorateFlowEdges leaves unrelated edges unchanged", () => {
  const [edge] = decorateFlowEdges([baseEdge], new Set(), new Set());
  assert.deepEqual(edge, baseEdge);
});

test("decorateFlowEdges marks back edges with animated dashed styling", () => {
  const [edge] = decorateFlowEdges([baseEdge], new Set([baseEdge.id]), new Set());
  assert.equal(edge.animated, true);
  assert.equal(edge.style?.strokeDasharray, "8 5");
  assert.equal(edge.style?.strokeWidth, 2.4);
});

test("decorateFlowEdges emphasizes active edges and preserves back-edge styling when both apply", () => {
  const [edge] = decorateFlowEdges([baseEdge], new Set([baseEdge.id]), new Set([baseEdge.id]));
  assert.equal(edge.animated, true);
  assert.equal(edge.style?.strokeDasharray, "8 5");
  assert.equal(edge.style?.strokeWidth, 3);
  assert.equal(edge.style?.opacity, 1);
});
