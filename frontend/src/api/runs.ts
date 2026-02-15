import type { RunDetail, RunSummary } from "@/types/run";

import { apiGet, apiPost } from "./http.ts";

export async function fetchRuns(params?: { graphName?: string; status?: string }): Promise<RunSummary[]> {
  const searchParams = new URLSearchParams();
  if (params?.graphName?.trim()) {
    searchParams.set("graph_name", params.graphName.trim());
  }
  if (params?.status?.trim()) {
    searchParams.set("status", params.status.trim());
  }
  const query = searchParams.toString();
  return apiGet<RunSummary[]>(`/api/runs${query ? `?${query}` : ""}`);
}

export async function fetchRun(runId: string): Promise<RunDetail> {
  return apiGet<RunDetail>(`/api/runs/${runId}`);
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
