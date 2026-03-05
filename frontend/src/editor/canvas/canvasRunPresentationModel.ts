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

export function isCanvasNodeVisuallySelected(input: CanvasNodeVisualSelectionInput) {
  return input.selectedNodeId === input.nodeId || isHumanReviewRunNode(input);
}
