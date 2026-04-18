import { buildCycleVisualization } from "../../lib/run-cycle-visualization.ts";
import type { GraphValidationResponse } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";

export type RunNodeSummary = {
  idle: number;
  running: number;
  paused: number;
  success: number;
  failed: number;
};

export type WorkspaceFeedbackTone = "neutral" | "success" | "warning" | "danger";

export type RunFeedback = {
  tone: WorkspaceFeedbackTone;
  message: string;
  summary: RunNodeSummary;
  currentNodeLabel: string | null;
};

export function summarizeRunNodeStates(nodeIds: string[], nodeStatusMap: Record<string, string>): RunNodeSummary {
  return nodeIds.reduce<RunNodeSummary>(
    (counts, nodeId) => {
      const status = nodeStatusMap[nodeId] ?? "idle";
      if (status === "running" || status === "resuming") {
        counts.running += 1;
      } else if (status === "paused") {
        counts.paused += 1;
      } else if (status === "success" || status === "completed") {
        counts.success += 1;
      } else if (status === "failed") {
        counts.failed += 1;
      } else {
        counts.idle += 1;
      }
      return counts;
    },
    {
      idle: 0,
      running: 0,
      paused: 0,
      success: 0,
      failed: 0,
    },
  );
}

export function formatValidationFeedback(response: GraphValidationResponse): Pick<RunFeedback, "tone" | "message"> {
  return response.valid
    ? {
        tone: "success",
        message: "Validation passed.",
      }
    : {
        tone: "danger",
        message: response.issues.map((issue) => issue.message).join("; "),
      };
}

export function formatRunFeedback(
  run: RunDetail,
  input: {
    nodeIds: string[];
    nodeLabelLookup: Record<string, string>;
  },
): RunFeedback {
  const summary = summarizeRunNodeStates(input.nodeIds, run.node_status_map ?? {});
  const currentNodeLabel = run.current_node_id ? input.nodeLabelLookup[run.current_node_id] ?? run.current_node_id : null;
  const cycleVisualization = buildCycleVisualization(run);
  const cycleSummaryText = cycleVisualization.summary?.has_cycle
    ? ` Iterations ${cycleVisualization.summary.iteration_count}/${cycleVisualization.summary.max_iterations === -1 ? "unlimited" : (cycleVisualization.summary.max_iterations || cycleVisualization.summary.iteration_count)}.`
    : "";

  if (run.status === "queued") {
    return {
      tone: "warning",
      message: `Run ${run.run_id} queued. Pending ${summary.idle} nodes.${cycleSummaryText}`,
      summary,
      currentNodeLabel,
    };
  }

  if (run.status === "running" || run.status === "resuming") {
    const currentLabelText = currentNodeLabel ? `Running ${currentNodeLabel}. ` : "";
    return {
      tone: "warning",
      message: `${currentLabelText}Done ${summary.success} · Active ${summary.running} · Pending ${summary.idle} · Failed ${summary.failed}.${cycleSummaryText}`,
      summary,
      currentNodeLabel,
    };
  }

  if (run.status === "failed") {
    const runErrors = run.errors?.filter(Boolean) ?? [];
    const baseText = currentNodeLabel ? `Run failed at ${currentNodeLabel}.` : `Run ${run.run_id} failed.`;
    return {
      tone: "danger",
      message: `${runErrors.length > 0 ? `${baseText} ${runErrors.join("; ")}` : baseText}${cycleSummaryText}`,
      summary,
      currentNodeLabel,
    };
  }

  return {
    tone: "success",
    message: `Run completed. OK ${summary.success} · Pending ${summary.idle} · Failed ${summary.failed}.${cycleSummaryText}`,
    summary,
    currentNodeLabel,
  };
}
