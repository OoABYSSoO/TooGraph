import type { RunTreeNode } from "../types/run.ts";

import { formatRunDuration } from "./run-display-name.ts";

export type RunTreeDisplayRunRow = {
  kind: "run";
  key: string;
  runId: string;
  graphName: string;
  status: string;
  depth: number;
  href: string;
  relation: string;
  currentNodeId: string | null;
  durationLabel: string;
  labels: string[];
};

export type RunTreeDisplayBatchGroup = {
  kind: "batch_group";
  key: string;
  label: string;
  depth: number;
  count: number;
  statusSummary: string;
  rows: RunTreeDisplayRunRow[];
};

export type RunTreeDisplayItem = RunTreeDisplayRunRow | RunTreeDisplayBatchGroup;

export function buildRunTreeDisplayItems(tree: RunTreeNode | null | undefined): RunTreeDisplayItem[] {
  if (!tree) {
    return [];
  }
  return buildRunTreeItemsForNode(tree, 0);
}

export function countRunTreeNodes(tree: RunTreeNode | null | undefined): number {
  if (!tree) {
    return 0;
  }
  return 1 + (tree.children ?? []).reduce((total, child) => total + countRunTreeNodes(child), 0);
}

function buildRunTreeItemsForNode(node: RunTreeNode, depth: number): RunTreeDisplayItem[] {
  const items: RunTreeDisplayItem[] = [buildRunTreeRow(node, depth)];
  const children = Array.isArray(node.children) ? node.children : [];
  const emittedBatchGroups = new Set<string>();

  for (const child of children) {
    const batchGroupId = normalizeText(child.batch_group_id);
    if (!batchGroupId) {
      items.push(...buildRunTreeItemsForNode(child, depth + 1));
      continue;
    }
    if (emittedBatchGroups.has(batchGroupId)) {
      continue;
    }
    emittedBatchGroups.add(batchGroupId);
    const groupChildren = children.filter((candidate) => normalizeText(candidate.batch_group_id) === batchGroupId);
    items.push(buildRunTreeBatchGroup(node, batchGroupId, groupChildren, depth + 1));
  }
  return items;
}

function buildRunTreeBatchGroup(
  parent: RunTreeNode,
  batchGroupId: string,
  children: RunTreeNode[],
  depth: number,
): RunTreeDisplayBatchGroup {
  const rows = children.flatMap((child) => flattenRunTreeRunRows(child, depth + 1));
  return {
    kind: "batch_group",
    key: `batch:${parent.run_id}:${batchGroupId}`,
    label: `Batch ${batchGroupId}`,
    depth,
    count: children.length,
    statusSummary: buildRunTreeStatusSummary(rows),
    rows,
  };
}

function flattenRunTreeRunRows(node: RunTreeNode, depth: number): RunTreeDisplayRunRow[] {
  return [
    buildRunTreeRow(node, depth),
    ...(node.children ?? []).flatMap((child) => flattenRunTreeRunRows(child, depth + 1)),
  ];
}

function buildRunTreeRow(node: RunTreeNode, depth: number): RunTreeDisplayRunRow {
  const runId = normalizeText(node.run_id);
  const invocationKind = normalizeText(node.invocation_kind);
  const invocationKey = normalizeText(node.invocation_key);
  const parentNodeId = normalizeText(node.parent_node_id);
  const batchItemIndex = typeof node.batch_item_index === "number" ? node.batch_item_index : null;
  const batchItemLabel = normalizeText(node.batch_item_label);
  return {
    kind: "run",
    key: `run:${runId}`,
    runId,
    graphName: normalizeText(node.graph_name) || runId || "Run",
    status: normalizeText(node.status) || "unknown",
    depth: Math.max(0, depth),
    href: `/runs/${encodeURIComponent(runId)}`,
    relation: buildRunTreeRelationLabel(invocationKind, invocationKey, parentNodeId),
    currentNodeId: normalizeText(node.current_node_id) || null,
    durationLabel: formatRunDuration(node.duration_ms),
    labels: [
      parentNodeId ? `node: ${parentNodeId}` : "",
      invocationKind ? `kind: ${invocationKind}` : "",
      invocationKey ? `capability: ${invocationKey}` : "",
      batchItemIndex !== null ? `item: ${batchItemIndex + 1}` : "",
      batchItemLabel ? `case: ${batchItemLabel}` : "",
    ].filter(Boolean),
  };
}

function buildRunTreeRelationLabel(invocationKind: string, invocationKey: string, parentNodeId: string) {
  if (!invocationKind && !invocationKey && !parentNodeId) {
    return "root";
  }
  return [
    invocationKind || "child",
    invocationKey,
    parentNodeId ? `from ${parentNodeId}` : "",
  ].filter(Boolean).join(" · ");
}

function buildRunTreeStatusSummary(rows: RunTreeDisplayRunRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => `${status} ${count}`).join(" / ");
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
