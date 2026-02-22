import test from "node:test";
import assert from "node:assert/strict";

import { buildNodeCardViewModel } from "./nodeCardViewModel.ts";
import { VIRTUAL_ANY_INPUT_STATE_KEY } from "../../lib/virtual-any-input.ts";
import type { GraphNode, StateDefinition } from "../../types/node-system.ts";

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
      skills: [],
      taskInstruction: "请直接用中文回答用户问题。",
      modelSource: "global",
      model: "",
      thinkingMode: "on",
      temperature: 0.2,
    },
  };

  const model = buildNodeCardViewModel("answer_helper", node, stateSchema);

  assert.equal(model.kindLabel, "AGENT");
  assert.deepEqual(model.inputs.map((port) => port.label), ["question"]);
  assert.deepEqual(model.outputs.map((port) => port.label), ["answer"]);
  assert.equal(model.body.kind, "agent");
  assert.ok(!("systemInstruction" in model.body));
  assert.equal(model.body.taskInstruction, "请直接用中文回答用户问题。");
  assert.equal(model.body.skillLabel, "No skills");
  assert.equal(model.body.primaryInput?.label, "question");
  assert.equal(model.body.primaryOutput?.label, "answer");
  assert.equal(model.body.primaryInput?.typeLabel, "text");
  assert.deepEqual(model.stateSummary?.reads, ["question"]);
  assert.deepEqual(model.stateSummary?.writes, ["answer"]);
});

test("buildNodeCardViewModel exposes a virtual any input for empty non-input nodes", () => {
  const emptyAgent: GraphNode = {
    kind: "agent",
    name: "empty_agent",
    description: "Agent without state inputs.",
    ui: { position: { x: 520, y: 220 } },
    reads: [],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skills: [],
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
  const inputModel = buildNodeCardViewModel("input_question", inputNode, stateSchema);

  assert.deepEqual(agentModel.inputs, [
    {
      key: VIRTUAL_ANY_INPUT_STATE_KEY,
      label: "any",
      typeLabel: "any",
      stateColor: "#9a3412",
      virtual: true,
    },
  ]);
  assert.equal(agentModel.body.kind, "agent");
  assert.equal(agentModel.body.primaryInput?.key, VIRTUAL_ANY_INPUT_STATE_KEY);
  assert.equal(agentModel.body.primaryInput?.virtual, true);
  assert.equal(outputModel.body.kind, "output");
  assert.equal(outputModel.body.primaryInput?.key, VIRTUAL_ANY_INPUT_STATE_KEY);
  assert.equal(outputModel.body.primaryInput?.virtual, true);
  assert.equal(outputModel.body.connectedStateKey, null);
  assert.deepEqual(inputModel.inputs, []);
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
  assert.equal(model.body.displayModeLabel, "AUTO");
  assert.equal(model.body.displayMode, "auto");
  assert.equal(model.body.previewText, "Connected to answer. Run the graph to preview/export it.");
  assert.equal(model.body.persistLabel, "Save off");
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
      skills: [],
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

  const model = buildNodeCardViewModel("continue_check", node, stateSchema);

  assert.equal(model.body.kind, "condition");
  assert.deepEqual(model.branches.map((branch) => branch.label), ["continue", "retry"]);
  assert.equal(model.body.sourceLabel, "answer");
  assert.equal(model.body.operatorLabel, "exists");
  assert.equal(model.body.valueLabel, "null");
  assert.equal(model.body.maxLoopsLabel, "5");
  assert.equal(model.body.primaryInput?.label, "answer");
  assert.deepEqual(model.body.routeOutputs, [
    { branch: "continue", routeTargetLabel: null, tone: "success" },
    { branch: "retry", routeTargetLabel: null, tone: "danger" },
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

test("buildNodeCardViewModel derives unlimited loop label and multiple skills", () => {
  const node: GraphNode = {
    kind: "agent",
    name: "multi_skill_agent",
    description: "",
    ui: { position: { x: 0, y: 0 } },
    reads: [{ state: "question", required: true }],
    writes: [{ state: "answer", mode: "replace" }],
    config: {
      skills: ["kb.lookup", "browser.search"],
      taskInstruction: "",
      modelSource: "override",
      model: "gpt-5.4",
      thinkingMode: "off",
      temperature: 0.3,
    },
  };

  const model = buildNodeCardViewModel("multi_skill_agent", node, stateSchema);

  assert.equal(model.body.kind, "agent");
  assert.equal(model.body.skillLabel, "2 skills");
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
      skills: [],
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
