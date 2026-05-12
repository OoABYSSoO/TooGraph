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
