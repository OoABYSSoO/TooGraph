"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
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
  const { language } = useLanguage();
  const copy =
    language === "zh"
      ? {
          eyebrow: "Workspace",
          title: "从空白图、模板或已有图开始。",
          description: "这里不再是目录页，而是编排器真正的工作区。打开一个图后，它会以 tab 的形式留在顶部。",
          newGraph: "新建图",
          templates: "从模板创建",
          graphs: "打开已有图",
          emptyTemplates: "当前没有可用模板。",
          emptyGraphs: "当前没有已保存图。",
          open: "打开",
        }
      : {
          eyebrow: "Workspace",
          title: "Start from a blank graph, a template, or a saved graph.",
          description: "This is now the real editor workspace. Once opened, graphs stay in tabs across the top.",
          newGraph: "New Graph",
          templates: "From Template",
          graphs: "Open Saved Graph",
          emptyTemplates: "No templates available.",
          emptyGraphs: "No saved graphs yet.",
          open: "Open",
        };

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="grid w-full max-w-6xl gap-6">
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

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="rounded-[28px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--text)]">{copy.templates}</h2>
              <div className="text-sm text-[var(--muted)]">{templates.length}</div>
            </div>
            <div className="mt-4 grid gap-3">
              {templates.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.7)] px-5 py-8 text-sm text-[var(--muted)]">
                  {copy.emptyTemplates}
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.template_id}
                    className="rounded-[22px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.86)] p-4"
                  >
                    <div className="text-sm uppercase tracking-[0.08em] text-[var(--accent-strong)]">{template.template_id}</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--text)]">{template.label}</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{template.description}</p>
                    <div className="mt-4">
                      <Button size="sm" onClick={() => onCreateFromTemplate(template.template_id)}>
                        {copy.open}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--text)]">{copy.graphs}</h2>
              <div className="text-sm text-[var(--muted)]">{graphs.length}</div>
            </div>
            <div className="mt-4 grid gap-3">
              {graphs.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.7)] px-5 py-8 text-sm text-[var(--muted)]">
                  {copy.emptyGraphs}
                </div>
              ) : (
                graphs.map((graph) => (
                  <div
                    key={graph.graph_id}
                    className="rounded-[22px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.86)] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-[var(--text)]">{graph.name}</div>
                        <div className="truncate text-sm text-[var(--muted)]">{graph.graph_id}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm text-[var(--muted)]">
                        {graph.node_count} nodes / {graph.edge_count} edges
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button size="sm" onClick={() => onOpenGraph(graph.graph_id)}>
                        {copy.open}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
