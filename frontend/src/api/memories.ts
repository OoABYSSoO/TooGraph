import { apiGet, apiPost } from "./http.ts";
import type {
  PlatformMemory,
  PlatformMemoryEvent,
  PlatformMemoryReplaceResponse,
  PlatformMemoryRestoreResponse,
  PlatformMemoryRevision,
} from "../types/memory.ts";

export type PlatformMemoryListParams = {
  scope?: string;
  layer?: string;
  memoryType?: string;
  status?: string;
  includeInactive?: boolean;
};

function memoryPath(memoryId: string) {
  return `/api/memories/${encodeURIComponent(memoryId)}`;
}

function changeReasonPayload(changeReason: string) {
  return { change_reason: changeReason };
}

export function fetchPlatformMemories(params: PlatformMemoryListParams = {}) {
  const query = new URLSearchParams();
  if (params.scope) {
    query.set("scope", params.scope);
  }
  if (params.layer) {
    query.set("layer", params.layer);
  }
  if (params.memoryType) {
    query.set("memory_type", params.memoryType);
  }
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.includeInactive) {
    query.set("include_inactive", "true");
  }
  const suffix = query.toString();
  return apiGet<PlatformMemory[]>(`/api/memories${suffix ? `?${suffix}` : ""}`);
}

export function applyPlatformMemoryCandidate(memoryId: string, changeReason: string) {
  return apiPost<PlatformMemory>(`${memoryPath(memoryId)}/apply`, changeReasonPayload(changeReason));
}

export function replacePlatformMemoryCandidate(memoryId: string, changeReason: string, supersedes?: string[]) {
  return apiPost<PlatformMemoryReplaceResponse>(`${memoryPath(memoryId)}/replace`, {
    ...changeReasonPayload(changeReason),
    ...(supersedes ? { supersedes } : {}),
  });
}

export function rejectPlatformMemoryCandidate(memoryId: string, changeReason: string) {
  return apiPost<PlatformMemory>(`${memoryPath(memoryId)}/reject`, changeReasonPayload(changeReason));
}

export function archivePlatformMemory(memoryId: string, changeReason: string) {
  return apiPost<PlatformMemory>(`${memoryPath(memoryId)}/archive`, changeReasonPayload(changeReason));
}

export function degradePlatformMemory(memoryId: string, amount: number, changeReason: string) {
  return apiPost<PlatformMemory>(`${memoryPath(memoryId)}/degrade`, {
    amount,
    ...changeReasonPayload(changeReason),
  });
}

export function fetchPlatformMemoryRevisions(memoryId: string) {
  return apiGet<PlatformMemoryRevision[]>(`${memoryPath(memoryId)}/revisions`);
}

export function fetchPlatformMemoryEvents(memoryId: string) {
  return apiGet<PlatformMemoryEvent[]>(`${memoryPath(memoryId)}/events`);
}

export function restorePlatformMemoryRevision(
  memoryId: string,
  revisionId: string,
  target: "previous" | "next",
  changeReason: string,
) {
  return apiPost<PlatformMemoryRestoreResponse>(`${memoryPath(memoryId)}/revisions/${encodeURIComponent(revisionId)}/restore`, {
    target,
    ...changeReasonPayload(changeReason),
  });
}
