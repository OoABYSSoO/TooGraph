export type BuddyProfile = {
  name: string;
  persona: string;
  tone: string;
  response_style: string;
  display_preferences: Record<string, unknown>;
};

export type BuddyPolicy = {
  graph_permission_mode: "advisory";
  behavior_boundaries: string[];
  communication_preferences: string[];
};

export type BuddyMemory = {
  id: string;
  type: string;
  title: string;
  content: string;
  source: Record<string, unknown>;
  confidence: number;
  enabled: boolean;
  deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type BuddySessionSummary = {
  content: string;
  updated_at: string;
};

export type BuddyChatSession = {
  session_id: string;
  title: string;
  archived: boolean;
  deleted: boolean;
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

export type BuddyGraphPatchOperation = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: unknown;
};

export type BuddyGraphPatchDraftPayload = {
  graph_id?: string | null;
  graph_name?: string | null;
  summary: string;
  rationale?: string;
  patch: BuddyGraphPatchOperation[];
  preview?: Record<string, unknown> | null;
};

export type BuddyGraphPatchDraft = {
  draft_id: string;
  graph_id: string | null;
  graph_name: string | null;
  summary: string;
  rationale: string;
  patch: BuddyGraphPatchOperation[];
  preview: Record<string, unknown> | null;
};
