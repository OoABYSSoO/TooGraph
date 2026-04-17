"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, SubtleCard } from "@/components/ui/card";
import { InfoBlock } from "@/components/ui/info-block";
import { RichContent, formatRichContentValue } from "@/components/ui/rich-content";
import { apiGet } from "@/lib/api";
import { useLanguage } from "@/components/providers/language-provider";
import type { ExportedOutput, NodeSystemRunDetail } from "@/lib/node-system-schema";
import {
  buildCycleVisualization,
  describeCycleStopReason,
  formatCycleStopReason,
} from "@/lib/run-cycle-visualization";

type RunDetail = NodeSystemRunDetail;

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
          if (payload.status === "queued" || payload.status === "running" || payload.status === "resuming") {
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

  const cycleVisualization = buildCycleVisualization(run);
  const cycleStopReasonDescription = describeCycleStopReason(cycleVisualization.summary?.stop_reason);

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

      {cycleVisualization.hasCycle ? (
        <Card className="col-span-8 max-[960px]:col-span-1">
          <h2 className="mb-2.5">Cycle Summary</h2>
          <div className="flex flex-wrap gap-2.5">
            <Badge>{cycleVisualization.summary?.iteration_count ?? cycleVisualization.iterations.length} iterations</Badge>
            <Badge>max {cycleVisualization.summary?.max_iterations === -1 ? "unlimited" : (cycleVisualization.summary?.max_iterations ?? 0)}</Badge>
            {cycleVisualization.summary?.stop_reason ? <Badge>{formatCycleStopReason(cycleVisualization.summary.stop_reason)}</Badge> : null}
            {cycleVisualization.backEdges.map((edge) => (
              <Badge key={edge}>{edge}</Badge>
            ))}
          </div>
          {cycleVisualization.backEdges.length > 0 ? (
            <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Back edges mark the links that keep the graph inside the loop.
            </div>
          ) : null}
          {cycleStopReasonDescription ? (
            <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{cycleStopReasonDescription}</div>
          ) : null}
        </Card>
      ) : null}

      {cycleVisualization.hasCycle && cycleVisualization.iterations.length > 0 ? (
        <Card className="col-span-12">
          <h2 className="mb-2.5">Cycle Iterations</h2>
          <div className="grid gap-3">
            {cycleVisualization.iterations.map((iteration) => (
              <SubtleCard key={iteration.iteration}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <strong>Iteration {iteration.iteration}</strong>
                  <Badge>{iteration.executedNodeIds.length} nodes</Badge>
                  <Badge>{iteration.activatedEdgeIds.length} edges</Badge>
                  {iteration.stopReason ? <Badge>{formatCycleStopReason(iteration.stopReason)}</Badge> : null}
                </div>
                <div className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
                  <div>
                    <span className="font-medium text-[var(--text)]">Executed</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {iteration.executedNodeIds.length > 0 ? iteration.executedNodeIds.map((nodeId) => <Badge key={nodeId}>{nodeId}</Badge>) : <span>None</span>}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-[var(--text)]">Activated edges</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {iteration.activatedEdgeIds.length > 0 ? iteration.activatedEdgeIds.map((edgeId) => <Badge key={edgeId}>{edgeId}</Badge>) : <span>None</span>}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-[var(--text)]">Incoming edges</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {iteration.incomingEdgeIds.length > 0 ? iteration.incomingEdgeIds.map((edgeId) => <Badge key={edgeId}>{edgeId}</Badge>) : <span>None</span>}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-[var(--text)]">Next iteration</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {iteration.nextIterationEdgeIds.length > 0 ? iteration.nextIterationEdgeIds.map((edgeId) => <Badge key={edgeId}>{edgeId}</Badge>) : <span>Loop exits here</span>}
                    </div>
                  </div>
                </div>
              </SubtleCard>
            ))}
          </div>
        </Card>
      ) : null}

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
                  <div key={`${output.node_id ?? output.source_key ?? "output"}-${index}`} className="rounded-[14px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.72)] p-3">
                    <div className="font-medium">{output.label ?? output.source_key ?? "Output"}</div>
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
          {run.node_executions.map((execution, index) => (
            <SubtleCard key={`${execution.node_id}-${execution.artifacts?.iteration ?? 1}-${index}`}>
              <strong>
                {execution.node_id} {"->"} {execution.status}
              </strong>
              <div className="text-[var(--muted)]">{execution.output_summary}</div>
              <div className="mt-2 flex flex-wrap gap-2.5">
                <Badge>{execution.duration_ms}ms</Badge>
                {execution.artifacts?.iteration ? <Badge>iteration {execution.artifacts.iteration}</Badge> : null}
                {execution.artifacts?.selected_branch ? <Badge>{execution.artifacts.selected_branch}</Badge> : null}
              </div>
            </SubtleCard>
          ))}
        </div>
      </Card>
    </section>
  );
}
