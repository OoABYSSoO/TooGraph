import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditorNodeConfigFromCanonicalNode,
  buildEditorNodeConfigFromCanonicalPreset,
  getCanonicalNodeDisplayName,
  getEditorPortValueTypeFromCanonicalHandle,
  findFirstCompatibleInputHandleFromCanonicalNode,
  listEditorInputPortsFromCanonicalNode,
  listEditorOutputPortsFromCanonicalNode,
  syncKnowledgeBaseSkillOnCanonicalAgentNode,
  buildEditorStateFieldsFromCanonicalStateSchema,
  type CanonicalPresetDocument,
} from "./node-system-canonical.ts";

test("buildEditorNodeConfigFromCanonicalPreset derives a usable editor config directly from canonical preset data", () => {
  const preset: CanonicalPresetDocument = {
    presetId: "preset.local.research_helper.123456",
    sourcePresetId: "preset.agent.empty.v0",
    definition: {
      label: "Research Helper",
      description: "Research workflow preset",
      state_schema: {
        question: {
          name: "Question",
          description: "User question",
          type: "text",
          value: "What is GraphiteUI?",
          color: "#d97706",
        },
        answer: {
          name: "Answer",
          description: "Final answer",
          type: "text",
          value: "",
          color: "#2563eb",
        },
      },
      node: {
        kind: "agent",
        name: "research_helper",
        description: "Handles research prompts",
        ui: {
          position: { x: 0, y: 0 },
          collapsed: false,
        },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: ["search_knowledge_base"],
          systemInstruction: "You are a helpful researcher.",
          taskInstruction: "Answer the user's question.",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
  };

  const config = buildEditorNodeConfigFromCanonicalPreset(preset);

  assert.equal(config.presetId, preset.presetId);
  assert.equal(config.family, "agent");
  assert.equal(config.name, "research_helper");
  assert.equal(config.description, "Research workflow preset");
  assert.deepEqual(
    config.inputs.map((input) => ({ key: input.key, label: input.label, required: input.required })),
    [{ key: "question", label: "Question", required: true }],
  );
  assert.deepEqual(
    config.outputs.map((output) => ({ key: output.key, label: output.label })),
    [{ key: "answer", label: "Answer" }],
  );
});

test("buildEditorStateFieldsFromCanonicalStateSchema derives editor state fields without wrapping them in a preset record", () => {
  const stateFields = buildEditorStateFieldsFromCanonicalStateSchema({
    question: {
      name: "Question",
      description: "User question",
      type: "text",
      value: "What is GraphiteUI?",
      color: "#d97706",
    },
    answer: {
      name: "Answer",
      description: "Final answer",
      type: "text",
      value: "",
      color: "#2563eb",
    },
  });

  assert.deepEqual(stateFields, [
    {
      key: "question",
      name: "Question",
      description: "User question",
      type: "text",
      value: "What is GraphiteUI?",
      ui: {
        color: "#d97706",
      },
    },
    {
      key: "answer",
      name: "Answer",
      description: "Final answer",
      type: "text",
      value: "",
      ui: {
        color: "#2563eb",
      },
    },
  ]);
});

test("buildEditorNodeConfigFromCanonicalNode keeps agent skills as direct string keys", () => {
  const config = buildEditorNodeConfigFromCanonicalNode(
    "research_helper",
    {
      kind: "agent",
      name: "research_helper",
      description: "Handles research prompts",
      ui: {
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      reads: [],
      writes: [],
      config: {
        skills: ["search_knowledge_base", "markdown_formatter"],
        systemInstruction: "You are a helpful researcher.",
        taskInstruction: "Answer the user's question.",
        modelSource: "global",
        model: "",
        thinkingMode: "on",
        temperature: 0.2,
      },
    },
    {},
  );

  assert.equal(config.family, "agent");
  assert.deepEqual(config.skills, ["search_knowledge_base", "markdown_formatter"]);
});

test("canonical node helpers derive display name and port lists without relying on editor config mirrors", () => {
  const stateSchema = {
    question: {
      name: "Question",
      description: "User question",
      type: "text",
      value: "",
      color: "#d97706",
    },
    answer: {
      name: "Answer",
      description: "Workflow answer",
      type: "markdown",
      value: "",
      color: "#2563eb",
    },
  } as const;

  const node = {
    kind: "agent" as const,
    name: "",
    description: "Handles research prompts",
    ui: {
      position: { x: 0, y: 0 },
      collapsed: false,
    },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" as const }],
    config: {
      skills: ["search_knowledge_base"],
      systemInstruction: "You are a helpful researcher.",
      taskInstruction: "Answer the user's question.",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "on" as const,
      temperature: 0.2,
    },
  };

  assert.equal(getCanonicalNodeDisplayName("research_helper", node), "research_helper");
  assert.deepEqual(listEditorInputPortsFromCanonicalNode(node, stateSchema), [
    {
      key: "question",
      label: "Question",
      valueType: "text",
      required: true,
    },
  ]);
  assert.deepEqual(listEditorOutputPortsFromCanonicalNode(node, stateSchema), [
    {
      key: "answer",
      label: "Answer",
      valueType: "text",
      required: false,
    },
  ]);
});

test("getEditorPortValueTypeFromCanonicalHandle resolves canonical port types and create-input handles", () => {
  const stateSchema = {
    question: {
      name: "Question",
      description: "User question",
      type: "text",
      value: "",
      color: "#d97706",
    },
    kb: {
      name: "Knowledge Base",
      description: "Knowledge base input",
      type: "knowledge_base",
      value: "",
      color: "#2563eb",
    },
  } as const;

  const agentNode = {
    kind: "agent" as const,
    name: "research_helper",
    description: "",
    ui: {
      position: { x: 0, y: 0 },
      collapsed: false,
    },
    reads: [
      { state: "question", required: true },
      { state: "kb", required: true },
    ],
    writes: [],
    config: {
      skills: [],
      systemInstruction: "",
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "on" as const,
      temperature: 0.2,
    },
  };

  const conditionNode = {
    kind: "condition" as const,
    name: "router",
    description: "",
    ui: {
      position: { x: 0, y: 0 },
      collapsed: false,
    },
    reads: [{ state: "question", required: true }],
    writes: [],
    config: {
      branches: ["yes", "no"],
      conditionMode: "rule" as const,
      branchMapping: { yes: "a", no: "b" },
      rule: { source: "question", operator: "exists" as const, value: null },
    },
  };

  assert.equal(getEditorPortValueTypeFromCanonicalHandle(agentNode, stateSchema, "input:question"), "text");
  assert.equal(getEditorPortValueTypeFromCanonicalHandle(agentNode, stateSchema, "input:kb"), "knowledge_base");
  assert.equal(getEditorPortValueTypeFromCanonicalHandle(agentNode, stateSchema, "input:__create__"), "any");
  assert.equal(getEditorPortValueTypeFromCanonicalHandle(conditionNode, stateSchema, "output:yes"), "any");
});

test("findFirstCompatibleInputHandleFromCanonicalNode prefers canonical inputs and falls back to create-handle for empty agent nodes", () => {
  const stateSchema = {
    question: {
      name: "Question",
      description: "User question",
      type: "text",
      value: "",
      color: "#d97706",
    },
    kb: {
      name: "Knowledge Base",
      description: "Knowledge base input",
      type: "knowledge_base",
      value: "",
      color: "#2563eb",
    },
  } as const;

  const configuredAgent = {
    kind: "agent" as const,
    name: "research_helper",
    description: "",
    ui: {
      position: { x: 0, y: 0 },
      collapsed: false,
    },
    reads: [{ state: "question", required: true }],
    writes: [],
    config: {
      skills: [],
      systemInstruction: "",
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "on" as const,
      temperature: 0.2,
    },
  };

  const emptyAgent = {
    ...configuredAgent,
    reads: [],
  };

  const outputNode = {
    kind: "output" as const,
    name: "final_answer",
    description: "",
    ui: {
      position: { x: 0, y: 0 },
      collapsed: false,
    },
    reads: [{ state: "question", required: true }],
    writes: [],
    config: {
      displayMode: "auto" as const,
      persistEnabled: false,
      persistFormat: "auto" as const,
      fileNameTemplate: "",
    },
  };

  assert.equal(findFirstCompatibleInputHandleFromCanonicalNode(configuredAgent, stateSchema, "text"), "input:question");
  assert.equal(findFirstCompatibleInputHandleFromCanonicalNode(emptyAgent, stateSchema, "text"), "input:__create__");
  assert.equal(findFirstCompatibleInputHandleFromCanonicalNode(outputNode, stateSchema, "knowledge_base"), null);
});

test("syncKnowledgeBaseSkillOnCanonicalAgentNode derives mounted skills directly from canonical bindings", () => {
  const stateSchema = {
    question: {
      name: "Question",
      description: "User question",
      type: "text",
      value: "",
      color: "#d97706",
    },
    kb: {
      name: "Knowledge Base",
      description: "Knowledge base input",
      type: "knowledge_base",
      value: "",
      color: "#2563eb",
    },
  } as const;

  const agentNode = {
    kind: "agent" as const,
    name: "research_helper",
    description: "",
    ui: {
      position: { x: 0, y: 0 },
      collapsed: false,
    },
    reads: [
      { state: "kb", required: true },
      { state: "question", required: true },
    ],
    writes: [],
    config: {
      skills: ["markdown_formatter"],
      systemInstruction: "",
      taskInstruction: "",
      modelSource: "global" as const,
      model: "",
      thinkingMode: "on" as const,
      temperature: 0.2,
    },
  };

  const synced = syncKnowledgeBaseSkillOnCanonicalAgentNode(agentNode, stateSchema, ["kb"]);
  assert.deepEqual(synced.config.skills, ["markdown_formatter", "search_knowledge_base"]);

  const pruned = syncKnowledgeBaseSkillOnCanonicalAgentNode(
    {
      ...synced,
      config: {
        ...synced.config,
        skills: ["markdown_formatter", "search_knowledge_base"],
      },
    },
    stateSchema,
    [],
  );
  assert.deepEqual(pruned.config.skills, ["markdown_formatter"]);
});
