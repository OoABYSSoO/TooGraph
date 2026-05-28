export type ModelLogMessage = {
  role: string;
  body: string;
};

export type ModelLogEntry = {
  id: string;
  timestamp: string;
  started_at?: string;
  completed_at?: string;
  duration_ms: number;
  provider_id: string;
  transport: string;
  model: string;
  path: string;
  status?: string;
  status_code?: number | null;
  error?: string;
  request_kind: string;
  messages: ModelLogMessage[];
  reasoning: string;
  content: string;
  request_raw: Record<string, unknown>;
  response_raw: Record<string, unknown>;
  run_id?: string;
  root_run_id?: string;
  parent_run_id?: string;
  parent_node_id?: string;
  execution_id?: string;
  node_id?: string;
  node_type?: string;
  node_name?: string;
  phase?: string;
  graph_id?: string;
  graph_name?: string;
  run_path?: string[];
  subgraph_path?: string[];
  provider_profile?: Record<string, unknown>;
  provider_request_timeout_seconds?: number | null;
  provider_cache_policy?: string;
  provider_cache_decision?: Record<string, unknown>;
  provider_cost_budget?: Record<string, unknown>;
  provider_rate_profile?: Record<string, unknown>;
  provider_cost_estimate?: Record<string, unknown>;
  provider_rate_decision?: Record<string, unknown>;
  provider_rate_reservation?: Record<string, unknown>;
};

export type ModelLogTreeNode = {
  kind: "run" | "graph_node";
  id: string;
  run_id: string;
  root_run_id?: string;
  node_id?: string;
  node_type?: string;
  execution_id?: string;
  label: string;
  status?: string;
  started_at?: string;
  duration_ms?: number | null;
  model_log_ids: string[];
  children: ModelLogTreeNode[];
};

export type ModelLogRetentionSettings = {
  max_root_runs: number;
};

export type ModelLogPage = {
  entries: ModelLogEntry[];
  run_trees: ModelLogTreeNode[];
  total: number;
  page: number;
  size: number;
  pages: number;
  retention: ModelLogRetentionSettings;
};
