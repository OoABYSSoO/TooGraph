import type { CanvasViewport } from "../canvas/canvasViewport.ts";
import type { EditorWorkspaceTab } from "../../lib/editor-workspace.ts";

export function listTabsMissingViewportDrafts(
  tabs: Pick<EditorWorkspaceTab, "tabId">[],
  viewportByTabId: Record<string, CanvasViewport>,
) {
  return tabs.map((tab) => tab.tabId).filter((tabId) => !viewportByTabId[tabId]);
}

export function buildNextCanvasViewportDrafts(
  viewportByTabId: Record<string, CanvasViewport>,
  tabId: string,
  viewport: CanvasViewport,
) {
  const previousViewport = viewportByTabId[tabId] ?? null;
  if (
    previousViewport &&
    previousViewport.x === viewport.x &&
    previousViewport.y === viewport.y &&
    previousViewport.scale === viewport.scale
  ) {
    return null;
  }

  return {
    ...viewportByTabId,
    [tabId]: viewport,
  };
}
