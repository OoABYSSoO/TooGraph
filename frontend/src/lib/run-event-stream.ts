export type RunEventPayload = Record<string, unknown>;

export type LiveStreamingOutput = {
  nodeId: string;
  text: string;
  chunkCount: number;
  outputKeys: string[];
  completed: boolean;
  updatedAt: string;
};

export function buildRunEventStreamUrl(runId: string) {
  const normalizedRunId = runId.trim();
  return normalizedRunId ? `/api/runs/${normalizedRunId}/events` : null;
}

export function shouldPollRunStatus(status: string | null | undefined) {
  return status === "queued" || status === "running" || status === "resuming";
}

export function parseRunEventPayloadData(data: unknown): RunEventPayload | null {
  try {
    const payload = JSON.parse(String(data ?? ""));
    return typeof payload === "object" && payload !== null ? (payload as RunEventPayload) : null;
  } catch {
    return null;
  }
}

export function resolveRunEventNodeId(payload: RunEventPayload) {
  return String(payload.node_id ?? "").trim();
}

export function resolveRunEventText(payload: RunEventPayload, fallback = "") {
  return typeof payload.text === "string" ? payload.text : fallback;
}

export function listRunEventOutputKeys(payload: RunEventPayload, fallback: string[] = []) {
  return Array.isArray(payload.output_keys) ? payload.output_keys.map((key) => String(key)).filter(Boolean) : fallback;
}

export function buildLiveStreamingOutput(
  current: LiveStreamingOutput | null | undefined,
  payload: RunEventPayload,
  completed = false,
): LiveStreamingOutput | null {
  const nodeId = resolveRunEventNodeId(payload);
  if (!nodeId) {
    return null;
  }

  const text = resolveRunEventText(payload, `${current?.text ?? ""}${typeof payload.delta === "string" ? payload.delta : ""}`);
  const outputKeys = listRunEventOutputKeys(payload, current?.outputKeys ?? []);

  return {
    nodeId,
    text,
    chunkCount: Number(payload.chunk_count ?? payload.chunk_index ?? current?.chunkCount ?? 0),
    outputKeys,
    completed: completed || Boolean(payload.completed) || current?.completed === true,
    updatedAt: String(payload.updated_at ?? payload.created_at ?? current?.updatedAt ?? ""),
  };
}
