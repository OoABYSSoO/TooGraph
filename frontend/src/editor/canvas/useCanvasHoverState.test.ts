import assert from "node:assert/strict";
import test from "node:test";

import { useCanvasHoverState } from "./useCanvasHoverState.ts";

function createTimerScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];

  return {
    callbacks,
    cleared,
    scheduler: {
      setTimeout(callback: () => void) {
        const id = nextId;
        nextId += 1;
        callbacks.set(id, callback);
        return id;
      },
      clearTimeout(id: number) {
        callbacks.delete(id);
        cleared.push(id);
      },
    },
  };
}

test("useCanvasHoverState keeps node hover active until the release delay fires", () => {
  const measurements: string[] = [];
  const timer = createTimerScheduler();
  const hover = useCanvasHoverState({
    scheduleAnchorMeasurement: (nodeId) => {
      measurements.push(nodeId);
    },
    timerScheduler: timer.scheduler,
  });

  hover.setHoveredNode("node_a");
  assert.equal(hover.hoveredNodeId.value, "node_a");
  assert.deepEqual(measurements, ["node_a"]);

  hover.clearHoveredNode("node_a");
  assert.equal(hover.hoveredNodeId.value, "node_a");
  assert.equal(timer.callbacks.size, 1);

  timer.callbacks.get(1)?.();
  assert.equal(hover.hoveredNodeId.value, null);
  assert.deepEqual(measurements, ["node_a", "node_a"]);
});

test("useCanvasHoverState cancels stale node hover release timers", () => {
  const measurements: string[] = [];
  const timer = createTimerScheduler();
  const hover = useCanvasHoverState({
    scheduleAnchorMeasurement: (nodeId) => {
      measurements.push(nodeId);
    },
    timerScheduler: timer.scheduler,
  });

  hover.setHoveredNode("node_a");
  hover.clearHoveredNode("node_a");
  hover.setHoveredNode("node_b");

  assert.deepEqual(timer.cleared, [1]);
  assert.equal(hover.hoveredNodeId.value, "node_b");
  timer.callbacks.get(1)?.();
  assert.equal(hover.hoveredNodeId.value, "node_b");
  assert.deepEqual(measurements, ["node_a", "node_b"]);
});

test("useCanvasHoverState clears point and flow handle hover independently", () => {
  const measurements: string[] = [];
  const hover = useCanvasHoverState({
    scheduleAnchorMeasurement: (nodeId) => {
      measurements.push(nodeId);
    },
  });

  hover.setHoveredPointAnchorNode("node_a");
  hover.setHoveredFlowHandleNode("node_b");
  assert.equal(hover.hoveredPointAnchorNodeId.value, "node_a");
  assert.equal(hover.hoveredFlowHandleNodeId.value, "node_b");

  hover.clearHoveredPointAnchorNode("missing");
  hover.clearHoveredFlowHandleNode("missing");
  assert.equal(hover.hoveredPointAnchorNodeId.value, "node_a");
  assert.equal(hover.hoveredFlowHandleNodeId.value, "node_b");

  hover.clearHoveredPointAnchorNode("node_a");
  hover.clearHoveredFlowHandleNode("node_b");
  assert.equal(hover.hoveredPointAnchorNodeId.value, null);
  assert.equal(hover.hoveredFlowHandleNodeId.value, null);
  assert.deepEqual(measurements, ["node_a", "node_a"]);
});
