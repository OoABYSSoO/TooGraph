import type { EditorTabKind, EditorWorkspaceTab } from "@/lib/editor-workspace";
import { translate } from "../../i18n/index.ts";

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
  importPython: string;
  exportPython: string;
  run: string;
};

export function buildEditorTabBarCopy(): EditorTabBarCopy {
  return {
    newGraph: translate("tab.newGraph"),
    fromTemplate: translate("tab.fromTemplate"),
    openGraph: translate("tab.openGraph"),
    noTemplates: translate("tab.noTemplates"),
    noGraphs: translate("tab.noGraphs"),
    dirty: translate("tab.dirty"),
    state: translate("common.state"),
    save: translate("common.save"),
    validate: translate("editor.validateGraph"),
    importPython: translate("editor.importPythonGraph"),
    exportPython: translate("editor.exportPythonGraph"),
    run: translate("editor.runGraph"),
  };
}

export const ZH_EDITOR_TAB_BAR_COPY: EditorTabBarCopy = buildEditorTabBarCopy();

export function resolveEditorTabBadge(kind: EditorTabKind) {
  switch (kind) {
    case "subgraph":
      return "subgraph";
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
