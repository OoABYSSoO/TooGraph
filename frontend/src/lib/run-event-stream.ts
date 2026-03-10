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

export function parseRunEventPayloadData(data: unknown): RunEventPayload | null {
  try {
    const payload = JSON.parse(String(data ?? ""));
    return typeof payload === "object" && payload !== null ? (payload as RunEventPayload) : null;
  } catch {
    return null;
  }
}

export function buildLiveStreamingOutput(
  current: LiveStreamingOutput | null | undefined,
  payload: RunEventPayload,
  completed = false,
): LiveStreamingOutput | null {
  const nodeId = String(payload.node_id ?? "").trim();
  if (!nodeId) {
    return null;
  }

  const text =
    typeof payload.text === "string"
      ? payload.text
      : `${current?.text ?? ""}${typeof payload.delta === "string" ? payload.delta : ""}`;
  const outputKeys = Array.isArray(payload.output_keys)
    ? payload.output_keys.map((key) => String(key)).filter(Boolean)
    : current?.outputKeys ?? [];

  return {
    nodeId,
    text,
    chunkCount: Number(payload.chunk_count ?? payload.chunk_index ?? current?.chunkCount ?? 0),
    outputKeys,
    completed: completed || Boolean(payload.completed) || current?.completed === true,
    updatedAt: String(payload.updated_at ?? payload.created_at ?? current?.updatedAt ?? ""),
  };
}
