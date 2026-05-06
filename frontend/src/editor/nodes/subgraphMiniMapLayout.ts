import type { SubgraphThumbnailEdgeViewModel, SubgraphThumbnailNodeViewModel } from "./nodeCardViewModel";

export type SubgraphMiniMapLayoutConfig = {
  maxColumnCount: number;
  nodeWidth: number;
  nodeHeight: number;
  columnGap: number;
  rowGap: number;
  paddingX: number;
  paddingY: number;
  minCanvasWidth: number;
  minCanvasHeight: number;
};

export type SubgraphMiniMapPlacedNode = SubgraphThumbnailNodeViewModel & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SubgraphMiniMapPlacedEdge = SubgraphThumbnailEdgeViewModel & {
  path: string;
};

export type SubgraphMiniMapLayout = {
  columnCount: number;
  rowCount: number;
  canvasWidth: number;
  canvasHeight: number;
  nodes: SubgraphMiniMapPlacedNode[];
  edges: SubgraphMiniMapPlacedEdge[];
};

export const SUBGRAPH_MINI_MAP_LAYOUT_DEFAULTS: SubgraphMiniMapLayoutConfig = {
  maxColumnCount: 4,
  nodeWidth: 136,
  nodeHeight: 38,
  columnGap: 42,
  rowGap: 42,
  paddingX: 26,
  paddingY: 24,
  minCanvasWidth: 320,
  minCanvasHeight: 172,
};

export function resolveSubgraphMiniMapColumnCount(
  nodeCount: number,
  availableWidth: number,
  config: SubgraphMiniMapLayoutConfig = SUBGRAPH_MINI_MAP_LAYOUT_DEFAULTS,
) {
  const boundedNodeCount = Math.max(1, Math.floor(nodeCount));
  const maxColumnCount = Math.max(1, Math.min(config.maxColumnCount, boundedNodeCount));
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    return maxColumnCount;
  }

  for (let columnCount = maxColumnCount; columnCount > 1; columnCount -= 1) {
    if (requiredWidthForColumns(columnCount, config) <= availableWidth) {
      return columnCount;
    }
  }
  return 1;
}

export function buildSubgraphMiniMapLayout(
  nodes: SubgraphThumbnailNodeViewModel[],
  edges: SubgraphThumbnailEdgeViewModel[],
  availableWidth: number,
  config: SubgraphMiniMapLayoutConfig = SUBGRAPH_MINI_MAP_LAYOUT_DEFAULTS,
): SubgraphMiniMapLayout {
  const columnCount = resolveSubgraphMiniMapColumnCount(nodes.length, availableWidth, config);
  const rowCount = Math.max(1, Math.ceil(nodes.length / columnCount));
  const canvasWidth = Math.max(config.minCanvasWidth, requiredWidthForColumns(columnCount, config));
  const canvasHeight = Math.max(config.minCanvasHeight, config.paddingY * 2 + rowCount * config.nodeHeight + Math.max(0, rowCount - 1) * config.rowGap);
  const placedNodes = nodes.map((node, index) => {
    const column = (index % columnCount) + 1;
    const row = Math.floor(index / columnCount) + 1;
    return {
      ...node,
      column,
      row,
      x: config.paddingX + (column - 1) * (config.nodeWidth + config.columnGap),
      y: config.paddingY + (row - 1) * (config.nodeHeight + config.rowGap),
      width: config.nodeWidth,
      height: config.nodeHeight,
    };
  });
  const nodeById = new Map(placedNodes.map((node) => [node.id, node]));

  return {
    columnCount,
    rowCount,
    canvasWidth,
    canvasHeight,
    nodes: placedNodes,
    edges: edges.flatMap((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) {
        return [];
      }
      return [
        {
          ...edge,
          path: buildOrthogonalEdgePath(source, target),
        },
      ];
    }),
  };
}

function requiredWidthForColumns(columnCount: number, config: SubgraphMiniMapLayoutConfig) {
  return config.paddingX * 2 + columnCount * config.nodeWidth + Math.max(0, columnCount - 1) * config.columnGap;
}

function buildOrthogonalEdgePath(source: SubgraphMiniMapPlacedNode, target: SubgraphMiniMapPlacedNode) {
  const sourcePoint = edgePoint(source, source.x <= target.x ? "end" : "start");
  const targetPoint = edgePoint(target, source.x <= target.x ? "start" : "end");
  if (source.row === target.row) {
    return `M ${sourcePoint.x} ${sourcePoint.y} H ${targetPoint.x}`;
  }
  if (source.column === target.column) {
    return `M ${sourcePoint.x} ${sourcePoint.y} V ${targetPoint.y}`;
  }
  const midX = Math.round((sourcePoint.x + targetPoint.x) / 2);
  return `M ${sourcePoint.x} ${sourcePoint.y} H ${midX} V ${targetPoint.y} H ${targetPoint.x}`;
}

function edgePoint(node: SubgraphMiniMapPlacedNode, side: "start" | "end") {
  return {
    x: side === "start" ? node.x : node.x + node.width,
    y: node.y + Math.round(node.height / 2),
  };
}
