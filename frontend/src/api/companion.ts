import type {
  CompanionCommandResponse,
  CompanionMemory,
  CompanionPolicy,
  CompanionProfile,
  CompanionRevision,
  CompanionSessionSummary,
} from "../types/companion.ts";

import { apiGet, apiPost } from "./http.ts";

function executeCompanionCommand<T>(
  action: string,
  payload: Record<string, unknown>,
  changeReason: string,
  targetId?: string,
) {
  return apiPost<CompanionCommandResponse<T>>("/api/companion/commands", {
    action,
    ...(targetId ? { target_id: targetId } : {}),
    payload,
    change_reason: changeReason,
  });
}

export function fetchCompanionProfile() {
  return apiGet<CompanionProfile>("/api/companion/profile");
}

export function updateCompanionProfile(payload: Partial<CompanionProfile>, changeReason: string) {
  return executeCompanionCommand<CompanionProfile>("profile.update", payload, changeReason);
}

export function fetchCompanionPolicy() {
  return apiGet<CompanionPolicy>("/api/companion/policy");
}

export function updateCompanionPolicy(payload: Partial<CompanionPolicy>, changeReason: string) {
  return executeCompanionCommand<CompanionPolicy>("policy.update", payload, changeReason);
}

export function fetchCompanionMemories(includeDeleted = false) {
  return apiGet<CompanionMemory[]>(`/api/companion/memories${includeDeleted ? "?include_deleted=true" : ""}`);
}

export function createCompanionMemory(payload: Pick<CompanionMemory, "type" | "title" | "content">) {
  return executeCompanionCommand<CompanionMemory>(
    "memory.create",
    payload,
    "User created companion memory from the Companion page.",
  );
}

export function updateCompanionMemory(memoryId: string, payload: Partial<CompanionMemory>, changeReason: string) {
  return executeCompanionCommand<CompanionMemory>("memory.update", payload, changeReason, memoryId);
}

export function deleteCompanionMemory(memoryId: string) {
  return executeCompanionCommand<CompanionMemory>(
    "memory.delete",
    {},
    "User deleted companion memory from the Companion page.",
    memoryId,
  );
}

export function fetchCompanionSessionSummary() {
  return apiGet<CompanionSessionSummary>("/api/companion/session-summary");
}

export function updateCompanionSessionSummary(payload: Partial<CompanionSessionSummary>, changeReason: string) {
  return executeCompanionCommand<CompanionSessionSummary>("session_summary.update", payload, changeReason);
}

export function fetchCompanionRevisions(targetType?: string, targetId?: string) {
  const params = new URLSearchParams();
  if (targetType) {
    params.set("target_type", targetType);
  }
  if (targetId) {
    params.set("target_id", targetId);
  }
  const query = params.toString();
  return apiGet<CompanionRevision[]>(`/api/companion/revisions${query ? `?${query}` : ""}`);
}

export function restoreCompanionRevision(revisionId: string) {
  return executeCompanionCommand<{ target_type: string; target_id: string; current_value: Record<string, unknown> }>(
    "revision.restore",
    {},
    "User restored a companion revision from the Companion page.",
    revisionId,
  );
}
