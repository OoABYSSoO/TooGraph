import test from "node:test";
import assert from "node:assert/strict";

import { isEditableKeyboardEventTarget } from "./canvasKeyboard.ts";

test("isEditableKeyboardEventTarget recognizes native editable controls", () => {
  const textInput = { tagName: "INPUT" } as HTMLElement;
  const textarea = { tagName: "TEXTAREA" } as HTMLElement;
  const select = { tagName: "SELECT" } as HTMLElement;

  assert.equal(isEditableKeyboardEventTarget(textInput), true);
  assert.equal(isEditableKeyboardEventTarget(textarea), true);
  assert.equal(isEditableKeyboardEventTarget(select), true);
});

test("isEditableKeyboardEventTarget recognizes contenteditable and Element Plus fields", () => {
  const contentEditable = {
    tagName: "DIV",
    isContentEditable: true,
    closest: () => null,
  } as unknown as HTMLElement;
  const elementPlusInput = {
    tagName: "SPAN",
    isContentEditable: false,
    closest: (selector: string) => (selector.includes(".el-input") ? {} : null),
  } as unknown as HTMLElement;

  assert.equal(isEditableKeyboardEventTarget(contentEditable), true);
  assert.equal(isEditableKeyboardEventTarget(elementPlusInput), true);
});

test("isEditableKeyboardEventTarget ignores non-editable canvas targets", () => {
  const target = {
    tagName: "DIV",
    isContentEditable: false,
    closest: () => null,
  } as unknown as HTMLElement;

  assert.equal(isEditableKeyboardEventTarget(target), false);
  assert.equal(isEditableKeyboardEventTarget(null), false);
});
