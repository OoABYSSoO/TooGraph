import test from "node:test";
import assert from "node:assert/strict";

import { parseConditionLoopLimitDraft } from "./conditionLoopLimit.ts";

test("parseConditionLoopLimitDraft keeps legacy condition loop limit semantics", () => {
  assert.equal(parseConditionLoopLimitDraft(""), null);
  assert.equal(parseConditionLoopLimitDraft("   "), null);
  assert.equal(parseConditionLoopLimitDraft("abc"), null);
  assert.equal(parseConditionLoopLimitDraft("0"), null);
  assert.equal(parseConditionLoopLimitDraft("-2"), null);
  assert.equal(parseConditionLoopLimitDraft("-1"), -1);
  assert.equal(parseConditionLoopLimitDraft("1"), 1);
  assert.equal(parseConditionLoopLimitDraft("7.8"), 7);
});
