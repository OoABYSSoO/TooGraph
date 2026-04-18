import test from "node:test";
import assert from "node:assert/strict";

import type { StateDefinition } from "@/types/node-system";

import { buildConditionRuleEditorModel } from "./conditionRuleEditorModel.ts";

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
