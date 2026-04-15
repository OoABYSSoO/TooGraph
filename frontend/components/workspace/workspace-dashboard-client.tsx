"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, SubtleCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";
import type { CanonicalGraphPayload } from "@/lib/node-system-canonical";
import type { GraphSummary, RunSummary } from "@/lib/types";

export function WorkspaceDashboardClient() {
  const { t } = useLanguage();
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        const [graphPayload, runPayload] = await Promise.all([
          apiGet<CanonicalGraphPayload[]>("/api/graphs"),
          apiGet<RunSummary[]>("/api/runs"),
        ]);
        if (!cancelled) {
          setGraphs(
            graphPayload.map((graph) => {
              return {
                graph_id: graph.graph_id ?? "",
                name: graph.name,
                node_count: Object.keys(graph.nodes).length,
                edge_count: graph.edges.length + graph.conditional_edges.reduce((count, entry) => count + Object.keys(entry.branches).length, 0),
              } satisfies GraphSummary;
            }),
          );
          setRuns(runPayload);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load workspace data.");
        }
      }
    }
    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const runningCount = useMemo(() => runs.filter((run) => run.status === "running" || run.status === "resuming").length, [runs]);
  const failedCount = useMemo(() => runs.filter((run) => run.status === "failed").length, [runs]);

  if (error) {
    return <Card>{t("common.failed")}: {error}</Card>;
  }

  return (
    <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
      <MetricCard
        className="col-span-4 max-[960px]:col-span-1"
        label={t("common.recent_graphs")}
        value={graphs.length}
        description={t("workspace.graphs_desc")}
      />
      <MetricCard
        className="col-span-4 max-[960px]:col-span-1"
        label={t("common.running_jobs")}
        value={runningCount}
        description={t("workspace.runs_desc")}
      />
      <MetricCard
        className="col-span-4 max-[960px]:col-span-1"
        label={t("common.failed_runs")}
        value={failedCount}
        description={t("workspace.actions_desc")}
      />

      <Card className="col-span-6 max-[960px]:col-span-1">
        <div className="mb-4">
          <h2 className="mb-2.5">{t("common.recent_graphs")}</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">{t("workspace.graphs_desc")}</p>
        </div>
        <div className="grid gap-3">
          {graphs.length === 0 ? (
            <EmptyState>{t("common.no_data")}</EmptyState>
          ) : (
            graphs.slice(0, 6).map((graph) => (
              <Link className="block cursor-pointer" href={`/editor/${graph.graph_id}`} key={graph.graph_id}>
                <SubtleCard className="transition-all duration-200 ease-out hover:-translate-y-px hover:border-[rgba(154,52,18,0.28)] hover:bg-[rgba(255,255,255,0.82)]">
                <div className="flex items-start justify-between gap-3">
                  <strong>{graph.name}</strong>
                  <span className="text-xs uppercase tracking-[0.08em] text-[var(--accent-strong)]">{t("common.open_detail")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  <Badge>nodes {graph.node_count}</Badge>
                  <Badge>edges {graph.edge_count}</Badge>
                </div>
                </SubtleCard>
              </Link>
            ))
          )}
        </div>
      </Card>

      <Card className="col-span-6 max-[960px]:col-span-1">
        <div className="mb-4">
          <h2 className="mb-2.5">{t("common.recent_runs")}</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">{t("workspace.runs_desc")}</p>
        </div>
        <div className="grid gap-3">
          {runs.length === 0 ? (
            <EmptyState>{t("common.no_data")}</EmptyState>
          ) : (
            runs.slice(0, 6).map((run) => (
              <Link className="block cursor-pointer" href={`/runs/${run.run_id}`} key={run.run_id}>
                <SubtleCard className="transition-all duration-200 ease-out hover:-translate-y-px hover:border-[rgba(154,52,18,0.28)] hover:bg-[rgba(255,255,255,0.82)]">
                <div className="flex items-start justify-between gap-3">
                  <strong>{run.run_id}</strong>
                  <span className="text-xs uppercase tracking-[0.08em] text-[var(--accent-strong)]">{t("common.open_detail")}</span>
                </div>
                <div className="text-[var(--muted)]">{run.graph_name}</div>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  <Badge>{run.status}</Badge>
                  <Badge>revisions {run.revision_round}</Badge>
                </div>
                </SubtleCard>
              </Link>
            ))
          )}
        </div>
      </Card>

      <Card className="col-span-12">
        <div className="mb-4">
          <h2 className="mb-2.5">{t("common.quick_actions")}</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">{t("workspace.actions_desc")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link className="block cursor-pointer" href="/editor/new">
            <SubtleCard className="h-full transition-all duration-200 ease-out hover:-translate-y-px hover:border-[rgba(154,52,18,0.28)] hover:bg-[rgba(255,255,255,0.82)]">
              <strong>{t("workspace.create_graph")}</strong>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("home.editor_desc")}</p>
            </SubtleCard>
          </Link>
          <Link className="block cursor-pointer" href="/editor">
            <SubtleCard className="h-full transition-all duration-200 ease-out hover:-translate-y-px hover:border-[rgba(154,52,18,0.28)] hover:bg-[rgba(255,255,255,0.82)]">
              <strong>{t("workspace.open_editor")}</strong>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("home.workspace_desc")}</p>
            </SubtleCard>
          </Link>
          <Link className="block cursor-pointer" href="/runs">
            <SubtleCard className="h-full transition-all duration-200 ease-out hover:-translate-y-px hover:border-[rgba(154,52,18,0.28)] hover:bg-[rgba(255,255,255,0.82)]">
              <strong>{t("workspace.view_runs")}</strong>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("home.runtime_desc")}</p>
            </SubtleCard>
          </Link>
          <Link className="block cursor-pointer" href="/knowledge">
            <SubtleCard className="h-full transition-all duration-200 ease-out hover:-translate-y-px hover:border-[rgba(154,52,18,0.28)] hover:bg-[rgba(255,255,255,0.82)]">
              <strong>{t("workspace.open_knowledge")}</strong>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("knowledge.desc")}</p>
            </SubtleCard>
          </Link>
        </div>
      </Card>
    </section>
  );
}
