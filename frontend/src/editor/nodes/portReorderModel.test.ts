import test from "node:test";
import assert from "node:assert/strict";

import {
  PORT_REORDER_DRAG_THRESHOLD,
  buildPortReorderFloatingStyle,
  buildPortReorderPreviewPorts,
  buildPortReorderSelector,
  resolvePortReorderInitialTargetIndex,
  resolvePortReorderSourceRectFromElement,
  resolvePortReorderTargetIndexFromElements,
  type PortReorderPointerState,
} from "./portReorderModel.ts";

type TestPort = {
  key: string;
  label: string;
  stateColor: string;
};

const ports: TestPort[] = [
  { key: "first", label: "First", stateColor: "#111111" },
  { key: "second", label: "Second", stateColor: "#222222" },
  { key: "third", label: "Third", stateColor: "#333333" },
];

function pointerState(overrides: Partial<PortReorderPointerState> = {}): PortReorderPointerState {
  return {
    side: "input",
    stateKey: "second",
    pointerId: 7,
    startClientX: 10,
    startClientY: 20,
    currentClientX: 10,
    currentClientY: 80,
    pointerOffsetY: 12,
    sourceRect: {
      left: 100,
      top: 40,
      width: 140,
      height: 28,
    },
    active: true,
    targetIndex: 0,
    ...overrides,
  };
}

function targetElement(stateKey: string, top: number, height = 20) {
  return {
    dataset: { portReorderStateKey: stateKey },
    getBoundingClientRect: () => ({ top, height }),
  };
}

test("port reorder keeps the existing drag activation threshold", () => {
  assert.equal(PORT_REORDER_DRAG_THRESHOLD, 6);
});

test("buildPortReorderPreviewPorts returns the original list when no matching active reorder exists", () => {
  assert.equal(buildPortReorderPreviewPorts("input", ports, null), ports);
  assert.equal(buildPortReorderPreviewPorts("input", ports, pointerState({ side: "output" })), ports);
  assert.equal(buildPortReorderPreviewPorts("input", ports, pointerState({ active: false })), ports);
});

test("buildPortReorderPreviewPorts moves the dragged port to the preview target index", () => {
  assert.deepEqual(
    buildPortReorderPreviewPorts("input", ports, pointerState({ stateKey: "second", targetIndex: 0 })).map((port) => port.key),
    ["second", "first", "third"],
  );
  assert.deepEqual(
    buildPortReorderPreviewPorts("input", ports, pointerState({ stateKey: "first", targetIndex: 2 })).map((port) => port.key),
    ["second", "third", "first"],
  );
  assert.deepEqual(
    buildPortReorderPreviewPorts("input", ports, pointerState({ stateKey: "second", targetIndex: 99 })).map((port) => port.key),
    ["first", "third", "second"],
  );
});

test("resolvePortReorderTargetIndexFromElements sorts targets, excludes the source, and uses row midpoints", () => {
  const elements = [
    targetElement("third", 80),
    targetElement("first", 0),
    targetElement("second", 40),
  ];

  assert.equal(resolvePortReorderTargetIndexFromElements(elements, "first", 20), 0);
  assert.equal(resolvePortReorderTargetIndexFromElements(elements, "first", 55), 1);
  assert.equal(resolvePortReorderTargetIndexFromElements(elements, "first", 120), 2);
});

test("resolvePortReorderInitialTargetIndex returns the source index or null for missing ports", () => {
  assert.equal(resolvePortReorderInitialTargetIndex(ports, "first"), 0);
  assert.equal(resolvePortReorderInitialTargetIndex(ports, "third"), 2);
  assert.equal(resolvePortReorderInitialTargetIndex(ports, "missing"), null);
});

test("resolvePortReorderSourceRectFromElement stores the minimal floating pill geometry", () => {
  const rect = resolvePortReorderSourceRectFromElement({
    getBoundingClientRect: () => ({
      left: 12,
      top: 24,
      width: 48,
      height: 16,
    }),
  });

  assert.deepEqual(rect, {
    left: 12,
    top: 24,
    width: 48,
    height: 16,
  });
});

test("buildPortReorderFloatingStyle positions the floating pill from pointer offset and source size", () => {
  assert.deepEqual(buildPortReorderFloatingStyle(pointerState(), "#c96b1f"), {
    "--node-card-port-accent": "#c96b1f",
    left: "100px",
    top: "68px",
    width: "140px",
    height: "28px",
  });
});

test("buildPortReorderSelector escapes node ids before querying reorder targets", () => {
  assert.equal(
    buildPortReorderSelector('node"one\\two', "output", (value) => `escaped(${value})`),
    '[data-port-reorder-node-id="escaped(node"one\\two)"][data-port-reorder-side="output"][data-port-reorder-state-key]',
  );
});
