import type { GraphEditPlaybackStep } from "../editor/workspace/graphEditPlaybackModel.ts";
import type { GraphEditPlaybackUiState } from "./buddyGraphEditPlaybackBridge.ts";
import type { BuddyPosition } from "./buddyPosition.ts";

export type GraphEditPlaybackViewportTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

const DEFAULT_GRAPH_EDIT_PLAYBACK_VIEWPORT_TRANSFORM: GraphEditPlaybackViewportTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
};

export function isGraphEditPlaybackDragStep(step: GraphEditPlaybackStep) {
  return step.kind === "drag_state_edge_to_canvas" || step.kind === "drag_state_edge_to_node" || step.kind === "draw_flow_edge";
}

export function shouldForceGraphEditPlaybackEmptyCanvasDrop(step: GraphEditPlaybackStep) {
  const endTarget = typeof step.endTarget === "string" ? step.endTarget : "";
  return (
    (step.kind === "drag_state_edge_to_canvas" || step.kind === "draw_flow_edge") &&
    Boolean(step.position) &&
    (!endTarget || endTarget === "editor.canvas.surface" || endTarget === "editor.canvas.empty.createFirstNode")
  );
}

export function buildVirtualDragPoints(startPoint: BuddyPosition, endPoint: BuddyPosition, steps = 5) {
  const points: BuddyPosition[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    points.push({
      x: startPoint.x + (endPoint.x - startPoint.x) * progress,
      y: startPoint.y + (endPoint.y - startPoint.y) * progress,
    });
  }
  return points;
}

export function resolveGraphEditPlaybackPositionClientPoint(
  step: GraphEditPlaybackStep,
  canvas: HTMLElement | null,
): BuddyPosition | null {
  const position = step.position;
  if (!position || typeof position.x !== "number" || typeof position.y !== "number" || !canvas) {
    return null;
  }
  const viewportElement = canvas.querySelector<HTMLElement>(".editor-canvas__viewport") ?? null;
  const canvasRect = canvas.getBoundingClientRect();
  const viewportTransform = resolveGraphEditPlaybackViewportTransform(viewportElement);
  return {
    x: canvasRect.left + viewportTransform.x + position.x * viewportTransform.scaleX,
    y: canvasRect.top + viewportTransform.y + position.y * viewportTransform.scaleY,
  };
}

export function resolveGraphEditPlaybackViewportTransform(viewportElement: HTMLElement | null) {
  if (!viewportElement || typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return { ...DEFAULT_GRAPH_EDIT_PLAYBACK_VIEWPORT_TRANSFORM };
  }
  return resolveGraphEditPlaybackViewportTransformValue(window.getComputedStyle(viewportElement).transform);
}

export function resolveGraphEditPlaybackViewportTransformValue(transform: string | null | undefined) {
  if (!transform || transform === "none") {
    return { ...DEFAULT_GRAPH_EDIT_PLAYBACK_VIEWPORT_TRANSFORM };
  }
  try {
    if (typeof DOMMatrixReadOnly === "function") {
      const matrix = new DOMMatrixReadOnly(transform);
      return { x: matrix.e, y: matrix.f, scaleX: matrix.a || 1, scaleY: matrix.d || 1 };
    }
  } catch {
    // Fall through to the lightweight matrix parser below.
  }
  const matrixMatch = transform.match(/^matrix\(([^)]+)\)$/);
  const values = matrixMatch?.[1]?.split(",").map((value) => Number(value.trim())) ?? [];
  return {
    x: Number.isFinite(values[4]) ? values[4]! : 0,
    y: Number.isFinite(values[5]) ? values[5]! : 0,
    scaleX: Number.isFinite(values[0]) && values[0] !== 0 ? values[0]! : 1,
    scaleY: Number.isFinite(values[3]) && values[3] !== 0 ? values[3]! : 1,
  };
}

export function resolveGraphEditPlaybackAnchorNodeId(targetId: string) {
  return /^editor\.canvas\.anchor\.([^:]+):/.exec(targetId)?.[1] ?? "";
}

export function listGraphEditPlaybackNodeAffordanceIds(root: ParentNode | null = resolveDocumentRoot()) {
  if (!root) {
    return new Set<string>();
  }
  const nodeIds = new Set<string>();
  root.querySelectorAll<HTMLElement>("[data-virtual-affordance-id]").forEach((element) => {
    const targetId = element.dataset.virtualAffordanceId ?? "";
    const nodeId = targetId.match(/^editor\.canvas\.node\.([^.]+)$/)?.[1] ?? "";
    if (nodeId) {
      nodeIds.add(nodeId);
    }
  });
  return nodeIds;
}

export function listGraphEditPlaybackPortStateKeys(
  step: GraphEditPlaybackStep,
  playbackState: GraphEditPlaybackUiState,
  root: ParentNode | null = resolveDocumentRoot(),
) {
  if (!root) {
    return new Set<string>();
  }
  const plannedNodeId = step.nodeId ?? "";
  const nodeId = plannedNodeId ? playbackState.nodeIdAliases.get(plannedNodeId) ?? plannedNodeId : "";
  const side = step.bindingMode === "read" ? "input" : step.bindingMode === "write" ? "output" : "";
  if (!nodeId || !side) {
    return new Set<string>();
  }
  const stateKeys = new Set<string>();
  const prefix = `editor.canvas.node.${nodeId}.port.${side}.`;
  root.querySelectorAll<HTMLElement>("[data-virtual-affordance-id]").forEach((element) => {
    const targetId = element.dataset.virtualAffordanceId ?? "";
    if (!targetId.startsWith(prefix) || targetId.endsWith(".create") || targetId.endsWith(".remove")) {
      return;
    }
    const stateKey = targetId.slice(prefix.length);
    if (stateKey && !stateKey.includes(".")) {
      stateKeys.add(stateKey);
    }
  });
  return stateKeys;
}

export function normalizeVirtualText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

export function resolveGraphEditPlaybackStepDelayMs(step: GraphEditPlaybackStep): number {
  if (step.kind === "apply_graph_command") {
    return 180;
  }
  if (step.kind === "type_node_field" || step.kind === "type_state_field" || step.kind === "commit_state_field") {
    return 160;
  }
  return 90;
}

function resolveDocumentRoot(): ParentNode | null {
  return typeof document === "undefined" ? null : document;
}
