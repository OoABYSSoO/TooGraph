import type { GraphDocument, GraphNode, GraphPayload } from "@/types/node-system";

export type RunNodeTimingStatus = "running" | "success" | "failed" | "paused";

export type RunNodeTiming = {
  status: RunNodeTimingStatus;
  startedAtMs: number | null;
  durationMs: number | null;
};

export type RunNodeTimingByNodeId = Record<string, RunNodeTiming>;

type RunNodeTimingGraphDocument = Pick<GraphPayload | GraphDocument, "nodes">;
type RunNodeExecutionTimingSource = {
  node_id?: string;
  status?: string;
  duration_ms?: number | null;
};
type RunStateEventTimingSource = {
  node_id?: string;
  state_key?: string;
};

export function reduceRunNodeTimingEvent(
  current: RunNodeTimingByNodeId,
  eventType: string,
  payload: Record<string, unknown>,
  nowMs: number,
  document?: RunNodeTimingGraphDocument | null,
): RunNodeTimingByNodeId {
  const nodeId = normalizeText(payload.node_id);
  if (eventType === "node.started") {
    if (!nodeId) {
      return current;
    }
    return startNodeAndConnectedOutputTiming(current, nodeId, nowMs, document);
  }
  if (eventType === "node.completed") {
    if (!nodeId) {
      return current;
    }
    return completeNodeTiming(current, nodeId, "success", payload.duration_ms, nowMs);
  }
  if (eventType === "node.failed") {
    if (!nodeId) {
      return current;
    }
    return completeNodeAndConnectedOutputTiming(current, nodeId, "failed", payload.duration_ms, nowMs, document);
  }
  if (eventType === "run.paused" || eventType === "node.paused") {
    if (!nodeId) {
      return current;
    }
    return completeNodeAndConnectedOutputTiming(current, nodeId, "paused", payload.duration_ms, nowMs, document);
  }
  if (eventType === "state.updated") {
    return completeOutputTimingForState(current, payload.state_key, "success", nowMs, document, nodeId);
  }
  return current;
}

export function buildRunNodeTimingByNodeIdFromRun(
  run: {
    node_executions?: RunNodeExecutionTimingSource[];
    artifacts?: {
      state_events?: RunStateEventTimingSource[];
    };
  },
  document?: RunNodeTimingGraphDocument | null,
): RunNodeTimingByNodeId {
  let result: RunNodeTimingByNodeId = {};
  for (const execution of run.node_executions ?? []) {
    const nodeId = normalizeText(execution.node_id);
    if (!nodeId) {
      continue;
    }
    result = {
      ...result,
      [nodeId]: {
        status: normalizeExecutionStatus(execution.status),
        startedAtMs: null,
        durationMs: normalizeDurationMs(execution.duration_ms),
      },
    };
  }
  return deriveOutputTimingsFromRun(result, run, document);
}

function startNodeAndConnectedOutputTiming(
  current: RunNodeTimingByNodeId,
  nodeId: string,
  nowMs: number,
  document?: RunNodeTimingGraphDocument | null,
) {
  let next: RunNodeTimingByNodeId = {
    ...current,
    [nodeId]: { status: "running", startedAtMs: nowMs, durationMs: null },
  };
  for (const outputNodeId of listConnectedOutputNodeIdsForWriter(document, nodeId)) {
    next = {
      ...next,
      [outputNodeId]: { status: "running", startedAtMs: nowMs, durationMs: null },
    };
  }
  return next;
}

function completeNodeAndConnectedOutputTiming(
  current: RunNodeTimingByNodeId,
  nodeId: string,
  status: Extract<RunNodeTimingStatus, "failed" | "paused">,
  rawDurationMs: unknown,
  nowMs: number,
  document?: RunNodeTimingGraphDocument | null,
) {
  let next = completeNodeTiming(current, nodeId, status, rawDurationMs, nowMs);
  for (const outputNodeId of listConnectedOutputNodeIdsForWriter(document, nodeId)) {
    if (next[outputNodeId]?.status !== "running") {
      continue;
    }
    next = completeNodeTiming(next, outputNodeId, status, rawDurationMs, nowMs);
  }
  return next;
}

function completeOutputTimingForState(
  current: RunNodeTimingByNodeId,
  rawStateKey: unknown,
  status: RunNodeTimingStatus,
  nowMs: number,
  document?: RunNodeTimingGraphDocument | null,
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
    const startedAtMs = existing?.startedAtMs ?? writerTiming?.startedAtMs ?? null;
    next = {
      ...next,
      [outputNodeId]: {
        status,
        startedAtMs,
        durationMs: startedAtMs === null ? null : Math.max(0, Math.round(nowMs - startedAtMs)),
      },
    };
  }
  return next;
}

function deriveOutputTimingsFromRun(
  current: RunNodeTimingByNodeId,
  run: {
    node_executions?: RunNodeExecutionTimingSource[];
    artifacts?: {
      state_events?: RunStateEventTimingSource[];
    };
  },
  document?: RunNodeTimingGraphDocument | null,
) {
  let next = current;
  for (const event of run.artifacts?.state_events ?? []) {
    const stateKey = normalizeText(event.state_key);
    if (!stateKey) {
      continue;
    }
    const writerNodeId = normalizeText(event.node_id);
    const writerExecution = writerNodeId ? findLastNodeExecution(run.node_executions ?? [], writerNodeId) : null;
    const durationMs = normalizeDurationMs(writerExecution?.duration_ms);
    for (const outputNodeId of listOutputNodeIdsForState(document, stateKey)) {
      next = {
        ...next,
        [outputNodeId]: {
          status: "success",
          startedAtMs: null,
          durationMs,
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
  nowMs: number,
) {
  const existing = current[nodeId];
  const payloadDurationMs = normalizeDurationMs(rawDurationMs);
  const durationMs =
    payloadDurationMs ?? (existing?.startedAtMs !== null && existing?.startedAtMs !== undefined
      ? Math.max(0, Math.round(nowMs - existing.startedAtMs))
      : null);
  return {
    ...current,
    [nodeId]: {
      status,
      startedAtMs: existing?.startedAtMs ?? null,
      durationMs,
    },
  };
}

function listConnectedOutputNodeIdsForWriter(document: RunNodeTimingGraphDocument | null | undefined, writerNodeId: string) {
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

function listOutputNodeIdsForState(document: RunNodeTimingGraphDocument | null | undefined, stateKey: string) {
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

function findLastNodeExecution(executions: RunNodeExecutionTimingSource[], nodeId: string) {
  for (let index = executions.length - 1; index >= 0; index -= 1) {
    if (normalizeText(executions[index]?.node_id) === nodeId) {
      return executions[index] ?? null;
    }
  }
  return null;
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
