import test from "node:test";
import assert from "node:assert/strict";

import { createStateDraftFromQuery, matchesStatePortSearch } from "./statePortCreateModel.ts";

test("matchesStatePortSearch matches state names and descriptions without relying on system keys", () => {
  assert.equal(
    matchesStatePortSearch(
      {
        key: "state_1",
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
        key: "state_1",
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
        key: "state_1",
        name: "Review Notes",
        description: "Freeform notes from human review.",
      },
      "answer",
    ),
    false,
  );
  assert.equal(
    matchesStatePortSearch(
      {
        key: "legacy_semantic_key",
        name: "Review Notes",
        description: "",
      },
      "legacy",
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

test("createStateDraftFromQuery uses a neutral display name when the query is blank", () => {
  assert.deepEqual(createStateDraftFromQuery("   ", ["state_1", "state_2"]), {
    key: "state_3",
    definition: {
      name: "State 3",
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
