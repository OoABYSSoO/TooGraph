import type { PendingGraphConnection } from "../../lib/graph-connections.ts";
import type { ProjectedCanvasAnchor, ProjectedCanvasEdge } from "./edgeProjection.ts";
import { buildFlowOutHotspotStyle, resolveRouteHandlePalette, type RouteHandleTone } from "./routeHandleModel.ts";

export type ConnectionPreviewKind = "flow" | "route" | "data";

export type CanvasInteractionStyleContext = {
  activeConnectionSourceAnchorId: string | null;
  eligibleTargetAnchorIds: ReadonlySet<string>;
  activeConnectionSourceKind: PendingGraphConnection["sourceKind"] | null;
  activeConnectionAccentColor: string;
};

export function withAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(37, 99, 235, ${alpha})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function buildConnectionPreviewStyle(kind: ConnectionPreviewKind | null | undefined, accent: string) {
  if (!kind) {
    return undefined;
  }

  if (kind === "data") {
    return {
      "--editor-connection-preview-stroke": withAlpha(accent, 0.82),
    };
  }

  if (kind === "route") {
    return {
      "--editor-connection-preview-stroke": withAlpha(accent, 0.78),
    };
  }

  return {
    "--editor-connection-preview-stroke": withAlpha(accent, 0.76),
  };
}

export function buildConnectionPreviewClassState(kind: ConnectionPreviewKind) {
  return {
    "editor-canvas__edge--flow": kind === "flow",
    "editor-canvas__edge--route": kind === "route",
    "editor-canvas__edge--data": kind === "data",
  };
}

export function buildProjectedEdgeClassState(input: {
  edge: Pick<ProjectedCanvasEdge, "id" | "kind">;
  selectedEdgeId: string | null | undefined;
  activeRunEdgeClass?: string | null;
}) {
  return {
    "editor-canvas__edge--flow": input.edge.kind === "flow",
    "editor-canvas__edge--route": input.edge.kind === "route",
    "editor-canvas__edge--data": input.edge.kind === "data",
    "editor-canvas__edge--selected": input.selectedEdgeId === input.edge.id,
    "editor-canvas__edge--active-run": input.activeRunEdgeClass === "editor-canvas__edge--active-run",
  };
}

export function buildProjectedEdgeHitareaClassState(edge: Pick<ProjectedCanvasEdge, "kind">) {
  return {
    "editor-canvas__edge-hitarea--flow": edge.kind === "flow",
    "editor-canvas__edge-hitarea--route": edge.kind === "route",
    "editor-canvas__edge-hitarea--data": edge.kind === "data",
  };
}

export function buildProjectedEdgeStyle(edge: Pick<ProjectedCanvasEdge, "kind" | "branch" | "color">) {
  if (edge.kind === "route" && edge.branch) {
    const accent = resolveRouteHandlePalette(edge.branch).accent;
    return {
      "--editor-edge-stroke": withAlpha(accent, 0.88),
      "--editor-edge-outline": withAlpha(accent, 0.16),
    };
  }
  if (!edge.color) {
    return undefined;
  }
  return {
    "--editor-edge-stroke": edge.color,
    "--editor-edge-outline": withAlpha(edge.color, 0.18),
    "--editor-edge-outline-active": withAlpha(edge.color, 0.32),
  };
}

export function buildFlowHotspotStyle(anchor: Pick<ProjectedCanvasAnchor, "kind" | "side" | "x" | "y">) {
  const isVertical = anchor.side === "left" || anchor.side === "right";
  let left = anchor.x;
  let top = anchor.y;
  let width = isVertical ? 22 : 86;
  let height = isVertical ? 86 : 22;

  if (anchor.kind === "flow-out" && anchor.side === "right") {
    return buildFlowOutHotspotStyle(anchor);
  } else if (anchor.kind === "flow-in" && anchor.side === "left") {
    left -= 18;
    width = 42;
    height = 82;
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
}

export function buildPointAnchorStyle(anchor: Pick<ProjectedCanvasAnchor, "color">) {
  if (!anchor.color) {
    return undefined;
  }
  return {
    "--editor-anchor-fill": anchor.color,
  };
}

export function isCanvasConnectionSourceAnchor(
  anchor: Pick<ProjectedCanvasAnchor, "id">,
  context: Pick<CanvasInteractionStyleContext, "activeConnectionSourceAnchorId">,
) {
  return context.activeConnectionSourceAnchorId === anchor.id;
}

export function isCanvasConnectionTargetAnchor(
  anchor: Pick<ProjectedCanvasAnchor, "id">,
  context: Pick<CanvasInteractionStyleContext, "eligibleTargetAnchorIds">,
) {
  return context.eligibleTargetAnchorIds.has(anchor.id);
}

export function buildFlowHotspotClassState(input: {
  anchor: Pick<ProjectedCanvasAnchor, "id" | "kind" | "side">;
  isVisible: boolean;
  context: CanvasInteractionStyleContext;
}) {
  return {
    "editor-canvas__flow-hotspot--outbound": input.anchor.kind === "flow-out",
    "editor-canvas__flow-hotspot--inbound": input.anchor.kind === "flow-in",
    "editor-canvas__flow-hotspot--visible": input.isVisible,
    "editor-canvas__flow-hotspot--connect-source": isCanvasConnectionSourceAnchor(input.anchor, input.context),
    "editor-canvas__flow-hotspot--connect-target": isCanvasConnectionTargetAnchor(input.anchor, input.context),
    "editor-canvas__flow-hotspot--top": input.anchor.side === "top",
  };
}

export function buildRouteHandleClassState(input: {
  anchor: Pick<ProjectedCanvasAnchor, "id">;
  isVisible: boolean;
  tone: RouteHandleTone;
  context: CanvasInteractionStyleContext;
}) {
  const isConnectSource = isCanvasConnectionSourceAnchor(input.anchor, input.context);
  return {
    "editor-canvas__flow-hotspot--visible": input.isVisible,
    "editor-canvas__route-handle--success": input.tone === "success",
    "editor-canvas__route-handle--danger": input.tone === "danger",
    "editor-canvas__route-handle--warning": input.tone === "warning",
    "editor-canvas__route-handle--neutral": input.tone === "neutral",
    "editor-canvas__flow-hotspot--connect-source": isConnectSource,
    "editor-canvas__route-handle--connect-source": isConnectSource,
  };
}

export function buildFlowHotspotConnectStyle(
  anchor: Pick<ProjectedCanvasAnchor, "id">,
  context: CanvasInteractionStyleContext,
) {
  if (!isActiveConnectionEndpoint(anchor.id, context) || context.activeConnectionSourceKind !== "state-out") {
    return undefined;
  }

  const accent = context.activeConnectionAccentColor;
  return {
    "--editor-connection-source-fill": withAlpha(accent, 0.16),
    "--editor-connection-source-border": withAlpha(accent, 0.34),
    "--editor-connection-source-glow": withAlpha(accent, 0.14),
    "--editor-connection-source-symbol": withAlpha(accent, 0.96),
    "--editor-connection-target-fill": withAlpha(accent, 0.12),
    "--editor-connection-target-border": withAlpha(accent, 0.28),
    "--editor-connection-target-glow": withAlpha(accent, 0.16),
    "--editor-connection-target-anchor": withAlpha(accent, 0.92),
  };
}

export function buildPointAnchorConnectStyle(
  anchor: Pick<ProjectedCanvasAnchor, "id">,
  context: CanvasInteractionStyleContext,
) {
  if (!isActiveConnectionEndpoint(anchor.id, context) || context.activeConnectionSourceKind !== "state-out") {
    return undefined;
  }

  const accent = context.activeConnectionAccentColor;
  return {
    "--editor-connection-source-anchor": withAlpha(accent, 0.96),
    "--editor-connection-source-stroke": withAlpha(accent, 0.24),
    "--editor-connection-target-anchor": withAlpha(accent, 0.92),
    "--editor-connection-target-stroke": withAlpha(accent, 0.18),
  };
}

function isActiveConnectionEndpoint(anchorId: string, context: CanvasInteractionStyleContext) {
  const anchor = { id: anchorId };
  return isCanvasConnectionSourceAnchor(anchor, context) || isCanvasConnectionTargetAnchor(anchor, context);
}
