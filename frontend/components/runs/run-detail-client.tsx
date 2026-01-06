"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";

type RunDetail = {
  run_id: string;
  graph_name: string;
  status: string;
  current_node_id?: string | null;
  revision_round: number;
  final_result?: string | null;
  final_score?: number | null;
  knowledge_summary?: string;
  memory_summary?: string;
  artifacts: Record<string, unknown>;
  node_executions: Array<{
    node_id: string;
    status: string;
    output_summary: string;
    duration_ms: number;
  }>;
};

export function RunDetailClient({ runId }: { runId: string }) {
  const { t } = useLanguage();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRun() {
      try {
        const payload = await apiGet<RunDetail>(`/api/runs/${runId}`);
        if (!cancelled) {
          setRun(payload);
          setError(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load run detail.");
        }
      }
    }
    loadRun();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) {
    return <div className="card">{t("common.failed")}: {error}</div>;
  }

  if (!run) {
    return <div className="card">{t("common.loading")}</div>;
  }

  return (
    <section className="grid">
      <article className="card span-4">
        <h2>{t("run_detail.status")}</h2>
        <div className="status-row">
          <span className="pill">{run.status}</span>
          <span className="pill">
            {t("run_detail.current_node")} {run.current_node_id ?? t("run_detail.completed")}
          </span>
          <span className="pill">
            {t("run_detail.revisions")} {run.revision_round}
          </span>
          {run.final_score ? (
            <span className="pill">
              {t("run_detail.score")} {run.final_score}
            </span>
          ) : null}
        </div>
      </article>

      <article className="card span-8">
        <h2>{t("run_detail.artifacts")}</h2>
        <div className="list">
          <div className="list-item">
            <strong>{t("run_detail.knowledge")}</strong>
            <div className="muted">{run.knowledge_summary || t("run_detail.no_knowledge")}</div>
          </div>
          <div className="list-item">
            <strong>{t("run_detail.memory")}</strong>
            <div className="muted">{run.memory_summary || t("run_detail.no_memory")}</div>
          </div>
          <div className="list-item">
            <strong>{t("run_detail.final_result")}</strong>
            <div className="muted">{run.final_result || t("run_detail.no_result")}</div>
          </div>
        </div>
      </article>

      <article className="card span-12">
        <h2>{t("run_detail.timeline")}</h2>
        <div className="list">
          {run.node_executions.map((execution) => (
            <div className="list-item" key={execution.node_id}>
              <strong>
                {execution.node_id} {"->"} {execution.status}
              </strong>
              <div className="muted">{execution.output_summary}</div>
              <div className="status-row">
                <span className="pill">{execution.duration_ms}ms</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
