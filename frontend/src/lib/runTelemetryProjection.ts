import type { GraphDocument, GraphNode, GraphPayload } from "../types/node-system.ts";
import type { NodeExecutionDetail, StateEvent } from "../types/run.ts";

export type RunNodeTimingStatus = "running" | "success" | "failed" | "paused";

export type RunNodeTiming = {
  status: RunNodeTimingStatus;
  startedAtEpochMs: number | null;
  durationMs: number | null;
};

export type RunNodeTimingByNodeId = Record<string, RunNodeTiming>;

type TimingGraphDocument = Pick<GraphPayload | GraphDocument, "nodes">;
type RunTimingSource = {
  node_executions?: Array<Partial<NodeExecutionDetail>>;
  artifacts?: {
    state_events?: Array<Partial<StateEvent>>;
  };
};

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
  return deriveOutputTimingsFromRun(result, run, document);
}

function timingFromExecution(execution: Partial<NodeExecutionDetail>): RunNodeTiming {
  const status = normalizeExecutionStatus(execution.status);
  return {
    status,
    startedAtEpochMs: parseIsoEpochMs(execution.started_at),
    durationMs: status === "running" ? null : normalizeDurationMs(execution.duration_ms),
  };
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
    },
  };
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
