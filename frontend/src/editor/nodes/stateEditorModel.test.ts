import test from "node:test";
import assert from "node:assert/strict";

import type { StateDefinition } from "../../types/node-system.ts";
import {
  buildStateEditorDraftFromSchema,
  resolveStateEditorAnchorStateKey,
  resolveStateEditorUpdatePatch,
  updateStateEditorDraftColor,
  updateStateEditorDraftDescription,
  updateStateEditorDraftName,
  updateStateEditorDraftType,
} from "./stateEditorModel.ts";

const stateSchema: Record<string, StateDefinition> = {
  answer: {
    name: "Final Answer",
    description: "Shown to the user.",
    type: "text",
    value: "ready",
    color: "#2563eb",
  },
  score: {
    name: "Score",
    description: "",
    type: "number",
    value: 42,
    color: "",
  },
};

test("state editor model builds a draft from the current state schema entry", () => {
  const draft = buildStateEditorDraftFromSchema("answer", stateSchema);

  assert.deepEqual(draft, {
    key: "answer",
    definition: {
      name: "Final Answer",
      description: "Shown to the user.",
      type: "text",
      value: "ready",
      color: "#2563eb",
    },
  });
  assert.equal(buildStateEditorDraftFromSchema("missing", stateSchema), null);
});

test("state editor draft helpers immutably update editable metadata fields", () => {
  const draft = buildStateEditorDraftFromSchema("answer", stateSchema);
  assert.ok(draft);

  const renamed = updateStateEditorDraftName(draft, "Renamed Answer");
  const described = updateStateEditorDraftDescription(renamed, "A better description.");
  const colored = updateStateEditorDraftColor(described, "#10b981");

  assert.notEqual(renamed, draft);
  assert.notEqual(renamed.definition, draft.definition);
  assert.equal(draft.definition.name, "Final Answer");
  assert.equal(renamed.definition.name, "Renamed Answer");
  assert.equal(described.definition.description, "A better description.");
  assert.equal(colored.definition.color, "#10b981");
});

test("state editor type helper resets the draft value for the selected type", () => {
  const draft = buildStateEditorDraftFromSchema("answer", stateSchema);
  assert.ok(draft);

  const updated = updateStateEditorDraftType(draft, "number");

  assert.equal(updated.definition.type, "number");
  assert.equal(updated.definition.value, 0);
});

test("state editor update patch trims display names and falls back to the current key", () => {
  const draft = buildStateEditorDraftFromSchema("answer", stateSchema);
  assert.ok(draft);

  assert.deepEqual(resolveStateEditorUpdatePatch(updateStateEditorDraftName(draft, "  Reviewed Answer  "), "answer"), {
    name: "Reviewed Answer",
    description: "Shown to the user.",
    type: "text",
    value: "ready",
    color: "#2563eb",
  });
  assert.deepEqual(resolveStateEditorUpdatePatch(updateStateEditorDraftName(draft, "   "), "answer"), {
    name: "answer",
    description: "Shown to the user.",
    type: "text",
    value: "ready",
    color: "#2563eb",
  });
});

test("state editor anchor helper resolves the bound state key from port anchors", () => {
  assert.equal(resolveStateEditorAnchorStateKey("agent-node:state-in:answer"), "answer");
  assert.equal(resolveStateEditorAnchorStateKey("agent-node:state-out:score"), "score");
  assert.equal(resolveStateEditorAnchorStateKey(""), "");
});
