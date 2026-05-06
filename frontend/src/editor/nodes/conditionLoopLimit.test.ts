import test from "node:test";
import assert from "node:assert/strict";

import {
  CONDITION_LOOP_LIMIT_DEFAULT,
  CONDITION_LOOP_LIMIT_MAX,
  CONDITION_LOOP_LIMIT_MIN,
  parseConditionLoopLimitDraft,
  resolveConditionLoopLimitDraft,
  resolveConditionLoopLimitPatch,
} from "./conditionLoopLimit.ts";

test("parseConditionLoopLimitDraft enforces bounded condition loop limits", () => {
  assert.equal(CONDITION_LOOP_LIMIT_DEFAULT, 5);
  assert.equal(CONDITION_LOOP_LIMIT_MIN, 1);
  assert.equal(CONDITION_LOOP_LIMIT_MAX, 10);
  assert.equal(parseConditionLoopLimitDraft(""), null);
  assert.equal(parseConditionLoopLimitDraft("   "), null);
  assert.equal(parseConditionLoopLimitDraft("abc"), null);
  assert.equal(parseConditionLoopLimitDraft("0"), null);
  assert.equal(parseConditionLoopLimitDraft("-2"), null);
  assert.equal(parseConditionLoopLimitDraft("-1"), null);
  assert.equal(parseConditionLoopLimitDraft("1"), 1);
  assert.equal(parseConditionLoopLimitDraft("7.8"), 7);
  assert.equal(parseConditionLoopLimitDraft("99"), 10);
});

test("resolveConditionLoopLimitDraft formats condition loop limit drafts", () => {
  assert.equal(resolveConditionLoopLimitDraft(null), "");
  assert.equal(resolveConditionLoopLimitDraft(undefined), "");
  assert.equal(resolveConditionLoopLimitDraft(-1), "5");
  assert.equal(resolveConditionLoopLimitDraft(0), "1");
  assert.equal(resolveConditionLoopLimitDraft(7.8), "7");
  assert.equal(resolveConditionLoopLimitDraft(99), "10");
});

test("resolveConditionLoopLimitPatch resolves reset, noop, and patch decisions", () => {
  assert.deepEqual(resolveConditionLoopLimitPatch("", 5), { kind: "reset", draftValue: "5" });
  assert.deepEqual(resolveConditionLoopLimitPatch("abc", 7), { kind: "reset", draftValue: "7" });
  assert.deepEqual(resolveConditionLoopLimitPatch("5", 5), { kind: "noop" });
  assert.deepEqual(resolveConditionLoopLimitPatch("8", 5), { kind: "patch", patch: { loopLimit: 8 } });
  assert.deepEqual(resolveConditionLoopLimitPatch("99", 5), { kind: "patch", patch: { loopLimit: 10 } });
});
