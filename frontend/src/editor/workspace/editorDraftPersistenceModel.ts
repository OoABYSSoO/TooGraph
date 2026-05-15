import type { CanvasViewport } from "../canvas/canvasViewport.ts";
import type { EditorWorkspaceTab, PersistedEditorWorkspace } from "../../lib/editor-workspace.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";

type GraphDraft = GraphPayload | GraphDocument;

export function listTabsMissingViewportDrafts(
  tabs: Pick<EditorWorkspaceTab, "tabId">[],
  viewportByTabId: Record<string, CanvasViewport>,
) {
  return tabs.map((tab) => tab.tabId).filter((tabId) => !viewportByTabId[tabId]);
}

export function buildNextCanvasViewportDrafts(
  viewportByTabId: Record<string, CanvasViewport>,
  tabId: string,
  viewport: CanvasViewport,
) {
  const previousViewport = viewportByTabId[tabId] ?? null;
  if (
    previousViewport &&
    previousViewport.x === viewport.x &&
    previousViewport.y === viewport.y &&
    previousViewport.scale === viewport.scale
  ) {
    return null;
  }

  return {
    ...viewportByTabId,
    [tabId]: viewport,
  };
}

export function listTabsMissingDocumentDrafts(
  tabs: EditorWorkspaceTab[],
  documentsByTabId: Record<string, GraphDraft>,
) {
  return tabs.filter((tab) => !tab.graphId && !documentsByTabId[tab.tabId]);
}

export function resolveUnsavedGraphDocumentHydrationSource(persistedDraft: GraphDraft | null) {
  if (persistedDraft) {
    return { type: "persisted" as const, document: persistedDraft };
  }

  return { type: "seed" as const };
}

export function shouldHydrateExistingGraphDocument(params: { hasDocument: boolean; isLoading: boolean }) {
  return !params.hasDocument && !params.isLoading;
}

export function resolveExistingGraphDocumentHydrationSource(params: {
  persistedDraft: GraphDraft | null;
  cachedGraph: GraphDocument | null;
  tabDirty: boolean;
}) {
  if (params.tabDirty && params.persistedDraft) {
    if (params.cachedGraph && areGraphDraftsEquivalent(params.persistedDraft, params.cachedGraph)) {
      return { type: "cached-graph" as const, graph: params.cachedGraph, clearDirty: true };
    }
    return { type: "persisted" as const, document: params.persistedDraft };
  }

  if (params.cachedGraph) {
    return { type: "cached-graph" as const, graph: params.cachedGraph, clearDirty: false };
  }

  return { type: "fetch" as const };
}

function areGraphDraftsEquivalent(left: GraphDraft, right: GraphDraft) {
  return JSON.stringify(normalizeGraphDraftForComparison(left)) === JSON.stringify(normalizeGraphDraftForComparison(right));
}

function normalizeGraphDraftForComparison(draft: GraphDraft) {
  const normalized = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  delete normalized.status;
  return normalized;
}

export function resolveWorkspaceDraftPersistenceRequest(params: {
  hydrated: boolean;
  workspace: PersistedEditorWorkspace;
}) {
  if (!params.hydrated) {
    return null;
  }

  return {
    workspace: params.workspace,
    tabIds: params.workspace.tabs.map((tab) => tab.tabId),
  };
}

export function shouldRunWorkspaceDraftHydration(hydrated: boolean) {
  return hydrated;
}
