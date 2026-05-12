import type {
  BuddyChatMessageRecord,
  BuddyChatSession,
  BuddyCommandRecord,
  BuddyCommandResponse,
  BuddyGraphPatchDraft,
  BuddyGraphPatchDraftPayload,
  BuddyMemory,
  BuddyPolicy,
  BuddyProfile,
  BuddyRevision,
  BuddySessionSummary,
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

export function fetchBuddyProfile() {
  return apiGet<BuddyProfile>("/api/buddy/profile");
}

export function updateBuddyProfile(payload: Partial<BuddyProfile>, changeReason: string) {
  return executeBuddyCommand<BuddyProfile>("profile.update", payload, changeReason);
}

export function fetchBuddyPolicy() {
  return apiGet<BuddyPolicy>("/api/buddy/policy");
}

export function updateBuddyPolicy(payload: Partial<BuddyPolicy>, changeReason: string) {
  return executeBuddyCommand<BuddyPolicy>("policy.update", payload, changeReason);
}

export function fetchBuddyMemories(includeDeleted = false) {
  return apiGet<BuddyMemory[]>(`/api/buddy/memories${includeDeleted ? "?include_deleted=true" : ""}`);
}

export function createBuddyMemory(payload: Pick<BuddyMemory, "type" | "title" | "content">) {
  return executeBuddyCommand<BuddyMemory>(
    "memory.create",
    payload,
    "User created buddy memory from the Buddy page.",
  );
}

export function updateBuddyMemory(memoryId: string, payload: Partial<BuddyMemory>, changeReason: string) {
  return executeBuddyCommand<BuddyMemory>("memory.update", payload, changeReason, memoryId);
}

export function deleteBuddyMemory(memoryId: string) {
  return executeBuddyCommand<BuddyMemory>(
    "memory.delete",
    {},
    "User deleted buddy memory from the Buddy page.",
    memoryId,
  );
}

export function fetchBuddySessionSummary() {
  return apiGet<BuddySessionSummary>("/api/buddy/session-summary");
}

export function updateBuddySessionSummary(payload: Partial<BuddySessionSummary>, changeReason: string) {
  return executeBuddyCommand<BuddySessionSummary>("session_summary.update", payload, changeReason);
}

export function fetchBuddyChatSessions(includeDeleted = false) {
  return apiGet<BuddyChatSession[]>(`/api/buddy/sessions${includeDeleted ? "?include_deleted=true" : ""}`);
}

export function createBuddyChatSession(payload: { title?: string | null } = {}) {
  return apiPost<BuddyChatSession>("/api/buddy/sessions", payload);
}

export function updateBuddyChatSession(sessionId: string, payload: { title?: string | null; archived?: boolean | null }) {
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

export function createBuddyGraphPatchDraft(payload: BuddyGraphPatchDraftPayload, changeReason: string) {
  return executeBuddyCommand<BuddyGraphPatchDraft>("graph_patch.draft", payload, changeReason);
}
