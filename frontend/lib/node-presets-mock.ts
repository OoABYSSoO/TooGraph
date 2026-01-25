import type { NodePresetDefinition, ValueType } from "@/lib/node-system-schema";

export const EMPTY_AGENT_PRESET = {
  presetId: "preset.agent.empty.v0",
  label: "Empty Agent Node",
  description: "A blank agent node. Configure inputs, outputs, instructions and attached skills yourself.",
  family: "agent",
  inputs: [],
  outputs: [],
  systemInstruction: "",
  taskInstruction: "",
  skills: [],
  outputBinding: {},
} satisfies NodePresetDefinition;

export const TEXT_INPUT_PRESET = {
  presetId: "preset.input.text.v1",
  label: "Text Input",
  description: "Provide text to the workflow.",
  family: "input",
  valueType: "text",
  output: {
    key: "value",
    label: "Text",
    valueType: "text",
  },
  defaultValue: "",
  placeholder: "Enter text",
} satisfies NodePresetDefinition;

export const QUESTION_INPUT_PRESET = {
  presetId: "preset.input.question.v1",
  label: "Question Input",
  description: "Ask a question and route it into the workflow.",
  family: "input",
  valueType: "text",
  output: {
    key: "question",
    label: "Question",
    valueType: "text",
  },
  defaultValue: "",
  placeholder: "Type your question",
} satisfies NodePresetDefinition;

export const KNOWLEDGE_BASE_INPUT_PRESET = {
  presetId: "preset.input.knowledge_base.v1",
  label: "Knowledge Base",
  description: "Select a knowledge base to provide to downstream agents.",
  family: "input",
  valueType: "knowledge_base",
  output: {
    key: "knowledge_base",
    label: "Knowledge Base",
    valueType: "knowledge_base",
  },
  defaultValue: "GraphiteUI-official",
  placeholder: "Knowledge base name",
} satisfies NodePresetDefinition;

export const TEXT_OUTPUT_PRESET = {
  presetId: "preset.output.text.v1",
  label: "Text Output",
  description: "Preview and optionally persist text content.",
  family: "output",
  input: {
    key: "value",
    label: "Value",
    valueType: "text",
    required: true,
  },
  displayMode: "auto",
  persistEnabled: false,
  persistFormat: "auto",
  fileNameTemplate: "",
} satisfies NodePresetDefinition;

export const NODE_PRESETS_MOCK = [
  EMPTY_AGENT_PRESET,
] satisfies NodePresetDefinition[];

const STATIC_NODE_DEFINITIONS = [
  EMPTY_AGENT_PRESET,
  TEXT_INPUT_PRESET,
  QUESTION_INPUT_PRESET,
  KNOWLEDGE_BASE_INPUT_PRESET,
  TEXT_OUTPUT_PRESET,
  ...NODE_PRESETS_MOCK,
] satisfies NodePresetDefinition[];

export function getNodePresetById(presetId: string) {
  return STATIC_NODE_DEFINITIONS.find((preset) => preset.presetId === presetId);
}

export function getSuggestedPresets(valueType?: ValueType | null) {
  if (!valueType) {
    return NODE_PRESETS_MOCK;
  }

  const supportsType = (preset: NodePresetDefinition) => {
    if (preset.family === "agent") {
      return preset.inputs.some((input) => input.valueType === "any" || input.valueType === valueType);
    }
    if (preset.family === "condition") {
      return preset.inputs.some((input) => input.valueType === "any" || input.valueType === valueType);
    }
    return false;
  };

  return [EMPTY_AGENT_PRESET, ...NODE_PRESETS_MOCK.filter((preset) => preset.presetId !== EMPTY_AGENT_PRESET.presetId && supportsType(preset))];
}
