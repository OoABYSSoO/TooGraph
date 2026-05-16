export type GraphPosition = {
  x: number;
  y: number;
};

export type GraphNodeSize = {
  width: number;
  height: number;
};

export type NodeFamily = "input" | "output" | "agent" | "batch" | "condition" | "subgraph";

export type StateDefinition = {
  name: string;
  description: string;
  type: string;
  value?: unknown;
  color: string;
  binding?: {
    kind: "action_output";
    actionKey: string;
    nodeId: string;
    fieldKey: string;
    managed?: boolean;
  } | {
    kind: "capability_result";
    nodeId: string;
    fieldKey?: "result_package";
    managed?: boolean;
  } | null;
};

export type ReadBinding = {
  state: string;
  required?: boolean;
  binding?: {
    kind: "action_input";
    actionKey: string;
    fieldKey: string;
    managed?: boolean;
  } | null;
};

export type WriteBinding = {
  state: string;
  mode?: "replace" | "append";
};

export type AgentActionBinding = {
  actionKey: string;
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
    actionKey: string;
    actionBindings?: AgentActionBinding[];
    suspendedFreeWrites?: WriteBinding[];
    actionInstructionBlocks?: Record<string, AgentActionInstructionBlock>;
    taskInstruction: string;
    modelSource: "global" | "override";
    model: string;
    thinkingMode: AgentThinkingMode;
    temperature: number;
  };
};

export type BatchInputMode = "shared" | "batch";
export type BatchWorkerSource = "default_llm" | "subgraph";

export type BatchSubgraphWorker = {
  graph: GraphCorePayload;
  templateId?: string;
  templateSource?: TemplateSource;
  label?: string;
};

export type BatchDefaultWorkerSnapshot = {
  defaultWorker: AgentNode["config"];
  reads: ReadBinding[];
  writes: WriteBinding[];
  inputModes: Record<string, BatchInputMode>;
  stateSchema: Record<string, StateDefinition>;
};

export type BatchNode = {
  kind: "batch";
  name: string;
  description: string;
  ui: NodeUi;
  reads: ReadBinding[];
  writes: WriteBinding[];
  config: {
    workerSource: BatchWorkerSource;
    inputModes: Record<string, BatchInputMode>;
    maxConcurrency: number;
    retryCount: number;
    continueOnError: boolean;
    defaultWorker: AgentNode["config"];
    defaultWorkerSnapshot?: BatchDefaultWorkerSnapshot | null;
    subgraphWorker?: BatchSubgraphWorker | null;
  };
};

export type AgentActionInstructionBlock = {
  actionKey: string;
  title: string;
  content: string;
  source: "action.llmInstruction" | "node.override";
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
    displayMode: "auto" | "plain" | "markdown" | "html" | "json" | "documents";
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

export type GraphNode = InputNode | AgentNode | BatchNode | ConditionNode | OutputNode | SubgraphNode;

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
  revision_id: string;
  validation: GraphValidationResponse;
};

export type GraphRevisionContext = {
  actor?: string;
  run_id?: string;
  node_id?: string;
  reason?: string;
};

export type GraphRevisionDiffEntry = {
  op: "add" | "remove" | "replace";
  path: string;
  previous?: unknown;
  next?: unknown;
};

export type GraphRevisionRecord = {
  revision_id: string;
  graph_id: string;
  previous_graph: GraphDocument | null;
  next_graph: GraphDocument | null;
  diff: GraphRevisionDiffEntry[];
  actor: string;
  run_id: string;
  node_id: string;
  reason: string;
  validation: GraphValidationResponse;
  created_at: string;
};

export type GraphRevisionRestoreResponse = {
  graph_id: string;
  restored: boolean;
  graph: GraphDocument | null;
  revision: GraphRevisionRecord;
  restored_revision_id: string;
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
  capabilityDiscoverable?: boolean;
  hasBreakpointMetadata?: boolean;
  capabilityDiscoverableBlockedReason?: string;
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
  nodeKind?: "input" | "output" | "batch" | "subgraph";
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
