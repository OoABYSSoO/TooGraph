export type VirtualOperationActivitySummary = {
  label: string;
  summary: string;
  artifactLabels: string[];
};

export function summarizeVirtualOperationActivity(event: {
  kind?: unknown;
  summary?: unknown;
  detail?: unknown;
  error?: unknown;
}): VirtualOperationActivitySummary | null {
  if (normalizeText(event.kind) !== "virtual_ui_operation") {
    return null;
  }
  const detail = recordFromUnknown(event.detail);
  const operation = resolveOperation(detail);
  const operationKind = normalizeText(operation.kind);
  const operationReport = recordFromUnknown(detail.operation_report ?? detail.operationReport);
  const failureCategory = normalizeText(detail.failure_category ?? detail.failureCategory);
  const targetId = normalizeText(operation.target_id ?? operation.targetId ?? detail.target_id ?? detail.targetId);
  const requestId = normalizeText(
    detail.operation_request_id
      ?? detail.operationRequestId
      ?? recordFromUnknown(detail.operation_request ?? detail.operationRequest)?.operation_request_id
      ?? recordFromUnknown(detail.operation_request ?? detail.operationRequest)?.operationRequestId,
  );

  return {
    label: resolveVirtualOperationLabel(operationKind),
    summary: resolveVirtualOperationSummary(event, detail, operation, operationKind, operationReport),
    artifactLabels: [
      failureCategory ? `failure: ${failureCategory}` : "",
      operationKind ? `operation: ${operationKind}` : "",
      resolveTemplateArtifactLabel(operation),
      targetId ? `target: ${targetId}` : "",
      resolveTriggeredRunArtifactLabel(operationReport),
      requestId ? `request: ${requestId}` : "",
    ].filter(Boolean),
  };
}

function resolveOperation(detail: Record<string, unknown>) {
  const directOperation = recordFromUnknown(detail.operation);
  if (Object.keys(directOperation).length > 0) {
    return directOperation;
  }
  const request = recordFromUnknown(detail.operation_request ?? detail.operationRequest);
  const requestOperations = Array.isArray(request.operations) ? request.operations : [];
  for (const item of requestOperations) {
    const operation = recordFromUnknown(item);
    if (Object.keys(operation).length > 0) {
      return operation;
    }
  }
  const journal = Array.isArray(detail.journal) ? detail.journal : [];
  for (const item of journal) {
    const operation = recordFromUnknown(item);
    if (Object.keys(operation).length > 0) {
      return operation;
    }
  }
  return {};
}

function resolveVirtualOperationLabel(operationKind: string) {
  if (operationKind === "run_template") {
    return "Virtual template run";
  }
  if (operationKind === "graph_edit") {
    return "Virtual graph edit";
  }
  if (operationKind) {
    return `Virtual ${operationKind}`;
  }
  return "Virtual UI operation";
}

function resolveVirtualOperationSummary(
  event: { summary?: unknown; error?: unknown },
  detail: Record<string, unknown>,
  operation: Record<string, unknown>,
  operationKind: string,
  operationReport: Record<string, unknown>,
) {
  const errorText = normalizeText(event.error) || normalizeText(recordFromUnknown(detail.error).message);
  if (errorText) {
    return errorText;
  }
  if (operationKind === "run_template") {
    const templateLabel =
      normalizeText(operation.template_name ?? operation.templateName)
      || normalizeText(operation.template_id ?? operation.templateId)
      || normalizeText(operation.search_text ?? operation.searchText);
    const inputText = normalizeText(operation.input_text ?? operation.inputText);
    return [
      templateLabel ? `Template: ${templateLabel}` : "",
      inputText ? `Input: ${clampText(inputText, 120)}` : "",
      resolveTriggeredRunSummaryPart(operationReport),
    ].filter(Boolean).join(" · ") || normalizeText(event.summary) || "Template run requested.";
  }
  if (operationKind === "graph_edit") {
    const intents = operation.graph_edit_intents ?? operation.graphEditIntents;
    const intentCount = normalizeNumber(operation.intent_count ?? operation.intentCount)
      ?? (Array.isArray(intents) ? intents.length : null);
    return intentCount !== null ? `Graph edit playback · Intents: ${intentCount}` : normalizeText(event.summary) || "Graph edit playback requested.";
  }
  if (operationKind === "click" || operationKind === "focus" || operationKind === "clear") {
    const targetLabel = normalizeText(operation.target_label ?? operation.targetLabel) || normalizeText(operation.target_id ?? operation.targetId);
    return targetLabel ? `${capitalize(operationKind)}: ${targetLabel}` : normalizeText(event.summary) || `${capitalize(operationKind)} requested.`;
  }
  if (operationKind === "type") {
    const targetLabel = normalizeText(operation.target_label ?? operation.targetLabel) || normalizeText(operation.target_id ?? operation.targetId);
    const text = normalizeText(operation.text);
    return [
      text ? `Type: ${clampText(text, 80)}` : "Type",
      targetLabel ? `Target: ${targetLabel}` : "",
    ].filter(Boolean).join(" · ");
  }
  if (operationKind === "press") {
    const targetLabel = normalizeText(operation.target_label ?? operation.targetLabel) || normalizeText(operation.target_id ?? operation.targetId);
    const key = normalizeText(operation.key);
    return [
      key ? `Press: ${key}` : "Press",
      targetLabel ? `Target: ${targetLabel}` : "",
    ].filter(Boolean).join(" · ");
  }
  if (operationKind === "wait") {
    const option = normalizeText(operation.option);
    return option ? `Wait: ${option}` : normalizeText(event.summary) || "Wait requested.";
  }
  return normalizeText(event.summary) || "Virtual UI operation recorded.";
}

function resolveTemplateArtifactLabel(operation: Record<string, unknown>) {
  const templateId = normalizeText(operation.template_id ?? operation.templateId);
  const searchText = normalizeText(operation.search_text ?? operation.searchText);
  const templateName = normalizeText(operation.template_name ?? operation.templateName);
  const template = templateId || searchText || templateName;
  return template ? `template: ${template}` : "";
}

function resolveTriggeredRunSummaryPart(operationReport: Record<string, unknown>) {
  const runId = normalizeText(operationReport.triggered_run_id ?? operationReport.triggeredRunId);
  if (!runId) {
    return "";
  }
  const status = normalizeText(operationReport.triggered_run_status ?? operationReport.triggeredRunStatus);
  return `Run: ${runId}${status ? ` ${status}` : ""}`;
}

function resolveTriggeredRunArtifactLabel(operationReport: Record<string, unknown>) {
  const runId = normalizeText(operationReport.triggered_run_id ?? operationReport.triggeredRunId);
  if (!runId) {
    return "";
  }
  const status = normalizeText(operationReport.triggered_run_status ?? operationReport.triggeredRunStatus);
  return `run: ${runId}${status ? ` ${status}` : ""}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clampText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : normalized;
}

function capitalize(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}
