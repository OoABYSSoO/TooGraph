import { fetchRun } from "../api/runs.ts";
import { buildRunEventStreamUrl, parseRunEventPayload, shouldPollRunStatus } from "../lib/run-event-stream.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import {
  createBuddyPublicOutputRuntimeState,
  reduceBuddyPublicOutputEvent,
  type BuddyPublicOutputBinding,
  type BuddyPublicOutputRuntimeState,
} from "./buddyPublicOutput.ts";
import {
  buildBuddyOutputTracePlan,
  buildBuddyOutputTraceStateFromRunDetail,
  createBuddyOutputTraceRuntimeState,
  listBuddyOutputTraceSegmentsForDisplay,
  reduceBuddyOutputTraceEvent,
  type BuddyOutputTraceRuntimeState,
} from "./buddyOutputTrace.ts";

type BuddyStreamingRunDisplaySnapshot = {
  publicOutputState: BuddyPublicOutputRuntimeState;
  outputTraceState: BuddyOutputTraceRuntimeState;
};

type BuddyRunEventStreamOptions = {
  handleActivityEvent: (payload: Record<string, unknown>) => void;
  setAssistantActivityFromRunEvent: (
    assistantMessageId: string,
    eventType: string,
    payload: Record<string, unknown>,
    graph: GraphPayload,
  ) => void;
  syncStreamingBuddyRunDisplay: (
    assistantMessageId: string,
    runId: string,
    outputTraceState: BuddyOutputTraceRuntimeState,
    publicOutputState: BuddyPublicOutputRuntimeState,
  ) => void;
  buildPublicOutputRuntimeStateFromRunDetail: (
    runDetail: RunDetail,
    publicOutputBindings: BuddyPublicOutputBinding[],
    graph: GraphPayload,
  ) => BuddyPublicOutputRuntimeState;
  nowPublicOutputMs: () => number;
};

type BuddyRunPollOptions = {
  intervalMs?: number;
  fetchRunDetail?: (runId: string, options: { signal: AbortSignal }) => Promise<RunDetail>;
  waitForDelay?: (timeoutMs: number, signal: AbortSignal) => Promise<void>;
};

const RUN_POLL_INTERVAL_MS = 700;

export function useBuddyRunEventStream({
  handleActivityEvent,
  setAssistantActivityFromRunEvent,
  syncStreamingBuddyRunDisplay,
  buildPublicOutputRuntimeStateFromRunDetail,
  nowPublicOutputMs,
}: BuddyRunEventStreamOptions) {
  let activeEventSource: EventSource | null = null;

  function startRunEventStream(
    runId: string,
    assistantMessageId: string,
    graph: GraphPayload,
    publicOutputBindings: BuddyPublicOutputBinding[],
  ) {
    closeEventSource();
    const streamUrl = buildRunEventStreamUrl(runId);
    if (!streamUrl || typeof EventSource === "undefined") {
      return;
    }

    let publicOutputState = createBuddyPublicOutputRuntimeState();
    const outputTracePlan = buildBuddyOutputTracePlan(graph, publicOutputBindings);
    let outputTraceState = createBuddyOutputTraceRuntimeState(outputTracePlan);
    const source = new EventSource(streamUrl);
    activeEventSource = source;
    void hydrateBuddyStreamingRunDisplayFromSnapshot(runId, source, graph, publicOutputBindings, outputTracePlan).then((snapshot) => {
      if (!snapshot || activeEventSource !== source) {
        return;
      }
      if (!hasVisibleBuddyRunDisplaySnapshot(snapshot)) {
        return;
      }
      outputTraceState = snapshot.outputTraceState;
      publicOutputState = snapshot.publicOutputState;
      syncStreamingBuddyRunDisplay(assistantMessageId, runId, outputTraceState, publicOutputState);
    });
    const handleStreamingEvent = (eventType: string, event: Event) => {
      const payload = parseRunEventPayload(event);
      if (!payload) {
        return;
      }
      if (eventType === "activity.event") {
        handleActivityEvent(payload);
      }
      outputTraceState = reduceBuddyOutputTraceEvent(
        outputTraceState,
        outputTracePlan,
        graph,
        eventType,
        payload,
        nowPublicOutputMs(),
      );
      publicOutputState = reduceBuddyPublicOutputEvent(
        publicOutputState,
        publicOutputBindings,
        eventType,
        payload,
        nowPublicOutputMs(),
      );
      syncStreamingBuddyRunDisplay(assistantMessageId, runId, outputTraceState, publicOutputState);
      setAssistantActivityFromRunEvent(assistantMessageId, eventType, payload, graph);
    };
    source.addEventListener("node.started", (event) => handleStreamingEvent("node.started", event));
    source.addEventListener("node.output.delta", (event) => handleStreamingEvent("node.output.delta", event));
    source.addEventListener("node.output.completed", (event) => handleStreamingEvent("node.output.completed", event));
    source.addEventListener("state.updated", (event) => handleStreamingEvent("state.updated", event));
    source.addEventListener("activity.event", (event) => handleStreamingEvent("activity.event", event));
    source.addEventListener("node.completed", (event) => handleStreamingEvent("node.completed", event));
    source.addEventListener("node.failed", (event) => handleStreamingEvent("node.failed", event));
    source.addEventListener("run.completed", () => closeEventSource(source));
    source.addEventListener("run.failed", () => closeEventSource(source));
    source.addEventListener("run.cancelled", () => closeEventSource(source));
    source.onerror = () => closeEventSource(source);
  }

  async function hydrateBuddyStreamingRunDisplayFromSnapshot(
    runId: string,
    source: EventSource,
    graph: GraphPayload,
    publicOutputBindings: BuddyPublicOutputBinding[],
    outputTracePlan: ReturnType<typeof buildBuddyOutputTracePlan>,
  ): Promise<BuddyStreamingRunDisplaySnapshot | null> {
    try {
      const runDetail = await fetchRun(runId);
      if (activeEventSource !== source) {
        return null;
      }
      return {
        outputTraceState: buildBuddyOutputTraceStateFromRunDetail(runDetail, outputTracePlan, graph),
        publicOutputState: buildPublicOutputRuntimeStateFromRunDetail(runDetail, publicOutputBindings, graph),
      };
    } catch {
      return null;
    }
  }

  function hasVisibleBuddyRunDisplaySnapshot(snapshot: BuddyStreamingRunDisplaySnapshot) {
    return (
      listBuddyOutputTraceSegmentsForDisplay(snapshot.outputTraceState).length > 0 ||
      snapshot.publicOutputState.order.length > 0
    );
  }

  function closeEventSource(source: EventSource | null = activeEventSource) {
    source?.close();
    if (activeEventSource === source) {
      activeEventSource = null;
    }
  }

  return {
    startRunEventStream,
    closeEventSource,
    pollRunUntilFinished: pollBuddyRunUntilFinished,
  };
}

export async function pollBuddyRunUntilFinished(
  runId: string,
  signal: AbortSignal,
  {
    intervalMs = RUN_POLL_INTERVAL_MS,
    fetchRunDetail = fetchRun,
    waitForDelay = waitForBuddyRunPollDelay,
  }: BuddyRunPollOptions = {},
): Promise<RunDetail> {
  while (true) {
    const run = await fetchRunDetail(runId, { signal });
    if (!shouldPollRunStatus(run.status)) {
      return run;
    }
    await waitForDelay(intervalMs, signal);
  }
}

export function waitForBuddyRunPollDelay(timeoutMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timerId = window.setTimeout(resolve, timeoutMs);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timerId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
