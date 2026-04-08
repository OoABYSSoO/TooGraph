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
    return <section className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">{t("common.failed")}: {error}</section>;
  }

  return (
    <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
      <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <div className="text-[var(--muted)]">Recent Graphs</div>
        <div className="text-[var(--muted)]">{t("common.recent_graphs")}</div>
        <div className="my-2 mb-0 text-[2rem]">{graphs.length}</div>
        <p className="text-[var(--muted)]">Saved workflow definitions available from backend storage.</p>
      </article>
      <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <div className="text-[var(--muted)]">{t("common.running_jobs")}</div>
        <div className="my-2 mb-0 text-[2rem]">{runningCount}</div>
        <p className="text-[var(--muted)]">Live workflow runs currently moving through runtime.</p>
      </article>
      <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <div className="text-[var(--muted)]">{t("common.failed_runs")}</div>
        <div className="my-2 mb-0 text-[2rem]">{failedCount}</div>
        <p className="text-[var(--muted)]">Runs that need inspection or another validation pass.</p>
      </article>

      <article className="col-span-6 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("common.recent_graphs")}</h2>
        <div className="grid gap-3">
          {graphs.length === 0 ? (
            <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">{t("common.no_data")}</div>
          ) : (
            graphs.slice(0, 6).map((graph) => (
              <Link className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5" href={`/editor/${graph.graph_id}`} key={graph.graph_id}>
                <strong>{graph.name}</strong>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">nodes {graph.nodes.length}</span>
                  <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">edges {graph.edges.length}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </article>

      <article className="col-span-6 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("common.recent_runs")}</h2>
        <div className="grid gap-3">
          {runs.length === 0 ? (
            <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">{t("common.no_data")}</div>
          ) : (
            runs.slice(0, 6).map((run) => (
              <Link className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5" href={`/runs/${run.run_id}`} key={run.run_id}>
                <strong>{run.run_id}</strong>
                <div className="text-[var(--muted)]">{run.graph_name}</div>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{run.status}</span>
                  <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">revisions {run.revision_round}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </article>

      <article className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">
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
      </article>
    </section>
  );
}
