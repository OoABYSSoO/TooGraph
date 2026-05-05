import test from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";

import type { GraphPayload } from "../types/node-system.ts";

import { useCompanionContextStore } from "./companionContext.ts";

function createGraph(): GraphPayload {
  return {
    graph_id: null,
    name: "Advice Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("companion context store keeps the editor snapshot read-only for companion prompts", () => {
  setActivePinia(createPinia());
  const store = useCompanionContextStore();
  const document = createGraph();

  store.setEditorSnapshot({
    activeTabTitle: "Advice Tab",
    document,
    focusedNodeId: "answer_helper",
    feedback: {
      message: "校验通过。",
      activeRunStatus: "completed",
    },
  });

  assert.equal(store.editorSnapshot?.activeTabTitle, "Advice Tab");
  assert.equal(store.editorSnapshot?.document, document);
  assert.equal(store.editorSnapshot?.focusedNodeId, "answer_helper");
  assert.equal(store.editorSnapshot?.feedback?.activeRunStatus, "completed");

  store.clearEditorSnapshot();

  assert.equal(store.editorSnapshot, null);
});

test("companion context store exposes a refresh nonce for companion data updates", () => {
  setActivePinia(createPinia());
  const store = useCompanionContextStore();

  assert.equal(store.dataRefreshNonce, 0);

  store.notifyCompanionDataChanged();

  assert.equal(store.dataRefreshNonce, 1);
});
