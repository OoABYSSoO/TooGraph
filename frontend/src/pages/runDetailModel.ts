import type { ActivityEvent, NodeExecutionDetail, RunDetail } from "../types/run.ts";

import { formatRunDuration } from "../lib/run-display-name.ts";
import { translate } from "../i18n/index.ts";

export type RunOutputArtifactCard = {
  key: string;
  title: string;
  text: string;
  displayMode: string;
  persistLabel: string;
  fileName: string | null;
  documentRefs: ArtifactDocumentReference[];
};

export type ArtifactDocumentReference = {
  title: string;
  url: string;
  localPath: string;
  contentType: string;
  charCount: number | null;
  artifactKind: "document" | "image" | "video" | "audio" | "file";
  size: number | null;
  filename: string;
};

export type RunStatusFact = {
  key: string;
  label: string;
  value: string;
  tone: "default" | "status";
};

export type RunAggregatedTimelineKind = "node" | "activity" | "permission";

export type RunAggregatedTimelineItem = {
  key: string;
  kind: RunAggregatedTimelineKind;
  label: string;
  summary: string;
  status: string;
  durationMs: number | null;
  artifactLabels: string[];
  nodeId: string | null;
  subgraphNodeId: string | null;
  subgraphPath: string[];
  pathLabel: string;
  timeValue: number;
  sequence: number;
  detailText: string;
};

export function formatRunArtifactValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function listRunOutputArtifacts(run: RunDetail): RunOutputArtifactCard[] {
  return (run.artifacts.exported_outputs ?? []).map((output, index) => ({
    key: `${output.node_id ?? "output"}-${output.source_key}-${index}`,
    title: output.label?.trim() || output.source_key || "Output",
    text: formatRunArtifactValue(output.value),
    displayMode: output.display_mode?.trim() || "auto",
    persistLabel: output.persist_enabled ? `persist ${output.persist_format ?? "txt"}` : "preview only",
    fileName: output.saved_file?.file_name ?? null,
    documentRefs: normalizeArtifactDocumentReferences(output.value),
  }));
}

export function normalizeArtifactDocumentReferences(value: unknown): ArtifactDocumentReference[] {
  const references: ArtifactDocumentReference[] = [];
  collectArtifactDocumentReferences(value, references, false);
  return references;
}

function collectArtifactDocumentReferences(value: unknown, references: ArtifactDocumentReference[], allowStringPath: boolean) {
  if (typeof value === "string") {
    if (allowStringPath) {
      appendArtifactDocumentReference(
        {
          title: "",
          url: "",
          local_path: value,
        },
        references,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectArtifactDocumentReferences(item, references, true);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.local_path !== undefined) {
    appendArtifactDocumentReference(record, references);
    return;
  }

  for (const nestedValue of Object.values(record)) {
    collectArtifactDocumentReferences(nestedValue, references, false);
  }
}

function appendArtifactDocumentReference(record: Record<string, unknown>, references: ArtifactDocumentReference[]) {
  const localPath = normalizeLocalArtifactPath(record.local_path);
  if (!localPath) {
    return;
  }
  references.push({
    title: normalizeText(record.title) || normalizeText(record.filename) || `Document ${references.length + 1}`,
    url: normalizeText(record.url),
    localPath,
    contentType: normalizeText(record.content_type ?? record.contentType) || "text/markdown",
    charCount: normalizeNumber(record.char_count ?? record.charCount),
    artifactKind: resolveArtifactKind(normalizeText(record.content_type ?? record.contentType), localPath),
    size: normalizeNumber(record.size),
    filename: normalizeText(record.filename) || localPath.split("/").at(-1) || "",
  });
}

function resolveArtifactKind(contentType: string, localPath: string): ArtifactDocumentReference["artifactKind"] {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.startsWith("image/")) {
    return "image";
  }
  if (normalizedType.startsWith("video/")) {
    return "video";
  }
  if (normalizedType.startsWith("audio/")) {
    return "audio";
  }
  if (normalizedType.startsWith("text/") || normalizedType === "application/json" || normalizedType === "text/markdown") {
    return "document";
  }
  if (/\.(md|markdown|txt|json|jsonl|csv|log)$/i.test(localPath)) {
    return "document";
  }
  if (/\.(avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$/i.test(localPath)) {
    return "image";
  }
  if (/\.(3gp|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm)$/i.test(localPath)) {
    return "video";
  }
  if (/\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(localPath)) {
    return "audio";
  }
  return "file";
}

function normalizeLocalArtifactPath(value: unknown) {
  const path = normalizeText(value).replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    return "";
  }
  return path;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildRunStatusFacts(run: RunDetail): RunStatusFact[] {
  return [
    { key: "status", label: translate("runDetail.status"), value: run.status, tone: "status" },
    { key: "current", label: translate("runDetail.currentNode"), value: run.current_node_id?.trim() || translate("runDetail.ended"), tone: "default" },
    { key: "duration", label: translate("runDetail.duration"), value: formatRunDuration(run.duration_ms), tone: "default" },
    { key: "revision", label: translate("runDetail.revision"), value: String(run.revision_round), tone: "default" },
  ];
}

type RunAggregatedTimelineDraft = RunAggregatedTimelineItem & {
  order: number;
};

export function buildRunAggregatedTimeline(run: RunDetail): RunAggregatedTimelineItem[] {
  const items: RunAggregatedTimelineDraft[] = [];
  let order = 0;
  for (const execution of run.node_executions ?? []) {
    appendNodeExecutionTimelineItems(items, execution, [], null, () => {
      order += 1;
      return order;
    });
  }
  for (const [index, event] of (run.artifacts.activity_events ?? []).entries()) {
    const nextOrder = order + 1;
    order = nextOrder;
    items.push(buildActivityTimelineItem(event, index, nextOrder));
  }
  for (const permissionItem of buildPermissionTimelineItems(run)) {
    order += 1;
    items.push({ ...permissionItem, order });
  }
  return items
    .sort((left, right) => {
      if (left.timeValue !== right.timeValue) {
        return left.timeValue - right.timeValue;
      }
      if (left.sequence !== right.sequence) {
        return left.sequence - right.sequence;
      }
      return left.order - right.order;
    })
    .map(({ order: _order, ...item }) => item);
}

function appendNodeExecutionTimelineItems(
  items: RunAggregatedTimelineDraft[],
  execution: NodeExecutionDetail,
  subgraphPath: string[],
  subgraphNodeId: string | null,
  nextOrder: () => number,
) {
  const nodeId = normalizeText(execution.node_id) || null;
  const order = nextOrder();
  const normalizedPath = normalizeTimelinePath(subgraphPath);
  const label = nodeId || "node";
  items.push({
    key: `node:${normalizedPath.join("/")}:${label}:${order}`,
    kind: "node",
    label,
    summary: normalizeText(execution.output_summary) || normalizeText(execution.input_summary),
    status: normalizeText(execution.status) || "unknown",
    durationMs: normalizeNumber(execution.duration_ms),
    artifactLabels: buildNodeArtifactLabels(execution),
    nodeId,
    subgraphNodeId,
    subgraphPath: normalizedPath,
    pathLabel: buildTimelinePathLabel(normalizedPath, nodeId),
    timeValue: parseTimelineTimestamp(execution.started_at ?? execution.finished_at),
    sequence: order,
    detailText: buildNodeExecutionDetailText(execution),
    order,
  });

  const childExecutions = execution.artifacts.subgraph?.node_executions;
  if (!Array.isArray(childExecutions)) {
    return;
  }
  const childPath = nodeId ? [...normalizedPath, nodeId] : normalizedPath;
  for (const childExecution of childExecutions) {
    appendNodeExecutionTimelineItems(items, childExecution, childPath, nodeId, nextOrder);
  }
}

function buildActivityTimelineItem(event: ActivityEvent, index: number, order: number): RunAggregatedTimelineDraft {
  const nodeId = normalizeText(event.node_id) || null;
  const subgraphPath = normalizeTimelinePath(event.subgraph_path);
  const subgraphNodeId = normalizeText(event.subgraph_node_id) || subgraphPath.at(-1) || null;
  const label = buildActivityLabel(event);
  return {
    key: `activity:${event.sequence ?? index + 1}:${subgraphPath.join("/")}:${nodeId ?? label}`,
    kind: "activity",
    label,
    summary: normalizeText(event.summary) || label,
    status: normalizeText(event.status) || (normalizeText(event.error) ? "failed" : "recorded"),
    durationMs: normalizeNumber(event.duration_ms),
    artifactLabels: buildActivityArtifactLabels(event),
    nodeId,
    subgraphNodeId,
    subgraphPath,
    pathLabel: buildTimelinePathLabel(subgraphPath, nodeId),
    timeValue: parseTimelineTimestamp(event.created_at),
    sequence: normalizeSequence(event.sequence, index + 1),
    detailText: buildActivityDetailText(event),
    order,
  };
}

function buildActivityLabel(event: ActivityEvent) {
  const kind = normalizeText(event.kind);
  if (kind === "buddy_home_write") {
    return "Buddy Home writeback";
  }
  return kind || "activity";
}

function buildPermissionTimelineItems(run: RunDetail): RunAggregatedTimelineItem[] {
  const metadata = recordFromUnknown(run.metadata);
  const items: RunAggregatedTimelineItem[] = [];
  const topLevelApproval = recordFromUnknown(metadata.pending_permission_approval);
  const topLevelNodeId = normalizeText(run.current_node_id) || null;
  const topLevelItem = buildPermissionTimelineItem(run, topLevelApproval, [], null, topLevelNodeId);
  if (topLevelItem) {
    items.push(topLevelItem);
  }

  const pendingSubgraph = recordFromUnknown(metadata.pending_subgraph_breakpoint);
  const pendingSubgraphMetadata = recordFromUnknown(pendingSubgraph.metadata);
  const subgraphApproval = recordFromUnknown(pendingSubgraphMetadata.pending_permission_approval);
  const subgraphPath = normalizeTimelinePath(pendingSubgraph.subgraph_path);
  const subgraphNodeId = normalizeText(pendingSubgraph.subgraph_node_id) || subgraphPath.at(-1) || null;
  const subgraphItem = buildPermissionTimelineItem(
    run,
    subgraphApproval,
    subgraphPath.length > 0 ? subgraphPath : subgraphNodeId ? [subgraphNodeId] : [],
    subgraphNodeId,
    normalizeText(pendingSubgraph.inner_node_id) || null,
  );
  if (subgraphItem) {
    items.push(subgraphItem);
  }
  return items;
}

function buildPermissionTimelineItem(
  run: RunDetail,
  approval: Record<string, unknown>,
  subgraphPath: string[],
  subgraphNodeId: string | null,
  nodeId: string | null,
): RunAggregatedTimelineItem | null {
  const skillKey = normalizeText(approval.skill_key);
  const skillName = normalizeText(approval.skill_name) || skillKey;
  const permissions = Array.isArray(approval.permissions)
    ? approval.permissions.map((permission) => normalizeText(permission)).filter(Boolean)
    : [];
  if (!skillKey && permissions.length === 0) {
    return null;
  }
  const label = skillName || "Permission approval";
  return {
    key: `permission:${subgraphPath.join("/")}:${nodeId ?? ""}:${skillKey || label}`,
    kind: "permission",
    label,
    summary: permissions.length > 0 ? `Requires permission: ${permissions.join(", ")}` : "Requires permission approval.",
    status: "awaiting_human",
    durationMs: null,
    artifactLabels: permissions,
    nodeId,
    subgraphNodeId,
    subgraphPath,
    pathLabel: buildTimelinePathLabel(subgraphPath, nodeId),
    timeValue: parseTimelineTimestamp(
      normalizeText(approval.created_at) || normalizeText(run.lifecycle.paused_at) || normalizeText(run.lifecycle.updated_at) || run.started_at,
    ),
    sequence: Number.MAX_SAFE_INTEGER,
    detailText: formatRunArtifactValue(approval),
  };
}

function buildNodeArtifactLabels(execution: NodeExecutionDetail) {
  const labels: string[] = [];
  const outputKeys = uniqueNonEmpty(Object.keys(recordFromUnknown(execution.artifacts.outputs)));
  if (outputKeys.length > 0) {
    labels.push(`outputs: ${outputKeys.join(", ")}`);
  }
  const writtenStateKeys = uniqueNonEmpty((execution.artifacts.state_writes ?? []).map((write) => normalizeText(write.state_key)));
  if (writtenStateKeys.length > 0) {
    labels.push(`writes: ${writtenStateKeys.join(", ")}`);
  }
  const subgraphName = normalizeText(execution.artifacts.subgraph?.name);
  if (subgraphName) {
    labels.push(`subgraph: ${subgraphName}`);
  }
  const selectedBranch = normalizeText(execution.artifacts.selected_branch);
  if (selectedBranch) {
    labels.push(`branch: ${selectedBranch}`);
  }
  const iteration = normalizeNumber(execution.artifacts.iteration);
  if (iteration !== null) {
    labels.push(`iteration: ${iteration}`);
  }
  return labels;
}

function buildActivityArtifactLabels(event: ActivityEvent) {
  const detail = recordFromUnknown(event.detail);
  const labels: string[] = [];
  if (normalizeText(event.kind) === "buddy_home_write") {
    const appliedCount = normalizeNumber(detail.applied_count);
    const skippedCount = normalizeNumber(detail.skipped_count);
    const revisionIds = Array.isArray(detail.revision_ids)
      ? uniqueNonEmpty(detail.revision_ids.map((revisionId) => normalizeText(revisionId)))
      : [];
    if (appliedCount !== null) {
      labels.push(`applied: ${appliedCount}`);
    }
    if (skippedCount !== null) {
      labels.push(`skipped: ${skippedCount}`);
    }
    if (revisionIds.length > 0) {
      labels.push(`revisions: ${revisionIds.join(", ")}`);
    }
    return labels;
  }
  const skillKey = normalizeText(detail.skill_key);
  if (skillKey) {
    labels.push(`skill: ${skillKey}`);
  }
  const path = normalizeText(detail.path);
  if (path) {
    labels.push(`path: ${path}`);
  }
  const query = normalizeText(detail.query);
  if (query) {
    labels.push(`query: ${query}`);
  }
  return labels;
}

function buildNodeExecutionDetailText(execution: NodeExecutionDetail) {
  const detail = {
    inputs: execution.artifacts.inputs,
    outputs: execution.artifacts.outputs,
    warnings: execution.warnings,
    errors: execution.errors,
  };
  return formatRunArtifactValue(detail);
}

function buildActivityDetailText(event: ActivityEvent) {
  const detail = event.detail ?? (event.error ? { error: event.error } : null);
  return formatRunArtifactValue(detail);
}

function buildTimelinePathLabel(subgraphPath: string[], nodeId: string | null) {
  const parts = [...normalizeTimelinePath(subgraphPath), normalizeText(nodeId)].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Run";
}

function normalizeTimelinePath(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function parseTimelineTimestamp(value: unknown) {
  const timestamp = Date.parse(normalizeText(value));
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function normalizeSequence(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}
