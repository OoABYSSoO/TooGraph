"use client";

import { useState } from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { EditorWorkspaceTab } from "@/lib/editor-workspace";
import type { CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";

type EditorTabBarProps = {
  tabs: EditorWorkspaceTab[];
  activeTabId: string | null;
  templates: CanonicalTemplateRecord[];
  graphs: GraphSummary[];
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateNew: () => void;
  onCreateFromTemplate: (templateId: string) => void;
  onOpenGraph: (graphId: string) => void;
};

const WORKSPACE_SELECT_CLASS =
  "min-h-[44px] w-full appearance-none rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3.5 py-3 pr-10 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] outline-none transition focus:border-[rgba(154,52,18,0.28)] focus:bg-white";

function getTabBadge(tab: EditorWorkspaceTab) {
  switch (tab.kind) {
    case "template":
      return "template";
    case "existing":
      return "graph";
    case "new":
    default:
      return "draft";
  }
}

export function EditorTabBar({
  tabs,
  activeTabId,
  templates,
  graphs,
  onActivateTab,
  onCloseTab,
  onCreateNew,
  onCreateFromTemplate,
  onOpenGraph,
}: EditorTabBarProps) {
  const { language } = useLanguage();
  const [templateSelection, setTemplateSelection] = useState("");
  const [graphSelection, setGraphSelection] = useState("");
  const copy =
    language === "zh"
      ? {
          newGraph: "新建图",
          fromTemplate: "从模板创建",
          openGraph: "打开已有图",
          noTemplates: "暂无模板",
          noGraphs: "暂无已保存图",
          dirty: "未保存",
        }
      : {
          newGraph: "New Graph",
          fromTemplate: "From Template",
          openGraph: "Open Graph",
          noTemplates: "No templates",
          noGraphs: "No saved graphs",
          dirty: "Unsaved",
        };

  return (
    <div className="border-b border-[rgba(154,52,18,0.14)] bg-[rgba(255,250,241,0.9)] px-4 py-3 shadow-[0_12px_30px_rgba(154,52,18,0.06)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-2">
            {tabs.map((tab) => {
              const isActive = tab.tabId === activeTabId;
              return (
                <button
                  key={tab.tabId}
                  type="button"
                  onClick={() => onActivateTab(tab.tabId)}
                  className={cn(
                    "group inline-flex items-center gap-3 rounded-[18px] border px-4 py-2.5 text-left transition-all duration-150",
                    isActive
                      ? "border-[rgba(154,52,18,0.22)] bg-[rgba(255,255,255,0.92)] shadow-[0_10px_24px_rgba(154,52,18,0.08)]"
                      : "border-[rgba(154,52,18,0.1)] bg-[rgba(255,250,241,0.62)] hover:bg-[rgba(255,255,255,0.84)]",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text)]">
                      {tab.title}
                      {tab.dirty ? <span className="ml-2 text-[var(--accent-strong)]">*</span> : null}
                    </div>
                    <div className="text-[0.72rem] uppercase tracking-[0.08em] text-[var(--muted)]">
                      {getTabBadge(tab)}
                      {tab.dirty ? ` · ${copy.dirty}` : ""}
                    </div>
                  </div>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.tabId);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.72)] text-[var(--accent-strong)] transition-colors duration-150 hover:bg-white"
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onCreateNew}>
            {copy.newGraph}
          </Button>
          <label className="sr-only" htmlFor="editor-template-select">
            {copy.fromTemplate}
          </label>
          <div className="relative min-w-[180px]">
            <select
              id="editor-template-select"
              className={WORKSPACE_SELECT_CLASS}
              value={templateSelection}
              onChange={(event) => {
                const value = event.target.value;
                setTemplateSelection("");
                if (value) {
                  onCreateFromTemplate(value);
                }
              }}
            >
              <option value="">{templates.length === 0 ? copy.noTemplates : copy.fromTemplate}</option>
              {templates.map((template) => (
                <option key={template.template_id} value={template.template_id}>
                  {template.label}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 16 16"
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-[var(--muted)]"
              strokeWidth="1.5"
            >
              <path d="m4.5 6 3.5 4 3.5-4" />
            </svg>
          </div>
          <label className="sr-only" htmlFor="editor-graph-select">
            {copy.openGraph}
          </label>
          <div className="relative min-w-[200px]">
            <select
              id="editor-graph-select"
              className={WORKSPACE_SELECT_CLASS}
              value={graphSelection}
              onChange={(event) => {
                const value = event.target.value;
                setGraphSelection("");
                if (value) {
                  onOpenGraph(value);
                }
              }}
            >
              <option value="">{graphs.length === 0 ? copy.noGraphs : copy.openGraph}</option>
              {graphs.map((graph) => (
                <option key={graph.graph_id} value={graph.graph_id}>
                  {graph.name}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 16 16"
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-[var(--muted)]"
              strokeWidth="1.5"
            >
              <path d="m4.5 6 3.5 4 3.5-4" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
