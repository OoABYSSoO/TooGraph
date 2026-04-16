import test from "node:test";
import assert from "node:assert/strict";

import type { CanonicalGraphPayload } from "./node-system-canonical.ts";
import type { AgentNode, ConditionNode, InputBoundaryNode, OutputBoundaryNode, PortDefinition } from "./node-system-schema.ts";
import {
  addCanonicalNodeToGraph,
  addEditorNodeToCanonicalGraph,
  bindStateToCanonicalNode,
  buildCanonicalFlowProjectionFromEditorState,
  composeCanonicalGraphForSubmission,
  applyFlowProjectionToCanonicalGraph,
  deleteStateFromCanonicalGraph,
  removeStateFromCanonicalNode,
  renameCanonicalNodeDescription,
  renameCanonicalNodeName,
  renameStateKeyInCanonicalGraph,
  renameStateNameInCanonicalGraph,
  updateCanonicalReadBindingRequired,
  updateCanonicalNodeConfig,
  updateCanonicalNode,
  updateCanonicalInputNodeStateType,
  updateCanonicalInputNodeValue,
  replaceCanonicalNodeReadsFromPorts,
  replaceCanonicalNodeWritesFromPorts,
  upsertStateInCanonicalGraph,
} from "./node-system-canonical-write.ts";

test("renameStateKeyInCanonicalGraph renames state schema, node bindings, and edge handles together", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Rename State Test",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "What is GraphiteUI?",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Input Question",
        description: "",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "What is GraphiteUI?",
        },
      },
      output_answer: {
        kind: "output",
        name: "Output Answer",
        description: "",
        ui: {
          position: { x: 200, y: 0 },
          collapsed: false,
        },
        reads: [{ state: "question", required: true }],
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
      {
        source: "input_question",
        target: "output_answer",
        sourceHandle: "output:question",
        targetHandle: "input:question",
      },
    ],
    conditional_edges: [],
    metadata: {},
  };

  const next = renameStateKeyInCanonicalGraph(graph, "question", "user_question");

  assert.notEqual(next, graph);
  assert.equal(next.state_schema.question, undefined);
  assert.deepEqual(next.state_schema.user_question, {
    name: "Question",
    description: "User question",
    type: "text",
    value: "What is GraphiteUI?",
    color: "#d97706",
  });
  assert.deepEqual(next.nodes.input_question.writes, [{ state: "user_question", mode: "replace" }]);
  assert.deepEqual(next.nodes.output_answer.reads, [{ state: "user_question", required: true }]);
  assert.deepEqual(next.edges, [
    {
      source: "input_question",
      target: "output_answer",
      sourceHandle: "output:user_question",
      targetHandle: "input:user_question",
    },
  ]);
});

test("addEditorNodeToCanonicalGraph inserts a new canonical node from editor config", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Insert Node Test",
    state_schema: {
      summary: {
        name: "Summary",
        description: "Final summary",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = addEditorNodeToCanonicalGraph(graph, {
    id: "output_summary",
    position: { x: 420, y: 180 },
    data: {
      isExpanded: true,
      expandedSize: { width: 360, height: 240 },
      collapsedSize: null,
    },
  }, {
    presetId: "node.output.output_summary",
    family: "output",
    name: "Output Summary",
    description: "Show the workflow summary.",
    input: {
      key: "summary",
      label: "Summary",
      valueType: "text",
      required: true,
    },
    displayMode: "auto",
    persistEnabled: false,
    persistFormat: "auto",
    fileNameTemplate: "",
  });

  assert.notEqual(next, graph);
  assert.equal(next.nodes.output_summary.kind, "output");
  assert.equal(next.nodes.output_summary.name, "Output Summary");
  assert.deepEqual(next.nodes.output_summary.reads, [{ state: "summary", required: true }]);
  assert.deepEqual(next.nodes.output_summary.ui, {
    position: { x: 420, y: 180 },
    collapsed: false,
    expandedSize: { width: 360, height: 240 },
    collapsedSize: null,
  });
});

test("addCanonicalNodeToGraph inserts a canonical node directly without rebuilding from editor config", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Insert Canonical Node Test",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = addCanonicalNodeToGraph(graph, "agent_a", {
    kind: "agent",
    name: "Agent A",
    description: "",
    ui: {
      position: { x: 128, y: 96 },
      collapsed: false,
      expandedSize: { width: 360, height: 320 },
      collapsedSize: null,
    },
    reads: [],
    writes: [],
    config: {
      skills: [],
      systemInstruction: "",
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  });

  assert.notEqual(next, graph);
  assert.deepEqual(next.nodes.agent_a, {
    kind: "agent",
    name: "Agent A",
    description: "",
    ui: {
      position: { x: 128, y: 96 },
      collapsed: false,
      expandedSize: { width: 360, height: 320 },
      collapsedSize: null,
    },
    reads: [],
    writes: [],
    config: {
      skills: [],
      systemInstruction: "",
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  });
});

test("applyFlowProjectionToCanonicalGraph updates ui, removes missing nodes, and syncs edges", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Flow Projection Test",
    state_schema: {},
    nodes: {
      agent_a: {
        kind: "agent",
        name: "Agent A",
        description: "",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [],
        writes: [],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_b: {
        kind: "output",
        name: "Output B",
        description: "",
        ui: {
          position: { x: 280, y: 0 },
          collapsed: false,
        },
        reads: [],
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
      {
        source: "agent_a",
        target: "output_b",
        sourceHandle: "write:result",
        targetHandle: "read:result",
      },
    ],
    conditional_edges: [
      {
        source: "agent_a",
        branches: {
          done: "output_b",
        },
      },
    ],
    metadata: {},
  };

  const next = applyFlowProjectionToCanonicalGraph(graph, {
    nodes: {
      agent_a: {
        ...graph.nodes.agent_a,
        ui: {
          position: { x: 120, y: 96 },
          collapsed: true,
          expandedSize: { width: 420, height: 280 },
          collapsedSize: { width: 240, height: 120 },
        },
      },
    },
    edges: [],
    conditional_edges: [],
  });

  assert.notEqual(next, graph);
  assert.deepEqual(Object.keys(next.nodes), ["agent_a"]);
  assert.deepEqual(next.nodes.agent_a.ui, {
    position: { x: 120, y: 96 },
    collapsed: true,
    expandedSize: { width: 420, height: 280 },
    collapsedSize: { width: 240, height: 120 },
  });
  assert.deepEqual(next.edges, []);
  assert.deepEqual(next.conditional_edges, []);
});

test("buildCanonicalFlowProjectionFromEditorState prefers canonical graph semantics over stale node config mirrors", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Projection Source of Truth Test",
    state_schema: {
      question: {
        name: "Question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Input Question",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      condition_route: {
        kind: "condition",
        name: "Condition Route",
        description: "",
        ui: { position: { x: 220, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          branches: ["done"],
          conditionMode: "rule",
          branchMapping: {},
          rule: {
            source: "question",
            operator: "exists",
            value: null,
          },
        },
      },
      output_answer: {
        kind: "output",
        name: "Output Answer",
        description: "",
        ui: { position: { x: 480, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const projection = buildCanonicalFlowProjectionFromEditorState(
    [
      {
        id: "input_question",
        position: { x: 0, y: 0 },
        data: {
          isExpanded: true,
          expandedSize: { width: 320, height: 240 },
          collapsedSize: null,
          config: {
            presetId: "node.input.input_question",
            family: "input",
            name: "Input Question",
            description: "",
            valueType: "text",
            output: {
              key: "legacy_question",
              label: "Legacy Question",
              valueType: "text",
            },
            value: "",
          },
        },
      },
      {
        id: "condition_route",
        position: { x: 220, y: 0 },
        data: {
          isExpanded: true,
          expandedSize: null,
          collapsedSize: null,
          config: {
            presetId: "node.condition.condition_route",
            family: "condition",
            name: "Condition Route",
            description: "",
            inputs: [
              {
                key: "legacy_question",
                label: "Legacy Question",
                valueType: "text",
                required: true,
              },
            ],
            branches: [
              {
                key: "done",
                label: "",
              },
            ],
            conditionMode: "rule",
            branchMapping: {},
            rule: {
              source: "question",
              operator: "exists",
              value: null,
            },
          },
        },
      },
      {
        id: "output_answer",
        position: { x: 480, y: 0 },
        data: {
          isExpanded: true,
          expandedSize: null,
          collapsedSize: null,
          config: {
            presetId: "node.output.output_answer",
            family: "output",
            name: "Output Answer",
            description: "",
            input: {
              key: "legacy_question",
              label: "Legacy Question",
              valueType: "text",
              required: true,
            },
            displayMode: "auto",
            persistEnabled: false,
            persistFormat: "auto",
            fileNameTemplate: "",
          },
        },
      },
    ],
    graph,
    [
      {
        source: "input_question",
        target: "condition_route",
        sourceHandle: "output:legacy_question",
        targetHandle: "input:legacy_question",
      },
      {
        source: "condition_route",
        target: "output_answer",
        sourceHandle: "output:done",
        targetHandle: "input:legacy_question",
      },
    ],
  );

  assert.deepEqual(projection.edges, [
    {
      source: "input_question",
      target: "condition_route",
      sourceHandle: "write:question",
      targetHandle: "read:question",
    },
  ]);
  assert.deepEqual(projection.conditional_edges, [
    {
      source: "condition_route",
      branches: {
        done: "output_answer",
      },
    },
  ]);
  assert.equal(projection.nodes.output_answer.kind, "output");
  assert.deepEqual(projection.nodes.output_answer.ui.position, { x: 480, y: 0 });
});

test("upsertStateInCanonicalGraph creates or updates a canonical state definition", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "State Upsert Test",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = upsertStateInCanonicalGraph(graph, "question", {
    name: "Question",
    description: "User question",
    type: "text",
    value: "",
    color: "#d97706",
  });

  assert.notEqual(next, graph);
  assert.deepEqual(next.state_schema.question, {
    name: "Question",
    description: "User question",
    type: "text",
    value: "",
    color: "#d97706",
  });
});

test("renameStateNameInCanonicalGraph updates only the state display name", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "State Rename Test",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = renameStateNameInCanonicalGraph(graph, "question", "User Question");

  assert.notEqual(next, graph);
  assert.deepEqual(next.state_schema.question, {
    name: "User Question",
    description: "User question",
    type: "text",
    value: "",
    color: "#d97706",
  });
});

test("deleteStateFromCanonicalGraph removes state definition and related node bindings", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "State Delete Test",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Input Question",
        description: "",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
      output_question: {
        kind: "output",
        name: "Output Question",
        description: "",
        ui: {
          position: { x: 240, y: 0 },
          collapsed: false,
        },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = deleteStateFromCanonicalGraph(graph, "question");

  assert.notEqual(next, graph);
  assert.equal(next.state_schema.question, undefined);
  assert.deepEqual(next.nodes.input_question.writes, []);
  assert.deepEqual(next.nodes.output_question.reads, []);
});

test("bindStateToCanonicalNode appends agent reads and replaces boundary bindings directly on canonical nodes", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Bind State Test",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "",
        color: "#d97706",
      },
      answer: {
        name: "Answer",
        description: "Assistant answer",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "Answer Helper",
        description: "",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [],
        writes: [],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      input_value: {
        kind: "input",
        name: "Input Value",
        description: "",
        ui: {
          position: { x: 240, y: 0 },
          collapsed: false,
        },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
      output_value: {
        kind: "output",
        name: "Output Value",
        description: "",
        ui: {
          position: { x: 480, y: 0 },
          collapsed: false,
        },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextWithAgentRead = bindStateToCanonicalNode(graph, "answer_helper", "input", "question");
  assert.deepEqual(nextWithAgentRead.nodes.answer_helper.reads, [{ state: "question", required: false }]);

  const nextWithInputWrite = bindStateToCanonicalNode(nextWithAgentRead, "input_value", "output", "answer");
  assert.deepEqual(nextWithInputWrite.nodes.input_value.writes, [{ state: "answer", mode: "replace" }]);

  const nextWithOutputRead = bindStateToCanonicalNode(nextWithInputWrite, "output_value", "input", "answer");
  assert.deepEqual(nextWithOutputRead.nodes.output_value.reads, [{ state: "answer", required: true }]);
});

test("removeStateFromCanonicalNode removes canonical reads and writes without touching other bindings", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Remove State Binding Test",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "",
        color: "#d97706",
      },
      answer: {
        name: "Answer",
        description: "Assistant answer",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "Answer Helper",
        description: "",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [
          { state: "question", required: false },
          { state: "answer", required: false },
        ],
        writes: [
          { state: "question", mode: "replace" },
          { state: "answer", mode: "replace" },
        ],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const withoutRead = removeStateFromCanonicalNode(graph, "answer_helper", "input", "answer");
  assert.deepEqual(withoutRead.nodes.answer_helper.reads, [{ state: "question", required: false }]);
  assert.deepEqual(withoutRead.nodes.answer_helper.writes, [
    { state: "question", mode: "replace" },
    { state: "answer", mode: "replace" },
  ]);

  const withoutWrite = removeStateFromCanonicalNode(withoutRead, "answer_helper", "output", "answer");
  assert.deepEqual(withoutWrite.nodes.answer_helper.reads, [{ state: "question", required: false }]);
  assert.deepEqual(withoutWrite.nodes.answer_helper.writes, [{ state: "question", mode: "replace" }]);
});

test("composeCanonicalGraphForSubmission keeps canonical node content while taking projected ui and edge structure", () => {
  const current: CanonicalGraphPayload = {
    graph_id: "graph_saved",
    name: "Current Graph",
    state_schema: {
      answer: {
        name: "Answer",
        description: "Final answer",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      agent_a: {
        kind: "agent",
        name: "Agent A",
        description: "Canonical description",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [{ state: "answer", required: false }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: ["search_knowledge_base"],
          systemInstruction: "system",
          taskInstruction: "task",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      foo: "bar",
    },
  };

  const projection = {
    nodes: {
      agent_a: {
        ...current.nodes.agent_a,
        ui: {
          position: { x: 320, y: 128 },
          collapsed: true,
        },
      },
    },
    edges: [
      {
        source: "agent_a",
        target: "agent_a",
        sourceHandle: "write:answer",
        targetHandle: "read:answer",
      },
    ],
    conditional_edges: [],
  } satisfies Pick<CanonicalGraphPayload, "nodes" | "edges" | "conditional_edges">;

  const next = composeCanonicalGraphForSubmission(current, projection);

  assert.equal(next.graph_id, "graph_saved");
  assert.equal(next.name, "Current Graph");
  assert.deepEqual(next.metadata, { foo: "bar" });
  assert.deepEqual(next.edges, projection.edges);
  assert.equal(next.nodes.agent_a.kind, "agent");
  assert.deepEqual(next.nodes.agent_a.config.skills, ["search_knowledge_base"]);
  assert.equal(next.nodes.agent_a.description, "Canonical description");
  assert.deepEqual(next.nodes.agent_a.ui, {
    position: { x: 320, y: 128 },
    collapsed: true,
  });
});

test("composeCanonicalGraphForSubmission keeps input node config values aligned with state schema defaults", () => {
  const current: CanonicalGraphPayload = {
    graph_id: "graph_saved",
    name: "Current Graph",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "value from state schema",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Input Question",
        description: "",
        ui: {
          position: { x: 40, y: 60 },
          collapsed: false,
        },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "stale node config value",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const projection = {
    nodes: {
      input_question: {
        ...current.nodes.input_question,
        ui: {
          position: { x: 90, y: 120 },
          collapsed: false,
        },
      },
    },
    edges: [],
    conditional_edges: [],
  } satisfies Pick<CanonicalGraphPayload, "nodes" | "edges" | "conditional_edges">;

  const next = composeCanonicalGraphForSubmission(current, projection);

  assert.equal(next.nodes.input_question.kind, "input");
  if (next.nodes.input_question.kind !== "input") {
    assert.fail("expected input node");
  }
  assert.equal(next.nodes.input_question.config.value, "value from state schema");
  assert.deepEqual(next.nodes.input_question.ui, {
    position: { x: 90, y: 120 },
    collapsed: false,
  });
});

test("renameCanonicalNodeName updates only the targeted canonical node name", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Node Metadata Graph",
    state_schema: {},
    nodes: {
      alpha: {
        kind: "input",
        name: "Alpha",
        description: "Alpha node",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: { value: "" },
      },
      beta: {
        kind: "output",
        name: "Beta",
        description: "Beta node",
        ui: { position: { x: 100, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = renameCanonicalNodeName(graph, "beta", "Renamed Beta");

  assert.equal(next.nodes.beta.name, "Renamed Beta");
  assert.equal(next.nodes.alpha.name, "Alpha");
});

test("renameCanonicalNodeDescription trims and updates only the targeted canonical node description", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Node Metadata Graph",
    state_schema: {},
    nodes: {
      alpha: {
        kind: "input",
        name: "Alpha",
        description: "Alpha node",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: { value: "" },
      },
      beta: {
        kind: "output",
        name: "Beta",
        description: "Beta node",
        ui: { position: { x: 100, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = renameCanonicalNodeDescription(graph, "beta", "  Updated beta description  ");

  assert.equal(next.nodes.beta.description, "Updated beta description");
  assert.equal(next.nodes.alpha.description, "Alpha node");
});

test("updateCanonicalInputNodeValue keeps the input node value and bound state default in sync", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Input Graph",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "old",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Input Question",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "old" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = updateCanonicalInputNodeValue(graph, "input_question", "new question");

  const inputNode = next.nodes.input_question;
  assert.equal(inputNode.kind, "input");
  if (inputNode.kind !== "input") {
    assert.fail("expected input node");
  }
  assert.equal(inputNode.config.value, "new question");
  assert.equal(next.state_schema.question.value, "new question");
});

test("updateCanonicalInputNodeStateType updates the bound state type for input nodes", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Input Graph",
    state_schema: {
      question: {
        name: "Question",
        description: "User question",
        type: "text",
        value: "old",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Input Question",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "old" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = updateCanonicalInputNodeStateType(graph, "input_question", "json");

  assert.equal(next.state_schema.question.type, "json");
  const inputNode = next.nodes.input_question;
  assert.equal(inputNode.kind, "input");
  if (inputNode.kind !== "input") {
    assert.fail("expected input node");
  }
  assert.equal(inputNode.config.value, "old");
});

test("updateCanonicalNode updates canonical node config without touching other nodes", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Node Update Graph",
    state_schema: {},
    nodes: {
      output_answer: {
        kind: "output",
        name: "Output Answer",
        description: "Show answer",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
      output_other: {
        kind: "output",
        name: "Output Other",
        description: "Other output",
        ui: { position: { x: 120, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          displayMode: "plain",
          persistEnabled: true,
          persistFormat: "txt",
          fileNameTemplate: "other.txt",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = updateCanonicalNode(graph, "output_answer", (node) => {
    if (node.kind !== "output") {
      return node;
    }

    return {
      ...node,
      config: {
        ...node.config,
        displayMode: "json",
        persistEnabled: true,
      },
    };
  });

  assert.equal(next.nodes.output_answer.kind, "output");
  if (next.nodes.output_answer.kind !== "output") {
    assert.fail("expected output node");
  }
  assert.equal(next.nodes.output_answer.config.displayMode, "json");
  assert.equal(next.nodes.output_answer.config.persistEnabled, true);
  assert.equal(next.nodes.output_other.kind, "output");
  if (next.nodes.output_other.kind !== "output") {
    assert.fail("expected output node");
  }
  assert.equal(next.nodes.output_other.config.displayMode, "plain");
  assert.equal(next.nodes.output_other.config.persistEnabled, true);
});

test("updateCanonicalNodeConfig updates agent config fields without touching other nodes", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Agent Config Graph",
    state_schema: {},
    nodes: {
      onboarding_helper: {
        kind: "agent",
        name: "Onboarding Helper",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "Output Answer",
        description: "",
        ui: { position: { x: 120, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = updateCanonicalNodeConfig(graph, "onboarding_helper", (node) => {
    if (node.kind !== "agent") {
      return node.config;
    }

    return {
      ...node.config,
      skills: ["search_knowledge_base"],
      taskInstruction: "Answer the user with the current context.",
      temperature: 0.7,
    };
  });

  assert.equal(next.nodes.onboarding_helper.kind, "agent");
  if (next.nodes.onboarding_helper.kind !== "agent") {
    assert.fail("expected agent node");
  }
  assert.deepEqual(next.nodes.onboarding_helper.config.skills, ["search_knowledge_base"]);
  assert.equal(next.nodes.onboarding_helper.config.taskInstruction, "Answer the user with the current context.");
  assert.equal(next.nodes.onboarding_helper.config.temperature, 0.7);
  assert.equal(next.nodes.output_answer.kind, "output");
  if (next.nodes.output_answer.kind !== "output") {
    assert.fail("expected output node");
  }
  assert.equal(next.nodes.output_answer.config.displayMode, "auto");
});

test("updateCanonicalNodeConfig updates condition and output config fields in place", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Condition Output Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "Route Result",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          branches: ["done"],
          conditionMode: "rule",
          branchMapping: {},
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      output_answer: {
        kind: "output",
        name: "Output Answer",
        description: "",
        ui: { position: { x: 120, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const withCondition = updateCanonicalNodeConfig(graph, "route_result", (node) => {
    if (node.kind !== "condition") {
      return node.config;
    }

    return {
      ...node.config,
      branches: ["approved", "rejected"],
      conditionMode: "cycle",
      branchMapping: {
        approved: "output_answer",
      },
      rule: {
        source: "answer",
        operator: "==",
        value: "ok",
      } satisfies ConditionNode["rule"],
    };
  });

  const next = updateCanonicalNodeConfig(withCondition, "output_answer", (node) => {
    if (node.kind !== "output") {
      return node.config;
    }

    return {
      ...node.config,
      displayMode: "markdown",
      persistEnabled: true,
      persistFormat: "md",
      fileNameTemplate: "answer.md",
    };
  });

  assert.equal(next.nodes.route_result.kind, "condition");
  if (next.nodes.route_result.kind !== "condition") {
    assert.fail("expected condition node");
  }
  assert.deepEqual(next.nodes.route_result.config.branches, ["approved", "rejected"]);
  assert.equal(next.nodes.route_result.config.conditionMode, "cycle");
  assert.deepEqual(next.nodes.route_result.config.branchMapping, { approved: "output_answer" });
  assert.deepEqual(next.nodes.route_result.config.rule, {
    source: "answer",
    operator: "==",
    value: "ok",
  });

  assert.equal(next.nodes.output_answer.kind, "output");
  if (next.nodes.output_answer.kind !== "output") {
    assert.fail("expected output node");
  }
  assert.equal(next.nodes.output_answer.config.displayMode, "markdown");
  assert.equal(next.nodes.output_answer.config.persistEnabled, true);
  assert.equal(next.nodes.output_answer.config.persistFormat, "md");
  assert.equal(next.nodes.output_answer.config.fileNameTemplate, "answer.md");
});

test("updateCanonicalReadBindingRequired updates only the targeted read binding", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Read Binding Graph",
    state_schema: {
      question: {
        name: "Question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
      context: {
        name: "Context",
        description: "",
        type: "text",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "Answer Helper",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [
          { state: "question", required: false },
          { state: "context", required: true },
        ],
        writes: [],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = updateCanonicalReadBindingRequired(graph, "answer_helper", "question", true);

  assert.equal(next.nodes.answer_helper.kind, "agent");
  if (next.nodes.answer_helper.kind !== "agent") {
    assert.fail("expected agent node");
  }
  assert.deepEqual(next.nodes.answer_helper.reads, [
    { state: "question", required: true },
    { state: "context", required: true },
  ]);
});

test("replaceCanonicalNodeReadsFromPorts rewrites reads and upserts missing states from port definitions", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Replace Reads Graph",
    state_schema: {
      question: {
        name: "Question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "Answer Helper",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [{ state: "question", required: false }],
        writes: [],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextPorts: PortDefinition[] = [
    { key: "question", label: "User Question", valueType: "text", required: true },
    { key: "context_blob", label: "Context Blob", valueType: "json", required: false },
  ];

  const next = replaceCanonicalNodeReadsFromPorts(graph, "answer_helper", nextPorts);

  assert.deepEqual(next.nodes.answer_helper.reads, [
    { state: "question", required: true },
    { state: "context_blob", required: false },
  ]);
  assert.deepEqual(next.state_schema.question, {
    name: "User Question",
    description: "",
    type: "text",
    value: "",
    color: "#d97706",
  });
  assert.deepEqual(next.state_schema.context_blob, {
    name: "Context Blob",
    description: "",
    type: "json",
    value: {},
    color: "",
  });
});

test("replaceCanonicalNodeWritesFromPorts rewrites writes and upserts missing output states", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: null,
    name: "Replace Writes Graph",
    state_schema: {
      answer: {
        name: "Answer",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "Answer Helper",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextPorts: PortDefinition[] = [
    { key: "answer", label: "Final Answer", valueType: "text" },
    { key: "supporting_image", label: "Supporting Image", valueType: "image" },
  ];

  const next = replaceCanonicalNodeWritesFromPorts(graph, "answer_helper", nextPorts);

  assert.deepEqual(next.nodes.answer_helper.writes, [
    { state: "answer", mode: "replace" },
    { state: "supporting_image", mode: "replace" },
  ]);
  assert.deepEqual(next.state_schema.answer, {
    name: "Final Answer",
    description: "",
    type: "text",
    value: "",
    color: "#d97706",
  });
  assert.deepEqual(next.state_schema.supporting_image, {
    name: "Supporting Image",
    description: "",
    type: "image",
    value: "",
    color: "",
  });
});
