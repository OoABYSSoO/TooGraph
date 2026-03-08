import type { NodeFamily } from "@/types/node-system";

export type EditorMinimapViewport = {
  x: number;
  y: number;
  scale: number;
};

export type EditorMinimapSize = {
  width: number;
  height: number;
};

export type EditorMinimapNodeInput = {
  id: string;
  kind: NodeFamily;
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
  runState?: string | null;
};

export type EditorMinimapEdgeInput = {
  id: string;
  kind: "flow" | "route" | "data";
  path: string;
  color?: string;
};

export type EditorMinimapBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type EditorMinimapNode = EditorMinimapNodeInput;

export type EditorMinimapProjectedNode = EditorMinimapNodeInput & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditorMinimapProjectedEdge = EditorMinimapEdgeInput & {
  transform: string;
};

export type EditorMinimapModel = {
  width: number;
  height: number;
  bounds: EditorMinimapBounds;
  scale: number;
  offsetX: number;
  offsetY: number;
  nodes: EditorMinimapProjectedNode[];
  edges: EditorMinimapProjectedEdge[];
  viewportRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type BuildEditorMinimapModelInput = {
  width: number;
  height: number;
  canvasSize: EditorMinimapSize;
  viewport: EditorMinimapViewport;
  nodes: EditorMinimapNodeInput[];
  edges: EditorMinimapEdgeInput[];
  boundsPadding?: number;
  fitRatio?: number;
};

export type MinimapCenterViewAction =
  | { type: "ignore-empty-canvas-size" }
  | { type: "set-viewport"; viewport: EditorMinimapViewport };

const DEFAULT_BOUNDS_PADDING = 180;
const DEFAULT_FIT_RATIO = 0.88;

export function buildEditorMinimapModel(input: BuildEditorMinimapModelInput): EditorMinimapModel | null {
  const renderableNodes = input.nodes.filter((node) => node.width > 0 && node.height > 0);
  if (renderableNodes.length === 0 || input.width <= 0 || input.height <= 0) {
    return null;
  }

  const bounds = calculateMinimapBounds(renderableNodes, input.boundsPadding ?? DEFAULT_BOUNDS_PADDING);
  const scale = calculateMinimapScale(bounds, input.width, input.height, input.fitRatio ?? DEFAULT_FIT_RATIO);
  const offsetX = (input.width - bounds.width * scale) / 2 - bounds.minX * scale;
  const offsetY = (input.height - bounds.height * scale) / 2 - bounds.minY * scale;

  return {
    width: input.width,
    height: input.height,
    bounds,
    scale,
    offsetX,
    offsetY,
    nodes: renderableNodes.map((node) => ({
      ...node,
      x: roundCoordinate(node.x * scale + offsetX),
      y: roundCoordinate(node.y * scale + offsetY),
      width: roundCoordinate(node.width * scale),
      height: roundCoordinate(node.height * scale),
    })),
    edges: input.edges.map((edge) => ({
      ...edge,
      transform: `translate(${roundCoordinate(offsetX)} ${roundCoordinate(offsetY)}) scale(${roundCoordinate(scale)})`,
    })),
    viewportRect: resolveViewportRect(input.viewport, input.canvasSize, scale, offsetX, offsetY),
  };
}

export function mapMinimapPointToWorld(model: EditorMinimapModel, point: { x: number; y: number }) {
  return {
    x: roundCoordinate((point.x - model.offsetX) / model.scale),
    y: roundCoordinate((point.y - model.offsetY) / model.scale),
  };
}

export function resolveViewportForMinimapCenter(input: {
  worldX: number;
  worldY: number;
  viewportScale: number;
  canvasWidth: number;
  canvasHeight: number;
}): EditorMinimapViewport {
  return {
    x: roundCoordinate(input.canvasWidth / 2 - input.worldX * input.viewportScale),
    y: roundCoordinate(input.canvasHeight / 2 - input.worldY * input.viewportScale),
    scale: input.viewportScale,
  };
}

export function resolveMinimapCenterViewAction(input: {
  worldX: number;
  worldY: number;
  viewportScale: number;
  canvasSize: EditorMinimapSize;
}): MinimapCenterViewAction {
  if (input.canvasSize.width <= 0 || input.canvasSize.height <= 0) {
    return { type: "ignore-empty-canvas-size" };
  }

  return {
    type: "set-viewport",
    viewport: resolveViewportForMinimapCenter({
      worldX: input.worldX,
      worldY: input.worldY,
      viewportScale: input.viewportScale,
      canvasWidth: input.canvasSize.width,
      canvasHeight: input.canvasSize.height,
    }),
  };
}

function calculateMinimapBounds(nodes: EditorMinimapNodeInput[], padding: number): EditorMinimapBounds {
  const minX = Math.min(...nodes.map((node) => node.x)) - padding;
  const minY = Math.min(...nodes.map((node) => node.y)) - padding;
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + padding;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + padding;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function calculateMinimapScale(bounds: EditorMinimapBounds, width: number, height: number, fitRatio: number) {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return 1;
  }
  return Math.min(width / bounds.width, height / bounds.height) * fitRatio;
}

function resolveViewportRect(
  viewport: EditorMinimapViewport,
  canvasSize: EditorMinimapSize,
  minimapScale: number,
  offsetX: number,
  offsetY: number,
) {
  const viewportScale = viewport.scale || 1;
  const worldX = -viewport.x / viewportScale;
  const worldY = -viewport.y / viewportScale;
  const worldWidth = canvasSize.width / viewportScale;
  const worldHeight = canvasSize.height / viewportScale;

  return {
    x: roundCoordinate(worldX * minimapScale + offsetX),
    y: roundCoordinate(worldY * minimapScale + offsetY),
    width: roundCoordinate(worldWidth * minimapScale),
    height: roundCoordinate(worldHeight * minimapScale),
  };
}

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}
