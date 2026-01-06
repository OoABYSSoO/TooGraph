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

  useEffect(() => {
    let cancelled = false;
    async function loadRuns() {
      try {
        const payload = await apiGet<RunSummary[]>("/api/runs");
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
  }, []);

  const content = useMemo(() => {
    if (loading) {
      return <div className="list-item">Loading runs...</div>;
    }
    if (error) {
      return <div className="list-item">{t("common.failed")}: {error}</div>;
    }
    if (runs.length === 0) {
      return <div className="list-item">{t("common.no_data")}</div>;
    }
    return runs.map((run) => (
      <Link className="list-item" key={run.run_id} href={`/runs/${run.run_id}`}>
        <strong>{run.run_id}</strong>
        <div className="muted">{run.graph_name}</div>
        <div className="status-row">
          <span className="pill">{run.status}</span>
          <span className="pill">revisions {run.revision_round}</span>
          {run.duration_ms ? <span className="pill">duration {run.duration_ms}ms</span> : null}
          {run.final_score ? <span className="pill">score {run.final_score}</span> : null}
        </div>
      </Link>
    ));
  }, [error, loading, runs]);

  return <div className="list">{content}</div>;
}
