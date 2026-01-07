import type {
  GraphCanvasEdge,
  GraphCanvasNode,
  GraphDocument,
  GraphNodeType,
  StateField,
  ThemeConfig,
  ThemePreset,
} from "@/types/editor";

type NodePreset = {
  kind: GraphNodeType;
  label: string;
  description: string;
  defaultReads?: string[];
  defaultWrites?: string[];
  defaultParams?: Record<string, unknown>;
};

export const NODE_PRESETS: NodePreset[] = [
  { kind: "start", label: "Start", description: "Define initial context and expose root state." },
  { kind: "research", label: "Research", description: "Collect market or strategy inputs.", defaultWrites: ["market_inputs"] },
  { kind: "collect_assets", label: "Collect Assets", description: "Fetch assets from configured sources." },
  { kind: "normalize_assets", label: "Normalize Assets", description: "Normalize raw asset inputs." },
  { kind: "select_assets", label: "Select Assets", description: "Choose top candidate materials." },
  { kind: "analyze_assets", label: "Analyze Assets", description: "Analyze asset structure and patterns." },
  { kind: "extract_patterns", label: "Extract Patterns", description: "Summarize reusable patterns." },
  { kind: "build_brief", label: "Build Brief", description: "Convert context into a creative brief." },
  { kind: "generate_variants", label: "Generate Variants", description: "Generate candidate outputs." },
  { kind: "generate_storyboards", label: "Generate Storyboards", description: "Create storyboard packages." },
  { kind: "generate_video_prompts", label: "Video Prompts", description: "Generate video prompt packages." },
  { kind: "review_variants", label: "Review", description: "Evaluate variants and produce decision state." },
  { kind: "condition", label: "Condition", description: "Branch based on a decision field." },
  { kind: "prepare_image_todo", label: "Image TODO", description: "Prepare image generation package." },
  { kind: "prepare_video_todo", label: "Video TODO", description: "Prepare video generation package." },
  { kind: "finalize", label: "Finalize", description: "Assemble final package and persist results." },
  { kind: "end", label: "End", description: "Collect final outputs." },
  { kind: "knowledge", label: "Knowledge", description: "Read long-lived knowledge sources." },
  { kind: "memory", label: "Memory", description: "Read historical memories." },
  { kind: "planner", label: "Planner", description: "Plan downstream execution." },
  { kind: "evaluator", label: "Evaluator", description: "Produce a decision payload." },
  { kind: "tool", label: "Tool", description: "Invoke reusable tools." },
  { kind: "transform", label: "Transform", description: "Convert one state structure into another." },
];

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "slg_launch",
    label: "SLG Launch",
    description: "High-pressure strategy war ads with rapid escalation and alliance scale.",
    graphName: "Creative Factory · SLG Launch",
    nodeParamOverrides: {
      select_assets_1: { top_n: 2 },
      generate_variants_1: { variantCount: 3 },
      review_variants_1: { scoreThreshold: 7.8 },
    },
    themeConfig: {
      themePreset: "slg_launch",
      domain: "game_ads",
      genre: "SLG",
      market: "US",
      platform: "facebook",
      language: "zh",
      creativeStyle: "high_pressure_growth_loop",
      tone: "urgent",
      languageConstraints: ["ui_en_only"],
      evaluationPolicy: { scoreThreshold: 7.8, hookPriority: "very_high", payoffPriority: "high" },
      assetSourcePolicy: { adLibrary: true, rss: true },
      strategyProfile: {
        hookTheme: "资源危机与战局失控",
        payoffTheme: "联盟推进、战力成长与结果反转",
        visualPattern: "警报色、大地图轨迹、爆字反馈",
        pacingPattern: "前三秒警报切入，中段连续决策，尾段规模反推",
        evaluationFocus: ["前三秒高压钩子", "成长反馈清晰", "联盟规模感"],
      },
    },
  },
  {
    id: "rpg_fantasy",
    label: "RPG Fantasy",
    description: "Hero-led fantasy progression with class fantasy, bosses, and loot payoff.",
    graphName: "Creative Factory · RPG Fantasy",
    nodeParamOverrides: {
      select_assets_1: { top_n: 3 },
      generate_variants_1: { variantCount: 3 },
      review_variants_1: { scoreThreshold: 7.6 },
    },
    themeConfig: {
      themePreset: "rpg_fantasy",
      domain: "game_ads",
      genre: "RPG",
      market: "JP",
      platform: "youtube_shorts",
      language: "zh",
      creativeStyle: "hero_power_fantasy",
      tone: "epic",
      languageConstraints: ["ui_en_only"],
      evaluationPolicy: { scoreThreshold: 7.6, fantasyClarity: "high", rewardVisibility: "high" },
      assetSourcePolicy: { adLibrary: true, rss: false },
      strategyProfile: {
        hookTheme: "英雄觉醒与强敌压境",
        payoffTheme: "职业成长、掉落回报与 Boss 压制",
        visualPattern: "技能爆发、装备光效、Boss 定格",
        pacingPattern: "先压迫后觉醒，再用掉落和 Boss 结果收束",
        evaluationFocus: ["职业幻想清晰", "战斗爆发镜头", "掉落与成长回报"],
      },
    },
  },
  {
    id: "survival_chaos",
    label: "Survival Chaos",
    description: "Overwhelming threat, scrappy resource recovery, and last-second reversals.",
    graphName: "Creative Factory · Survival Chaos",
    nodeParamOverrides: {
      select_assets_1: { top_n: 2 },
      generate_variants_1: { variantCount: 4 },
      review_variants_1: { scoreThreshold: 7.9 },
    },
    themeConfig: {
      themePreset: "survival_chaos",
      domain: "game_ads",
      genre: "Survival",
      market: "US",
      platform: "tiktok",
      language: "zh",
      creativeStyle: "chaotic_resource_panic",
      tone: "grim",
      languageConstraints: ["ui_en_only"],
      evaluationPolicy: { scoreThreshold: 7.9, dangerVisibility: "very_high", scarcityPressure: "high" },
      assetSourcePolicy: { adLibrary: true, rss: true },
      strategyProfile: {
        hookTheme: "资源匮乏与生存崩盘边缘",
        payoffTheme: "极限翻盘、补给回收与据点重建",
        visualPattern: "低资源警报、混乱尸潮、临界反杀",
        pacingPattern: "先资源崩盘，再强压追逐，最后临界反杀",
        evaluationFocus: ["匮乏压迫感", "混乱威胁可见", "最后翻盘够爽"],
      },
    },
  },
];

export function getThemePresetById(themePresetId: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === themePresetId);
}

function defaultThemeConfig(): ThemeConfig {
  return THEME_PRESETS[0].themeConfig;
}

function applyNodeParamOverrides(nodes: GraphCanvasNode[], themePreset: ThemePreset): GraphCanvasNode[] {
  const overrides = themePreset.nodeParamOverrides ?? {};
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      params: {
        ...node.data.params,
        ...(overrides[node.id] ?? {}),
      },
    },
  }));
}

function defaultStateSchema(): StateField[] {
  return [
    {
      key: "theme_config",
      type: "object",
      role: "input",
      title: "Theme Config",
      description: "Global theme and domain settings.",
      sourceNodes: ["start_1"],
      targetNodes: ["research_1", "build_brief_1", "generate_variants_1"],
    },
    {
      key: "market_inputs",
      type: "array",
      role: "intermediate",
      title: "Market Inputs",
      description: "Collected research signals and asset references.",
      sourceNodes: ["research_1", "collect_assets_1", "normalize_assets_1"],
      targetNodes: ["build_brief_1"],
    },
    {
      key: "selected_video_items",
      type: "array",
      role: "intermediate",
      title: "Selected Assets",
      description: "Shortlisted benchmark assets for deeper analysis.",
      sourceNodes: ["select_assets_1"],
      targetNodes: ["analyze_assets_1"],
    },
    {
      key: "video_analysis_results",
      type: "array",
      role: "artifact",
      title: "Asset Analyses",
      description: "Structured findings extracted from selected assets.",
      sourceNodes: ["analyze_assets_1"],
      targetNodes: ["extract_patterns_1"],
    },
    {
      key: "pattern_summary",
      type: "markdown",
      role: "artifact",
      title: "Pattern Summary",
      description: "Cross-asset reusable pattern summary.",
      sourceNodes: ["extract_patterns_1"],
      targetNodes: ["build_brief_1"],
    },
    {
      key: "creative_brief",
      type: "markdown",
      role: "artifact",
      title: "Creative Brief",
      description: "Structured brief for generation.",
      sourceNodes: ["build_brief_1"],
      targetNodes: ["generate_variants_1", "review_variants_1"],
    },
    {
      key: "script_variants",
      type: "array",
      role: "artifact",
      title: "Script Variants",
      description: "Generated creative variants.",
      sourceNodes: ["generate_variants_1"],
      targetNodes: ["generate_storyboards_1", "review_variants_1"],
    },
    {
      key: "storyboard_packages",
      type: "array",
      role: "artifact",
      title: "Storyboard Packages",
      description: "Storyboard image packages derived from selected variants.",
      sourceNodes: ["generate_storyboards_1"],
      targetNodes: ["generate_video_prompts_1", "prepare_image_todo_1", "finalize_1"],
    },
    {
      key: "video_prompt_packages",
      type: "array",
      role: "artifact",
      title: "Video Prompt Packages",
      description: "Video-generation prompt packages derived from storyboards.",
      sourceNodes: ["generate_video_prompts_1"],
      targetNodes: ["prepare_video_todo_1", "finalize_1"],
    },
    {
      key: "best_variant",
      type: "object",
      role: "artifact",
      title: "Best Variant",
      description: "Best candidate selected during review.",
      sourceNodes: ["review_variants_1"],
      targetNodes: ["prepare_image_todo_1", "prepare_video_todo_1", "finalize_1"],
    },
    {
      key: "evaluation_result",
      type: "object",
      role: "decision",
      title: "Evaluation Result",
      description: "Review decision and score payload.",
      sourceNodes: ["review_variants_1"],
      targetNodes: ["condition_1", "finalize_1", "end_1"],
    },
    {
      key: "image_generation_todo",
      type: "object",
      role: "artifact",
      title: "Image TODO",
      description: "Prepared image generation work package.",
      sourceNodes: ["prepare_image_todo_1"],
      targetNodes: ["finalize_1"],
    },
    {
      key: "video_generation_todo",
      type: "object",
      role: "artifact",
      title: "Video TODO",
      description: "Prepared video generation work package.",
      sourceNodes: ["prepare_video_todo_1"],
      targetNodes: ["finalize_1"],
    },
    {
      key: "final_package",
      type: "object",
      role: "final",
      title: "Final Package",
      description: "Final artifact package exposed at the end of the flow.",
      sourceNodes: ["finalize_1"],
      targetNodes: ["end_1"],
    },
  ];
}

function createNode(
  id: string,
  kind: GraphNodeType,
  label: string,
  x: number,
  y: number,
  description: string,
  reads: string[] = [],
  writes: string[] = [],
  params: Record<string, unknown> = {},
): GraphCanvasNode {
  return {
    id,
    type: "workflow",
    className: "graph-node status-idle",
    position: { x, y },
    data: {
      label,
      kind,
      description,
      status: "idle",
      reads,
      writes,
      params,
    },
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  flowKeys: string[],
  edgeKind: "normal" | "branch" = "normal",
  branchLabel?: "pass" | "revise" | "fail",
): GraphCanvasEdge {
  return {
    id,
    source,
    target,
    type: "workflow",
    animated: false,
    label: branchLabel ?? (flowKeys.length ? flowKeys.slice(0, 2).join(", ") : undefined),
    data: { flowKeys, edgeKind, branchLabel },
  };
}

function createCreativeFactoryTemplate(graphId: string, themePresetId?: string): GraphDocument {
  const themePreset = getThemePresetById(themePresetId ?? "") ?? THEME_PRESETS[0];
  const baseNodes = [
    createNode("start_1", "start", "Start", 40, 220, "Define initial context and expose root state.", [], ["theme_config"]),
    createNode("research_1", "research", "Research", 240, 80, "Collect market news and strategic context.", ["theme_config"], ["market_inputs"], {
      sources: ["rss", "ad_library"],
    }),
    createNode("collect_assets_1", "collect_assets", "Collect Assets", 240, 260, "Fetch benchmark ad assets.", ["theme_config"], ["market_inputs"], {
      sourcePreset: "ad_library",
    }),
    createNode("normalize_assets_1", "normalize_assets", "Normalize Assets", 460, 260, "Normalize raw assets into analysis-ready records.", ["market_inputs"], ["market_inputs"]),
    createNode("select_assets_1", "select_assets", "Select Assets", 680, 260, "Select top benchmark videos.", ["market_inputs"], ["selected_video_items"], {
      top_n: 2,
    }),
    createNode("analyze_assets_1", "analyze_assets", "Analyze Assets", 900, 260, "Analyze selected benchmark assets.", ["selected_video_items"], ["video_analysis_results"]),
    createNode("extract_patterns_1", "extract_patterns", "Extract Patterns", 1120, 260, "Summarize reusable patterns from analyses.", ["video_analysis_results"], ["pattern_summary"]),
    createNode("build_brief_1", "build_brief", "Build Brief", 1340, 260, "Build a structured brief.", ["theme_config", "market_inputs", "pattern_summary"], ["creative_brief"]),
    createNode("generate_variants_1", "generate_variants", "Generate Variants", 1580, 260, "Generate creative variants.", ["theme_config", "creative_brief"], ["script_variants"], {
      variantCount: 3,
    }),
    createNode("generate_storyboards_1", "generate_storyboards", "Storyboards", 1800, 180, "Create storyboard packages for each variant.", ["script_variants"], ["storyboard_packages"]),
    createNode("generate_video_prompts_1", "generate_video_prompts", "Video Prompts", 1800, 340, "Create video prompt packages from storyboards.", ["script_variants", "storyboard_packages"], ["video_prompt_packages"]),
    createNode("review_variants_1", "review_variants", "Review", 2020, 260, "Review generated variants.", ["creative_brief", "script_variants"], ["best_variant", "evaluation_result"], {
      scoreThreshold: 7.8,
    }),
    createNode("condition_1", "condition", "Condition", 2240, 260, "Route pass/revise/fail.", ["evaluation_result"], [], {
      decision_key: "evaluation_result.decision",
    }),
    createNode("prepare_image_todo_1", "prepare_image_todo", "Image TODO", 2460, 180, "Prepare image generation package.", ["best_variant", "storyboard_packages"], ["image_generation_todo"]),
    createNode("prepare_video_todo_1", "prepare_video_todo", "Video TODO", 2460, 340, "Prepare video generation package.", ["best_variant", "video_prompt_packages"], ["video_generation_todo"]),
    createNode("finalize_1", "finalize", "Finalize", 2680, 260, "Assemble final package.", ["evaluation_result", "best_variant", "storyboard_packages", "video_prompt_packages", "image_generation_todo", "video_generation_todo"], ["final_package"]),
    createNode("end_1", "end", "End", 2900, 260, "Expose final package.", ["final_package", "evaluation_result"], []),
  ];
  return {
    graphId,
    name: themePreset.graphName ?? `Creative Factory · ${themePreset.label}`,
    templateId: "creative_factory",
    themeConfig: themePreset.themeConfig,
    stateSchema: defaultStateSchema(),
    nodes: applyNodeParamOverrides(baseNodes, themePreset),
    edges: [
      createEdge("edge_1", "start_1", "research_1", ["theme_config"]),
      createEdge("edge_2", "research_1", "collect_assets_1", ["market_inputs"]),
      createEdge("edge_3", "collect_assets_1", "normalize_assets_1", ["market_inputs"]),
      createEdge("edge_4", "normalize_assets_1", "select_assets_1", ["market_inputs"]),
      createEdge("edge_5", "select_assets_1", "analyze_assets_1", ["selected_video_items"]),
      createEdge("edge_6", "analyze_assets_1", "extract_patterns_1", ["video_analysis_results"]),
      createEdge("edge_7", "extract_patterns_1", "build_brief_1", ["pattern_summary"]),
      createEdge("edge_8", "build_brief_1", "generate_variants_1", ["creative_brief"]),
      createEdge("edge_9", "generate_variants_1", "generate_storyboards_1", ["script_variants"]),
      createEdge("edge_10", "generate_storyboards_1", "generate_video_prompts_1", ["storyboard_packages"]),
      createEdge("edge_11", "generate_video_prompts_1", "review_variants_1", ["video_prompt_packages"]),
      createEdge("edge_12", "review_variants_1", "condition_1", ["evaluation_result", "best_variant"]),
      createEdge("edge_13", "condition_1", "prepare_image_todo_1", ["evaluation_result", "best_variant"], "branch", "pass"),
      createEdge("edge_14", "prepare_image_todo_1", "prepare_video_todo_1", ["image_generation_todo"]),
      createEdge("edge_15", "prepare_video_todo_1", "finalize_1", ["video_generation_todo"]),
      createEdge("edge_16", "condition_1", "generate_variants_1", ["evaluation_result"], "branch", "revise"),
      createEdge("edge_17", "condition_1", "end_1", ["evaluation_result"], "branch", "fail"),
      createEdge("edge_18", "finalize_1", "end_1", ["final_package"]),
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function createStarterGraphDocument(graphId: string, themePresetId?: string): GraphDocument {
  if (graphId === "creative-factory" || graphId === "template-creative-factory") {
    return createCreativeFactoryTemplate(graphId, themePresetId);
  }
  return createCreativeFactoryTemplate(graphId, themePresetId);
}
