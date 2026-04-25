import { buildCycleVisualization } from "../../lib/run-cycle-visualization.ts";
import type { GraphValidationResponse } from "../../types/node-system.ts";
import type { RunDetail } from "../../types/run.ts";
import { translate } from "../../i18n/index.ts";

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
        message: translate("feedback.validationPassed"),
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
    ? translate("feedback.iterations", {
        count: cycleVisualization.summary.iteration_count,
        max: cycleVisualization.summary.max_iterations === -1
          ? translate("common.unlimited")
          : (cycleVisualization.summary.max_iterations || cycleVisualization.summary.iteration_count),
      })
    : "";

  if (run.status === "queued") {
    return {
      tone: "warning",
      message: translate("feedback.runQueued", { runId: run.run_id, pending: summary.idle, cycle: cycleSummaryText }),
      summary,
      currentNodeLabel,
    };
  }

  if (run.status === "running" || run.status === "resuming") {
    const currentLabelText = currentNodeLabel ? translate("feedback.runningNode", { node: currentNodeLabel }) : "";
    return {
      tone: "warning",
      message: translate("feedback.runProgress", {
        current: currentLabelText,
        done: summary.success,
        active: summary.running,
        pending: summary.idle,
        failed: summary.failed,
        cycle: cycleSummaryText,
      }),
      summary,
      currentNodeLabel,
    };
  }

  if (run.status === "failed") {
    const runErrors = run.errors?.filter(Boolean) ?? [];
    const baseText = currentNodeLabel
      ? translate("feedback.runFailedAt", { node: currentNodeLabel })
      : translate("feedback.runFailed", { runId: run.run_id });
    return {
      tone: "danger",
      message: `${runErrors.length > 0 ? `${baseText} ${runErrors.join("; ")}` : baseText}${cycleSummaryText}`,
      summary,
      currentNodeLabel,
    };
  }

  return {
    tone: "success",
    message: translate("feedback.runCompleted", { ok: summary.success, pending: summary.idle, failed: summary.failed, cycle: cycleSummaryText }),
    summary,
    currentNodeLabel,
  };
}
