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
  sourceOutputNodeId: string;
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

type BuddyPublicOutputMessageBinding = BuddyPublicOutputBinding & {
  sourceOutputNodeId?: string;
};

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

export function isBuddyPublicOutputMessageVisible(output: BuddyPublicOutputMessage | null | undefined) {
  if (!output) {
    return false;
  }
  return hasVisibleOutputContent(output.content);
}

export function listBuddyPublicOutputMessageIdsForOutputNode(
  state: BuddyPublicOutputRuntimeState,
  outputNodeId: string,
) {
  return state.order.filter((messageId) => {
    const message = state.messagesByOutputNodeId[messageId];
    return resolveBuddyPublicOutputSourceNodeId(message) === outputNodeId;
  });
}

export function listVisibleBuddyPublicOutputNodeIds(state: BuddyPublicOutputRuntimeState) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const messageId of state.order) {
    const message = state.messagesByOutputNodeId[messageId];
    if (!isBuddyPublicOutputMessageVisible(message)) {
      continue;
    }
    const outputNodeId = resolveBuddyPublicOutputSourceNodeId(message);
    if (!outputNodeId || seen.has(outputNodeId)) {
      continue;
    }
    seen.add(outputNodeId);
    result.push(outputNodeId);
  }
  return result;
}

export function createBuddyPublicOutputRuntimeState(): BuddyPublicOutputRuntimeState {
  return {
    order: [],
    messagesByOutputNodeId: {},
    startedAtByOutputNodeId: {},
  };
}

function hasVisibleOutputContent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
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
    const hasActiveMessage = listBuddyPublicOutputMessageIdsForOutputNode(state, binding.outputNodeId)
      .some((messageId) => state.messagesByOutputNodeId[messageId]?.status === "streaming");
    if (hasActiveMessage) {
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
    for (const messageId of listBuddyPublicOutputMessageIdsForOutputNode(nextState, binding.outputNodeId)) {
      const existing = nextState.messagesByOutputNodeId[messageId];
      if (!existing || existing.status !== "streaming") {
        continue;
      }
      nextState = upsertMessage(nextState, { ...binding, ...existing }, existing.content, "failed", nowMs);
    }
  }
  return nextState;
}

export function upsertBuddyPublicOutputMessagesForState(
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
      nextState = upsertBuddyPublicOutputMessagesForBinding(nextState, binding, content, status, nowMs);
    }
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
  return upsertBuddyPublicOutputMessagesForState(state, bindings, stateKey, content, status, nowMs);
}

export function upsertBuddyPublicOutputMessagesForBinding(
  state: BuddyPublicOutputRuntimeState,
  binding: BuddyPublicOutputBinding,
  content: unknown,
  status: BuddyPublicOutputMessageStatus,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  const packageOutputs = listResultPackageOutputMessages(binding, content);
  if (packageOutputs.length === 0) {
    return upsertMessage(state, binding, content, status, nowMs);
  }

  const packageMessageIds = new Set(packageOutputs.map((output) => output.binding.outputNodeId));
  let nextState = removeOutputMessagesForSource(state, binding.outputNodeId, packageMessageIds);
  for (const output of packageOutputs) {
    nextState = upsertMessage(nextState, output.binding, output.content, status, nowMs);
  }
  return nextState;
}

function upsertMessage(
  state: BuddyPublicOutputRuntimeState,
  binding: BuddyPublicOutputMessageBinding,
  content: unknown,
  status: BuddyPublicOutputMessageStatus,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  const sourceOutputNodeId = binding.sourceOutputNodeId || binding.outputNodeId;
  const startedAtMs = state.startedAtByOutputNodeId[sourceOutputNodeId] ?? state.startedAtByOutputNodeId[binding.outputNodeId] ?? null;
  const messageId = resolveOutputMessageIdForUpsert(state, binding, sourceOutputNodeId, status);
  const existing = state.messagesByOutputNodeId[messageId];
  const message: BuddyPublicOutputMessage = {
    outputNodeId: messageId,
    sourceOutputNodeId,
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
    order: existing ? state.order : [...state.order, messageId],
    messagesByOutputNodeId: {
      ...state.messagesByOutputNodeId,
      [messageId]: message,
    },
  };
}

function resolveOutputMessageIdForUpsert(
  state: BuddyPublicOutputRuntimeState,
  binding: BuddyPublicOutputMessageBinding,
  sourceOutputNodeId: string,
  status: BuddyPublicOutputMessageStatus,
) {
  const latestStreamingMessageId = findLatestMessageIdForSource(state, sourceOutputNodeId, binding.stateKey, "streaming");
  if (latestStreamingMessageId) {
    return latestStreamingMessageId;
  }
  const existing = state.messagesByOutputNodeId[binding.outputNodeId];
  if (!existing) {
    return binding.outputNodeId;
  }
  if (existing.status === "streaming" || status === "streaming") {
    return existing.status === "streaming" ? binding.outputNodeId : nextOutputMessageId(state, binding.outputNodeId, sourceOutputNodeId);
  }
  return nextOutputMessageId(state, binding.outputNodeId, sourceOutputNodeId);
}

function findLatestMessageIdForSource(
  state: BuddyPublicOutputRuntimeState,
  sourceOutputNodeId: string,
  stateKey: string,
  status: BuddyPublicOutputMessageStatus,
) {
  for (let index = state.order.length - 1; index >= 0; index -= 1) {
    const messageId = state.order[index];
    const message = state.messagesByOutputNodeId[messageId];
    if (
      message?.status === status &&
      resolveBuddyPublicOutputSourceNodeId(message) === sourceOutputNodeId &&
      message.stateKey === stateKey
    ) {
      return messageId;
    }
  }
  return "";
}

function nextOutputMessageId(
  state: BuddyPublicOutputRuntimeState,
  baseOutputNodeId: string,
  sourceOutputNodeId: string,
) {
  let count = 0;
  for (const messageId of state.order) {
    const message = state.messagesByOutputNodeId[messageId];
    if (resolveBuddyPublicOutputSourceNodeId(message) === sourceOutputNodeId) {
      count += 1;
    }
  }
  let candidate = `${baseOutputNodeId}:${Math.max(2, count + 1)}`;
  while (state.messagesByOutputNodeId[candidate]) {
    count += 1;
    candidate = `${baseOutputNodeId}:${count + 1}`;
  }
  return candidate;
}

function listResultPackageOutputMessages(
  binding: BuddyPublicOutputBinding,
  content: unknown,
): Array<{ binding: BuddyPublicOutputMessageBinding; content: unknown }> {
  if (!isResultPackageValue(content)) {
    return [];
  }
  const outputs = content.outputs as Record<string, unknown>;
  return Object.entries(outputs).flatMap(([key, rawOutput]) => {
    const outputKey = key.trim();
    if (!outputKey) {
      return [];
    }
    const outputRecord = isRecord(rawOutput) ? rawOutput : null;
    const outputValue = outputRecord && Object.prototype.hasOwnProperty.call(outputRecord, "value") ? outputRecord.value : rawOutput;
    const stateType = normalizeString(outputRecord?.type) || inferResultPackageOutputStateType(outputValue);
    const displayMode = resolveResultPackageOutputDisplayMode(binding.displayMode, stateType, outputValue);
    return [
      {
        binding: {
          ...binding,
          outputNodeId: buildResultPackageOutputMessageId(binding.outputNodeId, outputKey),
          sourceOutputNodeId: binding.outputNodeId,
          stateKey: `${binding.stateKey}.${outputKey}`,
          stateName: normalizeString(outputRecord?.name) || outputKey,
          stateType: stateType || binding.stateType,
          displayMode,
        },
        content: outputValue,
      },
    ];
  });
}

function removeOutputMessagesForSource(
  state: BuddyPublicOutputRuntimeState,
  sourceOutputNodeId: string,
  keepMessageIds: Set<string>,
): BuddyPublicOutputRuntimeState {
  let changed = false;
  const nextMessages = { ...state.messagesByOutputNodeId };
  const nextOrder = state.order.filter((messageId) => {
    const message = state.messagesByOutputNodeId[messageId];
    if (
      resolveBuddyPublicOutputSourceNodeId(message) !== sourceOutputNodeId ||
      keepMessageIds.has(messageId) ||
      message?.status !== "streaming"
    ) {
      return true;
    }
    changed = true;
    delete nextMessages[messageId];
    return false;
  });
  return changed ? { ...state, order: nextOrder, messagesByOutputNodeId: nextMessages } : state;
}

function buildResultPackageOutputMessageId(outputNodeId: string, outputKey: string) {
  return `${outputNodeId}:${outputKey}`;
}

function isResultPackageValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.kind === "result_package" && isRecord(value.outputs);
}

function resolveResultPackageOutputDisplayMode(
  configuredDisplayMode: string,
  stateType: string,
  outputValue: unknown,
) {
  const normalizedType = stateType.trim().toLowerCase();
  if (normalizedType === "markdown") {
    return "markdown";
  }
  if (normalizedType === "html") {
    return "html";
  }
  if (normalizedType === "json" || normalizedType === "capability" || normalizedType === "result_package") {
    return "json";
  }
  if (normalizedType === "file" || normalizedType === "image" || normalizedType === "audio" || normalizedType === "video") {
    return "documents";
  }
  if (normalizedType === "text" || normalizedType === "number" || normalizedType === "boolean") {
    return "plain";
  }
  if (configuredDisplayMode && configuredDisplayMode !== "auto") {
    return configuredDisplayMode;
  }
  if (Array.isArray(outputValue) || isRecord(outputValue)) {
    return "json";
  }
  return "auto";
}

function inferResultPackageOutputStateType(value: unknown) {
  if (typeof value === "string") {
    return "text";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (Array.isArray(value) || isRecord(value)) {
    return "json";
  }
  return "";
}

function resolveBuddyPublicOutputSourceNodeId(output: BuddyPublicOutputMessage | null | undefined) {
  return output?.sourceOutputNodeId || output?.outputNodeId || "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
