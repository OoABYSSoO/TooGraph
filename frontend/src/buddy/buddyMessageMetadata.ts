import type { BuddyOutputTraceRecord, BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";

type OutputTraceBuddyMessageMetadata = {
  kind: "output_trace";
  outputTrace: BuddyOutputTraceSegment;
};

export function buildOutputTraceBuddyMessageMetadata(outputTrace: BuddyOutputTraceSegment): OutputTraceBuddyMessageMetadata {
  return {
    kind: "output_trace",
    outputTrace,
  };
}

export function resolveOutputTraceBuddyMessageMetadata(metadata: unknown): BuddyOutputTraceSegment | null {
  if (!isRecord(metadata) || metadata.kind !== "output_trace") {
    return null;
  }
  const outputTrace = metadata.outputTrace;
  return isBuddyOutputTraceSegment(outputTrace) ? outputTrace : null;
}

function isBuddyOutputTraceSegment(value: unknown): value is BuddyOutputTraceSegment {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.segmentId === "string" &&
    typeof value.boundaryNodeId === "string" &&
    typeof value.boundaryLabel === "string" &&
    Array.isArray(value.outputNodeIds) &&
    value.outputNodeIds.every((item) => typeof item === "string") &&
    Array.isArray(value.records) &&
    value.records.every(isBuddyOutputTraceRecord) &&
    isSegmentTraceStatus(value.status) &&
    isNullableNumber(value.startedAtMs) &&
    isNullableNumber(value.completedAtMs) &&
    isNullableNumber(value.durationMs)
  );
}

function isBuddyOutputTraceRecord(value: unknown): value is BuddyOutputTraceRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.recordId === "string" &&
    typeof value.runtimeKey === "string" &&
    isTraceRecordKind(value.kind) &&
    typeof value.label === "string" &&
    isRecordTraceStatus(value.status) &&
    isNullableNumber(value.startedAtMs) &&
    isNullableNumber(value.completedAtMs) &&
    isNullableNumber(value.durationMs) &&
    (value.nodeId === null || typeof value.nodeId === "string") &&
    typeof value.nodeType === "string" &&
    (value.subgraphNodeId === null || typeof value.subgraphNodeId === "string")
  );
}

function isSegmentTraceStatus(value: unknown): value is BuddyOutputTraceSegment["status"] {
  return value === "idle" || isRecordTraceStatus(value);
}

function isRecordTraceStatus(value: unknown): value is BuddyOutputTraceRecord["status"] {
  return value === "running" || value === "completed" || value === "failed";
}

function isTraceRecordKind(value: unknown): value is BuddyOutputTraceRecord["kind"] {
  return value === "node" || value === "activity";
}

function isNullableNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
