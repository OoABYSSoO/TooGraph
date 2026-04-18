import test from "node:test";
import assert from "node:assert/strict";
import { nextTick, ref } from "vue";

import { useSelection } from "./useSelection.ts";

test("useSelection syncs external focus and reports local selection changes", async () => {
  const externalSelectedNodeId = ref<string | null>("reader_node");
  const changes: Array<string | null> = [];

  const selection = useSelection({
    externalSelectedNodeId,
    onSelectedNodeIdChange(nodeId) {
      changes.push(nodeId);
    },
  });

  assert.equal(selection.selectedNodeId.value, "reader_node");

  selection.selectNode("writer_node");
  assert.equal(selection.selectedNodeId.value, "writer_node");
  assert.deepEqual(changes, ["writer_node"]);

  externalSelectedNodeId.value = "output_node";
  await nextTick();

  assert.equal(selection.selectedNodeId.value, "output_node");
  assert.deepEqual(changes, ["writer_node"]);

  selection.clearSelection();
  assert.equal(selection.selectedNodeId.value, null);
  assert.deepEqual(changes, ["writer_node", null]);
});

test("useSelection does not emit duplicate changes for the same selection", () => {
  const changes: Array<string | null> = [];
  const selection = useSelection({
    onSelectedNodeIdChange(nodeId) {
      changes.push(nodeId);
    },
  });

  selection.selectNode("agent_node");
  selection.selectNode("agent_node");
  selection.clearSelection();
  selection.clearSelection();

  assert.deepEqual(changes, ["agent_node", null]);
});
