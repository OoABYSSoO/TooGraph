import test from "node:test";
import assert from "node:assert/strict";

import type { GraphDocument, GraphRevisionRecord, TemplateRecord } from "../types/node-system.ts";
import {
  buildGraphLibraryTemplateEvalSummaries,
  buildGraphRevisionHistoryRows,
  buildGraphLibraryItems,
  buildGraphLibraryOverview,
  filterGraphLibraryItems,
  splitGraphLibraryItems,
} from "./graphLibraryPageModel.ts";

const graphs: GraphDocument[] = [
  {
    graph_id: "graph_research",
    name: "Research Flow",
    status: "active",
    state_schema: {},
    nodes: {
      writer: {
        kind: "agent",
        name: "Writer",
        description: "Drafts the answer",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          actionKey: "web_search",
          taskInstruction: "Write.",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: { description: "Daily research graph" },
  },
  {
    graph_id: "graph_archived",
    name: "Archived Flow",
    status: "disabled",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  },
];

const templates: TemplateRecord[] = [
  {
    template_id: "official_loop",
    label: "Official Loop",
    description: "Official template",
    default_graph_name: "Official Loop",
    source: "official",
    status: "active",
    capabilityDiscoverable: false,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {
      gallery: {
        targetUsers: ["Operators", "Researchers"],
        valueProposition: "Turns source material into an auditable workflow package.",
        mockRun: "mock_data/sample.md",
      },
      requiredActions: ["buddy_session_recall", "web_search"],
      requiredPermissions: ["buddy_session_read", "network"],
      mockMode: { input: "examples/mock_input.json" },
      artifactContract: [
        { path: "final_package.md", state: "final_package", type: "markdown" },
        { path: "evidence.json", state: "evidence", type: "json" },
      ],
      evalCases: [{ caseId: "official-loop-mock", input: "examples/mock_input.json" }],
    },
  },
  {
    template_id: "paused_loop",
    label: "Paused Loop",
    description: "Template with a breakpoint",
    default_graph_name: "Paused Loop",
    source: "user",
    status: "active",
    capabilityDiscoverable: false,
    hasBreakpointMetadata: true,
    capabilityDiscoverableBlockedReason: "breakpoint_metadata",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: { interrupt_after: ["review"] },
  },
  {
    template_id: "user_summary",
    label: "Summary Template",
    description: "User template",
    default_graph_name: "Summary",
    source: "user",
    status: "disabled",
    capabilityDiscoverable: false,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  },
];

test("buildGraphLibraryItems marks official templates read-only and user-owned items manageable", () => {
  const items = buildGraphLibraryItems(graphs, templates);

  assert.deepEqual(
    items.map((item) => ({
      id: item.id,
      kind: item.kind,
      source: item.source,
      status: item.status,
      capabilityDiscoverable: item.capabilityDiscoverable,
      canManage: item.canManage,
    })),
    [
      { id: "graph_research", kind: "graph", source: "user", status: "active", capabilityDiscoverable: false, canManage: true },
      { id: "graph_archived", kind: "graph", source: "user", status: "disabled", capabilityDiscoverable: false, canManage: true },
      { id: "official_loop", kind: "template", source: "official", status: "active", capabilityDiscoverable: false, canManage: false },
      { id: "paused_loop", kind: "template", source: "user", status: "active", capabilityDiscoverable: false, canManage: true },
      { id: "user_summary", kind: "template", source: "user", status: "disabled", capabilityDiscoverable: false, canManage: true },
    ],
  );
});

test("buildGraphLibraryItems blocks capability discovery controls for breakpoint templates", () => {
  const items = buildGraphLibraryItems(graphs, templates);
  const paused = items.find((item) => item.id === "paused_loop");

  assert.equal(paused?.capabilityDiscoverable, false);
  assert.equal(paused?.capabilityDiscoverableBlockedReason, "breakpoint_metadata");
  assert.equal(paused?.canToggleCapabilityDiscoverable, false);
});

test("buildGraphLibraryItems exposes gallery metadata for template cards", () => {
  const items = buildGraphLibraryItems(graphs, templates, {
    official_loop: {
      suiteCount: 1,
      caseCount: 3,
      latestStatus: "failed",
      latestRunId: "evalrun_1",
    },
  });
  const official = items.find((item) => item.id === "official_loop");

  assert.equal(official?.galleryValue, "Turns source material into an auditable workflow package.");
  assert.equal(official?.targetUsersPreview, "Operators, Researchers");
  assert.equal(official?.requiredActionsPreview, "buddy_session_recall, web_search");
  assert.equal(official?.permissionsPreview, "buddy_session_read, network");
  assert.equal(official?.mockEntry, "examples/mock_input.json");
  assert.equal(official?.sampleOutput, "final_package.md +1");
  assert.equal(official?.evalCaseCount, 3);
  assert.equal(official?.latestEvalStatus, "failed");
  assert.equal(official?.latestEvalRunId, "evalrun_1");
});

test("buildGraphLibraryTemplateEvalSummaries groups suite cases and latest run status by target template", () => {
  const summaries = buildGraphLibraryTemplateEvalSummaries(
    [
      {
        suite_id: "suite_a",
        target_template_id: "official_loop",
        case_count: 2,
      },
      {
        suite_id: "suite_b",
        target_template_id: "official_loop",
        case_count: 1,
      },
      {
        suite_id: "graph_suite",
        target_graph_id: "graph_research",
        case_count: 9,
      },
    ],
    {
      suite_a: [{ eval_run_id: "evalrun_a", status: "passed" }],
      suite_b: [{ eval_run_id: "evalrun_b", status: "failed" }],
    },
  );

  assert.deepEqual(summaries.official_loop, {
    suiteCount: 2,
    caseCount: 3,
    latestStatus: "failed",
    latestRunId: "evalrun_b",
  });
  assert.equal(summaries.graph_research, undefined);
});

test("filterGraphLibraryItems filters by kind, status, and search text", () => {
  const items = buildGraphLibraryItems(graphs, templates);

  assert.deepEqual(
    filterGraphLibraryItems(items, { query: "daily", kind: "all", status: "all" }).map((item) => item.id),
    ["graph_research"],
  );
  assert.deepEqual(
    filterGraphLibraryItems(items, { query: "", kind: "templates", status: "disabled" }).map((item) => item.id),
    ["user_summary"],
  );
  assert.deepEqual(
    filterGraphLibraryItems(items, { query: "official", kind: "templates", status: "active" }).map((item) => item.id),
    ["official_loop"],
  );
});

test("buildGraphLibraryOverview summarizes graph and template management inventory", () => {
  const items = buildGraphLibraryItems(graphs, templates);

  assert.deepEqual(buildGraphLibraryOverview(items), {
    total: 5,
    graphs: 2,
    templates: 3,
    officialTemplates: 1,
    disabled: 2,
  });
});

test("splitGraphLibraryItems separates templates and graphs for the management columns", () => {
  const columns = splitGraphLibraryItems(buildGraphLibraryItems(graphs, templates));

  assert.deepEqual(columns.templates.map((item) => item.id), ["official_loop", "paused_loop", "user_summary"]);
  assert.deepEqual(columns.graphs.map((item) => item.id), ["graph_research", "graph_archived"]);
});

test("buildGraphRevisionHistoryRows exposes rollback context for saved graphs", () => {
  const revisions: GraphRevisionRecord[] = [
    {
      revision_id: "grev_update",
      graph_id: "graph_research",
      previous_graph: { ...graphs[0], name: "Research Flow" },
      next_graph: { ...graphs[0], name: "Research Flow v2" },
      diff: [{ op: "replace", path: "/name", previous: "Research Flow", next: "Research Flow v2" }],
      actor: "buddy",
      run_id: "run_1",
      node_id: "execute_page_operation",
      reason: "Rename graph through virtual graph edit playback.",
      validation: { valid: true, issues: [] },
      created_at: "2026-05-18T10:00:00Z",
    },
    {
      revision_id: "grev_create",
      graph_id: "graph_research",
      previous_graph: null,
      next_graph: graphs[0],
      diff: [{ op: "add", path: "", next: graphs[0] }],
      actor: "user",
      run_id: "",
      node_id: "",
      reason: "Create saved graph.",
      validation: { valid: true, issues: [] },
      created_at: "2026-05-18T09:00:00Z",
    },
  ];

  assert.deepEqual(
    buildGraphRevisionHistoryRows(revisions).map((row) => ({
      revisionId: row.revisionId,
      previousName: row.previousName,
      nextName: row.nextName,
      actor: row.actor,
      diffCount: row.diffCount,
      restoresToDeletion: row.restoresToDeletion,
    })),
    [
      {
        revisionId: "grev_update",
        previousName: "Research Flow",
        nextName: "Research Flow v2",
        actor: "buddy",
        diffCount: 1,
        restoresToDeletion: false,
      },
      {
        revisionId: "grev_create",
        previousName: "",
        nextName: "Research Flow",
        actor: "user",
        diffCount: 1,
        restoresToDeletion: true,
      },
    ],
  );
});
