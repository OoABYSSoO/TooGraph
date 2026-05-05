import type { OperationJournalPage } from "@/types/operationJournal";

import { apiGet } from "./http.ts";

export async function fetchOperationJournal(
  params: {
    page?: number;
    size?: number;
    runId?: string;
    operationRequestId?: string;
    status?: string;
  } = {},
  init?: Pick<RequestInit, "signal">,
): Promise<OperationJournalPage> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(Math.max(1, Math.round(params.page ?? 1))));
  searchParams.set("size", String(Math.max(1, Math.min(200, Math.round(params.size ?? 50)))));
  if (params.runId?.trim()) {
    searchParams.set("run_id", params.runId.trim());
  }
  if (params.operationRequestId?.trim()) {
    searchParams.set("operation_request_id", params.operationRequestId.trim());
  }
  if (params.status?.trim()) {
    searchParams.set("status", params.status.trim());
  }
  return apiGet<OperationJournalPage>(`/api/operation-journal?${searchParams.toString()}`, init);
}
