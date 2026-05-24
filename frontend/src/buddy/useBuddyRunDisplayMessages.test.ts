import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import { buildBuddyPublicOutputBindings } from "./buddyPublicOutput.ts";
import { buildPublicOutputRuntimeStateFromRunDetail } from "./useBuddyRunDisplayMessages.ts";
import { useBuddyRunDisplayMessages } from "./useBuddyRunDisplayMessages.ts";

function outputTimelineGraph(): GraphPayload {
  return {
    graph_id: null,
    name: "Buddy",
    state_schema: {
      answer: { name: "answer", description: "", type: "markdown", value: "", color: "#000" },
    },
    nodes: {
      gate: {
        kind: "condition",
        name: "Needs capability?",
        description: "",
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: { branches: ["true", "false"], loopLimit: 5, branchMapping: {}, rule: null },
        ui: { position: { x: 0, y: 0 } },
      },
      output_answer: {
        kind: "output",
        name: "Answer",
        description: "",
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: { displayMode: "markdown", persistEnabled: false, persistFormat: "auto", fileNameTemplate: "" },
        ui: { position: { x: 0, y: 0 } },
      },
    },
    edges: [],
    conditional_edges: [{ source: "gate", branches: { false: "output_answer" } }],
    metadata: {},
  };
}

function directOutputTimelineGraph(): GraphPayload {
  return {
    graph_id: null,
    name: "Buddy",
    state_schema: {
      answer: { name: "answer", description: "", type: "markdown", value: "", color: "#000" },
    },
    nodes: {
      writer: {
        kind: "agent",
        name: "Writer",
        description: "",
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          actionKey: "",
          actionBindings: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "low",
          temperature: 0,
        },
        ui: { position: { x: 0, y: 0 } },
      },
      output_answer: {
        kind: "output",
        name: "Answer",
        description: "",
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: { displayMode: "markdown", persistEnabled: false, persistFormat: "auto", fileNameTemplate: "" },
        ui: { position: { x: 0, y: 0 } },
      },
    },
    edges: [{ source: "writer", target: "output_answer" }],
    conditional_edges: [],
    metadata: {},
  };
}

test("buildPublicOutputRuntimeStateFromRunDetail preserves repeated direct outputs from state events", () => {
  const graph = directOutputTimelineGraph();
  const bindings = buildBuddyPublicOutputBindings(graph);
  const run = {
    status: "completed",
    output_previews: [
      {
        node_id: "output_answer",
        source_kind: "state",
        source_key: "answer",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "final",
      },
    ],
    node_executions: [
      {
        node_id: "writer",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-24T03:14:00.000Z",
        finished_at: "2026-05-24T03:14:04.000Z",
        duration_ms: 4000,
        input_summary: "",
        output_summary: "progress",
        artifacts: { inputs: {}, outputs: {}, family: "agent", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
      {
        node_id: "writer",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-24T03:14:40.000Z",
        finished_at: "2026-05-24T03:14:44.000Z",
        duration_ms: 4000,
        input_summary: "",
        output_summary: "final",
        artifacts: { inputs: {}, outputs: {}, family: "agent", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
    ],
    artifacts: {
      state_events: [
        {
          node_id: "writer",
          state_key: "answer",
          output_key: "answer",
          value: "progress",
          sequence: 1,
          created_at: "2026-05-24T03:14:04.000Z",
        },
        {
          node_id: "writer",
          state_key: "answer",
          output_key: "answer",
          value: "final",
          sequence: 2,
          created_at: "2026-05-24T03:14:44.000Z",
        },
      ],
    },
  } as Partial<RunDetail> as RunDetail;

  const state = buildPublicOutputRuntimeStateFromRunDetail(run, bindings, graph);

  assert.deepEqual(state.order, ["output_answer", "output_answer:2"]);
  assert.equal(state.messagesByOutputNodeId.output_answer.content, "progress");
  assert.equal(state.messagesByOutputNodeId["output_answer:2"].content, "final");
});

test("buildPublicOutputRuntimeStateFromRunDetail waits for conditional outputs to be reached", () => {
  const graph = outputTimelineGraph();
  const bindings = buildBuddyPublicOutputBindings(graph);
  const run = {
    status: "completed",
    output_previews: [
      {
        node_id: "output_answer",
        source_kind: "state",
        source_key: "answer",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "final",
      },
    ],
    artifacts: {
      state_events: [
        {
          node_id: "writer",
          state_key: "answer",
          output_key: "answer",
          value: "progress",
          sequence: 1,
          created_at: "2026-05-24T03:14:04.000Z",
        },
        {
          node_id: "writer",
          state_key: "answer",
          output_key: "answer",
          value: "final",
          sequence: 2,
          created_at: "2026-05-24T03:14:41.000Z",
        },
      ],
    },
    node_executions: [
      {
        node_id: "gate",
        node_type: "condition",
        status: "success",
        started_at: "2026-05-24T03:14:42.000Z",
        finished_at: "2026-05-24T03:14:42.000Z",
        duration_ms: 0,
        input_summary: "",
        output_summary: "false",
        artifacts: { inputs: {}, outputs: {}, family: "condition", selected_branch: "false", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
    ],
  } as Partial<RunDetail> as RunDetail;

  const state = buildPublicOutputRuntimeStateFromRunDetail(run, bindings, graph);

  assert.deepEqual(state.order, ["output_answer"]);
  assert.equal(state.messagesByOutputNodeId.output_answer.content, "final");
  assert.equal(state.messagesByOutputNodeId["output_answer:2"], undefined);
});

type DisplayTestMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  clientOrder?: number | null;
  includeInContext?: boolean;
  runId?: string | null;
  activityText?: string;
  publicOutput?: unknown;
  outputTrace?: unknown;
};

function createDisplayHarness() {
  const messages = ref<DisplayTestMessage[]>([
    { id: "controller", role: "assistant", content: "", clientOrder: 0 },
  ]);
  let nextOrder = 1;
  const display = useBuddyRunDisplayMessages<DisplayTestMessage>({
    messages,
    mood: ref("thinking"),
    t: (key) => key,
    createMessage: (role, content, id, clientOrder) => ({ id: id ?? `message_${nextOrder}`, role, content, clientOrder }),
    allocateBuddyMessageClientOrder: () => nextOrder++,
    scrollMessagesToBottom: async () => {},
    clearAutoResumingPageOperationPlaceholder: () => {},
  });
  return { display, messages };
}

function repeatedLoopTraceState() {
  return {
    order: ["segment_1", "segment_2"],
    activeSegmentId: "segment_2",
    nextSegmentIndex: 1,
    segmentsById: {
      segment_1: {
        segmentId: "segment_1",
        boundaryNodeId: "gate",
        boundaryLabel: "Gate",
        outputNodeIds: ["output_answer"],
        status: "completed",
        startedAtMs: 1000,
        completedAtMs: 2000,
        durationMs: 1000,
        records: [],
      },
      segment_2: {
        segmentId: "segment_2",
        boundaryNodeId: "gate",
        boundaryLabel: "Gate",
        outputNodeIds: ["output_answer"],
        status: "running",
        startedAtMs: 3000,
        completedAtMs: null,
        durationMs: null,
        records: [],
      },
    },
  } as const;
}

function repeatedCompletedLoopTraceState() {
  return {
    order: ["segment_1", "segment_2"],
    activeSegmentId: null,
    nextSegmentIndex: 2,
    segmentsById: {
      segment_1: {
        segmentId: "segment_1",
        boundaryNodeId: "gate",
        boundaryLabel: "Gate",
        outputNodeIds: ["output_answer"],
        status: "completed",
        startedAtMs: 1000,
        completedAtMs: 2000,
        durationMs: 1000,
        records: [
          {
            recordId: "segment_1:prepare",
            runtimeKey: "node:prepare",
            kind: "node",
            label: "Prepare",
            status: "completed",
            startedAtMs: 1000,
            completedAtMs: 2000,
            durationMs: 1000,
            nodeId: "prepare",
            nodeType: "agent",
            subgraphNodeId: null,
          },
        ],
      },
      segment_2: {
        segmentId: "segment_2",
        boundaryNodeId: "gate",
        boundaryLabel: "Gate",
        outputNodeIds: ["output_answer"],
        status: "completed",
        startedAtMs: 3000,
        completedAtMs: 4000,
        durationMs: 1000,
        records: [
          {
            recordId: "segment_2:search",
            runtimeKey: "node:search",
            kind: "node",
            label: "Search",
            status: "completed",
            startedAtMs: 3000,
            completedAtMs: 4000,
            durationMs: 1000,
            nodeId: "search",
            nodeType: "agent",
            subgraphNodeId: null,
          },
        ],
      },
    },
  } as const;
}

function completedOutput(outputNodeId: string, content: string) {
  return {
    outputNodeId,
    sourceOutputNodeId: "output_answer",
    outputNodeName: "Answer",
    stateKey: "answer",
    stateName: "answer",
    stateType: "markdown",
    displayMode: "markdown",
    kind: "text" as const,
    content,
    startedAtMs: null,
    updatedAtMs: null,
    completedAtMs: null,
    durationMs: null,
    status: "completed" as const,
  };
}

function timedCompletedOutput(outputNodeId: string, content: string, completedAtMs: number) {
  return {
    ...completedOutput(outputNodeId, content),
    startedAtMs: completedAtMs - 100,
    updatedAtMs: completedAtMs,
    completedAtMs,
    durationMs: 100,
  };
}

function timedCompletedOutputForSource(outputNodeId: string, sourceOutputNodeId: string, content: string, completedAtMs: number) {
  return {
    outputNodeId,
    sourceOutputNodeId,
    outputNodeName: "Answer",
    stateKey: sourceOutputNodeId === "output_result" ? "capability_result.public_response" : "public_response",
    stateName: "answer",
    stateType: "markdown",
    displayMode: "markdown",
    kind: "text" as const,
    content,
    startedAtMs: completedAtMs - 100,
    updatedAtMs: completedAtMs,
    completedAtMs,
    durationMs: 100,
    status: "completed" as const,
  };
}

test("syncBuddyRunDisplayMessages does not attach a previous output to a later loop capsule", () => {
  const { display, messages } = createDisplayHarness();

  display.syncBuddyRunDisplayMessages(
    "controller",
    "run_1",
    repeatedLoopTraceState(),
    {
      order: ["output_answer"],
      startedAtByOutputNodeId: {},
      messagesByOutputNodeId: {
        output_answer: completedOutput("output_answer", "progress"),
      },
    },
  );

  assert.deepEqual(
    messages.value.map((message) => message.id),
    ["controller", "controller:trace:segment_1", "controller:output:output_answer", "controller:trace:segment_2"],
  );
});

test("syncBuddyRunDisplayMessages attaches the next repeated output to the next loop capsule", () => {
  const { display, messages } = createDisplayHarness();

  display.syncBuddyRunDisplayMessages(
    "controller",
    "run_1",
    repeatedLoopTraceState(),
    {
      order: ["output_answer", "output_answer:2"],
      startedAtByOutputNodeId: {},
      messagesByOutputNodeId: {
        output_answer: completedOutput("output_answer", "progress"),
        "output_answer:2": completedOutput("output_answer:2", "final"),
      },
    },
  );

  assert.deepEqual(
    messages.value.map((message) => message.id),
    [
      "controller",
      "controller:trace:segment_1",
      "controller:output:output_answer",
      "controller:trace:segment_2",
      "controller:output:output_answer:2",
    ],
  );
});

test("syncBuddyRunDisplayMessages keeps trace client order before an earlier orphan output", () => {
  const { display, messages } = createDisplayHarness();

  display.syncBuddyRunDisplayMessages(
    "controller",
    "run_1",
    {
      order: [],
      activeSegmentId: null,
      nextSegmentIndex: 0,
      segmentsById: {},
    },
    {
      order: ["output_answer"],
      startedAtByOutputNodeId: {},
      messagesByOutputNodeId: {
        output_answer: completedOutput("output_answer", "first visible text"),
      },
    },
  );

  display.syncBuddyRunDisplayMessages(
    "controller",
    "run_1",
    {
      order: ["segment_1"],
      activeSegmentId: null,
      nextSegmentIndex: 1,
      segmentsById: {
        segment_1: {
          segmentId: "segment_1",
          boundaryNodeId: "gate",
          boundaryLabel: "Gate",
          outputNodeIds: ["output_answer"],
          status: "completed",
          startedAtMs: 1000,
          completedAtMs: 2000,
          durationMs: 1000,
          records: [],
        },
      },
    },
    {
      order: ["output_answer"],
      startedAtByOutputNodeId: {},
      messagesByOutputNodeId: {
        output_answer: completedOutput("output_answer", "first visible text"),
      },
    },
  );

  assert.deepEqual(
    messages.value.map((message) => message.id),
    ["controller", "controller:trace:segment_1", "controller:output:output_answer"],
  );
  assert.ok((messages.value[1].clientOrder ?? 0) < (messages.value[2].clientOrder ?? 0));
});

test("syncBuddyRunDisplayMessages folds completed loop capsules that receive no output message", () => {
  const { display, messages } = createDisplayHarness();

  display.syncBuddyRunDisplayMessages(
    "controller",
    "run_1",
    repeatedCompletedLoopTraceState(),
    {
      order: ["output_answer"],
      startedAtByOutputNodeId: {},
      messagesByOutputNodeId: {
        output_answer: timedCompletedOutput("output_answer", "final", 3500),
      },
    },
  );

  assert.deepEqual(
    messages.value.map((message) => message.id),
    ["controller", "controller:trace:segment_2", "controller:output:output_answer"],
  );
  assert.deepEqual(
    (messages.value[1].outputTrace as { records: Array<{ label: string }> }).records.map((record) => record.label),
    ["Prepare", "Search"],
  );
});

test("syncBuddyRunDisplayMessages waits for a trace segment before showing run outputs", () => {
  const { display, messages } = createDisplayHarness();

  display.syncBuddyRunDisplayMessages(
    "controller",
    "run_1",
    {
      order: ["segment_1"],
      activeSegmentId: null,
      nextSegmentIndex: 0,
      segmentsById: {
        segment_1: {
          segmentId: "segment_1",
          boundaryNodeId: "gate",
          boundaryLabel: "Gate",
          outputNodeIds: ["output_answer"],
          status: "idle",
          startedAtMs: null,
          completedAtMs: null,
          durationMs: null,
          records: [],
        },
      },
    },
    {
      order: ["output_answer"],
      startedAtByOutputNodeId: {},
      messagesByOutputNodeId: {
        output_answer: completedOutput("output_answer", "streamed before trace"),
      },
    },
  );

  assert.deepEqual(messages.value.map((message) => message.id), ["controller"]);
});

test("syncBuddyRunDisplayMessages attaches repeated timed outputs to the segment that contains them", () => {
  const { display, messages } = createDisplayHarness();

  display.syncBuddyRunDisplayMessages(
    "controller",
    "run_1",
    {
      order: ["segment_1", "segment_2"],
      activeSegmentId: null,
      nextSegmentIndex: 2,
      segmentsById: {
        segment_1: {
          segmentId: "segment_1",
          boundaryNodeId: "first_gate",
          boundaryLabel: "First gate",
          outputNodeIds: ["output_public"],
          status: "completed",
          startedAtMs: 1000,
          completedAtMs: 2000,
          durationMs: 1000,
          records: [],
        },
        segment_2: {
          segmentId: "segment_2",
          boundaryNodeId: "result_gate",
          boundaryLabel: "Result gate",
          outputNodeIds: ["output_result"],
          status: "completed",
          startedAtMs: 3000,
          completedAtMs: 5000,
          durationMs: 2000,
          records: [],
        },
      },
    },
    {
      order: ["output_public", "output_result:public_response", "output_public:2"],
      startedAtByOutputNodeId: {},
      messagesByOutputNodeId: {
        output_public: timedCompletedOutputForSource("output_public", "output_public", "planning", 1500),
        "output_result:public_response": timedCompletedOutputForSource(
          "output_result:public_response",
          "output_result",
          "result package",
          4900,
        ),
        "output_public:2": timedCompletedOutputForSource("output_public:2", "output_public", "handoff", 4800),
      },
    },
  );

  assert.deepEqual(
    messages.value.map((message) => message.id),
    [
      "controller",
      "controller:trace:segment_1",
      "controller:output:output_public",
      "controller:trace:segment_2",
      "controller:output:output_public:2",
      "controller:output:output_result:public_response",
    ],
  );
});
