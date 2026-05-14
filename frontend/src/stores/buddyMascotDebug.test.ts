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

test("buddy mascot debug store records virtual operation requests", () => {
  setActivePinia(createPinia());
  const store = useBuddyMascotDebugStore();

  store.requestVirtualOperation({
    kind: "click",
    targetId: "app.nav.runs",
    cursorLifecycle: "return_after_step",
  });
  const firstRequest = store.latestVirtualOperationRequest;
  store.requestVirtualOperation({
    kind: "click",
    targetId: "app.nav.runs",
    cursorLifecycle: "keep",
  });

  assert.deepEqual(firstRequest, {
    id: 1,
    operation: {
      kind: "click",
      targetId: "app.nav.runs",
      cursorLifecycle: "return_after_step",
    },
  });
  assert.deepEqual(store.latestVirtualOperationRequest, {
    id: 2,
    operation: {
      kind: "click",
      targetId: "app.nav.runs",
      cursorLifecycle: "keep",
    },
  });
});

test("buddy mascot debug store exposes live motion timing controls", () => {
  setActivePinia(createPinia());
  const store = useBuddyMascotDebugStore();

  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 360,
    stepPauseMs: 8,
    virtualCursorFlightSpeedPxPerS: 1200,
    virtualCursorRotationSpeedDegPerS: 720,
    mascotLookRangeX: 40,
    mascotLookRangeY: 28,
    virtualCursorFollowMaxDistancePx: 64,
  });

  store.setMotionConfig({
    moveDurationMs: 300,
    stepPauseMs: 0,
    virtualCursorFlightSpeedPxPerS: 180,
    virtualCursorRotationSpeedDegPerS: 540,
    mascotLookRangeX: 28,
    mascotLookRangeY: 18,
    virtualCursorFollowMaxDistancePx: 140,
  });
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 300,
    stepPauseMs: 0,
    virtualCursorFlightSpeedPxPerS: 180,
    virtualCursorRotationSpeedDegPerS: 540,
    mascotLookRangeX: 28,
    mascotLookRangeY: 18,
    virtualCursorFollowMaxDistancePx: 140,
  });

  store.setMotionConfig({
    moveDurationMs: 40,
    stepPauseMs: 900,
    virtualCursorFlightSpeedPxPerS: 2000,
    virtualCursorRotationSpeedDegPerS: 4000,
    mascotLookRangeX: 100,
    mascotLookRangeY: 100,
    virtualCursorFollowMaxDistancePx: 900,
  });
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 120,
    stepPauseMs: 240,
    virtualCursorFlightSpeedPxPerS: 1200,
    virtualCursorRotationSpeedDegPerS: 1440,
    mascotLookRangeX: 40,
    mascotLookRangeY: 28,
    virtualCursorFollowMaxDistancePx: 360,
  });

  store.setMotionConfig({
    virtualCursorFlightSpeedPxPerS: 0,
    virtualCursorRotationSpeedDegPerS: 0,
    mascotLookRangeX: 0,
    mascotLookRangeY: 0,
    virtualCursorFollowMaxDistancePx: 0,
  });
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 120,
    stepPauseMs: 240,
    virtualCursorFlightSpeedPxPerS: 40,
    virtualCursorRotationSpeedDegPerS: 90,
    mascotLookRangeX: 8,
    mascotLookRangeY: 6,
    virtualCursorFollowMaxDistancePx: 32,
  });

  store.resetMotionConfig();
  assert.deepEqual(store.motionConfig, {
    moveDurationMs: 360,
    stepPauseMs: 8,
    virtualCursorFlightSpeedPxPerS: 1200,
    virtualCursorRotationSpeedDegPerS: 720,
    mascotLookRangeX: 40,
    mascotLookRangeY: 28,
    virtualCursorFollowMaxDistancePx: 64,
  });
});

test("buddy mascot debug actions expose each idle animation trigger", () => {
  const actions = new Set(BUDDY_DEBUG_ACTION_GROUPS.flatMap((group) => group.actions.map((action) => action.action)));

  assert.equal(actions.has("idle-tail-switch"), true);
  assert.equal(actions.has("idle-random-move"), true);
  assert.equal(actions.has("idle-virtual-cursor-orbit"), true);
  assert.equal(actions.has("idle-virtual-cursor-chase"), true);
});
