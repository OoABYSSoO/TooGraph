import test from "node:test";
import assert from "node:assert/strict";

import { buildGraphEditPlaybackAuditSummary } from "./graphEditPlaybackAudit.ts";

test("buildGraphEditPlaybackAuditSummary records applied graph commands", () => {
  const summary = buildGraphEditPlaybackAuditSummary({
    requestId: "graph-edit-123",
    planOk: true,
    planIssues: [],
    commandCount: 3,
    playbackStepCount: 12,
    interrupted: false,
    applyResults: [
      {
        commandId: "graph-command-1",
        ok: true,
        applied: true,
        issues: [],
        diff: [{ op: "add", path: "/nodes/agent", next: { kind: "agent" } }],
      },
      {
        commandId: "graph-command-2",
        ok: true,
        applied: true,
        issues: [],
        diff: [{ op: "replace", path: "/name", previous: "Draft", next: "Final" }],
      },
      { commandId: "graph-command-3", ok: true, applied: true, issues: [] },
    ],
  });

  assert.deepEqual(summary, {
    request_id: "graph-edit-123",
    status: "succeeded",
    command_count: 3,
    applied_command_count: 3,
    failed_command_count: 0,
    playback_step_count: 12,
    diff_count: 2,
    issues: [],
    failed_commands: [],
    command_diffs: [
      {
        command_id: "graph-command-1",
        diff: [{ op: "add", path: "/nodes/agent", next: { kind: "agent" } }],
      },
      {
        command_id: "graph-command-2",
        diff: [{ op: "replace", path: "/name", previous: "Draft", next: "Final" }],
      },
    ],
  });
});

test("buildGraphEditPlaybackAuditSummary keeps failed command evidence", () => {
  const summary = buildGraphEditPlaybackAuditSummary({
    requestId: "graph-edit-failed",
    planOk: true,
    planIssues: [],
    commandCount: 2,
    playbackStepCount: 8,
    interrupted: false,
    applyResults: [
      { commandId: "graph-command-1", ok: true, applied: true, issues: [] },
      { commandId: "graph-command-2", ok: false, applied: false, issues: ["State already exists."] },
    ],
  });

  assert.equal(summary.status, "failed");
  assert.equal(summary.applied_command_count, 1);
  assert.equal(summary.failed_command_count, 1);
  assert.deepEqual(summary.issues, ["State already exists."]);
  assert.deepEqual(summary.failed_commands, [{ command_id: "graph-command-2", issues: ["State already exists."] }]);
});

test("buildGraphEditPlaybackAuditSummary can bind command diffs to a saved graph revision", () => {
  const summary = buildGraphEditPlaybackAuditSummary({
    requestId: "graph-edit-revision",
    planOk: true,
    planIssues: [],
    commandCount: 1,
    playbackStepCount: 4,
    interrupted: false,
    applyResults: [
      {
        commandId: "graph-command-1",
        ok: true,
        applied: true,
        issues: [],
        diff: [{ op: "replace", path: "/name", previous: "Draft", next: "Final" }],
      },
    ],
    revision: {
      status: "saved",
      graphId: "graph_1",
      revisionId: "grev_1",
      issues: [],
    },
  });

  assert.equal(summary.graph_id, "graph_1");
  assert.equal(summary.revision_id, "grev_1");
  assert.equal(summary.revision_status, "saved");
  assert.deepEqual(summary.revision_issues, []);
});

test("buildGraphEditPlaybackAuditSummary marks invalid plans and interruptions", () => {
  assert.equal(
    buildGraphEditPlaybackAuditSummary({
      requestId: "graph-edit-invalid",
      planOk: false,
      planIssues: ["operations[0] create_node requires ref."],
      commandCount: 0,
      playbackStepCount: 0,
      interrupted: false,
      applyResults: [],
    }).status,
    "failed",
  );

  assert.equal(
    buildGraphEditPlaybackAuditSummary({
      requestId: "graph-edit-stopped",
      planOk: true,
      planIssues: [],
      commandCount: 3,
      playbackStepCount: 12,
      interrupted: true,
      applyResults: [{ commandId: "graph-command-1", ok: true, applied: true, issues: [] }],
    }).status,
    "interrupted",
  );
});
