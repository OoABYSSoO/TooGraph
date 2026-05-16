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
      "create_state",
      "create_node",
      "create_node",
      "create_node",
      "bind_state",
      "bind_state",
      "bind_state",
      "connect_nodes",
      "connect_nodes",
    ],
  );

  const plan = buildGraphEditPlaybackPlan(createEmptyDraftGraph(), result.intentPackage);
  const applied = applyGraphEditPlaybackPlan(createEmptyDraftGraph(), plan);

  assert.equal(plan.valid, true);
  assert.equal(applied.applied, true);
  assert.deepEqual(Object.keys(applied.document.state_schema), ["name"]);
  assert.deepEqual(Object.keys(applied.document.nodes), ["input_name", "ask_name", "output_name"]);
  assert.equal(applied.document.nodes.ask_name?.kind, "agent");
  assert.equal(applied.document.nodes.ask_name?.config.taskInstruction, "读取姓名，给这个姓名加问号。");
  assert.deepEqual(applied.document.nodes.input_name?.writes, [{ state: "name", mode: "replace" }]);
  assert.deepEqual(applied.document.nodes.ask_name?.reads, [{ state: "name", required: true }]);
  assert.deepEqual(applied.document.edges, [
    { source: "input_name", target: "ask_name" },
    { source: "ask_name", target: "output_name" },
  ]);
});

test("buildGraphReplayIntentsFromTargetGraph reports unsupported graph features without asking an LLM", () => {
  const graph = targetGraph();
  graph.nodes.subflow = {
    kind: "subgraph",
    name: "子图",
    description: "",
    ui: { position: { x: 0, y: 0 } },
    reads: [],
    writes: [],
    config: {
      graph: {
        state_schema: {},
        nodes: {},
        edges: [],
        conditional_edges: [],
        metadata: {},
      },
    },
  };
  graph.conditional_edges = [{ source: "ask_name", branches: { true: "output_name" } }];

  const result = buildGraphReplayIntentsFromTargetGraph(graph);

  assert.equal(result.valid, true);
  assert.match(result.warnings.join("\n"), /subgraph nodes are not replayable yet: subflow/);
  assert.match(result.warnings.join("\n"), /conditional edges are not replayable yet/);
  assert.equal(result.intentPackage.operations.some((operation) => operation.kind === "create_node" && operation.ref === "subflow"), false);
});

test("parseGraphReplayTargetJson accepts GraphPayload JSON and rejects incomplete JSON", () => {
  const parsed = parseGraphReplayTargetJson(JSON.stringify(targetGraph()));
  const invalid = parseGraphReplayTargetJson(JSON.stringify({ name: "Missing graph fields" }));

  assert.equal(parsed.graph?.name, "姓名问号图");
  assert.deepEqual(parsed.issues, []);
  assert.equal(invalid.graph, null);
  assert.match(invalid.issues.join("\n"), /nodes/);
});
