import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSmoothNumberDisplay,
  isSmoothNumberDisplaySettled,
} from "./smoothNumberDisplay.ts";

test("advanceSmoothNumberDisplay eases toward a higher target without jumping or overshooting", () => {
  const initial = advanceSmoothNumberDisplay(null, 4000, 1000, {
    initialValue: 0,
    timeConstantMs: 180,
    snapEpsilon: 1,
  });
  const next = advanceSmoothNumberDisplay(initial, 4000, 1090, {
    timeConstantMs: 180,
    snapEpsilon: 1,
  });

  assert.equal(initial.value, 0);
  assert.ok(next.value > 0);
  assert.ok(next.value < 4000);
  assert.equal(next.target, 4000);
});

test("advanceSmoothNumberDisplay clamps downward targets immediately", () => {
  const previous = {
    value: 3000,
    target: 3200,
    updatedAtMs: 1000,
  };

  const next = advanceSmoothNumberDisplay(previous, 1200, 1100);

  assert.equal(next.value, 1200);
  assert.equal(next.target, 1200);
  assert.equal(isSmoothNumberDisplaySettled(next), true);
});

test("advanceSmoothNumberDisplay snaps to the target when it is close enough", () => {
  const previous = {
    value: 1998.8,
    target: 2000,
    updatedAtMs: 1000,
  };

  const next = advanceSmoothNumberDisplay(previous, 2000, 1016, {
    snapEpsilon: 2,
  });

  assert.equal(next.value, 2000);
  assert.equal(isSmoothNumberDisplaySettled(next, { snapEpsilon: 2 }), true);
});
