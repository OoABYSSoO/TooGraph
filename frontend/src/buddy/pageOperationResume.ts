import type { RunDetail } from "../types/run.ts";
import type { PageOperationRuntimeContext, PageOperationSnapshot } from "./pageOperationAffordances.ts";
import type { BuddyVirtualOperationPlan } from "./virtualOperationProtocol.ts";

export type PageOperationResultStatus = "succeeded" | "failed" | "interrupted";

export type PageOperationResult = {
  operation_request_id: string;
  status: PageOperationResultStatus;
  failure_category: PageOperationFailureCategory | null;
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
  artifact_refs: PageOperationArtifactRef[];
  retry_chain: PageOperationRetryRecord[];
  input_text: string | null;
  graph_edit_summary: Record<string, unknown> | null;
  operation_report: PageOperationReport;
  error: string | null;
};

export type PageOperationReport = {
  operation_request_id: string;
  status: PageOperationResultStatus;
  failure_category: PageOperationFailureCategory | null;
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
  artifact_refs: PageOperationArtifactRef[];
  retry_chain: PageOperationRetryRecord[];
  input_text: string | null;
  graph_edit_summary: Record<string, unknown> | null;
  error: string | null;
};

export type PageOperationArtifactKind = "saved_output" | "document" | "image" | "video" | "audio" | "file";

export type PageOperationArtifactRef = {
  title: string;
  artifact_kind: PageOperationArtifactKind;
  path: string | null;
  local_path: string | null;
  file_name: string | null;
  source_key: string | null;
  node_id: string | null;
  format: string | null;
  content_type: string | null;
};

export type PageOperationRetryKind = "affordance" | "text_input" | "template_target" | "template_input" | "route" | "graph_edit_step";

export type PageOperationRetryStatus = "resolved" | "missing" | "interrupted";

export type PageOperationRetryRecord = {
  kind: PageOperationRetryKind;
  target_id: string;
  attempts: number;
  status: PageOperationRetryStatus;
  elapsed_ms: number | null;
};

export type PageOperationFailureCategory =
  | "target_run_failed"
  | "user_interrupted"
  | "target_not_found"
  | "frontend_retry_failed"
  | "frontend_operation_failed"
  | "operation_failed";

const MAX_PAGE_OPERATION_ARTIFACT_REFS = 20;
const MAX_PAGE_OPERATION_RETRY_RECORDS = 50;

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
  artifactRefs?: PageOperationArtifactRef[] | null;
  retryChain?: PageOperationRetryRecord[] | null;
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
  const artifactRefs = normalizePageOperationArtifactRefs(input.artifactRefs);
  const retryChain = normalizePageOperationRetryChain(input.retryChain);
  const inputText = firstRunTemplateInputText(input.operationPlan);
  const graphEditSummary = input.graphEditSummary ?? defaultGraphEditSummary(input.operationPlan);
  const error = normalizeNullableText(input.error);
  const failureCategory = resolvePageOperationFailureCategory({
    status: input.status,
    triggeredRunStatus,
    retryChain,
    error,
  });
  const report: PageOperationReport = {
    operation_request_id: operationRequestId,
    status: input.status,
    failure_category: failureCategory,
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
    artifact_refs: artifactRefs,
    retry_chain: retryChain,
    input_text: inputText,
    graph_edit_summary: graphEditSummary,
    error,
  };
  return {
    operation_request_id: operationRequestId,
    status: input.status,
    failure_category: failureCategory,
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
    artifact_refs: artifactRefs,
    retry_chain: retryChain,
    input_text: inputText,
    graph_edit_summary: graphEditSummary,
    operation_report: report,
    error,
  };
}

export function buildPageOperationArtifactRefs(run: Pick<RunDetail, "artifacts"> | null | undefined): PageOperationArtifactRef[] {
  const refs: PageOperationArtifactRef[] = [];
  const seen = new Set<string>();
  for (const output of run?.artifacts?.exported_outputs ?? []) {
    const sourceKey = normalizeNullableText(output.source_key);
    const nodeId = normalizeNullableText(output.node_id);
    const outputTitle = normalizeNullableText(output.label) || sourceKey || "Output";
    const savedFile = output.saved_file;
    if (savedFile?.path) {
      appendPageOperationArtifactRef(
        refs,
        seen,
        {
          title: outputTitle,
          artifact_kind: "saved_output",
          path: normalizeNullableText(savedFile.path),
          local_path: null,
          file_name: normalizeNullableText(savedFile.file_name) || fileNameFromPath(savedFile.path),
          source_key: normalizeNullableText(savedFile.source_key) || sourceKey,
          node_id: normalizeNullableText(savedFile.node_id) || nodeId,
          format: normalizeNullableText(savedFile.format),
          content_type: null,
        },
      );
    }

    collectLocalArtifactRecords(output.value, (record) => {
      const localPath = normalizeNullableText(record.local_path);
      if (!localPath) {
        return;
      }
      const contentType = normalizeNullableText(record.content_type ?? record.contentType);
      const fileName = normalizeNullableText(record.filename) || fileNameFromPath(localPath);
      appendPageOperationArtifactRef(
        refs,
        seen,
        {
          title: normalizeNullableText(record.title) || (outputTitle !== "Output" ? outputTitle : fileName) || "Artifact",
          artifact_kind: resolvePageOperationArtifactKind(contentType, localPath),
          path: null,
          local_path: localPath,
          file_name: fileName,
          source_key: sourceKey,
          node_id: nodeId,
          format: null,
          content_type: contentType,
        },
      );
    });

    if (refs.length >= MAX_PAGE_OPERATION_ARTIFACT_REFS) {
      break;
    }
  }
  return refs.slice(0, MAX_PAGE_OPERATION_ARTIFACT_REFS);
}

function resolvePageOperationFailureCategory(input: {
  status: PageOperationResultStatus;
  triggeredRunStatus: string | null;
  retryChain: PageOperationRetryRecord[];
  error: string | null;
}): PageOperationFailureCategory | null {
  if (input.status === "succeeded") {
    return null;
  }
  if (input.status === "interrupted") {
    return "user_interrupted";
  }
  if (input.triggeredRunStatus === "failed") {
    return "target_run_failed";
  }
  if (input.retryChain.some((record) => record.status === "missing")) {
    return "target_not_found";
  }
  if (input.error && input.retryChain.length > 0) {
    return "frontend_retry_failed";
  }
  if (input.error) {
    return "frontend_operation_failed";
  }
  return "operation_failed";
}

function normalizePageOperationRetryChain(value: PageOperationRetryRecord[] | null | undefined): PageOperationRetryRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: PageOperationRetryRecord[] = [];
  for (const record of value) {
    const targetId = normalizeNullableText(record.target_id);
    if (!targetId) {
      continue;
    }
    records.push({
      kind: isPageOperationRetryKind(record.kind) ? record.kind : "affordance",
      target_id: targetId,
      attempts: Math.max(1, normalizeInteger(record.attempts) ?? 1),
      status: isPageOperationRetryStatus(record.status) ? record.status : "missing",
      elapsed_ms: normalizeNonNegativeInteger(record.elapsed_ms),
    });
    if (records.length >= MAX_PAGE_OPERATION_RETRY_RECORDS) {
      break;
    }
  }
  return records;
}

function isPageOperationRetryKind(value: unknown): value is PageOperationRetryKind {
  return (
    value === "affordance" ||
    value === "text_input" ||
    value === "template_target" ||
    value === "template_input" ||
    value === "route" ||
    value === "graph_edit_step"
  );
}

function isPageOperationRetryStatus(value: unknown): value is PageOperationRetryStatus {
  return value === "resolved" || value === "missing" || value === "interrupted";
}

function normalizePageOperationArtifactRefs(value: PageOperationArtifactRef[] | null | undefined): PageOperationArtifactRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const refs: PageOperationArtifactRef[] = [];
  const seen = new Set<string>();
  for (const ref of value) {
    const fallbackPath = ref.local_path ?? ref.path ?? "";
    appendPageOperationArtifactRef(refs, seen, {
      title: normalizeNullableText(ref.title) || normalizeNullableText(ref.file_name) || normalizeNullableText(ref.source_key) || "Artifact",
      artifact_kind: isPageOperationArtifactKind(ref.artifact_kind)
        ? ref.artifact_kind
        : resolvePageOperationArtifactKind(ref.content_type, fallbackPath),
      path: normalizeNullableText(ref.path),
      local_path: normalizeNullableText(ref.local_path),
      file_name: normalizeNullableText(ref.file_name),
      source_key: normalizeNullableText(ref.source_key),
      node_id: normalizeNullableText(ref.node_id),
      format: normalizeNullableText(ref.format),
      content_type: normalizeNullableText(ref.content_type),
    });
    if (refs.length >= MAX_PAGE_OPERATION_ARTIFACT_REFS) {
      break;
    }
  }
  return refs;
}

function isPageOperationArtifactKind(value: unknown): value is PageOperationArtifactKind {
  return value === "saved_output" || value === "document" || value === "image" || value === "video" || value === "audio" || value === "file";
}

function appendPageOperationArtifactRef(
  refs: PageOperationArtifactRef[],
  seen: Set<string>,
  ref: PageOperationArtifactRef,
) {
  if (!ref.path && !ref.local_path && !ref.file_name) {
    return;
  }
  const key = [
    ref.path,
    ref.local_path,
    ref.file_name,
    ref.source_key,
    ref.node_id,
  ].map((part) => part ?? "").join("\u0000");
  if (seen.has(key) || refs.length >= MAX_PAGE_OPERATION_ARTIFACT_REFS) {
    return;
  }
  seen.add(key);
  refs.push(ref);
}

function collectLocalArtifactRecords(value: unknown, onRecord: (record: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalArtifactRecords(item, onRecord);
    }
    return;
  }
  if (!isPlainRecord(value)) {
    return;
  }
  if (value.local_path !== undefined) {
    onRecord(value);
    return;
  }
  for (const nestedValue of Object.values(value)) {
    collectLocalArtifactRecords(nestedValue, onRecord);
  }
}

function resolvePageOperationArtifactKind(contentType: unknown, path: unknown): PageOperationArtifactKind {
  const normalizedType = normalizeNullableText(contentType)?.toLowerCase() ?? "";
  const normalizedPath = normalizeNullableText(path)?.toLowerCase() ?? "";
  if (normalizedType.startsWith("image/")) {
    return "image";
  }
  if (normalizedType.startsWith("video/")) {
    return "video";
  }
  if (normalizedType.startsWith("audio/")) {
    return "audio";
  }
  if (normalizedType.startsWith("text/") || normalizedType === "application/json" || normalizedType === "text/markdown") {
    return "document";
  }
  if (/\.(md|markdown|txt|json|jsonl|csv|log)$/i.test(normalizedPath)) {
    return "document";
  }
  if (/\.(avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp)$/i.test(normalizedPath)) {
    return "image";
  }
  if (/\.(3gp|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm)$/i.test(normalizedPath)) {
    return "video";
  }
  if (/\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(normalizedPath)) {
    return "audio";
  }
  return "file";
}

function fileNameFromPath(path: unknown): string | null {
  const normalizedPath = normalizeNullableText(path)?.replaceAll("\\", "/");
  return normalizedPath?.split("/").filter(Boolean).at(-1) ?? null;
}

function normalizeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numericValue) ? numericValue : null;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  const numericValue = normalizeInteger(value);
  return numericValue !== null && numericValue >= 0 ? numericValue : null;
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
