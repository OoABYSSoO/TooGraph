import test from "node:test";
import assert from "node:assert/strict";

import type { CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";
import {
  EDITOR_WELCOME_SEARCH_DEBOUNCE_MS,
  filterWelcomeGraphs,
  filterWelcomeTemplates,
  getEditorWelcomeCardClass,
  getEditorWelcomeCardGridClass,
  getEditorWelcomePanelBodyClass,
  getEditorWelcomePanelClass,
  getEditorWelcomeTemplateDescriptionClass,
} from "./editor-welcome-search.ts";

const TEMPLATES: CanonicalTemplateRecord[] = [
  {
    template_id: "hello_world",
    label: "Hello World",
    description: "A starter template for GraphiteUI.",
    default_graph_name: "Hello World",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  },
  {
    template_id: "knowledge_base_validation",
    label: "知识库验证",
    description: "Validate retrieval against the knowledge base.",
    default_graph_name: "知识库验证",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  },
];

const GRAPHS: GraphSummary[] = [
  {
    graph_id: "graph_abc123",
    name: "Hello World",
    node_count: 3,
    edge_count: 2,
  },
  {
    graph_id: "graph_kb789",
    name: "知识库验证",
    node_count: 6,
    edge_count: 6,
  },
];

test("filterWelcomeTemplates matches template id, label, and description", () => {
  assert.deepEqual(
    filterWelcomeTemplates(TEMPLATES, "hello").map((item) => item.template_id),
    ["hello_world"],
  );
  assert.deepEqual(
    filterWelcomeTemplates(TEMPLATES, "retrieval").map((item) => item.template_id),
    ["knowledge_base_validation"],
  );
  assert.deepEqual(
    filterWelcomeTemplates(TEMPLATES, "knowledge_base").map((item) => item.template_id),
    ["knowledge_base_validation"],
  );
});

test("filterWelcomeGraphs matches graph id and name", () => {
  assert.deepEqual(
    filterWelcomeGraphs(GRAPHS, "hello").map((item) => item.graph_id),
    ["graph_abc123"],
  );
  assert.deepEqual(
    filterWelcomeGraphs(GRAPHS, "kb789").map((item) => item.graph_id),
    ["graph_kb789"],
  );
});

test("filter helpers ignore query whitespace and casing", () => {
  assert.deepEqual(
    filterWelcomeTemplates(TEMPLATES, "  HELLO ").map((item) => item.template_id),
    ["hello_world"],
  );
  assert.deepEqual(
    filterWelcomeGraphs(GRAPHS, "  GRAPH_KB789 ").map((item) => item.graph_id),
    ["graph_kb789"],
  );
});

test("welcome panel classes enforce independent scrolling inside each list panel", () => {
  assert.match(getEditorWelcomePanelClass(), /\bmin-h-0\b/);
  assert.match(getEditorWelcomePanelBodyClass(), /\boverflow-y-auto\b/);
  assert.match(getEditorWelcomePanelBodyClass(), /\bflex-1\b/);
});

test("welcome card grid classes create a dense two-column layout while keeping cards uniform", () => {
  assert.match(getEditorWelcomeCardGridClass(), /\bgrid\b/);
  assert.match(getEditorWelcomeCardGridClass(), /\bmd:grid-cols-2\b/);
  assert.match(getEditorWelcomeCardClass(), /\bflex\b/);
  assert.match(getEditorWelcomeCardClass(), /\bh-full\b/);
  assert.match(getEditorWelcomeCardClass(), /\bflex-col\b/);
});

test("template descriptions stay clamped so both panels keep a consistent rhythm", () => {
  assert.match(getEditorWelcomeTemplateDescriptionClass(), /\bline-clamp-2\b/);
});

test("welcome search debounce stays at 300ms", () => {
  assert.equal(EDITOR_WELCOME_SEARCH_DEBOUNCE_MS, 300);
});
