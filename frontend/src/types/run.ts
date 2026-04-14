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

export type SubgraphExecutionArtifact = {
  graph_id?: string | null;
  name?: string | null;
  status?: string | null;
  node_status_map?: Record<string, string>;
  input_values?: Record<string, unknown>;
  output_values?: Record<string, unknown>;
  node_executions?: NodeExecutionDetail[];
  errors?: string[];
};

export type NodeExecutionArtifacts = {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  family: string;
  iteration?: number | null;
  subgraph?: SubgraphExecutionArtifact | null;
  selected_branch?: string | null;
  response?: Record<string, unknown> | null;
  reasoning?: string | null;
  runtime_config?: Record<string, unknown> | null;
  selected_capabilities?: Array<Record<string, unknown>>;
  capability_outputs?: Array<Record<string, unknown>>;
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
  source_kind: string;
  source_key: string;
  display_mode: string;
  persist_enabled: boolean;
  persist_format: string;
  value?: unknown;
};

export type ExportedOutput = OutputPreview & {
  saved_file?: SavedOutputArtifact | null;
};

export type StateWriterRecord = {
  node_id: string;
  output_key: string;
  mode?: string;
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
  mode?: string;
  previous_value?: unknown;
  value?: unknown;
  sequence?: number | null;
  created_at: string;
};

export type ActivityEvent = {
  sequence?: number | null;
  kind: string;
  summary: string;
  node_id?: string | null;
  subgraph_node_id?: string | null;
  subgraph_path?: string[];
  status?: string | null;
  duration_ms?: number | null;
  detail?: Record<string, unknown>;
  error?: string | null;
  created_at: string;
};

export type RunSnapshot = {
  snapshot_id: string;
  kind: string;
  label: string;
  created_at: string;
  status: string;
  current_node_id?: string | null;
  checkpoint_metadata?: CheckpointMetadata;
  state_snapshot: StateSnapshot;
  graph_snapshot: Record<string, unknown>;
  artifacts: RunArtifacts;
  node_status_map: Record<string, string>;
  subgraph_status_map?: Record<string, Record<string, string>>;
  output_previews: OutputPreview[];
  final_result?: string;
};

export type RunSnapshotOption = {
  snapshot_id: string | null;
  kind: string;
  label: string;
  status: string;
  current_node_id?: string | null;
};

export type RunArtifacts = {
  skill_outputs?: Array<Record<string, unknown>>;
  activity_events?: ActivityEvent[];
  capability_outputs?: Array<Record<string, unknown>>;
  output_previews?: OutputPreview[];
  saved_outputs?: SavedOutputArtifact[];
  exported_outputs?: ExportedOutput[];
  node_outputs?: Record<string, Record<string, unknown>>;
  active_edge_ids?: string[];
  state_events?: StateEvent[];
  state_values?: Record<string, unknown>;
  streaming_outputs?: Record<string, Record<string, unknown>>;
  cycle_iterations?: CycleIterationRecord[];
  cycle_summary?: CycleSummary;
};

export type RunSummary = {
  run_id: string;
  graph_id?: string | null;
  graph_name: string;
  status: string;
  restorable_snapshot_available?: boolean;
  run_snapshot_options?: RunSnapshotOption[];
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
  selected_capabilities?: Array<Record<string, unknown>>;
  capability_outputs?: Array<Record<string, unknown>>;
  evaluation_result: Record<string, unknown>;
  memory_summary: string;
  final_result: string;
  node_status_map: Record<string, string>;
  subgraph_status_map?: Record<string, Record<string, string>>;
  node_executions: NodeExecutionDetail[];
  warnings: string[];
  errors: string[];
  output_previews: OutputPreview[];
  artifacts: RunArtifacts;
  state_snapshot: StateSnapshot;
  graph_snapshot: Record<string, unknown>;
  run_snapshots?: RunSnapshot[];
  cycle_summary?: CycleSummary;
};
