"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SubtleCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";

type TemplateSummary = {
  template_id: string;
  label: string;
  description: string;
  default_theme_preset: string;
};

type GraphSummary = {
  graph_id: string;
  name: string;
  nodes: Array<unknown>;
  edges: Array<unknown>;
  template_id?: string;
};

export function EditorHomeClient() {
  const { language } = useLanguage();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [templatePayload, graphPayload] = await Promise.all([
          apiGet<TemplateSummary[]>("/api/templates"),
          apiGet<GraphSummary[]>("/api/graphs"),
        ]);
        if (!cancelled) {
          setTemplates(templatePayload);
          setGraphs(graphPayload);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load editor entry data.");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = language === "zh"
    ? {
        eyebrow: "编排器入口",
        title: "先选择图或模板，再进入画布。",
        desc: "编排器不再直接绑定某一张默认图。你可以从模板创建，也可以打开已有 graph。",
        blank: "新建空白图",
        blankDesc: "从空白画布开始，自行添加节点、状态和连线。",
        create: "从模板创建",
        recent: "最近的图",
        emptyGraphs: "还没有已保存的图。先从下面的模板创建一张。",
        open: "打开",
        useTemplate: "使用模板",
        nodes: "节点",
        edges: "连线",
      }
    : {
        eyebrow: "Editor Entry",
        title: "Choose a graph or template before opening the canvas.",
        desc: "The editor is no longer hard-wired to a single default graph. Start from a template or reopen a saved graph.",
        blank: "New Blank Graph",
        blankDesc: "Start from an empty canvas and add nodes, state, and edges yourself.",
        create: "Create from Template",
        recent: "Recent Graphs",
        emptyGraphs: "No saved graphs yet. Start with one of the templates below.",
        open: "Open",
        useTemplate: "Use Template",
        nodes: "nodes",
        edges: "edges",
      };

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,250,241,0.92),rgba(246,211,184,0.8))] p-7 shadow-[0_20px_60px_var(--shadow)]">
        <SectionHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.desc} />
      </section>

      {error ? <EmptyState>{error}</EmptyState> : null}

      <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
        <Card className="col-span-7 max-[960px]:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[1.1rem] font-semibold">{copy.create}</h2>
            <Link href="/editor/new">
              <Button variant="primary">{copy.blank}</Button>
            </Link>
          </div>
          <div className="grid gap-3">
            <SubtleCard className="grid gap-3 border-dashed">
              <div className="grid gap-1">
                <strong>{copy.blank}</strong>
                <span className="text-[var(--muted)]">{copy.blankDesc}</span>
              </div>
              <div>
                <Link href="/editor/new">
                  <Button variant="secondary">{copy.open}</Button>
                </Link>
              </div>
            </SubtleCard>
            {templates.map((template) => (
              <SubtleCard className="grid gap-3" key={template.template_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <strong>{template.label}</strong>
                    <span className="text-[var(--muted)]">{template.description}</span>
                  </div>
                  <Badge>{template.default_theme_preset}</Badge>
                </div>
                <div>
                  <Link href={`/editor/template-${template.template_id.replaceAll("_", "-")}`}>
                    <Button>{copy.useTemplate}</Button>
                  </Link>
                </div>
              </SubtleCard>
            ))}
          </div>
        </Card>

        <Card className="col-span-5 max-[960px]:col-span-1">
          <h2 className="mb-3 text-[1.1rem] font-semibold">{copy.recent}</h2>
          <div className="grid gap-3">
            {graphs.length === 0 ? (
              <EmptyState>{copy.emptyGraphs}</EmptyState>
            ) : (
              graphs.slice(0, 8).map((graph) => (
                <SubtleCard className="grid gap-3" key={graph.graph_id}>
                  <div className="grid gap-1">
                    <strong>{graph.name}</strong>
                    {graph.template_id ? <span className="text-[var(--muted)]">{graph.template_id}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{copy.nodes} {graph.nodes.length}</Badge>
                    <Badge>{copy.edges} {graph.edges.length}</Badge>
                  </div>
                  <div>
                    <Link href={`/editor/${graph.graph_id}`}>
                      <Button variant="primary">{copy.open}</Button>
                    </Link>
                  </div>
                </SubtleCard>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
