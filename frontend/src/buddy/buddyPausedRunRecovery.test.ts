import assert from "node:assert/strict";
import test from "node:test";

import {
  findLatestRecoverablePausedRunMessage,
  isRecoverablePausedRunStatus,
  type BuddyPausedRunRecoveryMessage,
} from "./buddyPausedRunRecovery.ts";

function message(
  id: string,
  role: BuddyPausedRunRecoveryMessage["role"],
  runId?: string | null,
): BuddyPausedRunRecoveryMessage {
  return { id, role, runId };
}

test("findLatestRecoverablePausedRunMessage returns the newest assistant message with a run id", () => {
  const result = findLatestRecoverablePausedRunMessage([
    message("user-1", "user", "run_user"),
    message("assistant-1", "assistant", "run_old"),
    message("assistant-empty", "assistant", " "),
    message("assistant-2", "assistant", "run_new"),
  ]);

  assert.deepEqual(result, { messageId: "assistant-2", runId: "run_new" });
});

test("findLatestRecoverablePausedRunMessage ignores user messages and messages without run ids", () => {
  const result = findLatestRecoverablePausedRunMessage([
    message("user-1", "user", "run_user"),
    message("assistant-1", "assistant", null),
    message("assistant-2", "assistant", ""),
  ]);

  assert.equal(result, null);
});

test("isRecoverablePausedRunStatus only accepts awaiting_human", () => {
  assert.equal(isRecoverablePausedRunStatus("awaiting_human"), true);
  assert.equal(isRecoverablePausedRunStatus("paused"), false);
  assert.equal(isRecoverablePausedRunStatus("completed"), false);
  assert.equal(isRecoverablePausedRunStatus("failed"), false);
  assert.equal(isRecoverablePausedRunStatus("cancelled"), false);
  assert.equal(isRecoverablePausedRunStatus(null), false);
});
