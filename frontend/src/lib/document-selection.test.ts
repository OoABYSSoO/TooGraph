import test from "node:test";
import assert from "node:assert/strict";

import { resolveInitialSelectionId } from "./document-selection.ts";

test("resolveInitialSelectionId prefers explicit selection", () => {
  assert.equal(resolveInitialSelectionId(["a", "b"], "b"), "b");
});

test("resolveInitialSelectionId falls back to the first available id", () => {
  assert.equal(resolveInitialSelectionId(["a", "b"], null), "a");
});

test("resolveInitialSelectionId returns null when no ids exist", () => {
  assert.equal(resolveInitialSelectionId([], null), null);
});
