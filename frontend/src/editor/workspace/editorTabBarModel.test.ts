import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditorTabHint,
  resolveEditorTabBarSelectPlaceholders,
  resolveEditorTabDropPlacement,
  ZH_EDITOR_TAB_BAR_COPY,
} from "./editorTabBarModel.ts";
import type { EditorWorkspaceTab } from "@/lib/editor-workspace";

function buildTab(overrides: Partial<EditorWorkspaceTab> = {}): EditorWorkspaceTab {
  return {
    tabId: "tab_1",
    kind: "new",
    graphId: null,
    title: "Untitled Graph",
    dirty: false,
    templateId: null,
    defaultTemplateId: null,
    ...overrides,
  };
}

test("buildEditorTabHint keeps legacy badge and unsaved cue", () => {
  assert.equal(buildEditorTabHint(buildTab({ kind: "template", dirty: true }), ZH_EDITOR_TAB_BAR_COPY), "template · 未保存");
  assert.equal(buildEditorTabHint(buildTab({ kind: "existing", dirty: false }), ZH_EDITOR_TAB_BAR_COPY), "graph");
});

test("resolveEditorTabBarSelectPlaceholders uses empty-state copy from legacy tab bar", () => {
  assert.deepEqual(
    resolveEditorTabBarSelectPlaceholders({
      templateCount: 0,
      graphCount: 2,
      copy: ZH_EDITOR_TAB_BAR_COPY,
    }),
    {
      template: "暂无模板",
      graph: "打开已有图",
    },
  );

  assert.deepEqual(
    resolveEditorTabBarSelectPlaceholders({
      templateCount: 1,
      graphCount: 0,
      copy: ZH_EDITOR_TAB_BAR_COPY,
    }),
    {
      template: "从模板创建",
      graph: "暂无已保存图",
    },
  );
});

test("resolveEditorTabDropPlacement splits the tab at its horizontal midpoint", () => {
  assert.equal(resolveEditorTabDropPlacement(120, 100, 80), "before");
  assert.equal(resolveEditorTabDropPlacement(160, 100, 80), "after");
});
