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
  responseMode: "json",
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
  defaultValue: "Abyss",
  inputMode: "inline",
  placeholder: "Enter text",
} satisfies NodePresetDefinition;

export const NAME_INPUT_PRESET = {
  presetId: "preset.input.name.v1",
  label: "Name Input",
  description: "Provide a name used by greeting workflows.",
  family: "input",
  valueType: "text",
  output: {
    key: "name",
    label: "Name",
    valueType: "text",
  },
  defaultValue: "Abyss",
  inputMode: "inline",
  placeholder: "Enter a name",
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
  persistFormat: "txt",
  fileNameTemplate: "result",
} satisfies NodePresetDefinition;

export const SUMMARY_AGENT_PRESET = {
  presetId: "preset.agent.summary.v1",
  label: "Text Summary",
  description: "Summarize incoming text into a shorter structured result.",
  family: "agent",
  inputs: [
    {
      key: "source_text",
      label: "Source Text",
      valueType: "text",
      required: true,
    },
  ],
  outputs: [
    {
      key: "summary",
      label: "Summary",
      valueType: "text",
    },
  ],
  systemInstruction: "You are a concise workflow summarization agent.",
  taskInstruction: "Read the source text and return a concise summary.",
  skills: [],
  responseMode: "json",
  outputBinding: {
    summary: "$response.summary",
  },
} satisfies NodePresetDefinition;

export const HELLO_GREETING_AGENT_PRESET = {
  presetId: "preset.agent.hello_greeting.v1",
  label: "Hello Greeting",
  description: "Generate a short greeting by calling the hello greeting skill.",
  family: "agent",
  inputs: [
    {
      key: "name",
      label: "Name",
      valueType: "text",
      required: true,
    },
  ],
  outputs: [
    {
      key: "greeting",
      label: "Greeting",
      valueType: "text",
    },
  ],
  systemInstruction: "You are a precise assistant.",
  taskInstruction: "Return a short greeting for the provided name.",
  skills: [
    {
      name: "generate_greeting",
      skillKey: "generate_hello_greeting",
      inputMapping: {
        name: "$inputs.name",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    greeting: "$skills.generate_greeting.greeting",
  },
} satisfies NodePresetDefinition;

export const GREETING_OUTPUT_PRESET = {
  presetId: "preset.output.greeting.v1",
  label: "Greeting Output",
  description: "Preview and optionally persist the generated greeting.",
  family: "output",
  input: {
    key: "value",
    label: "Greeting",
    valueType: "text",
    required: true,
  },
  displayMode: "auto",
  persistEnabled: false,
  persistFormat: "txt",
  fileNameTemplate: "greeting",
} satisfies NodePresetDefinition;

export const FETCH_NEWS_AGENT_PRESET = {
  presetId: "preset.agent.fetch_news.v1",
  label: "Fetch News",
  description: "Use a news fetching skill and return normalized news items.",
  family: "agent",
  inputs: [
    {
      key: "feed_urls",
      label: "Feed URLs",
      valueType: "json",
      required: true,
    },
  ],
  outputs: [
    {
      key: "news_items",
      label: "News Items",
      valueType: "json",
    },
    {
      key: "summary",
      label: "Summary",
      valueType: "text",
    },
  ],
  systemInstruction: "You are a research workflow agent specialized in fetching and organizing news items.",
  taskInstruction: "Use the attached skill to fetch feeds, then summarize the retrieved items.",
  skills: [
    {
      name: "fetch_news",
      skillKey: "fetch_news_feed",
      inputMapping: {
        feed_urls: "$inputs.feed_urls",
      },
      contextBinding: {
        fetched_news: "$skills.fetch_news.news_items",
      },
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    news_items: "$context.fetched_news",
    summary: "$response.summary",
  },
} satisfies NodePresetDefinition;

export const REVIEW_GATE_PRESET = {
  presetId: "preset.condition.review_gate.v1",
  label: "Review Gate",
  description: "Route the flow according to a review result.",
  family: "condition",
  inputs: [
    {
      key: "review_result",
      label: "Review Result",
      valueType: "json",
      required: true,
    },
  ],
  branches: [
    { key: "pass", label: "Pass" },
    { key: "revise", label: "Revise" },
  ],
  conditionMode: "rule",
  rule: {
    source: "$inputs.review_result.needs_revision",
    operator: "==",
    value: false,
  },
  branchMapping: {
    true: "pass",
    false: "revise",
  },
} satisfies NodePresetDefinition;

export const NODE_PRESETS_MOCK = [
  EMPTY_AGENT_PRESET,
  NAME_INPUT_PRESET,
  TEXT_INPUT_PRESET,
  HELLO_GREETING_AGENT_PRESET,
  SUMMARY_AGENT_PRESET,
  FETCH_NEWS_AGENT_PRESET,
  REVIEW_GATE_PRESET,
  GREETING_OUTPUT_PRESET,
  TEXT_OUTPUT_PRESET,
] satisfies NodePresetDefinition[];

export function getNodePresetById(presetId: string) {
  return NODE_PRESETS_MOCK.find((preset) => preset.presetId === presetId);
}

export function getSuggestedPresets(valueType?: ValueType | null) {
  if (!valueType) {
    return [EMPTY_AGENT_PRESET, NAME_INPUT_PRESET, TEXT_INPUT_PRESET, HELLO_GREETING_AGENT_PRESET, SUMMARY_AGENT_PRESET, FETCH_NEWS_AGENT_PRESET, REVIEW_GATE_PRESET, GREETING_OUTPUT_PRESET, TEXT_OUTPUT_PRESET];
  }

  const supportsType = (preset: NodePresetDefinition) => {
    if (preset.family === "agent") {
      return preset.inputs.some((input) => input.valueType === "any" || input.valueType === valueType);
    }
    if (preset.family === "condition") {
      return preset.inputs.some((input) => input.valueType === "any" || input.valueType === valueType);
    }
    if (preset.family === "output") {
      return preset.input.valueType === "any" || preset.input.valueType === valueType;
    }
    return false;
  };

  return [EMPTY_AGENT_PRESET, ...NODE_PRESETS_MOCK.filter((preset) => preset.presetId !== EMPTY_AGENT_PRESET.presetId && supportsType(preset))];
}
