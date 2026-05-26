import type { BuddyBackgroundReviewRun } from "../types/buddy.ts";

const RESTORABLE_BUDDY_REVISION_TARGET_TYPES = new Set([
  "buddy_identity",
  "home_file",
  "session_summary",
  "capability_usage_stats",
  "run_template_binding",
  "memory_review_template_binding",
]);

export type BackgroundReviewRevisionItem = {
  revisionId: string;
  targetType: string;
  targetId: string;
  operation: string;
  label: string;
  canRestore: boolean;
};

export type BackgroundReviewImprovementCandidateItem = {
  candidateId: string;
  kind: string;
  status: string;
  sourceRunId: string;
  riskLevel: string;
  expectedBenefit: string;
  proposedChangeSummary: string;
  approvalRequired: boolean;
  hasApplyCommand: boolean;
  evidenceRefs: string[];
  payload: Record<string, unknown>;
};

export type BackgroundReviewDisplayItem = {
  key: string;
  reviewId: string;
  sourceRunId: string;
  reviewRunId: string;
  reviewRunHref: string;
  templateId: string;
  status: string;
  triggerReason: string;
  modelRef: string;
  error: string;
  startedAt: string | null;
  completedAt: string | null;
  badges: string[];
  writebackBadges: string[];
  revisionIds: string[];
  revisions: BackgroundReviewRevisionItem[];
  skippedCommands: string[];
  evidenceItems: string[];
  improvementBadges: string[];
  improvementCandidates: BackgroundReviewImprovementCandidateItem[];
  warnings: string[];
};

export function buildBackgroundReviewDisplayItems(records: BuddyBackgroundReviewRun[]): BackgroundReviewDisplayItem[] {
  return records.map((record) => {
    const reviewRunId = normalizeText(record.review_run_id);
    const templateId = normalizeText(record.template_id);
    const triggerReason = normalizeText(record.trigger_reason);
    const modelRef = normalizeText(record.metadata?.buddy_model_ref);
    return {
      key: normalizeText(record.review_id) || reviewRunId || `${normalizeText(record.source_run_id)}:${normalizeText(record.created_at)}`,
      reviewId: normalizeText(record.review_id),
      sourceRunId: normalizeText(record.source_run_id),
      reviewRunId,
      reviewRunHref: reviewRunId ? `/runs/${encodeURIComponent(reviewRunId)}` : "",
      templateId,
      status: normalizeText(record.status),
      triggerReason,
      modelRef,
      error: normalizeText(record.error),
      startedAt: record.started_at,
      completedAt: record.completed_at,
      badges: [
        templateId ? `template: ${templateId}` : "",
        triggerReason ? `trigger: ${triggerReason}` : "",
        modelRef ? `model: ${modelRef}` : "",
      ].filter(Boolean),
      writebackBadges: writebackBadges(record.writeback_summary),
      revisionIds: stringList(record.writeback_summary?.revision_ids),
      revisions: revisionItems(record.writeback_summary?.revisions),
      skippedCommands: skippedCommandLabels(record.writeback_summary?.skipped_commands),
      evidenceItems: evidenceLabels(record.writeback_summary?.evidence_items),
      improvementBadges: improvementBadges(record.improvement_summary),
      improvementCandidates: improvementCandidates(record.improvement_summary?.candidates),
      warnings: [
        ...stringList(record.writeback_summary?.warnings),
        ...stringList(record.improvement_summary?.warnings),
      ],
    };
  });
}

function writebackBadges(summary: BuddyBackgroundReviewRun["writeback_summary"]): string[] {
  if (!summary) {
    return [];
  }
  return [
    numberLabel("applied", summary.applied_count),
    numberLabel("skipped", summary.skipped_count),
    numberLabel("revisions", summary.revision_ids?.length),
    numberLabel("memories", summary.memory_ids?.length),
  ].filter(Boolean);
}

function numberLabel(label: string, value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return count > 0 ? `${label}: ${count}` : "";
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => normalizeText(item)).filter(Boolean) : [];
}

function improvementBadges(summary: BuddyBackgroundReviewRun["improvement_summary"]): string[] {
  if (!summary) {
    return [];
  }
  const badges = [numberLabel("improvements", summary.candidate_count)];
  const riskCounts = recordFromUnknown(summary.risk_counts);
  for (const [risk, count] of Object.entries(riskCounts)) {
    badges.push(numberLabel(risk, count));
  }
  return badges.filter(Boolean);
}

function improvementCandidates(value: unknown): BackgroundReviewImprovementCandidateItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = recordFromUnknown(item);
    return {
      candidateId: normalizeText(record.candidate_id),
      kind: normalizeText(record.kind),
      status: normalizeText(record.status),
      sourceRunId: normalizeText(record.source_run_id),
      riskLevel: normalizeText(record.risk_level),
      expectedBenefit: normalizeText(record.expected_benefit),
      proposedChangeSummary: normalizeText(record.proposed_change_summary),
      approvalRequired: Boolean(record.approval_required),
      hasApplyCommand: Boolean(record.has_apply_command),
      evidenceRefs: evidenceRefLabels(record.evidence_refs),
      payload: record,
    };
  }).filter((item) => item.candidateId || item.proposedChangeSummary);
}

function evidenceRefLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = recordFromUnknown(item);
    const kind = normalizeText(record.kind || record.source_kind || record.type);
    const id = normalizeText(record.id || record.source_id || record.run_id || record.message_id);
    return [kind, id].filter(Boolean).join(":");
  }).filter(Boolean);
}

function revisionItems(value: unknown): BackgroundReviewRevisionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = recordFromUnknown(item);
    const revisionId = normalizeText(record.revision_id);
    const targetType = normalizeText(record.target_type);
    const targetId = normalizeText(record.target_id);
    const operation = normalizeText(record.operation);
    const targetLabel = [targetType, targetId].filter(Boolean).join("/");
    const label = [revisionId, targetLabel, operation].filter(Boolean).join(" - ");
    return {
      revisionId,
      targetType,
      targetId,
      operation,
      label,
      canRestore: Boolean(revisionId && RESTORABLE_BUDDY_REVISION_TARGET_TYPES.has(targetType)),
    };
  }).filter((item) => item.revisionId);
}

function skippedCommandLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = recordFromUnknown(item);
    const channel = normalizeText(record.channel);
    const action = normalizeText(record.action);
    const errorType = normalizeText(record.error_type);
    const error = normalizeText(record.error);
    const prefix = [channel, action].filter(Boolean).join(" ");
    const reason = [errorType, error].filter(Boolean).join(" - ");
    return [prefix, reason].filter(Boolean).join(": ");
  }).filter(Boolean);
}

function evidenceLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = recordFromUnknown(item);
    const sourceState = normalizeText(record.source_state);
    const text = normalizeText(record.text);
    return [sourceState, text].filter(Boolean).join(": ");
  }).filter(Boolean);
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}
