import type { OperationJournalEntry } from "@/types/operationJournal";

import { formatRunArtifactValue } from "./runDetailModel.ts";

export type OperationJournalDisplayItem = {
  key: string;
  title: string;
  status: string;
  stage: string;
  summary: string;
  pathLabel: string;
  badges: string[];
  detailText: string;
};

export function buildOperationJournalDisplayItems(entries: OperationJournalEntry[]): OperationJournalDisplayItem[] {
  return entries.map((entry, index) => {
    const operation = recordFromUnknown(entry.operation);
    const operationReport = recordFromUnknown(entry.operation_report);
    const triggeredRun = recordFromUnknown(entry.triggered_run);
    const graphEditSummary = firstRecord(operation.graph_edit_summary, operationReport.graph_edit_summary);
    const artifactRefs = firstList(entry.artifact_refs, operationReport.artifact_refs, triggeredRun.artifact_refs);
    const retryChain = firstList(entry.retry_chain, operationReport.retry_chain);
    const retryCount = countRetries(retryChain);
    const operationKind = normalizeText(operation.kind) || "operation";
    const requestId = normalizeText(entry.operation_request_id);
    const targetId = normalizeText(entry.target_id) || normalizeText(operation.target_id ?? operation.targetId);
    const triggeredRunId = normalizeText(triggeredRun.run_id ?? operationReport.triggered_run_id);
    const triggeredRunStatus = normalizeText(triggeredRun.status ?? operationReport.triggered_run_status);
    const failureCategory = normalizeText(entry.failure_category) || normalizeText(operationReport.failure_category);
    const badges = [
      entry.stage ? `stage: ${entry.stage}` : "",
      `operation: ${operationKind}`,
      targetId ? `target: ${targetId}` : "",
      graphEditSummaryLabel(graphEditSummary),
      graphEditDiffLabel(graphEditSummary),
      artifactRefs.length > 0 ? `artifacts: ${artifactRefs.length}` : "",
      retryCount > 0 ? `retries: ${retryCount}` : "",
      triggeredRunId ? `run: ${triggeredRunId}${triggeredRunStatus ? ` ${triggeredRunStatus}` : ""}` : "",
      failureCategory ? `failure: ${failureCategory}` : "",
      requestId ? `request: ${requestId}` : "",
    ].filter(Boolean);

    return {
      key: normalizeText(entry.id) || `${requestId || "operation"}-${index}`,
      title: titleForOperation(operationKind),
      status: normalizeText(entry.status) || "event",
      stage: normalizeText(entry.stage) || "event",
      summary: normalizeText(entry.summary),
      pathLabel: buildPathLabel(entry),
      badges,
      detailText: formatRunArtifactValue({
        operation,
        operation_request: entry.operation_request ?? {},
        operation_report: operationReport,
        page_snapshots: entry.page_snapshots ?? {},
        triggered_run: triggeredRun,
        artifact_refs: artifactRefs,
        retry_chain: retryChain,
        journal: entry.journal ?? [],
        error: normalizeText(entry.error),
      }),
    };
  });
}

function countRetries(records: unknown[]): number {
  return records.reduce<number>((total, record) => {
    const attempts = recordFromUnknown(record).attempts;
    const attemptCount = normalizeNumber(attempts);
    return total + Math.max(0, (attemptCount ?? 1) - 1);
  }, 0);
}

function titleForOperation(kind: string) {
  if (kind === "run_template") {
    return "Template run";
  }
  if (kind === "graph_edit") {
    return "Graph edit playback";
  }
  return `Virtual ${kind || "operation"}`;
}

function buildPathLabel(entry: OperationJournalEntry) {
  const parts = [
    ...(Array.isArray(entry.subgraph_path) ? entry.subgraph_path.map((item) => normalizeText(item)).filter(Boolean) : []),
    normalizeText(entry.node_id),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Run";
}

function graphEditSummaryLabel(summary: Record<string, unknown>) {
  const commandCount = normalizeNumber(summary.command_count ?? summary.commandCount);
  const appliedCount = normalizeNumber(summary.applied_command_count ?? summary.appliedCommandCount);
  if (commandCount === null && appliedCount === null) {
    return "";
  }
  return `graph commands: ${appliedCount ?? 0}/${commandCount ?? 0}`;
}

function graphEditDiffLabel(summary: Record<string, unknown>) {
  const diffCount = normalizeNumber(summary.diff_count ?? summary.diffCount);
  return diffCount !== null && diffCount > 0 ? `graph diff: ${diffCount}` : "";
}

function firstList(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return [];
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = recordFromUnknown(value);
    if (Object.keys(record).length > 0) {
      return record;
    }
  }
  return {};
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeNumber(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}
