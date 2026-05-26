import test from "node:test";
import assert from "node:assert/strict";

import { isEditableKeyboardEventTarget, resolveCanvasKeyboardShortcut } from "./canvasKeyboard.ts";

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

test("resolveCanvasKeyboardShortcut maps canvas edit commands", () => {
  const canvasTarget = {
    tagName: "DIV",
    isContentEditable: false,
    closest: () => null,
  } as unknown as HTMLElement;

  assert.equal(resolveCanvasKeyboardShortcut({ key: "c", ctrlKey: true, target: canvasTarget }), "copy");
  assert.equal(resolveCanvasKeyboardShortcut({ key: "v", metaKey: true, target: canvasTarget }), "paste");
  assert.equal(resolveCanvasKeyboardShortcut({ key: "z", ctrlKey: true, target: canvasTarget }), "undo");
  assert.equal(resolveCanvasKeyboardShortcut({ key: "Z", ctrlKey: true, shiftKey: true, target: canvasTarget }), "redo");
  assert.equal(resolveCanvasKeyboardShortcut({ key: "y", ctrlKey: true, target: canvasTarget }), "redo");
  assert.equal(resolveCanvasKeyboardShortcut({ key: "Delete", target: canvasTarget }), "delete-selection");
  assert.equal(resolveCanvasKeyboardShortcut({ key: "Backspace", target: canvasTarget }), "delete-selection");
});

test("resolveCanvasKeyboardShortcut leaves editable controls to the browser", () => {
  const textInput = { tagName: "INPUT" } as HTMLElement;

  assert.equal(resolveCanvasKeyboardShortcut({ key: "c", ctrlKey: true, target: textInput }), null);
  assert.equal(resolveCanvasKeyboardShortcut({ key: "Delete", target: textInput }), null);
});
