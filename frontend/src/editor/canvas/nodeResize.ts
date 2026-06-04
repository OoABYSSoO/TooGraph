import type { GraphNode, GraphNodeSize, GraphPosition } from "@/types/node-system";

export const MIN_NODE_RESIZE_WIDTH = 320;
export const MIN_NODE_RESIZE_HEIGHT = 220;
export const MAX_NODE_RESIZE_WIDTH = 960;
export const MAX_NODE_RESIZE_HEIGHT = 760;

export const NODE_RESIZE_HANDLES = ["nw", "ne", "sw", "se"] as const;

export type NodeResizeHandle = (typeof NODE_RESIZE_HANDLES)[number];

export type NodeResizeResult = {
  position: GraphPosition;
  size: GraphNodeSize;
};

type ResizableNodeKind = GraphNode["kind"];

export function normalizeNodeSize(value: unknown, nodeKind?: ResizableNodeKind): GraphNodeSize | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<GraphNodeSize>;
  const { width, height } = candidate;
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    width: clampNodeResizeWidth(Math.round(width)),
    height: clampNodeResizeHeight(Math.round(height), nodeKind),
  };
}

export function resolveNodeResize(input: {
  handle: NodeResizeHandle;
  originPosition: GraphPosition;
  originSize: GraphNodeSize;
  deltaX: number;
  deltaY: number;
  nodeKind?: ResizableNodeKind;
}): NodeResizeResult {
  const originRight = input.originPosition.x + input.originSize.width;
  const originBottom = input.originPosition.y + input.originSize.height;
  const widthDirection = input.handle.endsWith("e") ? 1 : -1;
  const heightDirection = input.handle.startsWith("s") ? 1 : -1;
  const nextWidth = clampNodeResizeWidth(input.originSize.width + input.deltaX * widthDirection);
  const nextHeight = clampNodeResizeHeight(input.originSize.height + input.deltaY * heightDirection, input.nodeKind);

  return {
    position: {
      x: input.handle.endsWith("w") ? Math.round(originRight - nextWidth) : input.originPosition.x,
      y: input.handle.startsWith("n") ? Math.round(originBottom - nextHeight) : input.originPosition.y,
    },
    size: {
      width: Math.round(nextWidth),
      height: Math.round(nextHeight),
    },
  };
}

function clampNodeResizeWidth(width: number): number {
  return Math.min(Math.max(width, MIN_NODE_RESIZE_WIDTH), MAX_NODE_RESIZE_WIDTH);
}

function clampNodeResizeHeight(height: number, nodeKind?: ResizableNodeKind): number {
  const minimumHeight = Math.max(height, MIN_NODE_RESIZE_HEIGHT);
  return isNodeResizeHeightUnlimited(nodeKind) ? minimumHeight : Math.min(minimumHeight, MAX_NODE_RESIZE_HEIGHT);
}

export function isNodeResizeHeightUnlimited(nodeKind?: ResizableNodeKind) {
  return nodeKind === "agent";
}
