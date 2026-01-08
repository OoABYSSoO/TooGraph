"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubtleCard } from "@/components/ui/card";
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
      return <SubtleCard>Loading runs...</SubtleCard>;
    }
    if (error) {
      return <SubtleCard>{t("common.failed")}: {error}</SubtleCard>;
    }
    if (runs.length === 0) {
      return <SubtleCard>{t("common.no_data")}</SubtleCard>;
    }
    return runs.map((run) => (
      <Link className="block" key={run.run_id} href={`/runs/${run.run_id}`}>
        <SubtleCard>
        <strong>{run.run_id}</strong>
        <div className="text-[var(--muted)]">{run.graph_name}</div>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <Badge>{run.status}</Badge>
          <Badge>revisions {run.revision_round}</Badge>
          {run.duration_ms ? <Badge>duration {run.duration_ms}ms</Badge> : null}
          {run.final_score ? <Badge>score {run.final_score}</Badge> : null}
        </div>
        </SubtleCard>
      </Link>
    ));
  }, [error, loading, runs]);

  return (
    <div className="grid gap-3">
      <SubtleCard>
        <div className="grid gap-4">
          <div className="grid gap-2 text-[0.94rem]">
          <span>{t("runs.search")}</span>
          <Input value={graphNameQuery} onChange={(event) => setGraphNameQuery(event.target.value)} />
          </div>
          <div className="grid gap-2 text-[0.94rem]">
          <span>{t("runs.filter")}</span>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">all</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </Select>
          </div>
        </div>
      </SubtleCard>
      {content}
    </div>
  );
}
