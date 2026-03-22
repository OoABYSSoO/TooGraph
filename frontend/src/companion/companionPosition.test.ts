import test from "node:test";
import assert from "node:assert/strict";

import {
  clampCompanionPosition,
  parseStoredCompanionPosition,
  serializeCompanionPosition,
} from "./companionPosition.ts";

test("clampCompanionPosition keeps the pet inside the visible viewport", () => {
  assert.deepEqual(
    clampCompanionPosition(
      { x: 980, y: -20 },
      { width: 1024, height: 768 },
      { width: 96, height: 96 },
      16,
    ),
    { x: 912, y: 16 },
  );
});

test("parseStoredCompanionPosition accepts valid coordinates and rejects malformed values", () => {
  assert.deepEqual(parseStoredCompanionPosition('{"x":120,"y":240}'), { x: 120, y: 240 });
  assert.equal(parseStoredCompanionPosition('{"x":"120","y":240}'), null);
  assert.equal(parseStoredCompanionPosition("not json"), null);
});

test("serializeCompanionPosition stores compact coordinates", () => {
  assert.equal(serializeCompanionPosition({ x: 42.4, y: 95.8 }), '{"x":42,"y":96}');
});
