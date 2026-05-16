import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyDraftGraph } from "../../lib/graph-document.ts";
import type { GraphPayload } from "../../types/node-system.ts";
import { applyGraphEditPlaybackPlan, buildGraphEditPlaybackPlan } from "./graphEditPlaybackModel.ts";
import {
  buildGraphReplayIntentsFromTargetGraph,
  parseGraphReplayTargetJson,
} from "./graphReplayTargetModel.ts";

function targetGraph(): GraphPayload {
  return {
    graph_id: "saved_graph",
    name: "姓名问号图",
    state_schema: {
      name: {
        name: "姓名",
        description: "用户输入的姓名。",
        type: "text",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      input_name: {
        kind: "input",
        name: "input节点",
        description: "输入姓名。",
        ui: { position: { x: 120, y: 160 }, collapsed: false },
        reads: [],
        writes: [{ state: "name", mode: "replace" }],
        config: { value: "" },
      },
      ask_name: {
        kind: "agent",
        name: "LLM节点",
        description: "给姓名加问号。",
        ui: { position: { x: 360, y: 160 }, collapsed: false },
        reads: [{ state: "name", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "读取姓名，给这个姓名加问号。",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
      output_name: {
        kind: "output",
        name: "output节点",
        description: "输出姓名。",
        ui: { position: { x: 600, y: 160 }, collapsed: false },
        reads: [{ state: "name" }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "input_name", target: "ask_name" },
      { source: "ask_name", target: "output_name" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

test("buildGraphReplayIntentsFromTargetGraph compiles a target graph into replayable intents that preserve ids", () => {
  const result = buildGraphReplayIntentsFromTargetGraph(targetGraph());

  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    result.intentPackage.operations.map((operation) => operation.kind),
    [
      "create_node",
      "create_state",
      "bind_state",
      "create_node",
      "bind_state",
      "connect_nodes",
      "create_node",
      "bind_state",
      "connect_nodes",
    ],
  );
  assert.deepEqual(result.intentPackage.operations.map(operationLabel), [
    "input_name",
    "name",
    "input_name:name",
    "ask_name",
    "ask_name:name",
    "input_name:ask_name",
    "output_name",
    "output_name:name",
    "ask_name:output_name",
  ]);
  assert.deepEqual(
    result.intentPackage.operations
      .filter((operation) => operation.kind === "create_node")
      .map((operation) => ({ ref: operation.ref, position: operation.position })),
    [
      { ref: "input_name", position: { x: 350, y: 320 } },
      { ref: "ask_name", position: { x: 366, y: 305 } },
      { ref: "output_name", position: { x: 606, y: 194 } },
    ],
  );
  assert.deepEqual(result.intentPackage.operations[3], {
    kind: "create_node",
    ref: "ask_name",
    nodeId: "ask_name",
    nodeType: "agent",
    title: "LLM节点",
    description: "给姓名加问号。",
    taskInstruction: "读取姓名，给这个姓名加问号。",
    position: { x: 366, y: 305 },
    creationSource: { kind: "state", sourceNodeRef: "input_name", stateRef: "name" },
  });

  const plan = buildGraphEditPlaybackPlan(createEmptyDraftGraph(), result.intentPackage);
  const applied = applyGraphEditPlaybackPlan(createEmptyDraftGraph(), plan);

  assert.equal(plan.valid, true);
  assert.equal(applied.applied, true);
  assert.deepEqual(Object.keys(applied.document.state_schema), ["name"]);
  assert.deepEqual(Object.keys(applied.document.nodes), ["input_name", "ask_name", "output_name"]);
  assert.deepEqual(applied.document.nodes.input_name?.ui.position, targetGraph().nodes.input_name.ui.position);
  assert.deepEqual(applied.document.nodes.ask_name?.ui.position, targetGraph().nodes.ask_name.ui.position);
  assert.deepEqual(applied.document.nodes.output_name?.ui.position, targetGraph().nodes.output_name.ui.position);
  assert.equal(applied.document.nodes.ask_name?.kind, "agent");
  assert.equal(applied.document.nodes.ask_name?.config.taskInstruction, "读取姓名，给这个姓名加问号。");
  assert.deepEqual(applied.document.nodes.input_name?.writes, [{ state: "name", mode: "replace" }]);
  assert.deepEqual(applied.document.nodes.ask_name?.reads, [{ state: "name", required: true }]);
  assert.deepEqual(applied.document.edges, [
    { source: "input_name", target: "ask_name" },
    { source: "ask_name", target: "output_name" },
  ]);
});

test("buildGraphReplayIntentsFromTargetGraph handles cyclic flow graphs without replay recursion", () => {
  const graph = targetGraph();
  graph.nodes.output_name = {
    kind: "agent",
    name: "复核节点",
    description: "回到 LLM 节点继续复核。",
    ui: { position: { x: 600, y: 160 }, collapsed: false },
    reads: [{ state: "name" }],
    writes: [],
    config: {
      skillKey: "",
      taskInstruction: "复核姓名处理结果。",
      modelSource: "global",
      model: "",
      thinkingMode: "high",
      temperature: 0.2,
    },
  };
  graph.edges.push({ source: "output_name", target: "ask_name" });

  const result = buildGraphReplayIntentsFromTargetGraph(graph);
  const plan = buildGraphEditPlaybackPlan(createEmptyDraftGraph(), result.intentPackage);
  const applied = applyGraphEditPlaybackPlan(createEmptyDraftGraph(), plan);

  assert.equal(result.valid, true);
  assert.equal(plan.valid, true);
  assert.equal(applied.applied, true);
  assert.equal(result.intentPackage.operations.filter((operation) => operation.kind === "connect_nodes").length, 3);
  assert.deepEqual(applied.document.edges, [
    { source: "input_name", target: "ask_name" },
    { source: "ask_name", target: "output_name" },
    { source: "output_name", target: "ask_name" },
  ]);
});

test("buildGraphReplayIntentsFromTargetGraph handles multi-root joins without forward source-node references", () => {
  const graph = targetGraph();
  graph.state_schema.context = {
    name: "上下文",
    description: "第二个输入提供的上下文。",
    type: "markdown",
    value: "",
    color: "#0891b2",
  };
  graph.nodes.input_context = {
    kind: "input",
    name: "上下文输入",
    description: "输入上下文。",
    ui: { position: { x: 120, y: 300 }, collapsed: false },
    reads: [],
    writes: [{ state: "context", mode: "replace" }],
    config: { value: "" },
  };
  graph.nodes.ask_name = {
    ...graph.nodes.ask_name,
    reads: [
      { state: "name", required: true },
      { state: "context", required: true },
    ],
  };
  graph.edges = [
    { source: "input_name", target: "ask_name" },
    { source: "input_context", target: "ask_name" },
    { source: "ask_name", target: "output_name" },
  ];

  const result = buildGraphReplayIntentsFromTargetGraph(graph);
  const plan = buildGraphEditPlaybackPlan(createEmptyDraftGraph(), result.intentPackage);
  const applied = applyGraphEditPlaybackPlan(createEmptyDraftGraph(), plan);

  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.issues, []);
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.document.nodes.ask_name?.reads, [
    { state: "name", required: true },
    { state: "context", required: true },
  ]);
  assert.deepEqual(sortEdges(applied.document.edges), sortEdges(graph.edges));
});

test("buildGraphReplayIntentsFromTargetGraph replays condition routes from graph protocol conditional_edges", () => {
  const graph = targetGraph();
  graph.nodes.ask_name = {
    kind: "condition",
    name: "是否继续",
    description: "判断是否继续处理。",
    ui: { position: { x: 360, y: 160 }, collapsed: false },
    reads: [{ state: "name", required: true }],
    writes: [],
    config: {
      branches: ["true", "false", "exhausted"],
      loopLimit: 5,
      branchMapping: { true: "true", false: "false" },
      rule: { source: "$state.name", operator: "exists", value: true },
    },
  };
  graph.edges = [{ source: "input_name", target: "ask_name" }];
  graph.conditional_edges = [
    {
      source: "ask_name",
      branches: {
        true: "output_name",
        false: "output_name",
        exhausted: "output_name",
      },
    },
  ];

  const result = buildGraphReplayIntentsFromTargetGraph(graph);
  const plan = buildGraphEditPlaybackPlan(createEmptyDraftGraph(), result.intentPackage);
  const applied = applyGraphEditPlaybackPlan(createEmptyDraftGraph(), plan);

  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.intentPackage.operations.filter((operation) => operation.kind === "connect_route").length, 3);
  assert.equal(plan.valid, true);
  assert.equal(plan.graphCommands.filter((command) => command.kind === "connect_route").length, 3);
  assert.equal(
    plan.playbackSteps.some(
      (step) =>
        step.kind === "draw_flow_edge" &&
        step.target === "editor.canvas.anchor.ask_name:branch:true" &&
        step.endTarget === "editor.canvas.anchor.output_name:flow-in" &&
        step.sourceAnchorKind === "route-out",
    ),
    true,
  );
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.document.conditional_edges, graph.conditional_edges);
});

test("buildGraphReplayIntentsFromTargetGraph replays subgraph nodes and their outer ports", () => {
  const graph = targetGraph();
  graph.state_schema.answer = {
    name: "回答",
    description: "子图输出回答。",
    type: "markdown",
    value: "",
    color: "#16a34a",
  };
  graph.nodes.ask_name = {
    kind: "subgraph",
    name: "问答子图",
    description: "嵌入的问答流程。",
    ui: { position: { x: 360, y: 160 }, collapsed: false },
    reads: [{ state: "name", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      graph: {
        state_schema: {
          inner_question: {
            name: "内部问题",
            description: "",
            type: "text",
            value: "",
            color: "#2563eb",
          },
        },
        nodes: {},
        edges: [],
        conditional_edges: [],
        metadata: { role: "embedded_test" },
      },
    },
  };
  graph.nodes.output_name.reads = [{ state: "answer", required: true }];

  const result = buildGraphReplayIntentsFromTargetGraph(graph);
  const plan = buildGraphEditPlaybackPlan(createEmptyDraftGraph(), result.intentPackage);
  const applied = applyGraphEditPlaybackPlan(createEmptyDraftGraph(), plan);

  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.intentPackage.operations.some((operation) => operation.kind === "create_node" && operation.nodeType === "subgraph"), true);
  assert.equal(plan.valid, true);
  assert.equal(applied.applied, true);
  assert.equal(applied.document.nodes.ask_name?.kind, "subgraph");
  assert.deepEqual(applied.document.nodes.ask_name?.reads, [{ state: "name", required: true }]);
  assert.deepEqual(applied.document.nodes.ask_name?.writes, [{ state: "answer", mode: "replace" }]);
  assert.deepEqual(
    applied.document.nodes.ask_name?.kind === "subgraph" ? applied.document.nodes.ask_name.config.graph : null,
    graph.nodes.ask_name.kind === "subgraph" ? graph.nodes.ask_name.config.graph : null,
  );
  assert.deepEqual(applied.document.edges, [
    { source: "input_name", target: "ask_name" },
    { source: "ask_name", target: "output_name" },
  ]);
});

function operationLabel(operation: ReturnType<typeof buildGraphReplayIntentsFromTargetGraph>["intentPackage"]["operations"][number]) {
  if ("ref" in operation) {
    return operation.ref;
  }
  if (operation.kind === "bind_state") {
    return `${operation.nodeRef}:${operation.stateRef}`;
  }
  return `${operation.sourceRef}:${operation.targetRef}`;
}

function sortEdges(edges: GraphPayload["edges"]) {
  return [...edges].sort((left, right) => `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`));
}

test("buildGraphReplayIntentsFromTargetGraph reports invalid condition route sources without asking an LLM", () => {
  const graph = targetGraph();
  graph.conditional_edges = [{ source: "ask_name", branches: { true: "output_name" } }];

  const result = buildGraphReplayIntentsFromTargetGraph(graph);

  assert.equal(result.valid, true);
  assert.match(result.warnings.join("\n"), /condition route skipped because source is not a replayable condition node: ask_name/);
});

test("parseGraphReplayTargetJson accepts GraphPayload JSON and rejects incomplete JSON", () => {
  const parsed = parseGraphReplayTargetJson(JSON.stringify(targetGraph()));
  const invalid = parseGraphReplayTargetJson(JSON.stringify({ name: "Missing graph fields" }));

  assert.equal(parsed.graph?.name, "姓名问号图");
  assert.deepEqual(parsed.issues, []);
  assert.equal(invalid.graph, null);
  assert.match(invalid.issues.join("\n"), /nodes/);
});
