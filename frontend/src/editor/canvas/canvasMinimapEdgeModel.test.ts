import test from "node:test";
import assert from "node:assert/strict";

import type { ProjectedCanvasEdge } from "./edgeProjection.ts";
import { buildMinimapEdgeModels } from "./canvasMinimapEdgeModel.ts";

const edges: ProjectedCanvasEdge[] = [
  edge("flow:input->agent", "flow", "input", "agent"),
  edge("route:gate:true->output", "route", "gate", "output", "true"),
  edge("data:agent:answer->output", "data", "agent", "output", undefined, "#2563eb"),
];

test("canvas minimap edge model keeps only visible edge ids", () => {
  assert.deepEqual(
    buildMinimapEdgeModels({
      edges,
      visibleEdgeIds: new Set(["route:gate:true->output", "data:agent:answer->output"]),
    }),
    [
      {
        id: "route:gate:true->output",
        kind: "route",
        path: "M 0 0 L 1 1",
        color: "#16a34a",
      },
      {
        id: "data:agent:answer->output",
        kind: "data",
        path: "M 0 0 L 1 1",
        color: "#2563eb",
      },
    ],
  );
});

function edge(
  id: string,
  kind: ProjectedCanvasEdge["kind"],
  source: string,
  target: string,
  branch?: string,
  color?: string,
): ProjectedCanvasEdge {
  return {
    id,
    kind,
    source,
    target,
    branch,
    color,
    path: "M 0 0 L 1 1",
  };
}
