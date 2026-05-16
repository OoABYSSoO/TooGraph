import type { ComputedRef, Ref } from "vue";

import type { EditorWorkspaceTab } from "../../lib/editor-workspace.ts";
import type { GraphDocument, GraphPayload, GraphRunResponse } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

import { setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";
import type { RunActivityState } from "./runActivityModel.ts";
import type { RunNodeTimingByNodeId } from "./runNodeTimingModel.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

type VirtualOperationRunAttribution = {
  operationRequestId: string;
  targetId: string;
  commands: string[];
};

type VirtualOperationTriggeredRunRecord = {
  operationRequestId: string;
  targetId: string;
  tabId: string;
  runId: string;
  graphId: string | null;
  initialStatus: string;
};

type WorkspaceRunControllerInput = {
  activeTab: ComputedRef<EditorWorkspaceTab | null> | Ref<EditorWorkspaceTab | null>;
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  latestRunDetailByTabId: Ref<Record<string, RunDetail | null>>;
  restoredRunSnapshotIdByTabId: Ref<Record<string, string | null>>;
  humanReviewBusyByTabId: Ref<Record<string, boolean>>;
  humanReviewErrorByTabId: Ref<Record<string, string | null>>;
  runNodeStatusByTabId: Ref<Record<string, Record<string, string>>>;
  runNodeTimingByTabId: Ref<Record<string, RunNodeTimingByNodeId>>;
  currentRunNodeIdByTabId: Ref<Record<string, string | null>>;
  runOutputPreviewByTabId: Ref<Record<string, Record<string, { text: string; displayMode: string | null }>>>;
  runFailureMessageByTabId: Ref<Record<string, Record<string, string>>>;
  activeRunEdgeIdsByTabId: Ref<Record<string, string[]>>;
  runActivityByTabId: Ref<Record<string, RunActivityState>>;
  refreshAgentModels: () => Promise<void>;
  runGraph: (document: GraphPayload | GraphDocument) => Promise<GraphRunResponse>;
  consumeVirtualOperationRunAttribution?: (targetId: string) => VirtualOperationRunAttribution | null;
  recordVirtualOperationTriggeredRun?: (record: VirtualOperationTriggeredRunRecord) => void;
  resumeRun: (runId: string, payload: Record<string, unknown>, snapshotId: string | null) => Promise<GraphRunResponse>;
  cancelRunPolling: (tabId: string) => void;
  getRunGeneration: (tabId: string) => number;
  startRunEventStreamForTab: (tabId: string, runId: string) => void;
  pollRunForTab: (tabId: string, runId: string, generation: number) => void;
  markRunActivityPanelHintForTab: (tabId: string) => void;
  setFeedbackForTab: (tabId: string, feedback: WorkspaceRunFeedback) => void;
  setMessageFeedbackForTab: (
    tabId: string,
    feedback: { tone: WorkspaceRunFeedback["tone"]; message: string; activeRunId?: string | null; activeRunStatus?: string | null },
  ) => void;
  showRunErrorToast: (message: string) => void;
  translate: (key: string, params?: Record<string, unknown>) => string;
};

export function useWorkspaceRunController(input: WorkspaceRunControllerInput) {
  function clearQueuedRunVisualState(tabId: string) {
    input.runNodeStatusByTabId.value = setTabScopedRecordEntry(input.runNodeStatusByTabId.value, tabId, {});
    input.runNodeTimingByTabId.value = setTabScopedRecordEntry(input.runNodeTimingByTabId.value, tabId, {});
    input.currentRunNodeIdByTabId.value = setTabScopedRecordEntry(input.currentRunNodeIdByTabId.value, tabId, null);
    input.runOutputPreviewByTabId.value = setTabScopedRecordEntry(input.runOutputPreviewByTabId.value, tabId, {});
    input.runFailureMessageByTabId.value = setTabScopedRecordEntry(input.runFailureMessageByTabId.value, tabId, {});
    input.activeRunEdgeIdsByTabId.value = setTabScopedRecordEntry(input.activeRunEdgeIdsByTabId.value, tabId, []);
    input.runActivityByTabId.value = setTabScopedRecordEntry(input.runActivityByTabId.value, tabId, { entries: [], autoFollow: true });
    input.latestRunDetailByTabId.value = setTabScopedRecordEntry(input.latestRunDetailByTabId.value, tabId, null);
    input.humanReviewErrorByTabId.value = setTabScopedRecordEntry(input.humanReviewErrorByTabId.value, tabId, null);
  }

  function startQueuedRunPolling(tabId: string, runId: string) {
    input.cancelRunPolling(tabId);
    const generation = input.getRunGeneration(tabId);
    input.startRunEventStreamForTab(tabId, runId);
    input.pollRunForTab(tabId, runId, generation);
  }

  async function runActiveGraph() {
    const tab = input.activeTab.value;
    if (!tab) {
      return;
    }
    const document = input.documentsByTabId.value[tab.tabId];
    if (!document) {
      return;
    }

    try {
      await input.refreshAgentModels();
      const latestDocument = input.documentsByTabId.value[tab.tabId];
      if (!latestDocument) {
        return;
      }

      const runAttribution = input.consumeVirtualOperationRunAttribution?.("editor.action.runActiveGraph") ?? null;
      const response = await input.runGraph(latestDocument);
      if (runAttribution) {
        input.recordVirtualOperationTriggeredRun?.({
          operationRequestId: runAttribution.operationRequestId,
          targetId: runAttribution.targetId,
          tabId: tab.tabId,
          runId: response.run_id,
          graphId: resolveGraphId(latestDocument, tab),
          initialStatus: response.status,
        });
      }
      clearQueuedRunVisualState(tab.tabId);
      input.markRunActivityPanelHintForTab(tab.tabId);
      input.setFeedbackForTab(tab.tabId, {
        tone: "warning",
        message: input.translate("feedback.runQueued", {
          runId: response.run_id,
          pending: Object.keys(latestDocument.nodes).length,
          cycle: "",
        }),
        activeRunId: response.run_id,
        activeRunStatus: response.status,
        summary: {
          idle: Object.keys(latestDocument.nodes).length,
          running: 0,
          paused: 0,
          success: 0,
          failed: 0,
        },
        currentNodeLabel: null,
      });
      startQueuedRunPolling(tab.tabId, response.run_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : input.translate("feedback.runFailed", { runId: "" });
      input.setMessageFeedbackForTab(tab.tabId, {
        tone: "danger",
        message,
      });
      input.showRunErrorToast(message);
    }
  }

  async function resumeHumanReviewRun(tabId: string, payload: Record<string, unknown>) {
    const run = input.latestRunDetailByTabId.value[tabId];
    if (!run) {
      return;
    }

    input.humanReviewBusyByTabId.value = setTabScopedRecordEntry(input.humanReviewBusyByTabId.value, tabId, true);
    input.humanReviewErrorByTabId.value = setTabScopedRecordEntry(input.humanReviewErrorByTabId.value, tabId, null);

    try {
      const response = await input.resumeRun(run.run_id, payload, input.restoredRunSnapshotIdByTabId.value[tabId] ?? null);
      input.latestRunDetailByTabId.value = setTabScopedRecordEntry(input.latestRunDetailByTabId.value, tabId, {
        ...run,
        run_id: response.run_id,
        status: response.status,
      });
      input.restoredRunSnapshotIdByTabId.value = setTabScopedRecordEntry(input.restoredRunSnapshotIdByTabId.value, tabId, null);
      input.markRunActivityPanelHintForTab(tabId);
      input.setMessageFeedbackForTab(tabId, {
        tone: "warning",
        message: input.translate("feedback.runResuming", { runId: response.run_id }),
        activeRunId: response.run_id,
        activeRunStatus: response.status,
      });
      startQueuedRunPolling(tabId, response.run_id);
    } catch (error) {
      input.humanReviewErrorByTabId.value = setTabScopedRecordEntry(
        input.humanReviewErrorByTabId.value,
        tabId,
        error instanceof Error ? error.message : input.translate("humanReview.resumeFailed"),
      );
    } finally {
      input.humanReviewBusyByTabId.value = setTabScopedRecordEntry(input.humanReviewBusyByTabId.value, tabId, false);
    }
  }

  return {
    runActiveGraph,
    resumeHumanReviewRun,
  };
}

function resolveGraphId(document: GraphPayload | GraphDocument, tab: EditorWorkspaceTab) {
  if ("graph_id" in document && typeof document.graph_id === "string" && document.graph_id.trim()) {
    return document.graph_id;
  }
  return tab.graphId;
}
