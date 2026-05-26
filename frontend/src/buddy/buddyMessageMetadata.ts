import type { BuddyOutputTraceRecord, BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";

export type BuddyPublicOutputMetadata = {
  outputNodeId: string;
  sourceOutputNodeId?: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  displayMode: string;
  kind: "text" | "card";
  content: unknown;
  durationMs: number | null;
  status: "streaming" | "completed" | "failed";
};

type OutputTraceBuddyMessageMetadata = {
  kind: "output_trace";
  outputTrace: BuddyOutputTraceSegment;
};

type PublicOutputBuddyMessageMetadata = {
  kind: "public_output";
  publicOutput: BuddyPublicOutputMetadata;
};

export function resolveOutputTraceBuddyMessageMetadata(metadata: unknown): BuddyOutputTraceSegment | null {
  if (!isRecord(metadata) || metadata.kind !== "output_trace") {
    return null;
  }
  const outputTrace = metadata.outputTrace;
  return isBuddyOutputTraceSegment(outputTrace) ? outputTrace : null;
}

export function resolvePublicOutputBuddyMessageMetadata(metadata: unknown): BuddyPublicOutputMetadata | null {
  if (!isRecord(metadata) || metadata.kind !== "public_output") {
    return null;
  }
  const publicOutput = metadata.publicOutput;
  return isBuddyPublicOutputMetadata(publicOutput) ? publicOutput : null;
}

function isBuddyPublicOutputMetadata(value: unknown): value is BuddyPublicOutputMetadata {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.outputNodeId === "string" &&
    (value.sourceOutputNodeId === undefined || typeof value.sourceOutputNodeId === "string") &&
    typeof value.stateKey === "string" &&
    typeof value.stateName === "string" &&
    typeof value.stateType === "string" &&
    typeof value.displayMode === "string" &&
    (value.kind === "text" || value.kind === "card") &&
    Object.prototype.hasOwnProperty.call(value, "content") &&
    isNullableNumber(value.durationMs) &&
    (value.status === "streaming" || value.status === "completed" || value.status === "failed")
  );
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
    (value.subgraphNodeId === null || typeof value.subgraphNodeId === "string") &&
    (
      value.artifactLabels === undefined ||
      (Array.isArray(value.artifactLabels) && value.artifactLabels.every((item) => typeof item === "string"))
    ) &&
    (
      value.triggeredRunId === undefined ||
      typeof value.triggeredRunId === "string"
    ) &&
    (
      value.graphRevision === undefined ||
      isGraphRevisionMetadata(value.graphRevision)
    )
  );
}

function isGraphRevisionMetadata(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.graphId === "string" &&
    value.graphId.trim().length > 0 &&
    typeof value.revisionId === "string" &&
    value.revisionId.trim().length > 0 &&
    (value.status === undefined || typeof value.status === "string")
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
