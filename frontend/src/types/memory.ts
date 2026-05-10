export type PlatformMemoryConflict = {
  id: string;
  scope: string;
  layer: string;
  type: string;
  status: string;
  summary: string;
  importance?: number | null;
  confidence?: number | null;
  source?: Record<string, unknown>;
};

export type PlatformMemory = {
  id: string;
  scope: string;
  layer: string;
  type: string;
  summary: string;
  content: string;
  confidence: number;
  importance: number;
  evidence: unknown[];
  artifact_refs: unknown[];
  source: Record<string, unknown>;
  status: string;
  supersedes: string[];
  conflicts?: PlatformMemoryConflict[];
  created_at: string;
  updated_at: string;
};

export type PlatformMemoryRevision = {
  revision_id: string;
  memory_id: string;
  action: string;
  previous_value: Record<string, unknown>;
  next_value: Record<string, unknown>;
  actor: string;
  reason: string;
  created_at: string;
};

export type PlatformMemoryEvent = {
  event_id: string;
  memory_id: string;
  action: string;
  actor: string;
  reason: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type PlatformMemoryReplaceResponse = {
  replacement: PlatformMemory;
  superseded: PlatformMemory[];
};

export type PlatformMemoryRestoreResponse = {
  restored_revision: PlatformMemoryRevision;
  target: "previous" | "next";
  current_value: PlatformMemory;
};
