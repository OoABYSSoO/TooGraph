import type { Ref } from "vue";

import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

import {
  buildRunEventOutputPreviewUpdate,
  buildRunEventStreamUrl,
  parseRunEventPayload,
  shouldPollRunStatus,
} from "../../lib/run-event-stream.ts";

import { setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

type RunOutputPreviewByNodeId = Record<string, { text: string; displayMode: string | null }>;

type RunEventSourceLike = {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  close: () => void;
  onerror: ((event: Event) => void) | null;
};

type WorkspaceRunLifecycleControllerInput = {
  documentsByTabId: Ref<Record<string, GraphPayload | GraphDocument>>;
  runOutputPreviewByTabId: Ref<Record<string, RunOutputPreviewByNodeId>>;
  restoredRunSnapshotIdByTabId: Ref<Record<string, string | null>>;
  fetchRun: (runId: string) => Promise<RunDetail>;
  createEventSource?: (url: string) => RunEventSourceLike | null;
  setTimeout?: (callback: () => void, delayMs: number) => number;
  clearTimeout?: (timerId: number) => void;
  applyRunVisualStateToTab: (
    tabId: string,
    run: RunDetail,
    document: GraphPayload | GraphDocument | undefined,
    visualRun: RunDetail,
    options?: { preserveMissing?: boolean },
  ) => void;
  openHumanReviewPanelForTab: (tabId: string, nodeId: string | null) => void;
  persistRunStateValuesForTab: (tabId: string, run: RunDetail) => void;
  setMessageFeedbackForTab: (
    tabId: string,
    feedback: { tone: WorkspaceRunFeedback["tone"]; message: string; activeRunId?: string | null; activeRunStatus?: string | null },
  ) => void;
};

export function useWorkspaceRunLifecycleController(input: WorkspaceRunLifecycleControllerInput) {
  const runPollGenerationByTabId = new Map<string, number>();
  const runPollTimerByTabId = new Map<string, number>();
  const runEventSourceByTabId = new Map<string, RunEventSourceLike>();

  function getRunGeneration(tabId: string) {
    return runPollGenerationByTabId.get(tabId) ?? 0;
  }

  function cancelRunPolling(tabId: string) {
    runPollGenerationByTabId.set(tabId, getRunGeneration(tabId) + 1);
    const timerId = runPollTimerByTabId.get(tabId);
    if (typeof timerId === "number") {
      (input.clearTimeout ?? ((id: number) => window.clearTimeout(id)))(timerId);
      runPollTimerByTabId.delete(tabId);
    }
  }

  function cancelRunEventStreamForTab(tabId: string) {
    runEventSourceByTabId.get(tabId)?.close();
    runEventSourceByTabId.delete(tabId);
  }

  function applyStreamingOutputPreviewToTab(tabId: string, payload: Record<string, unknown>) {
    const currentPreview = input.runOutputPreviewByTabId.value[tabId] ?? {};
    const nextPreview = buildRunEventOutputPreviewUpdate(input.documentsByTabId.value[tabId], currentPreview, payload);
    if (!nextPreview) {
      return;
    }
    input.runOutputPreviewByTabId.value = setTabScopedRecordEntry(input.runOutputPreviewByTabId.value, tabId, nextPreview);
  }

  function createEventSource(url: string) {
    if (input.createEventSource) {
      return input.createEventSource(url);
    }
    if (typeof EventSource === "undefined") {
      return null;
    }
    return new EventSource(url);
  }

  function startRunEventStreamForTab(tabId: string, runId: string) {
    cancelRunEventStreamForTab(tabId);
    const streamUrl = buildRunEventStreamUrl(runId);
    if (!streamUrl) {
      return;
    }
    const source = createEventSource(streamUrl);
    if (!source) {
      return;
    }

    runEventSourceByTabId.set(tabId, source);
    source.addEventListener("node.output.delta", (event) => {
      const payload = parseRunEventPayload(event);
      if (payload) {
        applyStreamingOutputPreviewToTab(tabId, payload);
      }
    });
    source.addEventListener("node.output.completed", (event) => {
      const payload = parseRunEventPayload(event);
      if (payload) {
        applyStreamingOutputPreviewToTab(tabId, payload);
      }
    });
    source.addEventListener("run.completed", () => {
      cancelRunEventStreamForTab(tabId);
      void pollRunForTab(tabId, runId);
    });
    source.addEventListener("run.failed", () => {
      cancelRunEventStreamForTab(tabId);
      void pollRunForTab(tabId, runId);
    });
    source.onerror = () => {
      if (runEventSourceByTabId.get(tabId) === source) {
        cancelRunEventStreamForTab(tabId);
      }
    };
  }

  function scheduleRunPoll(tabId: string, runId: string, delayMs: number, generation: number) {
    const timerId = (input.setTimeout ?? ((callback: () => void, timeoutMs: number) => window.setTimeout(callback, timeoutMs)))(() => {
      void pollRunForTab(tabId, runId, generation);
    }, delayMs);
    runPollTimerByTabId.set(tabId, timerId);
  }

  async function pollRunForTab(tabId: string, runId: string, generation = getRunGeneration(tabId)) {
    if (getRunGeneration(tabId) !== generation) {
      return;
    }

    try {
      const run = await input.fetchRun(runId);
      if (getRunGeneration(tabId) !== generation) {
        return;
      }

      input.applyRunVisualStateToTab(tabId, run, input.documentsByTabId.value[tabId], run, { preserveMissing: shouldPollRunStatus(run.status) });
      input.restoredRunSnapshotIdByTabId.value = setTabScopedRecordEntry(input.restoredRunSnapshotIdByTabId.value, tabId, null);

      if (run.status === "awaiting_human" && run.current_node_id) {
        input.openHumanReviewPanelForTab(tabId, run.current_node_id);
      }

      if (shouldPollRunStatus(run.status)) {
        scheduleRunPoll(tabId, runId, 500, generation);
        return;
      }

      input.persistRunStateValuesForTab(tabId, run);
      runPollTimerByTabId.delete(tabId);
      cancelRunEventStreamForTab(tabId);
    } catch (error) {
      if (getRunGeneration(tabId) !== generation) {
        return;
      }

      input.setMessageFeedbackForTab(tabId, {
        tone: "warning",
        message: error instanceof Error ? error.message : "Failed to load run detail.",
        activeRunId: runId,
        activeRunStatus: "running",
      });
      scheduleRunPoll(tabId, runId, 1000, generation);
    }
  }

  function teardownRunLifecycle() {
    for (const tabId of Array.from(runEventSourceByTabId.keys())) {
      cancelRunEventStreamForTab(tabId);
    }
    for (const tabId of Array.from(runPollTimerByTabId.keys())) {
      cancelRunPolling(tabId);
    }
  }

  return {
    cancelRunEventStreamForTab,
    cancelRunPolling,
    getRunGeneration,
    pollRunForTab,
    startRunEventStreamForTab,
    teardownRunLifecycle,
  };
}
