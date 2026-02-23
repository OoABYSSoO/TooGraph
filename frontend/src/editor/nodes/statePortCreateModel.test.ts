import test from "node:test";
import assert from "node:assert/strict";

import { createStateDraftFromQuery, matchesStatePortSearch } from "./statePortCreateModel.ts";

test("matchesStatePortSearch matches state names keys and descriptions", () => {
  assert.equal(
    matchesStatePortSearch(
      {
        key: "review_notes",
        name: "Review Notes",
        description: "Freeform notes from human review.",
      },
      "review",
    ),
    true,
  );
  assert.equal(
    matchesStatePortSearch(
      {
        key: "review_notes",
        name: "Review Notes",
        description: "Freeform notes from human review.",
      },
      "freeform",
    ),
    true,
  );
  assert.equal(
    matchesStatePortSearch(
      {
        key: "review_notes",
        name: "Review Notes",
        description: "Freeform notes from human review.",
      },
      "answer",
    ),
    false,
  );
});

test("createStateDraftFromQuery creates a unique neutral state key from the whole graph", () => {
  assert.deepEqual(createStateDraftFromQuery("Review Notes", ["state_1", "state_2"]), {
    key: "state_3",
    definition: {
      name: "Review Notes",
      description: "",
      type: "text",
      value: "",
      color: "",
    },
  });
});

test("createStateDraftFromQuery keeps Chinese names while using neutral machine keys", () => {
  assert.deepEqual(createStateDraftFromQuery("最终答案", []), {
    key: "state_1",
    definition: {
      name: "最终答案",
      description: "",
      type: "text",
      value: "",
      color: "",
    },
  });

  assert.equal(createStateDraftFromQuery("最终答案", ["state_1"]).key, "state_2");
  assert.equal(createStateDraftFromQuery("用户问题", ["state_1", "state_2"]).key, "state_3");
});
