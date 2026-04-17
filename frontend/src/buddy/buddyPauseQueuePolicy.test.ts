import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveBuddyComposerDecision,
  resolveInitialBuddyPauseActionMode,
  shouldHoldBuddyQueueDrain,
} from "./buddyPauseQueuePolicy.ts";

test("resolveBuddyComposerDecision enqueues a new turn when no run is paused", () => {
  assert.deepEqual(
    resolveBuddyComposerDecision({
      draftText: "  帮我继续推进  ",
      hasPausedRun: false,
      isResumeBusy: false,
    }),
    { kind: "enqueue_new_turn", userMessage: "帮我继续推进" },
  );
});

test("resolveBuddyComposerDecision routes paused input to the current pause card", () => {
  assert.deepEqual(
    resolveBuddyComposerDecision({
      draftText: "这是给当前断点的补充",
      hasPausedRun: true,
      isResumeBusy: false,
    }),
    { kind: "route_to_pause_card", userMessage: "这是给当前断点的补充" },
  );
});

test("resolveBuddyComposerDecision ignores sends while a paused run is resuming", () => {
  assert.deepEqual(
    resolveBuddyComposerDecision({
      draftText: "继续",
      hasPausedRun: true,
      isResumeBusy: true,
    }),
    { kind: "ignore_resume_busy", userMessage: "继续" },
  );
});

test("resolveInitialBuddyPauseActionMode starts in supplement mode only when required inputs exist", () => {
  assert.equal(resolveInitialBuddyPauseActionMode(0), "execute");
  assert.equal(resolveInitialBuddyPauseActionMode(2), "supplement");
});

test("shouldHoldBuddyQueueDrain stops queued turns behind the active paused run", () => {
  assert.equal(shouldHoldBuddyQueueDrain({ hasPausedRun: true }), true);
  assert.equal(shouldHoldBuddyQueueDrain({ hasPausedRun: false }), false);
});
