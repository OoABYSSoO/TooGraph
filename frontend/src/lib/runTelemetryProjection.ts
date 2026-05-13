import type { GraphDocument, GraphNode, GraphPayload } from "../types/node-system.ts";
import type { NodeExecutionDetail, StateEvent, StateStreamEvent } from "../types/run.ts";
import { routeStreamingJsonStateText } from "./streamingJsonStateRouter.ts";

export type RunNodeTimingStatus = "running" | "success" | "failed" | "paused";

export type RunNodeTiming = {
  status: RunNodeTimingStatus;
  startedAtEpochMs: number | null;
  durationMs: number | null;
  tokenCount?: number;
};

export type RunNodeTimingByNodeId = Record<string, RunNodeTiming>;

type TimingGraphDocument = Pick<GraphPayload | GraphDocument, "nodes">;
type RunTimingSource = {
  node_executions?: Array<Partial<NodeExecutionDetail>>;
  artifacts?: {
    state_events?: Array<Partial<StateEvent>>;
    state_stream_events?: Array<Partial<StateStreamEvent>>;
  };
};

const RUNTIME_CONFIG_USAGE_KEYS = [
  "provider_usage",
  "structured_output_repair_provider_usage",
  "skill_input_provider_usage",
  "skill_input_structured_output_repair_provider_usage",
  "subgraph_input_provider_usage",
  "subgraph_input_structured_output_repair_provider_usage",
] as const;

const DIRECT_TOKEN_TOTAL_KEYS = ["total_tokens", "totalTokens", "totalTokenCount", "total_token_count"] as const;

const TOKEN_PART_KEYS = [
  "input_tokens",
  "output_tokens",
  "prompt_tokens",
  "completion_tokens",
  "inputTokens",
  "outputTokens",
  "promptTokens",
  "completionTokens",
  "inputTokenCount",
  "outputTokenCount",
  "promptTokenCount",
  "candidatesTokenCount",
  "thoughtsTokenCount",
  "cachedContentTokenCount",
  "input_token_count",
  "output_token_count",
  "prompt_token_count",
  "completion_token_count",
  "candidates_token_count",
  "thoughts_token_count",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
] as const;

export function reduceRunNodeTimingEvent(
  current: RunNodeTimingByNodeId,
  eventType: string,
  payload: Record<string, unknown>,
  nowEpochMs: number,
  document?: TimingGraphDocument | null,
): RunNodeTimingByNodeId {
  const nodeId = normalizeText(payload.node_id);
  if (eventType === "node.started") {
    if (!nodeId) {
      return current;
    }
    const startedAtEpochMs = parseIsoEpochMs(payload.started_at) ?? nowEpochMs;
    return startNodeAndConnectedOutputTiming(current, nodeId, startedAtEpochMs, document);
  }
  if (eventType === "node.completed") {
    if (!nodeId) {
      return current;
    }
    return completeNodeTiming(current, nodeId, "success", payload.duration_ms, nowEpochMs);
  }
  if (eventType === "node.failed") {
    if (!nodeId) {
      return current;
    }
    return completeNodeAndConnectedOutputTiming(current, nodeId, "failed", payload.duration_ms, nowEpochMs, document);
  }
  if (eventType === "run.paused" || eventType === "node.paused") {
    if (!nodeId) {
      return current;
    }
    return completeNodeAndConnectedOutputTiming(current, nodeId, "paused", payload.duration_ms, nowEpochMs, document);
  }
  if (eventType === "node.output.delta" || eventType === "node.output.completed") {
    const completedAtEpochMs = parseIsoEpochMs(payload.updated_at) ?? parseIsoEpochMs(payload.created_at) ?? nowEpochMs;
    return completeOutputTimingsForStreamingStateCompletions(current, payload, completedAtEpochMs, document, nodeId);
  }
  if (eventType === "state.updated") {
    const createdAtEpochMs = parseIsoEpochMs(payload.created_at) ?? nowEpochMs;
    return completeOutputTimingForState(current, payload.state_key, "success", createdAtEpochMs, document, nodeId);
  }
  return current;
}

export function buildRunNodeTimingByNodeIdFromRun(
  run: RunTimingSource,
  document?: TimingGraphDocument | null,
): RunNodeTimingByNodeId {
  let result: RunNodeTimingByNodeId = {};
  for (const execution of run.node_executions ?? []) {
    const nodeId = normalizeText(execution.node_id);
    if (!nodeId) {
      continue;
    }
    result = {
      ...result,
      [nodeId]: timingFromExecution(execution),
    };
  }
  result = deriveOutputTimingsFromRunningExecutions(result, run, document);
  result = deriveOutputTimingsFromStateStreamEvents(result, run, document);
  return deriveOutputTimingsFromRun(result, run, document);
}

function timingFromExecution(execution: Partial<NodeExecutionDetail>): RunNodeTiming {
  const status = normalizeExecutionStatus(execution.status);
  const timing: RunNodeTiming = {
    status,
    startedAtEpochMs: parseIsoEpochMs(execution.started_at),
    durationMs: status === "running" ? null : normalizeDurationMs(execution.duration_ms),
  };
  const tokenCount = resolveExecutionTokenCount(execution);
  if (tokenCount !== null) {
    timing.tokenCount = tokenCount;
  }
  return timing;
}

function startNodeAndConnectedOutputTiming(
  current: RunNodeTimingByNodeId,
  nodeId: string,
  startedAtEpochMs: number,
  document?: TimingGraphDocument | null,
) {
  let next: RunNodeTimingByNodeId = {
    ...current,
    [nodeId]: { status: "running", startedAtEpochMs, durationMs: null },
  };
  for (const outputNodeId of listConnectedOutputNodeIdsForWriter(document, nodeId)) {
    next = {
      ...next,
      [outputNodeId]: { status: "running", startedAtEpochMs, durationMs: null },
    };
  }
  return next;
}

function completeNodeAndConnectedOutputTiming(
  current: RunNodeTimingByNodeId,
  nodeId: string,
  status: Extract<RunNodeTimingStatus, "failed" | "paused">,
  rawDurationMs: unknown,
  nowEpochMs: number,
  document?: TimingGraphDocument | null,
) {
  let next = completeNodeTiming(current, nodeId, status, rawDurationMs, nowEpochMs);
  for (const outputNodeId of listConnectedOutputNodeIdsForWriter(document, nodeId)) {
    if (next[outputNodeId]?.status !== "running") {
      continue;
    }
    next = completeNodeTiming(next, outputNodeId, status, rawDurationMs, nowEpochMs);
  }
  return next;
}

function completeOutputTimingForState(
  current: RunNodeTimingByNodeId,
  rawStateKey: unknown,
  status: RunNodeTimingStatus,
  finishedAtEpochMs: number,
  document?: TimingGraphDocument | null,
  writerNodeId?: string,
) {
  const stateKey = normalizeText(rawStateKey);
  if (!stateKey) {
    return current;
  }
  let next = current;
  for (const outputNodeId of listOutputNodeIdsForState(document, stateKey)) {
    const existing = next[outputNodeId];
    if (existing?.status === "success" && existing.durationMs !== null) {
      continue;
    }
    const writerTiming = writerNodeId ? next[writerNodeId] : null;
    const startedAtEpochMs = existing?.startedAtEpochMs ?? writerTiming?.startedAtEpochMs ?? null;
    next = {
      ...next,
      [outputNodeId]: {
        status,
        startedAtEpochMs,
        durationMs: startedAtEpochMs === null ? null : Math.max(0, Math.round(finishedAtEpochMs - startedAtEpochMs)),
      },
    };
  }
  return next;
}

function completeOutputTimingsForStreamingStateCompletions(
  current: RunNodeTimingByNodeId,
  payload: Record<string, unknown>,
  finishedAtEpochMs: number,
  document?: TimingGraphDocument | null,
  writerNodeId?: string,
) {
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text) {
    return current;
  }
  const outputKeys = listPayloadStateKeys(payload.output_keys);
  const streamStateKeys = listPayloadStateKeys(payload.stream_state_keys, outputKeys);
  const targetStateKeys = streamStateKeys.length > 0 ? streamStateKeys : outputKeys;
  if (targetStateKeys.length <= 1) {
    return current;
  }
  let next = current;
  const routed = routeStreamingJsonStateText(text, targetStateKeys);
  for (const [stateKey, route] of Object.entries(routed)) {
    if (!route.completed) {
      continue;
    }
    next = completeOutputTimingForState(next, stateKey, "success", finishedAtEpochMs, document, writerNodeId);
  }
  return next;
}

function deriveOutputTimingsFromRun(
  current: RunNodeTimingByNodeId,
  run: RunTimingSource,
  document?: TimingGraphDocument | null,
) {
  let next = current;
  for (const event of run.artifacts?.state_events ?? []) {
    const stateKey = normalizeText(event.state_key);
    if (!stateKey) {
      continue;
    }
    const writerNodeId = normalizeText(event.node_id);
    const eventCreatedAtEpochMs = parseIsoEpochMs(event.created_at);
    const writerExecution = writerNodeId
      ? findLastNodeExecution(run.node_executions ?? [], writerNodeId, eventCreatedAtEpochMs)
      : null;
    const writerStartedAtEpochMs = parseIsoEpochMs(writerExecution?.started_at);
    const fallbackDurationMs = normalizeDurationMs(writerExecution?.duration_ms);
    const durationMs =
      writerStartedAtEpochMs !== null && eventCreatedAtEpochMs !== null
        ? Math.max(0, Math.round(eventCreatedAtEpochMs - writerStartedAtEpochMs))
        : fallbackDurationMs;
    for (const outputNodeId of listOutputNodeIdsForState(document, stateKey)) {
      const existing = next[outputNodeId];
      if (existing?.status === "success" && existing.durationMs !== null) {
        continue;
      }
      next = {
        ...next,
        [outputNodeId]: {
          status: "success",
          startedAtEpochMs: writerStartedAtEpochMs,
          durationMs,
        },
      };
    }
  }
  return next;
}

function deriveOutputTimingsFromStateStreamEvents(
  current: RunNodeTimingByNodeId,
  run: RunTimingSource,
  document?: TimingGraphDocument | null,
) {
  let next = current;
  for (const event of run.artifacts?.state_stream_events ?? []) {
    if (normalizeText(event.status) !== "completed") {
      continue;
    }
    const stateKey = normalizeText(event.state_key);
    if (!stateKey) {
      continue;
    }
    const writerNodeId = normalizeText(event.node_id);
    const eventCreatedAtEpochMs = parseIsoEpochMs(event.created_at);
    const writerExecution = writerNodeId
      ? findLastNodeExecution(run.node_executions ?? [], writerNodeId, eventCreatedAtEpochMs)
      : null;
    const writerStartedAtEpochMs = parseIsoEpochMs(writerExecution?.started_at);
    const durationMs =
      writerStartedAtEpochMs !== null && eventCreatedAtEpochMs !== null
        ? Math.max(0, Math.round(eventCreatedAtEpochMs - writerStartedAtEpochMs))
        : null;
    for (const outputNodeId of listOutputNodeIdsForState(document, stateKey)) {
      next = {
        ...next,
        [outputNodeId]: {
          status: "success",
          startedAtEpochMs: writerStartedAtEpochMs,
          durationMs,
        },
      };
    }
  }
  return next;
}

function deriveOutputTimingsFromRunningExecutions(
  current: RunNodeTimingByNodeId,
  run: RunTimingSource,
  document?: TimingGraphDocument | null,
) {
  let next = current;
  for (const execution of run.node_executions ?? []) {
    const nodeId = normalizeText(execution.node_id);
    if (!nodeId || normalizeExecutionStatus(execution.status) !== "running") {
      continue;
    }
    const startedAtEpochMs = parseIsoEpochMs(execution.started_at);
    if (startedAtEpochMs === null) {
      continue;
    }
    for (const outputNodeId of listConnectedOutputNodeIdsForWriter(document, nodeId)) {
      if (next[outputNodeId]?.status === "success") {
        continue;
      }
      next = {
        ...next,
        [outputNodeId]: {
          status: "running",
          startedAtEpochMs,
          durationMs: null,
        },
      };
    }
  }
  return next;
}

function completeNodeTiming(
  current: RunNodeTimingByNodeId,
  nodeId: string,
  status: RunNodeTimingStatus,
  rawDurationMs: unknown,
  nowEpochMs: number,
) {
  const existing = current[nodeId];
  const payloadDurationMs = normalizeDurationMs(rawDurationMs);
  const durationMs =
    payloadDurationMs ?? (existing?.startedAtEpochMs !== null && existing?.startedAtEpochMs !== undefined
      ? Math.max(0, Math.round(nowEpochMs - existing.startedAtEpochMs))
      : null);
  return {
    ...current,
    [nodeId]: {
      status,
      startedAtEpochMs: existing?.startedAtEpochMs ?? null,
      durationMs,
      ...(existing?.tokenCount !== undefined ? { tokenCount: existing.tokenCount } : {}),
    },
  };
}

function resolveExecutionTokenCount(execution: Partial<NodeExecutionDetail>) {
  const runtimeConfig = asRecord(execution.artifacts?.runtime_config);
  if (!runtimeConfig) {
    return null;
  }
  let tokenCount = 0;
  for (const usageKey of RUNTIME_CONFIG_USAGE_KEYS) {
    tokenCount += normalizeProviderUsageTokenCount(runtimeConfig[usageKey]) ?? 0;
  }
  return tokenCount > 0 ? Math.round(tokenCount) : null;
}

function normalizeProviderUsageTokenCount(value: unknown) {
  const usage = asRecord(value);
  if (!usage) {
    return null;
  }
  for (const totalKey of DIRECT_TOKEN_TOTAL_KEYS) {
    const total = normalizePositiveNumber(usage[totalKey]);
    if (total > 0) {
      return total;
    }
  }
  let tokenCount = 0;
  for (const partKey of TOKEN_PART_KEYS) {
    tokenCount += normalizePositiveNumber(usage[partKey]);
  }
  return tokenCount > 0 ? tokenCount : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizePositiveNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function listPayloadStateKeys(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : fallback;
}

function listConnectedOutputNodeIdsForWriter(document: TimingGraphDocument | null | undefined, writerNodeId: string) {
  const writerNode = document?.nodes?.[writerNodeId];
  if (!writerNode) {
    return [];
  }
  const writtenStates = new Set(listNodeWriteStateKeys(writerNode));
  if (writtenStates.size === 0) {
    return [];
  }
  return Object.entries(document?.nodes ?? {})
    .filter(([, node]) => node.kind === "output" && listNodeReadStateKeys(node).some((stateKey) => writtenStates.has(stateKey)))
    .map(([outputNodeId]) => outputNodeId);
}

function listOutputNodeIdsForState(document: TimingGraphDocument | null | undefined, stateKey: string) {
  return Object.entries(document?.nodes ?? {})
    .filter(([, node]) => node.kind === "output" && listNodeReadStateKeys(node).includes(stateKey))
    .map(([nodeId]) => nodeId);
}

function listNodeReadStateKeys(node: GraphNode) {
  return node.reads.map((binding) => binding.state.trim()).filter(Boolean);
}

function listNodeWriteStateKeys(node: GraphNode) {
  return node.writes.map((binding) => binding.state.trim()).filter(Boolean);
}

function findLastNodeExecution(
  executions: Array<Partial<NodeExecutionDetail>>,
  nodeId: string,
  beforeEpochMs: number | null,
) {
  let fallback: Partial<NodeExecutionDetail> | null = null;
  for (let index = executions.length - 1; index >= 0; index -= 1) {
    const execution = executions[index];
    if (normalizeText(execution?.node_id) !== nodeId) {
      continue;
    }
    fallback ??= execution ?? null;
    if (beforeEpochMs === null) {
      return execution ?? null;
    }
    const startedAtEpochMs = parseIsoEpochMs(execution?.started_at);
    if (startedAtEpochMs !== null && startedAtEpochMs <= beforeEpochMs) {
      return execution ?? null;
    }
  }
  return fallback;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeExecutionStatus(value: unknown): RunNodeTimingStatus {
  if (value === "failed" || value === "error") {
    return "failed";
  }
  if (value === "paused" || value === "awaiting_human") {
    return "paused";
  }
  if (value === "running") {
    return "running";
  }
  return "success";
}

function normalizeDurationMs(value: unknown) {
  const durationMs = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null;
}

function parseIsoEpochMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? epochMs : null;
}
