export function resolveEdgeRunPresentation(edgeId: string, activeRunEdgeIds: readonly string[]) {
  return activeRunEdgeIds.includes(edgeId)
    ? {
        edgeClass: "editor-canvas__edge--active-run" as const,
      }
    : null;
}
