export type BuddyIdentity = {
  name: string;
  persona: string;
  tone: string;
  response_style: string;
  display_preferences: Record<string, unknown>;
};

export type BuddyMemoryDocument = {
  path: string;
  content: string;
  updated_at: string;
};

export type BuddyUserContextDocument = {
  path: string;
  content: string;
  updated_at: string;
};

export type BuddyHomeFileEntry = {
  path: string;
  kind: "markdown" | "json" | "database" | "directory" | "text";
  exists: boolean;
  readable: boolean;
  size_bytes: number;
  updated_at: string;
  content: string;
  truncated: boolean;
  summary: string;
  error: string;
};

export type BuddyHomeFiles = {
  root: string;
  files: BuddyHomeFileEntry[];
};

export type BuddySessionSummary = {
  content: string;
  updated_at: string;
};

export type BuddyRunInputSource =
  | "current_message"
  | "conversation_history"
  | "session_summary"
  | "buddy_home_context"
  | "current_session_id";

export type BuddyRunTemplateBinding = {
  version?: number;
  template_id: string;
  input_bindings: Record<string, BuddyRunInputSource>;
  updated_at?: string;
  repair_recommended?: boolean;
  repair_reason?: string;
  repair_previous_template_id?: string;
  repair_error?: string;
};

export type BuddyMemoryReviewInputSource =
  | "source_run_id"
  | "current_session_id"
  | "user_message"
  | "conversation_history"
  | "buddy_home_context"
  | "request_understanding"
  | "capability_result"
  | "capability_review"
  | "public_response";

export type BuddyMemoryReviewTemplateBinding = {
  version?: number;
  template_id: string;
  input_bindings: Record<string, BuddyMemoryReviewInputSource>;
  updated_at?: string;
};

export type BuddyBackgroundReviewRun = {
  review_id: string;
  source_run_id: string;
  review_run_id: string;
  template_id: string;
  status: string;
  trigger_reason: string;
  metadata: Record<string, unknown>;
  error: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  writeback_summary?: BuddyBackgroundReviewWritebackSummary;
  improvement_summary?: BuddyBackgroundReviewImprovementSummary;
};

export type BuddyBackgroundReviewWritebackSummary = {
  applied_count: number;
  skipped_count: number;
  revision_ids: string[];
  revisions: Array<Record<string, unknown>>;
  memory_ids: string[];
  applied_commands: Array<Record<string, unknown>>;
  skipped_commands: Array<Record<string, unknown>>;
  evidence_items: Array<Record<string, unknown>>;
  warnings: string[];
};

export type BuddyBackgroundReviewImprovementSummary = {
  candidate_count: number;
  risk_counts: Record<string, number>;
  candidates: Array<Record<string, unknown>>;
  warnings: string[];
};

export type BuddyImprovementCandidate = {
  candidate_id: string;
  kind: string;
  status: string;
  status_reason: string;
  source_run_id: string;
  review_id: string;
  review_run_id: string;
  target_ref: Record<string, unknown>;
  evidence_refs: Array<Record<string, unknown>>;
  risk_level: string;
  expected_benefit: string;
  proposed_change_summary: string;
  approval_required: boolean;
  validation_run_id: string;
  validation_result: Record<string, unknown>;
  applied_revision_id: string;
  applied_command: Record<string, unknown>;
  applied_at: string;
  decision: Record<string, unknown>;
  decided_at: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BuddyRunTemplateBindingValidation = {
  valid: boolean;
  issues: string[];
};

export type BuddyChatSession = {
  session_id: string;
  title: string;
  archived: boolean;
  deleted: boolean;
  parent_session_id: string | null;
  source: string;
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string;
  last_message_at: string | null;
};

export type BuddyChatMessageRecord = {
  message_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  client_order: number | null;
  include_in_context: boolean;
  run_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BuddyRevision = {
  revision_id: string;
  target_type: string;
  target_id: string;
  operation: string;
  previous_value: Record<string, unknown>;
  next_value: Record<string, unknown>;
  changed_by: string;
  change_reason: string;
  created_at: string;
};

export type BuddyCommandRecord = {
  command_id: string;
  kind: string;
  action: string;
  status: string;
  target_type: string;
  target_id: string;
  revision_id: string | null;
  run_id: string | null;
  payload: Record<string, unknown>;
  change_reason: string;
  created_at: string;
  completed_at: string | null;
};

export type BuddyCommandResponse<T> = {
  command: BuddyCommandRecord;
  result: T;
  revision: BuddyRevision | null;
};
