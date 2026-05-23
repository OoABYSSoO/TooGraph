import assert from "node:assert/strict";
import test from "node:test";

import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import { buildBuddyPublicOutputBindings } from "./buddyPublicOutput.ts";
import {
  buildBuddyOutputTracePlan,
  buildBuddyOutputTraceStateFromRunDetail,
  createBuddyOutputTraceRuntimeState,
  createBuddyPendingOutputTraceRuntimeState,
  listBuddyOutputTraceSegmentsForDisplay,
  reduceBuddyOutputTraceEvent,
} from "./buddyOutputTrace.ts";

function execution(nodeId: string, nodeType: string, _label: string, startedAt: string, durationMs: number) {
  return {
    node_id: nodeId,
    node_type: nodeType,
    status: "success",
    started_at: startedAt,
    finished_at: new Date(Date.parse(startedAt) + durationMs).toISOString(),
    duration_ms: durationMs,
    input_summary: "",
    output_summary: "",
    artifacts: { inputs: {}, outputs: {}, family: nodeType, state_reads: [], state_writes: [] },
    warnings: [],
    errors: [],
  };
}

function fiveNodeGraph(): GraphPayload {
  const state = (name: string) => ({ name, description: "", type: "markdown", value: "", color: "#000" });
  const agent = (name: string, stateKey: string) => ({
    kind: "agent" as const,
    name,
    description: "",
    reads: [],
    writes: [{ state: stateKey, mode: "replace" as const }],
    config: {
      actionKey: "",
      actionBindings: [],
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

function sevenNodeBoundaryGraph(): GraphPayload {
  const state = (name: string) => ({ name, description: "", type: "markdown", value: "", color: "#000" });
  const agent = (name: string, stateKey: string) => ({
    kind: "agent" as const,
    name,
    description: "",
    reads: [],
    writes: [{ state: stateKey, mode: "replace" as const }],
    config: {
      actionKey: "",
      actionBindings: [],
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "medium" as const,
      temperature: 0.4,
    },
    ui: { position: { x: 0, y: 0 } },
  });
  const subgraph = (name: string, stateKey: string) => ({
    kind: "subgraph" as const,
    name,
    description: "",
    reads: [],
    writes: [{ state: stateKey, mode: "replace" as const }],
    config: {
      graph: {
        state_schema: {},
        nodes: {},
        edges: [],
        conditional_edges: [],
        metadata: {},
      },
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
      state_c: state("C reply"),
      state_f1: state("F reply 1"),
      state_f2: state("F reply 2"),
      state_g: state("G reply"),
    },
    nodes: {
      node_a: agent("A", "state_c"),
      node_b: agent("B", "state_c"),
      node_c: subgraph("C", "state_c"),
      node_d: agent("D", "state_f1"),
      node_e: agent("E", "state_f1"),
      node_f: agent("F", "state_f1"),
      node_g: agent("G", "state_g"),
      output_c: output("C Output", "state_c"),
      output_f1: output("F Output 1", "state_f1"),
      output_f2: output("F Output 2", "state_f2"),
      output_g: output("G Output", "state_g"),
    },
    edges: [
      { source: "node_a", target: "node_b" },
      { source: "node_b", target: "node_c" },
      { source: "node_c", target: "output_c" },
      { source: "node_c", target: "node_d" },
      { source: "node_d", target: "node_e" },
      { source: "node_e", target: "node_f" },
      { source: "node_f", target: "output_f1" },
      { source: "node_f", target: "output_f2" },
      { source: "node_f", target: "node_g" },
      { source: "node_g", target: "output_g" },
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

test("buildBuddyOutputTracePlan segments linear Buddy runs by output boundary nodes", () => {
  const graph = sevenNodeBoundaryGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);

  assert.deepEqual(plan.order, ["boundary:node_c", "boundary:node_f", "boundary:node_g"]);
  assert.deepEqual(plan.segmentsById["boundary:node_c"].outputNodeIds, ["output_c"]);
  assert.deepEqual(plan.segmentsById["boundary:node_f"].outputNodeIds, ["output_f1", "output_f2"]);
  assert.deepEqual(plan.segmentsById["boundary:node_g"].outputNodeIds, ["output_g"]);

  const nodeIds = ["node_a", "node_b", "node_c", "node_d", "node_e", "node_f", "node_g"];
  nodeIds.forEach((nodeId, index) => {
    const startedAt = 1000 + index * 200;
    state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: nodeId, node_type: nodeId === "node_c" ? "subgraph" : "agent" }, startedAt);
    state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: nodeId, node_type: nodeId === "node_c" ? "subgraph" : "agent", duration_ms: 100 }, startedAt + 100);
  });

  const segments = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.deepEqual(
    segments.map((segment) => segment.records.map((record) => record.label)),
    [
      ["A", "B", "C"],
      ["D", "E", "F"],
      ["G"],
    ],
  );
});

test("createBuddyPendingOutputTraceRuntimeState shows the first segment immediately", () => {
  const graph = fiveNodeGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));

  const state = createBuddyPendingOutputTraceRuntimeState(plan, 1234);
  const segments = listBuddyOutputTraceSegmentsForDisplay(state);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].segmentId, "boundary:node_b");
  assert.equal(segments[0].status, "running");
  assert.equal(segments[0].startedAtMs, 1234);
  assert.deepEqual(segments[0].records, []);
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

test("buildBuddyOutputTracePlan prefers conditional gates as formal output boundaries", () => {
  const graph = fiveNodeGraph();
  graph.nodes.node_f = {
    kind: "condition",
    name: "Review Gate",
    description: "",
    reads: [{ state: "state_e1", required: true }],
    writes: [],
    config: { branches: ["true", "false"], loopLimit: 5, branchMapping: {}, rule: null },
    ui: { position: { x: 0, y: 0 } },
  };
  graph.edges = [
    { source: "node_a", target: "node_b" },
    { source: "node_c", target: "output_e1" },
    { source: "node_c", target: "node_d" },
    { source: "node_d", target: "node_f" },
  ];
  graph.conditional_edges = [
    { source: "node_b", branches: { false: "output_b1", true: "node_c" } },
    { source: "node_f", branches: { true: "output_e1", false: "node_a" } },
  ];
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  const run = {
    status: "completed",
    node_executions: [
      execution("node_a", "agent", "A", "2026-05-13T10:00:00.000Z", 300),
      execution("node_b", "condition", "B", "2026-05-13T10:00:00.400Z", 0),
      execution("node_c", "agent", "C", "2026-05-13T10:00:00.500Z", 500),
      execution("node_d", "agent", "D", "2026-05-13T10:00:01.100Z", 200),
      execution("node_f", "condition", "Review Gate", "2026-05-13T10:00:01.400Z", 0),
    ],
    output_previews: [
      {
        node_id: "output_b1",
        source_kind: "state",
        source_key: "state_b1",
        display_mode: "plain",
        persist_enabled: false,
        persist_format: "auto",
        value: "intro",
      },
      {
        node_id: "output_e1",
        source_kind: "state",
        source_key: "state_e1",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "final",
      },
    ],
    artifacts: {},
  } as Partial<RunDetail> as RunDetail;

  const state = buildBuddyOutputTraceStateFromRunDetail(run, plan, graph);
  const segments = listBuddyOutputTraceSegmentsForDisplay(state);

  assert.deepEqual(plan.order, ["boundary:node_b", "boundary:node_f"]);
  assert.deepEqual(segments.map((segment) => segment.outputNodeIds), [["output_b1"], ["output_e1"]]);
  assert.deepEqual(segments[0].records.map((record) => record.label), ["A", "B"]);
  assert.deepEqual(segments[1].records.map((record) => record.label), ["C", "D", "Review Gate"]);
});

test("buildBuddyOutputTraceStateFromRunDetail keeps decision nodes before the visible final branch", () => {
  const state = (name: string) => ({ name, description: "", type: "markdown", value: "", color: "#000" });
  const condition = (name: string) => ({
    kind: "condition" as const,
    name,
    description: "",
    reads: [],
    writes: [],
    config: { branches: ["true", "false"], loopLimit: 1, branchMapping: {}, rule: null },
    ui: { position: { x: 0, y: 0 } },
  });
  const graph: GraphPayload = {
    graph_id: null,
    name: "Buddy",
    state_schema: {
      final_response: state("Final response"),
      result_package: state("Result package"),
    },
    nodes: {
      reply: {
        kind: "agent",
        name: "Reply and select capability",
        description: "",
        reads: [],
        writes: [{ state: "final_response", mode: "replace" }],
        config: {
          actionKey: "",
          actionBindings: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.4,
        },
        ui: { position: { x: 0, y: 0 } },
      },
      output_final: {
        kind: "output",
        name: "Final",
        description: "",
        reads: [{ state: "final_response", required: true }],
        writes: [],
        config: { displayMode: "markdown", persistEnabled: false, persistFormat: "auto", fileNameTemplate: "" },
        ui: { position: { x: 0, y: 0 } },
      },
      output_result: {
        kind: "output",
        name: "Result package",
        description: "",
        reads: [{ state: "result_package", required: true }],
        writes: [],
        config: { displayMode: "auto", persistEnabled: false, persistFormat: "auto", fileNameTemplate: "" },
        ui: { position: { x: 0, y: 0 } },
      },
      can_direct: condition("Can direct output?"),
      needs: condition("Needs capability?"),
    },
    edges: [{ source: "reply", target: "can_direct" }],
    conditional_edges: [
      { source: "can_direct", branches: { true: "output_result", false: "needs" } },
      { source: "needs", branches: { false: "output_final" } },
    ],
    metadata: {},
  };
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  const run = {
    status: "completed",
    node_executions: [
      execution("reply", "agent", "Reply and select capability", "2026-05-13T10:00:00.000Z", 500),
      execution("can_direct", "condition", "Can direct output?", "2026-05-13T10:00:00.600Z", 0),
      execution("needs", "condition", "Needs capability?", "2026-05-13T10:00:00.700Z", 0),
    ],
    output_previews: [
      {
        node_id: "output_final",
        source_kind: "state",
        source_key: "final_response",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "hello",
      },
    ],
    artifacts: {},
  } as Partial<RunDetail> as RunDetail;

  assert.deepEqual(plan.order, ["boundary:can_direct", "boundary:needs"]);

  const stateFromRun = buildBuddyOutputTraceStateFromRunDetail(run, plan, graph);
  const segments = listBuddyOutputTraceSegmentsForDisplay(stateFromRun, { visibleOutputNodeIds: new Set(["output_final"]) });

  assert.equal(segments.length, 1);
  assert.equal(segments[0].segmentId, "boundary:needs");
  assert.deepEqual(
    segments[0].records.map((record) => record.label),
    ["Reply and select capability", "Can direct output?", "Needs capability?"],
  );
});

test("reduceBuddyOutputTraceEvent appends a new segment when a loop reaches the same output boundary again", () => {
  const graph = fiveNodeGraph();
  graph.nodes.node_b = {
    kind: "condition",
    name: "Needs capability?",
    description: "",
    reads: [{ state: "state_b1", required: true }],
    writes: [],
    config: { branches: ["true", "false"], loopLimit: 5, branchMapping: {}, rule: null },
    ui: { position: { x: 0, y: 0 } },
  };
  graph.nodes.node_c = {
    kind: "agent",
    name: "Execute capability",
    description: "",
    reads: [],
    writes: [{ state: "state_b1", mode: "replace" }],
    config: {
      actionKey: "",
      actionBindings: [],
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "medium",
      temperature: 0.4,
    },
    ui: { position: { x: 0, y: 0 } },
  };
  graph.edges = [
    { source: "node_a", target: "node_b" },
    { source: "node_c", target: "node_b" },
  ];
  graph.conditional_edges = [
    { source: "node_b", branches: { true: "node_c", false: "output_b1" } },
  ];
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);

  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_a", node_type: "agent" }, 1000);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_a", node_type: "agent" }, 1100);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_b", node_type: "condition" }, 1200);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_b", node_type: "condition" }, 1201);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_c", node_type: "agent" }, 1300);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_c", node_type: "agent" }, 1400);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_b", node_type: "condition" }, 1500);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_b", node_type: "condition" }, 1501);

  const segments = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].records.map((record) => record.label), ["A", "Needs capability?"]);
  assert.deepEqual(segments[1].records.map((record) => record.label), ["Execute capability", "Needs capability?"]);
  assert.deepEqual(segments.map((segment) => segment.outputNodeIds), [["output_b1"], ["output_b1"]]);
});

test("reduceBuddyOutputTraceEvent keeps subgraph headers before indented inner rows", () => {
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
              actionKey: "",
              actionBindings: [],
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
  assert.deepEqual(segment.records.map((record) => record.label), ["Research", "Research / Search"]);
  assert.equal(segment.durationMs, 900);
});

test("reduceBuddyOutputTraceEvent records action activity inside the active segment", () => {
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
      kind: "action_invocation",
      summary: "Action web_search succeeded.",
      node_id: "node_a",
      status: "succeeded",
      duration_ms: 420,
      detail: { action_key: "web_search" },
    },
    1500,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records[1].kind, "activity");
  assert.equal(segment.records[1].label, "A / web_search");
  assert.equal(segment.records[1].durationMs, 420);
});

test("reduceBuddyOutputTraceEvent records tool activity inside the active segment", () => {
  const graph = fiveNodeGraph();
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);

  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_a", node_type: "tool" }, 1000);
  state = reduceBuddyOutputTraceEvent(
    state,
    plan,
    graph,
    "activity.event",
    {
      sequence: 2,
      kind: "tool_invocation",
      summary: "Tool video_segmenter succeeded.",
      node_id: "node_a",
      status: "succeeded",
      duration_ms: 120,
      detail: { tool_key: "video_segmenter" },
    },
    1500,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records[1].kind, "activity");
  assert.equal(segment.records[1].label, "A / video_segmenter");
  assert.equal(segment.records[1].durationMs, 120);
});

test("reduceBuddyOutputTraceEvent exposes child run evidence from dynamic subgraph activity", () => {
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
      sequence: 3,
      kind: "subgraph_invocation",
      summary: "Subgraph advanced_web_research_loop completed.",
      node_id: "node_a",
      status: "succeeded",
      duration_ms: 640,
      detail: {
        subgraph_key: "advanced_web_research_loop",
        child_run_id: "run_research",
        child_run_status: "completed",
      },
    },
    1500,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records[1].kind, "activity");
  assert.equal(segment.records[1].triggeredRunId, "run_research");
  assert.deepEqual(segment.records[1].artifactLabels, ["run: run_research completed"]);
});

test("reduceBuddyOutputTraceEvent merges dynamic subgraph activity updates by child run id", () => {
  const graph = fiveNodeGraph();
  graph.nodes.node_a.name = "动态能力";
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
      kind: "subgraph_invocation",
      summary: "Subgraph advanced_web_research_loop started.",
      node_id: "node_a",
      status: "running",
      detail: {
        capability_key: "advanced_web_research_loop",
        capability_name: "高级联网搜索",
        child_run_id: "run_research",
        child_run_status: "running",
      },
    },
    1100,
  );
  state = reduceBuddyOutputTraceEvent(
    state,
    plan,
    graph,
    "activity.event",
    {
      sequence: 2,
      kind: "subgraph_invocation",
      summary: "Subgraph advanced_web_research_loop completed.",
      node_id: "node_a",
      status: "succeeded",
      duration_ms: 640,
      detail: {
        capability_key: "advanced_web_research_loop",
        capability_name: "高级联网搜索",
        child_run_id: "run_research",
        child_run_status: "completed",
      },
    },
    1740,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records.length, 2);
  assert.equal(segment.records[1].label, "动态能力 / 高级联网搜索");
  assert.equal(segment.records[1].status, "completed");
  assert.equal(segment.records[1].durationMs, 640);
});

test("reduceBuddyOutputTraceEvent names dynamic capability activity with the selected ability name", () => {
  const graph = fiveNodeGraph();
  graph.nodes.node_a.name = "动态能力";
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);

  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_a", node_type: "agent" }, 1000);
  state = reduceBuddyOutputTraceEvent(
    state,
    plan,
    graph,
    "activity.event",
    {
      sequence: 33,
      kind: "subgraph_invocation",
      summary: "Subgraph advanced_web_research_loop completed.",
      node_id: "node_a",
      status: "succeeded",
      duration_ms: 640,
      detail: {
        capability_key: "advanced_web_research_loop",
        capability_name: "高级联网搜索",
        child_run_id: "run_research",
        child_run_status: "completed",
      },
    },
    1500,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records[1].label, "动态能力 / 高级联网搜索");
});

test("reduceBuddyOutputTraceEvent records readable virtual operation activity", () => {
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
      sequence: 4,
      kind: "virtual_ui_operation",
      summary: "Requested virtual template run for 高级联网搜索.",
      node_id: "node_a",
      status: "requested",
      duration_ms: 10,
      detail: {
        action_key: "toograph_page_operator",
        operation_request_id: "vop_template1234",
        operation: {
          kind: "run_template",
          target_id: "library.template.advanced_web_research_loop.open",
          template_id: "advanced_web_research_loop",
          template_name: "高级联网搜索",
          input_text: "研究 TooGraph 页面操作 Action的最新差距。",
        },
      },
    },
    1500,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records[1].kind, "activity");
  assert.equal(segment.records[1].label, "A / Virtual template run");
  assert.equal(segment.records[1].summary, "Template: 高级联网搜索 · Input: 研究 TooGraph 页面操作 Action的最新差距。");
});

test("reduceBuddyOutputTraceEvent includes triggered run status for completed virtual operations", () => {
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
      sequence: 5,
      kind: "virtual_ui_operation",
      summary: "Virtual run_template succeeded. triggered run run_search completed. request vop_template1234.",
      node_id: "node_a",
      status: "succeeded",
      detail: {
        operation_request_id: "vop_template1234",
        operation: {
          kind: "run_template",
          target_id: "library.template.advanced_web_research_loop.open",
          search_text: "advanced_web_research_loop",
          input_text: "鸣潮最新资讯",
        },
        operation_report: {
          operation_request_id: "vop_template1234",
          status: "succeeded",
          target_id: "library.template.advanced_web_research_loop.open",
          triggered_run_id: "run_search",
          triggered_run_status: "completed",
        },
      },
    },
    1600,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.equal(segment.records[1].label, "A / Virtual template run");
  assert.equal(segment.records[1].summary, "Template: advanced_web_research_loop · Input: 鸣潮最新资讯 · Run: run_search completed");
});

test("reduceBuddyOutputTraceEvent keeps virtual operation evidence labels for Buddy capsules", () => {
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
      sequence: 6,
      kind: "virtual_ui_operation",
      node_id: "node_a",
      status: "succeeded",
      detail: {
        operation_request_id: "vop_capsule_evidence",
        operation: {
          kind: "run_template",
          target_id: "library.template.report.open",
          template_id: "report",
          input_text: "Build report",
        },
        operation_report: {
          triggered_run_id: "run_report",
          triggered_run_status: "completed",
          artifact_refs: [
            { kind: "output_file", path: "runs/run_report/report.md" },
            { kind: "saved_file", path: "runs/run_report/data.json" },
          ],
          retry_chain: [
            { kind: "target", target_id: "library.template.report.open", attempts: 3, status: "matched" },
            { kind: "route", target_id: "/runs/run_report", attempts: 4, status: "matched" },
          ],
        },
      },
    },
    1600,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.deepEqual(segment.records[1].artifactLabels, [
    "operation: run_template",
    "template: report",
    "target: library.template.report.open",
    "run: run_report completed",
    "artifacts: 2",
    "retries: 5",
    "request: vop_capsule_evidence",
  ]);
  assert.equal(segment.records[1].triggeredRunId, "run_report");
});

test("reduceBuddyOutputTraceEvent carries graph revision restore metadata for Buddy capsules", () => {
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
      sequence: 7,
      kind: "virtual_ui_operation",
      node_id: "node_a",
      status: "succeeded",
      detail: {
        operation_request_id: "vop_graph_revision_restore",
        operation: {
          kind: "graph_edit",
          target_id: "editor.canvas.surface",
        },
        operation_report: {
          graph_edit_summary: {
            graph_id: "graph_buddy",
            revision_id: "grev_buddy",
            revision_status: "saved",
          },
        },
      },
    },
    1600,
  );

  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);
  assert.deepEqual(segment.records[1].graphRevision, {
    graphId: "graph_buddy",
    revisionId: "grev_buddy",
    status: "saved",
  });
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
          kind: "action_invocation",
          summary: "Action ran.",
          node_id: "node_c",
          status: "succeeded",
          duration_ms: 100,
          detail: { action_key: "toograph_script_tester" },
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

test("buildBuddyOutputTraceStateFromRunDetail keeps trace-only empty outputs with the next visible output capsule", () => {
  const graph = fiveNodeGraph();
  graph.nodes.node_gate = {
    kind: "condition",
    name: "能力选择结果",
    description: "",
    reads: [{ state: "state_b1", required: true }],
    writes: [],
    config: { branches: ["empty", "continue"], loopLimit: 5, branchMapping: {}, rule: null },
    ui: { position: { x: 0, y: 0 } },
  };
  graph.nodes.node_dynamic = {
    ...graph.nodes.node_c,
    name: "动态能力",
  };
  graph.nodes.node_final = {
    kind: "condition",
    name: "最终回复判断",
    description: "",
    reads: [{ state: "state_e1", required: true }],
    writes: [],
    config: { branches: ["done"], loopLimit: 5, branchMapping: {}, rule: null },
    ui: { position: { x: 0, y: 0 } },
  };
  graph.edges = [
    { source: "node_a", target: "node_gate" },
    { source: "node_dynamic", target: "node_final" },
  ];
  graph.conditional_edges = [
    { source: "node_gate", branches: { empty: "output_b1", continue: "node_dynamic" } },
    { source: "node_final", branches: { done: "output_e1" } },
  ];
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  const run = {
    status: "completed",
    node_executions: [
      execution("node_a", "agent", "理解请求", "2026-05-13T10:00:00.000Z", 100),
      execution("node_gate", "condition", "能力选择结果", "2026-05-13T10:00:00.200Z", 0),
      execution("node_dynamic", "agent", "动态能力", "2026-05-13T10:00:00.300Z", 500),
      execution("node_final", "condition", "最终回复判断", "2026-05-13T10:00:01.000Z", 0),
    ],
    output_previews: [
      {
        node_id: "output_b1",
        source_kind: "state",
        source_key: "state_b1",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "",
      },
      {
        node_id: "output_e1",
        source_kind: "state",
        source_key: "state_e1",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "最终回复",
      },
    ],
    artifacts: {},
  } as Partial<RunDetail> as RunDetail;

  const state = buildBuddyOutputTraceStateFromRunDetail(run, plan, graph);
  const segments = listBuddyOutputTraceSegmentsForDisplay(state, { visibleOutputNodeIds: new Set(["output_e1"]) });

  assert.equal(segments.length, 1);
  assert.equal(segments[0].segmentId, "boundary:node_final");
  assert.deepEqual(segments[0].records.map((record) => record.label), ["A", "能力选择结果", "动态能力", "最终回复判断"]);
});

test("listBuddyOutputTraceSegmentsForDisplay keeps merged running trace duration live", () => {
  const graph = fiveNodeGraph();
  graph.nodes.node_gate = {
    kind: "condition",
    name: "Capability gate",
    description: "",
    reads: [{ state: "state_b1", required: true }],
    writes: [],
    config: { branches: ["direct", "continue"], loopLimit: 5, branchMapping: {}, rule: null },
    ui: { position: { x: 0, y: 0 } },
  };
  graph.nodes.node_dynamic = {
    ...graph.nodes.node_c,
    name: "Dynamic capability",
  };
  graph.nodes.node_final = {
    kind: "condition",
    name: "Final gate",
    description: "",
    reads: [{ state: "state_e1", required: true }],
    writes: [],
    config: { branches: ["done"], loopLimit: 5, branchMapping: {}, rule: null },
    ui: { position: { x: 0, y: 0 } },
  };
  graph.edges = [
    { source: "node_a", target: "node_gate" },
    { source: "node_dynamic", target: "node_final" },
  ];
  graph.conditional_edges = [
    { source: "node_gate", branches: { direct: "output_b1", continue: "node_dynamic" } },
    { source: "node_final", branches: { done: "output_e1" } },
  ];

  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  let state = createBuddyOutputTraceRuntimeState(plan);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_a", node_type: "agent" }, 1000);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_a", node_type: "agent", duration_ms: 100 }, 1100);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_gate", node_type: "condition" }, 1200);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.completed", { node_id: "node_gate", node_type: "condition", duration_ms: 0 }, 1200);
  state = reduceBuddyOutputTraceEvent(state, plan, graph, "node.started", { node_id: "node_dynamic", node_type: "agent" }, 1300);

  const segments = listBuddyOutputTraceSegmentsForDisplay(state, { visibleOutputNodeIds: new Set(["output_e1"]) });

  assert.equal(segments.length, 1);
  assert.equal(segments[0].status, "running");
  assert.equal(segments[0].durationMs, null);
  assert.equal(segments[0].completedAtMs, null);
  assert.deepEqual(segments[0].records.map((record) => record.label), ["A", "Capability gate", "Dynamic capability"]);
});

test("buildBuddyOutputTraceStateFromRunDetail nests dynamic subgraph node executions below the selected ability", () => {
  const graph = fiveNodeGraph();
  graph.nodes.node_a.name = "动态能力";
  const plan = buildBuddyOutputTracePlan(graph, buildBuddyPublicOutputBindings(graph));
  const run = {
    status: "completed",
    node_executions: [
      {
        ...execution("node_a", "agent", "动态能力", "2026-05-13T10:00:00.000Z", 1000),
        artifacts: {
          inputs: {},
          outputs: {},
          family: "agent",
          state_reads: [],
          state_writes: [],
          capability_outputs: [
            {
              capability_key: "advanced_web_research_loop",
              capability_name: "高级联网搜索",
              subgraph: {
                name: "高级联网搜索",
                child_run_id: "run_research",
                node_executions: [
                  execution("plan_search", "agent", "规划搜索", "2026-05-13T10:00:00.100Z", 200),
                  execution("summarize_results", "agent", "整理结果", "2026-05-13T10:00:00.400Z", 300),
                ],
              },
            },
          ],
        },
      },
    ],
    artifacts: {
      activity_events: [
        {
          sequence: 1,
          kind: "subgraph_invocation",
          summary: "Subgraph advanced_web_research_loop completed.",
          node_id: "node_a",
          status: "succeeded",
          duration_ms: 1000,
          detail: {
            capability_key: "advanced_web_research_loop",
            capability_name: "高级联网搜索",
            child_run_id: "run_research",
            child_run_status: "completed",
          },
          created_at: "2026-05-13T10:00:01.000Z",
        },
      ],
    },
  } as Partial<RunDetail> as RunDetail;

  const state = buildBuddyOutputTraceStateFromRunDetail(run, plan, graph);
  const [segment] = listBuddyOutputTraceSegmentsForDisplay(state);

  assert.deepEqual(
    segment.records.map((record) => ({ label: record.label, treeDepth: record.treeDepth ?? 0 })),
    [
      { label: "动态能力", treeDepth: 0 },
      { label: "动态能力 / 高级联网搜索", treeDepth: 1 },
      { label: "动态能力 / 高级联网搜索 / plan search", treeDepth: 2 },
      { label: "动态能力 / 高级联网搜索 / summarize results", treeDepth: 2 },
    ],
  );
});

test("buildBuddyOutputTraceStateFromRunDetail hides abandoned output branches after a terminal run", () => {
  const graph = fiveNodeGraph();
  graph.edges = [
    { source: "node_a", target: "node_b" },
    { source: "node_b", target: "output_b1" },
    { source: "node_a", target: "node_c" },
    { source: "node_c", target: "node_e" },
    { source: "node_e", target: "output_e1" },
  ];
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
        node_id: "node_c",
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
        node_id: "node_e",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-13T10:00:01.000Z",
        finished_at: "2026-05-13T10:00:01.200Z",
        duration_ms: 200,
        input_summary: "",
        output_summary: "",
        artifacts: { inputs: {}, outputs: {}, family: "agent", state_reads: [], state_writes: [] },
        warnings: [],
        errors: [],
      },
    ],
    output_previews: [
      {
        node_id: "output_e1",
        source_kind: "state",
        source_key: "state_e1",
        display_mode: "markdown",
        persist_enabled: false,
        persist_format: "auto",
        value: "final answer",
      },
    ],
    artifacts: {},
  } as Partial<RunDetail> as RunDetail;

  const state = buildBuddyOutputTraceStateFromRunDetail(run, plan, graph);
  const segments = listBuddyOutputTraceSegmentsForDisplay(state);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].segmentId, "boundary:node_e");
  assert.deepEqual(segments[0].records.map((record) => record.label), ["C", "E"]);
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
