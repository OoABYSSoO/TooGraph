export type ValueType = "text" | "json" | "image" | "audio" | "video" | "file" | "knowledge_base" | "any";

export type PortDefinition = {
  key: string;
  label: string;
  valueType: ValueType;
  required?: boolean;
};

export type SkillAttachment = {
  name: string;
  skillKey: string;
  inputMapping: Record<string, string>;
  contextBinding: Record<string, string>;
  usage?: "required" | "optional";
};

export type AgentModelSource = "global" | "override";
export type AgentThinkingMode = "off" | "on";
export type StateWriteMode = "replace";

export type StateReadBinding = {
  stateKey: string;
  inputKey: string;
  required?: boolean;
};

export type StateWriteBinding = {
  stateKey: string;
  outputKey: string;
  mode?: StateWriteMode;
};

export type StateFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "markdown"
  | "json"
  | "file_list"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "knowledge_base";

export type StateFieldUi = {
  color?: string;
};

export type StateField = {
  key: string;
  type: StateFieldType;
  name: string;
  description: string;
  value?: unknown;
  ui?: StateFieldUi;
};

type NodeStateBindings = {
  stateReads?: StateReadBinding[];
  stateWrites?: StateWriteBinding[];
};

export type InputBoundaryNode = NodeStateBindings & {
  presetId: string;
  name?: string;
  description: string;
  family: "input";
  valueType: ValueType;
  output: PortDefinition;
  value: string;
};

export type AgentNode = NodeStateBindings & {
  presetId: string;
  name?: string;
  description: string;
  family: "agent";
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  systemInstruction: string;
  taskInstruction: string;
  skills: SkillAttachment[];
  outputBinding: Record<string, string>;
  modelSource?: AgentModelSource;
  model?: string;
  thinkingMode?: AgentThinkingMode;
  temperature?: number;
};

export type ConditionRule = {
  source: string;
  operator: "==" | "!=" | ">=" | "<=" | ">" | "<" | "exists";
  value: string | number | boolean | null;
};

export type BranchDefinition = {
  key: string;
  label: string;
};

export type ConditionNode = NodeStateBindings & {
  presetId: string;
  name?: string;
  description: string;
  family: "condition";
  inputs: PortDefinition[];
  branches: BranchDefinition[];
  conditionMode: "rule" | "cycle";
  rule: ConditionRule;
  branchMapping: Record<string, string>;
};

export type OutputBoundaryNode = NodeStateBindings & {
  presetId: string;
  name?: string;
  description: string;
  family: "output";
  input: PortDefinition;
  displayMode: "auto" | "plain" | "markdown" | "json";
  persistEnabled: boolean;
  persistFormat: "txt" | "md" | "json" | "auto";
  fileNameTemplate: string;
};

export type NodePresetDefinition =
  | InputBoundaryNode
  | AgentNode
  | ConditionNode
  | OutputBoundaryNode;

export type NodeFamily = NodePresetDefinition["family"];

export type NodeViewportSize = {
  width?: number | null;
  height?: number | null;
};

export type GraphPosition = {
  x: number;
  y: number;
};

export type SavedOutputArtifact = {
  node_id?: string | null;
  source_key: string;
  path: string;
  format: string;
  file_name: string;
};

export type OutputPreview = {
  node_id?: string | null;
  label?: string | null;
  source_kind?: "node_output" | "state";
  source_key: string;
  display_mode?: string;
  persist_enabled?: boolean;
  persist_format?: string;
  value?: unknown;
};

export type ExportedOutput = OutputPreview & {
  saved_file?: SavedOutputArtifact | null;
};

export type StateWriterRecord = {
  node_id: string;
  output_key: string;
  mode: StateWriteMode;
  updated_at?: string | null;
};

export type StateSnapshot = {
  values: Record<string, unknown>;
  last_writers: Record<string, StateWriterRecord>;
};

export type StateEvent = {
  node_id: string;
  state_key: string;
  output_key: string;
  mode: StateWriteMode;
  value?: unknown;
  created_at: string;
};

export type NodeExecutionArtifacts = {
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  family?: string;
  iteration?: number | null;
  selected_branch?: string | null;
  response?: Record<string, unknown> | null;
  reasoning?: string | null;
  runtime_config?: Record<string, unknown> | null;
  state_reads?: Array<{
    state_key: string;
    input_key: string;
    value?: unknown;
  }>;
  state_writes?: Array<{
    state_key: string;
    output_key: string;
    mode: StateWriteMode;
    value?: unknown;
  }>;
};

export type RunStatus = "queued" | "running" | "completed" | "failed";
export type RunNodeStatus = "idle" | "running" | "success" | "failed";

export type RunNodeExecution = {
  node_id: string;
  node_type: string;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms: number;
  input_summary?: string;
  output_summary?: string;
  artifacts?: NodeExecutionArtifacts;
  warnings?: string[];
  errors?: string[];
};

export type CycleIterationRecord = {
  iteration: number;
  executed_node_ids?: string[];
  incoming_edge_ids?: string[];
  activated_edge_ids?: string[];
  next_iteration_edge_ids?: string[];
  stop_reason?: string | null;
};

export type CycleSummary = {
  has_cycle: boolean;
  back_edges?: string[];
  iteration_count: number;
  max_iterations: number;
  stop_reason?: string | null;
};

export type NodeSystemRunDetail = {
  run_id: string;
  graph_id: string;
  graph_name: string;
  status: RunStatus;
  current_node_id?: string | null;
  revision_round: number;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  final_score?: number | null;
  selected_skills?: string[];
  skill_outputs?: Array<Record<string, unknown>>;
  evaluation_result?: Record<string, unknown>;
  knowledge_summary?: string;
  memory_summary?: string;
  final_result?: string | null;
  node_status_map?: Record<string, RunNodeStatus>;
  node_executions: RunNodeExecution[];
  warnings?: string[];
  errors?: string[];
  output_previews?: OutputPreview[];
  artifacts: {
    exported_outputs?: ExportedOutput[];
    state_events?: StateEvent[];
    state_values?: Record<string, unknown>;
    cycle_iterations?: CycleIterationRecord[];
    cycle_summary?: CycleSummary;
  };
  state_snapshot?: StateSnapshot;
  cycle_summary?: CycleSummary;
};

export function isValueTypeCompatible(source: ValueType, target: ValueType) {
  return source === "any" || target === "any" || source === target;
}
