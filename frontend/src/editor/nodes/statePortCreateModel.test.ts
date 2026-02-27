import test from "node:test";
import assert from "node:assert/strict";

import { createStateDraftFromQuery, matchesStatePortSearch } from "./statePortCreateModel.ts";
import { STATE_COLOR_OPTIONS } from "../workspace/statePanelFields.ts";

const defaultStateColorValues = STATE_COLOR_OPTIONS.map((option) => option.value).filter(Boolean);

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
  const draft = createStateDraftFromQuery("Review Notes", ["state_1", "state_2"]);

  assert.equal(draft.key, "state_3");
  assert.equal(draft.definition.name, "Review Notes");
  assert.equal(draft.definition.description, "");
  assert.equal(draft.definition.type, "text");
  assert.equal(draft.definition.value, "");
  assert.ok(defaultStateColorValues.includes(draft.definition.color));
});

test("createStateDraftFromQuery uses the neutral state key as the default display name when the query is blank", () => {
  const draft = createStateDraftFromQuery("   ", ["state_1", "state_2"]);

  assert.equal(draft.key, "state_3");
  assert.equal(draft.definition.name, "state_3");
  assert.equal(draft.definition.description, "");
  assert.equal(draft.definition.type, "text");
  assert.equal(draft.definition.value, "");
  assert.ok(defaultStateColorValues.includes(draft.definition.color));
});

test("createStateDraftFromQuery keeps Chinese names while using neutral machine keys", () => {
  const draft = createStateDraftFromQuery("最终答案", []);

  assert.equal(draft.key, "state_1");
  assert.equal(draft.definition.name, "最终答案");
  assert.equal(draft.definition.description, "");
  assert.equal(draft.definition.type, "text");
  assert.equal(draft.definition.value, "");
  assert.ok(defaultStateColorValues.includes(draft.definition.color));
  assert.equal(createStateDraftFromQuery("最终答案", ["state_1"]).key, "state_2");
  assert.equal(createStateDraftFromQuery("用户问题", ["state_1", "state_2"]).key, "state_3");
});
