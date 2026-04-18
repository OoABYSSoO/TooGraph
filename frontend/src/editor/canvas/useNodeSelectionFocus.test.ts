import test from "node:test";
import assert from "node:assert/strict";
import { nextTick, ref } from "vue";

import { useNodeSelectionFocus, type NodeFocusRequest } from "./useNodeSelectionFocus.ts";

test("useNodeSelectionFocus syncs external selection without triggering viewport focus", async () => {
  const externalSelectedNodeId = ref<string | null>("reader_node");
  const externalFocusRequest = ref<NodeFocusRequest | null>(null);
  const changes: Array<string | null> = [];
  const focusRequests: string[] = [];

  const selection = useNodeSelectionFocus({
    externalSelectedNodeId,
    externalFocusRequest,
    onSelectedNodeIdChange(nodeId) {
      changes.push(nodeId);
    },
    onFocusNode(nodeId) {
      focusRequests.push(nodeId);
    },
  });

  assert.equal(selection.selectedNodeId.value, "reader_node");

  externalSelectedNodeId.value = "writer_node";
  await nextTick();

  assert.equal(selection.selectedNodeId.value, "writer_node");
  assert.deepEqual(changes, []);
  assert.deepEqual(focusRequests, []);
});

test("useNodeSelectionFocus triggers focus only for explicit focus requests", async () => {
  const externalSelectedNodeId = ref<string | null>(null);
  const externalFocusRequest = ref<NodeFocusRequest | null>(null);
  const changes: Array<string | null> = [];
  const focusRequests: string[] = [];

  const selection = useNodeSelectionFocus({
    externalSelectedNodeId,
    externalFocusRequest,
    onSelectedNodeIdChange(nodeId) {
      changes.push(nodeId);
    },
    onFocusNode(nodeId) {
      focusRequests.push(nodeId);
    },
  });

  externalFocusRequest.value = {
    nodeId: "output_node",
    sequence: 1,
  };
  await nextTick();

  assert.equal(selection.selectedNodeId.value, "output_node");
  assert.deepEqual(changes, ["output_node"]);
  assert.deepEqual(focusRequests, ["output_node"]);

  externalFocusRequest.value = {
    nodeId: "output_node",
    sequence: 2,
  };
  await nextTick();

  assert.deepEqual(changes, ["output_node"]);
  assert.deepEqual(focusRequests, ["output_node", "output_node"]);
});
