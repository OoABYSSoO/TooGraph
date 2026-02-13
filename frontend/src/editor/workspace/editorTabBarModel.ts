import type { EditorTabKind, EditorWorkspaceTab } from "@/lib/editor-workspace";

export type EditorTabBarCopy = {
  newGraph: string;
  fromTemplate: string;
  openGraph: string;
  noTemplates: string;
  noGraphs: string;
  dirty: string;
  state: string;
  save: string;
  validate: string;
  exportPython: string;
  run: string;
};

export const ZH_EDITOR_TAB_BAR_COPY: EditorTabBarCopy = {
  newGraph: "新建图",
  fromTemplate: "从模板创建",
  openGraph: "打开已有图",
  noTemplates: "暂无模板",
  noGraphs: "暂无已保存图",
  dirty: "未保存",
  state: "State",
  save: "Save",
  validate: "Validate",
  exportPython: "导出 Py",
  run: "Run",
};

export function resolveEditorTabBadge(kind: EditorTabKind) {
  switch (kind) {
    case "template":
      return "template";
    case "existing":
      return "graph";
    case "new":
    default:
      return "draft";
  }
}

export function buildEditorTabHint(tab: Pick<EditorWorkspaceTab, "kind" | "dirty">, copy: EditorTabBarCopy) {
  return [resolveEditorTabBadge(tab.kind), tab.dirty ? copy.dirty : null].filter(Boolean).join(" · ");
}

export function resolveEditorTabBarSelectPlaceholders(input: {
  templateCount: number;
  graphCount: number;
  copy: EditorTabBarCopy;
}) {
  return {
    template: input.templateCount === 0 ? input.copy.noTemplates : input.copy.fromTemplate,
    graph: input.graphCount === 0 ? input.copy.noGraphs : input.copy.openGraph,
  };
}

export function resolveEditorTabDropPlacement(pointerClientX: number, tabLeft: number, tabWidth: number): "before" | "after" {
  const midpoint = tabLeft + tabWidth / 2;
  return pointerClientX < midpoint ? "before" : "after";
}
