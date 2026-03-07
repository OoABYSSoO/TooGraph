import test from "node:test";
import assert from "node:assert/strict";

import { useCanvasConnectionInteraction } from "./useCanvasConnectionInteraction.ts";
import type { ProjectedCanvasAnchor } from "./edgeProjection.ts";

test("useCanvasConnectionInteraction starts and toggles pending connections from anchors", () => {
  const controller = useCanvasConnectionInteraction();
  const anchor = createAnchor({
    id: "agent:flow-out",
    nodeId: "agent",
    kind: "flow-out",
    x: 180,
    y: 220,
    side: "right",
  });

  const started = controller.startOrTogglePendingConnectionFromAnchor(anchor);

  assert.equal(started.status, "started");
  assert.deepEqual(controller.pendingConnection.value, {
    sourceNodeId: "agent",
    sourceKind: "flow-out",
  });
  assert.deepEqual(controller.pendingConnectionPoint.value, { x: 180, y: 220 });

  const cleared = controller.startOrTogglePendingConnectionFromAnchor(anchor);

  assert.equal(cleared.status, "cleared");
  assert.equal(controller.pendingConnection.value, null);
  assert.equal(controller.pendingConnectionPoint.value, null);
});

test("useCanvasConnectionInteraction updates auto-snap targets without losing fallback pointer points", () => {
  const controller = useCanvasConnectionInteraction();
  const targetAnchor = createAnchor({
    id: "output:flow-in",
    nodeId: "output",
    kind: "flow-in",
    x: 420,
    y: 260,
    side: "left",
  });

  controller.updatePendingConnectionTarget({
    targetAnchor,
    fallbackPoint: { x: 400, y: 250 },
  });

  assert.deepEqual(controller.autoSnappedTargetAnchor.value, targetAnchor);
  assert.deepEqual(controller.pendingConnectionPoint.value, { x: 420, y: 260 });

  controller.updatePendingConnectionTarget({
    targetAnchor: null,
    fallbackPoint: { x: 460, y: 280 },
  });

  assert.equal(controller.autoSnappedTargetAnchor.value, null);
  assert.deepEqual(controller.pendingConnectionPoint.value, { x: 460, y: 280 });
});

test("useCanvasConnectionInteraction clears preview state and reports hover node changes", () => {
  const hoverChanges: Array<{ previousNodeId: string | null; nextNodeId: string | null }> = [];
  const controller = useCanvasConnectionInteraction({
    onActiveConnectionHoverNodeChange: (change) => hoverChanges.push(change),
  });

  controller.setActiveConnectionHoverNode("agent");
  controller.setActiveConnectionHoverNode("agent");
  controller.setActiveConnectionHoverNode("output");

  assert.equal(controller.activeConnectionHoverNodeId.value, "output");
  assert.deepEqual(hoverChanges, [
    { previousNodeId: null, nextNodeId: "agent" },
    { previousNodeId: "agent", nextNodeId: "output" },
  ]);

  controller.updatePendingConnectionTarget({
    targetAnchor: createAnchor({
      id: "output:flow-in",
      nodeId: "output",
      kind: "flow-in",
      x: 420,
      y: 260,
      side: "left",
    }),
    fallbackPoint: { x: 400, y: 250 },
  });
  controller.clearConnectionPreviewState();

  assert.equal(controller.autoSnappedTargetAnchor.value, null);
  assert.equal(controller.activeConnectionHoverNodeId.value, null);
  assert.deepEqual(hoverChanges.at(-1), { previousNodeId: "output", nextNodeId: null });
});

function createAnchor(anchor: ProjectedCanvasAnchor): ProjectedCanvasAnchor {
  return anchor;
}
