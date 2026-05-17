import assert from "node:assert/strict";
import test from "node:test";

import type { BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";
import type { RunTreeNode } from "../types/run.ts";
import { buildBuddyOutputTraceTreeRows } from "./buddyOutputTraceTree.ts";

const baseRecord = {
  kind: "node" as const,
  status: "completed" as const,
  startedAtMs: 1000,
  completedAtMs: 1200,
  durationMs: 200,
  nodeType: "agent",
};

function createRunTreeNode(overrides: Partial<RunTreeNode> & Pick<RunTreeNode, "run_id">): RunTreeNode {
  return {
    run_id: overrides.run_id,
    graph_id: overrides.graph_id ?? "graph_1",
    graph_name: overrides.graph_name ?? "Run",
    status: overrides.status ?? "completed",
    runtime_backend: "langgraph",
    lifecycle: {
      updated_at: "2026-04-18T00:00:00Z",
      resume_count: 0,
    },
    checkpoint_metadata: {
      available: false,
    },
    revision_round: 0,
    started_at: "2026-04-18T00:00:00Z",
    current_node_id: overrides.current_node_id ?? null,
    final_result: overrides.final_result ?? "",
    parent_run_id: overrides.parent_run_id ?? "",
    root_run_id: overrides.root_run_id ?? overrides.run_id,
    parent_node_id: overrides.parent_node_id ?? "",
    invocation_kind: overrides.invocation_kind ?? "",
    invocation_key: overrides.invocation_key ?? "",
    run_depth: overrides.run_depth ?? 0,
    run_path: overrides.run_path ?? [overrides.run_id],
    batch_group_id: overrides.batch_group_id ?? "",
    batch_item_index: overrides.batch_item_index ?? null,
    batch_item_label: overrides.batch_item_label ?? "",
    children: overrides.children ?? [],
    duration_ms: overrides.duration_ms ?? null,
  };
}

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

test("buildBuddyOutputTraceTreeRows exposes activity evidence labels", () => {
  const segment: BuddyOutputTraceSegment = {
    segmentId: "boundary:final",
    boundaryNodeId: "final",
    boundaryLabel: "主图输出",
    outputNodeIds: ["output_final"],
    status: "completed",
    startedAtMs: 1000,
    completedAtMs: 1300,
    durationMs: 300,
    records: [
      {
        ...baseRecord,
        kind: "activity",
        recordId: "record_activity",
        runtimeKey: "activity:1:main_a",
        label: "A / Virtual template run",
        nodeId: "main_a",
        nodeType: "activity",
        subgraphNodeId: null,
        artifactLabels: ["artifacts: 2", "retries: 5"],
        triggeredRunId: "run_report",
      },
    ],
  };

  const rows = buildBuddyOutputTraceTreeRows(segment, { rootLabel: "主图开始" });

  assert.deepEqual(rows[1].artifactLabels, ["artifacts: 2", "retries: 5"]);
  assert.equal(rows[1].evidenceRunId, "run_report");
});

test("buildBuddyOutputTraceTreeRows exposes graph revision restore metadata", () => {
  const segment: BuddyOutputTraceSegment = {
    segmentId: "boundary:final",
    boundaryNodeId: "final",
    boundaryLabel: "主图输出",
    outputNodeIds: ["output_final"],
    status: "completed",
    startedAtMs: 1000,
    completedAtMs: 1300,
    durationMs: 300,
    records: [
      {
        ...baseRecord,
        kind: "activity",
        recordId: "record_activity",
        runtimeKey: "activity:1:main_a",
        label: "A / Virtual graph edit",
        nodeId: "main_a",
        nodeType: "activity",
        subgraphNodeId: null,
        artifactLabels: ["graph revision: grev_buddy"],
        graphRevision: {
          graphId: "graph_buddy",
          revisionId: "grev_buddy",
          status: "saved",
        },
      },
    ],
  };

  const rows = buildBuddyOutputTraceTreeRows(segment, { rootLabel: "主图开始" });

  assert.deepEqual(rows[1].graphRevision, {
    graphId: "graph_buddy",
    revisionId: "grev_buddy",
    status: "saved",
  });
});

test("buildBuddyOutputTraceTreeRows can render fetched run tree rows for expanded Buddy capsules", () => {
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
        recordId: "record_fallback",
        runtimeKey: "node:fallback",
        label: "局部 fallback",
        nodeId: "fallback",
        subgraphNodeId: null,
      },
    ],
  };
  const runTree = createRunTreeNode({
    run_id: "run_parent",
    graph_name: "Buddy Loop",
    status: "completed",
    children: [
      createRunTreeNode({
        run_id: "run_child",
        graph_name: "Research",
        parent_run_id: "run_parent",
        parent_node_id: "execute_capability",
        invocation_kind: "dynamic_subgraph_capability",
        invocation_key: "advanced_web_research_loop",
      }),
      createRunTreeNode({
        run_id: "run_item_a",
        graph_name: "Batch worker",
        parent_run_id: "run_parent",
        parent_node_id: "batch_news",
        invocation_kind: "batch_subgraph_worker",
        invocation_key: "summarize_article",
        batch_group_id: "batch_news",
        batch_item_index: 0,
        batch_item_label: "article-a",
        status: "completed",
      }),
      createRunTreeNode({
        run_id: "run_item_b",
        graph_name: "Batch worker",
        parent_run_id: "run_parent",
        parent_node_id: "batch_news",
        invocation_kind: "batch_subgraph_worker",
        invocation_key: "summarize_article",
        batch_group_id: "batch_news",
        batch_item_index: 1,
        batch_item_label: "article-b",
        status: "failed",
      }),
    ],
  });

  const rows = buildBuddyOutputTraceTreeRows(segment, { rootLabel: "主图开始", runTree });

  assert.deepEqual(
    rows.map((row) => ({
      kind: row.kind,
      label: row.label,
      depth: row.depth,
      status: row.status,
      evidenceRunId: row.evidenceRunId,
      artifactLabels: row.artifactLabels,
    })),
    [
      {
        kind: "root",
        label: "Buddy Loop",
        depth: 0,
        status: "completed",
        evidenceRunId: "run_parent",
        artifactLabels: [],
      },
      {
        kind: "subgraph",
        label: "Research",
        depth: 1,
        status: "completed",
        evidenceRunId: "run_child",
        artifactLabels: [
          "dynamic_subgraph_capability · advanced_web_research_loop · from execute_capability",
          "node: execute_capability",
          "kind: dynamic_subgraph_capability",
          "capability: advanced_web_research_loop",
        ],
      },
      {
        kind: "subgraph",
        label: "Batch batch_news",
        depth: 1,
        status: "failed",
        evidenceRunId: null,
        artifactLabels: ["batch: 2", "completed 1 / failed 1"],
      },
      {
        kind: "subgraph",
        label: "Batch worker",
        depth: 2,
        status: "completed",
        evidenceRunId: "run_item_a",
        artifactLabels: [
          "batch_subgraph_worker · summarize_article · from batch_news",
          "node: batch_news",
          "kind: batch_subgraph_worker",
          "capability: summarize_article",
          "item: 1",
          "case: article-a",
        ],
      },
      {
        kind: "subgraph",
        label: "Batch worker",
        depth: 2,
        status: "failed",
        evidenceRunId: "run_item_b",
        artifactLabels: [
          "batch_subgraph_worker · summarize_article · from batch_news",
          "node: batch_news",
          "kind: batch_subgraph_worker",
          "capability: summarize_article",
          "item: 2",
          "case: article-b",
        ],
      },
    ],
  );
});
