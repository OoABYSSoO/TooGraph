import test from "node:test";
import assert from "node:assert/strict";

import { useNodeFloatingPanels } from "./useNodeFloatingPanels.ts";

test("node floating panels keep top action confirm windows separate from advanced panel state", () => {
  const scheduler = createManualTimeoutScheduler();
  const controller = useNodeFloatingPanels({
    isFloatingPanelOpen: () => false,
    closeFloatingPanels: () => undefined,
    timeoutScheduler: scheduler,
  });

  controller.startTopActionConfirmWindow("delete");

  assert.equal(controller.activeTopAction.value, "delete");

  scheduler.runNext();

  assert.equal(controller.activeTopAction.value, null);

  controller.activeTopAction.value = "advanced";
  controller.clearTopActionConfirmState();

  assert.equal(controller.activeTopAction.value, "advanced");

  controller.startTopActionConfirmWindow("preset");
  controller.clearTopActionConfirmState();

  assert.equal(controller.activeTopAction.value, null);
});

test("node floating panels close outside interactions and wire document listeners", () => {
  const closeRequests: Array<{ commitTextEditor?: boolean } | undefined> = [];
  const documentTarget = createDocumentTarget();
  const controller = useNodeFloatingPanels({
    isFloatingPanelOpen: () => true,
    closeFloatingPanels: (options) => {
      closeRequests.push(options);
    },
    documentTarget,
    timeoutScheduler: createManualTimeoutScheduler(),
  });

  controller.handleGlobalFloatingPanelPointerDown({ target: null } as PointerEvent);
  controller.handleGlobalFloatingPanelFocusIn({ target: null } as FocusEvent);
  controller.handleGlobalFloatingPanelKeyDown({ key: "Enter" } as KeyboardEvent);
  controller.handleGlobalFloatingPanelKeyDown({ key: "Escape" } as KeyboardEvent);

  assert.deepEqual(closeRequests, [
    { commitTextEditor: true },
    { commitTextEditor: true },
    { commitTextEditor: false },
  ]);

  controller.addGlobalFloatingPanelListeners();
  controller.removeGlobalFloatingPanelListeners();

  assert.deepEqual(documentTarget.calls, [
    ["add", "pointerdown"],
    ["add", "focusin"],
    ["add", "keydown"],
    ["remove", "pointerdown"],
    ["remove", "focusin"],
    ["remove", "keydown"],
  ]);
});

function createManualTimeoutScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  return {
    setTimeout(callback: () => void) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout(id: unknown) {
      callbacks.delete(Number(id));
    },
    runNext() {
      const nextEntry = callbacks.entries().next();
      assert.equal(nextEntry.done, false, "expected a scheduled timeout");
      if (nextEntry.done) {
        return;
      }
      const [id, callback] = nextEntry.value;
      callbacks.delete(id);
      callback();
    },
  };
}

function createDocumentTarget() {
  const calls: Array<["add" | "remove", string]> = [];
  return {
    calls,
    addEventListener(type: string) {
      calls.push(["add", type]);
    },
    removeEventListener(type: string) {
      calls.push(["remove", type]);
    },
  };
}
