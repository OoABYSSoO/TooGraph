import type {
  CompanionMemory,
  CompanionPolicy,
  CompanionProfile,
  CompanionRevision,
  CompanionSessionSummary,
} from "../types/companion.ts";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./http.ts";

export function fetchCompanionProfile() {
  return apiGet<CompanionProfile>("/api/companion/profile");
}

export function updateCompanionProfile(payload: Partial<CompanionProfile>, changeReason: string) {
  return apiPut<CompanionProfile>("/api/companion/profile", { ...payload, change_reason: changeReason });
}

export function fetchCompanionPolicy() {
  return apiGet<CompanionPolicy>("/api/companion/policy");
}

export function updateCompanionPolicy(payload: Partial<CompanionPolicy>, changeReason: string) {
  return apiPut<CompanionPolicy>("/api/companion/policy", { ...payload, change_reason: changeReason });
}

export function fetchCompanionMemories(includeDeleted = false) {
  return apiGet<CompanionMemory[]>(`/api/companion/memories${includeDeleted ? "?include_deleted=true" : ""}`);
}

export function createCompanionMemory(payload: Pick<CompanionMemory, "type" | "title" | "content">) {
  return apiPost<CompanionMemory>("/api/companion/memories", payload);
}

export function updateCompanionMemory(memoryId: string, payload: Partial<CompanionMemory>, changeReason: string) {
  return apiPatch<CompanionMemory>(`/api/companion/memories/${memoryId}`, { ...payload, change_reason: changeReason });
}

export function deleteCompanionMemory(memoryId: string) {
  return apiDelete<CompanionMemory>(`/api/companion/memories/${memoryId}`);
}

export function fetchCompanionSessionSummary() {
  return apiGet<CompanionSessionSummary>("/api/companion/session-summary");
}

export function updateCompanionSessionSummary(payload: Partial<CompanionSessionSummary>, changeReason: string) {
  return apiPut<CompanionSessionSummary>("/api/companion/session-summary", { ...payload, change_reason: changeReason });
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
  return apiPost<{ target_type: string; target_id: string; current_value: Record<string, unknown> }>(
    `/api/companion/revisions/${revisionId}/restore`,
    {},
  );
}
