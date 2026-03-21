import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import type { RunActivityState } from "./runActivityModel.ts";
import { useWorkspaceRunLifecycleController } from "./useWorkspaceRunLifecycleController.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

class FakeEventSource {
  listeners = new Map<string, Array<(event: Event) => void>>();
  closed = false;
  onerror: ((event: Event) => void) | null = null;

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: Event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close() {
    this.closed = true;
  }
}

function createDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Run Graph",
    nodes: {
      output_answer: {
        kind: "output",
        name: "Answer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "answer" }],
        writes: [],
        config: {
          displayMode: "plain",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    state_schema: {
      answer: { name: "Answer", description: "", type: "text", value: "", color: "#2563eb" },
    },
    metadata: {},
  };
}

function runDetail(status: string, patch: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run_1",
    graph_id: null,
    graph_name: "Run Graph",
    status,
    runtime_backend: "node_system",
    lifecycle: { updated_at: "", resume_count: 0 },
    checkpoint_metadata: { available: false },
    current_node_id: null,
    revision_round: 1,
    started_at: "",
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    memory_summary: "",
    final_result: "",
    node_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: { outputs: [], state_events: [] },
    state_snapshot: { values: {}, last_writers: {} },
    graph_snapshot: {},
    ...patch,
  } as RunDetail;
}

function createHarness(options: { fetchRun?: () => Promise<RunDetail> } = {}) {
  const documentsByTabId = ref<Record<string, GraphPayload>>({ tab_a: createDocument() });
  const runOutputPreviewByTabId = ref<Record<string, Record<string, { text: string; displayMode: string | null }>>>({});
  const runActivityByTabId = ref<Record<string, RunActivityState>>({});
  const restoredRunSnapshotIdByTabId = ref<Record<string, string | null>>({ tab_a: "snapshot_1" });
  const eventSources: FakeEventSource[] = [];
  const feedback: Array<{ tabId: string; feedback: Partial<WorkspaceRunFeedback> }> = [];
  const visualStates: Array<{ tabId: string; status: string; preserveMissing: boolean | undefined }> = [];
  const openedHumanReview: Array<{ tabId: string; nodeId: string | null }> = [];
  const persistedRuns: Array<{ tabId: string; runId: string }> = [];
  const timeoutDelays: number[] = [];
  const clearedTimeouts: number[] = [];
  let nextTimeoutId = 10;

  const controller = useWorkspaceRunLifecycleController({
    documentsByTabId,
    runOutputPreviewByTabId,
    runActivityByTabId,
    restoredRunSnapshotIdByTabId,
    fetchRun: options.fetchRun ?? (async () => runDetail("completed")),
    createEventSource: () => {
      const source = new FakeEventSource();
      eventSources.push(source);
      return source;
    },
    setTimeout: (_callback, delayMs) => {
      timeoutDelays.push(delayMs);
      return nextTimeoutId++;
    },
    clearTimeout: (timerId) => {
      clearedTimeouts.push(timerId);
    },
    applyRunVisualStateToTab: (tabId, run, _document, _visualRun, options) => {
      visualStates.push({ tabId, status: run.status, preserveMissing: options?.preserveMissing });
    },
    openHumanReviewPanelForTab: (tabId, nodeId) => {
      openedHumanReview.push({ tabId, nodeId });
    },
    persistRunStateValuesForTab: (tabId, run) => {
      persistedRuns.push({ tabId, runId: run.run_id });
    },
    setMessageFeedbackForTab: (tabId, nextFeedback) => {
      feedback.push({ tabId, feedback: nextFeedback });
    },
  });

  return {
    clearedTimeouts,
    controller,
    eventSources,
    feedback,
    openedHumanReview,
    persistedRuns,
    restoredRunSnapshotIdByTabId,
    runActivityByTabId,
    runOutputPreviewByTabId,
    timeoutDelays,
    visualStates,
  };
}

test("useWorkspaceRunLifecycleController streams output preview updates through EventSource payloads", () => {
  const harness = createHarness();

  harness.controller.startRunEventStreamForTab("tab_a", "run_1");
  harness.eventSources[0]?.emit(
    "node.output.delta",
    new MessageEvent("node.output.delta", {
      data: JSON.stringify({ node_id: "agent_1", text: "hello", output_keys: ["answer"] }),
    }),
  );

  assert.deepEqual(harness.runOutputPreviewByTabId.value.tab_a, {
    output_answer: { text: "hello", displayMode: "plain" },
  });
  assert.deepEqual(
    harness.runActivityByTabId.value.tab_a.entries.map((entry) => ({ kind: entry.kind, nodeId: entry.nodeId, preview: entry.preview })),
    [{ kind: "node-stream", nodeId: "agent_1", preview: "hello" }],
  );
});

test("useWorkspaceRunLifecycleController appends node and state activity events in stream order", () => {
  const harness = createHarness();

  harness.controller.startRunEventStreamForTab("tab_a", "run_1");
  harness.eventSources[0]?.emit(
    "node.started",
    new MessageEvent("node.started", {
      data: JSON.stringify({ node_id: "agent_1", node_type: "agent", created_at: "2026-05-03T01:00:00Z" }),
    }),
  );
  harness.eventSources[0]?.emit(
    "state.updated",
    new MessageEvent("state.updated", {
      data: JSON.stringify({ node_id: "agent_1", state_key: "answer", value: "Final answer", sequence: 1, created_at: "2026-05-03T01:00:01Z" }),
    }),
  );
  harness.eventSources[0]?.emit(
    "node.reasoning.completed",
    new MessageEvent("node.reasoning.completed", {
      data: JSON.stringify({ node_id: "agent_1", reasoning: "Checked sources", created_at: "2026-05-03T01:00:02Z" }),
    }),
  );

  assert.deepEqual(harness.runOutputPreviewByTabId.value.tab_a, {
    output_answer: { text: "Final answer", displayMode: "plain" },
  });
  assert.deepEqual(
    harness.runActivityByTabId.value.tab_a.entries.map((entry) => ({ kind: entry.kind, stateKey: entry.stateKey, preview: entry.preview, active: entry.active })),
    [
      { kind: "node-started", stateKey: null, preview: "agent running", active: false },
      { kind: "state-updated", stateKey: "answer", preview: "Final answer", active: false },
      { kind: "reasoning", stateKey: null, preview: "Checked sources", active: true },
    ],
  );
});

test("useWorkspaceRunLifecycleController polls awaiting-human runs and opens Human Review", async () => {
  const harness = createHarness({
    fetchRun: async () => runDetail("awaiting_human", { current_node_id: "agent_review" }),
  });

  await harness.controller.pollRunForTab("tab_a", "run_1");

  assert.deepEqual(harness.visualStates, [{ tabId: "tab_a", status: "awaiting_human", preserveMissing: false }]);
  assert.deepEqual(harness.openedHumanReview, [{ tabId: "tab_a", nodeId: "agent_review" }]);
  assert.deepEqual(harness.persistedRuns, [{ tabId: "tab_a", runId: "run_1" }]);
  assert.equal(harness.restoredRunSnapshotIdByTabId.value.tab_a, null);
});

test("useWorkspaceRunLifecycleController reconciles terminal run activity from stored state events", async () => {
  const harness = createHarness({
    fetchRun: async () =>
      runDetail("completed", {
        artifacts: {
          outputs: [],
          state_events: [
            {
              node_id: "agent_1",
              state_key: "answer",
              output_key: "answer",
              mode: "replace",
              value: "Stored answer",
              sequence: 3,
              created_at: "2026-05-03T01:00:03Z",
            },
          ],
        },
      }),
  });

  await harness.controller.pollRunForTab("tab_a", "run_1");

  assert.deepEqual(
    harness.runActivityByTabId.value.tab_a.entries.map((entry) => ({ kind: entry.kind, sequence: entry.sequence, preview: entry.preview })),
    [{ kind: "state-updated", sequence: 3, preview: "Stored answer" }],
  );
});

test("useWorkspaceRunLifecycleController schedules follow-up polling for active runs", async () => {
  const harness = createHarness({
    fetchRun: async () => runDetail("running"),
  });

  await harness.controller.pollRunForTab("tab_a", "run_1");

  assert.deepEqual(harness.visualStates, [{ tabId: "tab_a", status: "running", preserveMissing: true }]);
  assert.deepEqual(harness.timeoutDelays, [500]);
  assert.deepEqual(harness.persistedRuns, []);
});

test("useWorkspaceRunLifecycleController cancels stale generations and tears down timers and streams", () => {
  const harness = createHarness();

  harness.controller.startRunEventStreamForTab("tab_a", "run_1");
  harness.controller.cancelRunPolling("tab_a");
  harness.controller.cancelRunPolling("tab_a");
  harness.controller.teardownRunLifecycle();

  assert.equal(harness.controller.getRunGeneration("tab_a"), 2);
  assert.equal(harness.eventSources[0]?.closed, true);
});

test("useWorkspaceRunLifecycleController reports polling errors and retries", async () => {
  const harness = createHarness({
    fetchRun: async () => {
      throw new Error("network down");
    },
  });

  await harness.controller.pollRunForTab("tab_a", "run_1");

  assert.equal(harness.feedback.at(-1)?.feedback.tone, "warning");
  assert.equal(harness.feedback.at(-1)?.feedback.message, "network down");
  assert.equal(harness.feedback.at(-1)?.feedback.activeRunId, "run_1");
  assert.deepEqual(harness.timeoutDelays, [1000]);
});
