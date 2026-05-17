import assert from "node:assert/strict";
import test from "node:test";

import type { RunTreeNode } from "../types/run.ts";

import {
  buildRunTreeDisplayItems,
  countRunTreeNodes,
} from "./runTreeDisplayModel.ts";

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

test("buildRunTreeDisplayItems groups batch child runs through the shared display model", () => {
  const tree = createRunTreeNode({
    run_id: "run_parent",
    graph_name: "Buddy",
    status: "running",
    current_node_id: "execute_batch",
    children: [
      createRunTreeNode({
        run_id: "run_child_direct",
        graph_name: "Research",
        parent_run_id: "run_parent",
        parent_node_id: "execute_capability",
        invocation_kind: "dynamic_subgraph_capability",
        invocation_key: "advanced_web_research_loop",
        duration_ms: 1500,
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

  const items = buildRunTreeDisplayItems(tree);

  assert.equal(countRunTreeNodes(tree), 4);
  assert.deepEqual(items.map((item) => ({ kind: item.kind, key: item.key, depth: item.depth })), [
    { kind: "run", key: "run:run_parent", depth: 0 },
    { kind: "run", key: "run:run_child_direct", depth: 1 },
    { kind: "batch_group", key: "batch:run_parent:batch_news", depth: 1 },
  ]);
  const directRun = items[1];
  assert.equal(directRun.kind, "run");
  assert.equal(directRun.relation, "dynamic_subgraph_capability · advanced_web_research_loop · from execute_capability");
  assert.equal(directRun.durationLabel, "1.5s");
  const batchGroup = items[2];
  assert.equal(batchGroup.kind, "batch_group");
  assert.equal(batchGroup.label, "Batch batch_news");
  assert.equal(batchGroup.count, 2);
  assert.equal(batchGroup.statusSummary, "completed 1 / failed 1");
  assert.deepEqual(batchGroup.rows.map((row) => ({ runId: row.runId, depth: row.depth, labels: row.labels })), [
    {
      runId: "run_item_a",
      depth: 2,
      labels: ["node: batch_news", "kind: batch_subgraph_worker", "capability: summarize_article", "item: 1", "case: article-a"],
    },
    {
      runId: "run_item_b",
      depth: 2,
      labels: ["node: batch_news", "kind: batch_subgraph_worker", "capability: summarize_article", "item: 2", "case: article-b"],
    },
  ]);
});
