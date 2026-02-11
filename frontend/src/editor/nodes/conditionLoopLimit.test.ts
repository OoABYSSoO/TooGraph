import test from "node:test";
import assert from "node:assert/strict";

import {
  CONDITION_LOOP_LIMIT_DEFAULT,
  CONDITION_LOOP_LIMIT_MAX,
  CONDITION_LOOP_LIMIT_MIN,
  parseConditionLoopLimitDraft,
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
