import type { RunDetail } from "@/types/run";

export type RunActivityKind =
  | "node-started"
  | "node-stream"
  | "state-updated"
  | "activity-event"
  | "node-completed"
  | "node-failed"
  | "reasoning";
export type RunActivityStateNameByKey = Record<string, string | null | undefined>;

export type RunActivityEntry = {
  id: string;
  kind: RunActivityKind;
  nodeId: string | null;
  nodeType: string | null;
  stateKey: string | null;
  title: string;
  preview: string;
  detail: unknown;
  createdAt: string;
  sequence: number;
  active: boolean;
};

export type RunActivityState = {
  entries: RunActivityEntry[];
  autoFollow: boolean;
};

export type RunActivityIncomingEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

export function appendRunActivityEvent(
  state: RunActivityState,
  event: RunActivityIncomingEvent,
  stateNameByKey: RunActivityStateNameByKey = {},
): RunActivityState {
  const entry = buildRunActivityEntry(event, state.entries.length + 1, stateNameByKey);
  if (!entry) {
    return state;
  }
  if (entry.kind === "node-stream") {
    const streamEntryIndex = findMergeableStreamEntryIndex(state.entries, entry);
    if (streamEntryIndex >= 0) {
      return {
        ...state,
        entries: state.entries.map((item, index) =>
          index === streamEntryIndex ? { ...entry, id: item.id, sequence: item.sequence, active: true } : { ...item, active: false },
        ),
      };
    }
  }
  return {
    ...state,
    entries: [...state.entries.map((item) => ({ ...item, active: false })), entry],
  };
}

export function buildRunActivityEntriesFromRun(run: RunDetail, stateNameByKey: RunActivityStateNameByKey = {}): RunActivityEntry[] {
  const stateEvents = run.artifacts?.state_events ?? [];
  const stateEntries: RunActivityEntry[] = stateEvents.map((event, index) => ({
    id: `state-${event.sequence ?? index + 1}-${event.node_id}-${event.state_key}`,
    kind: "state-updated",
    nodeId: event.node_id,
    nodeType: null,
    stateKey: event.state_key,
    title: resolveStateTitle(event.state_key, stateNameByKey),
    preview: formatActivityValue(event.value),
    detail: event,
    createdAt: event.created_at ?? "",
    sequence: Number(event.sequence ?? index + 1),
    active: false,
  }));
  const activityEvents = run.artifacts?.activity_events ?? [];
  const activityEntries = activityEvents.map((event, index) =>
    createActivityEntry(event as Record<string, unknown>, Number(event.sequence ?? index + 1)),
  );
  const entries = [...stateEntries, ...activityEntries].sort(compareRunActivityEntries);
  return entries.map((entry, index) => ({ ...entry, active: index === entries.length - 1 }));
}

function buildRunActivityEntry(event: RunActivityIncomingEvent, sequence: number, stateNameByKey: RunActivityStateNameByKey): RunActivityEntry | null {
  const payload = event.payload;
  const nodeId = normalizeText(payload.node_id);
  const nodeType = normalizeText(payload.node_type) || null;
  const createdAt = normalizeText(payload.created_at);
  if (event.eventType === "node.started") {
    return createEntry("node-started", sequence, nodeId, nodeType, null, `${nodeId} running`, "agent running", payload, createdAt);
  }
  if (event.eventType === "node.output.delta" || event.eventType === "node.output.completed") {
    return createEntry("node-stream", sequence, nodeId, nodeType, null, `${nodeId} stream`, normalizeText(payload.text), payload, createdAt);
  }
  if (event.eventType === "state.updated") {
    const stateKey = normalizeText(payload.state_key);
    return createEntry(
      "state-updated",
      Number(payload.sequence ?? sequence),
      nodeId,
      nodeType,
      stateKey,
      resolveStateTitle(stateKey, stateNameByKey),
      formatActivityValue(payload.value),
      payload,
      createdAt,
    );
  }
  if (event.eventType === "activity.event") {
    return createActivityEntry(payload, Number(payload.sequence ?? sequence));
  }
  if (event.eventType === "node.completed") {
    return createEntry("node-completed", sequence, nodeId, nodeType, null, `${nodeId} completed`, `${Number(payload.duration_ms ?? 0)}ms`, payload, createdAt);
  }
  if (event.eventType === "node.failed") {
    return createEntry("node-failed", sequence, nodeId, nodeType, null, `${nodeId} failed`, normalizeText(payload.error), payload, createdAt);
  }
  if (event.eventType === "node.reasoning.completed") {
    return createEntry("reasoning", sequence, nodeId, nodeType, null, `${nodeId} reasoning`, normalizeText(payload.reasoning), payload, createdAt);
  }
  return null;
}

function createActivityEntry(payload: Record<string, unknown>, sequence: number): RunActivityEntry {
  const nodeId = normalizeText(payload.node_id);
  if (normalizeText(payload.kind) === "buddy_home_write") {
    return createEntry(
      "activity-event",
      sequence,
      nodeId,
      null,
      null,
      "Buddy Home writeback",
      formatBuddyHomeWritebackPreview(payload.detail),
      payload,
      normalizeText(payload.created_at),
    );
  }
  const title = normalizeText(payload.summary) || normalizeText(payload.kind) || "activity event";
  const preview = formatActivityValue(payload.detail ?? payload.error ?? payload.status);
  return createEntry("activity-event", sequence, nodeId, null, null, title, preview, payload, normalizeText(payload.created_at));
}

function compareRunActivityEntries(left: RunActivityEntry, right: RunActivityEntry) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.sequence - right.sequence;
}

function createEntry(
  kind: RunActivityKind,
  sequence: number,
  nodeId: string,
  nodeType: string | null,
  stateKey: string | null,
  title: string,
  preview: string,
  detail: unknown,
  createdAt: string,
): RunActivityEntry {
  return {
    id: `${kind}-${sequence}-${nodeId}-${stateKey ?? ""}`,
    kind,
    nodeId,
    nodeType,
    stateKey,
    title,
    preview,
    detail,
    createdAt,
    sequence,
    active: true,
  };
}

function findMergeableStreamEntryIndex(entries: RunActivityEntry[], streamEntry: RunActivityEntry) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    if (entry.nodeId !== streamEntry.nodeId) {
      continue;
    }
    if (entry.kind === "node-stream") {
      return index;
    }
    if (entry.kind === "node-started" || entry.kind === "node-completed" || entry.kind === "node-failed") {
      return -1;
    }
  }
  return -1;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveStateTitle(stateKey: string, stateNameByKey: RunActivityStateNameByKey) {
  const stateName = stateNameByKey[stateKey]?.trim();
  return stateName || stateKey;
}

function formatActivityValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function formatBuddyHomeWritebackPreview(value: unknown) {
  const detail = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const parts: string[] = [];
  const appliedCount = normalizeNumber(detail.applied_count);
  const skippedCount = normalizeNumber(detail.skipped_count);
  const revisionIds = Array.isArray(detail.revision_ids)
    ? detail.revision_ids.map((revisionId) => normalizeText(revisionId)).filter(Boolean)
    : [];
  if (appliedCount !== null) {
    parts.push(`applied ${appliedCount}`);
  }
  if (skippedCount !== null) {
    parts.push(`skipped ${skippedCount}`);
  }
  if (revisionIds.length > 0) {
    parts.push(`revisions ${revisionIds.join(", ")}`);
  }
  return parts.join(" | ") || formatActivityValue(value);
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
