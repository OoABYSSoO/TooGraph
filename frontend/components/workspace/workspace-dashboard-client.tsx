"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
    return <section className="card">{t("common.failed")}: {error}</section>;
  }

  return (
    <section className="grid">
      <article className="card span-4">
        <div className="muted">Recent Graphs</div>
        <div className="muted">{t("common.recent_graphs")}</div>
        <div className="kpi">{graphs.length}</div>
        <p className="muted">Saved workflow definitions available from backend storage.</p>
      </article>
      <article className="card span-4">
        <div className="muted">{t("common.running_jobs")}</div>
        <div className="kpi">{runningCount}</div>
        <p className="muted">Live workflow runs currently moving through runtime.</p>
      </article>
      <article className="card span-4">
        <div className="muted">{t("common.failed_runs")}</div>
        <div className="kpi">{failedCount}</div>
        <p className="muted">Runs that need inspection or another validation pass.</p>
      </article>

      <article className="card span-6">
        <h2>{t("common.recent_graphs")}</h2>
        <div className="list">
          {graphs.length === 0 ? (
            <div className="list-item">{t("common.no_data")}</div>
          ) : (
            graphs.slice(0, 6).map((graph) => (
              <Link className="list-item" href={`/editor/${graph.graph_id}`} key={graph.graph_id}>
                <strong>{graph.name}</strong>
                <div className="status-row">
                  <span className="pill">nodes {graph.nodes.length}</span>
                  <span className="pill">edges {graph.edges.length}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </article>

      <article className="card span-6">
        <h2>{t("common.recent_runs")}</h2>
        <div className="list">
          {runs.length === 0 ? (
            <div className="list-item">{t("common.no_data")}</div>
          ) : (
            runs.slice(0, 6).map((run) => (
              <Link className="list-item" href={`/runs/${run.run_id}`} key={run.run_id}>
                <strong>{run.run_id}</strong>
                <div className="muted">{run.graph_name}</div>
                <div className="status-row">
                  <span className="pill">{run.status}</span>
                  <span className="pill">revisions {run.revision_round}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </article>

      <article className="card span-12">
        <h2>{t("common.quick_actions")}</h2>
        <div className="actions">
          <Link className="button" href="/editor/creative-factory">
            Create Graph
          </Link>
          <Link className="button secondary" href="/runs">
            View Run History
          </Link>
          <Link className="button secondary" href="/knowledge">
            Open Knowledge
          </Link>
        </div>
      </article>
    </section>
  );
}
