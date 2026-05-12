import { resolveNodeRunPresentation } from "./runNodePresentation.ts";

type CanvasRunPresentationInput = {
  nodeId: string;
  currentRunNodeId?: string | null;
  latestRunStatus?: string | null;
  runNodeStatusByNodeId?: Record<string, string>;
};

export type CanvasNodeVisualSelectionInput = Pick<CanvasRunPresentationInput, "nodeId" | "currentRunNodeId" | "latestRunStatus"> & {
  selectedNodeId?: string | null;
};

export type CanvasLockBannerClickAction =
  | { type: "locked-edit-attempt" }
  | { type: "open-human-review"; nodeId: string };

export function isHumanReviewRunNode(input: Pick<CanvasRunPresentationInput, "nodeId" | "currentRunNodeId" | "latestRunStatus">) {
  return input.latestRunStatus === "awaiting_human" && input.currentRunNodeId === input.nodeId;
}

export function resolveRunNodePresentationForCanvasNode(input: CanvasRunPresentationInput) {
  const status = isHumanReviewRunNode(input) ? "paused" : input.runNodeStatusByNodeId?.[input.nodeId];
  return resolveNodeRunPresentation(status, input.currentRunNodeId === input.nodeId);
}

export function resolveRunNodeClassListForCanvasNode(input: CanvasRunPresentationInput) {
  const presentation = resolveRunNodePresentationForCanvasNode(input);
  return presentation?.shellClass ? [presentation.shellClass] : [];
}

export function shouldShowRunNodeTiming(input: {
  timing?: { status?: string; durationMs?: number | null; startedAtMs?: number | null } | null;
}) {
  return Boolean(input.timing && ["running", "success", "failed", "paused"].includes(String(input.timing.status ?? "")));
}

export function isCanvasNodeVisuallySelected(input: CanvasNodeVisualSelectionInput) {
  return input.selectedNodeId === input.nodeId || isHumanReviewRunNode(input);
}

export function resolveLockBannerClickAction(input: {
  currentRunNodeId?: string | null;
}): CanvasLockBannerClickAction {
  if (!input.currentRunNodeId) {
    return { type: "locked-edit-attempt" };
  }

  return {
    type: "open-human-review",
    nodeId: input.currentRunNodeId,
  };
}
