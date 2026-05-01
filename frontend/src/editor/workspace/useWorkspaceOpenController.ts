import type { ComputedRef, Ref } from "vue";

import type { GraphDocument, GraphPayload, TemplateRecord } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";
import {
  buildRestoredGraphFromRun,
  buildSnapshotScopedRun,
  canRestoreRunDetail,
  resolveRestoredRunTabTitle,
} from "../../lib/run-restore.ts";
import {
  applyDocumentMetaToWorkspaceTab,
  createUnsavedWorkspaceTab,
  ensureSavedGraphTab,
  isReusableBlankWorkspaceTab,
  readPersistedEditorDocumentDraft,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "../../lib/editor-workspace.ts";
import {
  cloneGraphDocument,
  createDraftFromTemplate,
  createEmptyDraftGraph,
} from "../../lib/graph-document.ts";

import {
  listTabsMissingDocumentDrafts,
  resolveExistingGraphDocumentHydrationSource,
  resolveUnsavedGraphDocumentHydrationSource,
  shouldHydrateExistingGraphDocument,
} from "./editorDraftPersistenceModel.ts";
import { setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";

type RouteNavigation = "push" | "replace" | "none";
type GraphDraft = GraphPayload | GraphDocument;
type WorkspaceRouteTab = Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId" | "subgraphSource">;

type WorkspaceOpenControllerInput = {
  workspace: Ref<PersistedEditorWorkspace>;
  documentsByTabId: Ref<Record<string, GraphDraft>>;
  loadingByTabId: Ref<Record<string, boolean>>;
  errorByTabId: Ref<Record<string, string | null>>;
  restoredRunSnapshotIdByTabId: Ref<Record<string, string | null>>;
  routeRestoreError: Ref<string | null>;
  handledRouteSignature: Ref<string | null>;
  routeSignature: ComputedRef<string> | Ref<string>;
  templates: () => TemplateRecord[];
  graphById: ComputedRef<Map<string, GraphDocument>> | Ref<Map<string, GraphDocument>>;
  updateWorkspace: (workspace: PersistedEditorWorkspace) => void;
  registerDocumentForTab: (tabId: string, graph: GraphDraft) => void;
  readDocumentDraft?: (tabId: string) => GraphDraft | null;
  fetchGraph: (graphId: string) => Promise<GraphDocument>;
  fetchRun: (runId: string) => Promise<RunDetail>;
  applyRunVisualStateToTab: (tabId: string, run: RunDetail, document: GraphDraft | undefined, visualRun?: RunDetail) => void;
  openHumanReviewPanelForTab: (tabId: string, nodeId: string | null) => void;
  syncRouteToTab: (tab: WorkspaceRouteTab, mode?: "push" | "replace") => void;
};

export function useWorkspaceOpenController(input: WorkspaceOpenControllerInput) {
  function readDocumentDraft(tabId: string) {
    return (input.readDocumentDraft ?? readPersistedEditorDocumentDraft)(tabId);
  }

  function createDraftForTab(tab: EditorWorkspaceTab): GraphPayload {
    if (tab.templateId) {
      const template = input.templates().find((candidate) => candidate.template_id === tab.templateId);
      if (template) {
        const draft = createDraftFromTemplate(template);
        if (tab.dirty) {
          draft.name = tab.title;
        }
        return draft;
      }
    }
    return createEmptyDraftGraph(tab.title);
  }

  function findReusableBlankTab() {
    return (
      input.workspace.value.tabs.find((tab) =>
        isReusableBlankWorkspaceTab(tab, input.documentsByTabId.value[tab.tabId] ?? null),
      ) ?? null
    );
  }

  function activateReusableBlankTab(tab: EditorWorkspaceTab, navigation: RouteNavigation) {
    if (!input.documentsByTabId.value[tab.tabId]) {
      input.registerDocumentForTab(tab.tabId, createDraftForTab(tab));
    }

    input.updateWorkspace({
      ...input.workspace.value,
      activeTabId: tab.tabId,
    });

    if (navigation !== "none") {
      input.syncRouteToTab(tab, navigation === "replace" ? "replace" : "push");
    }
    input.handledRouteSignature.value = "new:";
  }

  function ensureUnsavedTabDocuments() {
    for (const tab of listTabsMissingDocumentDrafts(input.workspace.value.tabs, input.documentsByTabId.value)) {
      const persistedDraft = readDocumentDraft(tab.tabId);
      const hydrationSource = resolveUnsavedGraphDocumentHydrationSource(persistedDraft);
      input.registerDocumentForTab(tab.tabId, hydrationSource.type === "persisted" ? hydrationSource.document : createDraftForTab(tab));
    }
  }

  function openNewTab(templateId: string | null, navigation: RouteNavigation = "push") {
    if (!templateId) {
      const reusableBlankTab = findReusableBlankTab();
      if (reusableBlankTab) {
        activateReusableBlankTab(reusableBlankTab, navigation);
        return;
      }
    }

    const template = templateId ? input.templates().find((candidate) => candidate.template_id === templateId) ?? null : null;
    const draft = template ? createDraftFromTemplate(template) : createEmptyDraftGraph();
    const tab = createUnsavedWorkspaceTab({
      kind: template ? "template" : "new",
      title: template?.label ?? draft.name,
      templateId: template?.template_id ?? null,
      defaultTemplateId: template?.template_id ?? null,
    });

    input.registerDocumentForTab(tab.tabId, draft);
    input.updateWorkspace({
      activeTabId: tab.tabId,
      tabs: [...input.workspace.value.tabs, tab],
    });

    if (navigation !== "none") {
      input.syncRouteToTab(tab, navigation === "replace" ? "replace" : "push");
    }
    input.handledRouteSignature.value = templateId ? `new:${templateId}` : "new:";
  }

  async function openRestoredRunTab(runId: string, snapshotId: string | null, navigation: RouteNavigation = "push") {
    input.routeRestoreError.value = null;

    try {
      const run = await input.fetchRun(runId);
      if (!canRestoreRunDetail(run)) {
        throw new Error(`Run ${runId} cannot be restored into the editor.`);
      }
      const visualRun = buildSnapshotScopedRun(run, snapshotId);
      const restoredGraph = buildRestoredGraphFromRun(run, snapshotId);
      const tab = {
        ...createUnsavedWorkspaceTab({
          kind: "new",
          title: resolveRestoredRunTabTitle(run),
        }),
        dirty: true,
      };

      input.registerDocumentForTab(tab.tabId, restoredGraph);
      input.updateWorkspace({
        activeTabId: tab.tabId,
        tabs: [...input.workspace.value.tabs, tab],
      });
      input.restoredRunSnapshotIdByTabId.value = setTabScopedRecordEntry(input.restoredRunSnapshotIdByTabId.value, tab.tabId, snapshotId);
      input.applyRunVisualStateToTab(tab.tabId, run, restoredGraph, visualRun);
      input.handledRouteSignature.value = input.routeSignature.value;

      if (visualRun.status === "awaiting_human" && visualRun.current_node_id) {
        input.openHumanReviewPanelForTab(tab.tabId, visualRun.current_node_id);
      }

      if (navigation !== "none") {
        input.syncRouteToTab(tab, navigation === "replace" ? "replace" : "push");
      }
    } catch (error) {
      input.routeRestoreError.value = error instanceof Error ? error.message : `Failed to restore run ${runId}.`;
      input.handledRouteSignature.value = input.routeSignature.value;
    }
  }

  async function loadExistingGraphIntoTab(tabId: string, graphId: string) {
    if (
      !shouldHydrateExistingGraphDocument({
        hasDocument: Boolean(input.documentsByTabId.value[tabId]),
        isLoading: Boolean(input.loadingByTabId.value[tabId]),
      })
    ) {
      return;
    }

    input.loadingByTabId.value = setTabScopedRecordEntry(input.loadingByTabId.value, tabId, true);
    input.errorByTabId.value = setTabScopedRecordEntry(input.errorByTabId.value, tabId, null);

    try {
      const persistedDraft = readDocumentDraft(tabId);
      const tab = input.workspace.value.tabs.find((candidate) => candidate.tabId === tabId) ?? null;
      const hydrationSource = resolveExistingGraphDocumentHydrationSource({
        persistedDraft,
        cachedGraph: null,
        tabDirty: Boolean(tab?.dirty),
      });
      if (hydrationSource.type === "persisted") {
        input.registerDocumentForTab(tabId, hydrationSource.document);
        return;
      }
      const graph = await input.fetchGraph(graphId);
      input.registerDocumentForTab(tabId, graph);
    } catch (error) {
      input.loadingByTabId.value = setTabScopedRecordEntry(input.loadingByTabId.value, tabId, false);
      input.errorByTabId.value = setTabScopedRecordEntry(
        input.errorByTabId.value,
        tabId,
        error instanceof Error ? error.message : "Failed to load graph.",
      );
    }
  }

  function openExistingGraph(graphId: string, navigation: RouteNavigation = "push") {
    const graph = input.graphById.value.get(graphId) ?? null;
    const nextWorkspace = ensureSavedGraphTab(input.workspace.value, {
      graphId,
      title: graph?.name ?? graphId,
    });
    input.updateWorkspace(nextWorkspace);

    const nextTabId = nextWorkspace.activeTabId;
    const nextTab = nextWorkspace.tabs.find((tab) => tab.tabId === nextTabId) ?? null;
    if (
      nextTabId &&
      shouldHydrateExistingGraphDocument({
        hasDocument: Boolean(input.documentsByTabId.value[nextTabId]),
        isLoading: Boolean(input.loadingByTabId.value[nextTabId]),
      })
    ) {
      const persistedDraft = readDocumentDraft(nextTabId);
      const hydrationSource = resolveExistingGraphDocumentHydrationSource({
        persistedDraft,
        cachedGraph: graph,
        tabDirty: Boolean(nextTab?.dirty),
      });
      if (hydrationSource.type === "persisted") {
        input.registerDocumentForTab(nextTabId, hydrationSource.document);
      } else if (hydrationSource.type === "cached-graph") {
        input.registerDocumentForTab(nextTabId, cloneGraphDocument(hydrationSource.graph));
        if (hydrationSource.clearDirty) {
          input.updateWorkspace(
            applyDocumentMetaToWorkspaceTab(input.workspace.value, nextTabId, {
              title: hydrationSource.graph.name,
              dirty: false,
              graphId: hydrationSource.graph.graph_id,
            }),
          );
        }
      } else if (hydrationSource.type === "fetch") {
        void loadExistingGraphIntoTab(nextTabId, graphId);
      }
    }

    if (navigation !== "none") {
      input.syncRouteToTab(
        {
          graphId,
          kind: "existing",
          templateId: null,
          defaultTemplateId: null,
          subgraphSource: null,
        },
        navigation === "replace" ? "replace" : "push",
      );
    }
    input.handledRouteSignature.value = `existing:${graphId}`;
  }

  return {
    ensureUnsavedTabDocuments,
    loadExistingGraphIntoTab,
    openExistingGraph,
    openNewTab,
    openRestoredRunTab,
  };
}
