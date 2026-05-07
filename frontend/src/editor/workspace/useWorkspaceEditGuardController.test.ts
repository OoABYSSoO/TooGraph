import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import type { GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import { useWorkspaceEditGuardController } from "./useWorkspaceEditGuardController.ts";

function createDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Graph",
    state_schema: {},
    nodes: {
      agent_a: {
        kind: "agent",
        name: "Agent",
        description: "",
        ui: { position: { x: 1, y: 2 } },
        reads: [],
        writes: [],
        config: {
          skillKey: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.7,
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function createRun(status: string): RunDetail {
  return {
    run_id: "run_1",
    graph_id: null,
    graph_name: "Graph",
    status,
    runtime_backend: "node_system",
    lifecycle: { updated_at: "", resume_count: 0 },
    checkpoint_metadata: { available: false },
    current_node_id: null,
    revision_round: 1,
    started_at: "",
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
    artifacts: { outputs: [], state_events: [] },
    state_snapshot: { values: {}, last_writers: {} },
    graph_snapshot: {},
  } as RunDetail;
}

function createHarness() {
  const documentsByTabId = ref<Record<string, GraphPayload>>({ tab_a: createDocument() });
  const latestRunDetailByTabId = ref<Record<string, RunDetail | null>>({});
  const toastCalls: string[] = [];
  const commits: Array<{ tabId: string; document: GraphPayload }> = [];

  const controller = useWorkspaceEditGuardController({
    documentsByTabId,
    latestRunDetailByTabId,
    showLockedEditToast: () => {
      toastCalls.push("locked");
    },
    commitDirtyDocumentForTab: (tabId, document) => {
      commits.push({ tabId, document: document as GraphPayload });
    },
  });

  return {
    commits,
    controller,
    latestRunDetailByTabId,
    toastCalls,
  };
}

test("useWorkspaceEditGuardController blocks edits while awaiting Human Review", () => {
  const harness = createHarness();
  harness.latestRunDetailByTabId.value = { tab_a: createRun("awaiting_human") };

  assert.equal(harness.controller.isGraphInteractionLocked("tab_a"), true);
  assert.equal(harness.controller.guardGraphEditForTab("tab_a"), true);
  assert.deepEqual(harness.toastCalls, ["locked"]);

  harness.controller.handleNodePositionUpdate("tab_a", { nodeId: "agent_a", position: { x: 10, y: 20 } });
  assert.equal(harness.commits.length, 0);
});

test("useWorkspaceEditGuardController commits node position updates immutably", () => {
  const harness = createHarness();

  harness.controller.handleNodePositionUpdate("tab_a", { nodeId: "agent_a", position: { x: 10, y: 20 } });

  assert.equal(harness.commits.length, 1);
  assert.equal(harness.commits[0]?.document.nodes.agent_a?.ui.position.x, 10);
  assert.equal(harness.commits[0]?.document.nodes.agent_a?.ui.position.y, 20);
});

test("useWorkspaceEditGuardController commits node size updates with position", () => {
  const harness = createHarness();

  harness.controller.handleNodeSizeUpdate("tab_a", {
    nodeId: "agent_a",
    position: { x: 30, y: 40 },
    size: { width: 320, height: 180 },
  });

  assert.equal(harness.commits.length, 1);
  assert.deepEqual(harness.commits[0]?.document.nodes.agent_a?.ui.position, { x: 30, y: 40 });
  assert.deepEqual(harness.commits[0]?.document.nodes.agent_a?.ui.size, { width: 320, height: 180 });
});

test("useWorkspaceEditGuardController ignores missing documents and nodes", () => {
  const harness = createHarness();

  harness.controller.handleNodePositionUpdate("tab_missing", { nodeId: "agent_a", position: { x: 10, y: 20 } });
  harness.controller.handleNodeSizeUpdate("tab_a", {
    nodeId: "missing",
    position: { x: 30, y: 40 },
    size: { width: 320, height: 180 },
  });

  assert.equal(harness.commits.length, 0);
});
