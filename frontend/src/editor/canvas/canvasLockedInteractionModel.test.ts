import test from "node:test";
import assert from "node:assert/strict";

import { resolveLockedNodePointerCaptureAction } from "./canvasLockedInteractionModel.ts";

test("canvas locked interaction model resolves locked node pointer capture actions", () => {
  assert.deepEqual(
    resolveLockedNodePointerCaptureAction({
      interactionLocked: false,
      nodeId: "agent",
      shouldNotifyLockedAttempt: true,
    }),
    { type: "ignore-unlocked" },
  );
  assert.deepEqual(
    resolveLockedNodePointerCaptureAction({
      interactionLocked: true,
      nodeId: "agent",
      shouldNotifyLockedAttempt: false,
    }),
    {
      type: "capture-locked-node",
      emitLockedEditAttempt: false,
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      clearSelectedEdge: true,
      selectNodeId: "agent",
    },
  );
  assert.deepEqual(
    resolveLockedNodePointerCaptureAction({
      interactionLocked: true,
      nodeId: "review",
      shouldNotifyLockedAttempt: true,
    }),
    {
      type: "capture-locked-node",
      emitLockedEditAttempt: true,
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      clearCanvasTransientState: true,
      clearPendingConnection: true,
      clearSelectedEdge: true,
      selectNodeId: "review",
    },
  );
});
