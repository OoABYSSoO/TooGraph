import type {
  BuddyBackgroundReviewRun,
  BuddyChatMessageRecord,
  BuddyChatSession,
  BuddyCommandRecord,
  BuddyCommandResponse,
  BuddyHomeFiles,
  BuddyImprovementCandidate,
  BuddyMemoryReviewTemplateBinding,
  BuddyMemoryDocument,
  BuddyIdentity,
  BuddyRevision,
  BuddyRunTemplateBinding,
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

export function fetchBuddyMemoryReviewTemplateBinding() {
  return apiGet<BuddyMemoryReviewTemplateBinding>("/api/buddy/memory-review-template-binding");
}

export function updateBuddyMemoryReviewTemplateBinding(payload: BuddyMemoryReviewTemplateBinding, changeReason: string) {
  return executeBuddyCommand<BuddyMemoryReviewTemplateBinding>("memory_review_template_binding.update", payload, changeReason);
}

export function fetchBuddyBackgroundReviews(sourceRunId?: string, init?: Pick<RequestInit, "signal">) {
  const query = sourceRunId ? `?source_run_id=${encodeURIComponent(sourceRunId)}` : "";
  return apiGet<BuddyBackgroundReviewRun[]>(`/api/buddy/background-reviews${query}`, init);
}

export function fetchBuddyImprovementCandidates(
  filters: {
    sourceRunId?: string;
    reviewId?: string;
    reviewRunId?: string;
    status?: string;
  } = {},
  init?: Pick<RequestInit, "signal">,
) {
  const params = new URLSearchParams();
  if (filters.sourceRunId) {
    params.set("source_run_id", filters.sourceRunId);
  }
  if (filters.reviewId) {
    params.set("review_id", filters.reviewId);
  }
  if (filters.reviewRunId) {
    params.set("review_run_id", filters.reviewRunId);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  const query = params.toString();
  return apiGet<BuddyImprovementCandidate[]>(`/api/buddy/improvement-candidates${query ? `?${query}` : ""}`, init);
}

export function linkBuddyImprovementCandidateValidationRun(candidateId: string, validationRunId: string) {
  return apiPost<BuddyImprovementCandidate>(
    `/api/buddy/improvement-candidates/${encodeURIComponent(candidateId)}/validation-run`,
    { validation_run_id: validationRunId },
  );
}

export function syncBuddyImprovementCandidateValidationStatus(candidateId: string) {
  return apiPost<BuddyImprovementCandidate>(
    `/api/buddy/improvement-candidates/${encodeURIComponent(candidateId)}/sync-validation-status`,
    null,
  );
}

export function decideBuddyImprovementCandidate(
  candidateId: string,
  decision: "approve" | "reject",
  reason: string,
) {
  return apiPost<BuddyImprovementCandidate>(
    `/api/buddy/improvement-candidates/${encodeURIComponent(candidateId)}/decision`,
    { decision, reason },
  );
}

export function applyBuddyImprovementCandidate(candidateId: string, changeReason: string) {
  return apiPost<BuddyImprovementCandidate>(
    `/api/buddy/improvement-candidates/${encodeURIComponent(candidateId)}/apply`,
    { change_reason: changeReason },
  );
}

export function enqueueBuddyBackgroundReview(payload: {
  source_run_id: string;
  buddy_model_ref?: string;
  trigger_reason?: string;
}) {
  return apiPost<BuddyBackgroundReviewRun>("/api/buddy/background-reviews", payload);
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
