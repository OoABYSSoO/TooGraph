import test from "node:test";
import assert from "node:assert/strict";

import type { SubgraphThumbnailEdgeViewModel, SubgraphThumbnailNodeViewModel } from "./nodeCardViewModel.ts";
import {
  SUBGRAPH_MINI_MAP_LAYOUT_DEFAULTS,
  buildSubgraphMiniMapLayout,
  resolveSubgraphMiniMapColumnCount,
} from "./subgraphMiniMapLayout.ts";

function requiredWidthForColumns(columnCount: number) {
  const config = SUBGRAPH_MINI_MAP_LAYOUT_DEFAULTS;
  return config.paddingX * 2 + columnCount * config.nodeWidth + Math.max(0, columnCount - 1) * config.columnGap;
}

function makeNode(id: string): SubgraphThumbnailNodeViewModel {
  return {
    id,
    label: id,
    kind: "agent",
    column: 99,
    row: 99,
    status: "idle",
    active: false,
  };
}

test("resolveSubgraphMiniMapColumnCount defaults to four columns and wraps by available width", () => {
  assert.equal(resolveSubgraphMiniMapColumnCount(9, Number.POSITIVE_INFINITY), 4);
  assert.equal(resolveSubgraphMiniMapColumnCount(9, requiredWidthForColumns(4)), 4);
  assert.equal(resolveSubgraphMiniMapColumnCount(9, requiredWidthForColumns(4) - 1), 3);
  assert.equal(resolveSubgraphMiniMapColumnCount(9, requiredWidthForColumns(2) + 1), 2);
  assert.equal(resolveSubgraphMiniMapColumnCount(9, requiredWidthForColumns(1)), 1);
});

test("buildSubgraphMiniMapLayout lays nodes out row-major from the measured width", () => {
  const layout = buildSubgraphMiniMapLayout(["one", "two", "three", "four", "five"].map(makeNode), [], requiredWidthForColumns(4));

  assert.equal(layout.columnCount, 4);
  assert.equal(layout.rowCount, 2);
  assert.deepEqual(
    layout.nodes.map((node) => ({ id: node.id, column: node.column, row: node.row })),
    [
      { id: "one", column: 1, row: 1 },
      { id: "two", column: 2, row: 1 },
      { id: "three", column: 3, row: 1 },
      { id: "four", column: 4, row: 1 },
      { id: "five", column: 1, row: 2 },
    ],
  );
});

test("buildSubgraphMiniMapLayout routes sequence edges as curves from right output to left input frames", () => {
  const nodes = ["one", "two", "three", "four", "five"].map(makeNode);
  const edges: SubgraphThumbnailEdgeViewModel[] = [
    { source: "one", target: "two", active: false, status: "idle" },
    { source: "two", target: "one", active: false, status: "idle" },
    { source: "three", target: "five", active: false, status: "idle" },
  ];

  const layout = buildSubgraphMiniMapLayout(nodes, edges, requiredWidthForColumns(4));

  assert.equal(layout.edges[0]?.path ?? "", "M 162 43 L 176 43 C 183 43 183 43 190 43 L 204 43");
  assert.equal(
    layout.edges[1]?.path ?? "",
    [
      "M 340 43",
      "L 354 43",
      "L 358 43",
      "Q 362 43 362 39",
      "L 362 14",
      "Q 362 6 354 6",
      "L 12 6",
      "Q 4 6 4 14",
      "L 4 39",
      "Q 4 43 8 43",
      "L 12 43",
      "L 26 43",
    ].join(" "),
  );
  assert.equal(
    layout.edges[2]?.path ?? "",
    [
      "M 518 43",
      "L 532 43",
      "L 536 43",
      "Q 540 43 540 39",
      "L 540 14",
      "Q 540 6 532 6",
      "L 12 6",
      "Q 4 6 4 14",
      "L 4 119",
      "Q 4 123 8 123",
      "L 12 123",
      "L 26 123",
    ].join(" "),
  );
});
