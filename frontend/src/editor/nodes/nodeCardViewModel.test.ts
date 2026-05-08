import test from "node:test";
import assert from "node:assert/strict";

import { buildNodeCardViewModel } from "./nodeCardViewModel.ts";
import { VIRTUAL_ANY_INPUT_STATE_KEY, VIRTUAL_ANY_OUTPUT_STATE_KEY } from "../../lib/virtual-any-input.ts";
import type { GraphNode, StateDefinition } from "../../types/node-system.ts";
import type { SkillDefinition } from "../../types/skills.ts";

const stateSchema: Record<string, StateDefinition> = {
  question: {
    name: "question",
    description: "User question for the workflow.",
    type: "text",
    value: "什么是 GraphiteUI？",
    color: "#d97706",
  },
  answer: {
    name: "answer",
    description: "Answer produced by the agent.",
    type: "text",
    value: "",
    color: "#7c3aed",
  },
};

test("buildNodeCardViewModel derives input body and output label", () => {
  const node: GraphNode = {
    kind: "input",
    name: "input_question",
    description: "Provide the user question.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "question", mode: "replace" }],
    config: {
      value: "什么是 GraphiteUI？",
    },
  };

  const model = buildNodeCardViewModel("input_question", node, stateSchema);

  assert.equal(model.body.kind, "input");
  assert.equal(model.body.valueText, "什么是 GraphiteUI？");
  assert.equal(model.body.editorMode, "text");
  assert.equal(model.body.primaryOutput?.label, "question");
  assert.equal(model.body.primaryOutput?.typeLabel, "text");
});

test("buildNodeCardViewModel treats input node state schema value as the visible input value", () => {
  const node: GraphNode = {
    kind: "input",
    name: "input_question",
    description: "Provide the user question.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "question", mode: "replace" }],
    config: {
      value: "旧的节点 config 值",
    },
  };

  const model = buildNodeCardViewModel("input_question", node, {
    ...stateSchema,
    question: {
      ...stateSchema.question,
      value: "来自 state_schema 的新值",
    },
  });

  assert.equal(model.body.kind, "input");
  assert.equal(model.body.valueText, "来自 state_schema 的新值");
});

test("buildNodeCardViewModel derives knowledge-base input editor mode from primary output state type", () => {
  const node: GraphNode = {
    kind: "input",
    name: "input_knowledge_base",
    description: "Pick a knowledge base.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "knowledge_base", mode: "replace" }],
    config: {
      value: "graphiteui-official",
    },
  };

  const model = buildNodeCardViewModel("input_knowledge_base", node, {
    ...stateSchema,
    knowledge_base: {
      name: "knowledge_base",
      description: "Knowledge base selection.",
      type: "knowledge_base",
      value: "graphiteui-official",
      color: "#0f766e",
    },
  });

  assert.equal(model.body.kind, "input");
  assert.equal(model.body.editorMode, "knowledge_base");
  assert.equal(model.body.primaryOutput?.typeLabel, "knowledge base");
});

test("buildNodeCardViewModel derives uploaded-asset input editor mode from primary output state type", () => {
  const node: GraphNode = {
    kind: "input",
    name: "input_reference_image",
    description: "Upload a reference image.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "reference_image", mode: "replace" }],
    config: {
      value: "",
    },
  };

  const model = buildNodeCardViewModel("input_reference_image", node, {
    ...stateSchema,
    reference_image: {
      name: "reference_image",
      description: "Reference image.",
      type: "image",
      value: "",
      color: "#0f766e",
    },
  });

  assert.equal(model.body.kind, "input");
  assert.equal(model.body.editorMode, "asset");
  assert.equal(model.body.assetType, "image");
  assert.equal(model.body.primaryOutput?.typeLabel, "image");
});

test("buildNodeCardViewModel derives agent body, ports, and labels", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "answer_helper",
    description: "Answer the question directly without external tools.",
    ui: { position: { x: 520, y: 220 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skillKey: "",
      taskInstruction: "请直接用中文回答用户问题。",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };

  const model = buildNodeCardViewModel("answer_helper", node, stateSchema);

  assert.equal(model.kindLabel, "LLM");
  assert.deepEqual(model.inputs.map((port) => port.label), ["question"]);
  assert.deepEqual(model.outputs.map((port) => port.label), ["answer"]);
  assert.equal(model.body.kind, "agent");
  assert.ok(!("systemInstruction" in model.body));
  assert.equal(model.body.taskInstruction, "请直接用中文回答用户问题。");
  assert.equal(model.body.skillLabel, "No skill");
  assert.equal(model.body.primaryInput?.label, "question");
  assert.equal(model.body.primaryOutput?.label, "answer");
  assert.equal(model.body.primaryInput?.typeLabel, "text");
  assert.deepEqual(model.stateSummary?.reads, ["question"]);
  assert.deepEqual(model.stateSummary?.writes, ["answer"]);
});

test("buildNodeCardViewModel derives displayed skill instruction from the selected skill definition", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "search_helper",
    description: "Prepare a search.",
    ui: { position: { x: 520, y: 220 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skillKey: "web_search",
      skillInstructionBlocks: {},
      taskInstruction: "生成搜索参数。",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };

  const model = buildNodeCardViewModel("search_helper", node, stateSchema, {
    skillDefinitions: [
      {
        skillKey: "web_search",
        name: "Web Search",
        description: "Search the web.",
        llmInstruction: "Use the graph state to create a search query.",
      },
    ] as SkillDefinition[],
  });

  assert.equal(model.body.kind, "agent");
  assert.deepEqual(model.body.skillInstructionBlocks, {
    web_search: {
      skillKey: "web_search",
      title: "Web Search skill instruction",
      content: "Use the graph state to create a search query.",
      source: "skill.llmInstruction",
    },
  });
});

test("buildNodeCardViewModel marks skill-managed output ports", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "search_helper",
    description: "Run a selected skill.",
    ui: { position: { x: 520, y: 220 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "search_artifacts", mode: "replace" }],
    config: {
      skillKey: "web_search",
      taskInstruction: "准备技能输入。",
      modelSource: "global",
      model: "",
      thinkingMode: "high",
      temperature: 0.2,
    },
  };

  const model = buildNodeCardViewModel("search_helper", node, {
    ...stateSchema,
    search_artifacts: {
      name: "Search Artifacts",
      description: "Downloaded files.",
      type: "file",
      value: [],
      color: "#2563eb",
      binding: {
        kind: "skill_output",
        skillKey: "web_search",
        nodeId: "search_helper",
        fieldKey: "artifact_paths",
        managed: true,
      },
    },
  });

  assert.deepEqual(model.outputs[0]?.managedBySkill, {
    skillKey: "web_search",
    fieldKey: "artifact_paths",
  });
  assert.equal(model.body.kind, "agent");
  assert.deepEqual(model.body.primaryOutput?.managedBySkill, {
    skillKey: "web_search",
    fieldKey: "artifact_paths",
  });
});

test("buildNodeCardViewModel marks dynamic capability input and result package output ports as managed", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "dynamic_executor",
    description: "Run a selected capability.",
    ui: { position: { x: 520, y: 220 } },
    reads: [
      { state: "question", required: true },
      { state: "selected_capability", required: true },
    ],
    writes: [{ state: "dynamic_result", mode: "replace" }],
    config: {
      skillKey: "",
      taskInstruction: "准备动态能力输入。",
      modelSource: "global",
      model: "",
      thinkingMode: "high",
      temperature: 0.2,
    },
  };

  const model = buildNodeCardViewModel("dynamic_executor", node, {
    ...stateSchema,
    selected_capability: {
      name: "Selected Capability",
      description: "Chosen runtime capability.",
      type: "capability",
      value: { kind: "skill", key: "web_search" },
      color: "#2563eb",
    },
    dynamic_result: {
      name: "Capability Result",
      description: "Dynamic capability result package.",
      type: "result_package",
      value: {},
      color: "#10b981",
      binding: {
        kind: "capability_result",
        nodeId: "dynamic_executor",
        fieldKey: "result_package",
        managed: true,
      },
    },
  });

  assert.equal(model.inputs[0]?.managedByCapability, undefined);
  assert.deepEqual(model.inputs[1]?.managedByCapability, { role: "input" });
  assert.deepEqual(model.outputs[0]?.managedByCapability, { role: "result_package" });
  assert.equal(model.body.kind, "agent");
  assert.deepEqual(model.body.primaryOutput?.managedByCapability, { role: "result_package" });
});

test("buildNodeCardViewModel exposes a virtual plus input for empty non-input nodes", () => {
  const emptyAgent: GraphNode = {
    kind: "agent",
    name: "empty_agent",
    description: "Agent without state inputs.",
    ui: { position: { x: 520, y: 220 } },
    reads: [],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skillKey: "",
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };
  const emptyOutput: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };
  const emptyCondition: GraphNode = {
    kind: "condition",
    name: "answer_gate",
    description: "Route by answer state.",
    ui: { position: { x: 740, y: 220 } },
    reads: [],
    writes: [],
    config: {
      branches: ["continue", "stop"],
      loopLimit: 5,
      branchMapping: {
        continue: "continue",
        stop: "stop",
      },
      rule: {
        source: "",
        operator: "exists",
        value: null,
      },
    },
  };
  const inputNode: GraphNode = {
    kind: "input",
    name: "input_question",
    description: "Provide the user question.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [{ state: "question", mode: "replace" }],
    config: {
      value: "什么是 GraphiteUI？",
    },
  };

  const agentModel = buildNodeCardViewModel("empty_agent", emptyAgent, stateSchema);
  const outputModel = buildNodeCardViewModel("output_answer", emptyOutput, stateSchema);
  const conditionModel = buildNodeCardViewModel("answer_gate", emptyCondition, stateSchema);
  const inputModel = buildNodeCardViewModel("input_question", inputNode, stateSchema);

  assert.deepEqual(agentModel.inputs, [
    {
      key: VIRTUAL_ANY_INPUT_STATE_KEY,
      label: "+ input",
      typeLabel: "+ input",
      stateColor: "#16a34a",
      virtual: true,
    },
  ]);
  assert.equal(agentModel.body.kind, "agent");
  assert.equal(agentModel.body.primaryInput?.key, VIRTUAL_ANY_INPUT_STATE_KEY);
  assert.equal(agentModel.body.primaryInput?.virtual, true);
  assert.equal(outputModel.body.kind, "output");
  assert.equal(outputModel.body.primaryInput?.key, VIRTUAL_ANY_INPUT_STATE_KEY);
  assert.equal(outputModel.body.primaryInput?.virtual, true);
  assert.equal(outputModel.body.primaryInput?.label, "+ input");
  assert.equal(outputModel.body.connectedStateKey, null);
  assert.equal(conditionModel.body.kind, "condition");
  assert.equal(conditionModel.body.primaryInput?.key, VIRTUAL_ANY_INPUT_STATE_KEY);
  assert.equal(conditionModel.body.primaryInput?.virtual, true);
  assert.equal(conditionModel.body.primaryInput?.label, "+ input");
  assert.deepEqual(inputModel.inputs, []);
});

test("buildNodeCardViewModel exposes virtual plus outputs for empty agent and input outputs", () => {
  const emptyAgent: GraphNode = {
    kind: "agent",
    name: "empty_agent",
    description: "Agent without state outputs.",
    ui: { position: { x: 520, y: 220 } },
    reads: [{ state: "question", required: true }],
    writes: [],
    config: {
      skillKey: "",
      taskInstruction: "",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };
  const emptyInput: GraphNode = {
    kind: "input",
    name: "empty_input",
    description: "Input without a state output.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [],
    config: {
      value: "",
    },
  };

  const agentModel = buildNodeCardViewModel("empty_agent", emptyAgent, stateSchema);
  const inputModel = buildNodeCardViewModel("empty_input", emptyInput, stateSchema);

  assert.deepEqual(agentModel.outputs, [
    {
      key: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      label: "+ output",
      typeLabel: "+ output",
      stateColor: "#9a3412",
      virtual: true,
    },
  ]);
  assert.equal(agentModel.body.kind, "agent");
  assert.equal(agentModel.body.primaryOutput?.key, VIRTUAL_ANY_OUTPUT_STATE_KEY);
  assert.equal(agentModel.body.primaryOutput?.virtual, true);
  assert.deepEqual(inputModel.outputs, [
    {
      key: VIRTUAL_ANY_OUTPUT_STATE_KEY,
      label: "+ output",
      typeLabel: "+ output",
      stateColor: "#9a3412",
      virtual: true,
    },
  ]);
  assert.equal(inputModel.body.kind, "input");
  assert.equal(inputModel.body.primaryOutput?.key, VIRTUAL_ANY_OUTPUT_STATE_KEY);
  assert.equal(inputModel.body.primaryOutput?.virtual, true);
  assert.equal(inputModel.body.valueText, "");
});

test("buildNodeCardViewModel derives empty input editor mode from its virtual boundary config", () => {
  const emptyFileInput: GraphNode = {
    kind: "input",
    name: "empty_file_input",
    description: "Input without a materialized state output.",
    ui: { position: { x: 80, y: 220 } },
    reads: [],
    writes: [],
    config: {
      value: "",
      boundaryType: "file",
    },
  };
  const emptyKnowledgeInput: GraphNode = {
    kind: "input",
    name: "empty_kb_input",
    description: "Input without a materialized state output.",
    ui: { position: { x: 80, y: 420 } },
    reads: [],
    writes: [],
    config: {
      value: "docs",
      boundaryType: "knowledge_base",
    },
  };

  const fileModel = buildNodeCardViewModel("empty_file_input", emptyFileInput, stateSchema);
  const knowledgeModel = buildNodeCardViewModel("empty_kb_input", emptyKnowledgeInput, stateSchema);

  assert.equal(fileModel.body.kind, "input");
  assert.equal(fileModel.body.editorMode, "asset");
  assert.equal(fileModel.body.assetType, "file");
  assert.equal(fileModel.body.primaryOutput?.key, VIRTUAL_ANY_OUTPUT_STATE_KEY);
  assert.equal(fileModel.body.primaryOutput?.virtual, true);
  assert.equal(knowledgeModel.body.kind, "input");
  assert.equal(knowledgeModel.body.editorMode, "knowledge_base");
  assert.equal(knowledgeModel.body.valueText, "docs");
  assert.equal(knowledgeModel.body.primaryOutput?.key, VIRTUAL_ANY_OUTPUT_STATE_KEY);
});

test("buildNodeCardViewModel derives output preview source from state schema", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema);

  assert.equal(model.kindLabel, "OUTPUT");
  assert.equal(model.body.kind, "output");
  assert.equal(model.body.previewTitle, "Preview");
  assert.equal(model.body.connectedStateLabel, "answer");
  assert.equal(model.body.displayModeLabel, "PLAIN");
  assert.equal(model.body.displayMode, "plain");
  assert.equal(model.body.previewText, "Connected to answer. Run the graph to preview/export it.");
  assert.equal(model.body.persistLabel, "Save off");
});

test("buildNodeCardViewModel shows the auto-detected output display format", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, {
    ...stateSchema,
    answer: {
      ...stateSchema.answer,
      value: '{"answer":"GraphiteUI","ok":true}',
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.displayMode, "json");
  assert.equal(model.body.displayModeLabel, "JSON");
});

test("buildNodeCardViewModel exposes configured document output display format", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_sources",
    description: "Preview fetched source documents.",
    ui: { position: { x: 980, y: 420 } },
    reads: [{ state: "source_documents", required: false }],
    writes: [],
    config: {
      displayMode: "documents",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_sources", node, {
    ...stateSchema,
    source_documents: {
      name: "source_documents",
      description: "",
      type: "json",
      value: [{ title: "Article", local_path: "run_1/search/doc_001.md" }],
      color: "#1d4ed8",
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.displayMode, "documents");
  assert.equal(model.body.displayModeLabel, "DOCS");
});

test("buildNodeCardViewModel auto-displays file output state arrays as documents", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_artifacts",
    description: "Preview fetched source documents.",
    ui: { position: { x: 980, y: 420 } },
    reads: [{ state: "artifact_paths", required: false }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_artifacts", node, {
    ...stateSchema,
    artifact_paths: {
      name: "Artifact Paths",
      description: "Local fetched documents.",
      type: "file",
      value: ["run_1/searcher/web_search/invocation_001/doc_001.md"],
      color: "#1d4ed8",
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.displayMode, "documents");
  assert.equal(model.body.displayModeLabel, "DOCS");
});

test("buildNodeCardViewModel uses the legacy output empty state when no upstream state is connected", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema);

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.connectedStateLabel, null);
  assert.equal(model.body.previewText, "Connect an upstream output to preview/export it.");
});

test("buildNodeCardViewModel previews connected state values before a run result exists", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "markdown",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, {
    ...stateSchema,
    answer: {
      ...stateSchema.answer,
      value: "# 最终答案\n\nGraphiteUI 已迁移完成。",
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.displayMode, "markdown");
  assert.equal(model.body.previewText, "# 最终答案\n\nGraphiteUI 已迁移完成。");
});

test("buildNodeCardViewModel uses legacy shorthand label for markdown output display mode", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_markdown",
    description: "Preview markdown answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "markdown",
      persistEnabled: true,
      persistFormat: "md",
      fileNameTemplate: "answer.md",
    },
  };

  const model = buildNodeCardViewModel("output_markdown", node, stateSchema);

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.displayModeLabel, "MD");
  assert.equal(model.body.persistLabel, "Save on");
  assert.equal(model.body.persistFormatLabel, "MD");
  assert.equal(model.body.fileNameTemplate, "answer.md");
});

test("buildNodeCardViewModel prefers latest run output preview and display mode for output nodes", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema, {
    runtime: {
      latestRunStatus: "completed",
      outputPreviewText: "# 最终答案\n\nGraphiteUI 已迁移完成。",
      outputDisplayMode: "markdown",
      failedMessage: null,
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.previewText, "# 最终答案\n\nGraphiteUI 已迁移完成。");
  assert.equal(model.body.displayModeLabel, "MD");
});

test("buildNodeCardViewModel lets manual output display mode override detected runtime format", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "plain",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema, {
    runtime: {
      latestRunStatus: "completed",
      outputPreviewText: "# 最终答案\n\nGraphiteUI 已迁移完成。",
      outputDisplayMode: "markdown",
      failedMessage: null,
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.previewText, "# 最终答案\n\nGraphiteUI 已迁移完成。");
  assert.equal(model.body.displayMode, "plain");
  assert.equal(model.body.displayModeLabel, "PLAIN");
});

test("buildNodeCardViewModel keeps active output runs in a stable pending preview state", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema, {
    runtime: {
      latestRunStatus: "running",
      outputPreviewText: null,
      outputDisplayMode: null,
      failedMessage: null,
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.previewText, "Waiting for output...");
});

test("buildNodeCardViewModel reports missing output preview after a completed run", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema, {
    runtime: {
      latestRunStatus: "completed",
      outputPreviewText: null,
      outputDisplayMode: null,
      failedMessage: null,
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.previewText, "Latest run completed, but this output did not produce a value.");
});

test("buildNodeCardViewModel reports upstream run failure before an output was produced", () => {
  const node: GraphNode = {
    kind: "output",
    name: "output_answer",
    description: "Preview the final answer.",
    ui: { position: { x: 980, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      displayMode: "auto",
      persistEnabled: false,
      persistFormat: "auto",
      fileNameTemplate: "",
    },
  };

  const model = buildNodeCardViewModel("output_answer", node, stateSchema, {
    runtime: {
      latestRunStatus: "failed",
      outputPreviewText: null,
      outputDisplayMode: null,
      failedMessage: null,
    },
  });

  assert.equal(model.body.kind, "output");
  assert.equal(model.body.previewText, "Latest run failed before this output was produced.");
});

test("buildNodeCardViewModel exposes node-level latest run failure notes", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "answer_helper",
    description: "Answer the question directly without external tools.",
    ui: { position: { x: 520, y: 220 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skillKey: "",
      taskInstruction: "请直接用中文回答用户问题。",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };

  const model = buildNodeCardViewModel("answer_helper", node, stateSchema, {
    runtime: {
      latestRunStatus: "failed",
      outputPreviewText: null,
      outputDisplayMode: null,
      failedMessage: "Tool execution crashed.",
    },
  });

  assert.deepEqual(model.runtimeNote, {
    tone: "danger",
    label: "Latest run",
    text: "Latest run failed here:\nTool execution crashed.",
  });
});

test("buildNodeCardViewModel derives proxy-style condition routing controls", () => {
  const node: GraphNode = {
    kind: "condition",
    name: "continue_check",
    description: "Continue or retry.",
    ui: { position: { x: 780, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      branches: ["true", "false", "exhausted"],
      loopLimit: 5,
      branchMapping: {
        true: "true",
        false: "false",
      },
      rule: {
        source: "answer",
        operator: "exists",
        value: null,
      },
    },
  };

  const model = buildNodeCardViewModel("continue_check", node, stateSchema);

  assert.equal(model.body.kind, "condition");
  assert.deepEqual(model.branches.map((branch) => branch.label), ["true", "false", "exhausted"]);
  assert.equal(model.body.sourceLabel, "answer");
  assert.equal(model.body.operatorLabel, "exists");
  assert.equal(model.body.valueLabel, "null");
  assert.equal(model.body.primaryInput?.label, "answer");
  assert.deepEqual(model.body.routeOutputs, [
    { branch: "true", routeTargetLabel: null, tone: "success" },
    { branch: "false", routeTargetLabel: null, tone: "danger" },
    { branch: "exhausted", routeTargetLabel: null, tone: "neutral" },
  ]);
  assert.deepEqual(model.stateSummary?.reads, ["answer"]);
  assert.deepEqual(model.stateSummary?.writes, []);
});

test("buildNodeCardViewModel derives condition route target labels for proxy outputs", () => {
  const node: GraphNode = {
    kind: "condition",
    name: "continue_check",
    description: "Continue or retry.",
    ui: { position: { x: 780, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      branches: ["continue", "retry"],
      loopLimit: 5,
      branchMapping: {
        true: "continue",
        false: "retry",
      },
      rule: {
        source: "answer",
        operator: "exists",
        value: null,
      },
    },
  };

  const model = buildNodeCardViewModel("continue_check", node, stateSchema, {
    conditionRouteTargets: {
      continue: "next_agent",
      retry: null,
    },
  });

  assert.equal(model.body.kind, "condition");
  assert.deepEqual(model.body.routeOutputs, [
    { branch: "continue", routeTargetLabel: "next_agent", tone: "success" },
    { branch: "retry", routeTargetLabel: null, tone: "danger" },
  ]);
});

test("buildNodeCardViewModel derives subgraph boundary and thumbnail summary", () => {
  const node: GraphNode = {
    kind: "subgraph",
    name: "Research Flow Subgraph",
    description: "Reusable nested graph.",
    ui: { position: { x: 100, y: 100 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      graph: {
        state_schema: {
          internal_question: {
            name: "Internal Question",
            description: "",
            type: "text",
            value: "",
            color: "#d97706",
          },
          internal_answer: {
            name: "Internal Answer",
            description: "",
            type: "markdown",
            value: "",
            color: "#2563eb",
          },
        },
        nodes: {
          input_question: {
            kind: "input",
            name: "Input",
            description: "",
            ui: { position: { x: 0, y: 0 } },
            reads: [],
            writes: [{ state: "internal_question", mode: "replace" }],
            config: { value: "" },
          },
          summarize: {
            kind: "agent",
            name: "Summarize",
            description: "",
            ui: { position: { x: 260, y: 0 } },
            reads: [{ state: "internal_question", required: true }],
            writes: [{ state: "internal_answer", mode: "replace" }],
            config: {
              skillKey: "web_search",
              taskInstruction: "",
              modelSource: "global",
              model: "",
              thinkingMode: "high",
              temperature: 0.2,
            },
          },
          output_answer: {
            kind: "output",
            name: "Output",
            description: "",
            ui: { position: { x: 520, y: 0 } },
            reads: [{ state: "internal_answer", required: true }],
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
          { source: "input_question", target: "summarize" },
          { source: "summarize", target: "output_answer" },
        ],
        conditional_edges: [],
        metadata: {},
      },
    },
  };

  const model = buildNodeCardViewModel("research_subgraph", node, stateSchema);

  assert.equal(model.kindLabel, "SUBGRAPH");
  assert.equal(model.body.kind, "subgraph");
  assert.deepEqual(model.body.thumbnailNodes.map((item) => item.label), ["Summarize"]);
  assert.deepEqual(
    model.body.thumbnailNodes.map((item) => ({ id: item.id, column: item.column, row: item.row, status: item.status, active: item.active })),
    [
      { id: "summarize", column: 1, row: 1, status: "idle", active: false },
    ],
  );
  assert.deepEqual(model.body.thumbnailEdges, []);
  assert.equal(model.body.thumbnailColumnCount, 1);
  assert.equal(model.body.thumbnailRowCount, 1);
  assert.equal(model.body.inputCount, 1);
  assert.equal(model.body.outputCount, 1);
  assert.deepEqual(model.body.capabilities, ["web_search"]);
});

test("buildNodeCardViewModel projects subgraph runtime status onto thumbnail nodes", () => {
  const node: GraphNode = {
    kind: "subgraph",
    name: "Research Flow Subgraph",
    description: "Reusable nested graph.",
    ui: { position: { x: 100, y: 100 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      graph: {
        state_schema: {},
        nodes: {
          input_question: {
            kind: "input",
            name: "Input",
            description: "",
            ui: { position: { x: 0, y: 0 } },
            reads: [],
            writes: [],
            config: { value: "" },
          },
          search_sources: {
            kind: "agent",
            name: "Search Sources",
            description: "",
            ui: { position: { x: 260, y: 0 } },
            reads: [],
            writes: [],
            config: {
              skillKey: "web_search",
              taskInstruction: "",
              modelSource: "global",
              model: "",
              thinkingMode: "high",
              temperature: 0.2,
            },
          },
          summarize: {
            kind: "agent",
            name: "Summarize Evidence",
            description: "",
            ui: { position: { x: 520, y: 0 } },
            reads: [],
            writes: [],
            config: {
              skillKey: "",
              taskInstruction: "",
              modelSource: "global",
              model: "",
              thinkingMode: "high",
              temperature: 0.2,
            },
          },
        },
        edges: [
          { source: "input_question", target: "search_sources" },
          { source: "search_sources", target: "summarize" },
        ],
        conditional_edges: [],
        metadata: {},
      },
    },
  };

  const model = buildNodeCardViewModel("research_subgraph", node, stateSchema, {
    runtime: {
      subgraphNodeStatusMap: {
        input_question: "success",
        search_sources: "success",
        summarize: "running",
      },
    },
  });

  assert.equal(model.body.kind, "subgraph");
  assert.deepEqual(
    model.body.thumbnailNodes.map((item) => ({ id: item.id, label: item.label, status: item.status, active: item.active })),
    [
      { id: "search_sources", label: "Search Sources", status: "success", active: false },
      { id: "summarize", label: "Summarize Evidence", status: "running", active: true },
    ],
  );
  assert.deepEqual(model.body.runtimeSummary, {
    tone: "running",
    completedCount: 1,
    activeCount: 1,
    failedCount: 0,
    totalCount: 2,
    currentNodeLabel: "Summarize Evidence",
  });
});

test("buildNodeCardViewModel compacts subgraph thumbnails and includes condition branches", () => {
  const agentConfig = {
    skillKey: "",
    taskInstruction: "",
    modelSource: "global" as const,
    model: "",
    thinkingMode: "high" as const,
    temperature: 0.2,
  };
  const node: GraphNode = {
    kind: "subgraph",
    name: "Looping Research Subgraph",
    description: "Reusable nested graph.",
    ui: { position: { x: 100, y: 100 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      graph: {
        state_schema: {},
        nodes: {
          start: {
            kind: "input",
            name: "Start",
            description: "",
            ui: { position: { x: 0, y: 0 } },
            reads: [],
            writes: [],
            config: { value: "" },
          },
          search: {
            kind: "agent",
            name: "Search",
            description: "",
            ui: { position: { x: 400, y: 0 } },
            reads: [],
            writes: [],
            config: agentConfig,
          },
          review: {
            kind: "condition",
            name: "Review",
            description: "",
            ui: { position: { x: 800, y: 0 } },
            reads: [],
            writes: [],
            config: {
              branches: ["true", "false", "exhausted"],
              loopLimit: 5,
              branchMapping: { true: "true", false: "false" },
              rule: { source: "answer", operator: "exists", value: null },
            },
          },
          refine: {
            kind: "agent",
            name: "Refine Query",
            description: "",
            ui: { position: { x: 1200, y: 0 } },
            reads: [],
            writes: [],
            config: agentConfig,
          },
          final: {
            kind: "agent",
            name: "Final Answer",
            description: "",
            ui: { position: { x: 1600, y: 0 } },
            reads: [],
            writes: [],
            config: agentConfig,
          },
          done: {
            kind: "output",
            name: "Done",
            description: "",
            ui: { position: { x: 2000, y: 0 } },
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
          { source: "start", target: "search" },
          { source: "search", target: "review" },
          { source: "refine", target: "search" },
          { source: "final", target: "done" },
        ],
        conditional_edges: [
          {
            source: "review",
            branches: {
              true: "refine",
              false: "final",
              exhausted: "final",
            },
          },
        ],
        metadata: {},
      },
    },
  };

  const model = buildNodeCardViewModel("research_subgraph", node, stateSchema);

  assert.equal(model.body.kind, "subgraph");
  assert.equal(model.body.thumbnailColumnCount, 4);
  assert.equal(model.body.thumbnailRowCount, 1);
  assert.deepEqual(
    model.body.thumbnailNodes.map((item) => ({ id: item.id, column: item.column, row: item.row })),
    [
      { id: "search", column: 1, row: 1 },
      { id: "review", column: 2, row: 1 },
      { id: "refine", column: 3, row: 1 },
      { id: "final", column: 4, row: 1 },
    ],
  );
  assert.deepEqual(
    model.body.thumbnailEdges.map((edge) => `${edge.source}->${edge.target}`),
    ["search->review", "refine->search", "review->refine", "review->final"],
  );
});

test("buildNodeCardViewModel marks exhausted condition routes as neutral", () => {
  const node: GraphNode = {
    kind: "condition",
    name: "retry_guard",
    description: "Stop retry loops.",
    ui: { position: { x: 780, y: 220 } },
    reads: [{ state: "answer", required: true }],
    writes: [],
    config: {
      branches: ["true", "false", "exhausted"],
      loopLimit: 5,
      branchMapping: {
        true: "true",
        false: "false",
      },
      rule: {
        source: "answer",
        operator: "exists",
        value: null,
      },
    },
  };

  const model = buildNodeCardViewModel("retry_guard", node, stateSchema);

  assert.equal(model.body.kind, "condition");
  assert.deepEqual(model.body.routeOutputs.map((output) => ({ branch: output.branch, tone: output.tone })), [
    { branch: "true", tone: "success" },
    { branch: "false", tone: "danger" },
    { branch: "exhausted", tone: "neutral" },
  ]);
});

test("buildNodeCardViewModel derives unlimited loop label and selected skill", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "multi_skill_agent",
    description: "",
    ui: { position: { x: 0, y: 0 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skillKey: "browser.search",
      taskInstruction: "",
      modelSource: "override",
      model: "gpt-5.4",
      thinkingMode: "off",
      temperature: 0.3,
    },
  };

  const model = buildNodeCardViewModel("multi_skill_agent", node, stateSchema);

  assert.equal(model.body.kind, "agent");
  assert.equal(model.body.skillLabel, "browser.search");
  assert.equal(model.body.modelLabel, "gpt-5.4");
  assert.equal(model.body.thinkingLabel, "thinking off");
});

test("buildNodeCardViewModel presents xhigh thinking as Extra High", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "deep_agent",
    description: "",
    ui: { position: { x: 320, y: 160 } },
    reads: [],
    writes: [],
    config: {
      skillKey: "",
      taskInstruction: "",
      modelSource: "override",
      model: "gpt-5.5",
      thinkingMode: "xhigh",
      temperature: 0.3,
    },
  };

  const model = buildNodeCardViewModel("deep_agent", node, stateSchema);

  assert.equal(model.body.kind, "agent");
  assert.equal(model.body.thinkingLabel, "thinking Extra High");
});
