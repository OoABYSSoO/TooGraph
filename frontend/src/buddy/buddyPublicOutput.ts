import type { ConditionalEdge, GraphEdge, GraphPayload } from "../types/node-system.ts";
import { projectStreamingJsonStateText } from "../lib/streamingJsonStateRouter.ts";

export type BuddyPublicOutputBinding = {
  outputNodeId: string;
  outputNodeName: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  displayMode: string;
  upstreamNodeIds: string[];
};

export type BuddyPublicOutputMessageKind = "text" | "card";

export type BuddyPublicOutputMessageStatus = "streaming" | "completed" | "failed";

export type BuddyPublicOutputMessage = {
  outputNodeId: string;
  outputNodeName: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  displayMode: string;
  kind: BuddyPublicOutputMessageKind;
  content: unknown;
  // Epoch milliseconds. The field name is kept for persisted Buddy message compatibility.
  startedAtMs: number | null;
  durationMs: number | null;
  status: BuddyPublicOutputMessageStatus;
};

export type BuddyPublicOutputRuntimeState = {
  order: string[];
  messagesByOutputNodeId: Record<string, BuddyPublicOutputMessage>;
  startedAtByOutputNodeId: Record<string, number>;
};

type RunEventPayload = Record<string, unknown>;

export function buildBuddyPublicOutputBindings(
  graph: Pick<GraphPayload, "state_schema" | "nodes" | "edges" | "conditional_edges">,
): BuddyPublicOutputBinding[] {
  return Object.entries(graph.nodes)
    .flatMap(([outputNodeId, node]) => {
      if (node.kind !== "output") {
        return [];
      }
      const read = node.reads[0];
      const stateKey = typeof read?.state === "string" ? read.state.trim() : "";
      if (!stateKey || node.reads.length !== 1) {
        return [];
      }
      const stateDefinition = graph.state_schema[stateKey];
      return [
        {
          outputNodeId,
          outputNodeName: node.name?.trim() || outputNodeId,
          stateKey,
          stateName: stateDefinition?.name?.trim() || stateKey,
          stateType: stateDefinition?.type?.trim() || "text",
          displayMode: normalizeDisplayMode(node.config?.displayMode),
          upstreamNodeIds: resolveDirectUpstreamNodeIds(graph, outputNodeId),
        },
      ];
    });
}

export function resolveBuddyPublicOutputMessageKind(input: {
  stateType: string;
  displayMode: string | null | undefined;
}): BuddyPublicOutputMessageKind {
  const stateType = input.stateType.trim();
  const displayMode = String(input.displayMode ?? "").trim();
  if (
    stateType === "markdown" ||
    stateType === "html" ||
    stateType === "text" ||
    displayMode === "markdown" ||
    displayMode === "html" ||
    displayMode === "plain"
  ) {
    return "text";
  }
  return "card";
}

export function createBuddyPublicOutputRuntimeState(): BuddyPublicOutputRuntimeState {
  return {
    order: [],
    messagesByOutputNodeId: {},
    startedAtByOutputNodeId: {},
  };
}

export function reduceBuddyPublicOutputEvent(
  state: BuddyPublicOutputRuntimeState,
  bindings: BuddyPublicOutputBinding[],
  eventType: string,
  payload: RunEventPayload,
  nowEpochMs: number,
): BuddyPublicOutputRuntimeState {
  if (eventType === "node.started") {
    return startOutputTimersForNode(
      state,
      bindings,
      normalizeString(payload.node_id),
      parseEventEpochMs(payload.started_at) ?? nowEpochMs,
    );
  }
  if (eventType === "node.output.delta") {
    return applyStreamingDelta(state, bindings, payload, nowEpochMs);
  }
  if (eventType === "state.updated") {
    return completeStateOutput(
      state,
      bindings,
      normalizeString(payload.state_key),
      payload.value,
      parseEventEpochMs(payload.created_at) ?? nowEpochMs,
    );
  }
  if (eventType === "node.failed") {
    return failOutputsForNode(state, bindings, normalizeString(payload.node_id), nowEpochMs);
  }
  return state;
}

function normalizeDisplayMode(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "auto";
}

function resolveDirectUpstreamNodeIds(
  graph: { edges?: GraphEdge[]; conditional_edges?: ConditionalEdge[] },
  outputNodeId: string,
) {
  const upstream = new Set<string>();
  for (const edge of graph.edges ?? []) {
    if (edge.target === outputNodeId && edge.source) {
      upstream.add(edge.source);
    }
  }
  for (const route of graph.conditional_edges ?? []) {
    for (const target of Object.values(route.branches ?? {})) {
      if (target === outputNodeId && route.source) {
        upstream.add(route.source);
      }
    }
  }
  return Array.from(upstream);
}

function startOutputTimersForNode(
  state: BuddyPublicOutputRuntimeState,
  bindings: BuddyPublicOutputBinding[],
  nodeId: string,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  if (!nodeId) {
    return state;
  }
  let nextStartedAt: Record<string, number> | null = null;
  for (const binding of bindings) {
    if (!binding.upstreamNodeIds.includes(nodeId)) {
      continue;
    }
    const existingMessage = state.messagesByOutputNodeId[binding.outputNodeId];
    if (existingMessage?.status === "completed" || existingMessage?.status === "failed") {
      continue;
    }
    if (state.startedAtByOutputNodeId[binding.outputNodeId] !== undefined) {
      continue;
    }
    nextStartedAt ??= { ...state.startedAtByOutputNodeId };
    nextStartedAt[binding.outputNodeId] = nowMs;
  }
  return nextStartedAt ? { ...state, startedAtByOutputNodeId: nextStartedAt } : state;
}

function applyStreamingDelta(
  state: BuddyPublicOutputRuntimeState,
  bindings: BuddyPublicOutputBinding[],
  payload: RunEventPayload,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text) {
    return state;
  }
  const outputKeys = listOutputKeys(payload.output_keys);
  const streamStateKeys = listOutputKeys(payload.stream_state_keys, outputKeys);
  const targetStateKeys = streamStateKeys.length > 0 ? streamStateKeys : outputKeys;
  if (targetStateKeys.length === 0) {
    return state;
  }

  let nextState = state;
  if (targetStateKeys.length > 1) {
    for (const stateKey of targetStateKeys) {
      const projection = projectStreamingJsonStateText(text, stateKey);
      if (projection.kind === "projected") {
        nextState = upsertMessagesForState(nextState, bindings, stateKey, projection.text, "streaming", nowMs);
      }
    }
    return nextState;
  }

  const singleStateProjection = projectStreamingJsonStateText(text, targetStateKeys[0]);
  if (singleStateProjection.kind === "pending") {
    return nextState;
  }
  return upsertMessagesForState(
    nextState,
    bindings,
    targetStateKeys[0],
    singleStateProjection.kind === "projected" ? singleStateProjection.text : text,
    "streaming",
    nowMs,
  );
}

function completeStateOutput(
  state: BuddyPublicOutputRuntimeState,
  bindings: BuddyPublicOutputBinding[],
  stateKey: string,
  value: unknown,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  if (!stateKey) {
    return state;
  }
  return upsertMessagesForState(state, bindings, stateKey, value, "completed", nowMs);
}

function failOutputsForNode(
  state: BuddyPublicOutputRuntimeState,
  bindings: BuddyPublicOutputBinding[],
  nodeId: string,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  if (!nodeId) {
    return state;
  }
  let nextState = state;
  for (const binding of bindings) {
    if (!binding.upstreamNodeIds.includes(nodeId)) {
      continue;
    }
    const existing = nextState.messagesByOutputNodeId[binding.outputNodeId];
    if (!existing || existing.status !== "streaming") {
      continue;
    }
    nextState = upsertMessage(nextState, binding, existing.content, "failed", nowMs);
  }
  return nextState;
}

function upsertMessagesForState(
  state: BuddyPublicOutputRuntimeState,
  bindings: BuddyPublicOutputBinding[],
  stateKey: string,
  content: unknown,
  status: BuddyPublicOutputMessageStatus,
  nowMs: number,
) {
  let nextState = state;
  for (const binding of bindings) {
    if (binding.stateKey === stateKey) {
      nextState = upsertMessage(nextState, binding, content, status, nowMs);
    }
  }
  return nextState;
}

function upsertMessage(
  state: BuddyPublicOutputRuntimeState,
  binding: BuddyPublicOutputBinding,
  content: unknown,
  status: BuddyPublicOutputMessageStatus,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  const startedAtMs = state.startedAtByOutputNodeId[binding.outputNodeId] ?? null;
  const existing = state.messagesByOutputNodeId[binding.outputNodeId];
  const message: BuddyPublicOutputMessage = {
    outputNodeId: binding.outputNodeId,
    outputNodeName: binding.outputNodeName,
    stateKey: binding.stateKey,
    stateName: binding.stateName,
    stateType: binding.stateType,
    displayMode: binding.displayMode,
    kind: resolveBuddyPublicOutputMessageKind(binding),
    content,
    startedAtMs,
    durationMs: status === "completed" || status === "failed" ? resolveOutputDurationMs(startedAtMs, nowMs) : existing?.durationMs ?? null,
    status,
  };
  return {
    ...state,
    order: existing ? state.order : [...state.order, binding.outputNodeId],
    messagesByOutputNodeId: {
      ...state.messagesByOutputNodeId,
      [binding.outputNodeId]: message,
    },
  };
}

function resolveOutputDurationMs(startedAtMs: number | null, nowMs: number) {
  return startedAtMs === null ? null : Math.max(0, Math.round(nowMs - startedAtMs));
}

function listOutputKeys(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.map((key) => String(key)).filter(Boolean) : fallback;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseEventEpochMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? epochMs : null;
}
