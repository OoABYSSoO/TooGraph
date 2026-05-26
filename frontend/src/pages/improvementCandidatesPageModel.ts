import type { BuddyImprovementCandidate } from "../types/buddy.ts";

export type ImprovementCandidateOverviewItem = {
  key: string;
  labelKey: string;
  value: number;
};

export type ImprovementCandidateStatusOption = {
  value: string;
  labelKey: string;
};

export type ImprovementCandidateFilters = {
  status: string;
  query: string;
};

const TERMINAL_VALIDATION_STATUSES = new Set(["validating", "applied", "rejected", "superseded"]);
const DECISION_LOCKED_STATUSES = new Set(["approved", "rejected", "applied", "superseded"]);

export function buildImprovementCandidateOverview(
  candidates: BuddyImprovementCandidate[],
): ImprovementCandidateOverviewItem[] {
  return [
    { key: "total", labelKey: "improvements.total", value: candidates.length },
    {
      key: "waiting",
      labelKey: "improvements.waiting",
      value: candidates.filter((candidate) => candidate.status === "waiting_for_approval").length,
    },
    {
      key: "approved",
      labelKey: "improvements.approved",
      value: candidates.filter((candidate) => candidate.status === "approved").length,
    },
    {
      key: "applied",
      labelKey: "improvements.applied",
      value: candidates.filter((candidate) => candidate.status === "applied").length,
    },
  ];
}

export function buildImprovementCandidateStatusOptions(): ImprovementCandidateStatusOption[] {
  return [
    { value: "", labelKey: "improvements.statusAll" },
    { value: "proposed", labelKey: "improvements.statusProposed" },
    { value: "validating", labelKey: "improvements.statusValidating" },
    { value: "validated", labelKey: "improvements.statusValidated" },
    { value: "waiting_for_approval", labelKey: "improvements.statusWaitingForApproval" },
    { value: "approved", labelKey: "improvements.statusApproved" },
    { value: "needs_changes", labelKey: "improvements.statusNeedsChanges" },
    { value: "applied", labelKey: "improvements.statusApplied" },
    { value: "rejected", labelKey: "improvements.statusRejected" },
    { value: "failed", labelKey: "improvements.statusFailed" },
  ];
}

export function filterImprovementCandidates(
  candidates: BuddyImprovementCandidate[],
  filters: ImprovementCandidateFilters,
): BuddyImprovementCandidate[] {
  const normalizedStatus = filters.status.trim();
  const normalizedQuery = filters.query.trim().toLowerCase();
  return candidates.filter((candidate) => {
    if (normalizedStatus && candidate.status !== normalizedStatus) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return candidateSearchText(candidate).includes(normalizedQuery);
  });
}

export function sortImprovementCandidates(candidates: BuddyImprovementCandidate[]): BuddyImprovementCandidate[] {
  return [...candidates].sort((left, right) => {
    const rightTime = Date.parse(right.updated_at || right.created_at || "");
    const leftTime = Date.parse(left.updated_at || left.created_at || "");
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export function canValidateImprovementCandidate(candidate: BuddyImprovementCandidate | null | undefined): candidate is BuddyImprovementCandidate {
  return Boolean(candidate?.candidate_id && !TERMINAL_VALIDATION_STATUSES.has(candidate.status));
}

export function canApproveImprovementCandidate(candidate: BuddyImprovementCandidate | null | undefined): candidate is BuddyImprovementCandidate {
  return Boolean(candidate?.candidate_id && (candidate.status === "validated" || candidate.status === "waiting_for_approval"));
}

export function canRejectImprovementCandidate(candidate: BuddyImprovementCandidate | null | undefined): candidate is BuddyImprovementCandidate {
  return Boolean(candidate?.candidate_id && !DECISION_LOCKED_STATUSES.has(candidate.status));
}

export function canApplyImprovementCandidate(candidate: BuddyImprovementCandidate | null | undefined): candidate is BuddyImprovementCandidate {
  return Boolean(candidate?.candidate_id && candidate.status === "approved" && hasImprovementCandidateApplyCommand(candidate));
}

export function hasImprovementCandidateApplyCommand(candidate: BuddyImprovementCandidate): boolean {
  const validationResultCommand = nestedRecord(candidate.validation_result, "approval_request", "apply_command");
  if (normalizeText(validationResultCommand.action)) {
    return true;
  }
  const payloadCommand = nestedRecord(candidate.payload, "apply_command");
  return Boolean(normalizeText(payloadCommand.action));
}

function candidateSearchText(candidate: BuddyImprovementCandidate): string {
  return [
    candidate.candidate_id,
    candidate.kind,
    candidate.status,
    candidate.risk_level,
    candidate.expected_benefit,
    candidate.proposed_change_summary,
    candidate.source_run_id,
    candidate.review_run_id,
    candidate.validation_run_id,
    candidate.applied_revision_id,
  ].map(normalizeText).join("\n").toLowerCase();
}

function nestedRecord(source: unknown, ...path: string[]): Record<string, unknown> {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return {};
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : {};
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}
