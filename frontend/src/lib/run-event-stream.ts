import { projectStreamingJsonStateText } from "./streamingJsonStateRouter.ts";

export type RunEventPayload = Record<string, unknown>;

export type LiveStreamingOutput = {
  nodeId: string;
  text: string;
  chunkCount: number;
  outputKeys: string[];
  completed: boolean;
  updatedAt: string;
};

export type RunEventPreviewDocument = {
  state_schema?: Record<string, { type?: string | null }>;
  nodes: Record<string, { kind?: string; reads?: Array<{ state?: string | null }>; config?: Record<string, unknown> | null }>;
};

export type RunEventOutputPreviewEntry = {
  text: string;
  displayMode: string | null;
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

export function parseRunEventPayload(event: Event) {
  return event instanceof MessageEvent ? parseRunEventPayloadData(event.data) : null;
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

export function resolveRunEventPreviewNodeIds(
  document: RunEventPreviewDocument | null | undefined,
  outputKeys: string[],
  fallbackNodeId: string,
) {
  const outputKeySet = new Set(outputKeys);
  const targetNodeIds =
    document && outputKeys.length > 0
      ? Object.entries(document.nodes)
          .filter(([, node]) => node.kind === "output" && node.reads?.some((read) => typeof read.state === "string" && outputKeySet.has(read.state)))
          .map(([nodeId]) => nodeId)
      : [];

  return targetNodeIds.length > 0 ? targetNodeIds : fallbackNodeId ? [fallbackNodeId] : [];
}

export function buildRunEventOutputPreviewByNodeId(
  currentPreviewByNodeId: Record<string, RunEventOutputPreviewEntry>,
  previewNodeIds: string[],
  text: string,
  document?: RunEventPreviewDocument | null,
) {
  const nextPreviewByNodeId = { ...currentPreviewByNodeId };
  for (const nodeId of previewNodeIds) {
    nextPreviewByNodeId[nodeId] = {
      text,
      displayMode: resolveRunEventPreviewDisplayMode(document, nodeId),
    };
  }
  return nextPreviewByNodeId;
}

export function buildRunEventOutputPreviewUpdate(
  document: RunEventPreviewDocument | null | undefined,
  currentPreviewByNodeId: Record<string, RunEventOutputPreviewEntry>,
  payload: RunEventPayload,
) {
  const explicitStateKey = typeof payload.state_key === "string" ? payload.state_key.trim() : "";
  if (explicitStateKey) {
    const previewNodeIds = resolveOutputNodeIdsForState(document, explicitStateKey);
    return previewNodeIds.length > 0
      ? buildRunEventOutputPreviewByNodeId(
          currentPreviewByNodeId,
          previewNodeIds,
          stringifyRunEventPreviewValue(payload.value ?? payload.text),
          document,
        )
      : null;
  }

  const text = resolveRunEventText(payload);
  if (!text) {
    return null;
  }

  const outputKeys = listRunEventOutputKeys(payload);
  const streamStateKeys = listRunEventOutputKeys({ output_keys: payload.stream_state_keys }, outputKeys);
  if (streamStateKeys.length > 1) {
    const nextPreviewByNodeId = { ...currentPreviewByNodeId };
    let changed = false;
    for (const stateKey of streamStateKeys) {
      const projection = projectStreamingJsonStateText(text, stateKey);
      if (projection.kind !== "projected") {
        continue;
      }
      const previewNodeIds = resolveOutputNodeIdsForState(document, stateKey);
      for (const nodeId of previewNodeIds) {
        nextPreviewByNodeId[nodeId] = {
          text: projection.text,
          displayMode: resolveRunEventPreviewDisplayMode(document, nodeId),
        };
        changed = true;
      }
    }
    return changed ? nextPreviewByNodeId : null;
  }

  const fallbackNodeId = resolveRunEventNodeId(payload);
  const previewNodeIds = resolveRunEventPreviewNodeIds(document, streamStateKeys, fallbackNodeId);
  if (previewNodeIds.length === 0) {
    return null;
  }

  const singleStateProjection =
    streamStateKeys.length === 1 ? projectStreamingJsonStateText(text, streamStateKeys[0]) : { kind: "unmatched" as const };
  if (singleStateProjection.kind === "pending") {
    return null;
  }
  const previewText = singleStateProjection.kind === "projected" ? singleStateProjection.text : text;
  return buildRunEventOutputPreviewByNodeId(currentPreviewByNodeId, previewNodeIds, previewText, document);
}

export function stringifyRunEventPreviewValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function resolveOutputNodeIdsForState(document: RunEventPreviewDocument | null | undefined, stateKey: string) {
  if (!document || !stateKey) {
    return [];
  }
  return Object.entries(document.nodes)
    .filter(([, node]) => node.kind === "output" && node.reads?.some((read) => read.state === stateKey))
    .map(([nodeId]) => nodeId);
}

function resolveRunEventPreviewDisplayMode(document: RunEventPreviewDocument | null | undefined, nodeId: string) {
  const rawDisplayMode = document?.nodes[nodeId]?.config?.displayMode;
  const displayMode = typeof rawDisplayMode === "string" ? rawDisplayMode.trim() : "";
  if (displayMode && displayMode !== "auto" && ["plain", "markdown", "html", "json", "documents"].includes(displayMode)) {
    return displayMode;
  }
  if (isHtmlOutputNode(document, nodeId)) {
    return "html";
  }
  return isDocumentOutputNode(document, nodeId) ? "documents" : "plain";
}

function isHtmlOutputNode(document: RunEventPreviewDocument | null | undefined, nodeId: string) {
  const stateKey = document?.nodes[nodeId]?.reads?.[0]?.state?.trim();
  const stateType = stateKey ? document?.state_schema?.[stateKey]?.type?.trim() : "";
  return stateType === "html";
}

function isDocumentOutputNode(document: RunEventPreviewDocument | null | undefined, nodeId: string) {
  const stateKey = document?.nodes[nodeId]?.reads?.[0]?.state?.trim();
  const stateType = stateKey ? document?.state_schema?.[stateKey]?.type?.trim() : "";
  return stateType === "file" || stateType === "image" || stateType === "audio" || stateType === "video";
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
