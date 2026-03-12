import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasViewport } from "../canvas/canvasViewport.ts";
import type { EditorWorkspaceTab } from "../../lib/editor-workspace.ts";

import { buildNextCanvasViewportDrafts, listTabsMissingViewportDrafts } from "./editorDraftPersistenceModel.ts";

const viewportA: CanvasViewport = { x: 10, y: 20, scale: 1.25 };
const viewportB: CanvasViewport = { x: -30, y: 40, scale: 0.8 };

function createTab(tabId: string): EditorWorkspaceTab {
  return {
    tabId,
    kind: "new",
    graphId: null,
    title: tabId,
    dirty: false,
    templateId: null,
    defaultTemplateId: null,
  };
}

test("listTabsMissingViewportDrafts returns workspace tab ids without loaded viewport drafts", () => {
  assert.deepEqual(
    listTabsMissingViewportDrafts([createTab("tab_a"), createTab("tab_b"), createTab("tab_c")], {
      tab_b: viewportB,
    }),
    ["tab_a", "tab_c"],
  );
});

test("buildNextCanvasViewportDrafts skips identical viewport updates", () => {
  const current = { tab_a: viewportA };

  assert.equal(buildNextCanvasViewportDrafts(current, "tab_a", { ...viewportA }), null);
});

test("buildNextCanvasViewportDrafts writes changed viewport drafts immutably", () => {
  const current = { tab_a: viewportA };
  const next = buildNextCanvasViewportDrafts(current, "tab_a", viewportB);

  assert.deepEqual(next, { tab_a: viewportB });
  assert.notEqual(next, current);
  assert.deepEqual(current, { tab_a: viewportA });
});

test("buildNextCanvasViewportDrafts adds missing viewport drafts immutably", () => {
  const current = { tab_a: viewportA };
  const next = buildNextCanvasViewportDrafts(current, "tab_b", viewportB);

  assert.deepEqual(next, { tab_a: viewportA, tab_b: viewportB });
  assert.notEqual(next, current);
});
