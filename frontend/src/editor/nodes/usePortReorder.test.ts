import test from "node:test";
import assert from "node:assert/strict";

import { usePortReorder } from "./usePortReorder.ts";

type TestPort = {
  key: string;
  label: string;
  stateColor: string;
};

const inputPorts: TestPort[] = [
  { key: "first", label: "First", stateColor: "#111111" },
  { key: "second", label: "Second", stateColor: "#222222" },
  { key: "third", label: "Third", stateColor: "#333333" },
];

const outputPorts: TestPort[] = [
  { key: "out-one", label: "Out One", stateColor: "#aa0000" },
];

test("usePortReorder owns pointer activation, target resolution, commit, and suppressed clicks", () => {
  const windowTarget = createWindowTarget();
  const documentTarget = createDocumentTarget([
    targetElement("third", 80),
    targetElement("first", 0),
    targetElement("second", 40),
  ]);
  const activations: string[] = [];
  const reorders: Array<{ nodeId: string; side: "input" | "output"; stateKey: string; targetIndex: number }> = [];
  const pillClicks: Array<{ anchorId: string; stateKey: string | null | undefined }> = [];
  const controller = usePortReorder<TestPort>({
    getNodeId: () => "agent-1",
    getPorts: (side) => (side === "input" ? inputPorts : outputPorts),
    guardLockedInteraction: () => false,
    onActivateReorder: () => {
      activations.push("activate");
    },
    onPortPillClick: (anchorId, stateKey) => {
      pillClicks.push({ anchorId, stateKey });
    },
    onReorder: (payload) => {
      reorders.push(payload);
    },
    documentTarget,
    windowTarget,
  });

  controller.handlePortReorderPointerDown("input", "second", pointerEvent({
    clientY: 52,
    currentTarget: sourceElement({ left: 100, top: 40, width: 140, height: 28 }),
  }));

  assert.equal(controller.portReorderPointerState.value?.active, false);
  assert.equal(controller.portReorderPointerState.value?.targetIndex, 1);
  assert.deepEqual(windowTarget.calls, [
    ["remove", "pointermove"],
    ["remove", "pointerup"],
    ["remove", "pointercancel"],
    ["add", "pointermove"],
    ["add", "pointerup"],
    ["add", "pointercancel"],
  ]);

  const smallMove = pointerEvent({ clientX: 12, clientY: 55 });
  controller.handlePortReorderPointerMove(smallMove);

  assert.equal(smallMove.wasPrevented(), false);
  assert.equal(controller.portReorderPointerState.value?.active, false);

  const activeMove = pointerEvent({ clientX: 14, clientY: 72 });
  controller.handlePortReorderPointerMove(activeMove);

  assert.equal(activeMove.wasPrevented(), true);
  assert.deepEqual(activations, ["activate"]);
  assert.equal(controller.portReorderPointerState.value?.active, true);
  assert.equal(controller.portReorderPointerState.value?.targetIndex, 1);
  assert.deepEqual(
    controller.orderedInputPorts.value.map((port) => port.key),
    ["first", "second", "third"],
  );
  assert.deepEqual(controller.portReorderFloatingStyle.value, {
    "--node-card-port-accent": "#222222",
    left: "100px",
    top: "60px",
    width: "140px",
    height: "28px",
  });

  const pointerUp = pointerEvent({ clientY: 120 });
  controller.handlePortReorderPointerUp(pointerUp);

  assert.equal(pointerUp.wasPrevented(), true);
  assert.equal(controller.portReorderPointerState.value, null);
  assert.deepEqual(reorders, [
    { nodeId: "agent-1", side: "input", stateKey: "second", targetIndex: 2 },
  ]);
  assert.deepEqual(windowTarget.calls.slice(6), [
    ["remove", "pointermove"],
    ["remove", "pointerup"],
    ["remove", "pointercancel"],
  ]);

  controller.handlePortStatePillClick("agent-input:second", "second");
  assert.deepEqual(pillClicks, []);

  windowTarget.runNextTimeout();
  controller.handlePortStatePillClick("agent-input:second", "second");

  assert.deepEqual(pillClicks, [{ anchorId: "agent-input:second", stateKey: "second" }]);
});

test("usePortReorder ignores locked, non-left, and missing-source pointer starts", () => {
  const controller = usePortReorder<TestPort>({
    getNodeId: () => "agent-1",
    getPorts: () => inputPorts,
    guardLockedInteraction: () => true,
    onActivateReorder: () => undefined,
    onPortPillClick: () => undefined,
    onReorder: () => undefined,
    documentTarget: createDocumentTarget([]),
    windowTarget: createWindowTarget(),
  });

  controller.handlePortReorderPointerDown("input", "first", pointerEvent({
    currentTarget: sourceElement({ left: 0, top: 0, width: 10, height: 10 }),
  }));

  assert.equal(controller.portReorderPointerState.value, null);

  const unlockedController = usePortReorder<TestPort>({
    getNodeId: () => "agent-1",
    getPorts: () => inputPorts,
    guardLockedInteraction: () => false,
    onActivateReorder: () => undefined,
    onPortPillClick: () => undefined,
    onReorder: () => undefined,
    documentTarget: createDocumentTarget([]),
    windowTarget: createWindowTarget(),
  });

  unlockedController.handlePortReorderPointerDown("input", "first", pointerEvent({ button: 2 }));
  unlockedController.handlePortReorderPointerDown("input", "missing", pointerEvent({
    currentTarget: sourceElement({ left: 0, top: 0, width: 10, height: 10 }),
  }));

  assert.equal(unlockedController.portReorderPointerState.value, null);
});

function pointerEvent(overrides: Partial<PointerEvent> = {}) {
  let prevented = false;
  return {
    button: 0,
    pointerId: 7,
    clientX: 10,
    clientY: 20,
    currentTarget: null,
    preventDefault: () => {
      prevented = true;
    },
    wasPrevented: () => prevented,
    ...overrides,
  } as PointerEvent & { wasPrevented: () => boolean };
}

function sourceElement(rect: { left: number; top: number; width: number; height: number }) {
  return {
    addEventListener: () => undefined,
    dispatchEvent: () => true,
    getBoundingClientRect: () => rect,
    removeEventListener: () => undefined,
  };
}

function targetElement(stateKey: string, top: number, height = 20) {
  return {
    dataset: { portReorderStateKey: stateKey },
    getBoundingClientRect: () => ({ top, height }),
  };
}

function createDocumentTarget(elements: ReturnType<typeof targetElement>[]) {
  return {
    querySelectorAll: () => elements,
  };
}

function createWindowTarget() {
  const calls: Array<["add" | "remove", string]> = [];
  const timeouts: Array<() => void> = [];
  return {
    calls,
    addEventListener(type: string) {
      calls.push(["add", type]);
    },
    removeEventListener(type: string) {
      calls.push(["remove", type]);
    },
    setTimeout(callback: () => void) {
      timeouts.push(callback);
      return timeouts.length;
    },
    runNextTimeout() {
      const callback = timeouts.shift();
      assert.ok(callback, "expected a scheduled timeout");
      callback();
    },
  };
}
