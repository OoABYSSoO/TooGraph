import assert from "node:assert/strict";
import test from "node:test";

import type { BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";
import { buildBuddyOutputTraceTreeRows } from "./buddyOutputTraceTree.ts";

const baseRecord = {
  kind: "node" as const,
  status: "completed" as const,
  startedAtMs: 1000,
  completedAtMs: 1200,
  durationMs: 200,
  nodeType: "agent",
};

test("buildBuddyOutputTraceTreeRows renders main and subgraph records as an indented tree", () => {
  const segment: BuddyOutputTraceSegment = {
    segmentId: "boundary:final",
    boundaryNodeId: "final",
    boundaryLabel: "主图输出",
    outputNodeIds: ["output_final"],
    status: "completed",
    startedAtMs: 1000,
    completedAtMs: 2400,
    durationMs: 1400,
    records: [
      {
        ...baseRecord,
        recordId: "record_a",
        runtimeKey: "node:main_a",
        label: "主图节点 A",
        nodeId: "main_a",
        subgraphNodeId: null,
      },
      {
        ...baseRecord,
        recordId: "record_subgraph",
        runtimeKey: "node:subgraph_a",
        label: "子图 A",
        nodeId: "subgraph_a",
        nodeType: "subgraph",
        subgraphNodeId: null,
        aggregateSubgraphNodeId: "subgraph_a",
      },
      {
        ...baseRecord,
        recordId: "record_inner_1",
        runtimeKey: "node:subgraph_a/inner_1",
        label: "子图 A / 子图节点 1",
        nodeId: "inner_1",
        subgraphNodeId: "subgraph_a",
      },
      {
        ...baseRecord,
        recordId: "record_inner_2",
        runtimeKey: "node:subgraph_a/inner_2",
        label: "子图 A / 子图节点 2",
        nodeId: "inner_2",
        subgraphNodeId: "subgraph_a",
      },
      {
        ...baseRecord,
        recordId: "record_b",
        runtimeKey: "node:main_b",
        label: "主图节点 B",
        nodeId: "main_b",
        subgraphNodeId: null,
      },
    ],
  };

  const rows = buildBuddyOutputTraceTreeRows(segment, { rootLabel: "主图开始" });

  assert.deepEqual(
    rows.map((row) => ({ label: row.label, depth: row.depth, kind: row.kind, canOpen: Boolean(row.playbackTarget) })),
    [
      { label: "主图开始", depth: 0, kind: "root", canOpen: true },
      { label: "主图节点 A", depth: 0, kind: "node", canOpen: false },
      { label: "子图 A", depth: 0, kind: "subgraph", canOpen: true },
      { label: "子图节点 1", depth: 1, kind: "node", canOpen: false },
      { label: "子图节点 2", depth: 1, kind: "node", canOpen: false },
      { label: "主图节点 B", depth: 0, kind: "node", canOpen: false },
    ],
  );
});

