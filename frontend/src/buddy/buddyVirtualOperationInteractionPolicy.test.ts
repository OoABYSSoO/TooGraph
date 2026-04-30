import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveBuddyVirtualOperationUserAction,
  shouldHandleVirtualCursorPointerDown,
} from "./buddyVirtualOperationInteractionPolicy.ts";

test("buddy virtual operation policy only lets the stop button interrupt a running operation", () => {
  assert.deepEqual(
    resolveBuddyVirtualOperationUserAction({
      isOperationRunning: true,
      source: "stop_button",
    }),
    { interruptOperation: true, allowDefaultAction: false },
  );

  for (const source of ["avatar_click", "virtual_cursor_pointer"] as const) {
    assert.deepEqual(
      resolveBuddyVirtualOperationUserAction({
        isOperationRunning: true,
        source,
      }),
      { interruptOperation: false, allowDefaultAction: false },
    );
  }

  assert.deepEqual(
    resolveBuddyVirtualOperationUserAction({
      isOperationRunning: true,
      source: "canvas_pointer",
    }),
    { interruptOperation: false, allowDefaultAction: true },
  );
});

test("buddy virtual operation policy keeps the virtual cursor passive while an operation is running", () => {
  assert.equal(
    shouldHandleVirtualCursorPointerDown({
      isOperationRunning: true,
      phase: "active",
    }),
    false,
  );
  assert.equal(
    shouldHandleVirtualCursorPointerDown({
      isOperationRunning: false,
      phase: "active",
    }),
    true,
  );
  assert.equal(
    shouldHandleVirtualCursorPointerDown({
      isOperationRunning: false,
      phase: "returning",
    }),
    false,
  );
});
