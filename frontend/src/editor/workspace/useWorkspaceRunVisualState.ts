import type { Ref } from "vue";

import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import { setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";
import { formatRunFeedback, type RunFeedback, type WorkspaceFeedbackTone } from "./runFeedbackModel.ts";
import { buildRunNodeArtifactsModel, mergeRunOutputPreviewByNodeId, type RunOutputPreviewEntry } from "./runNodeArtifactsModel.ts";

export type WorkspaceRunFeedback = RunFeedback & {
  activeRunId?: string | null;
  activeRunStatus?: string | null;
};

type WorkspaceRunVisualStateInput = {
  latestRunDetailByTabId: Ref<Record<string, RunDetail | null>>;
  runNodeStatusByTabId: Ref<Record<string, Record<string, string>>>;
  currentRunNodeIdByTabId: Ref<Record<string, string | null>>;
  runOutputPreviewByTabId: Ref<Record<string, Record<string, RunOutputPreviewEntry>>>;
  runFailureMessageByTabId: Ref<Record<string, Record<string, string>>>;
  activeRunEdgeIdsByTabId: Ref<Record<string, string[]>>;
  feedbackByTabId: Ref<Record<string, WorkspaceRunFeedback | null>>;
};

type WorkspaceMessageFeedbackInput = {
  tone: WorkspaceFeedbackTone;
  message: string;
  activeRunId?: string | null;
  activeRunStatus?: string | null;
};

type WorkspaceRunVisualOptions = {
  preserveMissing?: boolean;
};

export function useWorkspaceRunVisualState(input: WorkspaceRunVisualStateInput) {
  function feedbackForTab(tabId: string) {
    return input.feedbackByTabId.value[tabId] ?? null;
  }

  function setFeedbackForTab(tabId: string, feedback: WorkspaceRunFeedback) {
    input.feedbackByTabId.value = setTabScopedRecordEntry(input.feedbackByTabId.value, tabId, feedback);
  }

  function setMessageFeedbackForTab(tabId: string, messageInput: WorkspaceMessageFeedbackInput) {
    setFeedbackForTab(tabId, {
      tone: messageInput.tone,
      message: messageInput.message,
      activeRunId: messageInput.activeRunId ?? null,
      activeRunStatus: messageInput.activeRunStatus ?? null,
      summary: {
        idle: 0,
        running: 0,
        paused: 0,
        success: 0,
        failed: 0,
      },
      currentNodeLabel: null,
    });
  }

  function applyRunOutputPreviewForTab(
    tabId: string,
    nextPreviewByNodeId: Record<string, RunOutputPreviewEntry>,
    options: WorkspaceRunVisualOptions = {},
  ) {
    input.runOutputPreviewByTabId.value = setTabScopedRecordEntry(
      input.runOutputPreviewByTabId.value,
      tabId,
      mergeRunOutputPreviewByNodeId(input.runOutputPreviewByTabId.value[tabId] ?? {}, nextPreviewByNodeId, options),
    );
  }

  function applyRunVisualStateToTab(
    tabId: string,
    run: RunDetail,
    document: GraphPayload | GraphDocument | null | undefined,
    visualRun: RunDetail = run,
    options: WorkspaceRunVisualOptions = {},
  ) {
    const nodeIds = document ? Object.keys(document.nodes) : [];
    const nodeLabelLookup = document
      ? Object.fromEntries(Object.entries(document.nodes).map(([nodeId, node]) => [nodeId, node.name.trim() || nodeId]))
      : {};
    const feedback = formatRunFeedback(visualRun, {
      nodeIds,
      nodeLabelLookup,
    });
    const runArtifactsModel = buildRunNodeArtifactsModel(visualRun);

    input.latestRunDetailByTabId.value = setTabScopedRecordEntry(input.latestRunDetailByTabId.value, tabId, visualRun);
    input.runNodeStatusByTabId.value = setTabScopedRecordEntry(input.runNodeStatusByTabId.value, tabId, visualRun.node_status_map ?? {});
    input.currentRunNodeIdByTabId.value = setTabScopedRecordEntry(input.currentRunNodeIdByTabId.value, tabId, visualRun.current_node_id ?? null);
    applyRunOutputPreviewForTab(tabId, runArtifactsModel.outputPreviewByNodeId, options);
    input.runFailureMessageByTabId.value = setTabScopedRecordEntry(
      input.runFailureMessageByTabId.value,
      tabId,
      runArtifactsModel.failedMessageByNodeId,
    );
    input.activeRunEdgeIdsByTabId.value = setTabScopedRecordEntry(input.activeRunEdgeIdsByTabId.value, tabId, runArtifactsModel.activeEdgeIds);
    setFeedbackForTab(tabId, {
      ...feedback,
      activeRunId: run.run_id,
      activeRunStatus: visualRun.status,
    });
  }

  return {
    feedbackForTab,
    setFeedbackForTab,
    setMessageFeedbackForTab,
    applyRunOutputPreviewForTab,
    applyRunVisualStateToTab,
  };
}
