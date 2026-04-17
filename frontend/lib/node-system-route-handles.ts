import type { CanonicalNode } from "./node-system-canonical.ts";

export const ROUTE_TARGET_HANDLE = "route:in";

export type EditorConnectionKind = "data" | "route" | "invalid";

export function canNodeAcceptRouteTarget(targetNodeKind: CanonicalNode["kind"]): boolean {
  return targetNodeKind !== "condition";
}

export function classifyEditorConnection(
  sourceNodeKind: CanonicalNode["kind"],
  targetNodeKind: CanonicalNode["kind"],
  requestedTargetHandle?: string | null,
): EditorConnectionKind {
  if (sourceNodeKind === "condition") {
    if (!canNodeAcceptRouteTarget(targetNodeKind)) {
      return "invalid";
    }
    return "route";
  }
  if (requestedTargetHandle === ROUTE_TARGET_HANDLE) {
    return "invalid";
  }
  return "data";
}

export function resolveRouteTargetHandle(
  sourceNodeKind: CanonicalNode["kind"],
  requestedTargetHandle?: string | null,
): string | null {
  if (sourceNodeKind === "condition") {
    return ROUTE_TARGET_HANDLE;
  }
  return requestedTargetHandle ?? null;
}
