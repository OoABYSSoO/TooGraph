import test from "node:test";
import assert from "node:assert/strict";

import type { StateDefinition } from "@/types/node-system";

import { buildConditionRuleEditorModel, CONDITION_RULE_OPERATOR_OPTIONS } from "./conditionRuleEditorModel.ts";

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
