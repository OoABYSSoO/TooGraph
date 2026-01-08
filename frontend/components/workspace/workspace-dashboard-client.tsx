"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, SubtleCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type GraphSummary = {
  graph_id: string;
  name: string;
  nodes: Array<unknown>;
  edges: Array<unknown>;
};

type RunSummary = {
  run_id: string;
  graph_name: string;
  status: string;
  revision_round: number;
};

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
          apiGet<GraphSummary[]>("/api/graphs"),
          apiGet<RunSummary[]>("/api/runs"),
        ]);
        if (!cancelled) {
          setGraphs(graphPayload);
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

  const runningCount = useMemo(() => runs.filter((run) => run.status === "running").length, [runs]);
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
        description="Saved workflow definitions available from backend storage."
      />
      <MetricCard
        className="col-span-4 max-[960px]:col-span-1"
        label={t("common.running_jobs")}
        value={runningCount}
        description="Live workflow runs currently moving through runtime."
      />
      <MetricCard
        className="col-span-4 max-[960px]:col-span-1"
        label={t("common.failed_runs")}
        value={failedCount}
        description="Runs that need inspection or another validation pass."
      />

      <Card className="col-span-6 max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("common.recent_graphs")}</h2>
        <div className="grid gap-3">
          {graphs.length === 0 ? (
            <EmptyState>{t("common.no_data")}</EmptyState>
          ) : (
            graphs.slice(0, 6).map((graph) => (
              <Link className="block" href={`/editor/${graph.graph_id}`} key={graph.graph_id}>
                <SubtleCard>
                <strong>{graph.name}</strong>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  <Badge>nodes {graph.nodes.length}</Badge>
                  <Badge>edges {graph.edges.length}</Badge>
                </div>
                </SubtleCard>
              </Link>
            ))
          )}
        </div>
      </Card>

      <Card className="col-span-6 max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("common.recent_runs")}</h2>
        <div className="grid gap-3">
          {runs.length === 0 ? (
            <EmptyState>{t("common.no_data")}</EmptyState>
          ) : (
            runs.slice(0, 6).map((run) => (
              <Link className="block" href={`/runs/${run.run_id}`} key={run.run_id}>
                <SubtleCard>
                <strong>{run.run_id}</strong>
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
        <h2 className="mb-2.5">{t("common.quick_actions")}</h2>
        <div className="mt-[22px] flex flex-wrap gap-3">
          <Link className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-[var(--accent)] px-[18px] py-3 text-white transition-transform duration-150 hover:-translate-y-px" href="/editor/creative-factory">
            Create Graph
          </Link>
          <Link className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" href="/runs">
            View Run History
          </Link>
          <Link className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" href="/knowledge">
            Open Knowledge
          </Link>
        </div>
      </Card>
    </section>
  );
}
