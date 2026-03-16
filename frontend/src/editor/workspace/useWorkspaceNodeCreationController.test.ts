import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { GraphPayload, NodeCreationContext, NodeCreationEntry, PresetDocument } from "@/types/node-system";

import type { CreatedStateEdgeEditorRequest } from "./nodeCreationMenuModel.ts";
import { useWorkspaceNodeCreationController } from "./useWorkspaceNodeCreationController.ts";
import type { WorkspaceRunFeedback } from "./useWorkspaceRunVisualState.ts";

function createBaseDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Creation Graph",
    state_schema: {
      question: {
        name: "Question",
        description: "",
        type: "text",
        value: "",
        color: "#d97706",
      },
    },
    nodes: {
      input_question: {
        kind: "input",
        name: "Question Input",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "question", mode: "replace" }],
        config: {
          value: "What is GraphiteUI?",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function createConnectionContext(): NodeCreationContext {
  return {
    position: { x: 320, y: 80 },
    clientX: 420,
    clientY: 240,
    sourceNodeId: "input_question",
    sourceAnchorKind: "state-out",
    sourceStateKey: "question",
    sourceValueType: "text",
  };
}

function createHarness(options: { locked?: boolean; importPythonGraph?: boolean } = {}) {
  const documentsByTabId = ref<Record<string, GraphPayload>>({
    tab_a: createBaseDocument(),
  });
  const dataEdgeStateEditorRequestByTabId = ref<Record<string, CreatedStateEdgeEditorRequest | null>>({});
  const nodeCreationMenuByTabId = ref({});
  const persistedPresets = ref<PresetDocument[]>([]);
  const dirtyDocuments: GraphPayload[] = [];
  const feedback: Array<{ tabId: string; feedback: Partial<WorkspaceRunFeedback> }> = [];
  const importedFiles: string[] = [];

  const controller = useWorkspaceNodeCreationController({
    documentsByTabId,
    dataEdgeStateEditorRequestByTabId,
    nodeCreationMenuByTabId,
    persistedPresets,
    guardGraphEditForTab: () => Boolean(options.locked),
    markDocumentDirty: (_tabId, document) => {
      dirtyDocuments.push(document as GraphPayload);
      documentsByTabId.value.tab_a = document as GraphPayload;
    },
    setMessageFeedbackForTab: (tabId, nextFeedback) => {
      feedback.push({ tabId, feedback: nextFeedback });
    },
    importPythonGraphFile: async (file) => {
      importedFiles.push(file.name);
      return Boolean(options.importPythonGraph);
    },
    isGraphiteUiPythonExportFile: (file) => file.name.endsWith(".py"),
    now: () => 1234,
  });

  return {
    controller,
    dataEdgeStateEditorRequestByTabId,
    dirtyDocuments,
    feedback,
    importedFiles,
    nodeCreationMenuByTabId,
  };
}

function findEntry(entries: NodeCreationEntry[], entryId: string) {
  const entry = entries.find((candidate) => candidate.id === entryId);
  assert.ok(entry, `Expected node creation entry ${entryId}`);
  return entry;
}

test("useWorkspaceNodeCreationController opens, filters, and closes node creation menus", () => {
  const harness = createHarness();
  const context = createConnectionContext();

  harness.controller.openNodeCreationMenuForTab("tab_a", context);

  assert.deepEqual(harness.controller.nodeCreationMenuState("tab_a"), {
    open: true,
    context,
    position: { x: 420, y: 240 },
    query: "",
  });
  assert.equal(harness.controller.nodeCreationEntriesForTab("tab_a").some((entry) => entry.family === "input"), false);

  harness.controller.updateNodeCreationQuery("tab_a", "output");

  assert.equal(harness.controller.nodeCreationMenuState("tab_a")?.query, "output");
  assert.ok(harness.controller.nodeCreationEntriesForTab("tab_a").every((entry) => entry.label.toLowerCase().includes("output")));

  harness.controller.closeNodeCreationMenu("tab_a");

  assert.equal(harness.controller.nodeCreationMenuState("tab_a")?.open, false);
});

test("useWorkspaceNodeCreationController creates menu nodes with existing execution semantics", () => {
  const harness = createHarness();
  harness.controller.openNodeCreationMenuForTab("tab_a", createConnectionContext());
  const entry = findEntry(harness.controller.nodeCreationEntriesForTab("tab_a"), "preset-agent-empty");

  harness.controller.createNodeFromMenuForTab("tab_a", entry);

  assert.equal(harness.dirtyDocuments.length, 1);
  const createdAgentId = Object.keys(harness.dirtyDocuments[0]?.nodes ?? {}).find((nodeId) => nodeId.startsWith("agent_"));
  assert.ok(createdAgentId);
  assert.deepEqual(harness.dirtyDocuments[0]?.nodes[createdAgentId]?.reads, [{ state: "question", required: true }]);
  assert.deepEqual(harness.dirtyDocuments[0]?.edges, [{ source: "input_question", target: createdAgentId }]);
  assert.equal(harness.controller.nodeCreationMenuState("tab_a")?.open, false);
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "neutral");
});

test("useWorkspaceNodeCreationController opens created state edge editor requests with stable ids", () => {
  const harness = createHarness();

  harness.controller.openCreatedStateEdgeEditorForTab("tab_a", createConnectionContext(), {
    createdNodeId: "agent_created",
    createdStateKey: "answer",
  });

  assert.deepEqual(harness.dataEdgeStateEditorRequestByTabId.value.tab_a, {
    requestId: "input_question:answer:agent_created:1234",
    sourceNodeId: "input_question",
    targetNodeId: "agent_created",
    stateKey: "answer",
    position: { x: 320, y: 80 },
  });
});

test("useWorkspaceNodeCreationController routes GraphiteUI Python exports through graph import before file-node fallback", async () => {
  const harness = createHarness({ importPythonGraph: true });
  const file = new File(["# GraphiteUI export"], "graph.py", { type: "text/x-python" });

  await harness.controller.createNodeFromFileForTab("tab_a", { file, position: { x: 20, y: 30 } });

  assert.deepEqual(harness.importedFiles, ["graph.py"]);
  assert.equal(harness.dirtyDocuments.length, 0);
  assert.equal(harness.controller.nodeCreationMenuState("tab_a")?.open, false);
});

test("useWorkspaceNodeCreationController creates uploaded file input nodes when import fallback does not handle the file", async () => {
  const harness = createHarness();
  const file = new File(["notes"], "notes.txt", { type: "text/plain" });

  await harness.controller.createNodeFromFileForTab("tab_a", { file, position: { x: 20, y: 30 } });

  assert.equal(harness.dirtyDocuments.length, 1);
  assert.ok(Object.values(harness.dirtyDocuments[0]?.nodes ?? {}).some((node) => node.kind === "input" && node.name.includes("notes.txt")));
  assert.equal(harness.feedback.at(-1)?.feedback.tone, "neutral");
  assert.match(harness.feedback.at(-1)?.feedback.message ?? "", /notes\.txt/);
  assert.equal(harness.controller.nodeCreationMenuState("tab_a")?.open, false);
});
