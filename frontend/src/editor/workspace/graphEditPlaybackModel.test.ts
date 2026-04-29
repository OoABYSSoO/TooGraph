import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "../../types/node-system.ts";
import {
  applyGraphEditCommandToDocument,
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
  assert.deepEqual(plan.graphCommands[0]?.kind === "create_node" ? plan.graphCommands[0].position : null, { x: 390, y: 300 });
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
    "focus_node_field",
    "type_node_field",
    "focus_node_field",
    "type_node_field",
    "focus_node_field",
    "type_node_field",
    "open_state_panel",
    "apply_graph_command",
    "highlight_state_field",
    "highlight_node_port",
  ]);
  assert.equal(plan.playbackSteps.some((step) => JSON.stringify(step).includes("double_click")), false);
  assert.match(GRAPH_EDIT_PLAYBACK_CAPABILITY_MANUAL, /create_node/);
  assert.doesNotMatch(GRAPH_EDIT_PLAYBACK_CAPABILITY_MANUAL, /double-click|双击|CSS selector|坐标/i);
});

test("buildGraphEditPlaybackPlan targets precise editor affordances for human-like replay", () => {
  const plan = buildGraphEditPlaybackPlan(emptyDocument(), {
    operations: [
      {
        kind: "create_node",
        ref: "input_name",
        nodeId: "input_name",
        nodeType: "input",
        title: "input节点",
        description: "输入姓名。",
        position: { x: 120, y: 160 },
      },
      {
        kind: "create_state",
        ref: "name",
        stateKey: "name",
        name: "姓名",
        valueType: "text",
        nodeRef: "input_name",
        bindingMode: "write",
      },
      {
        kind: "bind_state",
        nodeRef: "input_name",
        stateRef: "name",
        mode: "write",
      },
      {
        kind: "create_node",
        ref: "ask_name",
        nodeId: "ask_name",
        nodeType: "agent",
        title: "LLM节点",
        description: "给姓名加问号。",
        taskInstruction: "读取姓名，给这个姓名加问号。",
        position: { x: 360, y: 160 },
        creationSource: { kind: "state", sourceNodeRef: "input_name", stateRef: "name" },
      },
      {
        kind: "bind_state",
        nodeRef: "ask_name",
        stateRef: "name",
        mode: "read",
        required: true,
        sourceNodeRef: "input_name",
      },
    ],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.playbackSteps.find((step) => step.kind === "choose_node_type" && step.target === "editor.nodeType.input")?.commandId, "graph-command-1");
  assert.equal(plan.playbackSteps.find((step) => step.kind === "choose_node_type" && step.target === "editor.nodeType.input")?.nodeId, "input_name");
  assert.equal(plan.playbackSteps.find((step) => step.kind === "choose_node_type" && step.target === "editor.nodeType.agent")?.commandId, "graph-command-4");
  assert.equal(plan.playbackSteps.find((step) => step.kind === "choose_node_type" && step.target === "editor.nodeType.agent")?.nodeId, "ask_name");
  assert.deepEqual(plan.playbackSteps.find((step) => step.kind === "choose_node_type" && step.target === "editor.nodeType.agent")?.commandIds, [
    "graph-command-4",
    "graph-command-5",
  ]);
  assert.deepEqual(
    plan.playbackSteps.map((step) => [step.kind, step.target]),
    [
      ["move_virtual_cursor", "editor.canvas.empty.createFirstNode"],
      ["open_node_creation_menu", "editor.canvas.empty.createFirstNode"],
      ["choose_node_type", "editor.nodeType.input"],
      ["focus_node_field", "editor.canvas.node.input_name.title"],
      ["type_node_field", "editor.canvas.node.input_name.title"],
      ["focus_node_field", "editor.canvas.node.input_name.description"],
      ["type_node_field", "editor.canvas.node.input_name.description"],
      ["open_state_panel", "editor.canvas.node.input_name.port.output.create"],
      ["type_state_field", "editor.canvas.node.input_name.port.output.create.name"],
      ["commit_state_field", "editor.canvas.node.input_name.port.output.create.create"],
      ["highlight_node_port", "editor.canvas.node.input_name.port.output.name"],
      ["drag_state_edge_to_canvas", "editor.canvas.anchor.input_name:state-out:name"],
      ["open_node_creation_menu", "editor.canvas.surface"],
      ["choose_node_type", "editor.nodeType.agent"],
      ["highlight_node_port", "editor.canvas.node.ask_name.port.input.name"],
      ["focus_node_field", "editor.canvas.node.ask_name.title"],
      ["type_node_field", "editor.canvas.node.ask_name.title"],
      ["focus_node_field", "editor.canvas.node.ask_name.description"],
      ["type_node_field", "editor.canvas.node.ask_name.description"],
      ["focus_node_field", "editor.canvas.node.ask_name.taskInstruction"],
      ["type_node_field", "editor.canvas.node.ask_name.taskInstruction"],
    ],
  );
  const stateDragStep = plan.playbackSteps.find((step) => step.kind === "drag_state_edge_to_canvas");
  assert.equal(stateDragStep?.endTarget, "editor.canvas.surface");
  const bindIndex = plan.playbackSteps.findIndex((step) => step.commandIds?.includes("graph-command-5"));
  const editAgentTitleIndex = plan.playbackSteps.findIndex((step) => step.kind === "focus_node_field" && step.target === "editor.canvas.node.ask_name.title");
  assert.ok(bindIndex > -1 && editAgentTitleIndex > -1 && bindIndex < editAgentTitleIndex);
  const stateCommitStep = plan.playbackSteps.find((step) => step.kind === "commit_state_field" && step.target === "editor.canvas.node.input_name.port.output.create.create");
  assert.deepEqual(stateCommitStep?.commandIds, ["graph-command-2", "graph-command-3"]);
  assert.equal(stateCommitStep?.stateKey, "name");
  assert.equal(stateCommitStep?.nodeId, "input_name");
  assert.equal(plan.playbackSteps.some((step) => step.kind === "apply_graph_command" && step.commandId === "graph-command-2"), false);
  assert.equal(plan.playbackSteps.some((step) => step.kind === "apply_graph_command" && step.commandId === "graph-command-3"), false);
  assert.equal(plan.playbackSteps.some((step) => step.kind === "apply_graph_command" && step.commandId === "graph-command-5"), false);
});

test("buildGraphEditPlaybackPlan includes edge endpoints so replay can skip existing connections", () => {
  const plan = buildGraphEditPlaybackPlan(emptyDocument(), {
    operations: [
      {
        kind: "create_node",
        ref: "input_name",
        nodeId: "input_name",
        nodeType: "input",
        title: "input节点",
      },
      {
        kind: "create_state",
        ref: "name",
        stateKey: "name",
        name: "姓名",
        valueType: "text",
        nodeRef: "input_name",
        bindingMode: "write",
      },
      {
        kind: "bind_state",
        nodeRef: "input_name",
        stateRef: "name",
        mode: "write",
      },
      {
        kind: "create_node",
        ref: "ask_name",
        nodeId: "ask_name",
        nodeType: "agent",
        title: "LLM节点",
      },
      {
        kind: "bind_state",
        nodeRef: "ask_name",
        stateRef: "name",
        mode: "read",
        sourceNodeRef: "input_name",
      },
      {
        kind: "connect_nodes",
        sourceRef: "input_name",
        targetRef: "ask_name",
      },
    ],
  });

  assert.equal(plan.valid, true);

  const dataEdgeStep = plan.playbackSteps.find((step) => step.kind === "drag_state_edge_to_node");
  assert.equal(dataEdgeStep?.sourceNodeId, "input_name");
  assert.equal(dataEdgeStep?.sourceStateKey, "name");
  assert.equal(dataEdgeStep?.nodeId, "ask_name");
  assert.equal(dataEdgeStep?.stateKey, "name");

  const flowEdgeStep = plan.playbackSteps.find((step) => step.kind === "draw_flow_edge" && step.endTarget === "editor.canvas.anchor.ask_name:flow-in");
  assert.equal(flowEdgeStep?.sourceNodeId, "input_name");
  assert.equal(flowEdgeStep?.nodeId, "ask_name");
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

test("applyGraphEditCommandToDocument applies one playback command at a time", () => {
  const plan = buildGraphEditPlaybackPlan(emptyDocument(), {
    operations: [
      {
        kind: "create_node",
        ref: "name_input",
        nodeType: "input",
        title: "input节点",
        description: "输入姓名。",
      },
      {
        kind: "create_state",
        ref: "name",
        name: "姓名",
        valueType: "text",
      },
      {
        kind: "bind_state",
        nodeRef: "name_input",
        stateRef: "name",
        mode: "write",
      },
    ],
  });

  const afterNode = applyGraphEditCommandToDocument(emptyDocument(), plan.graphCommands[0]!);
  const afterState = applyGraphEditCommandToDocument(afterNode, plan.graphCommands[1]!);
  const afterBinding = applyGraphEditCommandToDocument(afterState, plan.graphCommands[2]!);

  assert.equal(afterNode.nodes.input_name_input?.kind, "input");
  assert.equal(afterNode.state_schema.state_name, undefined);
  assert.equal(afterState.state_schema.state_name?.name, "姓名");
  assert.deepEqual(afterBinding.nodes.input_name_input?.writes, [{ state: "state_name", mode: "replace" }]);
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
  assert.equal(plan.playbackSteps.some((step) => step.target === "editor.canvas.node.agent_1.taskInstruction" && step.value === "读取输入并输出行动建议。"), true);

  const result = applyGraphEditPlaybackPlan(document, plan);

  assert.equal(result.applied, true);
  assert.equal(result.document.nodes.agent_1?.name, "分析用户问题");
  const agent = result.document.nodes.agent_1;
  assert.equal(agent?.kind === "agent" ? agent.config.taskInstruction : "", "读取输入并输出行动建议。");
  assert.deepEqual(result.document.edges, [{ source: "input_1", target: "agent_1" }]);
});
