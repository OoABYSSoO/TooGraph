import test from "node:test";
import assert from "node:assert/strict";
import { reactive } from "vue";

import * as graphDocument from "./graph-document.ts";
import { CREATE_AGENT_INPUT_STATE_KEY, VIRTUAL_ANY_INPUT_STATE_KEY, VIRTUAL_ANY_OUTPUT_STATE_KEY } from "./virtual-any-input.ts";
import { removeStateBindingFromDocument } from "../editor/workspace/statePanelBindings.ts";
import type { AgentNode, GraphCorePayload, GraphDocument, GraphPayload, TemplateRecord } from "../types/node-system.ts";
import type { SkillDefinition } from "../types/skills.ts";

const {
  cloneGraphDocument,
  createDraftFromTemplate,
  createEditorSeedDraftGraph,
  createEmptyDraftGraph,
  isAgentBreakpointEnabledInDocument,
  pruneUnreferencedStateSchemaInDocument,
  reconcileAgentSkillOutputBindingsInDocument,
  reorderNodePortStateInDocument,
  resolveEditorSeedTemplate,
  updateAgentNodeConfigInDocument,
  updateAgentBreakpointInDocument,
  connectStateBindingInDocument,
  updateSubgraphNodeGraphInDocument,
} = graphDocument;

const webSearchSkill: SkillDefinition = {
  skillKey: "web_search",
  name: "联网搜索",
  description: "Search the public web.",
  llmInstruction: "Decide a query and run web_search.",
  schemaVersion: "graphite.skill/v1",
  version: "1.0.0",
  capabilityPolicy: {
    default: { selectable: true, requiresApproval: false },
    origins: {},
  },
  permissions: ["network"],
  runtime: { type: "python", entrypoint: "run.py" },
  inputSchema: [{ key: "query", name: "Query", valueType: "text", required: true, description: "" }],
  outputSchema: [
    { key: "query", name: "Query", valueType: "text", required: false, description: "Search query." },
    { key: "source_urls", name: "Source URLs", valueType: "json", required: false, description: "URLs." },
    { key: "artifact_paths", name: "Artifact Paths", valueType: "file", required: false, description: "Files." },
    { key: "errors", name: "Errors", valueType: "json", required: false, description: "Errors." },
  ],
  llmNodeEligibility: "ready",
  llmNodeBlockers: [],
  sourceScope: "installed",
  sourcePath: "/skills/web_search/skill.json",
  runtimeReady: true,
  runtimeRegistered: true,
  status: "active",
  canManage: true,
};

const localWorkspaceExecutorSkill: SkillDefinition = {
  skillKey: "local_workspace_executor",
  name: "Local Workspace Executor",
  description: "Run one local workspace operation.",
  llmInstruction: "Prepare one local workspace operation.",
  schemaVersion: "graphite.skill/v1",
  version: "1.0.0",
  capabilityPolicy: {
    default: { selectable: true, requiresApproval: true },
    origins: {},
  },
  permissions: ["file_read", "file_write", "subprocess"],
  runtime: { type: "python", entrypoint: "after_llm.py" },
  inputSchema: [
    { key: "path", name: "Path", valueType: "text", required: true, description: "" },
    { key: "operation", name: "Operation", valueType: "text", required: true, description: "" },
    { key: "content", name: "Content", valueType: "text", required: false, description: "" },
  ],
  outputSchema: [
    { key: "success", name: "Success", valueType: "boolean", required: false, description: "操作是否成功。" },
    { key: "result", name: "Result", valueType: "markdown", required: false, description: "成功输出或失败报错内容。" },
  ],
  llmNodeEligibility: "ready",
  llmNodeBlockers: [],
  sourceScope: "official",
  sourcePath: "/skills/local_workspace_executor/skill.json",
  runtimeReady: true,
  runtimeRegistered: true,
  status: "active",
  canManage: false,
};

const template: TemplateRecord = {
  template_id: "starter_graph",
  label: "Starter Graph",
  description: "A minimal starter graph for validating the runtime path.",
  default_graph_name: "Starter Graph",
  state_schema: {
    question: {
      name: "question",
      description: "User question",
      type: "text",
      value: "什么是 GraphiteUI？",
      color: "#d97706",
    },
  },
  nodes: {
    input_question: {
      kind: "input",
      name: "input_question",
      description: "Provide the user question.",
      ui: {
        position: {
          x: 80,
          y: 220,
        },
      },
      reads: [],
      writes: [{ state: "question", mode: "replace" }],
      config: {
        value: "什么是 GraphiteUI？",
      },
    },
  },
  edges: [{ source: "input_question", target: "input_question" }],
  conditional_edges: [],
  metadata: {
    category: "demo",
  },
};

test("createDraftFromTemplate creates a backend-native graph payload", () => {
  const draft = createDraftFromTemplate(template);

  assert.equal(draft.graph_id, null);
  assert.equal(draft.name, "Starter Graph");
  assert.deepEqual(draft.state_schema, template.state_schema);
  assert.deepEqual(draft.nodes, template.nodes);
  assert.deepEqual(draft.edges, template.edges);
  assert.deepEqual(draft.conditional_edges, template.conditional_edges);
  assert.deepEqual(draft.metadata, template.metadata);
});

test("createDraftFromTemplate deep clones nested template content", () => {
  const draft = createDraftFromTemplate(template);

  draft.state_schema.question.value = "changed";
  draft.metadata.category = "mutated";

  assert.equal(template.state_schema.question.value, "什么是 GraphiteUI？");
  assert.equal(template.metadata.category, "demo");
});

test("reorderNodePortStateInDocument swaps input bindings within the same node", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Port ordering",
    state_schema: {
      first: { name: "first", description: "", type: "text", value: "", color: "#d97706" },
      second: { name: "second", description: "", type: "text", value: "", color: "#2563eb" },
      third: { name: "third", description: "", type: "text", value: "", color: "#7c3aed" },
      answer: { name: "answer", description: "", type: "text", value: "", color: "#10b981" },
    },
    nodes: {
      answer_agent: {
        kind: "agent",
        name: "Answer Agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "first", required: true },
          { state: "second", required: true },
          { state: "third", required: true },
        ],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = reorderNodePortStateInDocument(document, "answer_agent", "input", "second", 0);

  assert.deepEqual(nextDocument.nodes.answer_agent.reads.map((binding) => binding.state), ["second", "first", "third"]);
  assert.deepEqual(nextDocument.nodes.answer_agent.writes.map((binding) => binding.state), ["answer"]);
  assert.deepEqual(document.nodes.answer_agent.reads.map((binding) => binding.state), ["first", "second", "third"]);
});

test("reorderNodePortStateInDocument swaps output bindings without crossing sides", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Output ordering",
    state_schema: {
      input: { name: "input", description: "", type: "text", value: "", color: "#d97706" },
      draft: { name: "draft", description: "", type: "text", value: "", color: "#2563eb" },
      summary: { name: "summary", description: "", type: "text", value: "", color: "#7c3aed" },
    },
    nodes: {
      writer_agent: {
        kind: "agent",
        name: "Writer Agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "input", required: true }],
        writes: [
          { state: "draft", mode: "replace" },
          { state: "summary", mode: "replace" },
        ],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = reorderNodePortStateInDocument(document, "writer_agent", "output", "summary", 0);
  const unchangedDocument = reorderNodePortStateInDocument(document, "writer_agent", "input", "summary", 0);

  assert.deepEqual(nextDocument.nodes.writer_agent.writes.map((binding) => binding.state), ["summary", "draft"]);
  assert.deepEqual(nextDocument.nodes.writer_agent.reads.map((binding) => binding.state), ["input"]);
  assert.equal(unchangedDocument, document);
});

test("reorderNodePortStateInDocument moves bindings to an insertion index for drag previews", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Move ordering",
    state_schema: {
      first: { name: "first", description: "", type: "text", value: "", color: "#d97706" },
      second: { name: "second", description: "", type: "text", value: "", color: "#2563eb" },
      third: { name: "third", description: "", type: "text", value: "", color: "#7c3aed" },
      answer: { name: "answer", description: "", type: "text", value: "", color: "#10b981" },
    },
    nodes: {
      answer_agent: {
        kind: "agent",
        name: "Answer Agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "first", required: true },
          { state: "second", required: true },
          { state: "third", required: true },
        ],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = reorderNodePortStateInDocument(document, "answer_agent", "input", "second", 2);

  assert.deepEqual(nextDocument.nodes.answer_agent.reads.map((binding) => binding.state), ["first", "third", "second"]);
});

test("updateSubgraphNodeGraphInDocument syncs subgraph boundary ports into parent state", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Parent Graph",
    state_schema: {
      question: { name: "Question", description: "Existing parent input.", type: "text", value: "keep me", color: "#d97706" },
      answer: { name: "Answer", description: "Existing parent output.", type: "markdown", value: "old run", color: "#2563eb" },
    },
    nodes: {
      research_subgraph: {
        kind: "subgraph",
        name: "Research Subgraph",
        description: "",
        ui: { position: { x: 100, y: 80 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          graph: {
            state_schema: {
              inner_question: { name: "Inner Question", description: "", type: "text", value: "", color: "#d97706" },
              inner_answer: { name: "Inner Answer", description: "", type: "markdown", value: "", color: "#2563eb" },
            },
            nodes: {
              inner_input: {
                kind: "input",
                name: "Inner Input",
                description: "",
                ui: { position: { x: 20, y: 40 } },
                reads: [],
                writes: [{ state: "inner_question", mode: "replace" }],
                config: { value: "", boundaryType: "text" },
              },
              inner_output: {
                kind: "output",
                name: "Inner Output",
                description: "",
                ui: { position: { x: 420, y: 40 } },
                reads: [{ state: "inner_answer", required: true }],
                writes: [],
                config: {
                  displayMode: "markdown",
                  persistEnabled: false,
                  persistFormat: "md",
                  fileNameTemplate: "",
                },
              },
            },
            edges: [],
            conditional_edges: [],
            metadata: { version: 1 },
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
  const nextGraph = {
    state_schema: {
      inner_question: { name: "Edited Question", description: "", type: "text", value: "", color: "#d97706" },
      inner_topic: { name: "Topic", description: "New required input.", type: "text", value: "", color: "#7c3aed" },
      inner_answer: { name: "Edited Answer", description: "", type: "markdown", value: "", color: "#2563eb" },
      inner_sources: { name: "Sources", description: "New output.", type: "file", value: "", color: "#10b981" },
    },
    nodes: {
      inner_input: {
        kind: "input",
        name: "Inner Input",
        description: "",
        ui: { position: { x: 20, y: 40 } },
        reads: [],
        writes: [{ state: "inner_question", mode: "replace" }],
        config: { value: "", boundaryType: "text" },
      },
      inner_topic_input: {
        kind: "input",
        name: "Topic Input",
        description: "",
        ui: { position: { x: 20, y: 180 } },
        reads: [],
        writes: [{ state: "inner_topic", mode: "replace" }],
        config: { value: "", boundaryType: "text" },
      },
      inner_output: {
        kind: "output",
        name: "Inner Output",
        description: "",
        ui: { position: { x: 420, y: 40 } },
        reads: [{ state: "inner_answer", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "md",
          fileNameTemplate: "",
        },
      },
      inner_sources_output: {
        kind: "output",
        name: "Sources Output",
        description: "",
        ui: { position: { x: 420, y: 180 } },
        reads: [{ state: "inner_sources", required: false }],
        writes: [],
        config: {
          displayMode: "documents",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: { version: 2 },
  } satisfies GraphCorePayload;

  const nextDocument = updateSubgraphNodeGraphInDocument(document, "research_subgraph", nextGraph);
  const unchangedDocument = updateSubgraphNodeGraphInDocument(document, "missing_node", nextGraph);

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.nodes.research_subgraph.config.graph, nextGraph);
  assert.deepEqual(nextDocument.nodes.research_subgraph.reads, [
    { state: "question", required: true },
    { state: "state_1", required: true },
  ]);
  assert.deepEqual(nextDocument.nodes.research_subgraph.writes, [
    { state: "answer", mode: "replace" },
    { state: "state_2", mode: "replace" },
  ]);
  assert.equal(nextDocument.state_schema.question.name, "Edited Question");
  assert.equal(nextDocument.state_schema.question.value, "keep me");
  assert.equal(nextDocument.state_schema.answer.name, "Edited Answer");
  assert.equal(nextDocument.state_schema.answer.value, "old run");
  assert.equal(nextDocument.state_schema.state_1.name, "Topic");
  assert.equal(nextDocument.state_schema.state_1.type, "text");
  assert.equal(nextDocument.state_schema.state_2.name, "Sources");
  assert.equal(nextDocument.state_schema.state_2.type, "file");
  assert.deepEqual(document.nodes.research_subgraph.config.graph.metadata, { version: 1 });
  assert.equal(unchangedDocument, document);
});

test("createDraftFromTemplate accepts Vue reactive template records", () => {
  const reactiveTemplate = reactive(template) as TemplateRecord;

  const draft = createDraftFromTemplate(reactiveTemplate);

  assert.equal(draft.name, "Starter Graph");
  assert.deepEqual(draft.nodes, template.nodes);
});

test("cloneGraphDocument accepts Vue reactive graph documents", () => {
  const graph: GraphDocument = {
    graph_id: "graph_123",
    name: "Starter Graph",
    state_schema: template.state_schema,
    nodes: template.nodes,
    edges: template.edges,
    conditional_edges: template.conditional_edges,
    metadata: template.metadata,
  };

  const reactiveGraph = reactive(graph) as GraphDocument;

  const clone = cloneGraphDocument(reactiveGraph);

  assert.equal(clone.graph_id, "graph_123");
  assert.deepEqual(clone.nodes, graph.nodes);
  assert.notEqual(clone, reactiveGraph);
});

test("cloneGraphDocument unwraps nested reactive skill bindings inside graph documents", () => {
  const reactiveSkillBindings = reactive([{ skillKey: "web_search" }]) as unknown as NonNullable<AgentNode["config"]["skillBindings"]>;
  const graph: GraphDocument = {
    graph_id: "graph_nested_reactive",
    name: "Nested Reactive",
    state_schema: {
      question: {
        name: "question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "web_search",
          skillBindings: reactiveSkillBindings,
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const reactiveGraph = reactive(graph) as GraphDocument;

  const clone = cloneGraphDocument(reactiveGraph);
  const clonedNode = clone.nodes.answer_helper;
  const reactiveNode = reactiveGraph.nodes.answer_helper;

  assert.equal(clonedNode.kind, "agent");
  assert.equal(reactiveNode.kind, "agent");
  assert.deepEqual(clonedNode.config.skillBindings, [{ skillKey: "web_search" }]);
  assert.notEqual(clonedNode.config.skillBindings, reactiveNode.config.skillBindings);
});

test("updateAgentNodeConfigInDocument materializes attached skill outputs as managed state writes", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Skill Output Binding Graph",
    state_schema: {},
    nodes: {
      search_agent: {
        kind: "agent",
        name: "Search Agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          skillBindings: [],
          skillInstructionBlocks: {},
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = updateAgentNodeConfigInDocument(
    document,
    "search_agent",
    (config) => ({
      ...config,
      skillKey: "web_search",
    }),
    { skillDefinitions: [webSearchSkill] },
  );

  const node = nextDocument.nodes.search_agent;
  assert.equal(node.kind, "agent");
  assert.deepEqual(node.writes.map((binding) => binding.state), ["state_1", "state_2", "state_3", "state_4"]);
  assert.deepEqual(node.config.skillBindings, [
    {
      skillKey: "web_search",
      outputMapping: {
        query: "state_1",
        source_urls: "state_2",
        artifact_paths: "state_3",
        errors: "state_4",
      },
    },
  ]);
  assert.equal(nextDocument.state_schema.state_1?.name, "Query");
  assert.equal(nextDocument.state_schema.state_1?.description, "Search query.");
  assert.equal(nextDocument.state_schema.state_1?.type, "text");
  assert.equal(nextDocument.state_schema.state_2?.type, "json");
  assert.equal(nextDocument.state_schema.state_2?.name, "Source URLs");
  assert.equal(nextDocument.state_schema.state_2?.description, "URLs.");
  assert.equal(nextDocument.state_schema.state_3?.type, "file");
  assert.equal(nextDocument.state_schema.state_3?.name, "Artifact Paths");
  assert.equal(nextDocument.state_schema.state_3?.description, "Files.");
  assert.equal("promptVisible" in (nextDocument.state_schema.state_1 ?? {}), false);
  assert.equal("promptVisible" in (nextDocument.state_schema.state_2 ?? {}), false);
  assert.equal("promptVisible" in (nextDocument.state_schema.state_3 ?? {}), false);
  assert.deepEqual(nextDocument.state_schema.state_3?.binding, {
    kind: "skill_output",
    skillKey: "web_search",
    nodeId: "search_agent",
    fieldKey: "artifact_paths",
    managed: true,
  });
  assert.deepEqual(document.nodes.search_agent.writes, []);
});

test("updateAgentNodeConfigInDocument suspends free agent outputs while a static skill owns outputs", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Skill Managed Output Graph",
    state_schema: {
      free_answer: {
        name: "Free Answer",
        description: "LLM-authored answer.",
        type: "text",
        value: "",
        color: "#7c3aed",
      },
      free_notes: {
        name: "Free Notes",
        description: "LLM-authored notes.",
        type: "json",
        value: {},
        color: "#0f766e",
      },
    },
    nodes: {
      search_agent: {
        kind: "agent",
        name: "Search Agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [
          { state: "free_answer", mode: "replace" },
          { state: "free_notes", mode: "append" },
        ],
        config: {
          skillKey: "",
          skillBindings: [],
          skillInstructionBlocks: {},
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
      output_artifacts: {
        kind: "output",
        name: "Output Artifacts",
        description: "",
        ui: { position: { x: 320, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const withSkill = updateAgentNodeConfigInDocument(
    document,
    "search_agent",
    (config) => ({ ...config, skillKey: "web_search" }),
    { skillDefinitions: [webSearchSkill] },
  );
  const skillNode = withSkill.nodes.search_agent;

  assert.equal(skillNode.kind, "agent");
  assert.deepEqual(skillNode.writes.map((binding) => binding.state), ["state_1", "state_2", "state_3", "state_4"]);
  assert.deepEqual(skillNode.config.suspendedFreeWrites, [
    { state: "free_answer", mode: "replace" },
    { state: "free_notes", mode: "append" },
  ]);
  assert.equal(withSkill.state_schema.free_answer?.name, "Free Answer");

  const connectedSkillDocument = cloneGraphDocument(withSkill);
  connectedSkillDocument.nodes.output_artifacts.reads = [{ state: "state_3", required: true }];
  connectedSkillDocument.edges = [{ source: "search_agent", target: "output_artifacts" }];

  const withoutSkill = updateAgentNodeConfigInDocument(
    connectedSkillDocument,
    "search_agent",
    (config) => ({ ...config, skillKey: "" }),
    { skillDefinitions: [webSearchSkill] },
  );
  const restoredNode = withoutSkill.nodes.search_agent;

  assert.equal(restoredNode.kind, "agent");
  assert.deepEqual(restoredNode.writes, [
    { state: "free_answer", mode: "replace" },
    { state: "free_notes", mode: "append" },
  ]);
  assert.deepEqual(restoredNode.config.skillBindings, []);
  assert.equal(restoredNode.config.suspendedFreeWrites, undefined);
  assert.deepEqual(Object.keys(withoutSkill.state_schema).sort(), ["free_answer", "free_notes"]);
  assert.deepEqual(withoutSkill.nodes.output_artifacts.reads, []);
  assert.deepEqual(withoutSkill.edges, []);
});

test("updateAgentNodeConfigInDocument does not create static skill input mappings", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Skill Input Binding Graph",
    state_schema: {
      search_content: {
        name: "Search Content",
        description: "",
        type: "text",
        value: "latest release notes",
        color: "#d97706",
      },
    },
    nodes: {
      search_agent: {
        kind: "agent",
        name: "Search Agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "search_content", required: true }],
        writes: [],
        config: {
          skillKey: "",
          skillBindings: [],
          skillInstructionBlocks: {},
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = updateAgentNodeConfigInDocument(
    document,
    "search_agent",
    (config) => ({
      ...config,
      skillKey: "web_search",
    }),
    { skillDefinitions: [webSearchSkill] },
  );

  const node = nextDocument.nodes.search_agent;
  assert.equal(node.kind, "agent");
  assert.equal("inputMapping" in (node.config.skillBindings?.[0] ?? {}), false);
});

test("reconcileAgentSkillOutputBindingsInDocument prunes stale managed outputs for the attached skill schema", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Stale Local Executor Outputs",
    state_schema: {
      state_status: {
        name: "Local Workspace Executor Status",
        description: "Old status output.",
        type: "text",
        value: "",
        color: "#d97706",
        binding: {
          kind: "skill_output",
          skillKey: "local_workspace_executor",
          nodeId: "executor",
          fieldKey: "status",
          managed: true,
        },
      },
      state_summary: {
        name: "Local Workspace Executor Summary",
        description: "Old summary output.",
        type: "markdown",
        value: "",
        color: "#2563eb",
        binding: {
          kind: "skill_output",
          skillKey: "local_workspace_executor",
          nodeId: "executor",
          fieldKey: "summary",
          managed: true,
        },
      },
    },
    nodes: {
      executor: {
        kind: "agent",
        name: "Executor",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [
          { state: "state_status", mode: "replace" },
          { state: "state_summary", mode: "replace" },
        ],
        config: {
          skillKey: "local_workspace_executor",
          skillBindings: [
            {
              skillKey: "local_workspace_executor",
              outputMapping: {
                status: "state_status",
                summary: "state_summary",
              },
            },
          ],
          skillInstructionBlocks: {},
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
      output: {
        kind: "output",
        name: "Output",
        description: "",
        ui: { position: { x: 420, y: 0 } },
        reads: [{ state: "state_summary", required: true }],
        writes: [],
        config: { channel: "final", format: "markdown", persistFormat: "none", fileNameTemplate: "" },
      },
    },
    edges: [{ source: "executor", target: "output" }],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = reconcileAgentSkillOutputBindingsInDocument(document, [localWorkspaceExecutorSkill]);
  const executor = nextDocument.nodes.executor;

  assert.notEqual(nextDocument, document);
  assert.equal(executor.kind, "agent");
  assert.equal(nextDocument.state_schema.state_status, undefined);
  assert.equal(nextDocument.state_schema.state_summary, undefined);
  assert.deepEqual(executor.writes.map((binding) => binding.state), ["state_1", "state_2"]);
  assert.equal(nextDocument.nodes.output.reads.length, 0);
  assert.deepEqual(nextDocument.edges, []);
  assert.deepEqual(executor.config.skillBindings, [
    {
      skillKey: "local_workspace_executor",
      outputMapping: {
        success: "state_1",
        result: "state_2",
      },
    },
  ]);
  assert.equal(nextDocument.state_schema.state_1?.name, "Success");
  assert.equal(nextDocument.state_schema.state_1?.type, "boolean");
  assert.equal(nextDocument.state_schema.state_2?.name, "Result");
  assert.equal(nextDocument.state_schema.state_2?.type, "markdown");
});

test("reconcileAgentSkillOutputBindingsInDocument shortens existing managed output names", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Long Managed Output Names",
    state_schema: {
      executor_success: {
        name: "Local Workspace Executor Success",
        description: "Old generated success label.",
        type: "boolean",
        value: false,
        color: "#10b981",
        binding: {
          kind: "skill_output",
          skillKey: "local_workspace_executor",
          nodeId: "executor",
          fieldKey: "success",
          managed: true,
        },
      },
      executor_result: {
        name: "Local Workspace Executor Result",
        description: "Old generated result label.",
        type: "markdown",
        value: "",
        color: "#2563eb",
        binding: {
          kind: "skill_output",
          skillKey: "local_workspace_executor",
          nodeId: "executor",
          fieldKey: "result",
          managed: true,
        },
      },
    },
    nodes: {
      executor: {
        kind: "agent",
        name: "Executor",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [
          { state: "executor_success", mode: "replace" },
          { state: "executor_result", mode: "replace" },
        ],
        config: {
          skillKey: "local_workspace_executor",
          skillBindings: [
            {
              skillKey: "local_workspace_executor",
              outputMapping: {
                success: "executor_success",
                result: "executor_result",
              },
            },
          ],
          skillInstructionBlocks: {},
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = reconcileAgentSkillOutputBindingsInDocument(document, [localWorkspaceExecutorSkill]);

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.state_schema.executor_success?.name, "Success");
  assert.equal(nextDocument.state_schema.executor_success?.description, "操作是否成功。");
  assert.equal(nextDocument.state_schema.executor_result?.name, "Result");
  assert.equal(nextDocument.state_schema.executor_result?.description, "成功输出或失败报错内容。");
});

test("connectStateBindingInDocument materializes dynamic capability result package outputs", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Dynamic Capability Binding Graph",
    state_schema: {
      selected_capability: {
        name: "Selected Capability",
        description: "Capability selected by an upstream node.",
        type: "capability",
        value: { kind: "skill", key: "web_search" },
        color: "#2563eb",
      },
      question: {
        name: "Question",
        description: "User request.",
        type: "text",
        value: "Search latest news",
        color: "#d97706",
      },
      free_answer: {
        name: "Free Answer",
        description: "Previous free LLM output.",
        type: "markdown",
        value: "",
        color: "#7c3aed",
      },
    },
    nodes: {
      capability_selector: {
        kind: "agent",
        name: "Capability Selector",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "selected_capability", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
      executor: {
        kind: "agent",
        name: "Executor",
        description: "",
        ui: { position: { x: 360, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "free_answer", mode: "replace" }],
        config: {
          skillKey: "",
          skillBindings: [],
          skillInstructionBlocks: {},
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
      output_result: {
        kind: "output",
        name: "Output Result",
        description: "",
        ui: { position: { x: 720, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [{ source: "capability_selector", target: "executor" }],
    conditional_edges: [],
    metadata: {},
  };

  const withCapability = connectStateBindingInDocument(
    document,
    "capability_selector",
    "selected_capability",
    "executor",
    "__graphiteui_virtual_any_input__",
  );
  const executorNode = withCapability.nodes.executor;

  assert.equal(executorNode.kind, "agent");
  assert.deepEqual(executorNode.reads.map((binding) => binding.state), ["question", "selected_capability"]);
  assert.deepEqual(executorNode.writes.map((binding) => binding.state), ["state_1"]);
  assert.deepEqual(executorNode.config.suspendedFreeWrites, [{ state: "free_answer", mode: "replace" }]);
  assert.equal(withCapability.state_schema.state_1?.name, "Capability");
  assert.equal(withCapability.state_schema.state_1?.type, "result_package");
  assert.deepEqual(withCapability.state_schema.state_1?.binding, {
    kind: "capability_result",
    nodeId: "executor",
    fieldKey: "result_package",
    managed: true,
  });

  const connectedOutput = cloneGraphDocument(withCapability);
  connectedOutput.nodes.output_result.reads = [{ state: "state_1", required: true }];
  connectedOutput.edges = [
    { source: "capability_selector", target: "executor" },
    { source: "executor", target: "output_result" },
  ];

  const withoutCapability = removeStateBindingFromDocument(connectedOutput, "selected_capability", "executor", "read");
  const restoredNode = withoutCapability.nodes.executor;

  assert.equal(restoredNode.kind, "agent");
  assert.deepEqual(restoredNode.reads.map((binding) => binding.state), ["question"]);
  assert.deepEqual(restoredNode.writes, [{ state: "free_answer", mode: "replace" }]);
  assert.equal(restoredNode.config.suspendedFreeWrites, undefined);
  assert.equal(withoutCapability.state_schema.state_1, undefined);
  assert.deepEqual(withoutCapability.nodes.output_result.reads, []);
  assert.deepEqual(withoutCapability.edges, []);
});

test("createEmptyDraftGraph creates an empty backend-native payload", () => {
  const draft = createEmptyDraftGraph("Untitled Graph");

  assert.deepEqual(draft, {
    graph_id: null,
    name: "Untitled Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  });
});

test("resolveEditorSeedTemplate prefers the requested template, then the first template", () => {
  const alternateTemplate = {
    ...template,
    template_id: "alternate",
    default_graph_name: "Alternate",
  };

  assert.equal(resolveEditorSeedTemplate([template, alternateTemplate], "alternate")?.template_id, "alternate");
  assert.equal(resolveEditorSeedTemplate([alternateTemplate, template], null)?.template_id, "alternate");
  assert.equal(resolveEditorSeedTemplate([alternateTemplate], null)?.template_id, "alternate");
  assert.equal(resolveEditorSeedTemplate([], null), null);
});

test("createEditorSeedDraftGraph restores the first available seed for blank new graphs", () => {
  const draft = createEditorSeedDraftGraph([template], null);

  assert.equal(draft.graph_id, null);
  assert.equal(draft.name, "Starter Graph");
  assert.deepEqual(draft.nodes, template.nodes);
  assert.notEqual(draft.nodes, template.nodes);

  draft.state_schema.question.value = "changed";
  assert.equal(template.state_schema.question.value, "什么是 GraphiteUI？");
});

test("pruneUnreferencedStateSchemaInDocument removes states that no node still references", () => {
  assert.equal(typeof pruneUnreferencedStateSchemaInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Prune states",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
      answer: { name: "answer", description: "", type: "text", value: "", color: "#2563eb" },
      orphaned: { name: "orphaned", description: "", type: "text", value: "", color: "#7c3aed" },
      branch_source: { name: "branch_source", description: "", type: "text", value: "", color: "#10b981" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      branch_gate: {
        kind: "condition",
        name: "branch_gate",
        description: "",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false"],
          loopLimit: 8,
          branchMapping: {
            true: "true",
            false: "false",
          },
          rule: {
            source: "branch_source",
            operator: "equals",
            value: "go",
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = pruneUnreferencedStateSchemaInDocument(document);

  assert.notEqual(nextDocument, document);
  assert.deepEqual(Object.keys(nextDocument.state_schema).sort(), ["answer", "branch_source", "question"]);
  assert.equal(document.state_schema.orphaned.name, "orphaned");
});

test("updateAgentBreakpointInDocument stores agent breakpoints as interrupt_after only", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Breakpoint graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
      answer: { name: "answer", description: "", type: "text", value: "", color: "#7c3aed" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      interrupt_before: ["legacy_before"],
      interruptAfter: ["legacy_camel_after"],
      interrupt_after: ["legacy_after"],
      agent_breakpoint_timing: { legacy_before: "before" },
    },
  };

  const enabled = updateAgentBreakpointInDocument(document, "answer_helper", true);

  assert.notEqual(enabled, document);
  assert.deepEqual(enabled.metadata.interrupt_after, ["legacy_after", "answer_helper"]);
  assert.equal(enabled.metadata.interrupt_before, undefined);
  assert.equal(enabled.metadata.interruptAfter, undefined);
  assert.equal(enabled.metadata.interruptBefore, undefined);
  assert.equal(enabled.metadata.agent_breakpoint_timing, undefined);
  assert.equal(isAgentBreakpointEnabledInDocument(enabled, "answer_helper"), true);
  assert.equal(isAgentBreakpointEnabledInDocument(enabled, "input_question"), false);

  const disabled = updateAgentBreakpointInDocument(enabled, "answer_helper", false);

  assert.deepEqual(disabled.metadata.interrupt_after, ["legacy_after"]);
  assert.equal(disabled.metadata.agent_breakpoint_timing, undefined);
  assert.equal(isAgentBreakpointEnabledInDocument(disabled, "answer_helper"), false);
});

test("connectStateBindingInDocument rewires a target read binding to the source state", () => {
  assert.equal(typeof graphDocument.connectStateBindingInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "State connect graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
      draft_question: { name: "draft_question", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 100, y: 0 } },
        reads: [{ state: "draft_question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_question",
    "question",
    "answer_helper",
    "draft_question",
  );

  assert.deepEqual(nextDocument.nodes.answer_helper.reads, [{ state: "question", required: true }]);
  assert.deepEqual(document.nodes.answer_helper.reads, [{ state: "draft_question", required: true }]);
});

test("connectStateBindingInDocument rewires condition input and rule source as a single input", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Condition rewire graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
      draft_question: { name: "draft_question", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_gate: {
        kind: "condition",
        name: "answer_gate",
        description: "",
        ui: { position: { x: 100, y: 0 } },
        reads: [{ state: "draft_question", required: true }],
        writes: [],
        config: {
          branches: ["true", "false"],
          loopLimit: 5,
          branchMapping: { true: "true", false: "false" },
          rule: {
            source: "draft_question",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_question",
    "question",
    "answer_gate",
    "draft_question",
  );

  assert.deepEqual(nextDocument.nodes.answer_gate.reads, [{ state: "question", required: true }]);
  assert.equal(nextDocument.nodes.answer_gate.kind, "condition");
  if (nextDocument.nodes.answer_gate.kind === "condition") {
    assert.equal(nextDocument.nodes.answer_gate.config.rule.source, "question");
  }
  assert.deepEqual(document.nodes.answer_gate.reads, [{ state: "draft_question", required: true }]);
});

test("connectStateBindingInDocument binds a virtual any input to the source state", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Virtual state connect graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 100, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      answer_gate: {
        kind: "condition",
        name: "answer_gate",
        description: "",
        ui: { position: { x: 220, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false"],
          loopLimit: 5,
          branchMapping: {
            true: "true",
            false: "false",
          },
          rule: {
            source: "",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextAgentDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_question",
    "question",
    "answer_helper",
    VIRTUAL_ANY_INPUT_STATE_KEY,
  );
  const nextConditionDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_question",
    "question",
    "answer_gate",
    VIRTUAL_ANY_INPUT_STATE_KEY,
  );

  assert.deepEqual(nextAgentDocument.nodes.answer_helper.reads, [{ state: "question", required: true }]);
  assert.deepEqual(document.nodes.answer_helper.reads, []);
  assert.deepEqual(nextConditionDocument.nodes.answer_gate.reads, [{ state: "question", required: true }]);
  assert.equal(nextConditionDocument.nodes.answer_gate.kind, "condition");
  if (nextConditionDocument.nodes.answer_gate.kind === "condition") {
    assert.equal(nextConditionDocument.nodes.answer_gate.config.rule.source, "question");
  }
});

test("connectStateBindingInDocument appends source state through a transient new agent input", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Agent state create graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
      draft_question: { name: "draft_question", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 100, y: 0 } },
        reads: [{ state: "draft_question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      answer_gate: {
        kind: "condition",
        name: "answer_gate",
        description: "",
        ui: { position: { x: 220, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false"],
          loopLimit: 5,
          branchMapping: {
            true: "true",
            false: "false",
          },
          rule: {
            source: "",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextAgentDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_question",
    "question",
    "answer_helper",
    CREATE_AGENT_INPUT_STATE_KEY,
  );
  const nextConditionDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_question",
    "question",
    "answer_gate",
    CREATE_AGENT_INPUT_STATE_KEY,
  );

  assert.deepEqual(nextAgentDocument.nodes.answer_helper.reads, [
    { state: "draft_question", required: true },
    { state: "question", required: true },
  ]);
  assert.deepEqual(nextAgentDocument.edges, [{ source: "input_question", target: "answer_helper" }]);
  assert.deepEqual(document.nodes.answer_helper.reads, [{ state: "draft_question", required: true }]);
  assert.equal(nextConditionDocument, document);
});

test("connectStateBindingInDocument appends source state through an agent virtual input", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Agent virtual input append graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
      answer: { name: "answer", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      input_answer: {
        kind: "input",
        name: "input_answer",
        description: "",
        ui: { position: { x: 0, y: 120 } },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 100, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [{ source: "input_question", target: "answer_helper" }],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_answer",
    "answer",
    "answer_helper",
    VIRTUAL_ANY_INPUT_STATE_KEY,
  );

  assert.deepEqual(nextDocument.nodes.answer_helper.reads, [
    { state: "question", required: true },
    { state: "answer", required: true },
  ]);
  assert.deepEqual(nextDocument.edges, [
    { source: "input_question", target: "answer_helper" },
    { source: "input_answer", target: "answer_helper" },
  ]);
  assert.deepEqual(document.nodes.answer_helper.reads, [{ state: "question", required: true }]);
});

test("connectStateBindingInDocument materializes a virtual output before connecting existing targets", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Virtual output connect graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
    },
    nodes: {
      empty_agent: {
        kind: "agent",
        name: "empty_agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      review_agent: {
        kind: "agent",
        name: "review_agent",
        description: "",
        ui: { position: { x: 180, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      empty_output: {
        kind: "output",
        name: "empty_output",
        description: "",
        ui: { position: { x: 360, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
      empty_gate: {
        kind: "condition",
        name: "empty_gate",
        description: "",
        ui: { position: { x: 540, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false"],
          loopLimit: 5,
          branchMapping: { true: "true", false: "false" },
          rule: {
            source: "",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 2,
    },
  };

  const nextAgentDocument = graphDocument.connectStateBindingInDocument(
    document,
    "empty_agent",
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
    "review_agent",
    CREATE_AGENT_INPUT_STATE_KEY,
  );
  assert.deepEqual(nextAgentDocument.nodes.empty_agent.writes, [{ state: "state_3", mode: "replace" }]);
  assert.deepEqual(nextAgentDocument.nodes.review_agent.reads, [
    { state: "question", required: true },
    { state: "state_3", required: true },
  ]);
  assert.equal(nextAgentDocument.state_schema.state_3?.name, "state_3");
  assert.equal(nextAgentDocument.metadata.graphiteui_state_key_counter, 3);
  assert.deepEqual(nextAgentDocument.edges, [{ source: "empty_agent", target: "review_agent" }]);

  const nextOutputDocument = graphDocument.connectStateBindingInDocument(
    document,
    "empty_agent",
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
    "empty_output",
    VIRTUAL_ANY_INPUT_STATE_KEY,
  );
  assert.deepEqual(nextOutputDocument.nodes.empty_agent.writes, [{ state: "state_3", mode: "replace" }]);
  assert.deepEqual(nextOutputDocument.nodes.empty_output.reads, [{ state: "state_3", required: true }]);

  const nextConditionDocument = graphDocument.connectStateBindingInDocument(
    document,
    "empty_agent",
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
    "empty_gate",
    VIRTUAL_ANY_INPUT_STATE_KEY,
  );
  assert.deepEqual(nextConditionDocument.nodes.empty_gate.reads, [{ state: "state_3", required: true }]);
  assert.equal(nextConditionDocument.nodes.empty_gate.kind, "condition");
  if (nextConditionDocument.nodes.empty_gate.kind === "condition") {
    assert.equal(nextConditionDocument.nodes.empty_gate.config.rule.source, "state_3");
  }
});

test("connectStateBindingInDocument materializes an input virtual output with the selected boundary type", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Typed input virtual output graph",
    state_schema: {},
    nodes: {
      empty_file_input: {
        kind: "input",
        name: "empty_file_input",
        description: "",
        ui: { position: { x: 0, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          value: "",
          boundaryType: "file",
        },
      },
      empty_agent: {
        kind: "agent",
        name: "empty_agent",
        description: "",
        ui: { position: { x: 240, y: 0 }, collapsed: false },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "high",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 2,
    },
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "empty_file_input",
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
    "empty_agent",
    VIRTUAL_ANY_INPUT_STATE_KEY,
    "file",
  );

  assert.deepEqual(nextDocument.nodes.empty_file_input.writes, [{ state: "state_3", mode: "replace" }]);
  assert.deepEqual(nextDocument.nodes.empty_agent.reads, [{ state: "state_3", required: true }]);
  assert.equal(nextDocument.state_schema.state_3?.type, "file");
  assert.equal(nextDocument.metadata.graphiteui_state_key_counter, 3);
});

test("connectStateBindingInDocument adopts a selected concrete input binding for an empty input virtual output", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Virtual input output to concrete input graph",
    state_schema: {
      first: { name: "first", description: "", type: "text", value: "", color: "#d97706" },
      second: { name: "second", description: "", type: "text", value: "", color: "#2563eb" },
      third: { name: "third", description: "", type: "text", value: "", color: "#7c3aed" },
      fourth: { name: "fourth", description: "", type: "text", value: "", color: "#10b981" },
    },
    nodes: {
      empty_input: {
        kind: "input",
        name: "empty_input",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: { value: "" },
      },
      multi_input_agent: {
        kind: "agent",
        name: "multi_input_agent",
        description: "",
        ui: { position: { x: 220, y: 0 } },
        reads: [
          { state: "first", required: true },
          { state: "second", required: true },
          { state: "third", required: true },
          { state: "fourth", required: true },
        ],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 4,
    },
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "empty_input",
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
    "multi_input_agent",
    "third",
  );

  assert.deepEqual(nextDocument.nodes.empty_input.writes, [{ state: "third", mode: "replace" }]);
  assert.deepEqual(nextDocument.nodes.multi_input_agent.reads, [
    { state: "first", required: true },
    { state: "second", required: true },
    { state: "third", required: true },
    { state: "fourth", required: true },
  ]);
  assert.equal(nextDocument.state_schema.state_5, undefined);
  assert.equal(nextDocument.metadata.graphiteui_state_key_counter, 4);
  assert.deepEqual(nextDocument.edges, [{ source: "empty_input", target: "multi_input_agent" }]);
  assert.deepEqual(document.nodes.empty_input.writes, []);
  assert.deepEqual(document.nodes.multi_input_agent.reads.map((binding) => binding.state), ["first", "second", "third", "fourth"]);
});

test("connectStateBindingInDocument materializes an agent virtual output before replacing an output input", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Agent virtual output to output input graph",
    state_schema: {
      previous: { name: "previous", description: "", type: "text", value: "", color: "#d97706" },
    },
    nodes: {
      writer_agent: {
        kind: "agent",
        name: "writer_agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_result: {
        kind: "output",
        name: "output_result",
        description: "",
        ui: { position: { x: 240, y: 0 } },
        reads: [{ state: "previous", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 2,
    },
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "writer_agent",
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
    "output_result",
    "previous",
  );

  assert.deepEqual(nextDocument.nodes.writer_agent.writes, [{ state: "state_3", mode: "replace" }]);
  assert.deepEqual(nextDocument.nodes.output_result.reads, [{ state: "state_3", required: true }]);
  assert.equal(nextDocument.state_schema.state_3?.name, "state_3");
  assert.equal(nextDocument.metadata.graphiteui_state_key_counter, 3);
  assert.deepEqual(nextDocument.edges, [{ source: "writer_agent", target: "output_result" }]);
  assert.deepEqual(document.nodes.writer_agent.writes, []);
  assert.deepEqual(document.nodes.output_result.reads, [{ state: "previous", required: true }]);
});

test("connectStateBindingInDocument materializes another state from an agent virtual output with existing writes", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Agent virtual output with existing writes graph",
    state_schema: {
      existing: { name: "existing", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      writer_agent: {
        kind: "agent",
        name: "writer_agent",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "existing", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_result: {
        kind: "output",
        name: "output_result",
        description: "",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {
      graphiteui_state_key_counter: 2,
    },
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "writer_agent",
    VIRTUAL_ANY_OUTPUT_STATE_KEY,
    "output_result",
    VIRTUAL_ANY_INPUT_STATE_KEY,
  );

  assert.deepEqual(nextDocument.nodes.writer_agent.writes, [
    { state: "existing", mode: "replace" },
    { state: "state_3", mode: "replace" },
  ]);
  assert.deepEqual(nextDocument.nodes.output_result.reads, [{ state: "state_3", required: true }]);
  assert.equal(nextDocument.state_schema.state_3?.name, "state_3");
  assert.equal(nextDocument.metadata.graphiteui_state_key_counter, 3);
  assert.deepEqual(nextDocument.edges, [{ source: "writer_agent", target: "output_result" }]);
  assert.deepEqual(document.nodes.writer_agent.writes, [{ state: "existing", mode: "replace" }]);
});

test("connectStateBindingInDocument restores ordering for an existing matching state binding", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Existing data relation graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 100, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_question",
    "question",
    "answer_helper",
    "question",
  );

  assert.deepEqual(nextDocument.nodes.answer_helper.reads, [{ state: "question", required: true }]);
  assert.deepEqual(nextDocument.edges, [{ source: "input_question", target: "answer_helper" }]);
  assert.deepEqual(document.edges, []);
});

test("connectStateBindingInDocument replaces the previous source edge for a concrete input binding", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Replace concrete state input graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
      revised_question: { name: "revised_question", description: "", type: "text", value: "", color: "#2563eb" },
    },
    nodes: {
      original_input: {
        kind: "input",
        name: "original_input",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      revised_input: {
        kind: "input",
        name: "revised_input",
        description: "",
        ui: { position: { x: 0, y: 120 } },
        reads: [],
        writes: [{ state: "revised_question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 260, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [
      { source: "original_input", target: "answer_helper" },
      { source: "original_input", target: "revised_input" },
    ],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "revised_input",
    "revised_question",
    "answer_helper",
    "question",
  );

  assert.deepEqual(nextDocument.nodes.answer_helper.reads, [{ state: "revised_question", required: true }]);
  assert.deepEqual(nextDocument.edges, [
    { source: "original_input", target: "revised_input" },
    { source: "revised_input", target: "answer_helper" },
  ]);
  assert.deepEqual(document.edges, [
    { source: "original_input", target: "answer_helper" },
    { source: "original_input", target: "revised_input" },
  ]);
});

test("connectStateBindingInDocument preserves existing same-state writer source edges", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Replace same state input graph",
    state_schema: {
      question: { name: "question", description: "", type: "text", value: "", color: "#d97706" },
    },
    nodes: {
      original_input: {
        kind: "input",
        name: "original_input",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      replacement_input: {
        kind: "input",
        name: "replacement_input",
        description: "",
        ui: { position: { x: 0, y: 120 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "",
        ui: { position: { x: 260, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [{ source: "original_input", target: "answer_helper" }],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "replacement_input",
    "question",
    "answer_helper",
    "question",
  );

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.nodes.answer_helper.reads, [{ state: "question", required: true }]);
  assert.deepEqual(nextDocument.edges, [
    { source: "original_input", target: "answer_helper" },
    { source: "replacement_input", target: "answer_helper" },
  ]);
});

test("updateOutputNodeConfigInDocument patches output config immutably", () => {
  assert.equal(typeof graphDocument.updateOutputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Output Graph",
    state_schema: {
      answer: {
        name: "answer",
        description: "Final answer",
        type: "text",
        value: "hello",
        color: "#7c3aed",
      },
    },
    nodes: {
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateOutputNodeConfigInDocument(document, "output_answer", (config) => ({
    ...config,
    displayMode: "markdown",
    persistEnabled: true,
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.output_answer.kind, "output");
  assert.deepEqual(nextDocument.nodes.output_answer.config, {
    displayMode: "markdown",
    persistEnabled: true,
    persistFormat: "auto",
    fileNameTemplate: "",
  });
  assert.deepEqual(document.nodes.output_answer.config, {
    displayMode: "auto",
    persistEnabled: false,
    persistFormat: "auto",
    fileNameTemplate: "",
  });
});

test("updateOutputNodeConfigInDocument returns original document for non-output or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateOutputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "",
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "json",
          persistEnabled: true,
          persistFormat: "json",
          fileNameTemplate: "answer",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const unchangedOutput = graphDocument.updateOutputNodeConfigInDocument(document, "output_answer", (config) => config);
  const unchangedInput = graphDocument.updateOutputNodeConfigInDocument(document, "input_question", (config) => ({
    ...config,
    persistEnabled: false,
  }));

  assert.equal(unchangedOutput, document);
  assert.equal(unchangedInput, document);
});

test("updateAgentNodeConfigInDocument patches agent config immutably", () => {
  assert.equal(typeof graphDocument.updateAgentNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Agent Graph",
    state_schema: {},
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateAgentNodeConfigInDocument(document, "answer_helper", (config) => ({
    ...config,
    taskInstruction: "请直接用中文回答用户问题。",
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.answer_helper.kind, "agent");
  assert.equal(document.nodes.answer_helper.kind, "agent");
  if (nextDocument.nodes.answer_helper.kind !== "agent" || document.nodes.answer_helper.kind !== "agent") {
    throw new Error("Expected answer_helper to remain an LLM node");
  }
  assert.equal(nextDocument.nodes.answer_helper.config.taskInstruction, "请直接用中文回答用户问题。");
  assert.equal(document.nodes.answer_helper.config.taskInstruction, "");
});

test("updateAgentNodeConfigInDocument returns original document for non-agent or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateAgentNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "已有内容",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const unchangedAgent = graphDocument.updateAgentNodeConfigInDocument(document, "answer_helper", (config) => config);
  const unchangedOutput = graphDocument.updateAgentNodeConfigInDocument(document, "output_answer", (config) => ({
    ...config,
    taskInstruction: "不应该生效",
  }));

  assert.equal(unchangedAgent, document);
  assert.equal(unchangedOutput, document);
});

test("updateNodeMetadataInDocument patches node name and description immutably", () => {
  assert.equal(typeof graphDocument.updateNodeMetadataInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Metadata Graph",
    state_schema: {},
    nodes: {
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question directly.",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateNodeMetadataInDocument(document, "answer_helper", (current) => ({
    ...current,
    name: "answer_helper_cn",
    description: "请直接用中文回答用户问题。",
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.answer_helper.name, "answer_helper_cn");
  assert.equal(nextDocument.nodes.answer_helper.description, "请直接用中文回答用户问题。");
  assert.equal(document.nodes.answer_helper.name, "answer_helper");
  assert.equal(document.nodes.answer_helper.description, "Answer the question directly.");
});

test("connectStateBindingInDocument does not rewrite agent skills for knowledge-base states", () => {
  const document: GraphPayload = {
    graph_id: null,
    name: "Knowledge Agent Graph",
    state_schema: {
      question: {
        name: "question",
        description: "User question",
        type: "text",
        value: "",
        color: "#d97706",
      },
      kb: {
        name: "kb",
        description: "Workspace knowledge base",
        type: "knowledge_base",
        value: "",
        color: "#2563eb",
      },
    },
    nodes: {
      input_kb: {
        kind: "input",
        name: "input_kb",
        description: "",
        ui: { position: { x: -160, y: 0 } },
        reads: [],
        writes: [{ state: "kb", mode: "replace" }],
        config: { value: "" },
      },
      research_helper: {
        kind: "agent",
        name: "research_helper",
        description: "Answer with workspace knowledge.",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "markdown_formatter",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectStateBindingInDocument(
    document,
    "input_kb",
    "kb",
    "research_helper",
    CREATE_AGENT_INPUT_STATE_KEY,
  );

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.research_helper.kind, "agent");
  if (nextDocument.nodes.research_helper.kind !== "agent") {
    throw new Error("Expected research_helper to remain an LLM node");
  }
  assert.equal(nextDocument.nodes.research_helper.config.skillKey, "markdown_formatter");
});

test("updateConditionNodeConfigInDocument patches condition rules and loop limits while preserving fixed branches", () => {
  assert.equal(typeof graphDocument.updateConditionNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Graph",
    state_schema: {},
    nodes: {
      continue_check: {
        kind: "condition",
        name: "continue_check",
        description: "Continue or retry",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false", "exhausted"],
          loopLimit: 5,
          branchMapping: { true: "true", false: "false" },
          rule: {
            source: "evidence_review",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateConditionNodeConfigInDocument(document, "continue_check", (config) => ({
    ...config,
    branches: ["supplement", "finalize"],
    loopLimit: 8,
    branchMapping: { true: "supplement", false: "finalize" },
    rule: {
      source: "$state.evidence_review.needs_more_search",
      operator: "==",
      value: true,
    },
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.continue_check.kind, "condition");
  assert.equal(document.nodes.continue_check.kind, "condition");
  if (nextDocument.nodes.continue_check.kind !== "condition" || document.nodes.continue_check.kind !== "condition") {
    throw new Error("Expected continue_check to remain a condition node");
  }
  assert.deepEqual(nextDocument.nodes.continue_check.config.branches, ["true", "false", "exhausted"]);
  assert.equal(nextDocument.nodes.continue_check.config.loopLimit, 8);
  assert.deepEqual(nextDocument.nodes.continue_check.config.branchMapping, { true: "true", false: "false" });
  assert.deepEqual(nextDocument.nodes.continue_check.config.rule, {
    source: "$state.evidence_review.needs_more_search",
    operator: "==",
    value: true,
  });
  assert.equal(document.nodes.continue_check.config.loopLimit, 5);
});

test("updateConditionNodeConfigInDocument returns original document for non-condition or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateConditionNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      continue_check: {
        kind: "condition",
        name: "continue_check",
        description: "Continue or retry",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false", "exhausted"],
          loopLimit: 5,
          branchMapping: { true: "true", false: "false" },
          rule: {
            source: "",
            operator: "exists",
            value: null,
          },
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const unchangedCondition = graphDocument.updateConditionNodeConfigInDocument(document, "continue_check", (config) => config);
  const unchangedAgent = graphDocument.updateConditionNodeConfigInDocument(document, "answer_helper", (config) => ({
    ...config,
    loopLimit: -1,
  }));

  assert.equal(unchangedCondition, document);
  assert.equal(unchangedAgent, document);
});

test("condition branch edit helpers are no-ops because condition branches are protocol fixed", () => {
  assert.equal(typeof graphDocument.updateConditionBranchInDocument, "function");
  assert.equal(typeof graphDocument.addConditionBranchToDocument, "function");
  assert.equal(typeof graphDocument.removeConditionBranchFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Fixed Condition Branch Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["true", "false", "exhausted"],
          loopLimit: 5,
          branchMapping: { true: "true", false: "false" },
          rule: {
            source: "result",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          true: "next_agent",
          false: "fallback_agent",
          exhausted: "fallback_agent",
        },
      },
    ],
    metadata: {},
  };

  assert.equal(
    graphDocument.updateConditionBranchInDocument(document, "route_result", "false", "fallback", ["false"]),
    document,
  );
  assert.equal(graphDocument.addConditionBranchToDocument(document, "route_result"), document);
  assert.equal(graphDocument.removeConditionBranchFromDocument(document, "route_result", "false"), document);
});

test("connectFlowNodesInDocument appends a control-flow edge immutably", () => {
  assert.equal(typeof graphDocument.connectFlowNodesInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Flow Connect Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Provide the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {},
          rule: {
            source: "question",
            operator: "exists",
            value: null,
          },
        },
      },
    },
    edges: [{ source: "input_question", target: "answer_helper" }],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.connectFlowNodesInDocument(document, "answer_helper", "route_result");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.edges, [
    { source: "input_question", target: "answer_helper" },
    { source: "answer_helper", target: "route_result" },
  ]);
  assert.deepEqual(document.edges, [{ source: "input_question", target: "answer_helper" }]);
});

test("connectFlowNodesInDocument rejects invalid or duplicate flow edges", () => {
  assert.equal(typeof graphDocument.connectFlowNodesInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Flow Connect No-op Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Provide the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [{ source: "input_question", target: "answer_helper" }],
    conditional_edges: [],
    metadata: {},
  };

  const duplicateEdge = graphDocument.connectFlowNodesInDocument(document, "input_question", "answer_helper");
  const invalidTarget = graphDocument.connectFlowNodesInDocument(document, "answer_helper", "input_question");

  assert.equal(duplicateEdge, document);
  assert.equal(invalidTarget, document);
});

test("connectConditionRouteInDocument upserts a branch route immutably", () => {
  assert.equal(typeof graphDocument.connectConditionRouteInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Route Connect Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      fallback_output: {
        kind: "output",
        name: "fallback_output",
        description: "Fallback result",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "answer_helper",
        },
      },
    ],
    metadata: {},
  };

  const nextDocument = graphDocument.connectConditionRouteInDocument(document, "route_result", "retry", "fallback_output");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "answer_helper",
        retry: "fallback_output",
      },
    },
  ]);
  assert.deepEqual(document.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "answer_helper",
      },
    },
  ]);
});

test("connectConditionRouteInDocument updates existing route targets and rejects invalid targets", () => {
  assert.equal(typeof graphDocument.connectConditionRouteInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Condition Route Update Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 360, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          retry: "answer_helper",
        },
      },
    ],
    metadata: {},
  };

  const nextDocument = graphDocument.connectConditionRouteInDocument(document, "route_result", "retry", "output_answer");
  const invalidTarget = graphDocument.connectConditionRouteInDocument(document, "route_result", "retry", "input_question");
  const duplicateRoute = graphDocument.connectConditionRouteInDocument(document, "route_result", "retry", "answer_helper");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.conditional_edges, [
    {
      source: "route_result",
      branches: {
        retry: "output_answer",
      },
    },
  ]);
  assert.equal(invalidTarget, document);
  assert.equal(duplicateRoute, document);
});

test("removeFlowEdgeFromDocument removes an existing control-flow edge immutably", () => {
  assert.equal(typeof graphDocument.removeFlowEdgeFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Flow Remove Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Provide the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "input_question", target: "answer_helper" },
      { source: "answer_helper", target: "output_answer" },
    ],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.removeFlowEdgeFromDocument(document, "answer_helper", "output_answer");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.edges, [{ source: "input_question", target: "answer_helper" }]);
  assert.deepEqual(document.edges, [
    { source: "input_question", target: "answer_helper" },
    { source: "answer_helper", target: "output_answer" },
  ]);
});

test("removeFlowEdgeFromDocument returns original document when the edge is missing", () => {
  assert.equal(typeof graphDocument.removeFlowEdgeFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Flow Remove No-op Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Provide the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
    edges: [{ source: "input_question", target: "answer_helper" }],
    conditional_edges: [],
    metadata: {},
  };

  const unchangedDocument = graphDocument.removeFlowEdgeFromDocument(document, "answer_helper", "input_question");
  assert.equal(unchangedDocument, document);
});

test("reconnectFlowEdgeInDocument retargets an existing control-flow edge immutably", () => {
  assert.equal(typeof graphDocument.reconnectFlowEdgeInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Flow Reconnect Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Provide the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [{ source: "input_question", target: "answer_helper" }],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.reconnectFlowEdgeInDocument(document, "input_question", "answer_helper", "output_answer");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.edges, [{ source: "input_question", target: "output_answer" }]);
  assert.deepEqual(document.edges, [{ source: "input_question", target: "answer_helper" }]);
});

test("reconnectFlowEdgeInDocument rejects missing, duplicate, or invalid reconnections", () => {
  assert.equal(typeof graphDocument.reconnectFlowEdgeInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Flow Reconnect No-op Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Provide the question",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: { value: "" },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {},
          rule: {
            source: "question",
            operator: "exists",
            value: null,
          },
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 360, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "input_question", target: "answer_helper" },
      { source: "input_question", target: "output_answer" },
    ],
    conditional_edges: [],
    metadata: {},
  };

  const missingEdge = graphDocument.reconnectFlowEdgeInDocument(document, "answer_helper", "input_question", "route_result");
  const duplicateEdge = graphDocument.reconnectFlowEdgeInDocument(document, "input_question", "answer_helper", "output_answer");
  const invalidTarget = graphDocument.reconnectFlowEdgeInDocument(document, "input_question", "answer_helper", "input_question");

  assert.equal(missingEdge, document);
  assert.equal(duplicateEdge, document);
  assert.equal(invalidTarget, document);
});

test("removeConditionRouteFromDocument removes a branch route and prunes empty records", () => {
  assert.equal(typeof graphDocument.removeConditionRouteFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Route Remove Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "output_answer",
          retry: "output_answer",
        },
      },
    ],
    metadata: {},
  };

  const nextDocument = graphDocument.removeConditionRouteFromDocument(document, "route_result", "continue");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.conditional_edges, [
    {
      source: "route_result",
      branches: {
        retry: "output_answer",
      },
    },
  ]);

  const prunedDocument = graphDocument.removeConditionRouteFromDocument(nextDocument, "route_result", "retry");
  assert.deepEqual(prunedDocument.conditional_edges, []);
});

test("removeConditionRouteFromDocument returns original document when the route is missing", () => {
  assert.equal(typeof graphDocument.removeConditionRouteFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Route Remove No-op Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {},
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "output_answer",
        },
      },
    ],
    metadata: {},
  };

  const unchangedDocument = graphDocument.removeConditionRouteFromDocument(document, "route_result", "retry");
  assert.equal(unchangedDocument, document);
});

test("reconnectConditionRouteInDocument retargets an existing branch route immutably", () => {
  assert.equal(typeof graphDocument.reconnectConditionRouteInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Route Reconnect Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {
            true: "continue",
            false: "retry",
          },
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "output_answer",
        },
      },
    ],
    metadata: {},
  };

  const nextDocument = graphDocument.reconnectConditionRouteInDocument(document, "route_result", "continue", "answer_helper");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(nextDocument.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "answer_helper",
      },
    },
  ]);
  assert.deepEqual(document.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "output_answer",
      },
    },
  ]);
});

test("reconnectConditionRouteInDocument rejects missing, duplicate, or invalid route reconnections", () => {
  assert.equal(typeof graphDocument.reconnectConditionRouteInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Route Reconnect No-op Graph",
    state_schema: {},
    nodes: {
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {},
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer the question",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 240, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Provide the question",
        ui: { position: { x: 360, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
    },
    edges: [],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "output_answer",
        },
      },
    ],
    metadata: {},
  };

  const missingRoute = graphDocument.reconnectConditionRouteInDocument(document, "route_result", "retry", "answer_helper");
  const duplicateRoute = graphDocument.reconnectConditionRouteInDocument(document, "route_result", "continue", "output_answer");
  const invalidTarget = graphDocument.reconnectConditionRouteInDocument(document, "route_result", "continue", "input_question");

  assert.equal(missingRoute, document);
  assert.equal(duplicateRoute, document);
  assert.equal(invalidTarget, document);
});

test("updateInputNodeConfigInDocument patches input config immutably", () => {
  assert.equal(typeof graphDocument.updateInputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Input Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "What is GraphiteUI?",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.updateInputNodeConfigInDocument(document, "input_question", (config) => ({
    ...config,
    value: "Explain GraphiteUI in Chinese.",
  }));

  assert.notEqual(nextDocument, document);
  assert.equal(nextDocument.nodes.input_question.kind, "input");
  assert.equal(document.nodes.input_question.kind, "input");
  if (nextDocument.nodes.input_question.kind !== "input" || document.nodes.input_question.kind !== "input") {
    throw new Error("Expected input_question to remain an input node");
  }
  assert.equal(nextDocument.nodes.input_question.config.value, "Explain GraphiteUI in Chinese.");
  assert.equal(document.nodes.input_question.config.value, "What is GraphiteUI?");
});

test("updateInputNodeConfigInDocument returns original document for non-input or unchanged updates", () => {
  assert.equal(typeof graphDocument.updateInputNodeConfigInDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Mixed Graph",
    state_schema: {},
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          value: "What is GraphiteUI?",
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Preview output",
        ui: { position: { x: 120, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const unchangedInput = graphDocument.updateInputNodeConfigInDocument(document, "input_question", (config) => config);
  const unchangedOutput = graphDocument.updateInputNodeConfigInDocument(document, "output_answer", (config) => ({
    ...config,
    value: "不应该生效",
  }));

  assert.equal(unchangedInput, document);
  assert.equal(unchangedOutput, document);
});

test("removeNodeFromDocument prunes the node, flow edges, and route branches that target it", () => {
  assert.equal(typeof graphDocument.removeNodeFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Delete Node Graph",
    state_schema: {
      question: {
        name: "question",
        description: "",
        type: "text",
        value: "",
        color: "#2563eb",
      },
      answer: {
        name: "answer",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "input_question",
        description: "Question input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "",
        },
      },
      answer_helper: {
        kind: "agent",
        name: "answer_helper",
        description: "Answer helper",
        ui: { position: { x: 180, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skillKey: "",
          taskInstruction: "Answer the question",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.2,
        },
      },
      route_result: {
        kind: "condition",
        name: "route_result",
        description: "Route the result",
        ui: { position: { x: 360, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          branches: ["continue", "retry"],
          loopLimit: -1,
          branchMapping: {},
          rule: {
            source: "answer",
            operator: "exists",
            value: null,
          },
        },
      },
      output_answer: {
        kind: "output",
        name: "output_answer",
        description: "Output",
        ui: { position: { x: 540, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "input_question", target: "answer_helper" },
      { source: "answer_helper", target: "route_result" },
      { source: "answer_helper", target: "output_answer" },
    ],
    conditional_edges: [
      {
        source: "route_result",
        branches: {
          continue: "output_answer",
          retry: "answer_helper",
        },
      },
    ],
    metadata: {},
  };

  const nextDocument = graphDocument.removeNodeFromDocument(document, "answer_helper");

  assert.notEqual(nextDocument, document);
  assert.deepEqual(Object.keys(nextDocument.nodes).sort(), ["input_question", "output_answer", "route_result"]);
  assert.deepEqual(nextDocument.edges, []);
  assert.deepEqual(nextDocument.conditional_edges, [
    {
      source: "route_result",
      branches: {
        continue: "output_answer",
      },
    },
  ]);
});

test("removeNodeFromDocument returns the original document when the node does not exist", () => {
  assert.equal(typeof graphDocument.removeNodeFromDocument, "function");

  const document: GraphPayload = {
    graph_id: null,
    name: "Delete Node No-op Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const nextDocument = graphDocument.removeNodeFromDocument(document, "missing_node");
  assert.equal(nextDocument, document);
});
