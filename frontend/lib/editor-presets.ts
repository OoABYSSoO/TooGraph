import type {
  GraphNodeType,
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
