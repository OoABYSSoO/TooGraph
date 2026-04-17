export type RunLifecycleRecord = {
  updated_at: string;
  paused_at?: string | null;
  resumed_at?: string | null;
  pause_reason?: string | null;
  resume_count: number;
  resumed_from_run_id?: string | null;
};

export type CheckpointMetadata = {
  available: boolean;
  checkpoint_id?: string | null;
  thread_id?: string | null;
  checkpoint_ns?: string | null;
  saver?: string | null;
  resume_source?: string | null;
};

export type NodeStateReadRecord = {
  state_key: string;
  input_key: string;
  value?: unknown;
};

export type NodeStateWriteRecord = {
  state_key: string;
  output_key: string;
  mode?: string;
  value?: unknown;
  changed?: boolean;
};

export type NodeExecutionArtifacts = {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  family: string;
  iteration?: number | null;
  selected_branch?: string | null;
  response?: Record<string, unknown> | null;
  reasoning?: string | null;
  runtime_config?: Record<string, unknown> | null;
  state_reads: NodeStateReadRecord[];
  state_writes: NodeStateWriteRecord[];
};

export type NodeExecutionDetail = {
  node_id: string;
  node_type: string;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  artifacts: NodeExecutionArtifacts;
  warnings: string[];
  errors: string[];
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

export type RunArtifacts = {
  cycle_iterations?: CycleIterationRecord[];
  cycle_summary?: CycleSummary;
};

export type RunSummary = {
  run_id: string;
  graph_id?: string | null;
  graph_name: string;
  status: string;
  runtime_backend: string;
  lifecycle: RunLifecycleRecord;
  checkpoint_metadata: CheckpointMetadata;
  current_node_id?: string | null;
  revision_round: number;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  final_score?: number | null;
};

export type RunDetail = RunSummary & {
  metadata: Record<string, unknown>;
  selected_skills: string[];
  skill_outputs: Array<Record<string, unknown>>;
  evaluation_result: Record<string, unknown>;
  knowledge_summary: string;
  memory_summary: string;
  final_result: string;
  node_status_map: Record<string, string>;
  node_executions: NodeExecutionDetail[];
  warnings: string[];
  errors: string[];
  artifacts: RunArtifacts;
  cycle_summary?: CycleSummary;
};
