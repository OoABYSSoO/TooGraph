import type {
  ScheduledGraphJob,
  ScheduledGraphJobCreatePayload,
  ScheduledGraphJobRun,
  ScheduledGraphJobRunResponse,
  ScheduledGraphJobUpdatePayload,
} from "@/types/scheduler";

import { apiGet, apiPatch, apiPost } from "./http.ts";

export async function fetchScheduledGraphJobs(includeDisabled = true): Promise<ScheduledGraphJob[]> {
  const query = includeDisabled ? "?include_disabled=true" : "";
  return apiGet<ScheduledGraphJob[]>(`/api/scheduler/jobs${query}`);
}

export async function fetchScheduledGraphJobRuns(jobId: string): Promise<ScheduledGraphJobRun[]> {
  return apiGet<ScheduledGraphJobRun[]>(`/api/scheduler/jobs/${encodeURIComponent(jobId)}/runs`);
}

export async function createScheduledGraphJob(payload: ScheduledGraphJobCreatePayload): Promise<ScheduledGraphJob> {
  return apiPost<ScheduledGraphJob>("/api/scheduler/jobs", payload);
}

export async function updateScheduledGraphJob(
  jobId: string,
  payload: ScheduledGraphJobUpdatePayload,
): Promise<ScheduledGraphJob> {
  return apiPatch<ScheduledGraphJob>(`/api/scheduler/jobs/${encodeURIComponent(jobId)}`, payload);
}

export async function setScheduledGraphJobEnabled(jobId: string, enabled: boolean): Promise<ScheduledGraphJob> {
  return apiPatch<ScheduledGraphJob>(`/api/scheduler/jobs/${encodeURIComponent(jobId)}/enabled`, { enabled });
}

export async function runScheduledGraphJob(jobId: string): Promise<ScheduledGraphJobRunResponse> {
  return apiPost<ScheduledGraphJobRunResponse>(`/api/scheduler/jobs/${encodeURIComponent(jobId)}/run`, {
    trigger_reason: "manual",
    requested_by: "scheduler_page",
  });
}
