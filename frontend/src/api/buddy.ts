import type {
  BuddyBackgroundReviewRun,
  BuddyChatMessageRecord,
  BuddyChatSession,
  BuddyCommandRecord,
  BuddyCommandResponse,
  BuddyHomeFiles,
  BuddyMemoryDocument,
  BuddyIdentity,
  BuddyMemorySearchResult,
  BuddyRevision,
  BuddyRunContextSearchResult,
  BuddyRunTemplateBinding,
  BuddySessionSearchResult,
  BuddySessionSummary,
  BuddyUserContextDocument,
} from "../types/buddy.ts";

import { apiDelete, apiGet, apiPatch, apiPost } from "./http.ts";

function executeBuddyCommand<T>(
  action: string,
  payload: Record<string, unknown>,
  changeReason: string,
  targetId?: string,
) {
  return apiPost<BuddyCommandResponse<T>>("/api/buddy/commands", {
    action,
    ...(targetId ? { target_id: targetId } : {}),
    payload,
    change_reason: changeReason,
  });
}

export function fetchBuddyIdentity() {
  return apiGet<BuddyIdentity>("/api/buddy/identity");
}

export function updateBuddyIdentity(payload: Partial<BuddyIdentity>, changeReason: string) {
  return executeBuddyCommand<BuddyIdentity>("buddy_identity.update", payload, changeReason);
}

export function fetchBuddyUserContextDocument() {
  return apiGet<BuddyUserContextDocument>("/api/buddy/user-context");
}

export function updateBuddyUserContextDocument(
  payload: Pick<BuddyUserContextDocument, "content">,
  changeReason: string,
) {
  return executeBuddyCommand<BuddyUserContextDocument>("user_context.update", payload, changeReason);
}

export function fetchBuddyMemoryDocument() {
  return apiGet<BuddyMemoryDocument>("/api/buddy/memory-document");
}

export function fetchBuddyHomeFiles() {
  return apiGet<BuddyHomeFiles>("/api/buddy/home-files");
}

export function updateBuddyMemoryDocument(payload: Pick<BuddyMemoryDocument, "content">, changeReason: string) {
  return executeBuddyCommand<BuddyMemoryDocument>("memory_document.update", payload, changeReason);
}

export function fetchBuddySessionSummary() {
  return apiGet<BuddySessionSummary>("/api/buddy/session-summary");
}

export function updateBuddySessionSummary(payload: Partial<BuddySessionSummary>, changeReason: string) {
  return executeBuddyCommand<BuddySessionSummary>("session_summary.update", payload, changeReason);
}

export function fetchBuddyRunTemplateBinding() {
  return apiGet<BuddyRunTemplateBinding>("/api/buddy/run-template-binding");
}

export function updateBuddyRunTemplateBinding(payload: BuddyRunTemplateBinding, changeReason: string) {
  return executeBuddyCommand<BuddyRunTemplateBinding>("run_template_binding.update", payload, changeReason);
}

export function fetchBuddyBackgroundReviews(sourceRunId?: string, init?: Pick<RequestInit, "signal">) {
  const query = sourceRunId ? `?source_run_id=${encodeURIComponent(sourceRunId)}` : "";
  return apiGet<BuddyBackgroundReviewRun[]>(`/api/buddy/background-reviews${query}`, init);
}

export function fetchBuddyChatSessions(includeDeleted = false) {
  return apiGet<BuddyChatSession[]>(`/api/buddy/sessions${includeDeleted ? "?include_deleted=true" : ""}`);
}

export function createBuddyChatSession(
  payload: {
    title?: string | null;
    parent_session_id?: string | null;
    source?: string | null;
    ended_at?: string | null;
    end_reason?: string | null;
  } = {},
) {
  return apiPost<BuddyChatSession>("/api/buddy/sessions", payload);
}

export function updateBuddyChatSession(
  sessionId: string,
  payload: {
    title?: string | null;
    archived?: boolean | null;
    parent_session_id?: string | null;
    source?: string | null;
    ended_at?: string | null;
    end_reason?: string | null;
  },
) {
  return apiPatch<BuddyChatSession>(`/api/buddy/sessions/${encodeURIComponent(sessionId)}`, payload);
}

export function deleteBuddyChatSession(sessionId: string) {
  return apiDelete<BuddyChatSession>(`/api/buddy/sessions/${encodeURIComponent(sessionId)}`);
}

export function fetchBuddyChatMessages(sessionId: string) {
  return apiGet<BuddyChatMessageRecord[]>(`/api/buddy/sessions/${encodeURIComponent(sessionId)}/messages`);
}

export function appendBuddyChatMessage(
  sessionId: string,
  payload: {
    message_id?: string | null;
    role: "user" | "assistant";
    content: string;
    client_order?: number | null;
    include_in_context?: boolean;
    run_id?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  return apiPost<BuddyChatMessageRecord>(`/api/buddy/sessions/${encodeURIComponent(sessionId)}/messages`, payload);
}

export function searchBuddyChatSessions(
  filters: {
    query?: string;
    currentSessionId?: string;
    embeddingModelRef?: string;
    rerankerModelRef?: string;
    limit?: number;
    window?: number;
    sort?: string;
  } = {},
  init?: Pick<RequestInit, "signal">,
) {
  const params = new URLSearchParams();
  if (filters.query) {
    params.set("query", filters.query);
  }
  if (filters.currentSessionId) {
    params.set("current_session_id", filters.currentSessionId);
  }
  if (filters.embeddingModelRef) {
    params.set("embedding_model_ref", filters.embeddingModelRef);
  }
  if (filters.rerankerModelRef) {
    params.set("reranker_model_ref", filters.rerankerModelRef);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }
  if (filters.window !== undefined) {
    params.set("window", String(filters.window));
  }
  if (filters.sort) {
    params.set("sort", filters.sort);
  }
  const query = params.toString();
  return apiGet<BuddySessionSearchResult>(`/api/buddy/search/sessions${query ? `?${query}` : ""}`, init);
}

export function searchBuddyRunContext(
  filters: {
    runId: string;
    query?: string;
    limit?: number;
  },
  init?: Pick<RequestInit, "signal">,
) {
  const params = new URLSearchParams();
  params.set("run_id", filters.runId);
  if (filters.query) {
    params.set("query", filters.query);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }
  return apiGet<BuddyRunContextSearchResult>(`/api/buddy/search/run-context?${params.toString()}`, init);
}

export function searchBuddyMemories(
  filters: {
    query?: string;
    embeddingModelRef?: string;
    rerankerModelRef?: string;
    scopeKind?: string;
    scopeId?: string;
    layer?: string;
    memoryType?: string;
    status?: string;
    limit?: number;
  } = {},
  init?: Pick<RequestInit, "signal">,
) {
  const params = new URLSearchParams();
  if (filters.query) {
    params.set("query", filters.query);
  }
  if (filters.embeddingModelRef) {
    params.set("embedding_model_ref", filters.embeddingModelRef);
  }
  if (filters.rerankerModelRef) {
    params.set("reranker_model_ref", filters.rerankerModelRef);
  }
  if (filters.scopeKind) {
    params.set("scope_kind", filters.scopeKind);
  }
  if (filters.scopeId) {
    params.set("scope_id", filters.scopeId);
  }
  if (filters.layer) {
    params.set("layer", filters.layer);
  }
  if (filters.memoryType) {
    params.set("memory_type", filters.memoryType);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }
  const query = params.toString();
  return apiGet<BuddyMemorySearchResult>(`/api/buddy/search/memories${query ? `?${query}` : ""}`, init);
}

export function fetchBuddyRevisions(targetType?: string, targetId?: string) {
  const params = new URLSearchParams();
  if (targetType) {
    params.set("target_type", targetType);
  }
  if (targetId) {
    params.set("target_id", targetId);
  }
  const query = params.toString();
  return apiGet<BuddyRevision[]>(`/api/buddy/revisions${query ? `?${query}` : ""}`);
}

export function fetchBuddyCommands() {
  return apiGet<BuddyCommandRecord[]>("/api/buddy/commands");
}

export function restoreBuddyRevision(revisionId: string) {
  return executeBuddyCommand<{ target_type: string; target_id: string; current_value: Record<string, unknown> }>(
    "revision.restore",
    {},
    "User restored a buddy revision from the Buddy page.",
    revisionId,
  );
}
