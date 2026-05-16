import test from "node:test";
import assert from "node:assert/strict";

import {
  TEXT_TRIGGER_MOVE_THRESHOLD,
  buildTextEditorDrafts,
  createTextTriggerPointerState,
  isTextEditorConfirmOpenState,
  isTextEditorOpenState,
  resolveTextEditorDraftValue,
  resolveTextEditorMetadataPatch,
  resolveTextEditorTitle,
  resolveTextEditorWidth,
  shouldActivateTextEditorFromPointerUp,
  updateTextTriggerPointerMoveState,
} from "./textEditorModel.ts";

test("text editor model keeps the established field chrome values", () => {
  assert.equal(resolveTextEditorWidth("title"), 360);
  assert.equal(resolveTextEditorWidth("description"), 420);
  assert.equal(resolveTextEditorTitle("title"), "Edit Name");
  assert.equal(resolveTextEditorTitle("description"), "Edit Description");
  assert.equal(TEXT_TRIGGER_MOVE_THRESHOLD, 3);
});

test("text editor model reads draft values by field", () => {
  const drafts = buildTextEditorDrafts({ name: "Draft title", description: "Draft body" });

  assert.equal(resolveTextEditorDraftValue(drafts, "title"), "Draft title");
  assert.equal(resolveTextEditorDraftValue(drafts, "description"), "Draft body");
});

test("text editor model treats generic node default text as placeholder-only", () => {
  const drafts = buildTextEditorDrafts({
    kind: "input",
    name: "Input",
    description: "Provide a value to the current workflow.",
  });

  assert.equal(drafts.title, "");
  assert.equal(drafts.description, "");
  assert.deepEqual(
    resolveTextEditorMetadataPatch("title", "", {
      kind: "input",
      name: "Input",
      description: "Provide a value to the current workflow.",
    }),
    { name: "" },
  );
  assert.deepEqual(
    resolveTextEditorMetadataPatch("description", "", {
      kind: "input",
      name: "Input",
      description: "Provide a value to the current workflow.",
    }),
    { description: "" },
  );
});

test("text editor open state helpers match the active field exactly", () => {
  assert.equal(isTextEditorOpenState("title", "title"), true);
  assert.equal(isTextEditorOpenState("description", "title"), false);
  assert.equal(isTextEditorOpenState(null, "description"), false);
  assert.equal(isTextEditorConfirmOpenState("description", "description"), true);
  assert.equal(isTextEditorConfirmOpenState("title", "description"), false);
});

test("text trigger pointer movement activates only below the drag threshold", () => {
  const pointerState = createTextTriggerPointerState("title", 17, 100, 200);

  assert.deepEqual(pointerState, {
    field: "title",
    pointerId: 17,
    startClientX: 100,
    startClientY: 200,
    moved: false,
  });
  assert.equal(shouldActivateTextEditorFromPointerUp(pointerState, "title", 17, 102, 203), true);
  assert.equal(shouldActivateTextEditorFromPointerUp(pointerState, "title", 17, 104, 200), false);
  assert.equal(shouldActivateTextEditorFromPointerUp({ ...pointerState, moved: true }, "title", 17, 100, 200), false);
  assert.equal(shouldActivateTextEditorFromPointerUp(pointerState, "description", 17, 100, 200), false);
  assert.equal(shouldActivateTextEditorFromPointerUp(pointerState, "title", 18, 100, 200), false);
});

test("text trigger pointer move state records movement after crossing the threshold", () => {
  const pointerState = createTextTriggerPointerState("description", 22, 10, 10);

  assert.equal(updateTextTriggerPointerMoveState(pointerState, "description", 22, 13, 10).moved, false);
  assert.equal(updateTextTriggerPointerMoveState(pointerState, "description", 22, 14, 10).moved, true);
  assert.equal(updateTextTriggerPointerMoveState(pointerState, "title", 22, 40, 10), pointerState);
  assert.equal(updateTextTriggerPointerMoveState(pointerState, "description", 23, 40, 10), pointerState);
});

test("resolveTextEditorMetadataPatch preserves title and description commit behavior", () => {
  assert.deepEqual(
    resolveTextEditorMetadataPatch("title", "  Next name  ", { name: "Old name", description: "Old description" }),
    { name: "Next name" },
  );
  assert.equal(
    resolveTextEditorMetadataPatch("title", "   ", { name: "Old name", description: "Old description" }),
    null,
  );
  assert.equal(
    resolveTextEditorMetadataPatch("title", "Old name", { name: "Old name", description: "Old description" }),
    null,
  );
  assert.deepEqual(
    resolveTextEditorMetadataPatch("description", "  Next description  ", { name: "Old name", description: "Old description" }),
    { description: "Next description" },
  );
  assert.deepEqual(
    resolveTextEditorMetadataPatch("description", "   ", { name: "Old name", description: "Old description" }),
    { description: "" },
  );
  assert.equal(
    resolveTextEditorMetadataPatch("description", "Old description", { name: "Old name", description: "Old description" }),
    null,
  );
});
