import type { RunDetail } from "../types/run.ts";
import type { PageOperationRuntimeContext, PageOperationSnapshot } from "./pageOperationAffordances.ts";
import type { BuddyVirtualOperationPlan } from "./virtualOperationProtocol.ts";

export type PageOperationResultStatus = "succeeded" | "failed" | "interrupted";

export type PageOperationResult = {
  operation_request_id: string;
  status: PageOperationResultStatus;
  target_id: string | null;
  commands: string[];
  route_before: string;
  route_after: string;
  page_snapshot_before: PageOperationSnapshot;
  page_snapshot_after: PageOperationSnapshot;
  triggered_run_id: string | null;
  triggered_graph_id: string | null;
  triggered_run_initial_status: string | null;
  triggered_run_status: string | null;
  triggered_run_result_summary: string | null;
  triggered_run_final_result: string | null;
  input_text: string | null;
  graph_edit_summary: Record<string, unknown> | null;
  operation_report: PageOperationReport;
  error: string | null;
};

export type PageOperationReport = {
  operation_request_id: string;
  status: PageOperationResultStatus;
  target_id: string | null;
  commands: string[];
  route_before: string;
  route_after: string;
  triggered_run_id: string | null;
  triggered_graph_id: string | null;
  triggered_run_initial_status: string | null;
  triggered_run_status: string | null;
  triggered_run_result_summary: string | null;
  triggered_run_final_result: string | null;
  input_text: string | null;
  graph_edit_summary: Record<string, unknown> | null;
  error: string | null;
};

export function buildPageOperationResult(input: {
  operationPlan: BuddyVirtualOperationPlan;
  status: PageOperationResultStatus;
  routeBefore: string;
  routeAfter: string;
  pageOperationContextBefore: PageOperationRuntimeContext;
  pageOperationContextAfter: PageOperationRuntimeContext;
  triggeredRunId?: string | null;
  triggeredGraphId?: string | null;
  triggeredRunInitialStatus?: string | null;
  triggeredRunStatus?: string | null;
  triggeredRunFinalResult?: string | null;
  graphEditSummary?: Record<string, unknown> | null;
  error?: string | null;
}): PageOperationResult {
  const operationRequestId = input.operationPlan.operationRequestId ?? "";
  const targetId = firstOperationTargetId(input.operationPlan);
  const triggeredRunId = normalizeNullableText(input.triggeredRunId);
  const triggeredGraphId = normalizeNullableText(input.triggeredGraphId);
  const triggeredRunInitialStatus = normalizeNullableText(input.triggeredRunInitialStatus);
  const triggeredRunStatus = normalizeNullableText(input.triggeredRunStatus);
  const triggeredRunResultSummary = latestForegroundRunResultSummary(input.pageOperationContextAfter);
  const triggeredRunFinalResult = normalizeNullableText(input.triggeredRunFinalResult);
  const inputText = firstRunTemplateInputText(input.operationPlan);
  const graphEditSummary = input.graphEditSummary ?? defaultGraphEditSummary(input.operationPlan);
  const error = normalizeNullableText(input.error);
  const report: PageOperationReport = {
    operation_request_id: operationRequestId,
    status: input.status,
    target_id: targetId,
    commands: [...input.operationPlan.commands],
    route_before: input.routeBefore,
    route_after: input.routeAfter,
    triggered_run_id: triggeredRunId,
    triggered_graph_id: triggeredGraphId,
    triggered_run_initial_status: triggeredRunInitialStatus,
    triggered_run_status: triggeredRunStatus,
    triggered_run_result_summary: triggeredRunResultSummary,
    triggered_run_final_result: triggeredRunFinalResult,
    input_text: inputText,
    graph_edit_summary: graphEditSummary,
    error,
  };
  return {
    operation_request_id: operationRequestId,
    status: input.status,
    target_id: targetId,
    commands: [...input.operationPlan.commands],
    route_before: input.routeBefore,
    route_after: input.routeAfter,
    page_snapshot_before: input.pageOperationContextBefore.page_snapshot,
    page_snapshot_after: input.pageOperationContextAfter.page_snapshot,
    triggered_run_id: triggeredRunId,
    triggered_graph_id: triggeredGraphId,
    triggered_run_initial_status: triggeredRunInitialStatus,
    triggered_run_status: triggeredRunStatus,
    triggered_run_result_summary: triggeredRunResultSummary,
    triggered_run_final_result: triggeredRunFinalResult,
    input_text: inputText,
    graph_edit_summary: graphEditSummary,
    operation_report: report,
    error,
  };
}

export function buildPageOperationResumePayload(input: {
  operationResult: PageOperationResult;
  pageContext: string;
  pageOperationContext: PageOperationRuntimeContext;
}): Record<string, unknown> {
  return {
    operation_result: input.operationResult,
    operation_report: input.operationResult.operation_report,
    page_context: input.pageContext,
    page_operation_context: input.pageOperationContext,
  };
}

export function canAutoResumePageOperationRun(
  run: Pick<RunDetail, "status" | "metadata"> | { status?: string | null; metadata?: Record<string, unknown> | null },
  operationRequestId: string | null | undefined,
): boolean {
  const requestId = normalizeNullableText(operationRequestId);
  if (!requestId || run.status !== "awaiting_human") {
    return false;
  }
  return findAutoResumablePageOperationRequestId(run) === requestId;
}

export function findAutoResumablePageOperationRequestId(
  run: Pick<RunDetail, "status" | "metadata"> | { status?: string | null; metadata?: Record<string, unknown> | null },
): string | null {
  if (run.status !== "awaiting_human") {
    return null;
  }
  const metadata = isPlainRecord(run.metadata) ? run.metadata : {};
  return findAutoResumablePageOperationRequestIdInMetadata(metadata);
}

function firstOperationTargetId(operationPlan: BuddyVirtualOperationPlan): string | null {
  for (const operation of operationPlan.operations) {
    if ("targetId" in operation && operation.targetId.trim()) {
      return operation.targetId.trim();
    }
  }
  return null;
}

function firstRunTemplateInputText(operationPlan: BuddyVirtualOperationPlan): string | null {
  for (const operation of operationPlan.operations) {
    if (operation.kind === "run_template" && operation.inputText.trim()) {
      return operation.inputText.trim();
    }
  }
  return null;
}

function defaultGraphEditSummary(operationPlan: BuddyVirtualOperationPlan): Record<string, unknown> | null {
  const graphEditOperation = operationPlan.operations.find((operation) => operation.kind === "graph_edit");
  if (graphEditOperation?.kind !== "graph_edit") {
    return null;
  }
  return {
    target_id: graphEditOperation.targetId,
    intent_count: graphEditOperation.graphEditIntents.length,
  };
}

function latestForegroundRunResultSummary(pageOperationContext: PageOperationRuntimeContext): string | null {
  return normalizeNullableText(pageOperationContext.page_facts?.latestForegroundRun?.resultSummary);
}

function findAutoResumablePageOperationRequestIdInMetadata(metadata: Record<string, unknown>): string | null {
  const direct = extractAutoResumablePageOperationRequestId(metadata.pending_page_operation_continuation);
  if (direct) {
    return direct;
  }
  const pendingSubgraph = isPlainRecord(metadata.pending_subgraph_breakpoint) ? metadata.pending_subgraph_breakpoint : null;
  const nestedMetadata = isPlainRecord(pendingSubgraph?.metadata) ? pendingSubgraph.metadata : null;
  return nestedMetadata ? extractAutoResumablePageOperationRequestId(nestedMetadata.pending_page_operation_continuation) : null;
}

function extractAutoResumablePageOperationRequestId(value: unknown): string | null {
  if (!isPlainRecord(value) || value.mode !== "auto_resume_after_ui_operation") {
    return null;
  }
  return normalizeNullableText(value.operation_request_id);
}

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
