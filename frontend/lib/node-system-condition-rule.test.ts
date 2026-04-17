import assert from "node:assert/strict";
import test from "node:test";

import { buildConditionRuleSourceOptions } from "./node-system-condition-rule.ts";

test("buildConditionRuleSourceOptions only exposes currently bound input states", () => {
  assert.deepEqual(
    buildConditionRuleSourceOptions(
      [
        { state: "question", required: true },
        { state: "counter", required: false },
      ],
      {
        question: {
          name: "Question",
          description: "User question",
          type: "text",
          value: "",
          color: "#d97706",
        },
        counter: {
          name: "Counter",
          description: "Loop counter",
          type: "number",
          value: 0,
          color: "#2563eb",
        },
        answer: {
          name: "Answer",
          description: "Unused output",
          type: "text",
          value: "",
          color: "#15803d",
        },
      },
    ),
    [
      { value: "question", label: "Question" },
      { value: "counter", label: "Counter" },
    ],
  );
});
