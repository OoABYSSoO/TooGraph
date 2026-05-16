import test from "node:test";
import assert from "node:assert/strict";

import type { StateDefinition } from "@/types/node-system";

import {
  buildConditionRuleEditorModel,
  CONDITION_RULE_OPERATOR_OPTIONS,
  isConditionRuleValueInputDisabled,
  resolveConditionRuleOperatorPatch,
  resolveConditionRuleValueDraft,
  resolveConditionRuleValuePatch,
} from "./conditionRuleEditorModel.ts";
import * as conditionRuleEditorModel from "./conditionRuleEditorModel.ts";

const stateSchema: Record<string, StateDefinition> = {
  question: {
    name: "Question",
    description: "",
    type: "text",
    value: "",
    color: "#d97706",
  },
  answer: {
    name: "Answer",
    description: "",
    type: "text",
    value: "",
    color: "#7c3aed",
  },
  approved: {
    name: "Approved",
    description: "",
    type: "boolean",
    value: false,
    color: "#10b981",
  },
  score: {
    name: "Score",
    description: "",
    type: "number",
    value: 0,
    color: "#2563eb",
  },
};

test("buildConditionRuleEditorModel resolves source options and falls back invalid source to first option", () => {
  const model = buildConditionRuleEditorModel(
    {
      source: "missing",
      operator: "==",
      value: "ok",
    },
    stateSchema,
  );

  assert.deepEqual(model.sourceOptions, [
    { value: "question", label: "Question" },
    { value: "answer", label: "Answer" },
    { value: "approved", label: "Approved" },
    { value: "score", label: "Score" },
  ]);
  assert.equal(model.resolvedSource, "question");
  assert.equal(model.isValueDisabled, false);
});

test("buildConditionRuleEditorModel disables value input for exists operator", () => {
  const model = buildConditionRuleEditorModel(
    {
      source: "answer",
      operator: "exists",
      value: null,
    },
    stateSchema,
  );

  assert.equal(model.resolvedSource, "answer");
  assert.equal(model.isValueDisabled, true);
});

test("condition rule operator options include string contains checks", () => {
  assert.ok(CONDITION_RULE_OPERATOR_OPTIONS.some((option) => option.value === "contains" && option.label === "contains"));
  assert.ok(
    CONDITION_RULE_OPERATOR_OPTIONS.some((option) => option.value === "not_contains" && option.label === "not contains"),
  );
});

test("buildConditionRuleEditorModel keeps value input enabled for contains operators", () => {
  const model = buildConditionRuleEditorModel(
    {
      source: "answer",
      operator: "contains",
      value: "正确",
    },
    stateSchema,
  );

  assert.equal(model.resolvedSource, "answer");
  assert.equal(model.isValueDisabled, false);
});

test("buildConditionRuleEditorModel uses a boolean switch for boolean source values", () => {
  const model = buildConditionRuleEditorModel(
    {
      source: "approved",
      operator: "==",
      value: true,
    },
    stateSchema,
  );

  assert.equal(model.valueEditorMode, "boolean");
  assert.equal(model.booleanValue, true);
});

test("buildConditionRuleEditorModel uses number input for number source values", () => {
  const model = buildConditionRuleEditorModel(
    {
      source: "score",
      operator: ">=",
      value: 60,
    },
    stateSchema,
  );

  assert.equal(model.valueEditorMode, "number");
  assert.equal(model.inputType, "number");
});

test("condition rule draft helpers preserve NodeCard draft normalization", () => {
  assert.equal(resolveConditionRuleValueDraft(null), "");
  assert.equal(resolveConditionRuleValueDraft(undefined), "");
  assert.equal(resolveConditionRuleValueDraft(false), "false");
  assert.equal(resolveConditionRuleValueDraft(42), "42");
  assert.equal(resolveConditionRuleValueDraft("ready"), "ready");
});

test("condition rule patch helpers preserve NodeCard commit behavior", () => {
  assert.deepEqual(resolveConditionRuleOperatorPatch(undefined), { operator: "exists" });
  assert.deepEqual(resolveConditionRuleOperatorPatch("contains"), { operator: "contains" });
  assert.equal(resolveConditionRuleValuePatch("same", "same"), null);
  assert.equal(resolveConditionRuleValuePatch("", null), null);
  assert.deepEqual(resolveConditionRuleValuePatch("next", "previous"), { value: "next" });
  assert.deepEqual(resolveConditionRuleValuePatch("7", 7), null);
  assert.deepEqual(resolveConditionRuleValuePatch("7.5", 7, "number"), { value: 7.5 });
  assert.equal(resolveConditionRuleValuePatch("not-a-number", 7, "number"), null);
  assert.equal(typeof conditionRuleEditorModel.resolveConditionRuleBooleanValuePatch, "function");
  assert.deepEqual(conditionRuleEditorModel.resolveConditionRuleBooleanValuePatch(true, false), { value: true });
  assert.equal(conditionRuleEditorModel.resolveConditionRuleBooleanValuePatch(false, false), null);
});

test("condition rule disabled helper matches exists-only value disabling", () => {
  assert.equal(isConditionRuleValueInputDisabled("exists"), true);
  assert.equal(isConditionRuleValueInputDisabled("contains"), false);
  assert.equal(isConditionRuleValueInputDisabled(null), false);
});
