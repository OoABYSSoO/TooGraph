export type RunNodeTimingStatus = "running" | "success" | "failed" | "paused";

export type RunNodeTiming = {
  status: RunNodeTimingStatus;
  startedAtMs: number | null;
  durationMs: number | null;
};

export type RunNodeTimingByNodeId = Record<string, RunNodeTiming>;

export function reduceRunNodeTimingEvent(
  current: RunNodeTimingByNodeId,
  eventType: string,
  payload: Record<string, unknown>,
  nowMs: number,
): RunNodeTimingByNodeId {
  const nodeId = normalizeNodeId(payload.node_id);
  if (!nodeId) {
    return current;
  }
  if (eventType === "node.started") {
    return { ...current, [nodeId]: { status: "running", startedAtMs: nowMs, durationMs: null } };
  }
  if (eventType === "node.completed") {
    return completeNodeTiming(current, nodeId, "success", payload.duration_ms, nowMs);
  }
  if (eventType === "node.failed") {
    return completeNodeTiming(current, nodeId, "failed", payload.duration_ms, nowMs);
  }
  if (eventType === "run.paused" || eventType === "node.paused") {
    return completeNodeTiming(current, nodeId, "paused", payload.duration_ms, nowMs);
  }
  return current;
}

export function buildRunNodeTimingByNodeIdFromRun(run: {
  node_executions?: Array<{ node_id?: string; status?: string; duration_ms?: number | null }>;
}): RunNodeTimingByNodeId {
  const result: RunNodeTimingByNodeId = {};
  for (const execution of run.node_executions ?? []) {
    const nodeId = normalizeNodeId(execution.node_id);
    if (!nodeId) {
      continue;
    }
    result[nodeId] = {
      status: normalizeExecutionStatus(execution.status),
      startedAtMs: null,
      durationMs: normalizeDurationMs(execution.duration_ms),
    };
  }
  return result;
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

function normalizeNodeId(value: unknown) {
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
