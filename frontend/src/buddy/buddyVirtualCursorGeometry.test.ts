import test from "node:test";
import assert from "node:assert/strict";

import {
  BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS,
  BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS,
  BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG,
  BUDDY_VIRTUAL_CURSOR_SIZE,
  interpolateBuddyPosition,
  resolveContinuousVirtualCursorAngle,
  resolveDefaultVirtualCursorPosition,
  resolveSmoothedVirtualCursorAngle,
  resolveVirtualCursorFlightAngle,
  resolveVirtualCursorLaunchPosition,
  resolveVirtualCursorMoveDurationMs,
  resolveVirtualCursorPositionForClientPoint,
  resolveVirtualCursorRotateDurationMs,
} from "./buddyVirtualCursorGeometry.ts";

test("virtual cursor geometry resolves default and launch positions around the buddy", () => {
  assert.deepEqual(
    resolveDefaultVirtualCursorPosition({ width: 240, height: 180 }, { x: 50, y: 60 }),
    { x: 77, y: 51 },
  );
  assert.deepEqual(
    resolveVirtualCursorLaunchPosition({ width: 400, height: 300 }, { x: 260, y: 100 }),
    { x: 237, y: 84 },
  );
  assert.deepEqual(
    resolveVirtualCursorLaunchPosition({ width: 400, height: 300 }, { x: 20, y: 100 }),
    { x: 97, y: 84 },
  );
});

test("virtual cursor geometry clamps client points into the viewport frame", () => {
  assert.deepEqual(resolveVirtualCursorPositionForClientPoint({ x: 100, y: 100 }, { width: 300, height: 200 }), {
    x: 79,
    y: 79,
  });
  assert.deepEqual(resolveVirtualCursorPositionForClientPoint({ x: 0, y: 0 }, { width: 300, height: 200 }), {
    x: 16,
    y: 16,
  });
  assert.deepEqual(resolveVirtualCursorPositionForClientPoint({ x: 1000, y: 1000 }, { width: 300, height: 200 }), {
    x: 242,
    y: 142,
  });
  assert.deepEqual(BUDDY_VIRTUAL_CURSOR_SIZE, { width: 42, height: 42 });
});

test("virtual cursor geometry resolves movement and rotation timing", () => {
  assert.equal(resolveVirtualCursorMoveDurationMs({ x: 0, y: 0 }, { x: 0, y: 0 }, 100), 0);
  assert.equal(resolveVirtualCursorMoveDurationMs({ x: 0, y: 0 }, { x: 30, y: 40 }, 100), 500);
  assert.equal(
    resolveVirtualCursorMoveDurationMs({ x: 0, y: 0 }, { x: 1, y: 0 }, 10_000),
    BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS,
  );
  assert.equal(
    resolveVirtualCursorMoveDurationMs({ x: 0, y: 0 }, { x: 10_000, y: 0 }, 1),
    BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS,
  );

  assert.equal(resolveVirtualCursorRotateDurationMs(350, 10, 100), 200);
  assert.equal(resolveVirtualCursorRotateDurationMs(10, 350, 100), 200);
  assert.equal(resolveVirtualCursorRotateDurationMs(0, 0.5, 100), 0);
});

test("virtual cursor geometry keeps angle transitions continuous and smoothed", () => {
  assert.equal(resolveContinuousVirtualCursorAngle(350, 10), 370);
  assert.equal(resolveContinuousVirtualCursorAngle(10, 350), -10);
  assert.equal(resolveSmoothedVirtualCursorAngle(0, 90, 100, 180), 18);
  assert.equal(resolveSmoothedVirtualCursorAngle(0, -90, 100, 180), -18);
  assert.equal(resolveSmoothedVirtualCursorAngle(350, 10, 100, 180), 368);
  assert.equal(resolveVirtualCursorFlightAngle({ x: 0, y: 0 }, { x: 0, y: 0 }), BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG);
  assert.equal(resolveVirtualCursorFlightAngle({ x: 0, y: 0 }, { x: 0, y: 10 }), 180);
  assert.deepEqual(interpolateBuddyPosition({ x: 10, y: 20 }, { x: 30, y: 60 }, 0.25), { x: 15, y: 30 });
});
