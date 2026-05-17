import type {
  BuddyOutputTraceRecord,
  BuddyOutputTraceRecordStatus,
  BuddyOutputTraceSegment,
  BuddyOutputTraceStatus,
} from "./buddyOutputTrace.ts";

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
};

export function buildBuddyOutputTraceTreeRows(
  segment: BuddyOutputTraceSegment,
  options: { rootLabel: string },
): BuddyOutputTraceTreeRow[] {
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
    });
  }

  return rows;
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

