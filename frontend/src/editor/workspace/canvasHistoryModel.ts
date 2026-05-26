import { cloneGraphDocument } from "../../lib/graph-document.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";

export const DEFAULT_CANVAS_HISTORY_LIMIT = 50;
const DEFAULT_CANVAS_HISTORY_MERGE_WINDOW_MS = 600;

type GraphDraft = GraphPayload | GraphDocument;

export type CanvasDocumentHistory = {
  past: GraphDraft[];
  future: GraphDraft[];
  limit: number;
  lastMergeKey: string | null;
  lastRecordedAtMs: number | null;
};

export type CanvasDocumentHistoryOptions = {
  limit?: number;
};

export type CanvasDocumentHistoryRecordOptions = {
  mergeKey?: string | null;
  nowMs?: number;
  mergeWindowMs?: number;
};

export type CanvasDocumentHistoryStepResult = {
  history: CanvasDocumentHistory;
  document: GraphDraft | null;
};

export function createCanvasDocumentHistory(options: CanvasDocumentHistoryOptions = {}): CanvasDocumentHistory {
  return {
    past: [],
    future: [],
    limit: normalizeCanvasHistoryLimit(options.limit),
    lastMergeKey: null,
    lastRecordedAtMs: null,
  };
}

export function recordCanvasDocumentHistory(
  history: CanvasDocumentHistory,
  previousDocument: GraphDraft,
  options: CanvasDocumentHistoryRecordOptions = {},
): CanvasDocumentHistory {
  const nowMs = options.nowMs ?? Date.now();
  if (shouldMergeCanvasHistoryRecord(history, options, nowMs)) {
    return {
      ...history,
      future: [],
      lastRecordedAtMs: nowMs,
    };
  }

  return {
    ...history,
    past: limitCanvasHistorySnapshots([...history.past, cloneGraphDocument(previousDocument)], history.limit),
    future: [],
    lastMergeKey: options.mergeKey ?? null,
    lastRecordedAtMs: nowMs,
  };
}

export function undoCanvasDocumentHistory(
  history: CanvasDocumentHistory,
  currentDocument: GraphDraft,
): CanvasDocumentHistoryStepResult {
  const previousDocument = history.past.at(-1) ?? null;
  if (!previousDocument) {
    return {
      history: resetCanvasHistoryMergeState(history),
      document: null,
    };
  }

  return {
    history: {
      ...history,
      past: history.past.slice(0, -1),
      future: [cloneGraphDocument(currentDocument), ...history.future],
      lastMergeKey: null,
      lastRecordedAtMs: null,
    },
    document: cloneGraphDocument(previousDocument),
  };
}

export function redoCanvasDocumentHistory(
  history: CanvasDocumentHistory,
  currentDocument: GraphDraft,
): CanvasDocumentHistoryStepResult {
  const nextDocument = history.future[0] ?? null;
  if (!nextDocument) {
    return {
      history: resetCanvasHistoryMergeState(history),
      document: null,
    };
  }

  return {
    history: {
      ...history,
      past: limitCanvasHistorySnapshots([...history.past, cloneGraphDocument(currentDocument)], history.limit),
      future: history.future.slice(1),
      lastMergeKey: null,
      lastRecordedAtMs: null,
    },
    document: cloneGraphDocument(nextDocument),
  };
}

export function resetCanvasHistoryMergeState(history: CanvasDocumentHistory): CanvasDocumentHistory {
  return {
    ...history,
    lastMergeKey: null,
    lastRecordedAtMs: null,
  };
}

function shouldMergeCanvasHistoryRecord(
  history: CanvasDocumentHistory,
  options: CanvasDocumentHistoryRecordOptions,
  nowMs: number,
) {
  const mergeKey = options.mergeKey?.trim() ?? "";
  if (!mergeKey || history.lastMergeKey !== mergeKey || history.lastRecordedAtMs === null) {
    return false;
  }
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_CANVAS_HISTORY_MERGE_WINDOW_MS;
  return nowMs - history.lastRecordedAtMs <= mergeWindowMs;
}

function limitCanvasHistorySnapshots(snapshots: GraphDraft[], limit: number) {
  return snapshots.slice(Math.max(0, snapshots.length - limit));
}

function normalizeCanvasHistoryLimit(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : DEFAULT_CANVAS_HISTORY_LIMIT;
}
