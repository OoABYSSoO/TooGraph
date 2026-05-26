import assert from "node:assert/strict";
import test from "node:test";

import type { BuddyImprovementCandidate } from "../types/buddy.ts";

import {
  buildImprovementCandidateOverview,
  buildImprovementCandidateStatusOptions,
  canApplyImprovementCandidate,
  canApproveImprovementCandidate,
  canRejectImprovementCandidate,
  canValidateImprovementCandidate,
  filterImprovementCandidates,
  hasImprovementCandidateApplyCommand,
  sortImprovementCandidates,
} from "./improvementCandidatesPageModel.ts";

function candidate(overrides: Partial<BuddyImprovementCandidate> = {}): BuddyImprovementCandidate {
  return {
    candidate_id: "cand_1",
    kind: "memory",
    status: "proposed",
    status_reason: "",
    source_run_id: "run_source",
    review_id: "bgrev_1",
    review_run_id: "run_review",
    target_ref: {},
    evidence_refs: [],
    risk_level: "low",
    expected_benefit: "",
    proposed_change_summary: "记录用户偏好。",
    approval_required: true,
    validation_run_id: "",
    validation_result: {},
    applied_revision_id: "",
    applied_command: {},
    applied_at: "",
    decision: {},
    decided_at: "",
    payload: {},
    created_at: "2026-05-27T00:00:00Z",
    updated_at: "2026-05-27T00:00:00Z",
    ...overrides,
  };
}

test("improvement candidate page model builds status overview and filters", () => {
  const candidates = [
    candidate({ candidate_id: "cand_a", status: "approved", risk_level: "high", updated_at: "2026-05-27T00:00:02Z" }),
    candidate({ candidate_id: "cand_b", status: "waiting_for_approval", risk_level: "medium", updated_at: "2026-05-27T00:00:03Z" }),
    candidate({ candidate_id: "cand_c", status: "applied", risk_level: "low", updated_at: "2026-05-27T00:00:01Z" }),
  ];

  assert.deepEqual(buildImprovementCandidateOverview(candidates), [
    { key: "total", labelKey: "improvements.total", value: 3 },
    { key: "waiting", labelKey: "improvements.waiting", value: 1 },
    { key: "approved", labelKey: "improvements.approved", value: 1 },
    { key: "applied", labelKey: "improvements.applied", value: 1 },
  ]);
  assert.deepEqual(
    filterImprovementCandidates(candidates, { status: "waiting_for_approval", query: "cand_b" }).map((item) => item.candidate_id),
    ["cand_b"],
  );
  assert.deepEqual(sortImprovementCandidates(candidates).map((item) => item.candidate_id), ["cand_b", "cand_a", "cand_c"]);
  assert.ok(buildImprovementCandidateStatusOptions().some((option) => option.value === "approved"));
});

test("improvement candidate page model derives available actions from status and apply command", () => {
  const applyCommandCandidate = candidate({
    status: "approved",
    validation_result: {
      approval_request: {
        apply_command: {
          action: "memory_document.update",
          payload: { content: "# MEMORY.md\n" },
        },
      },
    },
  });

  assert.equal(hasImprovementCandidateApplyCommand(applyCommandCandidate), true);
  assert.equal(canApplyImprovementCandidate(applyCommandCandidate), true);
  assert.equal(canApproveImprovementCandidate(candidate({ status: "waiting_for_approval" })), true);
  assert.equal(canRejectImprovementCandidate(candidate({ status: "applied" })), false);
  assert.equal(canValidateImprovementCandidate(candidate({ status: "applied" })), false);
  assert.equal(canValidateImprovementCandidate(candidate({ status: "proposed" })), true);
  assert.equal(canApplyImprovementCandidate(candidate({ status: "approved" })), false);
});
