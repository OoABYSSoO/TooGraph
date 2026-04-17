import assert from "node:assert/strict";
import test from "node:test";

import type { NodeExecutionDetail, RunDetail } from "../types/run.ts";

import {
  buildRunAggregatedTimeline,
  buildRunStatusFacts,
  formatRunArtifactValue,
  listRunOutputArtifacts,
  normalizeArtifactDocumentReferences,
} from "./runDetailModel.ts";

function createRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run_id: "run_1",
    graph_id: "graph_1",
    graph_name: "Hello World",
    status: "completed",
    runtime_backend: "langgraph",
    lifecycle: {
      updated_at: "2026-04-18T00:00:00Z",
      resume_count: 0,
    },
    checkpoint_metadata: {
      available: false,
    },
    revision_round: 0,
    started_at: "2026-04-18T00:00:00Z",
    metadata: {},
    selected_skills: [],
    skill_outputs: [],
    evaluation_result: {},
    memory_summary: "",
    final_result: "",
    node_status_map: {},
    node_executions: [],
    warnings: [],
    errors: [],
    output_previews: [],
    artifacts: {
      skill_outputs: [],
      output_previews: [],
      saved_outputs: [],
      exported_outputs: [],
      node_outputs: {},
      active_edge_ids: [],
      state_events: [],
      state_values: {},
      cycle_iterations: [],
      cycle_summary: {
        has_cycle: false,
        back_edges: [],
        iteration_count: 0,
        max_iterations: 0,
        stop_reason: null,
      },
    },
    state_snapshot: {
      values: {},
      last_writers: {},
    },
    graph_snapshot: {},
    cycle_summary: {
      has_cycle: false,
      back_edges: [],
      iteration_count: 0,
      max_iterations: 0,
      stop_reason: null,
    },
    ...overrides,
  };
}

function createRunArtifacts(overrides: Partial<RunDetail["artifacts"]> = {}): RunDetail["artifacts"] {
  return {
    ...createRunDetail().artifacts,
    ...overrides,
  };
}

function createNodeExecution(overrides: Partial<NodeExecutionDetail> & Pick<NodeExecutionDetail, "node_id">): NodeExecutionDetail {
  const nodeType = overrides.node_type ?? "agent";
  return {
    node_id: overrides.node_id,
    node_type: nodeType,
    status: overrides.status ?? "success",
    started_at: overrides.started_at ?? "2026-05-12T01:00:00.000Z",
    finished_at: overrides.finished_at ?? null,
    duration_ms: overrides.duration_ms ?? 1,
    input_summary: overrides.input_summary ?? "",
    output_summary: overrides.output_summary ?? "",
    artifacts: {
      inputs: {},
      outputs: {},
      family: nodeType,
      state_reads: [],
      state_writes: [],
      ...overrides.artifacts,
    },
    warnings: overrides.warnings ?? [],
    errors: overrides.errors ?? [],
  };
}

test("formatRunArtifactValue keeps strings and pretty prints structured payloads", () => {
  assert.equal(formatRunArtifactValue("hello"), "hello");
  assert.equal(formatRunArtifactValue(null), "");
  assert.equal(
    formatRunArtifactValue({
      answer: "TooGraph",
    }),
    '{\n  "answer": "TooGraph"\n}',
  );
});

test("listRunOutputArtifacts maps exported outputs into renderable cards", () => {
  const artifacts = listRunOutputArtifacts(
    createRunDetail({
      artifacts: {
        skill_outputs: [],
        output_previews: [],
        saved_outputs: [],
        exported_outputs: [
          {
            node_id: "output_answer",
            label: "Answer",
            source_kind: "node_output",
            source_key: "answer",
            display_mode: "markdown",
            persist_enabled: true,
            persist_format: "md",
            value: "# 完成",
            saved_file: {
              node_id: "output_answer",
              source_key: "answer",
              path: "/tmp/answer.md",
              format: "md",
              file_name: "answer.md",
            },
          },
        ],
        node_outputs: {},
        active_edge_ids: [],
        state_events: [],
        state_values: {},
        cycle_iterations: [],
        cycle_summary: {
          has_cycle: false,
          back_edges: [],
          iteration_count: 0,
          max_iterations: 0,
          stop_reason: null,
        },
      },
    }),
  );

  assert.deepEqual(artifacts, [
    {
      key: "output_answer-answer-0",
      title: "Answer",
      text: "# 完成",
      displayMode: "markdown",
      persistLabel: "persist md",
      fileName: "answer.md",
      documentRefs: [],
    },
  ]);
});

test("buildRunAggregatedTimeline interleaves parent nodes, subgraph nodes, and activity events", () => {
  const run = createRunDetail({
    node_executions: [
      createNodeExecution({
        node_id: "intake_request",
        started_at: "2026-05-12T01:00:00.000Z",
        duration_ms: 12,
        output_summary: "Request accepted.",
      }),
      createNodeExecution({
        node_id: "run_capability_cycle",
        node_type: "subgraph",
        started_at: "2026-05-12T01:00:01.000Z",
        duration_ms: 140,
        output_summary: "Capability loop finished.",
        artifacts: {
          inputs: {},
          outputs: {},
          family: "subgraph",
          state_reads: [],
          state_writes: [],
          subgraph: {
            graph_id: "subgraph_1",
            name: "Capability Loop",
            status: "completed",
            node_executions: [
              createNodeExecution({
                node_id: "execute_capability",
                started_at: "2026-05-12T01:00:02.000Z",
                duration_ms: 80,
                output_summary: "Executed selected capability.",
                artifacts: {
                  inputs: {},
                  outputs: { result_package: { status: "ok" } },
                  family: "agent",
                  state_reads: [],
                  state_writes: [
                    {
                      state_key: "capability_result",
                      output_key: "result_package",
                      mode: "replace",
                      changed: true,
                    },
                  ],
                },
              }),
            ],
          },
        },
      }),
    ],
    artifacts: createRunArtifacts({
      activity_events: [
        {
          sequence: 1,
          kind: "file_search",
          summary: "Found 3 matching files.",
          node_id: "execute_capability",
          subgraph_node_id: "run_capability_cycle",
          subgraph_path: ["run_capability_cycle"],
          status: "succeeded",
          duration_ms: 15,
          detail: { query: "buddy" },
          created_at: "2026-05-12T01:00:02.500Z",
        },
      ],
    }),
  });

  assert.deepEqual(
    buildRunAggregatedTimeline(run).map((item) => ({
      kind: item.kind,
      label: item.label,
      summary: item.summary,
      status: item.status,
      durationMs: item.durationMs,
      artifactLabels: item.artifactLabels,
      nodeId: item.nodeId,
      subgraphNodeId: item.subgraphNodeId,
      subgraphPath: item.subgraphPath,
      pathLabel: item.pathLabel,
    })),
    [
      {
        kind: "node",
        label: "intake_request",
        summary: "Request accepted.",
        status: "success",
        durationMs: 12,
        artifactLabels: [],
        nodeId: "intake_request",
        subgraphNodeId: null,
        subgraphPath: [],
        pathLabel: "intake_request",
      },
      {
        kind: "node",
        label: "run_capability_cycle",
        summary: "Capability loop finished.",
        status: "success",
        durationMs: 140,
        artifactLabels: ["subgraph: Capability Loop"],
        nodeId: "run_capability_cycle",
        subgraphNodeId: null,
        subgraphPath: [],
        pathLabel: "run_capability_cycle",
      },
      {
        kind: "node",
        label: "execute_capability",
        summary: "Executed selected capability.",
        status: "success",
        durationMs: 80,
        artifactLabels: ["outputs: result_package", "writes: capability_result"],
        nodeId: "execute_capability",
        subgraphNodeId: "run_capability_cycle",
        subgraphPath: ["run_capability_cycle"],
        pathLabel: "run_capability_cycle / execute_capability",
      },
      {
        kind: "activity",
        label: "file_search",
        summary: "Found 3 matching files.",
        status: "succeeded",
        durationMs: 15,
        artifactLabels: ["query: buddy"],
        nodeId: "execute_capability",
        subgraphNodeId: "run_capability_cycle",
        subgraphPath: ["run_capability_cycle"],
        pathLabel: "run_capability_cycle / execute_capability",
      },
    ],
  );
});

test("buildRunAggregatedTimeline includes subgraph permission approvals as pause items", () => {
  const run = createRunDetail({
    status: "awaiting_human",
    metadata: {
      pending_subgraph_breakpoint: {
        subgraph_node_id: "run_capability_cycle",
        inner_node_id: "execute_capability",
        subgraph_path: ["run_capability_cycle"],
        metadata: {
          pending_permission_approval: {
            kind: "skill_permission_approval",
            skill_key: "local_workspace_executor",
            skill_name: "Local Workspace Executor",
            permissions: ["file_write", "command_run"],
          },
        },
      },
    },
  });

  const permissionItems = buildRunAggregatedTimeline(run).filter((item) => item.kind === "permission");

  assert.deepEqual(permissionItems.map((item) => ({
    label: item.label,
    summary: item.summary,
    status: item.status,
    nodeId: item.nodeId,
    subgraphNodeId: item.subgraphNodeId,
    subgraphPath: item.subgraphPath,
    pathLabel: item.pathLabel,
  })), [
    {
      label: "Local Workspace Executor",
      summary: "Requires permission: file_write, command_run",
      status: "awaiting_human",
      nodeId: "execute_capability",
      subgraphNodeId: "run_capability_cycle",
      subgraphPath: ["run_capability_cycle"],
      pathLabel: "run_capability_cycle / execute_capability",
    },
  ]);
});

test("listRunOutputArtifacts keeps skill artifact document references for paged display", () => {
  const artifacts = listRunOutputArtifacts(
    createRunDetail({
      artifacts: {
        skill_outputs: [],
        output_previews: [],
        saved_outputs: [],
        exported_outputs: [
          {
            node_id: "output_sources",
            label: "Source Documents",
            source_kind: "state",
            source_key: "source_documents",
            display_mode: "documents",
            persist_enabled: false,
            persist_format: "auto",
            value: [
              {
                title: "Article One",
                url: "https://example.com/one",
                local_path: "run_1/search/doc_001.md",
                content_type: "text/markdown",
                char_count: 1200,
              },
              {
                title: "",
                url: "https://example.com/two",
                local_path: "run_1/search/doc_002.md",
              },
            ],
          },
        ],
        node_outputs: {},
        active_edge_ids: [],
        state_events: [],
        state_values: {},
        cycle_iterations: [],
        cycle_summary: {
          has_cycle: false,
          back_edges: [],
          iteration_count: 0,
          max_iterations: 0,
          stop_reason: null,
        },
      },
    }),
  );

  assert.equal(artifacts[0].displayMode, "documents");
  assert.deepEqual(artifacts[0].documentRefs, [
    {
      title: "Article One",
      url: "https://example.com/one",
      localPath: "run_1/search/doc_001.md",
      contentType: "text/markdown",
      charCount: 1200,
      artifactKind: "document",
      size: null,
      filename: "doc_001.md",
    },
    {
      title: "Document 2",
      url: "https://example.com/two",
      localPath: "run_1/search/doc_002.md",
      contentType: "text/markdown",
      charCount: null,
      artifactKind: "document",
      size: null,
      filename: "doc_002.md",
    },
  ]);
});

test("normalizeArtifactDocumentReferences ignores values without safe local paths", () => {
  assert.deepEqual(
    normalizeArtifactDocumentReferences([
      { title: "A", local_path: "run_1/a.md" },
      { title: "B", path: "../outside.md" },
      { title: "C", local_path: "/absolute.md" },
      { title: "D" },
    ]),
    [
      {
        title: "A",
        url: "",
        localPath: "run_1/a.md",
        contentType: "text/markdown",
        charCount: null,
        artifactKind: "document",
        size: null,
        filename: "a.md",
      },
    ],
  );
});

test("normalizeArtifactDocumentReferences accepts arrays and structured objects with local_path", () => {
  assert.deepEqual(
    normalizeArtifactDocumentReferences(["run_1/search/doc_000.md"]),
    [
      {
        title: "Document 1",
        url: "",
        localPath: "run_1/search/doc_000.md",
        contentType: "text/markdown",
        charCount: null,
        artifactKind: "document",
        size: null,
        filename: "doc_000.md",
      },
    ],
  );

  assert.deepEqual(
    normalizeArtifactDocumentReferences({
      source_documents: [
        {
          title: "Nested",
          url: "https://example.com/source",
          local_path: "run_1/search/doc_001.md",
          content_type: "text/markdown",
        },
      ],
    }),
    [
      {
        title: "Nested",
        url: "https://example.com/source",
        localPath: "run_1/search/doc_001.md",
        contentType: "text/markdown",
        charCount: null,
        artifactKind: "document",
        size: null,
        filename: "doc_001.md",
      },
    ],
  );

  assert.deepEqual(
    normalizeArtifactDocumentReferences({
      title: "Single",
      local_path: "run_1/search/doc_002.md",
      charCount: 42,
    }),
    [
      {
        title: "Single",
        url: "",
        localPath: "run_1/search/doc_002.md",
        contentType: "text/markdown",
        charCount: 42,
        artifactKind: "document",
        size: null,
        filename: "doc_002.md",
      },
    ],
  );
});

test("buildRunStatusFacts keeps the primary run facts compact and status-first", () => {
  const facts = buildRunStatusFacts(
    createRunDetail({
      status: "awaiting_human",
      current_node_id: "draft_writer",
      duration_ms: 125_000,
      revision_round: 2,
    }),
  );

  assert.deepEqual(facts, [
    { key: "status", label: "状态", value: "awaiting_human", tone: "status" },
    { key: "current", label: "当前节点", value: "draft_writer", tone: "default" },
    { key: "duration", label: "耗时", value: "2m 5s", tone: "default" },
    { key: "revision", label: "修订", value: "2", tone: "default" },
  ]);
});
