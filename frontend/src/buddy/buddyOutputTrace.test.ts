import assert from "node:assert/strict";
import test from "node:test";

import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import { buildBuddyPublicOutputBindings } from "./buddyPublicOutput.ts";
import {
  buildBuddyOutputTracePlan,
  buildBuddyOutputTraceStateFromRunDetail,
  createBuddyOutputTraceRuntimeState,
  listBuddyOutputTraceSegmentsForDisplay,
  reduceBuddyOutputTraceEvent,
} from "./buddyOutputTrace.ts";

function fiveNodeGraph(): GraphPayload {
  const state = (name: string) => ({ name, description: "", type: "markdown", value: "", color: "#000" });
  const agent = (name: string, stateKey: string) => ({
    kind: "agent" as const,
    name,
    description: "",
    reads: [],
    writes: [{ state: stateKey, mode: "replace" as const }],
    config: {
      skillKey: "",
      skillBindings: [],
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "medium" as const,
      temperature: 0.4,
    },
    ui: { position: { x: 0, y: 0 } },
  });
  const output = (name: string, stateKey: string) => ({
    kind: "output" as const,
    name,
    description: "",
    reads: [{ state: stateKey, required: true }],
    writes: [],
    config: { displayMode: "markdown" as const, persistEnabled: false, persistFormat: "auto" as const, fileNameTemplate: "" },
    ui: { position: { x: 0, y: 0 } },
  });
  return {
    graph_id: null,
    name: "Buddy",
    state_schema: {
      state_b1: state("B reply 1"),
      state_b2: state("B reply 2"),
      state_e1: state("E reply 1"),
      state_e2: state("E reply 2"),
      state_e3: state("E reply 3"),
      state_e4: state("E reply 4"),
    },
    nodes: {
      node_a: agent("A", "state_b1"),
      node_b: agent("B", "state_b1"),
      node_c: agent("C", "state_e1"),
      node_d: agent("D", "state_e1"),
      node_e: agent("E", "state_e1"),
      output_b1: output("B Output 1", "state_b1"),
      output_b2: output("B Output 2", "state_b2"),
      output_e1: output("E Output 1", "state_e1"),
      output_e2: output("E Output 2", "state_e2"),
      output_e3: output("E Output 3", "state_e3"),
      output_e4: output("E Output 4", "state_e4"),
    },
    edges: [
      { source: "node_a", target: "node_b" },
      { source: "node_b", target: "output_b1" },
      { source: "node_b", target: "output_b2" },
      { source: "node_b", target: "node_c" },
      { source: "node_c", target: "node_d" },
      { source: "node_d", target: "node_e" },
      { source: "node_e", target: "output_e1" },
      { source: "node_e", target: "output_e2" },
      { source: "node_e", target: "output_e3" },
      { source: "node_e", target: "output_e4" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

test("buildBuddyOutputTracePlan groups multiple parent outputs behind one boundary segment", () => {
  const graph = fiveNodeGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));

  assert.deepEqual(plan.order, ["boundary:node_b", "boundary:node_e"]);
  assert.deepEqual(plan.segmentsById["boundary:node_b"].outputNodeIds, ["output_b1", "output_b2"]);
  assert.deepEqual(plan.segmentsById["boundary:node_e"].outputNodeIds, [
    "output_e1",
    "output_e2",
    "output_e3",
    "output_e4",
  ]);
  assert.equal(plan.segmentIdByOutputNodeId.output_b2, "boundary:node_b");
});

test("reduceBuddyOutputTraceEvent splits records after each output boundary completes", () => {
  const graph = fiveNodeGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);

  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_a", node_type: "agent" }, 1000);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_a", node_type: "agent", duration_ms: 300 }, 1300);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_b", node_type: "agent" }, 1400);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_b", node_type: "agent", duration_ms: 500 }, 1900);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_c", node_type: "agent" }, 2000);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_c", node_type: "agent", duration_ms: 200 }, 2200);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_d", node_type: "agent" }, 2300);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_d", node_type: "agent", duration_ms: 250 }, 2550);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_e", node_type: "agent" }, 2600);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_e", node_type: "agent", duration_ms: 400 }, 3000);

  const segments = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].records.map((record) => record.label), ["A", "B"]);
  assert.deepEqual(segments[1].records.map((record) => record.label), ["C", "D", "E"]);
  assert.equal(segments[0].status, "completed");
  assert.equal(segments[1].durationMs, 1000);
});

test("reduceBuddyOutputTraceEvent maps branched nodes to their nearest downstream output boundary", () => {
  const graph = fiveNodeGraph();
  graph.edges = [
    { source: "node_a", target: "node_b" },
    { source: "node_b", target: "output_b1" },
    { source: "node_a", target: "node_c" },
    { source: "node_c", target: "node_e" },
    { source: "node_e", target: "output_e1" },
  ];
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);

  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_c", node_type: "agent" }, 1000);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_c", node_type: "agent", duration_ms: 250 }, 1250);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_e", node_type: "agent" }, 1300);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_e", node_type: "agent", duration_ms: 300 }, 1600);

  const segments = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].segmentId, "boundary:node_e");
  assert.deepEqual(segments[0].records.map((record) => record.label), ["C", "E"]);
});

test("reduceBuddyOutputTraceEvent renders subgraph inner rows as parent slash child and hides aggregate rows", () => {
  const graph = fiveNodeGraph();
  graph.nodes.research = {
    kind: "subgraph",
    name: "Research",
    description: "",
    reads: [],
    writes: [{ state: "state_b1", mode: "replace" }],
    ui: { position: { x: 0, y: 0 } },
    config: {
      graph: {
        state_schema: {},
        nodes: {
          inner_search: {
            kind: "agent",
            name: "Search",
            description: "",
            reads: [],
            writes: [],
            config: {
              skillKey: "",
              skillBindings: [],
              taskInstruction: "",
              modelSource: "global",
              model: "",
              thinkingMode: "medium",
              temperature: 0.4,
            },
            ui: { position: { x: 0, y: 0 } },
          },
        },
        edges: [],
        conditional_edges: [],
        metadata: {},
      },
    },
  };
  graph.edges = [
    { source: "research", target: "output_b1" },
    { source: "research", target: "output_b2" },
  ];

  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "research", node_type: "subgraph" }, 1000);
  state = reduceBuddyOutputTraceEvent(
    state,
    plan,
    graph,
    "node.started",
    { node_id: "inner_search", node_type: "agent", subgraph_node_id: "research", subgraph_path: ["research"] },
    1100,
  );
  state = reduceBuddyOutputTraceEvent(
    state,
    plan,
    graph,
    "node.completed",
    { node_id: "inner_search", node_type: "agent", subgraph_node_id: "research", subgraph_path: ["research"], duration_ms: 700 },
    1800,
  );
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "research", node_type: "subgraph", duration_ms: 900 }, 1900);

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.deepEqual(segment.records.map((record) => record.label), ["Research / Search"]);
  assert.equal(segment.durationMs, 900);
});

test("reduceBuddyOutputTraceEvent records skill activity inside the active segment", () => {
  const graph = fiveNodeGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);

  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_a", node_type: "agent" }, 1000);
  state = reduceBuddyOutputTraceEvent(
    state,
    plan,
    graph,
    "activity.event",
    {
      sequence: 1,
      kind: "skill_invocation",
      summary: "Skill web_search succeeded.",
      node_id: "node_a",
      status: "succeeded",
      duration_ms: 420,
      detail: { skill_key: "web_search" },
    },
    1500,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records[1].kind, "activity");
  assert.equal(segment.records[1].label, "A / web_search");
  assert.equal(segment.records[1].durationMs, 420);
});

test("buildBuddyOutputTraceStateFromRunDetail rebuilds completed segments from run detail", () => {
  const graph = fiveNodeGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  const run = {
    status: "completed",
    node_executions: [
      {
        node_id: "node_a",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-13T10:00:00.000Z",
        finished_at: "2026-05-13T10:00:00.300Z",
        duration_ms: 300,
        input_summary: "",
        output_summary: "",
        artifacts: { inputs: {}, outputs: {}, family: "agent", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
      {
        node_id: "node_b",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-13T10:00:00.400Z",
        finished_at: "2026-05-13T10:00:00.900Z",
        duration_ms: 500,
        input_summary: "",
        output_summary: "",
        artifacts: { inputs: {}, outputs: {}, family: "agent", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
      {
        node_id: "node_c",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-13T10:00:01.000Z",
        finished_at: "2026-05-13T10:00:01.100Z",
        duration_ms: 100,
        input_summary: "",
        output_summary: "",
        artifacts: { inputs: {}, outputs: {}, family: "agent", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
    ],
    artifacts: {
      activity_events: [
        {
          sequence: 1,
          kind: "skill_invocation",
          summary: "Skill ran.",
          node_id: "node_c",
          status: "succeeded",
          duration_ms: 100,
          detail: { skill_key: "toograph_script_tester" },
          created_at: "2026-05-13T10:00:01.050Z",
        },
      ],
    },
  } as Partial<RunDetail> as RunDetail;

  const state = buildBuddyOutputTraceStateFromRunDetail(run, plan, graph);
  const segments = listBuddyOutputTraceSegmentsForDisplay(state);

  assert.deepEqual(segments[0].records.map((record) => record.label), ["A", "B"]);
  assert.deepEqual(segments[1].records.map((record) => record.label), ["C", "C / toograph_script_tester"]);
});

test("buildBuddyOutputTraceStateFromRunDetail keeps in-progress executions running", () => {
  const graph = fiveNodeGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  const run = {
    status: "running",
    node_executions: [
      {
        node_id: "node_a",
        node_type: "agent",
        status: "running",
        started_at: "2026-05-13T10:00:00.000Z",
        finished_at: null,
        duration_ms: null,
        input_summary: "",
        output_summary: "",
        artifacts: { inputs: {}, outputs: {}, family: "agent", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
    ],
    artifacts: {},
  } as Partial<RunDetail> as RunDetail;

  const state = buildBuddyOutputTraceStateFromRunDetail(run, plan, graph);
  const segments = listBuddyOutputTraceSegmentsForDisplay(state);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].status, "running");
  assert.equal(segments[0].records[0].status, "running");
  assert.equal(segments[0].records[0].label, "A");
});
