"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type RunSummary = {
  run_id: string;
  graph_id: string;
  graph_name: string;
  status: string;
  current_node_id?: string | null;
  revision_round: number;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  final_score?: number | null;
};

export function RunsListClient() {
  const { t } = useLanguage();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphNameQuery, setGraphNameQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadRuns() {
      try {
        const params = new URLSearchParams();
        if (graphNameQuery.trim()) params.set("graph_name", graphNameQuery.trim());
        if (statusFilter) params.set("status", statusFilter);
        const payload = await apiGet<RunSummary[]>(`/api/runs${params.toString() ? `?${params.toString()}` : ""}`);
        if (!cancelled) {
          setRuns(payload);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load runs.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadRuns();
    return () => {
      cancelled = true;
    };
  }, [graphNameQuery, statusFilter]);

  const content = useMemo(() => {
    if (loading) {
      return <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">Loading runs...</div>;
    }
    if (error) {
      return <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">{t("common.failed")}: {error}</div>;
    }
    if (runs.length === 0) {
      return <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">{t("common.no_data")}</div>;
    }
    return runs.map((run) => (
      <Link className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5" key={run.run_id} href={`/runs/${run.run_id}`}>
        <strong>{run.run_id}</strong>
        <div className="text-[var(--muted)]">{run.graph_name}</div>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{run.status}</span>
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">revisions {run.revision_round}</span>
          {run.duration_ms ? <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">duration {run.duration_ms}ms</span> : null}
          {run.final_score ? <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">score {run.final_score}</span> : null}
        </div>
      </Link>
    ));
  }, [error, loading, runs]);

  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
        <div className="grid gap-4">
          <div className="grid gap-2 text-[0.94rem]">
          <span>{t("runs.search")}</span>
          <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={graphNameQuery} onChange={(event) => setGraphNameQuery(event.target.value)} />
          </div>
          <div className="grid gap-2 text-[0.94rem]">
          <span>{t("runs.filter")}</span>
          <select className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">all</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
          </div>
        </div>
      </div>
      {content}
    </div>
  );
}
