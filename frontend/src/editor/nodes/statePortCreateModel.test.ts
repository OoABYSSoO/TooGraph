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

test("createStateDraftFromQuery creates a unique text state draft from the search query", () => {
  assert.deepEqual(createStateDraftFromQuery("Review Notes", ["review_notes"]), {
    key: "review_notes_2",
    definition: {
      name: "Review Notes",
      description: "",
      type: "text",
      value: "",
      color: "",
    },
  });
});
