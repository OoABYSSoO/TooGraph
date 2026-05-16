import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "../../types/node-system.ts";
import {
  applyGraphEditPlaybackPlan,
  buildGraphEditPlaybackPlan,
  GRAPH_EDIT_PLAYBACK_CAPABILITY_MANUAL,
} from "./graphEditPlaybackModel.ts";

function emptyDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Playback Draft",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function documentWithExistingNodes(): GraphPayload {
  return {
    graph_id: null,
    name: "Existing Graph",
    state_schema: {},
    nodes: {
      input_1: {
        kind: "input",
        name: "输入",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: { value: "" },
      },
      agent_1: {
        kind: "agent",
        name: "旧分析节点",
        description: "",
        ui: { position: { x: 260, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "旧任务",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("buildGraphEditPlaybackPlan compiles graph intentions without exposing mouse choreography to the LLM", () => {
  const plan = buildGraphEditPlaybackPlan(emptyDocument(), {
    operations: [
      {
        kind: "create_node",
        ref: "analysis",
        nodeType: "agent",
        title: "分析用户问题",
        description: "读取用户输入并准备结构化分析。",
        taskInstruction: "分析用户问题，输出结构化要点。",
        positionHint: "after input",
      },
      {
        kind: "create_state",
        ref: "question",
        name: "用户问题",
        valueType: "text",
      },
      {
        kind: "bind_state",
        nodeRef: "analysis",
        stateRef: "question",
        mode: "read",
      },
    ],
  });

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.issues, []);
  assert.deepEqual(plan.graphCommands[0]?.kind === "create_node" ? plan.graphCommands[0].position : null, { x: 160, y: 120 });
  assert.deepEqual(plan.graphCommands.map((command) => command.kind), [
    "create_node",
    "create_state",
    "bind_state",
  ]);
  assert.equal(plan.graphCommands[0]?.nodeId, "agent_analysis");
  assert.equal(plan.graphCommands[1]?.stateKey, "state_question");
  assert.deepEqual(plan.playbackSteps.map((step) => step.kind), [
    "move_virtual_cursor",
    "open_node_creation_menu",
    "choose_node_type",
    "apply_graph_command",
    "focus_node_field",
    "type_node_field",
    "focus_node_field",
    "type_node_field",
    "focus_node_field",
    "type_node_field",
    "open_state_panel",
    "apply_graph_command",
    "highlight_state_field",
    "apply_graph_command",
    "highlight_node_port",
  ]);
  assert.equal(plan.playbackSteps.some((step) => JSON.stringify(step).includes("double_click")), false);
  assert.match(GRAPH_EDIT_PLAYBACK_CAPABILITY_MANUAL, /create_node/);
  assert.doesNotMatch(GRAPH_EDIT_PLAYBACK_CAPABILITY_MANUAL, /double-click|双击|CSS selector|坐标/i);
});

test("applyGraphEditPlaybackPlan applies semantic graph commands to the current document", () => {
  const plan = buildGraphEditPlaybackPlan(emptyDocument(), {
    operations: [
      {
        kind: "create_node",
        ref: "analysis",
        nodeType: "agent",
        title: "分析用户问题",
        description: "读取用户输入并准备结构化分析。",
        taskInstruction: "分析用户问题，输出结构化要点。",
      },
      {
        kind: "create_state",
        ref: "question",
        name: "用户问题",
        valueType: "text",
      },
      {
        kind: "bind_state",
        nodeRef: "analysis",
        stateRef: "question",
        mode: "read",
      },
    ],
  });

  const result = applyGraphEditPlaybackPlan(emptyDocument(), plan);

  assert.equal(result.applied, true);
  assert.equal(result.document.nodes.agent_analysis?.kind, "agent");
  assert.equal(result.document.nodes.agent_analysis?.name, "分析用户问题");
  assert.equal(result.document.nodes.agent_analysis?.description, "读取用户输入并准备结构化分析。");
  const analysisNode = result.document.nodes.agent_analysis;
  assert.equal(analysisNode?.kind === "agent" ? analysisNode.config.taskInstruction : "", "分析用户问题，输出结构化要点。");
  assert.equal(result.document.state_schema.state_question?.name, "用户问题");
  assert.equal(result.document.state_schema.state_question?.type, "text");
  assert.deepEqual(result.document.nodes.agent_analysis?.reads, [{ state: "state_question", required: false }]);
  assert.deepEqual(result.appliedCommands.map((command) => command.kind), [
    "create_node",
    "create_state",
    "bind_state",
  ]);
});

test("buildGraphEditPlaybackPlan reports unresolved references before any document mutation", () => {
  const plan = buildGraphEditPlaybackPlan(emptyDocument(), {
    operations: [
      {
        kind: "bind_state",
        nodeRef: "missing_node",
        stateRef: "missing_state",
        mode: "read",
      },
    ],
  });

  assert.equal(plan.valid, false);
  assert.deepEqual(plan.graphCommands, []);
  assert.match(plan.issues.join("\n"), /missing_node/);
  assert.match(plan.issues.join("\n"), /missing_state/);
  assert.equal(applyGraphEditPlaybackPlan(emptyDocument(), plan).applied, false);
});

test("graph edit playback supports updating and connecting existing graph nodes", () => {
  const document = documentWithExistingNodes();
  const plan = buildGraphEditPlaybackPlan(document, {
    operations: [
      {
        kind: "update_node",
        nodeRef: "agent_1",
        title: "分析用户问题",
        taskInstruction: "读取输入并输出行动建议。",
      },
      {
        kind: "connect_nodes",
        sourceRef: "input_1",
        targetRef: "agent_1",
      },
    ],
  });

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.graphCommands.map((command) => command.kind), ["update_node", "connect_nodes"]);
  assert.equal(plan.playbackSteps.some((step) => step.target === "agent_1.taskInstruction" && step.value === "读取输入并输出行动建议。"), true);

  const result = applyGraphEditPlaybackPlan(document, plan);

  assert.equal(result.applied, true);
  assert.equal(result.document.nodes.agent_1?.name, "分析用户问题");
  const agent = result.document.nodes.agent_1;
  assert.equal(agent?.kind === "agent" ? agent.config.taskInstruction : "", "读取输入并输出行动建议。");
  assert.deepEqual(result.document.edges, [{ source: "input_1", target: "agent_1" }]);
});
