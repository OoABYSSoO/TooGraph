import assert from "node:assert/strict";
import test from "node:test";

import type { BuddyCommandRecord, BuddyRevision } from "../types/buddy.ts";

import {
  buildBuddyRevisionHistoryRows,
  filterBuddyRevisionHistoryRows,
} from "./buddyRevisionHistoryModel.ts";

test("buildBuddyRevisionHistoryRows links revisions to command source runs", () => {
  const revisions: BuddyRevision[] = [
    {
      revision_id: "rev_1",
      target_type: "memory",
      target_id: "memory_1",
      operation: "create",
      previous_value: {},
      next_value: { title: "偏好", content: "先给结论。" },
      changed_by: "buddy_command",
      change_reason: "自主复盘识别到稳定偏好。",
      created_at: "2026-05-12T01:00:00Z",
    },
  ];
  const commands: BuddyCommandRecord[] = [
    {
      command_id: "cmd_1",
      kind: "buddy.manual_write",
      action: "memory.create",
      status: "succeeded",
      target_type: "memory",
      target_id: "memory_1",
      revision_id: "rev_1",
      run_id: "run_review_1",
      payload: { title: "偏好", content: "先给结论。" },
      change_reason: "自主复盘识别到稳定偏好。",
      created_at: "2026-05-12T01:00:01Z",
      completed_at: "2026-05-12T01:00:01Z",
    },
  ];

  assert.deepEqual(
    buildBuddyRevisionHistoryRows(revisions, commands).map((row) => ({
      revisionId: row.revision_id,
      sourceRunId: row.sourceRunId,
      sourceCommandId: row.sourceCommandId,
      sourceAction: row.sourceAction,
      sourceLabel: row.sourceLabel,
      nextValueText: row.nextValueText,
    })),
    [
      {
        revisionId: "rev_1",
        sourceRunId: "run_review_1",
        sourceCommandId: "cmd_1",
        sourceAction: "memory.create",
        sourceLabel: "Run run_review_1 | Command cmd_1",
        nextValueText: '{\n  "title": "偏好",\n  "content": "先给结论。"\n}',
      },
    ],
  );
});

test("buildBuddyRevisionHistoryRows keeps legacy revisions visible without command records", () => {
  const rows = buildBuddyRevisionHistoryRows(
    [
      {
        revision_id: "rev_legacy",
        target_type: "profile",
        target_id: "profile",
        operation: "update",
        previous_value: { name: "Old" },
        next_value: { name: "New" },
        changed_by: "user",
        change_reason: "Manual update.",
        created_at: "2026-05-12T01:00:00Z",
      },
    ],
    [],
  );

  assert.equal(rows[0]?.sourceLabel, "Legacy revision");
  assert.equal(rows[0]?.sourceRunId, "");
  assert.equal(rows[0]?.sourceCommandId, "");
});

test("filterBuddyRevisionHistoryRows narrows history by target type without reordering", () => {
  const rows = buildBuddyRevisionHistoryRows(
    [
      {
        revision_id: "rev_profile",
        target_type: "profile",
        target_id: "profile",
        operation: "update",
        previous_value: { name: "Old" },
        next_value: { name: "New" },
        changed_by: "user",
        change_reason: "Manual profile update.",
        created_at: "2026-05-12T03:00:00Z",
      },
      {
        revision_id: "rev_memory_newer",
        target_type: "memory",
        target_id: "memory_2",
        operation: "update",
        previous_value: { title: "Old" },
        next_value: { title: "New" },
        changed_by: "buddy_command",
        change_reason: "Updated stable preference.",
        created_at: "2026-05-12T04:00:00Z",
      },
      {
        revision_id: "rev_memory_older",
        target_type: "memory",
        target_id: "memory_1",
        operation: "create",
        previous_value: {},
        next_value: { title: "Preference" },
        changed_by: "buddy_command",
        change_reason: "Created stable preference.",
        created_at: "2026-05-12T02:00:00Z",
      },
    ],
    [],
  );

  assert.deepEqual(
    filterBuddyRevisionHistoryRows(rows, "memory").map((row) => row.revision_id),
    ["rev_memory_newer", "rev_memory_older"],
  );
  assert.deepEqual(
    filterBuddyRevisionHistoryRows(rows, "all").map((row) => row.revision_id),
    ["rev_memory_newer", "rev_profile", "rev_memory_older"],
  );
});
