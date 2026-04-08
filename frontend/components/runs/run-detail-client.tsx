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
    return <div className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">{t("common.failed")}: {error}</div>;
  }

  if (!run) {
    return <div className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">{t("common.loading")}</div>;
  }

  return (
    <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
      <article className="col-span-4 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("run_detail.status")}</h2>
        <div className="flex flex-wrap gap-2.5">
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{run.status}</span>
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">
            {t("run_detail.current_node")} {run.current_node_id ?? t("run_detail.completed")}
          </span>
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">
            {t("run_detail.revisions")} {run.revision_round}
          </span>
          {run.final_score ? (
            <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">
              {t("run_detail.score")} {run.final_score}
            </span>
          ) : null}
        </div>
      </article>

      <article className="col-span-8 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)] max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("run_detail.artifacts")}</h2>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
            <strong>{t("run_detail.knowledge")}</strong>
            <div className="text-[var(--muted)]">{run.knowledge_summary || t("run_detail.no_knowledge")}</div>
          </div>
          <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
            <strong>{t("run_detail.memory")}</strong>
            <div className="text-[var(--muted)]">{run.memory_summary || t("run_detail.no_memory")}</div>
          </div>
          <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
            <strong>{t("run_detail.final_result")}</strong>
            <div className="text-[var(--muted)]">{run.final_result || t("run_detail.no_result")}</div>
          </div>
        </div>
      </article>

      <article className="col-span-12 rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-5 shadow-[0_10px_30px_var(--shadow)]">
        <h2 className="mb-2.5">{t("run_detail.timeline")}</h2>
        <div className="grid gap-3">
          {run.node_executions.map((execution) => (
            <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5" key={execution.node_id}>
              <strong>
                {execution.node_id} {"->"} {execution.status}
              </strong>
              <div className="text-[var(--muted)]">{execution.output_summary}</div>
              <div className="mt-2 flex flex-wrap gap-2.5">
                <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{execution.duration_ms}ms</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
