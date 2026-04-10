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

export const TASK_INPUT_PRESET = {
  presetId: "preset.input.task_input.v1",
  label: "Task Input",
  description: "Provide the workflow task or research question.",
  family: "input",
  valueType: "text",
  output: {
    key: "task_input",
    label: "Task Input",
    valueType: "text",
  },
  defaultValue: "Research current SLG mobile ad market hooks and summarize reusable signals.",
  inputMode: "inline",
  placeholder: "Describe the workflow task",
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
  label: "Usage Introduction",
  description: "Generate a short onboarding introduction by calling the hello greeting skill.",
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
      label: "Usage Introduction",
      valueType: "text",
    },
  ],
  systemInstruction: "You are a GraphiteUI onboarding assistant.",
  taskInstruction: "Return a short usage introduction for the provided name.",
  skills: [
    {
      name: "output_usage_introduction",
      skillKey: "output_usage_introduction",
      inputMapping: {},
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    greeting: "$skills.output_usage_introduction.greeting",
  },
} satisfies NodePresetDefinition;

export const GREETING_OUTPUT_PRESET = {
  presetId: "preset.output.greeting.v1",
  label: "Usage Introduction Output",
  description: "Preview and optionally persist the generated usage introduction.",
  family: "output",
  input: {
    key: "value",
    label: "Usage Introduction",
    valueType: "text",
    required: true,
  },
  displayMode: "auto",
  persistEnabled: false,
  persistFormat: "txt",
  fileNameTemplate: "usage-introduction",
} satisfies NodePresetDefinition;

export const FETCH_NEWS_AGENT_PRESET = {
  presetId: "preset.agent.fetch_market_news_context.v1",
  label: "Fetch Market News",
  description: "Fetch market news signals for the current creative research task.",
  family: "agent",
  inputs: [
    {
      key: "task_input",
      label: "Task Input",
      valueType: "text",
      required: true,
    },
  ],
  outputs: [
    {
      key: "rss_items",
      label: "RSS Items",
      valueType: "json",
    },
  ],
  systemInstruction: "You are a research workflow agent specialized in fetching market news signals.",
  taskInstruction: "Fetch market news and trend references for the provided task.",
  skills: [
    {
      name: "fetch_market_news",
      skillKey: "fetch_market_news_context",
      inputMapping: {
        task_input: "$inputs.task_input",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    rss_items: "$skills.fetch_market_news.rss_items",
  },
} satisfies NodePresetDefinition;

export const CLEAN_MARKET_NEWS_AGENT_PRESET = {
  presetId: "preset.agent.clean_market_news.v1",
  label: "Clean Market News",
  description: "Normalize fetched market news into cleaned items and a text research context.",
  family: "agent",
  inputs: [
    {
      key: "rss_items",
      label: "RSS Items",
      valueType: "json",
      required: true,
    },
  ],
  outputs: [
    {
      key: "clean_news_items",
      label: "Clean News Items",
      valueType: "json",
    },
    {
      key: "news_context",
      label: "News Context",
      valueType: "text",
    },
  ],
  systemInstruction: "You are a research normalization agent.",
  taskInstruction: "Normalize fetched market news and return a concise research context.",
  skills: [
    {
      name: "clean_market_news",
      skillKey: "clean_market_news",
      inputMapping: {
        rss_items: "$inputs.rss_items",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    clean_news_items: "$skills.clean_market_news.clean_news_items",
    news_context: "$skills.clean_market_news.news_context",
  },
} satisfies NodePresetDefinition;

export const BUILD_CREATIVE_BRIEF_AGENT_PRESET = {
  presetId: "preset.agent.build_creative_brief.v1",
  label: "Build Creative Brief",
  description: "Assemble a concise creative brief from task input and research context.",
  family: "agent",
  inputs: [
    {
      key: "task_input",
      label: "Task Input",
      valueType: "text",
      required: true,
    },
    {
      key: "news_context",
      label: "News Context",
      valueType: "text",
      required: true,
    },
  ],
  outputs: [
    {
      key: "creative_brief",
      label: "Creative Brief",
      valueType: "text",
    },
  ],
  systemInstruction: "You are a creative strategy agent.",
  taskInstruction: "Build a concise creative brief from the task and research context.",
  skills: [
    {
      name: "build_creative_brief",
      skillKey: "build_creative_brief",
      inputMapping: {
        task_input: "$inputs.task_input",
        news_context: "$inputs.news_context",
        theme_config: "$graph.theme_config",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    creative_brief: "$skills.build_creative_brief.creative_brief",
  },
} satisfies NodePresetDefinition;

export const GENERATE_CREATIVE_VARIANTS_AGENT_PRESET = {
  presetId: "preset.agent.generate_creative_variants.v1",
  label: "Generate Creative Variants",
  description: "Generate structured creative variants from task input and creative brief.",
  family: "agent",
  inputs: [
    { key: "task_input", label: "Task Input", valueType: "text", required: true },
    { key: "creative_brief", label: "Creative Brief", valueType: "text", required: true },
  ],
  outputs: [
    { key: "script_variants", label: "Script Variants", valueType: "json" },
  ],
  systemInstruction: "You are a creative variant generator.",
  taskInstruction: "Generate structured creative variants from the task and brief.",
  skills: [
    {
      name: "generate_creative_variants",
      skillKey: "generate_creative_variants",
      inputMapping: {
        task_input: "$inputs.task_input",
        creative_brief: "$inputs.creative_brief",
        theme_config: "$graph.theme_config",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    script_variants: "$skills.generate_creative_variants.script_variants",
  },
} satisfies NodePresetDefinition;

export const REVIEW_VARIANTS_AGENT_PRESET = {
  presetId: "preset.agent.review_creative_variants.v1",
  label: "Review Creative Variants",
  description: "Review generated variants and return an evaluation result for downstream routing.",
  family: "agent",
  inputs: [
    { key: "task_input", label: "Task Input", valueType: "text", required: true },
    { key: "creative_brief", label: "Creative Brief", valueType: "text", required: true },
    { key: "script_variants", label: "Script Variants", valueType: "json", required: true },
  ],
  outputs: [
    { key: "evaluation_result", label: "Evaluation Result", valueType: "json" },
    { key: "best_variant", label: "Best Variant", valueType: "json" },
    { key: "revision_feedback", label: "Revision Feedback", valueType: "json" },
  ],
  systemInstruction: "You are a creative review agent.",
  taskInstruction: "Review generated variants and return pass or revise guidance.",
  skills: [
    {
      name: "review_creative_variants",
      skillKey: "review_creative_variants",
      inputMapping: {
        task_input: "$inputs.task_input",
        creative_brief: "$inputs.creative_brief",
        script_variants: "$inputs.script_variants",
        theme_config: "$graph.theme_config",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    evaluation_result: "$skills.review_creative_variants.evaluation_result",
    best_variant: "$skills.review_creative_variants.best_variant",
    revision_feedback: "$skills.review_creative_variants.revision_feedback",
  },
} satisfies NodePresetDefinition;

export const GENERATE_STORYBOARD_PACKAGES_AGENT_PRESET = {
  presetId: "preset.agent.generate_storyboard_packages.v1",
  label: "Generate Storyboards",
  description: "Generate storyboard packages from creative variants.",
  family: "agent",
  inputs: [
    { key: "script_variants", label: "Script Variants", valueType: "json", required: true },
  ],
  outputs: [
    { key: "storyboard_packages", label: "Storyboard Packages", valueType: "json" },
  ],
  systemInstruction: "You are a storyboard generation agent.",
  taskInstruction: "Generate storyboard packages from the provided variants.",
  skills: [
    {
      name: "generate_storyboard_packages",
      skillKey: "generate_storyboard_packages",
      inputMapping: {
        script_variants: "$inputs.script_variants",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    storyboard_packages: "$skills.generate_storyboard_packages.storyboard_packages",
  },
} satisfies NodePresetDefinition;

export const GENERATE_VIDEO_PROMPT_PACKAGES_AGENT_PRESET = {
  presetId: "preset.agent.generate_video_prompt_packages.v1",
  label: "Generate Video Prompts",
  description: "Generate video prompt packages from variants and storyboard packages.",
  family: "agent",
  inputs: [
    { key: "script_variants", label: "Script Variants", valueType: "json", required: true },
    { key: "storyboard_packages", label: "Storyboard Packages", valueType: "json", required: true },
  ],
  outputs: [
    { key: "video_prompt_packages", label: "Video Prompt Packages", valueType: "json" },
  ],
  systemInstruction: "You are a video prompt generation agent.",
  taskInstruction: "Generate video prompt packages from variants and storyboard packages.",
  skills: [
    {
      name: "generate_video_prompt_packages",
      skillKey: "generate_video_prompt_packages",
      inputMapping: {
        script_variants: "$inputs.script_variants",
        storyboard_packages: "$inputs.storyboard_packages",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    video_prompt_packages: "$skills.generate_video_prompt_packages.video_prompt_packages",
  },
} satisfies NodePresetDefinition;

export const PREPARE_IMAGE_TODO_AGENT_PRESET = {
  presetId: "preset.agent.prepare_image_generation_todo.v1",
  label: "Prepare Image TODO",
  description: "Prepare image generation todo payload from review outputs.",
  family: "agent",
  inputs: [
    { key: "best_variant", label: "Best Variant", valueType: "json", required: true },
    { key: "storyboard_packages", label: "Storyboard Packages", valueType: "json", required: true },
  ],
  outputs: [
    { key: "image_generation_todo", label: "Image Generation TODO", valueType: "json" },
  ],
  systemInstruction: "You are an image production prep agent.",
  taskInstruction: "Prepare image generation todo payload from the current review outputs.",
  skills: [
    {
      name: "prepare_image_generation_todo",
      skillKey: "prepare_image_generation_todo",
      inputMapping: {
        best_variant: "$inputs.best_variant",
        storyboard_packages: "$inputs.storyboard_packages",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    image_generation_todo: "$skills.prepare_image_generation_todo.image_generation_todo",
  },
} satisfies NodePresetDefinition;

export const PREPARE_VIDEO_TODO_AGENT_PRESET = {
  presetId: "preset.agent.prepare_video_generation_todo.v1",
  label: "Prepare Video TODO",
  description: "Prepare video generation todo payload from review outputs.",
  family: "agent",
  inputs: [
    { key: "best_variant", label: "Best Variant", valueType: "json", required: true },
    { key: "video_prompt_packages", label: "Video Prompt Packages", valueType: "json", required: true },
  ],
  outputs: [
    { key: "video_generation_todo", label: "Video Generation TODO", valueType: "json" },
  ],
  systemInstruction: "You are a video production prep agent.",
  taskInstruction: "Prepare video generation todo payload from the current review outputs.",
  skills: [
    {
      name: "prepare_video_generation_todo",
      skillKey: "prepare_video_generation_todo",
      inputMapping: {
        best_variant: "$inputs.best_variant",
        video_prompt_packages: "$inputs.video_prompt_packages",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    video_generation_todo: "$skills.prepare_video_generation_todo.video_generation_todo",
  },
} satisfies NodePresetDefinition;

export const FINALIZE_CREATIVE_PACKAGE_AGENT_PRESET = {
  presetId: "preset.agent.finalize_creative_package.v1",
  label: "Finalize Creative Package",
  description: "Assemble the final creative package artifact from downstream production inputs.",
  family: "agent",
  inputs: [
    { key: "creative_brief", label: "Creative Brief", valueType: "text", required: true },
    { key: "best_variant", label: "Best Variant", valueType: "json", required: true },
    { key: "storyboard_packages", label: "Storyboard Packages", valueType: "json", required: true },
    { key: "video_prompt_packages", label: "Video Prompt Packages", valueType: "json", required: true },
    { key: "image_generation_todo", label: "Image Generation TODO", valueType: "json", required: true },
    { key: "video_generation_todo", label: "Video Generation TODO", valueType: "json", required: true },
    { key: "evaluation_result", label: "Evaluation Result", valueType: "json", required: true },
  ],
  outputs: [
    { key: "final_package", label: "Final Package", valueType: "json" },
    { key: "final_result", label: "Final Result", valueType: "text" },
  ],
  systemInstruction: "You are a creative packaging agent.",
  taskInstruction: "Assemble the final creative package from reviewed and prepared outputs.",
  skills: [
    {
      name: "finalize_creative_package",
      skillKey: "finalize_creative_package",
      inputMapping: {
        creative_brief: "$inputs.creative_brief",
        best_variant: "$inputs.best_variant",
        storyboard_packages: "$inputs.storyboard_packages",
        video_prompt_packages: "$inputs.video_prompt_packages",
        image_generation_todo: "$inputs.image_generation_todo",
        video_generation_todo: "$inputs.video_generation_todo",
        evaluation_result: "$inputs.evaluation_result",
        theme_config: "$graph.theme_config",
      },
      contextBinding: {},
      usage: "required",
    },
  ],
  responseMode: "json",
  outputBinding: {
    final_package: "$skills.finalize_creative_package.final_package",
    final_result: "$skills.finalize_creative_package.final_result",
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

export const NEWS_CONTEXT_OUTPUT_PRESET = {
  presetId: "preset.output.news_context.v1",
  label: "Research Context Output",
  description: "Preview and optionally persist normalized research context.",
  family: "output",
  input: {
    key: "value",
    label: "Research Context",
    valueType: "text",
    required: true,
  },
  displayMode: "auto",
  persistEnabled: false,
  persistFormat: "txt",
  fileNameTemplate: "research_context",
} satisfies NodePresetDefinition;

export const CREATIVE_BRIEF_OUTPUT_PRESET = {
  presetId: "preset.output.creative_brief.v1",
  label: "Creative Brief Output",
  description: "Preview and optionally persist generated creative brief text.",
  family: "output",
  input: {
    key: "value",
    label: "Creative Brief",
    valueType: "text",
    required: true,
  },
  displayMode: "auto",
  persistEnabled: false,
  persistFormat: "txt",
  fileNameTemplate: "creative_brief",
} satisfies NodePresetDefinition;

export const DECISION_SIGNAL_OUTPUT_PRESET = {
  presetId: "preset.output.decision_signal.v1",
  label: "Decision Output",
  description: "Preview a routed pass or revise branch signal.",
  family: "output",
  input: {
    key: "value",
    label: "Decision Signal",
    valueType: "any",
    required: true,
  },
  displayMode: "auto",
  persistEnabled: false,
  persistFormat: "txt",
  fileNameTemplate: "decision_signal",
} satisfies NodePresetDefinition;

export const FINAL_PACKAGE_OUTPUT_PRESET = {
  presetId: "preset.output.final_package.v1",
  label: "Final Package Output",
  description: "Preview and optionally persist the assembled final creative package.",
  family: "output",
  input: {
    key: "value",
    label: "Final Package",
    valueType: "json",
    required: true,
  },
  displayMode: "json",
  persistEnabled: false,
  persistFormat: "json",
  fileNameTemplate: "final_package",
} satisfies NodePresetDefinition;

export const NODE_PRESETS_MOCK = [
  EMPTY_AGENT_PRESET,
  NAME_INPUT_PRESET,
  TASK_INPUT_PRESET,
  TEXT_INPUT_PRESET,
  HELLO_GREETING_AGENT_PRESET,
  SUMMARY_AGENT_PRESET,
  FETCH_NEWS_AGENT_PRESET,
  CLEAN_MARKET_NEWS_AGENT_PRESET,
  BUILD_CREATIVE_BRIEF_AGENT_PRESET,
  GENERATE_CREATIVE_VARIANTS_AGENT_PRESET,
  REVIEW_VARIANTS_AGENT_PRESET,
  GENERATE_STORYBOARD_PACKAGES_AGENT_PRESET,
  GENERATE_VIDEO_PROMPT_PACKAGES_AGENT_PRESET,
  PREPARE_IMAGE_TODO_AGENT_PRESET,
  PREPARE_VIDEO_TODO_AGENT_PRESET,
  FINALIZE_CREATIVE_PACKAGE_AGENT_PRESET,
  REVIEW_GATE_PRESET,
  GREETING_OUTPUT_PRESET,
  NEWS_CONTEXT_OUTPUT_PRESET,
  CREATIVE_BRIEF_OUTPUT_PRESET,
  DECISION_SIGNAL_OUTPUT_PRESET,
  FINAL_PACKAGE_OUTPUT_PRESET,
  TEXT_OUTPUT_PRESET,
] satisfies NodePresetDefinition[];

export function getNodePresetById(presetId: string) {
  return NODE_PRESETS_MOCK.find((preset) => preset.presetId === presetId);
}

export function getSuggestedPresets(valueType?: ValueType | null) {
  if (!valueType) {
    return [EMPTY_AGENT_PRESET, NAME_INPUT_PRESET, TASK_INPUT_PRESET, TEXT_INPUT_PRESET, HELLO_GREETING_AGENT_PRESET, SUMMARY_AGENT_PRESET, FETCH_NEWS_AGENT_PRESET, CLEAN_MARKET_NEWS_AGENT_PRESET, BUILD_CREATIVE_BRIEF_AGENT_PRESET, GENERATE_CREATIVE_VARIANTS_AGENT_PRESET, REVIEW_VARIANTS_AGENT_PRESET, GENERATE_STORYBOARD_PACKAGES_AGENT_PRESET, GENERATE_VIDEO_PROMPT_PACKAGES_AGENT_PRESET, PREPARE_IMAGE_TODO_AGENT_PRESET, PREPARE_VIDEO_TODO_AGENT_PRESET, FINALIZE_CREATIVE_PACKAGE_AGENT_PRESET, REVIEW_GATE_PRESET, GREETING_OUTPUT_PRESET, NEWS_CONTEXT_OUTPUT_PRESET, CREATIVE_BRIEF_OUTPUT_PRESET, DECISION_SIGNAL_OUTPUT_PRESET, FINAL_PACKAGE_OUTPUT_PRESET, TEXT_OUTPUT_PRESET];
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
