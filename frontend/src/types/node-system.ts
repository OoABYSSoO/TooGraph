export type GraphPosition = {
  x: number;
  y: number;
};

export type GraphNodeSize = {
  width: number;
  height: number;
};

export type NodeFamily = "input" | "output" | "agent" | "condition" | "subgraph";

export type StateDefinition = {
  name: string;
  description: string;
  type: string;
  value?: unknown;
  color: string;
  promptVisible?: boolean;
  binding?: {
    kind: "skill_output";
    skillKey: string;
    nodeId: string;
    fieldKey: string;
    managed?: boolean;
  } | null;
};

export type ReadBinding = {
  state: string;
  required?: boolean;
};

export type WriteBinding = {
  state: string;
  mode?: "replace" | "append";
};

export type AgentSkillBinding = {
  skillKey: string;
  outputMapping?: Record<string, string>;
};

export type AgentThinkingMode = "off" | "low" | "medium" | "high" | "xhigh" | "on";

export type NodeUi = {
  position: GraphPosition;
  collapsed?: boolean;
  size?: GraphNodeSize | null;
};

export type InputBoundaryConfigType = "text" | "file" | "knowledge_base" | "image" | "audio" | "video";

export type InputNode = {
  kind: "input";
  name: string;
  description: string;
  ui: NodeUi;
  reads: ReadBinding[];
  writes: WriteBinding[];
  config: {
    value: unknown;
    boundaryType?: InputBoundaryConfigType;
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
    skillKey: string;
    skillBindings?: AgentSkillBinding[];
    skillInstructionBlocks?: Record<string, AgentSkillInstructionBlock>;
    taskInstruction: string;
    modelSource: "global" | "override";
    model: string;
    thinkingMode: AgentThinkingMode;
    temperature: number;
  };
};

export type AgentSkillInstructionBlock = {
  skillKey: string;
  title: string;
  content: string;
  source: "skill.llmInstruction" | "node.override";
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
    displayMode: "auto" | "plain" | "markdown" | "json" | "documents";
    persistEnabled: boolean;
    persistFormat: "txt" | "md" | "json" | "auto";
    fileNameTemplate: string;
  };
};

export type GraphCorePayload = {
  state_schema: Record<string, StateDefinition>;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  conditional_edges: ConditionalEdge[];
  metadata: Record<string, unknown>;
};

export type SubgraphNode = {
  kind: "subgraph";
  name: string;
  description: string;
  ui: NodeUi;
  reads: ReadBinding[];
  writes: WriteBinding[];
  config: {
    graph: GraphCorePayload;
  };
};

export type GraphNode = InputNode | AgentNode | ConditionNode | OutputNode | SubgraphNode;

export type GraphEdge = {
  source: string;
  target: string;
};

export type ConditionalEdge = {
  source: string;
  branches: Record<string, string>;
};

export type GraphPayload = GraphCorePayload & {
  graph_id?: string | null;
  name: string;
};

export type GraphCatalogStatus = "active" | "disabled";

export type GraphDocument = GraphPayload & {
  graph_id: string;
  status?: GraphCatalogStatus;
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

export type GraphDeleteResponse = {
  graph_id: string;
  status: "deleted";
};

export type GraphRunResponse = {
  run_id: string;
  status: string;
};

export type TemplateSource = "official" | "user";

export type TemplateRecord = {
  template_id: string;
  label: string;
  description: string;
  default_graph_name: string;
  source?: TemplateSource;
  status?: GraphCatalogStatus;
  state_schema: Record<string, StateDefinition>;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  conditional_edges: ConditionalEdge[];
  metadata: Record<string, unknown>;
};

export type TemplateSaveResponse = {
  template_id: string;
  saved: boolean;
  template: TemplateRecord;
};

export type TemplateDeleteResponse = {
  template_id: string;
  status: "deleted";
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
  targetNodeId?: string;
  targetAnchorKind?: "state-in";
  targetStateKey?: string;
  targetValueType?: string | null;
  clientX?: number;
  clientY?: number;
};

export type NodeCreationEntry = {
  id: string;
  family: NodeFamily;
  label: string;
  description: string;
  mode: "node" | "preset" | "subgraph";
  origin?: "builtin" | "persisted";
  nodeKind?: "input" | "output";
  presetId?: string;
  graphId?: string;
  templateId?: string;
  templateSource?: TemplateSource;
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
