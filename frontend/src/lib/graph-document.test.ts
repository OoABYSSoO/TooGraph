import test from "node:test";
import assert from "node:assert/strict";
import { reactive } from "vue";

import * as graphDocument from "./graph-document.ts";
import type { GraphDocument, GraphPayload, TemplateRecord } from "../types/node-system.ts";

const { cloneGraphDocument, createDraftFromTemplate, createEmptyDraftGraph } = graphDocument;

const template: TemplateRecord = {
  template_id: "hello_world",
  label: "Hello World",
  description: "A minimal hello world graph for validating the runtime path.",
  default_graph_name: "Hello World",
  state_schema: {
    question: {
      name: "question",
      description: "User question",
      type: "text",
      value: "什么是 GraphiteUI？",
      color: "#d97706",
    },
  },
  nodes: {
    input_question: {
      kind: "input",
      name: "input_question",
      description: "Provide the user question.",
      ui: {
        position: {
          x: 80,
          y: 220,
        },
      },
      reads: [],
      writes: [{ state: "question", mode: "replace" }],
      config: {
        value: "什么是 GraphiteUI？",
      },
    },
  },
  edges: [{ source: "input_question", target: "input_question" }],
  conditional_edges: [],
  metadata: {
    category: "demo",
  },
};

test("createDraftFromTemplate creates a backend-native graph payload", () => {
  const draft = createDraftFromTemplate(template);

  assert.equal(draft.graph_id, null);
  assert.equal(draft.name, "Hello World");
  assert.deepEqual(draft.state_schema, template.state_schema);
  assert.deepEqual(draft.nodes, template.nodes);
  assert.deepEqual(draft.edges, template.edges);
  assert.deepEqual(draft.conditional_edges, template.conditional_edges);
  assert.deepEqual(draft.metadata, template.metadata);
});

test("createDraftFromTemplate deep clones nested template content", () => {
  const draft = createDraftFromTemplate(template);

  draft.state_schema.question.value = "changed";
  draft.metadata.category = "mutated";

  assert.equal(template.state_schema.question.value, "什么是 GraphiteUI？");
  assert.equal(template.metadata.category, "demo");
});

test("createDraftFromTemplate accepts Vue reactive template records", () => {
  const reactiveTemplate = reactive(template) as TemplateRecord;

  const draft = createDraftFromTemplate(reactiveTemplate);

  assert.equal(draft.name, "Hello World");
  assert.deepEqual(draft.nodes, template.nodes);
});

test("cloneGraphDocument accepts Vue reactive graph documents", () => {
  const graph: GraphDocument = {
    graph_id: "graph_123",
    name: "Hello World",
    state_schema: template.state_schema,
    nodes: template.nodes,
    edges: template.edges,
    conditional_edges: template.conditional_edges,
    metadata: template.metadata,
  };

  const reactiveGraph = reactive(graph) as GraphDocument;

  const clone = cloneGraphDocument(reactiveGraph);

  assert.equal(clone.graph_id, "graph_123");
  assert.deepEqual(clone.nodes, graph.nodes);
  assert.notEqual(clone, reactiveGraph);
});

test("createEmptyDraftGraph creates an empty backend-native payload", () => {
  const draft = createEmptyDraftGraph("Untitled Graph");

  assert.deepEqual(draft, {
    graph_id: null,
    name: "Untitled Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  });
});

test("updateOutputNodeConfigInDocument patches output config immutably", () => {
  assert.equal(typeof graphDocument.updateOutputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Output Graph",
    state_schema: {
      answer: {
        name: "answer",
        description: "Final answer",
        type: "text",
        value: "hello",
        color: "#7c3aed",
      },
    },
    nodes: {
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "answer", required: true }],
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

  const nextDocument = graphDocument.updateOutputNodeConfigInDocument(document, "output_answer", (config) => ({
    ...config,
    displayMode: "markdown",
    persistEnabled: true,
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.output_answer.kind, "output");
  assert.deepEqual(nextDocument.nodes.output_answer.config, {
    displayMode: "markdown",
    persistEnabled: true,
    persistFormat: "auto",
    fileNameTemplate: "",
  });
  assert.deepEqual(document.nodes.output_answer.config, {
    displayMode: "auto",
    persistEnabled: false,
    persistFormat: "auto",
    fileNameTemplate: "",
  });
});

test("updateOutputNodeConfigInDocument returns original document for non-output or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateOutputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "json",
          persistEnabled: true,
          persistFormat: "json",
          fileNameTemplate: "answer",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const unchangedOutput = graphDocument.updateOutputNodeConfigInDocument(document, "output_answer", (config) => config);
  const unchangedInput = graphDocument.updateOutputNodeConfigInDocument(document, "input_question", (config) => ({
    ...config,
    persistEnabled: false,
  }));

  assert.equal(unchangedOutput, document);
  assert.equal(unchangedInput, document);
});

test("updateAgentNodeConfigInDocument patches agent config immutably", () => {
  assert.equal(typeof graphDocument.updateAgentNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Agent Graph",
    state_schema: {},
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 0, y: 0 } },
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

  const nextDocument = graphDocument.updateAgentNodeConfigInDocument(document, "answer_helper", (config) => ({
    ...config,
    taskInstruction: "请直接用中文回答用户问题。",
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.answer_helper.kind, "agent");
  assert.equal(document.nodes.answer_helper.kind, "agent");
  if (nextDocument.nodes.answer_helper.kind !== "agent" || document.nodes.answer_helper.kind !== "agent") {
    throw new Error("Expected answer_helper to remain an agent node");
  }
  assert.equal(nextDocument.nodes.answer_helper.config.taskInstruction, "请直接用中文回答用户问题。");
  assert.equal(document.nodes.answer_helper.config.taskInstruction, "");
});

test("updateAgentNodeConfigInDocument returns original document for non-agent or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateAgentNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "已有内容",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 120, y: 0 } },
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

  const unchangedAgent = graphDocument.updateAgentNodeConfigInDocument(document, "answer_helper", (config) => config);
  const unchangedOutput = graphDocument.updateAgentNodeConfigInDocument(document, "output_answer", (config) => ({
    ...config,
    taskInstruction: "不应该生效",
  }));

  assert.equal(unchangedAgent, document);
  assert.equal(unchangedOutput, document);
});

test("updateConditionNodeConfigInDocument patches condition config immutably", () => {
  assert.equal(typeof graphDocument.updateConditionNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Graph",
    state_schema: {},
    nodes: {
      continue_check: {
        kind: "condition",
        name: "continue_check",
        description: "Continue or retry",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: 5,
          branchMapping: { true: "continue", false: "retry" },
          rule: {
            source: "",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateConditionNodeConfigInDocument(document, "continue_check", (config) => ({
    ...config,
    loopLimit: -1,
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.continue_check.kind, "condition");
  assert.equal(document.nodes.continue_check.kind, "condition");
  if (nextDocument.nodes.continue_check.kind !== "condition" || document.nodes.continue_check.kind !== "condition") {
    throw new Error("Expected continue_check to remain a condition node");
  }
  assert.equal(nextDocument.nodes.continue_check.config.loopLimit, -1);
  assert.equal(document.nodes.continue_check.config.loopLimit, 5);
});

test("updateConditionNodeConfigInDocument returns original document for non-condition or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateConditionNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      continue_check: {
        kind: "condition",
        name: "continue_check",
        description: "Continue or retry",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: 3,
          branchMapping: { true: "continue", false: "retry" },
          rule: {
            source: "",
            operator: "exists",
            value: null,
          },
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
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

  const unchangedCondition = graphDocument.updateConditionNodeConfigInDocument(document, "continue_check", (config) => config);
  const unchangedAgent = graphDocument.updateConditionNodeConfigInDocument(document, "answer_helper", (config) => ({
    ...config,
    loopLimit: -1,
  }));

  assert.equal(unchangedCondition, document);
  assert.equal(unchangedAgent, document);
});

test("updateConditionBranchInDocument renames branch and syncs conditional edges", () => {
  assert.equal(typeof graphDocument.updateConditionBranchInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Branch Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "next_agent",
          retry: "retry_agent",
        },
      },
    ],
    metadata: {},
  };

  const nextDocument = graphDocument.updateConditionBranchInDocument(document, "route_result", "retry", "retry_later", ["false", "maybe"]);

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.route_result.kind, "condition");
  assert.equal(document.nodes.route_result.kind, "condition");
  if (nextDocument.nodes.route_result.kind !== "condition" || document.nodes.route_result.kind !== "condition") {
    throw new Error("Expected route_result to remain a condition node");
  }
  assert.deepEqual(nextDocument.nodes.route_result.config.branches, ["continue", "retry_later"]);
  assert.deepEqual(nextDocument.nodes.route_result.config.branchMapping, {
    true: "continue",
    false: "retry_later",
    maybe: "retry_later",
  });
  assert.deepEqual(nextDocument.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "next_agent",
        retry_later: "retry_agent",
      },
    },
  ]);
  assert.deepEqual(document.nodes.route_result.config.branches, ["continue", "retry"]);
  assert.deepEqual(document.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "next_agent",
        retry: "retry_agent",
      },
    },
  ]);
});

test("updateConditionBranchInDocument rewrites mapping keys without renaming branch", () => {
  assert.equal(typeof graphDocument.updateConditionBranchInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Branch Mapping Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
            maybe: "retry",
          },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateConditionBranchInDocument(document, "route_result", "continue", "continue", ["yes", "true"]);

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.route_result.kind, "condition");
  if (nextDocument.nodes.route_result.kind !== "condition") {
    throw new Error("Expected route_result to remain a condition node");
  }
  assert.deepEqual(nextDocument.nodes.route_result.config.branchMapping, {
    false: "retry",
    maybe: "retry",
    yes: "continue",
    true: "continue",
  });
  assert.deepEqual(nextDocument.nodes.route_result.config.branches, ["continue", "retry"]);
});

test("updateConditionBranchInDocument returns original document for duplicate branch key or non-condition node", () => {
  assert.equal(typeof graphDocument.updateConditionBranchInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Branch No-op Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
      input_result: {
        kind: "input",
        name: "input_result",
        description: "Provide the result",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const duplicateBranch = graphDocument.updateConditionBranchInDocument(document, "route_result", "retry", "continue", ["false"]);
  const nonConditionNode = graphDocument.updateConditionBranchInDocument(document, "input_result", "retry", "retry_later", ["false"]);

  assert.equal(duplicateBranch, document);
  assert.equal(nonConditionNode, document);
});

test("addConditionBranchToDocument appends a generated branch key immutably", () => {
  assert.equal(typeof graphDocument.addConditionBranchToDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Branch Add Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.addConditionBranchToDocument(document, "route_result");

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.route_result.kind, "condition");
  assert.equal(document.nodes.route_result.kind, "condition");
  if (nextDocument.nodes.route_result.kind !== "condition" || document.nodes.route_result.kind !== "condition") {
    throw new Error("Expected route_result to remain a condition node");
  }
  assert.deepEqual(nextDocument.nodes.route_result.config.branches, ["continue", "retry", "branch_3"]);
  assert.deepEqual(nextDocument.nodes.route_result.config.branchMapping, {
    true: "continue",
    false: "retry",
  });
  assert.deepEqual(document.nodes.route_result.config.branches, ["continue", "retry"]);
});

test("addConditionBranchToDocument returns original document for non-condition nodes", () => {
  assert.equal(typeof graphDocument.addConditionBranchToDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Branch Add No-op Graph",
    state_schema: {},
    nodes: {
      input_result: {
        kind: "input",
        name: "input_result",
        description: "Provide the result",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.addConditionBranchToDocument(document, "input_result");

  assert.equal(nextDocument, document);
});

test("removeConditionBranchFromDocument removes branch mappings and synced conditional edges", () => {
  assert.equal(typeof graphDocument.removeConditionBranchFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Branch Remove Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
            maybe: "retry",
          },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "next_agent",
          retry: "retry_agent",
        },
      },
    ],
    metadata: {},
  };

  const nextDocument = graphDocument.removeConditionBranchFromDocument(document, "route_result", "retry");

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.route_result.kind, "condition");
  assert.equal(document.nodes.route_result.kind, "condition");
  if (nextDocument.nodes.route_result.kind !== "condition" || document.nodes.route_result.kind !== "condition") {
    throw new Error("Expected route_result to remain a condition node");
  }
  assert.deepEqual(nextDocument.nodes.route_result.config.branches, ["continue"]);
  assert.deepEqual(nextDocument.nodes.route_result.config.branchMapping, {
    true: "continue",
  });
  assert.deepEqual(nextDocument.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "next_agent",
      },
    },
  ]);
  assert.deepEqual(document.nodes.route_result.config.branches, ["continue", "retry"]);
  assert.deepEqual(document.nodes.route_result.config.branchMapping, {
    true: "continue",
    false: "retry",
    maybe: "retry",
  });
});

test("removeConditionBranchFromDocument prunes empty conditional edge records and keeps last branch intact", () => {
  assert.equal(typeof graphDocument.removeConditionBranchFromDocument, "function");

  const routeDocument: GraphPayload = {
    graph_id: null,
    name: "Condition Branch Remove Route Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          retry: "retry_agent",
        },
      },
    ],
    metadata: {},
  };

  const nextRouteDocument = graphDocument.removeConditionBranchFromDocument(routeDocument, "route_result", "retry");

  assert.equal(nextRouteDocument.nodes.route_result.kind, "condition");
  if (nextRouteDocument.nodes.route_result.kind !== "condition") {
    throw new Error("Expected route_result to remain a condition node");
  }
  assert.deepEqual(nextRouteDocument.nodes.route_result.config.branches, ["continue"]);
  assert.deepEqual(nextRouteDocument.nodes.route_result.config.branchMapping, {
    true: "continue",
  });
  assert.deepEqual(nextRouteDocument.conditional_edges, []);

  const singleBranchDocument: GraphPayload = {
    graph_id: null,
    name: "Condition Branch Last Branch Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
          },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "next_agent",
        },
      },
    ],
    metadata: {},
  };

  const unchangedLastBranch = graphDocument.removeConditionBranchFromDocument(singleBranchDocument, "route_result", "continue");
  assert.equal(unchangedLastBranch, singleBranchDocument);
});

test("updateInputNodeConfigInDocument patches input config immutably", () => {
  assert.equal(typeof graphDocument.updateInputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Input Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "What is GraphiteUI?",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateInputNodeConfigInDocument(document, "input_question", (config) => ({
    ...config,
    value: "Explain GraphiteUI in Chinese.",
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.input_question.kind, "input");
  assert.equal(document.nodes.input_question.kind, "input");
  if (nextDocument.nodes.input_question.kind !== "input" || document.nodes.input_question.kind !== "input") {
    throw new Error("Expected input_question to remain an input node");
  }
  assert.equal(nextDocument.nodes.input_question.config.value, "Explain GraphiteUI in Chinese.");
  assert.equal(document.nodes.input_question.config.value, "What is GraphiteUI?");
});

test("updateInputNodeConfigInDocument returns original document for non-input or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateInputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "What is GraphiteUI?",
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 120, y: 0 } },
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

  const unchangedInput = graphDocument.updateInputNodeConfigInDocument(document, "input_question", (config) => config);
  const unchangedOutput = graphDocument.updateInputNodeConfigInDocument(document, "output_answer", (config) => ({
    ...config,
    value: "不应该生效",
  }));

  assert.equal(unchangedInput, document);
  assert.equal(unchangedOutput, document);
});
