import assert from "node:assert/strict";
import test from "node:test";

import { createPinia, setActivePinia } from "pinia";

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
