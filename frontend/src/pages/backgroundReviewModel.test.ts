import assert from "node:assert/strict";
import test from "node:test";

import type { BuddyBackgroundReviewRun } from "../types/buddy.ts";

import { buildBackgroundReviewDisplayItems } from "./backgroundReviewModel.ts";

function review(overrides: Partial<BuddyBackgroundReviewRun> = {}): BuddyBackgroundReviewRun {
  return {
    review_id: "bgrev_1",
    source_run_id: "run_source",
    review_run_id: "run_review",
    template_id: "buddy_autonomous_review",
    status: "completed",
    trigger_reason: "visible_buddy_run_completed",
    metadata: { buddy_model_ref: "openai/gpt-4.1" },
    error: "",
    created_at: "2026-05-27T00:00:00Z",
    updated_at: "2026-05-27T00:00:10Z",
    started_at: "2026-05-27T00:00:02Z",
    completed_at: "2026-05-27T00:00:10Z",
    ...overrides,
  };
}

test("buildBackgroundReviewDisplayItems exposes review run links and audit badges", () => {
  const items = buildBackgroundReviewDisplayItems([
    review({
      review_id: "bgrev_failed",
      review_run_id: "run_review_failed",
      status: "failed",
      error: "Provider timed out.",
      metadata: { buddy_model_ref: "local/qwen" },
    }),
  ]);

  assert.deepEqual(items, [
    {
      key: "bgrev_failed",
      reviewId: "bgrev_failed",
      sourceRunId: "run_source",
      reviewRunId: "run_review_failed",
      reviewRunHref: "/runs/run_review_failed",
      templateId: "buddy_autonomous_review",
      status: "failed",
      triggerReason: "visible_buddy_run_completed",
      modelRef: "local/qwen",
      error: "Provider timed out.",
      startedAt: "2026-05-27T00:00:02Z",
      completedAt: "2026-05-27T00:00:10Z",
      badges: ["template: buddy_autonomous_review", "trigger: visible_buddy_run_completed", "model: local/qwen"],
      writebackBadges: [],
      revisionIds: [],
      revisions: [],
      skippedCommands: [],
      evidenceItems: [],
      improvementBadges: [],
      improvementCandidates: [],
      warnings: [],
    },
  ]);
});

test("buildBackgroundReviewDisplayItems keeps records without review run ids visible", () => {
  const items = buildBackgroundReviewDisplayItems([
    review({
      review_id: "bgrev_queued",
      review_run_id: "",
      status: "queued",
      metadata: {},
      started_at: null,
      completed_at: null,
    }),
  ]);

  assert.equal(items[0]?.reviewRunHref, "");
  assert.deepEqual(items[0]?.badges, ["template: buddy_autonomous_review", "trigger: visible_buddy_run_completed"]);
});

test("buildBackgroundReviewDisplayItems exposes writeback revisions skipped commands and evidence", () => {
  const items = buildBackgroundReviewDisplayItems([
    review({
      writeback_summary: {
        applied_count: 2,
        skipped_count: 1,
        revision_ids: ["rev_memory_doc", "memrev_answer_pref"],
        revisions: [
          { revision_id: "rev_memory_doc", target_type: "home_file", target_id: "MEMORY.md", operation: "update" },
          { revision_id: "memrev_answer_pref", target_type: "memory_entry", target_id: "mem_answer_pref", operation: "create" },
        ],
        memory_ids: ["mem_answer_pref"],
        applied_commands: [],
        skipped_commands: [
          {
            channel: "user_context",
            index: 0,
            action: "policy.update",
            error_type: "unsupported_action",
            error: "旧 policy 写回不再支持。",
          },
        ],
        evidence_items: [
          { source_state: "autonomous_review.evidence", text: "用户明确要求后续回答先给结论。" },
        ],
        warnings: [],
      },
    }),
  ]);

  assert.deepEqual(items[0]?.writebackBadges, ["applied: 2", "skipped: 1", "revisions: 2", "memories: 1"]);
  assert.deepEqual(items[0]?.revisionIds, ["rev_memory_doc", "memrev_answer_pref"]);
  assert.deepEqual(items[0]?.revisions, [
    {
      revisionId: "rev_memory_doc",
      targetType: "home_file",
      targetId: "MEMORY.md",
      operation: "update",
      label: "rev_memory_doc - home_file/MEMORY.md - update",
      canRestore: true,
    },
    {
      revisionId: "memrev_answer_pref",
      targetType: "memory_entry",
      targetId: "mem_answer_pref",
      operation: "create",
      label: "memrev_answer_pref - memory_entry/mem_answer_pref - create",
      canRestore: false,
    },
  ]);
  assert.deepEqual(items[0]?.skippedCommands, ["user_context policy.update: unsupported_action - 旧 policy 写回不再支持。"]);
  assert.deepEqual(items[0]?.evidenceItems, ["autonomous_review.evidence: 用户明确要求后续回答先给结论。"]);
});

test("buildBackgroundReviewDisplayItems exposes improvement candidate summary", () => {
  const items = buildBackgroundReviewDisplayItems([
    review({
      improvement_summary: {
        candidate_count: 1,
        risk_counts: { medium: 1 },
        candidates: [
          {
            candidate_id: "cand_template_retry_budget",
            kind: "template_revision",
            status: "proposed",
            source_run_id: "run_source",
            risk_level: "medium",
            expected_benefit: "减少能力循环超预算时的无效重试。",
            proposed_change_summary: "为 Buddy 主循环增加针对 capability_budget_exhausted 的恢复分支。",
            approval_required: true,
            has_apply_command: true,
            evidence_refs: [{ kind: "graph_run", id: "run_source" }],
          },
        ],
        warnings: [],
      },
    }),
  ]);

  assert.deepEqual(items[0]?.improvementBadges, ["improvements: 1", "medium: 1"]);
  assert.deepEqual(items[0]?.improvementCandidates, [
    {
      candidateId: "cand_template_retry_budget",
      kind: "template_revision",
      status: "proposed",
      sourceRunId: "run_source",
      riskLevel: "medium",
      expectedBenefit: "减少能力循环超预算时的无效重试。",
      proposedChangeSummary: "为 Buddy 主循环增加针对 capability_budget_exhausted 的恢复分支。",
      approvalRequired: true,
      hasApplyCommand: true,
      evidenceRefs: ["graph_run:run_source"],
      payload: {
        candidate_id: "cand_template_retry_budget",
        kind: "template_revision",
        status: "proposed",
        source_run_id: "run_source",
        risk_level: "medium",
        expected_benefit: "减少能力循环超预算时的无效重试。",
        proposed_change_summary: "为 Buddy 主循环增加针对 capability_budget_exhausted 的恢复分支。",
        approval_required: true,
        has_apply_command: true,
        evidence_refs: [{ kind: "graph_run", id: "run_source" }],
      },
    },
  ]);
});
