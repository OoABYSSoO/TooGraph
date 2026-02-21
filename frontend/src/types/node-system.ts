export type GraphPosition = {
  x: number;
  y: number;
};

export type NodeFamily = "input" | "output" | "agent" | "condition";

export type NodeViewportSize = {
  width?: number | null;
  height?: number | null;
};

export type StateDefinition = {
  name: string;
  description: string;
  type: string;
  value?: unknown;
  color: string;
};

export type ReadBinding = {
  state: string;
  required?: boolean;
};

export type WriteBinding = {
  state: string;
  mode?: "replace";
};

export type AgentThinkingMode = "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "on";

export type NodeUi = {
  position: GraphPosition;
  collapsed?: boolean;
  expandedSize?: NodeViewportSize | null;
  collapsedSize?: NodeViewportSize | null;
};

export type InputNode = {
  kind: "input";
  name: string;
  description: string;
  ui: NodeUi;
  reads: ReadBinding[];
  writes: WriteBinding[];
  config: {
    value: unknown;
  };
};

export type AgentNode = {
  kind: "agent";
  name: string;
  description: string;
  ui: NodeUi;
  reads: ReadBinding[];
  writes: WriteBinding[];
  config: {
    skills: string[];
    taskInstruction: string;
    modelSource: "global" | "override";
    model: string;
    thinkingMode: AgentThinkingMode;
    temperature: number;
  };
};

export type ConditionNode = {
  kind: "condition";
  name: string;
  description: string;
  ui: NodeUi;
  reads: ReadBinding[];
  writes: WriteBinding[];
  config: {
    branches: string[];
    loopLimit: number;
    branchMapping: Record<string, string>;
    rule: {
      source: string;
      operator: string;
      value: string | number | boolean | null;
    };
  };
};

export type OutputNode = {
  kind: "output";
  name: string;
  description: string;
  ui: NodeUi;
  reads: ReadBinding[];
  writes: WriteBinding[];
  config: {
    displayMode: "auto" | "plain" | "markdown" | "json";
    persistEnabled: boolean;
    persistFormat: "txt" | "md" | "json" | "auto";
    fileNameTemplate: string;
  };
};

export type GraphNode = InputNode | AgentNode | ConditionNode | OutputNode;

export type GraphEdge = {
  source: string;
  target: string;
};

export type ConditionalEdge = {
  source: string;
  branches: Record<string, string>;
};

export type GraphPayload = {
  graph_id?: string | null;
  name: string;
  state_schema: Record<string, StateDefinition>;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  conditional_edges: ConditionalEdge[];
  metadata: Record<string, unknown>;
};

export type GraphDocument = GraphPayload & {
  graph_id: string;
};

export type GraphValidationIssue = {
  code: string;
  message: string;
  path?: string | null;
};

export type GraphValidationResponse = {
  valid: boolean;
  issues: GraphValidationIssue[];
};

export type GraphSaveResponse = {
  graph_id: string;
  saved: boolean;
  validation: GraphValidationResponse;
};

export type GraphRunResponse = {
  run_id: string;
  status: string;
};

export type TemplateRecord = {
  template_id: string;
  label: string;
  description: string;
  default_graph_name: string;
  state_schema: Record<string, StateDefinition>;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  conditional_edges: ConditionalEdge[];
  metadata: Record<string, unknown>;
};

export type PresetDefinition = {
  label: string;
  description: string;
  state_schema: Record<string, StateDefinition>;
  node: GraphNode;
};

export type PresetDocument = {
  presetId: string;
  sourcePresetId: string | null;
  definition: PresetDefinition;
  createdAt: string | null;
  updatedAt: string | null;
  status: "active" | "disabled";
};

export type PresetSaveResponse = {
  presetId: string;
  saved: boolean;
  updatedAt: string | null;
};

export type PresetDeleteResponse = {
  presetId: string;
  status: "deleted";
};

export type NodeCreationContext = {
  position: GraphPosition;
  sourceNodeId?: string;
  sourceAnchorKind?: "flow-out" | "route-out" | "state-out";
  sourceBranchKey?: string;
  sourceStateKey?: string;
  sourceValueType?: string | null;
  clientX?: number;
  clientY?: number;
};

export type NodeCreationEntry = {
  id: string;
  family: NodeFamily;
  label: string;
  description: string;
  mode: "node" | "preset";
  origin?: "builtin" | "persisted";
  nodeKind?: "input" | "output";
  presetId?: string;
  acceptsValueTypes?: string[] | null;
};

export type ActiveDocument =
  | {
      source: "template";
      template: TemplateRecord;
      draft: GraphPayload;
    }
  | {
      source: "graph";
      graph: GraphDocument;
    };
