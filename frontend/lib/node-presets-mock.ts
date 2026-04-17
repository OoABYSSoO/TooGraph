import type { CanonicalPresetDocument } from "@/lib/node-system-canonical";

const DEFAULT_PRESET_POSITION = { x: 0, y: 0 };

function createCanonicalPresetDocument(preset: CanonicalPresetDocument): CanonicalPresetDocument {
  return preset;
}

export const EMPTY_AGENT_PRESET = createCanonicalPresetDocument({
  presetId: "preset.agent.empty.v0",
  definition: {
    label: "Empty Agent Node",
    description: "A blank agent node. Configure inputs, outputs, instructions and attached skills yourself.",
    state_schema: {},
    node: {
      kind: "agent",
      name: "Empty Agent Node",
      description: "A blank agent node. Configure inputs, outputs, instructions and attached skills yourself.",
      ui: {
        position: DEFAULT_PRESET_POSITION,
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
});

export const TEXT_INPUT_PRESET = createCanonicalPresetDocument({
  presetId: "preset.input.text.v1",
  definition: {
    label: "Text Input",
    description: "Provide text to the workflow.",
    state_schema: {
      value: {
        name: "Text",
        description: "",
        type: "text",
        value: "",
        color: "",
      },
    },
    node: {
      kind: "input",
      name: "Text Input",
      description: "Provide text to the workflow.",
      ui: {
        position: DEFAULT_PRESET_POSITION,
        collapsed: false,
      },
      reads: [],
      writes: [{ state: "value", mode: "replace" }],
      config: {
        value: "",
      },
    },
  },
});

export const QUESTION_INPUT_PRESET = createCanonicalPresetDocument({
  presetId: "preset.input.question.v1",
  definition: {
    label: "Question Input",
    description: "Ask a question and route it into the workflow.",
    state_schema: {
      question: {
        name: "Question",
        description: "",
        type: "text",
        value: "",
        color: "",
      },
    },
    node: {
      kind: "input",
      name: "Question Input",
      description: "Ask a question and route it into the workflow.",
      ui: {
        position: DEFAULT_PRESET_POSITION,
        collapsed: false,
      },
      reads: [],
      writes: [{ state: "question", mode: "replace" }],
      config: {
        value: "",
      },
    },
  },
});

export const KNOWLEDGE_BASE_INPUT_PRESET = createCanonicalPresetDocument({
  presetId: "preset.input.knowledge_base.v1",
  definition: {
    label: "Knowledge Base",
    description: "Select a knowledge base to provide to downstream agents.",
    state_schema: {
      knowledge_base: {
        name: "Knowledge Base",
        description: "",
        type: "knowledge_base",
        value: "graphiteui-official",
        color: "",
      },
    },
    node: {
      kind: "input",
      name: "Knowledge Base",
      description: "Select a knowledge base to provide to downstream agents.",
      ui: {
        position: DEFAULT_PRESET_POSITION,
        collapsed: false,
      },
      reads: [],
      writes: [{ state: "knowledge_base", mode: "replace" }],
      config: {
        value: "graphiteui-official",
      },
    },
  },
});

export const TEXT_OUTPUT_PRESET = createCanonicalPresetDocument({
  presetId: "preset.output.text.v1",
  definition: {
    label: "Text Output",
    description: "Preview and optionally persist text content.",
    state_schema: {
      value: {
        name: "Value",
        description: "",
        type: "text",
        value: "",
        color: "",
      },
    },
    node: {
      kind: "output",
      name: "Text Output",
      description: "Preview and optionally persist text content.",
      ui: {
        position: DEFAULT_PRESET_POSITION,
        collapsed: false,
      },
      reads: [{ state: "value", required: true }],
      writes: [],
      config: {
        displayMode: "auto",
        persistEnabled: false,
        persistFormat: "auto",
        fileNameTemplate: "",
      },
    },
  },
});

export const NODE_PRESETS_MOCK = [
  EMPTY_AGENT_PRESET,
] satisfies CanonicalPresetDocument[];

const STATIC_NODE_DEFINITIONS = [
  EMPTY_AGENT_PRESET,
  TEXT_INPUT_PRESET,
  QUESTION_INPUT_PRESET,
  KNOWLEDGE_BASE_INPUT_PRESET,
  TEXT_OUTPUT_PRESET,
  ...NODE_PRESETS_MOCK,
] satisfies CanonicalPresetDocument[];

export function getNodePresetById(presetId: string) {
  return STATIC_NODE_DEFINITIONS.find((preset) => preset.presetId === presetId);
}
