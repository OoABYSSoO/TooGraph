"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, SubtleCard } from "@/components/ui/card";
import { InfoBlock } from "@/components/ui/info-block";
import { RichContent, formatRichContentValue } from "@/components/ui/rich-content";
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

type ExportedOutput = {
  node_id?: string;
  state_key?: string;
  label?: string;
  display_mode?: string;
  persist_enabled?: boolean;
  persist_format?: string;
  value?: unknown;
  saved_file?: {
    file_name?: string;
    format?: string;
    path?: string;
  } | null;
};

export function RunDetailClient({ runId }: { runId: string }) {
  const { t } = useLanguage();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    async function loadRun() {
      try {
        const payload = await apiGet<RunDetail>(`/api/runs/${runId}`);
        if (!cancelled) {
          setRun(payload);
          setError(null);
          if (payload.status === "queued" || payload.status === "running") {
            pollTimer = window.setTimeout(() => {
              void loadRun();
            }, 750);
          }
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
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
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
          <InfoBlock title={t("run_detail.knowledge")}>
            <RichContent text={run.knowledge_summary || ""} displayMode="auto" empty={t("run_detail.no_knowledge")} />
          </InfoBlock>
          <InfoBlock title={t("run_detail.memory")}>
            <RichContent text={run.memory_summary || ""} displayMode="auto" empty={t("run_detail.no_memory")} />
          </InfoBlock>
          <InfoBlock title={t("run_detail.final_result")}>
            <RichContent text={run.final_result || ""} displayMode="auto" empty={t("run_detail.no_result")} />
          </InfoBlock>
          {Array.isArray(run.artifacts.exported_outputs) && (run.artifacts.exported_outputs as ExportedOutput[]).length > 0 ? (
            <InfoBlock title="Output Boundaries">
              <div className="grid gap-3">
                {(run.artifacts.exported_outputs as ExportedOutput[]).map((output, index) => (
                  <div key={`${output.node_id ?? output.state_key ?? "output"}-${index}`} className="rounded-[14px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.72)] p-3">
                    <div className="font-medium">{output.label ?? output.state_key ?? "Output"}</div>
                    <div className="mt-2">
                      <RichContent text={formatRichContentValue(output.value)} displayMode={output.display_mode ?? "auto"} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2.5">
                      {output.display_mode ? <Badge>{output.display_mode}</Badge> : null}
                      {output.persist_enabled ? <Badge>persist {output.persist_format ?? "txt"}</Badge> : <Badge>preview only</Badge>}
                      {output.saved_file?.file_name ? <Badge>{output.saved_file.file_name}</Badge> : null}
                    </div>
                  </div>
                ))}
              </div>
            </InfoBlock>
          ) : null}
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
