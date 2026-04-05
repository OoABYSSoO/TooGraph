import test from "node:test";
import assert from "node:assert/strict";

import {
  clampBuddyPosition,
  parseStoredBuddyPosition,
  serializeBuddyPosition,
} from "./buddyPosition.ts";

test("clampBuddyPosition keeps the buddy widget inside the visible viewport", () => {
  assert.deepEqual(
    clampBuddyPosition(
      { x: 980, y: -20 },
      { width: 1024, height: 768 },
      { width: 96, height: 96 },
      16,
    ),
    { x: 912, y: 16 },
  );
});

test("parseStoredBuddyPosition accepts valid coordinates and rejects malformed values", () => {
  assert.deepEqual(parseStoredBuddyPosition('{"x":120,"y":240}'), { x: 120, y: 240 });
  assert.equal(parseStoredBuddyPosition('{"x":"120","y":240}'), null);
  assert.equal(parseStoredBuddyPosition("not json"), null);
});

test("serializeBuddyPosition stores compact coordinates", () => {
  assert.equal(serializeBuddyPosition({ x: 42.4, y: 95.8 }), '{"x":42,"y":96}');
});
