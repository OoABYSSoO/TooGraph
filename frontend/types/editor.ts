import type { Edge, Node } from "@xyflow/react";

export type GraphNodeType =
  | "start"
  | "end"
  | "condition"
  | "research"
  | "collect_assets"
  | "normalize_assets"
  | "select_assets"
  | "analyze_assets"
  | "extract_patterns"
  | "build_brief"
  | "generate_variants"
  | "generate_storyboards"
  | "generate_video_prompts"
  | "review_variants"
  | "prepare_image_todo"
  | "prepare_video_todo"
  | "finalize"
  | "knowledge"
  | "memory"
  | "planner"
  | "evaluator"
  | "tool"
  | "transform";

export type EdgeKind = "normal" | "branch";
export type BranchLabel = "pass" | "revise" | "fail";
export type StateFieldType = "string" | "number" | "boolean" | "object" | "array" | "markdown" | "json" | "file_list";
export type StateFieldRole = "input" | "intermediate" | "decision" | "artifact" | "final";

export type ThemeConfig = {
  themePreset: string;
  domain: string;
  genre: string;
  market: string;
  platform: string;
  language: string;
  creativeStyle: string;
  tone: string;
  languageConstraints: string[];
  evaluationPolicy: Record<string, unknown>;
  assetSourcePolicy: Record<string, unknown>;
  strategyProfile: {
    hookTheme: string;
    payoffTheme: string;
    visualPattern: string;
    pacingPattern: string;
    evaluationFocus: string[];
  };
};

export type ThemePreset = {
  id: string;
  label: string;
  description: string;
  graphName?: string;
  nodeParamOverrides?: Record<string, Record<string, unknown>>;
  themeConfig: ThemeConfig;
};

export type TemplateDefinition = {
  templateId: string;
  label: string;
  description: string;
  defaultGraphName: string;
  defaultThemePreset: string;
  supportedNodeTypes: GraphNodeType[];
  stateKeys: string[];
  themePresets: ThemePreset[];
};

export type StateField = {
  key: string;
  type: StateFieldType;
  role: StateFieldRole;
  title: string;
  description: string;
  example?: unknown;
  sourceNodes: string[];
  targetNodes: string[];
};

export type GraphNodeParams = Record<string, unknown>;

export type GraphNodeData = {
  label: string;
  kind: GraphNodeType;
  description: string;
  status?: "idle" | "running" | "success" | "failed";
  reads: string[];
  writes: string[];
  params: GraphNodeParams;
};

export type GraphEdgeData = {
  flowKeys: string[];
  edgeKind: EdgeKind;
  branchLabel?: BranchLabel;
};

export type GraphCanvasNode = Node<GraphNodeData>;
export type GraphCanvasEdge = Edge<GraphEdgeData>;

export type NodeExecutionSummary = {
  node_id: string;
  node_type: string;
  status: string;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  artifacts?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
};

export type RunDetailPayload = {
  run_id: string;
  status: string;
  current_node_id?: string | null;
  revision_round: number;
  final_result?: string | null;
  final_score?: number | null;
  node_status_map: Record<string, string>;
  node_executions: NodeExecutionSummary[];
};

export type GraphDocument = {
  graphId: string;
  name: string;
  templateId: string;
  themeConfig: ThemeConfig;
  stateSchema: StateField[];
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
  updatedAt: string;
};
