export type BuddyProfile = {
  name: string;
  persona: string;
  tone: string;
  response_style: string;
  display_preferences: Record<string, unknown>;
};

export type BuddyPolicy = {
  graph_permission_mode: "ask_first" | "full_access";
  behavior_boundaries: string[];
  communication_preferences: string[];
};

export type BuddyMemoryDocument = {
  path: string;
  content: string;
  updated_at: string;
};

export type BuddySessionSummary = {
  content: string;
  updated_at: string;
};

export type BuddyRunInputSource = "current_message" | "conversation_history" | "page_context" | "buddy_home_context";

export type BuddyRunTemplateBinding = {
  version?: number;
  template_id: string;
  input_bindings: Record<string, BuddyRunInputSource>;
  updated_at?: string;
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
