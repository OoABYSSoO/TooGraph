import type { RunDetail, RunSummary, RunTreeNode } from "@/types/run";

import { apiGet, apiPost } from "./http.ts";

export async function fetchRuns(params?: {
  graphName?: string;
  status?: string;
  templateId?: string;
  includeInternal?: boolean;
  limit?: number;
}): Promise<RunSummary[]> {
  const searchParams = new URLSearchParams();
  if (params?.graphName?.trim()) {
    searchParams.set("graph_name", params.graphName.trim());
  }
  if (params?.status?.trim()) {
    searchParams.set("status", params.status.trim());
  }
  if (params?.templateId?.trim()) {
    searchParams.set("template_id", params.templateId.trim());
  }
  if (params?.includeInternal) {
    searchParams.set("include_internal", "true");
  }
  if (typeof params?.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
    searchParams.set("limit", String(Math.floor(params.limit)));
  }
  const query = searchParams.toString();
  return apiGet<RunSummary[]>(`/api/runs${query ? `?${query}` : ""}`);
}

export async function fetchRun(runId: string, init?: Pick<RequestInit, "signal">): Promise<RunDetail> {
  return apiGet<RunDetail>(`/api/runs/${runId}`, init);
}

export async function fetchRunTree(runId: string, init?: Pick<RequestInit, "signal">): Promise<RunTreeNode> {
  return apiGet<RunTreeNode>(`/api/runs/${runId}/tree`, init);
}

export async function resumeRun(
  runId: string,
  resume: Record<string, unknown>,
  snapshotId?: string | null,
): Promise<{ run_id: string; status: string }> {
  return apiPost(`/api/runs/${runId}/resume`, {
    resume,
    ...(snapshotId?.trim() ? { snapshot_id: snapshotId.trim() } : {}),
  });
}

export async function cancelRun(runId: string, reason: string): Promise<{ run_id: string; status: string }> {
  return apiPost(`/api/runs/${runId}/cancel`, { reason: reason.trim() });
}
