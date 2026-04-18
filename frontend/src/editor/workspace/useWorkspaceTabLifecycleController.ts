import type { Ref } from "vue";

import type { CanvasViewport } from "../canvas/canvasViewport.ts";
import {
  closeWorkspaceTabTransition,
  reorderWorkspaceTab,
  resolveEditorUrl,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "../../lib/editor-workspace.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

import { omitTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";
import type { RunActivityState } from "./runActivityModel.ts";
import type { RunNodeTimingByNodeId } from "./runNodeTimingModel.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";
import type { WorkspaceSidePanelMode } from "./workspaceSidePanelModel.ts";

export type WorkspaceTabFocusRequest = {
  nodeId: string;
  sequence: number;
};

type TabScopedRecordRef<T> = Ref<Record<string, T>>;
type WorkspaceRouteTab = Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId" | "subgraphSource">;

type WorkspaceTabLifecycleControllerInput = {
  workspace: Ref<PersistedEditorWorkspace>;
  pendingCloseTabId: Ref<string | null>;
  closeBusy: Ref<boolean>;
  closeError: Ref<string | null>;
  documentsByTabId: TabScopedRecordRef<GraphPayload | GraphDocument>;
  loadingByTabId: TabScopedRecordRef<boolean>;
  errorByTabId: TabScopedRecordRef<string | null>;
  feedbackByTabId: TabScopedRecordRef<WorkspaceRunFeedback | null>;
  statePanelOpenByTabId: TabScopedRecordRef<boolean>;
  sidePanelModeByTabId: TabScopedRecordRef<WorkspaceSidePanelMode>;
  focusedNodeIdByTabId: TabScopedRecordRef<string | null>;
  focusRequestByTabId: TabScopedRecordRef<WorkspaceTabFocusRequest | null>;
  viewportByTabId: TabScopedRecordRef<CanvasViewport>;
  runNodeStatusByTabId: TabScopedRecordRef<Record<string, string>>;
  runNodeTimingByTabId: TabScopedRecordRef<RunNodeTimingByNodeId>;
  currentRunNodeIdByTabId: TabScopedRecordRef<string | null>;
  latestRunDetailByTabId: TabScopedRecordRef<RunDetail | null>;
  restoredRunSnapshotIdByTabId: TabScopedRecordRef<string | null>;
  humanReviewBusyByTabId: TabScopedRecordRef<boolean>;
  humanReviewErrorByTabId: TabScopedRecordRef<string | null>;
  runOutputPreviewByTabId: TabScopedRecordRef<Record<string, { text: string; displayMode: string | null }>>;
  runFailureMessageByTabId: TabScopedRecordRef<Record<string, string>>;
  activeRunEdgeIdsByTabId: TabScopedRecordRef<string[]>;
  subgraphRunStatusByTabId: TabScopedRecordRef<Record<string, Record<string, string>>>;
  runActivityByTabId: TabScopedRecordRef<RunActivityState>;
  cancelRunPolling: (tabId: string) => void;
  cancelRunEventStreamForTab: (tabId: string) => void;
  updateWorkspace: (workspace: PersistedEditorWorkspace) => void;
  writeWorkspace: (workspace: PersistedEditorWorkspace) => void;
  removeDocumentDraft: (tabId: string) => void;
  removeViewportDraft: (tabId: string) => void;
  syncRouteToTab: (tab: WorkspaceRouteTab, mode?: "push" | "replace") => void;
  syncRouteToUrl: (targetUrl: string, mode?: "push" | "replace") => void;
  saveTab: (tabId: string) => Promise<boolean>;
  closeSaveFailedMessage: () => string;
};

export function useWorkspaceTabLifecycleController(input: WorkspaceTabLifecycleControllerInput) {
  function clearRecord<T>(recordRef: TabScopedRecordRef<T>, tabId: string) {
    recordRef.value = omitTabScopedRecordEntry(recordRef.value, tabId);
  }

  function clearTabRuntime(tabId: string) {
    input.cancelRunPolling(tabId);
    input.cancelRunEventStreamForTab(tabId);
    clearRecord(input.documentsByTabId, tabId);
    clearRecord(input.loadingByTabId, tabId);
    clearRecord(input.errorByTabId, tabId);
    clearRecord(input.feedbackByTabId, tabId);
    clearRecord(input.statePanelOpenByTabId, tabId);
    clearRecord(input.sidePanelModeByTabId, tabId);
    clearRecord(input.focusedNodeIdByTabId, tabId);
    clearRecord(input.focusRequestByTabId, tabId);
    clearRecord(input.viewportByTabId, tabId);
    clearRecord(input.runNodeStatusByTabId, tabId);
    clearRecord(input.runNodeTimingByTabId, tabId);
    clearRecord(input.currentRunNodeIdByTabId, tabId);
    clearRecord(input.latestRunDetailByTabId, tabId);
    clearRecord(input.restoredRunSnapshotIdByTabId, tabId);
    clearRecord(input.humanReviewBusyByTabId, tabId);
    clearRecord(input.humanReviewErrorByTabId, tabId);
    clearRecord(input.runOutputPreviewByTabId, tabId);
    clearRecord(input.runFailureMessageByTabId, tabId);
    clearRecord(input.activeRunEdgeIdsByTabId, tabId);
    clearRecord(input.subgraphRunStatusByTabId, tabId);
    clearRecord(input.runActivityByTabId, tabId);
  }

  function activateTab(tabId: string) {
    const tab = input.workspace.value.tabs.find((entry) => entry.tabId === tabId);
    if (!tab) {
      return;
    }
    input.updateWorkspace({
      ...input.workspace.value,
      activeTabId: tabId,
    });
    input.syncRouteToTab(tab);
  }

  function reorderTab(sourceTabId: string, targetTabId: string, placement: "before" | "after") {
    input.updateWorkspace(reorderWorkspaceTab(input.workspace.value, sourceTabId, targetTabId, placement));
  }

  function finalizeTabClose(tabId: string) {
    const transition = closeWorkspaceTabTransition(input.workspace.value, tabId);
    input.updateWorkspace(transition.workspace);
    input.writeWorkspace(transition.workspace);
    input.removeDocumentDraft(tabId);
    input.removeViewportDraft(tabId);
    clearTabRuntime(tabId);

    if (transition.closedActiveTab) {
      input.syncRouteToUrl(resolveEditorUrl(transition.nextGraphId));
    }
  }

  function requestCloseTab(tabId: string) {
    const tab = input.workspace.value.tabs.find((entry) => entry.tabId === tabId);
    if (!tab) {
      return;
    }

    if (!tab.dirty) {
      finalizeTabClose(tabId);
      return;
    }

    input.pendingCloseTabId.value = tabId;
    input.closeError.value = null;
  }

  function cancelPendingClose() {
    if (input.closeBusy.value) {
      return;
    }
    input.pendingCloseTabId.value = null;
    input.closeError.value = null;
  }

  function discardPendingClose() {
    if (!input.pendingCloseTabId.value || input.closeBusy.value) {
      return;
    }
    finalizeTabClose(input.pendingCloseTabId.value);
    input.pendingCloseTabId.value = null;
    input.closeError.value = null;
  }

  async function saveAndClosePendingTab() {
    if (!input.pendingCloseTabId.value || input.closeBusy.value) {
      return;
    }

    input.closeBusy.value = true;
    input.closeError.value = null;

    try {
      const success = await input.saveTab(input.pendingCloseTabId.value);
      if (!success) {
        input.closeError.value = input.closeSaveFailedMessage();
        return;
      }
      finalizeTabClose(input.pendingCloseTabId.value);
      input.pendingCloseTabId.value = null;
      input.closeError.value = null;
    } catch (error) {
      input.closeError.value = error instanceof Error ? error.message : input.closeSaveFailedMessage();
    } finally {
      input.closeBusy.value = false;
    }
  }

  return {
    activateTab,
    reorderTab,
    clearTabRuntime,
    finalizeTabClose,
    requestCloseTab,
    cancelPendingClose,
    discardPendingClose,
    saveAndClosePendingTab,
  };
}
