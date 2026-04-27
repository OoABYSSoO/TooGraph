import { normalizeCanvasViewport, type CanvasViewport } from "../editor/canvas/canvasViewport.ts";
import type { GraphDocument, GraphPayload } from "../types/node-system.ts";

export type EditorTabKind = "existing" | "new" | "template";

export type EditorWorkspaceTab = {
  tabId: string;
  kind: EditorTabKind;
  graphId: string | null;
  title: string;
  dirty: boolean;
  templateId: string | null;
  defaultTemplateId: string | null;
};

export type PersistedEditorWorkspace = {
  activeTabId: string | null;
  tabs: EditorWorkspaceTab[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const EDITOR_WORKSPACE_STORAGE_KEY = "graphiteui:editor-workspace";
export const EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY = "graphiteui:editor-document-drafts";
export const EDITOR_WORKSPACE_VIEWPORTS_STORAGE_KEY = "graphiteui:editor-viewport-drafts";

const EMPTY_EDITOR_WORKSPACE: PersistedEditorWorkspace = {
  activeTabId: null,
  tabs: [],
};

function getLocalStorage(): StorageLike | null {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }

  const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
  return candidate ?? null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeGraphDocumentDraft(value: unknown): GraphPayload | GraphDocument | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const graphId = value.graph_id;
  if (
    !(graphId === undefined || graphId === null || typeof graphId === "string") ||
    typeof value.name !== "string" ||
    !isPlainRecord(value.state_schema) ||
    !isPlainRecord(value.nodes) ||
    !Array.isArray(value.edges) ||
    !Array.isArray(value.conditional_edges) ||
    !isPlainRecord(value.metadata)
  ) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as GraphPayload | GraphDocument;
}

function normalizeCanvasViewportDraft(value: unknown): CanvasViewport | null {
  return normalizeCanvasViewport(value);
}

function normalizeEditorWorkspaceTab(value: unknown): EditorWorkspaceTab | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EditorWorkspaceTab>;
  const tabId = normalizeNullableString(candidate.tabId);
  if (!tabId) {
    return null;
  }

  const kind = candidate.kind;
  if (kind !== "existing" && kind !== "new" && kind !== "template") {
    return null;
  }

  return {
    tabId,
    kind,
    graphId: normalizeNullableString(candidate.graphId),
    title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title : "Untitled Graph",
    dirty: Boolean(candidate.dirty),
    templateId: normalizeNullableString(candidate.templateId),
    defaultTemplateId: normalizeNullableString(candidate.defaultTemplateId),
  };
}

function normalizePersistedEditorWorkspace(value: unknown): PersistedEditorWorkspace {
  if (!value || typeof value !== "object") {
    return EMPTY_EDITOR_WORKSPACE;
  }

  const candidate = value as Partial<PersistedEditorWorkspace>;
  const tabs = Array.isArray(candidate.tabs)
    ? candidate.tabs.map(normalizeEditorWorkspaceTab).filter((tab): tab is EditorWorkspaceTab => tab != null)
    : [];
  const activeTabId = normalizeNullableString(candidate.activeTabId);
  const activeTabExists = activeTabId ? tabs.some((tab) => tab.tabId === activeTabId) : false;

  return {
    activeTabId: activeTabExists ? activeTabId : tabs[0]?.tabId ?? null,
    tabs,
  };
}

export function createNewTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createUnsavedWorkspaceTab(params?: {
  title?: string;
  kind?: Extract<EditorTabKind, "new" | "template" | "existing">;
  templateId?: string | null;
  defaultTemplateId?: string | null;
}): EditorWorkspaceTab {
  return {
    tabId: createNewTabId(),
    kind: params?.kind ?? "new",
    graphId: null,
    title: params?.title?.trim() || "Untitled Graph",
    dirty: false,
    templateId: normalizeNullableString(params?.templateId),
    defaultTemplateId: normalizeNullableString(params?.defaultTemplateId),
  };
}

export function readPersistedEditorWorkspace(): PersistedEditorWorkspace {
  const storage = getLocalStorage();
  if (!storage) {
    return EMPTY_EDITOR_WORKSPACE;
  }

  const raw = storage.getItem(EDITOR_WORKSPACE_STORAGE_KEY);
  if (!raw) {
    return EMPTY_EDITOR_WORKSPACE;
  }

  try {
    return normalizePersistedEditorWorkspace(JSON.parse(raw));
  } catch {
    return EMPTY_EDITOR_WORKSPACE;
  }
}

export function writePersistedEditorWorkspace(workspace: PersistedEditorWorkspace): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.setItem(EDITOR_WORKSPACE_STORAGE_KEY, JSON.stringify(normalizePersistedEditorWorkspace(workspace)));
}

function readPersistedEditorDocumentDrafts(): Record<string, GraphPayload | GraphDocument> {
  const storage = getLocalStorage();
  if (!storage) {
    return {};
  }

  const raw = storage.getItem(EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      return {};
    }

    const drafts: Record<string, GraphPayload | GraphDocument> = {};
    for (const [tabId, value] of Object.entries(parsed)) {
      const normalizedTabId = normalizeNullableString(tabId);
      const draft = normalizeGraphDocumentDraft(value);
      if (normalizedTabId && draft) {
        drafts[normalizedTabId] = draft;
      }
    }
    return drafts;
  } catch {
    return {};
  }
}

function writePersistedEditorDocumentDrafts(drafts: Record<string, GraphPayload | GraphDocument>): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(EDITOR_WORKSPACE_DOCUMENTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Draft persistence should never interrupt an editing gesture.
  }
}

function readPersistedEditorViewportDrafts(): Record<string, CanvasViewport> {
  const storage = getLocalStorage();
  if (!storage) {
    return {};
  }

  const raw = storage.getItem(EDITOR_WORKSPACE_VIEWPORTS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      return {};
    }

    const drafts: Record<string, CanvasViewport> = {};
    for (const [tabId, value] of Object.entries(parsed)) {
      const normalizedTabId = normalizeNullableString(tabId);
      const viewport = normalizeCanvasViewportDraft(value);
      if (normalizedTabId && viewport) {
        drafts[normalizedTabId] = viewport;
      }
    }
    return drafts;
  } catch {
    return {};
  }
}

function writePersistedEditorViewportDrafts(drafts: Record<string, CanvasViewport>): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(EDITOR_WORKSPACE_VIEWPORTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Viewport persistence should never interrupt an editing gesture.
  }
}

export function readPersistedEditorDocumentDraft(tabId: string): GraphPayload | GraphDocument | null {
  const normalizedTabId = normalizeNullableString(tabId);
  if (!normalizedTabId) {
    return null;
  }
  return readPersistedEditorDocumentDrafts()[normalizedTabId] ?? null;
}

export function writePersistedEditorDocumentDraft(tabId: string, document: GraphPayload | GraphDocument): void {
  const normalizedTabId = normalizeNullableString(tabId);
  const normalizedDraft = normalizeGraphDocumentDraft(document);
  if (!normalizedTabId || !normalizedDraft) {
    return;
  }

  writePersistedEditorDocumentDrafts({
    ...readPersistedEditorDocumentDrafts(),
    [normalizedTabId]: normalizedDraft,
  });
}

export function removePersistedEditorDocumentDraft(tabId: string): void {
  const normalizedTabId = normalizeNullableString(tabId);
  if (!normalizedTabId) {
    return;
  }

  const drafts = readPersistedEditorDocumentDrafts();
  if (!(normalizedTabId in drafts)) {
    return;
  }

  const nextDrafts = { ...drafts };
  delete nextDrafts[normalizedTabId];
  writePersistedEditorDocumentDrafts(nextDrafts);
}

export function readPersistedEditorViewportDraft(tabId: string): CanvasViewport | null {
  const normalizedTabId = normalizeNullableString(tabId);
  if (!normalizedTabId) {
    return null;
  }
  return readPersistedEditorViewportDrafts()[normalizedTabId] ?? null;
}

export function writePersistedEditorViewportDraft(tabId: string, viewport: CanvasViewport): void {
  const normalizedTabId = normalizeNullableString(tabId);
  const normalizedViewport = normalizeCanvasViewportDraft(viewport);
  if (!normalizedTabId || !normalizedViewport) {
    return;
  }

  writePersistedEditorViewportDrafts({
    ...readPersistedEditorViewportDrafts(),
    [normalizedTabId]: normalizedViewport,
  });
}

export function removePersistedEditorViewportDraft(tabId: string): void {
  const normalizedTabId = normalizeNullableString(tabId);
  if (!normalizedTabId) {
    return;
  }

  const drafts = readPersistedEditorViewportDrafts();
  if (!(normalizedTabId in drafts)) {
    return;
  }

  const nextDrafts = { ...drafts };
  delete nextDrafts[normalizedTabId];
  writePersistedEditorViewportDrafts(nextDrafts);
}

export function prunePersistedEditorDocumentDrafts(tabIds: string[]): void {
  const keepTabIds = new Set(tabIds.map(normalizeNullableString).filter((tabId): tabId is string => Boolean(tabId)));
  const drafts = readPersistedEditorDocumentDrafts();
  const nextDrafts: Record<string, GraphPayload | GraphDocument> = {};
  for (const [tabId, draft] of Object.entries(drafts)) {
    if (keepTabIds.has(tabId)) {
      nextDrafts[tabId] = draft;
    }
  }
  writePersistedEditorDocumentDrafts(nextDrafts);
}

export function prunePersistedEditorViewportDrafts(tabIds: string[]): void {
  const keepTabIds = new Set(tabIds.map(normalizeNullableString).filter((tabId): tabId is string => Boolean(tabId)));
  const drafts = readPersistedEditorViewportDrafts();
  const nextDrafts: Record<string, CanvasViewport> = {};
  for (const [tabId, draft] of Object.entries(drafts)) {
    if (keepTabIds.has(tabId)) {
      nextDrafts[tabId] = draft;
    }
  }
  writePersistedEditorViewportDrafts(nextDrafts);
}

export function resolveEditorUrl(graphId: string | null): string {
  return graphId ? `/editor/${graphId}` : "/editor";
}

export function resolveWorkspaceTabUrl(
  tab: Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId">,
): string {
  if (tab.graphId) {
    return resolveEditorUrl(tab.graphId);
  }

  const templateId = normalizeNullableString(tab.templateId) ?? normalizeNullableString(tab.defaultTemplateId);
  if (tab.kind === "template" && templateId) {
    return `/editor/new?template=${encodeURIComponent(templateId)}`;
  }

  return "/editor/new";
}

export function isSameSavedGraph(tab: EditorWorkspaceTab, graphId: string): boolean {
  return tab.graphId === graphId;
}

export function ensureSavedGraphTab(
  workspace: PersistedEditorWorkspace,
  params: {
    graphId: string;
    title: string;
  },
): PersistedEditorWorkspace {
  const existingTab = workspace.tabs.find((tab) => isSameSavedGraph(tab, params.graphId));
  if (existingTab) {
    return {
      activeTabId: existingTab.tabId,
      tabs: workspace.tabs.map((tab) =>
        tab.tabId === existingTab.tabId
          ? {
              ...tab,
              kind: "existing",
              graphId: params.graphId,
              title: params.title.trim() || tab.title,
            }
          : tab,
      ),
    };
  }

  const newTab: EditorWorkspaceTab = {
    tabId: createNewTabId(),
    kind: "existing",
    graphId: params.graphId,
    title: params.title.trim() || params.graphId,
    dirty: false,
    templateId: null,
    defaultTemplateId: null,
  };

  return {
    activeTabId: newTab.tabId,
    tabs: [...workspace.tabs, newTab],
  };
}

export function applyDocumentMetaToWorkspaceTab(
  workspace: PersistedEditorWorkspace,
  tabId: string,
  meta: {
    title: string;
    dirty: boolean;
    graphId: string | null;
  },
): PersistedEditorWorkspace {
  let changed = false;

  const tabs = workspace.tabs.map((tab) => {
    if (tab.tabId !== tabId) {
      return tab;
    }

    const nextTitle = meta.title.trim() || tab.title;
    const nextGraphId = meta.graphId ?? tab.graphId;
    const nextKind = nextGraphId ? "existing" : tab.kind;

    if (tab.title === nextTitle && tab.dirty === meta.dirty && tab.graphId === nextGraphId && tab.kind === nextKind) {
      return tab;
    }

    changed = true;
    return {
      ...tab,
      title: nextTitle,
      dirty: meta.dirty,
      graphId: nextGraphId,
      kind: nextKind,
    };
  });

  return changed
    ? {
        ...workspace,
        tabs,
      }
    : workspace;
}

export function closeWorkspaceTab(workspace: PersistedEditorWorkspace, tabId: string): PersistedEditorWorkspace {
  const closedIndex = workspace.tabs.findIndex((tab) => tab.tabId === tabId);
  if (closedIndex === -1) {
    return workspace;
  }

  const tabs = workspace.tabs.filter((tab) => tab.tabId !== tabId);
  if (tabs.length === 0) {
    return EMPTY_EDITOR_WORKSPACE;
  }

  const nextActiveTabId =
    workspace.activeTabId !== tabId ? workspace.activeTabId : tabs[Math.min(closedIndex, tabs.length - 1)]?.tabId ?? null;

  return {
    activeTabId: nextActiveTabId,
    tabs,
  };
}

export function reorderWorkspaceTab(
  workspace: PersistedEditorWorkspace,
  sourceTabId: string,
  targetTabId: string,
  placement: "before" | "after",
): PersistedEditorWorkspace {
  if (sourceTabId === targetTabId) {
    return workspace;
  }

  const sourceIndex = workspace.tabs.findIndex((tab) => tab.tabId === sourceTabId);
  const targetIndex = workspace.tabs.findIndex((tab) => tab.tabId === targetTabId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return workspace;
  }

  const tabs = [...workspace.tabs];
  const [sourceTab] = tabs.splice(sourceIndex, 1);
  if (!sourceTab) {
    return workspace;
  }

  const nextTargetIndex = tabs.findIndex((tab) => tab.tabId === targetTabId);
  const insertionIndex = placement === "before" ? nextTargetIndex : nextTargetIndex + 1;
  tabs.splice(insertionIndex, 0, sourceTab);

  return {
    ...workspace,
    tabs,
  };
}

export function closeWorkspaceTabTransition(
  workspace: PersistedEditorWorkspace,
  tabId: string,
): {
  workspace: PersistedEditorWorkspace;
  nextGraphId: string | null;
  closedActiveTab: boolean;
} {
  const closedActiveTab = workspace.activeTabId === tabId;
  const nextWorkspace = closeWorkspaceTab(workspace, tabId);
  const nextGraphId = closedActiveTab
    ? nextWorkspace.tabs.find((tab) => tab.tabId === nextWorkspace.activeTabId)?.graphId ?? null
    : null;

  return {
    workspace: nextWorkspace,
    nextGraphId,
    closedActiveTab,
  };
}
