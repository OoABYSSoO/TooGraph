import assert from "node:assert/strict";
import test from "node:test";

import { createPinia, setActivePinia } from "pinia";

import { BUDDY_DEBUG_ACTION_GROUPS } from "../buddy/buddyMascotDebug.ts";
import { useBuddyMascotDebugStore } from "./buddyMascotDebug.ts";

test("buddy mascot debug store records requested actions as ordered events", () => {
  setActivePinia(createPinia());
  const store = useBuddyMascotDebugStore();

  store.trigger("thinking");
  const firstRequest = store.latestRequest;
  store.trigger("thinking");

  assert.deepEqual(firstRequest, { id: 1, action: "thinking" });
  assert.deepEqual(store.latestRequest, { id: 2, action: "thinking" });
});

test("buddy mascot debug store toggles the virtual cursor debug mode", () => {
  setActivePinia(createPinia());
  const store = useBuddyMascotDebugStore();

  assert.equal(store.virtualCursorEnabled, false);

  store.setVirtualCursorEnabled(true);
  assert.equal(store.virtualCursorEnabled, true);

  store.setVirtualCursorEnabled(false);
  assert.equal(store.virtualCursorEnabled, false);
});

test("buddy mascot debug store exposes live motion timing controls", () => {
  setActivePinia(createPinia());
  const store = useBuddyMascotDebugStore();

  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 360,
    stepPauseMs: 8,
    virtualCursorFlightSpeedPxPerS: 100,
    virtualCursorRotationSpeedDegPerS: 360,
  });

  store.setMotionConfig({
    moveDurationMs: 300,
    stepPauseMs: 0,
    virtualCursorFlightSpeedPxPerS: 180,
    virtualCursorRotationSpeedDegPerS: 540,
  });
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 300,
    stepPauseMs: 0,
    virtualCursorFlightSpeedPxPerS: 180,
    virtualCursorRotationSpeedDegPerS: 540,
  });

  store.setMotionConfig({ moveDurationMs: 40, stepPauseMs: 900, virtualCursorFlightSpeedPxPerS: 2000, virtualCursorRotationSpeedDegPerS: 4000 });
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 120,
    stepPauseMs: 240,
    virtualCursorFlightSpeedPxPerS: 1200,
    virtualCursorRotationSpeedDegPerS: 1440,
  });

  store.setMotionConfig({ virtualCursorFlightSpeedPxPerS: 0, virtualCursorRotationSpeedDegPerS: 0 });
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 120,
    stepPauseMs: 240,
    virtualCursorFlightSpeedPxPerS: 40,
    virtualCursorRotationSpeedDegPerS: 90,
  });

  store.resetMotionConfig();
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 360,
    stepPauseMs: 8,
    virtualCursorFlightSpeedPxPerS: 100,
    virtualCursorRotationSpeedDegPerS: 360,
  });
});

test("buddy mascot debug actions expose each idle animation trigger", () => {
  const actions = new Set(BUDDY_DEBUG_ACTION_GROUPS.flatMap((group) => group.actions.map((action) => action.action)));

  assert.equal(actions.has("idle-tail-switch"), true);
  assert.equal(actions.has("idle-random-move"), true);
  assert.equal(actions.has("idle-virtual-cursor-orbit"), true);
  assert.equal(actions.has("idle-virtual-cursor-chase"), true);
});
