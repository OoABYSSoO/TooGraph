import test from "node:test";
import assert from "node:assert/strict";

import type { GraphDocument, TemplateRecord } from "../types/node-system.ts";
import { buildGraphLibraryItems, buildGraphLibraryOverview, filterGraphLibraryItems } from "./graphLibraryPageModel.ts";

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
          skillKey: "web_search",
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
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  },
  {
    template_id: "user_summary",
    label: "Summary Template",
    description: "User template",
    default_graph_name: "Summary",
    source: "user",
    status: "disabled",
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
      canManage: item.canManage,
    })),
    [
      { id: "graph_research", kind: "graph", source: "user", status: "active", canManage: true },
      { id: "graph_archived", kind: "graph", source: "user", status: "disabled", canManage: true },
      { id: "official_loop", kind: "template", source: "official", status: "active", canManage: false },
      { id: "user_summary", kind: "template", source: "user", status: "disabled", canManage: true },
    ],
  );
});

test("filterGraphLibraryItems filters by kind, status, and search text", () => {
  const items = buildGraphLibraryItems(graphs, templates);

  assert.deepEqual(
    filterGraphLibraryItems(items, { query: "research", kind: "all", status: "all" }).map((item) => item.id),
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
    total: 4,
    graphs: 2,
    templates: 2,
    officialTemplates: 1,
    disabled: 2,
  });
});
