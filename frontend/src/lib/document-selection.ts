export function resolveInitialSelectionId(ids: string[], requestedId: string | null): string | null {
  if (requestedId && ids.includes(requestedId)) {
    return requestedId;
  }
  return ids[0] ?? null;
}
