"use client";

import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getEditorWelcomeStateContentClass,
  getEditorWelcomeStateViewportClass,
} from "@/lib/editor-welcome-layout";
import {
  EDITOR_WELCOME_SEARCH_DEBOUNCE_MS,
  getEditorWelcomeCardClass,
  getEditorWelcomeCardGridClass,
  filterWelcomeGraphs,
  filterWelcomeTemplates,
  getEditorWelcomePanelBodyClass,
  getEditorWelcomePanelClass,
  getEditorWelcomeTemplateDescriptionClass,
} from "@/lib/editor-welcome-search";
import type { CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";

type EditorWelcomeStateProps = {
  templates: CanonicalTemplateRecord[];
  graphs: GraphSummary[];
  onCreateNew: () => void;
  onCreateFromTemplate: (templateId: string) => void;
  onOpenGraph: (graphId: string) => void;
};

export function EditorWelcomeState({
  templates,
  graphs,
  onCreateNew,
  onCreateFromTemplate,
  onOpenGraph,
}: EditorWelcomeStateProps) {
  const [templateQuery, setTemplateQuery] = useState("");
  const [graphQuery, setGraphQuery] = useState("");
  const [debouncedTemplateQuery, setDebouncedTemplateQuery] = useState("");
  const [debouncedGraphQuery, setDebouncedGraphQuery] = useState("");
  const { language } = useLanguage();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedTemplateQuery(templateQuery);
    }, EDITOR_WELCOME_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [templateQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedGraphQuery(graphQuery);
    }, EDITOR_WELCOME_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [graphQuery]);

  const copy =
    language === "zh"
      ? {
          eyebrow: "Workspace",
          title: "从空白图、模板或已有图开始。",
          description: "这里不再是目录页，而是编排器真正的工作区。打开一个图后，它会以 tab 的形式留在顶部。",
          newGraph: "新建图",
          templates: "从模板创建",
          graphs: "打开已有图",
          templateSearchPlaceholder: "搜索模板名、描述或 template_id",
          graphSearchPlaceholder: "搜索图名或 graph_id",
          emptyTemplates: "当前没有可用模板。",
          emptyTemplateResults: "没有匹配的模板结果。",
          emptyGraphs: "当前没有已保存图。",
          emptyGraphResults: "没有匹配的图结果。",
          open: "打开",
        }
      : {
          eyebrow: "Workspace",
          title: "Start from a blank graph, a template, or a saved graph.",
          description: "This is now the real editor workspace. Once opened, graphs stay in tabs across the top.",
          newGraph: "New Graph",
          templates: "From Template",
          graphs: "Open Saved Graph",
          templateSearchPlaceholder: "Search template name, description, or template_id",
          graphSearchPlaceholder: "Search graph name or graph_id",
          emptyTemplates: "No templates available.",
          emptyTemplateResults: "No templates match this search.",
          emptyGraphs: "No saved graphs yet.",
          emptyGraphResults: "No graphs match this search.",
          open: "Open",
        };

  const filteredTemplates = useMemo(
    () => filterWelcomeTemplates(templates, debouncedTemplateQuery),
    [debouncedTemplateQuery, templates],
  );
  const filteredGraphs = useMemo(
    () => filterWelcomeGraphs(graphs, debouncedGraphQuery),
    [debouncedGraphQuery, graphs],
  );

  const templateCountLabel = debouncedTemplateQuery ? `${filteredTemplates.length} / ${templates.length}` : `${templates.length}`;
  const graphCountLabel = debouncedGraphQuery ? `${filteredGraphs.length} / ${graphs.length}` : `${graphs.length}`;

  return (
    <div className={getEditorWelcomeStateViewportClass()}>
      <div className={getEditorWelcomeStateContentClass()}>
        <section className="rounded-[32px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] p-8 shadow-[0_20px_60px_var(--shadow)]">
          <div className="grid gap-3">
            <span className="text-sm uppercase tracking-[0.12em] text-[var(--accent-strong)]">{copy.eyebrow}</span>
            <h1 className="text-4xl font-semibold text-[var(--text)]">{copy.title}</h1>
            <p className="max-w-3xl text-[0.98rem] leading-7 text-[var(--muted)]">{copy.description}</p>
          </div>
          <div className="mt-6">
            <Button onClick={onCreateNew}>{copy.newGraph}</Button>
          </div>
        </section>

        <section className="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className={getEditorWelcomePanelClass()}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-[var(--text)]">{copy.templates}</h2>
                <div className="text-sm text-[var(--muted)]">{templateCountLabel}</div>
              </div>
              <div className="mt-4">
                <Input
                  value={templateQuery}
                  onChange={(event) => setTemplateQuery(event.target.value)}
                  placeholder={copy.templateSearchPlaceholder}
                  aria-label={copy.templateSearchPlaceholder}
                />
              </div>
              <div className={getEditorWelcomePanelBodyClass()}>
                <div className={getEditorWelcomeCardGridClass()}>
                  {templates.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.7)] px-5 py-8 text-sm text-[var(--muted)] md:col-span-2">
                      {copy.emptyTemplates}
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.7)] px-5 py-8 text-sm text-[var(--muted)] md:col-span-2">
                      {copy.emptyTemplateResults}
                    </div>
                  ) : (
                    filteredTemplates.map((template) => (
                      <div key={template.template_id} className={getEditorWelcomeCardClass()}>
                        <div className="text-sm uppercase tracking-[0.08em] text-[var(--accent-strong)]">{template.template_id}</div>
                        <div className="mt-1 line-clamp-2 text-lg font-semibold leading-7 text-[var(--text)]">{template.label}</div>
                        <p className={getEditorWelcomeTemplateDescriptionClass()}>{template.description}</p>
                        <div className="mt-auto pt-4">
                          <Button size="sm" onClick={() => onCreateFromTemplate(template.template_id)}>
                            {copy.open}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={getEditorWelcomePanelClass()}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-[var(--text)]">{copy.graphs}</h2>
                <div className="text-sm text-[var(--muted)]">{graphCountLabel}</div>
              </div>
              <div className="mt-4">
                <Input
                  value={graphQuery}
                  onChange={(event) => setGraphQuery(event.target.value)}
                  placeholder={copy.graphSearchPlaceholder}
                  aria-label={copy.graphSearchPlaceholder}
                />
              </div>
              <div className={getEditorWelcomePanelBodyClass()}>
                <div className={getEditorWelcomeCardGridClass()}>
                  {graphs.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.7)] px-5 py-8 text-sm text-[var(--muted)] md:col-span-2">
                      {copy.emptyGraphs}
                    </div>
                  ) : filteredGraphs.length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.7)] px-5 py-8 text-sm text-[var(--muted)] md:col-span-2">
                      {copy.emptyGraphResults}
                    </div>
                  ) : (
                    filteredGraphs.map((graph) => (
                      <div key={graph.graph_id} className={getEditorWelcomeCardClass()}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate text-lg font-semibold text-[var(--text)]">{graph.name}</div>
                            <div className="truncate text-sm text-[var(--muted)]">{graph.graph_id}</div>
                          </div>
                          <div className="shrink-0 text-right text-sm text-[var(--muted)]">
                            {graph.node_count} nodes / {graph.edge_count} edges
                          </div>
                        </div>
                        <div className="mt-auto pt-4">
                          <Button size="sm" onClick={() => onOpenGraph(graph.graph_id)}>
                            {copy.open}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
