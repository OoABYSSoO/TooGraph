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
  subgraphRunStatusByTabId: Ref<Record<string, Record<string, Record<string, string>>>>;
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
    input.subgraphRunStatusByTabId.value = setTabScopedRecordEntry(
      input.subgraphRunStatusByTabId.value,
      tabId,
      buildSubgraphRunStatusByNodeId(visualRun),
    );
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

  function applyRunEventVisualStateToTab(tabId: string, eventType: string, payload: Record<string, unknown>) {
    const subgraphNodeId = normalizeRunEventText(payload.subgraph_node_id);
    const innerNodeId = normalizeRunEventText(payload.node_id);
    if (!subgraphNodeId || !innerNodeId) {
      return;
    }
    if (!hasRunEventNodeStatus(eventType, payload.status)) {
      return;
    }
    const status = normalizeRunEventNodeStatus(eventType, payload.status);
    const currentBySubgraph = input.subgraphRunStatusByTabId.value[tabId] ?? {};
    input.subgraphRunStatusByTabId.value = setTabScopedRecordEntry(input.subgraphRunStatusByTabId.value, tabId, {
      ...currentBySubgraph,
      [subgraphNodeId]: {
        ...(currentBySubgraph[subgraphNodeId] ?? {}),
        [innerNodeId]: status,
      },
    });
  }

  return {
    applyRunEventVisualStateToTab,
    feedbackForTab,
    setFeedbackForTab,
    setMessageFeedbackForTab,
    applyRunOutputPreviewForTab,
    applyRunVisualStateToTab,
  };
}

function buildSubgraphRunStatusByNodeId(run: RunDetail): Record<string, Record<string, string>> {
  const fromRun = cloneSubgraphStatusMap(run.subgraph_status_map);
  for (const execution of run.node_executions ?? []) {
    const nodeId = execution.node_id?.trim();
    const artifactStatusMap = execution.artifacts?.subgraph?.node_status_map;
    if (!nodeId || !artifactStatusMap) {
      continue;
    }
    fromRun[nodeId] = {
      ...(fromRun[nodeId] ?? {}),
      ...cloneNodeStatusMap(artifactStatusMap),
    };
  }
  return fromRun;
}

function cloneSubgraphStatusMap(value: RunDetail["subgraph_status_map"]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [subgraphNodeId, statusMap] of Object.entries(value ?? {})) {
    const normalizedSubgraphNodeId = subgraphNodeId.trim();
    if (!normalizedSubgraphNodeId) {
      continue;
    }
    result[normalizedSubgraphNodeId] = cloneNodeStatusMap(statusMap);
  }
  return result;
}

function cloneNodeStatusMap(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([nodeId, status]) => [nodeId.trim(), String(status ?? "").trim()])
      .filter(([nodeId, status]) => nodeId && status),
  );
}

function normalizeRunEventText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRunEventNodeStatus(eventType: string, value: unknown) {
  const status = normalizeRunEventText(value);
  if (status) {
    return status;
  }
  if (eventType === "node.started") {
    return "running";
  }
  if (eventType === "node.completed") {
    return "success";
  }
  if (eventType === "node.failed") {
    return "failed";
  }
  return "idle";
}

function hasRunEventNodeStatus(eventType: string, value: unknown) {
  return Boolean(normalizeRunEventText(value)) || eventType === "node.started" || eventType === "node.completed" || eventType === "node.failed";
}
