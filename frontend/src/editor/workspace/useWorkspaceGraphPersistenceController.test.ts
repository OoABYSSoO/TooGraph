import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { EditorWorkspaceTab, PersistedEditorWorkspace } from "@/lib/editor-workspace";
import type {
  GraphDocument,
  GraphPayload,
  GraphSaveResponse,
  GraphValidationResponse,
  TemplateSaveResponse,
} from "@/types/node-system";

import { useWorkspaceGraphPersistenceController } from "./useWorkspaceGraphPersistenceController.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

function graphDocument(name: string, graphId: string | null = null): GraphPayload | GraphDocument {
  return {
    graph_id: graphId,
    name,
    nodes: {
      node_a: {
        id: "node_a",
        kind: "agent",
        name: "Agent",
        description: "",
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
        ui: { position: { x: 0, y: 0 } },
      },
    },
    edges: [],
    conditional_edges: [],
    state_schema: {},
    metadata: {},
  } as unknown as GraphPayload | GraphDocument;
}

function agentConfig(document: GraphPayload | GraphDocument) {
  const node = document.nodes.node_a;
  assert.equal(node?.kind, "agent");
  return node.config;
}

function parentGraphWithSubgraph(): GraphPayload {
  return {
    graph_id: null,
    name: "Parent Graph",
    nodes: {
      subgraph_node: {
        kind: "subgraph",
        name: "Original Subgraph",
        description: "Embedded graph",
        reads: [],
        writes: [],
        ui: { position: { x: 0, y: 0 } },
        config: {
          graph: {
            state_schema: {},
            nodes: {},
            edges: [],
            conditional_edges: [],
            metadata: { version: "old" },
          },
        },
      },
    },
    edges: [],
    conditional_edges: [],
    state_schema: {},
    metadata: {},
  };
}

function createHarness(options: {
  locked?: boolean;
  requestSaveMetadata?: (request: {
    document: GraphPayload | GraphDocument;
    target: "graph" | "template";
  }) => Promise<GraphPayload | GraphDocument | null>;
} = {}) {
  const initialTab: EditorWorkspaceTab = {
    tabId: "tab_a",
    kind: "new",
    graphId: null,
    title: "Draft",
    dirty: true,
    templateId: "template_a",
    defaultTemplateId: null,
    subgraphSource: null,
  };
  const activeTab = ref<EditorWorkspaceTab | null>(initialTab);
  const workspace = ref<PersistedEditorWorkspace>({
    activeTabId: "tab_a",
    tabs: [initialTab],
  });
  const documentsByTabId = ref<Record<string, GraphPayload | GraphDocument>>({
    tab_a: graphDocument("Draft"),
  });
  const savedGraph = graphDocument("Saved Graph", "graph_saved") as GraphDocument;
  const savedDocuments: Array<GraphPayload | GraphDocument> = [];
  const savedTemplateDocuments: Array<GraphPayload | GraphDocument> = [];
  const registeredDocuments: Array<{ tabId: string; document: GraphPayload | GraphDocument }> = [];
  const routeSyncs: Array<{ graphId: string | null; mode: "push" | "replace" | "none" }> = [];
  const committedDocuments: Array<{ tabId: string; document: GraphPayload | GraphDocument }> = [];
  const feedback: Array<{ tabId: string; feedback: Partial<WorkspaceRunFeedback> }> = [];
  const downloads: Array<{ source: string; fileName: string }> = [];
  const saveToasts: string[] = [];
  let graphLoadCount = 0;
  let templateLoadCount = 0;

  const controller = useWorkspaceGraphPersistenceController({
    activeTab,
    workspace,
    documentsByTabId,
    guardGraphEditForTab: () => Boolean(options.locked),
    commitDirtyDocumentForTab: (tabId, document) => {
      committedDocuments.push({ tabId, document });
      documentsByTabId.value = { ...documentsByTabId.value, [tabId]: document };
    },
    registerDocumentForTab: (tabId, document) => {
      registeredDocuments.push({ tabId, document });
      documentsByTabId.value = { ...documentsByTabId.value, [tabId]: document };
    },
    updateWorkspace: (nextWorkspace) => {
      workspace.value = nextWorkspace;
      activeTab.value = nextWorkspace.tabs.find((tab) => tab.tabId === nextWorkspace.activeTabId) ?? null;
    },
    updateWorkspaceTab: (tabId, updater) => {
      workspace.value = {
        ...workspace.value,
        tabs: workspace.value.tabs.map((tab) => (tab.tabId === tabId ? updater(tab) : tab)),
      };
      activeTab.value = workspace.value.tabs.find((tab) => tab.tabId === workspace.value.activeTabId) ?? null;
    },
    syncRouteToTab: (tab, mode) => {
      routeSyncs.push({ graphId: tab.graphId, mode });
    },
    loadGraphs: async () => {
      graphLoadCount += 1;
    },
    loadTemplates: async () => {
      templateLoadCount += 1;
    },
    saveGraph: async (document) => {
      savedDocuments.push(document);
      return {
        graph_id: "graph_saved",
        saved: true,
        validation: { valid: true, issues: [] },
      } satisfies GraphSaveResponse;
    },
    saveGraphAsTemplate: async (document) => {
      savedTemplateDocuments.push(document);
      return {
        template_id: "user_template_1",
        saved: true,
        template: {
          template_id: "user_template_1",
          label: document.name,
          description: "",
          default_graph_name: document.name,
          source: "user",
          state_schema: document.state_schema,
          nodes: document.nodes,
          edges: document.edges,
          conditional_edges: document.conditional_edges,
          metadata: document.metadata,
        },
      } satisfies TemplateSaveResponse;
    },
    fetchGraph: async () => savedGraph,
    validateGraph: async () =>
      ({
        valid: false,
        issues: [{ code: "missing", message: "Missing edge", path: null }],
      }) satisfies GraphValidationResponse,
    exportLangGraphPython: async () => "print('graph')\n",
    downloadPythonSource: (source, fileName) => {
      downloads.push({ source, fileName });
    },
    setMessageFeedbackForTab: (tabId, nextFeedback) => {
      feedback.push({ tabId, feedback: nextFeedback });
    },
    requestSaveMetadata: options.requestSaveMetadata,
    showSaveSuccessToast: (message) => {
      saveToasts.push(message);
    },
  });

  return {
    activeTab,
    workspace,
    documentsByTabId,
    savedGraph,
    savedDocuments,
    savedTemplateDocuments,
    registeredDocuments,
    routeSyncs,
    committedDocuments,
    feedback,
    saveToasts,
    downloads,
    get graphLoadCount() {
      return graphLoadCount;
    },
    get templateLoadCount() {
      return templateLoadCount;
    },
    controller,
  };
}

test("useWorkspaceGraphPersistenceController saves the active tab as an existing graph and syncs the route", async () => {
  const harness = createHarness();

  const saved = await harness.controller.saveTab("tab_a");

  assert.equal(saved, true);
  assert.equal(harness.savedDocuments[0]?.name, "Draft");
  assert.deepEqual(harness.registeredDocuments, [{ tabId: "tab_a", document: harness.savedGraph }]);
  assert.equal(harness.workspace.value.tabs[0]?.kind, "existing");
  assert.equal(harness.workspace.value.tabs[0]?.graphId, "graph_saved");
  assert.equal(harness.workspace.value.tabs[0]?.title, "Saved Graph");
  assert.equal(harness.workspace.value.tabs[0]?.dirty, false);
  assert.deepEqual(harness.routeSyncs, [{ graphId: "graph_saved", mode: "replace" }]);
  assert.equal(harness.graphLoadCount, 1);
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "success");
  assert.deepEqual(harness.saveToasts, ["Saved graph graph_saved."]);
});

test("useWorkspaceGraphPersistenceController asks for graph metadata before saving a default-named graph", async () => {
  const requests: Array<{ document: GraphPayload | GraphDocument; target: "graph" | "template" }> = [];
  const harness = createHarness({
    requestSaveMetadata: async (request) => {
      requests.push(request);
      return {
        ...request.document,
        name: "翻译工作流",
        metadata: {
          ...request.document.metadata,
          description: "把输入内容翻译成多种语言。",
        },
      };
    },
  });
  harness.documentsByTabId.value.tab_a = graphDocument("Untitled Graph");

  const saved = await harness.controller.saveTab("tab_a");

  assert.equal(saved, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.target, "graph");
  assert.equal(requests[0]?.document.name, "Untitled Graph");
  assert.equal(harness.savedDocuments[0]?.name, "翻译工作流");
  assert.equal(harness.savedDocuments[0]?.metadata.description, "把输入内容翻译成多种语言。");
});

test("useWorkspaceGraphPersistenceController cancels saving when default-name metadata is dismissed", async () => {
  const harness = createHarness({
    requestSaveMetadata: async () => null,
  });
  harness.documentsByTabId.value.tab_a = graphDocument("Untitled Graph");

  const saved = await harness.controller.saveTab("tab_a");

  assert.equal(saved, false);
  assert.equal(harness.savedDocuments.length, 0);
  assert.equal(harness.graphLoadCount, 0);
});

test("useWorkspaceGraphPersistenceController saves subgraph tabs back into the parent node without saving a standalone graph", async () => {
  const harness = createHarness();
  const parentTab: EditorWorkspaceTab = {
    tabId: "tab_parent",
    kind: "new",
    graphId: null,
    title: "Parent Graph",
    dirty: false,
    templateId: null,
    defaultTemplateId: null,
    subgraphSource: null,
  };
  const subgraphTab: EditorWorkspaceTab = {
    tabId: "tab_subgraph",
    kind: "subgraph",
    graphId: null,
    title: "子图 · Original Subgraph",
    dirty: true,
    templateId: null,
    defaultTemplateId: null,
    subgraphSource: {
      parentTabId: "tab_parent",
      parentGraphId: null,
      parentTitle: "Parent Graph",
      nodeId: "subgraph_node",
      nodeName: "Original Subgraph",
    },
  };
  harness.workspace.value = {
    activeTabId: subgraphTab.tabId,
    tabs: [parentTab, subgraphTab],
  };
  harness.activeTab.value = subgraphTab;
  harness.documentsByTabId.value = {
    tab_parent: parentGraphWithSubgraph(),
    tab_subgraph: {
      graph_id: null,
      name: "Edited Subgraph",
      nodes: {
        input_question: {
          kind: "input",
          name: "Question Input",
          description: "",
          reads: [],
          writes: [{ state: "question", mode: "replace" }],
          config: { value: "", boundaryType: "text" },
          ui: { position: { x: 0, y: 0 } },
        },
        output_answer: {
          kind: "output",
          name: "Answer Output",
          description: "",
          reads: [{ state: "answer", required: true }],
          writes: [],
          config: {
            displayMode: "markdown",
            persistEnabled: false,
            persistFormat: "md",
            fileNameTemplate: "",
          },
          ui: { position: { x: 320, y: 0 } },
        },
      },
      edges: [],
      conditional_edges: [],
      state_schema: {
        question: { name: "Question", description: "Boundary input.", type: "text", value: "", color: "#d97706" },
        answer: { name: "Answer", description: "Boundary output.", type: "markdown", value: "", color: "#2563eb" },
      },
      metadata: { version: "edited" },
    },
  };

  const saved = await harness.controller.saveTab("tab_subgraph");

  assert.equal(saved, true);
  assert.equal(harness.savedDocuments.length, 0);
  assert.equal(harness.committedDocuments[0]?.tabId, "tab_parent");
  const committedNode = harness.committedDocuments[0]?.document.nodes.subgraph_node;
  assert.equal(committedNode?.kind, "subgraph");
  if (committedNode?.kind === "subgraph") {
    assert.equal(committedNode.name, "Edited Subgraph");
    assert.deepEqual(committedNode.reads, [{ state: "state_1", required: true }]);
    assert.deepEqual(committedNode.writes, [{ state: "state_2", mode: "replace" }]);
    assert.deepEqual(committedNode.config.graph.metadata, { version: "edited" });
  }
  assert.equal(harness.committedDocuments[0]?.document.state_schema.state_1?.name, "Question");
  assert.equal(harness.committedDocuments[0]?.document.state_schema.state_2?.name, "Answer");
  assert.equal(harness.workspace.value.tabs[1]?.dirty, false);
  assert.equal(harness.workspace.value.tabs[1]?.title, "子图 · Edited Subgraph");
  assert.equal(harness.workspace.value.tabs[1]?.subgraphSource?.nodeName, "Edited Subgraph");
});

test("useWorkspaceGraphPersistenceController can save a subgraph tab as a standalone normal graph", async () => {
  const harness = createHarness();
  const subgraphTab: EditorWorkspaceTab = {
    tabId: "tab_subgraph",
    kind: "subgraph",
    graphId: null,
    title: "子图 · Research Subgraph",
    dirty: true,
    templateId: null,
    defaultTemplateId: null,
    subgraphSource: {
      parentTabId: "tab_parent",
      parentGraphId: null,
      parentTitle: "Parent Graph",
      nodeId: "subgraph_node",
      nodeName: "Research Subgraph",
    },
  };
  harness.workspace.value = {
    activeTabId: subgraphTab.tabId,
    tabs: [subgraphTab],
  };
  harness.activeTab.value = subgraphTab;
  harness.documentsByTabId.value = {
    tab_subgraph: {
      graph_id: null,
      name: "Research Subgraph",
      nodes: {},
      edges: [],
      conditional_edges: [],
      state_schema: {},
      metadata: {},
    },
  };

  await harness.controller.saveActiveGraphAsNewGraph();

  assert.equal(harness.savedDocuments[0]?.name, "Research Subgraph");
  assert.equal(harness.workspace.value.tabs.length, 2);
  assert.equal(harness.workspace.value.tabs[0]?.kind, "subgraph");
  assert.equal(harness.workspace.value.tabs[0]?.dirty, true);
  assert.equal(harness.activeTab.value?.kind, "existing");
  assert.equal(harness.activeTab.value?.graphId, "graph_saved");
  assert.deepEqual(harness.routeSyncs, [{ graphId: "graph_saved", mode: "replace" }]);
});

test("useWorkspaceGraphPersistenceController saves the active graph as a user template and refreshes templates", async () => {
  const harness = createHarness();

  await harness.controller.saveActiveGraphAsTemplate();

  assert.equal(harness.savedTemplateDocuments[0]?.name, "Draft");
  assert.equal(harness.templateLoadCount, 1);
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "success");
  assert.equal(harness.feedback.at(-1)?.feedback.message, "Saved template user_template_1.");
  assert.deepEqual(harness.saveToasts, ["Saved template user_template_1."]);
});

test("useWorkspaceGraphPersistenceController asks for template metadata before saving a default-named template", async () => {
  const requests: Array<{ document: GraphPayload | GraphDocument; target: "graph" | "template" }> = [];
  const harness = createHarness({
    requestSaveMetadata: async (request) => {
      requests.push(request);
      return {
        ...request.document,
        name: "研究模板",
        metadata: {
          ...request.document.metadata,
          description: "可复用的研究图模板。",
        },
      };
    },
  });
  harness.documentsByTabId.value.tab_a = graphDocument("Untitled Graph");

  const saved = await harness.controller.saveActiveGraphAsTemplate();

  assert.equal(saved, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.target, "template");
  assert.equal(harness.savedTemplateDocuments[0]?.name, "研究模板");
  assert.equal(harness.savedTemplateDocuments[0]?.metadata.description, "可复用的研究图模板。");
});

test("useWorkspaceGraphPersistenceController preserves agent runtime and capability config in the saved payload", async () => {
  const harness = createHarness();
  const document = graphDocument("Runtime Config");
  const config = agentConfig(document);
  config.skillKey = "web_search";
  config.skillBindings = [{ skillKey: "web_search", outputMapping: { result: "answer" } }];
  config.suspendedFreeWrites = [{ state: "draft", mode: "append" }];
  config.skillInstructionBlocks = {
    web_search: {
      skillKey: "web_search",
      title: "搜索说明",
      content: "只搜索公开网页。",
      source: "node.override",
    },
  };
  config.taskInstruction = "Search and summarize.";
  config.modelSource = "override";
  config.model = "openai/gpt-5.5";
  config.thinkingMode = "xhigh";
  config.temperature = 0.8;
  document.state_schema = {
    answer: { name: "Answer", description: "", type: "markdown", value: "", color: "#2563eb" },
    draft: { name: "Draft", description: "", type: "markdown", value: "", color: "#10b981" },
  };

  harness.documentsByTabId.value.tab_a = document;
  await harness.controller.saveTab("tab_a");

  const savedConfig = agentConfig(harness.savedDocuments[0]!);
  assert.deepEqual(savedConfig, config);
});

test("useWorkspaceGraphPersistenceController renames through dirty commits and honors locked graphs", () => {
  const harness = createHarness();

  harness.controller.renameActiveGraph("Renamed");

  assert.equal(harness.committedDocuments[0]?.tabId, "tab_a");
  assert.equal(harness.committedDocuments[0]?.document.name, "Renamed");

  const lockedHarness = createHarness({ locked: true });
  lockedHarness.controller.renameActiveGraph("Blocked");

  assert.equal(lockedHarness.committedDocuments.length, 0);
});

test("useWorkspaceGraphPersistenceController validates and exports the active graph with scoped feedback", async () => {
  const harness = createHarness();

  await harness.controller.validateActiveGraph();
  await harness.controller.exportActiveGraph();

  assert.equal(harness.feedback[0]?.feedback.tone, "danger");
  assert.equal(harness.feedback[0]?.feedback.message, "Missing edge");
  assert.deepEqual(harness.downloads, [{ source: "print('graph')\n", fileName: "Draft.py" }]);
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "success");
  assert.equal(harness.feedback.at(-1)?.feedback.message, "Exported Draft.py.");
});
