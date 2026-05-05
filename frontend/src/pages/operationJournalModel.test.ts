import test from "node:test";
import assert from "node:assert/strict";

import { buildOperationJournalDisplayItems } from "./operationJournalModel.ts";

test("buildOperationJournalDisplayItems summarizes graph edit playback evidence", () => {
  const [item] = buildOperationJournalDisplayItems([
    {
      id: "opj_1",
      operation_request_id: "vop_graph",
      run_id: "run_parent",
      stage: "completion",
      status: "succeeded",
      summary: "Virtual graph_edit succeeded. request vop_graph.",
      node_id: "execute_page_operation",
      subgraph_node_id: "operation_loop",
      subgraph_path: ["operation_loop"],
      operation: {
        kind: "graph_edit",
        target_id: "editor.canvas.surface",
        graph_edit_summary: {
          request_id: "graph-edit-1",
          status: "succeeded",
          command_count: 3,
          applied_command_count: 3,
          playback_step_count: 12,
        },
      },
      operation_report: {
        operation_request_id: "vop_graph",
        status: "succeeded",
        target_id: "editor.canvas.surface",
        commands: ["graph_edit editor.graph.playback"],
        artifact_refs: [
          {
            title: "Graph patch",
            artifact_kind: "saved_output",
            path: "runs/run_graph/patch.json",
            file_name: "patch.json",
            source_key: "patch",
          },
          {
            title: "Preview",
            artifact_kind: "image",
            local_path: "runs/run_graph/preview.png",
            file_name: "preview.png",
            source_key: "preview",
          },
        ],
        retry_chain: [
          {
            kind: "affordance",
            target_id: "editor.canvas.surface",
            attempts: 4,
            status: "resolved",
            elapsed_ms: 360,
          },
        ],
        graph_edit_summary: {
          request_id: "graph-edit-1",
          status: "succeeded",
          command_count: 3,
          applied_command_count: 3,
          playback_step_count: 12,
        },
      },
      page_snapshots: {
        before: { path: "/editor", title: "Editor" },
        after: { path: "/editor", title: "Editor" },
      },
      triggered_run: {},
      artifact_refs: [
        {
          title: "Graph patch",
          artifact_kind: "saved_output",
          path: "runs/run_graph/patch.json",
          file_name: "patch.json",
          source_key: "patch",
        },
        {
          title: "Preview",
          artifact_kind: "image",
          local_path: "runs/run_graph/preview.png",
          file_name: "preview.png",
          source_key: "preview",
        },
      ],
      retry_chain: [
        {
          kind: "affordance",
          target_id: "editor.canvas.surface",
          attempts: 4,
          status: "resolved",
          elapsed_ms: 360,
        },
      ],
      failure_category: "",
      error: "",
      journal: [],
      activity_sequence: 2,
      activity_created_at: "2026-05-18T08:30:00Z",
      recorded_at: "2026-05-18T08:30:01Z",
      target_id: "editor.canvas.surface",
      target_label: "Graph canvas",
      input_text: "",
    },
  ]);

  assert.equal(item?.title, "Graph edit playback");
  assert.equal(item?.pathLabel, "operation_loop / execute_page_operation");
  assert.deepEqual(item?.badges, [
    "stage: completion",
    "operation: graph_edit",
    "target: editor.canvas.surface",
    "graph commands: 3/3",
    "artifacts: 2",
    "retries: 3",
    "request: vop_graph",
  ]);
  assert.match(item?.detailText ?? "", /graph_edit_summary/);
  assert.match(item?.detailText ?? "", /runs\/run_graph\/patch\.json/);
  assert.match(item?.detailText ?? "", /retry_chain/);
});
