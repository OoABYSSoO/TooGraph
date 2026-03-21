import type { RunDetail } from "@/types/run";

export type WorkspaceSidePanelMode = "state" | "human-review" | "run-activity";

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

export function shouldShowWorkspaceRunActivityPanel(
  openByTabId: Record<string, boolean>,
  modeByTabId: Record<string, WorkspaceSidePanelMode>,
  tabId: string,
) {
  return isWorkspaceRunActivityPanelOpen(openByTabId, modeByTabId, tabId);
}

export function isWorkspaceRunActivityPanelOpen(
  openByTabId: Record<string, boolean>,
  modeByTabId: Record<string, WorkspaceSidePanelMode>,
  tabId: string,
) {
  return isWorkspaceStatePanelOpen(openByTabId, tabId) && resolveWorkspaceSidePanelMode(modeByTabId, tabId) === "run-activity";
}

export function isWorkspaceHumanReviewPanelLockedOpen(
  modeByTabId: Record<string, WorkspaceSidePanelMode>,
  runByTabId: Record<string, RunDetail | null>,
  tabId: string,
) {
  return canShowWorkspaceHumanReviewPanel(runByTabId, tabId) && resolveWorkspaceSidePanelMode(modeByTabId, tabId) === "human-review";
}
