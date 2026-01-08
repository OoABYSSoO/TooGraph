"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, SubtleCard } from "@/components/ui/card";
import { InfoBlock } from "@/components/ui/info-block";
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
    return <Card>{t("common.failed")}: {error}</Card>;
  }

  if (!run) {
    return <Card>{t("common.loading")}</Card>;
  }

  return (
    <section className="grid grid-cols-12 gap-[18px] max-[960px]:grid-cols-1">
      <Card className="col-span-4 max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("run_detail.status")}</h2>
        <div className="flex flex-wrap gap-2.5">
          <Badge>{run.status}</Badge>
          <Badge>
            {t("run_detail.current_node")} {run.current_node_id ?? t("run_detail.completed")}
          </Badge>
          <Badge>
            {t("run_detail.revisions")} {run.revision_round}
          </Badge>
          {run.final_score ? (
            <Badge>
              {t("run_detail.score")} {run.final_score}
            </Badge>
          ) : null}
        </div>
      </Card>

      <Card className="col-span-8 max-[960px]:col-span-1">
        <h2 className="mb-2.5">{t("run_detail.artifacts")}</h2>
        <div className="grid gap-3">
          <InfoBlock title={t("run_detail.knowledge")}>{run.knowledge_summary || t("run_detail.no_knowledge")}</InfoBlock>
          <InfoBlock title={t("run_detail.memory")}>{run.memory_summary || t("run_detail.no_memory")}</InfoBlock>
          <InfoBlock title={t("run_detail.final_result")}>{run.final_result || t("run_detail.no_result")}</InfoBlock>
        </div>
      </Card>

      <Card className="col-span-12">
        <h2 className="mb-2.5">{t("run_detail.timeline")}</h2>
        <div className="grid gap-3">
          {run.node_executions.map((execution) => (
            <SubtleCard key={execution.node_id}>
              <strong>
                {execution.node_id} {"->"} {execution.status}
              </strong>
              <div className="text-[var(--muted)]">{execution.output_summary}</div>
              <div className="mt-2 flex flex-wrap gap-2.5">
                <Badge>{execution.duration_ms}ms</Badge>
              </div>
            </SubtleCard>
          ))}
        </div>
      </Card>
    </section>
  );
}
