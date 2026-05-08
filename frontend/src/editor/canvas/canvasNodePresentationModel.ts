import type { GraphNode, GraphNodeSize, GraphPosition } from "../../types/node-system.ts";
import { normalizeNodeSize } from "./nodeResize.ts";

export type MeasuredNodeSize = {
  width: number;
  height: number;
};

export type MinimapNodeRunState = "running" | "paused" | "success" | "failed" | null;

export function buildNodeTransformStyle(position: GraphPosition) {
  return {
    transform: `translate(${position.x}px, ${position.y}px)`,
  };
}

export function buildNodeCardSizeStyle(node: Pick<GraphNode, "kind" | "ui">) {
  const size = normalizeNodeSize(node.ui.size) ?? resolveFallbackNodeSize(node);
  return {
    "--node-card-width": `${size.width}px`,
    "--node-card-min-height": `${size.height}px`,
  };
}

export function resolveFallbackNodeSize(node: Pick<GraphNode, "kind">): MeasuredNodeSize {
  if (node.kind === "condition") {
    return { width: 560, height: 280 };
  }
  if (node.kind === "output") {
    return { width: 460, height: 340 };
  }
  if (node.kind === "input") {
    return { width: 460, height: 320 };
  }
  return { width: 460, height: 360 };
}

export function resolveNodeRenderedSize(input: {
  nodeId: string;
  node: Pick<GraphNode, "kind" | "ui">;
  measuredNodeSizes: Record<string, MeasuredNodeSize>;
}): GraphNodeSize {
  return input.measuredNodeSizes[input.nodeId] ?? normalizeNodeSize(input.node.ui.size) ?? resolveFallbackNodeSize(input.node);
}

export function resolveMinimapRunState(status: string | undefined): MinimapNodeRunState {
  if (status === "running" || status === "resuming") {
    return "running";
  }
  if (status === "paused" || status === "awaiting_human") {
    return "paused";
  }
  if (status === "success" || status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "failed";
  }
  return null;
}

export function buildMinimapNodeModel(input: {
  nodeId: string;
  node: Pick<GraphNode, "kind" | "ui">;
  measuredNodeSizes: Record<string, MeasuredNodeSize>;
  isSelected: boolean;
  runStatus: string | undefined;
}) {
  const renderedSize = resolveNodeRenderedSize({
    nodeId: input.nodeId,
    node: input.node,
    measuredNodeSizes: input.measuredNodeSizes,
  });
  return {
    id: input.nodeId,
    kind: input.node.kind,
    x: input.node.ui.position.x,
    y: input.node.ui.position.y,
    width: renderedSize.width,
    height: renderedSize.height,
    selected: input.isSelected,
    runState: resolveMinimapRunState(input.runStatus),
  };
}
