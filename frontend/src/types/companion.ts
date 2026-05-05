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
  target_type: string;
  target_id: string;
  operation: string;
  previous_value: Record<string, unknown>;
  next_value: Record<string, unknown>;
  changed_by: string;
  change_reason: string;
  created_at: string;
};

export type CompanionCommandRecord = {
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

export type CompanionCommandResponse<T> = {
  command: CompanionCommandRecord;
  result: T;
  revision: CompanionRevision | null;
};

export type CompanionGraphPatchOperation = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: unknown;
};

export type CompanionGraphPatchDraftPayload = {
  graph_id?: string | null;
  graph_name?: string | null;
  summary: string;
  rationale?: string;
  patch: CompanionGraphPatchOperation[];
  preview?: Record<string, unknown> | null;
};

export type CompanionGraphPatchDraft = {
  draft_id: string;
  graph_id: string | null;
  graph_name: string | null;
  summary: string;
  rationale: string;
  patch: CompanionGraphPatchOperation[];
  preview: Record<string, unknown> | null;
};
