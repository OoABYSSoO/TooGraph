import type { RunDetail } from "@/types/run";

export type WorkspaceSidePanelMode = "state" | "human-review";

export function isWorkspaceStatePanelOpen(openByTabId: Record<string, boolean>, tabId: string) {
  return openByTabId[tabId] ?? false;
}

export function resolveWorkspaceSidePanelMode(modeByTabId: Record<string, WorkspaceSidePanelMode>, tabId: string) {
  return modeByTabId[tabId] ?? "state";
}

export function canShowWorkspaceHumanReviewPanel(runByTabId: Record<string, RunDetail | null>, tabId: string) {
  return runByTabId[tabId]?.status === "awaiting_human";
}

export function shouldShowWorkspaceHumanReviewPanel(
  modeByTabId: Record<string, WorkspaceSidePanelMode>,
  runByTabId: Record<string, RunDetail | null>,
  tabId: string,
) {
  return isWorkspaceHumanReviewPanelLockedOpen(modeByTabId, runByTabId, tabId);
}

export function isWorkspaceHumanReviewPanelLockedOpen(
  modeByTabId: Record<string, WorkspaceSidePanelMode>,
  runByTabId: Record<string, RunDetail | null>,
  tabId: string,
) {
  return canShowWorkspaceHumanReviewPanel(runByTabId, tabId) && resolveWorkspaceSidePanelMode(modeByTabId, tabId) === "human-review";
}
