import test from "node:test";
import assert from "node:assert/strict";

import type { CanonicalGraphPayload } from "./node-system-canonical.ts";
import type { AgentNode, OutputBoundaryNode } from "./node-system-schema.ts";
import {
  addEditorNodeToCanonicalGraph,
  applyEditorConfigToCanonicalGraph,
  applyEditorConfigsToCanonicalGraph,
  bindStateToCanonicalNode,
  buildCanonicalFlowProjectionFromEditorState,
  composeCanonicalGraphForSubmission,
  applyFlowProjectionToCanonicalGraph,
  deleteStateFromCanonicalGraph,
  removeStateFromCanonicalNode,
  renameStateKeyInCanonicalGraph,
  renameStateNameInCanonicalGraph,
  upsertStateInCanonicalGraph,
} from "./node-system-canonical-write.ts";

test("applyEditorConfigToCanonicalGraph updates canonical node from editor config while preserving flow ui state", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Canonical Write Test",
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
      output_answer: {
        kind: "output",
        name: "Old Output",
        description: "Old description",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: true,
          expandedSize: { width: 360, height: 240 },
          collapsedSize: { width: 240, height: 120 },
        },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "plain",
          persistEnabled: false,
          persistFormat: "txt",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextConfig: OutputBoundaryNode = {
    presetId: "node.output.output_answer",
    family: "output",
    name: "Output Answer",
    description: "Show the final answer.",
    input: {
      key: "answer",
      label: "Answer",
      valueType: "text",
      required: true,
    },
    displayMode: "json",
    persistEnabled: true,
    persistFormat: "json",
    fileNameTemplate: "answer.json",
    stateReads: [{ stateKey: "answer", inputKey: "answer", required: true }],
    stateWrites: [],
  };

  const next = applyEditorConfigToCanonicalGraph(graph, {
    id: "output_answer",
    position: { x: 180, y: 96 },
    data: {
      isExpanded: true,
      expandedSize: { width: 420, height: 280 },
      collapsedSize: { width: 250, height: 110 },
    },
  }, nextConfig);

  assert.notEqual(next, graph);
  assert.equal(next.nodes.output_answer.name, "Output Answer");
  assert.equal(next.nodes.output_answer.description, "Show the final answer.");
  assert.deepEqual(next.nodes.output_answer.reads, [{ state: "answer", required: true }]);
  assert.deepEqual(next.nodes.output_answer.ui, {
    position: { x: 180, y: 96 },
    collapsed: false,
    expandedSize: { width: 420, height: 280 },
    collapsedSize: { width: 250, height: 110 },
  });
  assert.deepEqual(next.nodes.output_answer.config, {
    displayMode: "json",
    persistEnabled: true,
    persistFormat: "json",
    fileNameTemplate: "answer.json",
  });
});

test("applyEditorConfigToCanonicalGraph returns the same graph when canonical node already matches the editor config", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Canonical Write Test",
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
        description: "Collect the user question.",
        ui: {
          position: { x: 20, y: 40 },
          collapsed: false,
          expandedSize: { width: 320, height: 240 },
          collapsedSize: null,
        },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "What is GraphiteUI?",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = applyEditorConfigToCanonicalGraph(graph, {
    id: "input_question",
    position: { x: 20, y: 40 },
    data: {
      isExpanded: true,
      expandedSize: { width: 320, height: 240 },
      collapsedSize: null,
    },
  }, {
    presetId: "node.input.input_question",
    family: "input",
    name: "Input Question",
    description: "Collect the user question.",
    valueType: "text",
    output: {
      key: "question",
      label: "Question",
      valueType: "text",
    },
    value: "What is GraphiteUI?",
    stateReads: [],
    stateWrites: [{ stateKey: "question", outputKey: "question", mode: "replace" }],
  });

  assert.equal(next, graph);
});

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

test("applyEditorConfigsToCanonicalGraph updates multiple canonical nodes in one pass", () => {
  const graph: CanonicalGraphPayload = {
    graph_id: "graph_test",
    name: "Batch Canonical Write Test",
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
      agent_b: {
        kind: "agent",
        name: "Agent B",
        description: "",
        ui: {
          position: { x: 300, y: 0 },
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
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const next = applyEditorConfigsToCanonicalGraph(graph, [
    {
      node: {
        id: "agent_a",
        position: { x: 0, y: 0 },
        data: {
          isExpanded: true,
          expandedSize: null,
          collapsedSize: null,
        },
      },
      config: {
        presetId: "node.agent.agent_a",
        family: "agent",
        name: "Agent A",
        description: "",
        inputs: [],
        outputs: [],
        stateReads: [],
        stateWrites: [],
        skills: [
          {
            skillKey: "search_knowledge_base",
            name: "search_knowledge_base",
            usage: "optional",
            inputMapping: {},
            contextBinding: {},
          },
        ],
        systemInstruction: "",
        taskInstruction: "",
        modelSource: "global",
        model: "",
        thinkingMode: "on",
        temperature: 0.2,
      } satisfies AgentNode,
    },
    {
      node: {
        id: "agent_b",
        position: { x: 300, y: 0 },
        data: {
          isExpanded: true,
          expandedSize: null,
          collapsedSize: null,
        },
      },
      config: {
        presetId: "node.agent.agent_b",
        family: "agent",
        name: "Agent B",
        description: "",
        inputs: [],
        outputs: [],
        stateReads: [],
        stateWrites: [],
        skills: [
          {
            skillKey: "search_knowledge_base",
            name: "search_knowledge_base",
            usage: "optional",
            inputMapping: {},
            contextBinding: {},
          },
        ],
        systemInstruction: "",
        taskInstruction: "",
        modelSource: "global",
        model: "",
        thinkingMode: "on",
        temperature: 0.2,
      } satisfies AgentNode,
    },
  ]);

  assert.notEqual(next, graph);
  assert.equal(next.nodes.agent_a.kind, "agent");
  assert.equal(next.nodes.agent_b.kind, "agent");
  assert.deepEqual(next.nodes.agent_a.config.skills, ["search_knowledge_base"]);
  assert.deepEqual(next.nodes.agent_b.config.skills, ["search_knowledge_base"]);
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
    stateReads: [{ stateKey: "summary", inputKey: "summary", required: true }],
    stateWrites: [],
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

test("buildCanonicalFlowProjectionFromEditorState projects regular and conditional edges into canonical form", () => {
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
              key: "question",
              label: "Question",
              valueType: "text",
            },
            value: "",
            stateReads: [],
            stateWrites: [{ stateKey: "question", outputKey: "question", mode: "replace" }],
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
                key: "question",
                label: "Question",
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
            stateReads: [{ stateKey: "question", inputKey: "question", required: true }],
            stateWrites: [],
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
              key: "question",
              label: "Question",
              valueType: "text",
              required: true,
            },
            displayMode: "auto",
            persistEnabled: false,
            persistFormat: "auto",
            fileNameTemplate: "",
            stateReads: [{ stateKey: "question", inputKey: "question", required: true }],
            stateWrites: [],
          },
        },
      },
    ],
    [
      {
        source: "input_question",
        target: "condition_route",
        sourceHandle: "output:question",
        targetHandle: "input:question",
      },
      {
        source: "condition_route",
        target: "output_answer",
        sourceHandle: "output:done",
        targetHandle: "input:question",
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
