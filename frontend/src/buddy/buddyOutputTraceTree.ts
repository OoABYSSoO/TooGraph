import type {
  BuddyOutputTraceRecord,
  BuddyOutputTraceRecordStatus,
  BuddyOutputTraceSegment,
  BuddyOutputTraceStatus,
} from "./buddyOutputTrace.ts";
import type { VirtualOperationGraphRevision } from "../lib/virtual-operation-activity.ts";
import type { RunTreeNode } from "../types/run.ts";
import {
  buildRunTreeDisplayItems,
  type RunTreeDisplayBatchGroup,
  type RunTreeDisplayRunRow,
} from "../lib/runTreeDisplayModel.ts";

export type BuddyOutputTraceTreeRowKind = "root" | "subgraph" | "node" | "activity";

export type BuddyOutputTraceTreePlaybackTarget = {
  kind: "run" | "subgraph";
  nodeId: string | null;
};

export type BuddyOutputTraceTreeRow = {
  rowId: string;
  kind: BuddyOutputTraceTreeRowKind;
  label: string;
  depth: number;
  status: BuddyOutputTraceStatus | BuddyOutputTraceRecordStatus;
  startedAtMs: number | null;
  completedAtMs: number | null;
  durationMs: number | null;
  record: BuddyOutputTraceRecord | null;
  playbackTarget: BuddyOutputTraceTreePlaybackTarget | null;
  artifactLabels: string[];
  evidenceRunId: string | null;
  graphRevision: VirtualOperationGraphRevision | null;
};

export function buildBuddyOutputTraceTreeRows(
  segment: BuddyOutputTraceSegment,
  options: { rootLabel: string; runTree?: RunTreeNode | null },
): BuddyOutputTraceTreeRow[] {
  if (options.runTree) {
    const runTreeRows = buildBuddyRunTreeRows(options.runTree);
    if (runTreeRows.length > 0) {
      return runTreeRows;
    }
  }

  const subgraphLabelById = buildSubgraphLabelById(segment.records);
  const rows: BuddyOutputTraceTreeRow[] = [
    {
      rowId: `${segment.segmentId}:root`,
      kind: "root",
      label: options.rootLabel,
      depth: 0,
      status: segment.status,
      startedAtMs: segment.startedAtMs,
      completedAtMs: segment.completedAtMs,
      durationMs: segment.durationMs,
      record: null,
      playbackTarget: { kind: "run", nodeId: null },
      artifactLabels: [],
      evidenceRunId: null,
      graphRevision: null,
    },
  ];

  for (const record of segment.records) {
    const subgraphHeaderId = record.aggregateSubgraphNodeId?.trim();
    const isSubgraphHeader = Boolean(subgraphHeaderId);
    const depth = isSubgraphHeader ? 0 : record.subgraphNodeId ? 1 : 0;
    rows.push({
      rowId: record.recordId,
      kind: isSubgraphHeader ? "subgraph" : record.kind === "activity" ? "activity" : "node",
      label: resolveTreeRecordLabel(record, subgraphLabelById),
      depth,
      status: record.status,
      startedAtMs: record.startedAtMs,
      completedAtMs: record.completedAtMs,
      durationMs: record.durationMs,
      record,
      playbackTarget: isSubgraphHeader ? { kind: "subgraph", nodeId: subgraphHeaderId || record.nodeId } : null,
      artifactLabels: record.artifactLabels ?? [],
      evidenceRunId: normalizeText(record.triggeredRunId) || null,
      graphRevision: record.graphRevision ?? null,
    });
  }

  return rows;
}

function buildBuddyRunTreeRows(runTree: RunTreeNode): BuddyOutputTraceTreeRow[] {
  return buildRunTreeDisplayItems(runTree).flatMap((item) => {
    if (item.kind === "batch_group") {
      return [
        buildBuddyRunTreeBatchGroupRow(item),
        ...item.rows.map(buildBuddyRunTreeRunRow),
      ];
    }
    return [buildBuddyRunTreeRunRow(item)];
  });
}

function buildBuddyRunTreeBatchGroupRow(group: RunTreeDisplayBatchGroup): BuddyOutputTraceTreeRow {
  return {
    rowId: group.key,
    kind: "subgraph",
    label: group.label,
    depth: group.depth,
    status: resolveRunTreeGroupStatus(group.rows),
    startedAtMs: null,
    completedAtMs: null,
    durationMs: null,
    record: null,
    playbackTarget: null,
    artifactLabels: [`batch: ${group.count}`, group.statusSummary].filter(Boolean),
    evidenceRunId: null,
    graphRevision: null,
  };
}

function buildBuddyRunTreeRunRow(row: RunTreeDisplayRunRow): BuddyOutputTraceTreeRow {
  return {
    rowId: row.key,
    kind: row.depth === 0 ? "root" : row.relation.includes("subgraph") ? "subgraph" : "node",
    label: row.graphName,
    depth: row.depth,
    status: normalizeRunTreeStatus(row.status),
    startedAtMs: null,
    completedAtMs: null,
    durationMs: null,
    record: null,
    playbackTarget: { kind: "run", nodeId: null },
    artifactLabels: [row.relation !== "root" ? row.relation : "", ...row.labels].filter(Boolean),
    evidenceRunId: row.runId || null,
    graphRevision: null,
  };
}

function resolveRunTreeGroupStatus(rows: RunTreeDisplayRunRow[]): BuddyOutputTraceTreeRow["status"] {
  const statuses = rows.map((row) => normalizeRunTreeStatus(row.status));
  if (statuses.includes("failed")) {
    return "failed";
  }
  if (statuses.includes("running")) {
    return "running";
  }
  return "completed";
}

function normalizeRunTreeStatus(status: string): BuddyOutputTraceTreeRow["status"] {
  const normalized = status.trim().toLowerCase();
  if (normalized === "failed" || normalized === "cancelled" || normalized === "error") {
    return "failed";
  }
  if (normalized === "completed" || normalized === "success" || normalized === "succeeded") {
    return "completed";
  }
  return "running";
}

function buildSubgraphLabelById(records: BuddyOutputTraceRecord[]) {
  const labelById: Record<string, string> = {};
  for (const record of records) {
    const subgraphId = record.aggregateSubgraphNodeId?.trim();
    if (subgraphId) {
      labelById[subgraphId] = record.label.trim();
    }
  }
  return labelById;
}

function resolveTreeRecordLabel(record: BuddyOutputTraceRecord, subgraphLabelById: Record<string, string>) {
  const label = record.label.trim();
  if (!record.subgraphNodeId) {
    return label;
  }
  const subgraphLabel = subgraphLabelById[record.subgraphNodeId]?.trim();
  if (!subgraphLabel) {
    return label;
  }
  const prefix = `${subgraphLabel} / `;
  return label.startsWith(prefix) ? label.slice(prefix.length).trim() || label : label;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
