import type { RunDetail } from "@/types/run";

export type RunActivityKind = "node-started" | "node-stream" | "state-updated" | "node-completed" | "node-failed" | "reasoning";

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

export function appendRunActivityEvent(state: RunActivityState, event: RunActivityIncomingEvent): RunActivityState {
  const entry = buildRunActivityEntry(event, state.entries.length + 1);
  if (!entry) {
    return state;
  }
  return {
    ...state,
    entries: [...state.entries.map((item) => ({ ...item, active: false })), entry],
  };
}

export function buildRunActivityEntriesFromRun(run: RunDetail): RunActivityEntry[] {
  const stateEvents = run.artifacts?.state_events ?? [];
  return stateEvents.map((event, index) => ({
    id: `state-${event.sequence ?? index + 1}-${event.node_id}-${event.state_key}`,
    kind: "state-updated",
    nodeId: event.node_id,
    nodeType: null,
    stateKey: event.state_key,
    title: event.state_key,
    preview: formatActivityValue(event.value),
    detail: event,
    createdAt: event.created_at ?? "",
    sequence: Number(event.sequence ?? index + 1),
    active: index === stateEvents.length - 1,
  }));
}

function buildRunActivityEntry(event: RunActivityIncomingEvent, sequence: number): RunActivityEntry | null {
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
      stateKey,
      formatActivityValue(payload.value),
      payload,
      createdAt,
    );
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
