import type { ModelLogPage, ModelLogRetentionSettings } from "@/types/model-log";

import { apiGet, apiPost } from "./http.ts";

export async function fetchModelLogs(params?: { page?: number; size?: number; query?: string }): Promise<ModelLogPage> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(Math.max(1, params?.page ?? 1)));
  searchParams.set("size", String(Math.max(1, params?.size ?? 20)));
  if (params?.query?.trim()) {
    searchParams.set("q", params.query.trim());
  }
  return apiGet<ModelLogPage>(`/api/model-logs?${searchParams.toString()}`);
}

export async function updateModelLogRetention(
  payload: ModelLogRetentionSettings,
): Promise<ModelLogRetentionSettings> {
  return apiPost<ModelLogRetentionSettings>("/api/settings/model-logs", payload);
}
