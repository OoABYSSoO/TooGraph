import assert from "node:assert/strict";
import test from "node:test";

import {
  getFlowHandlePlacement,
  getNodeHandleRailPresentation,
  getNodeTitleFlowOverlayPresentation,
  getNodePortSectionPresentation,
} from "./node-system-node-card-presentation.ts";

test("condition nodes present reads and branches as distinct visual sections", () => {
  assert.deepEqual(getNodePortSectionPresentation("condition"), {
    inputTitle: null,
    outputTitle: null,
    inputActionLabel: "input",
    outputActionLabel: "branch",
    outputVariant: "branch",
  });
});

test("agent nodes keep state-style read and write presentation", () => {
  assert.deepEqual(getNodePortSectionPresentation("agent"), {
    inputTitle: null,
    outputTitle: null,
    inputActionLabel: "input",
    outputActionLabel: "output",
    outputVariant: "state",
  });
});

test("ordinary nodes place flow handles on the title row while condition keeps its custom routing layout", () => {
  assert.deepEqual(getFlowHandlePlacement("input"), {
    showFlowInput: false,
    showFlowOutput: true,
    placement: "title-row",
  });
  assert.deepEqual(getFlowHandlePlacement("agent"), {
    showFlowInput: true,
    showFlowOutput: true,
    placement: "title-row",
  });
  assert.deepEqual(getFlowHandlePlacement("output"), {
    showFlowInput: true,
    showFlowOutput: false,
    placement: "title-row",
  });
  assert.deepEqual(getFlowHandlePlacement("condition"), {
    showFlowInput: false,
    showFlowOutput: false,
    placement: "custom",
  });
});

test("ordinary nodes share one left/right rail system between title flow handles and body data handles", () => {
  assert.deepEqual(getNodeHandleRailPresentation(), {
    railWidthClass: "w-5",
    sharedGridClass: "grid grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center",
    leadingContentClass: "pl-2",
    trailingContentClass: "pr-2",
  });
});

test("title-row flow handles align to the same body column grid used by each ordinary node family", () => {
  assert.deepEqual(getNodeTitleFlowOverlayPresentation("agent"), {
    overlayGridClass: "grid grid-cols-2 items-center gap-x-6",
    inputCellClass: "justify-start",
    outputCellClass: "justify-end",
  });
  assert.deepEqual(getNodeTitleFlowOverlayPresentation("input"), {
    overlayGridClass: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3",
    inputCellClass: "justify-start",
    outputCellClass: "justify-end",
  });
  assert.deepEqual(getNodeTitleFlowOverlayPresentation("output"), {
    overlayGridClass: "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3",
    inputCellClass: "justify-start",
    outputCellClass: "justify-end",
  });
  assert.equal(getNodeTitleFlowOverlayPresentation("condition"), null);
});
