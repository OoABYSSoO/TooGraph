import type { CycleIterationRecord, CycleSummary, NodeSystemRunDetail } from "./node-system-schema.ts";

export type CycleIterationView = {
  iteration: number;
  executedNodeIds: string[];
  incomingEdgeIds: string[];
  activatedEdgeIds: string[];
  nextIterationEdgeIds: string[];
  stopReason: string | null;
};

export type CycleVisualization = {
  hasCycle: boolean;
  summary: CycleSummary | null;
  backEdges: string[];
  iterations: CycleIterationView[];
};

function normalizeCycleIteration(iteration: CycleIterationRecord): CycleIterationView {
  return {
    iteration: iteration.iteration,
    executedNodeIds: Array.isArray(iteration.executed_node_ids) ? iteration.executed_node_ids : [],
    incomingEdgeIds: Array.isArray(iteration.incoming_edge_ids) ? iteration.incoming_edge_ids : [],
    activatedEdgeIds: Array.isArray(iteration.activated_edge_ids) ? iteration.activated_edge_ids : [],
    nextIterationEdgeIds: Array.isArray(iteration.next_iteration_edge_ids) ? iteration.next_iteration_edge_ids : [],
    stopReason: iteration.stop_reason ?? null,
  };
}

function resolveCycleSummary(run: NodeSystemRunDetail): CycleSummary | null {
  if (run.cycle_summary?.has_cycle) {
    return run.cycle_summary;
  }
  if (run.artifacts.cycle_summary?.has_cycle) {
    return run.artifacts.cycle_summary;
  }
  return null;
}

export function buildCycleVisualization(run: NodeSystemRunDetail): CycleVisualization {
  const summary = resolveCycleSummary(run);
  const iterations = Array.isArray(run.artifacts.cycle_iterations)
    ? run.artifacts.cycle_iterations.map(normalizeCycleIteration)
    : [];

  return {
    hasCycle: Boolean(summary?.has_cycle),
    summary,
    backEdges: summary?.back_edges ?? [],
    iterations,
  };
}

export function formatCycleStopReason(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .split("_")
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part;
    })
    .join(" ");
}

export function describeCycleStopReason(value: string | null | undefined): string {
  switch (value) {
    case "empty_iteration":
      return "The loop scheduled another pass, but no node ran in that iteration.";
    case "no_state_change":
      return "The loop selected another back edge without changing any tracked state in that iteration.";
    case "max_iterations_exceeded":
      return "The loop hit the configured loopLimit for its controlling condition node.";
    case "completed":
      return "The loop exited through a non-back-edge path.";
    default:
      return "";
  }
}
