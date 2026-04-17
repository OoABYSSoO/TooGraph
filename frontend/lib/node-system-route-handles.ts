import type { CanonicalNode } from "./node-system-canonical.ts";

export const FLOW_SOURCE_HANDLE = "flow:out";
export const FLOW_TARGET_HANDLE = "flow:in";
export const ROUTE_TARGET_HANDLE = "route:in";

export type EditorConnectionKind = "data" | "flow" | "route" | "invalid";

export function canNodeAcceptFlowTarget(
  sourceNodeKind: CanonicalNode["kind"],
  targetNodeKind: CanonicalNode["kind"],
): boolean {
  if (targetNodeKind === "input") {
    return false;
  }
  if (sourceNodeKind === "condition" && targetNodeKind === "condition") {
    return false;
  }
  return true;
}

export function classifyEditorConnection(
  sourceNodeKind: CanonicalNode["kind"],
  sourceHandleId: string | null | undefined,
  targetNodeKind: CanonicalNode["kind"],
  requestedTargetHandle?: string | null,
): EditorConnectionKind {
  if (sourceNodeKind === "condition") {
    if (!canNodeAcceptFlowTarget(sourceNodeKind, targetNodeKind)) {
      return "invalid";
    }
    if (requestedTargetHandle !== FLOW_TARGET_HANDLE) {
      return "invalid";
    }
    return "route";
  }

  if (sourceHandleId === FLOW_SOURCE_HANDLE) {
    const expectedTargetHandle = targetNodeKind === "condition" ? ROUTE_TARGET_HANDLE : FLOW_TARGET_HANDLE;
    if (requestedTargetHandle !== expectedTargetHandle || !canNodeAcceptFlowTarget(sourceNodeKind, targetNodeKind)) {
      return "invalid";
    }
    return "flow";
  }

  if (requestedTargetHandle === ROUTE_TARGET_HANDLE || requestedTargetHandle === FLOW_TARGET_HANDLE) {
    return "invalid";
  }
  return "data";
}

export function resolveFlowTargetHandle(
  sourceNodeKind: CanonicalNode["kind"],
  sourceHandleId: string | null | undefined,
  targetNodeKind: CanonicalNode["kind"],
  requestedTargetHandle?: string | null,
): string | null {
  if (sourceNodeKind === "condition") {
    return FLOW_TARGET_HANDLE;
  }
  if (sourceHandleId === FLOW_SOURCE_HANDLE) {
    return targetNodeKind === "condition" ? ROUTE_TARGET_HANDLE : FLOW_TARGET_HANDLE;
  }
  return requestedTargetHandle ?? null;
}

export const canNodeAcceptRouteTarget = (targetNodeKind: CanonicalNode["kind"]) => canNodeAcceptFlowTarget("condition", targetNodeKind);
export const resolveRouteTargetHandle = (
  sourceNodeKind: CanonicalNode["kind"],
  targetNodeKind: CanonicalNode["kind"],
  requestedTargetHandle?: string | null,
) => resolveFlowTargetHandle(sourceNodeKind, undefined, targetNodeKind, requestedTargetHandle);
