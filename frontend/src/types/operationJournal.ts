export type OperationJournalArtifactRef = {
  title?: string | null;
  artifact_kind?: string | null;
  path?: string | null;
  local_path?: string | null;
  file_name?: string | null;
  source_key?: string | null;
  node_id?: string | null;
  format?: string | null;
  content_type?: string | null;
};

export type OperationJournalRetryRecord = {
  kind?: string | null;
  target_id?: string | null;
  attempts?: number | null;
  status?: string | null;
  elapsed_ms?: number | null;
};

export type OperationJournalEntry = {
  id: string;
  operation_request_id: string;
  run_id: string;
  stage: string;
  status: string;
  summary: string;
  node_id?: string | null;
  subgraph_node_id?: string | null;
  subgraph_path?: string[];
  operation?: Record<string, unknown>;
  operation_request?: Record<string, unknown>;
  operation_report?: Record<string, unknown>;
  page_snapshots?: Record<string, unknown>;
  triggered_run?: Record<string, unknown>;
  artifact_refs?: OperationJournalArtifactRef[];
  retry_chain?: OperationJournalRetryRecord[];
  failure_category?: string | null;
  error?: string | null;
  journal?: unknown[];
  activity_sequence?: number | null;
  activity_created_at?: string | null;
  recorded_at?: string | null;
  target_id?: string | null;
  target_label?: string | null;
  input_text?: string | null;
};

export type OperationJournalPage = {
  entries: OperationJournalEntry[];
  total: number;
  page: number;
  size: number;
  pages: number;
};
