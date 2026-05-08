import assert from "node:assert/strict";
import test from "node:test";

import { summarizeVirtualOperationActivity } from "./virtual-operation-activity.ts";

test("summarizeVirtualOperationActivity includes artifact and retry evidence labels", () => {
  const summary = summarizeVirtualOperationActivity({
    kind: "virtual_ui_operation",
    detail: {
      operation_request_id: "vop_evidence",
      operation: {
        kind: "run_template",
        target_id: "library.template.report.open",
        template_id: "report",
        input_text: "Build report",
      },
      operation_report: {
        triggered_run_id: "run_report",
        triggered_run_status: "completed",
        artifact_refs: [
          { kind: "output_file", path: "runs/run_report/report.md" },
          { kind: "saved_file", path: "runs/run_report/data.json" },
        ],
        retry_chain: [
          { kind: "target", target_id: "library.template.report.open", attempts: 3, status: "matched" },
          { kind: "route", target_id: "/runs/run_report", attempts: 4, status: "matched" },
        ],
      },
    },
  });

  assert.deepEqual(summary?.artifactLabels, [
    "operation: run_template",
    "template: report",
    "target: library.template.report.open",
    "run: run_report completed",
    "artifacts: 2",
    "retries: 5",
    "request: vop_evidence",
  ]);
  assert.equal(summary?.triggeredRunId, "run_report");
});

test("summarizeVirtualOperationActivity includes graph edit revision evidence labels", () => {
  const summary = summarizeVirtualOperationActivity({
    kind: "virtual_ui_operation",
    detail: {
      operation_request_id: "vop_graph_edit",
      operation: {
        kind: "graph_edit",
        target_id: "editor.canvas.surface",
      },
      operation_report: {
        graph_edit_summary: {
          request_id: "graph-edit-1",
          status: "succeeded",
          command_count: 2,
          applied_command_count: 2,
          diff_count: 4,
          graph_id: "graph_1",
          revision_id: "grev_1",
          revision_status: "saved",
        },
      },
    },
  });

  assert.deepEqual(summary?.artifactLabels, [
    "operation: graph_edit",
    "target: editor.canvas.surface",
    "graph revision: grev_1",
    "request: vop_graph_edit",
  ]);
  assert.deepEqual(summary?.graphRevision, {
    graphId: "graph_1",
    revisionId: "grev_1",
    status: "saved",
  });
});
