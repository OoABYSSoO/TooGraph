export type CompanionProfile = {
  name: string;
  persona: string;
  tone: string;
  response_style: string;
  display_preferences: Record<string, unknown>;
};

export type CompanionPolicy = {
  graph_permission_mode: "advisory";
  behavior_boundaries: string[];
  communication_preferences: string[];
};

export type CompanionMemory = {
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

export type CompanionSessionSummary = {
  content: string;
  updated_at: string;
};

export type CompanionRevision = {
  revision_id: string;
  target_type: "profile" | "policy" | "memory" | "session_summary";
  target_id: string;
  operation: "create" | "update" | "delete" | "restore";
  previous_value: Record<string, unknown>;
  next_value: Record<string, unknown>;
  changed_by: "user" | "companion" | "memory_curator";
  change_reason: string;
  created_at: string;
};
