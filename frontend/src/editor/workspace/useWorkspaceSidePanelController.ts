import { computed, type ComputedRef, type Ref } from "vue";

import type { NodeFocusRequest } from "@/editor/canvas/useNodeSelectionFocus";
import type { RunDetail } from "@/types/run";

import { setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";
import {
  canShowWorkspaceHumanReviewPanel,
  isWorkspaceStatePanelOpen,
  resolveWorkspaceSidePanelMode,
  shouldShowWorkspaceHumanReviewPanel,
  type WorkspaceSidePanelMode,
} from "./workspaceSidePanelModel.ts";

type WorkspaceSidePanelTab = {
  tabId: string;
};

type WorkspaceSidePanelControllerInput = {
  activeTab: ComputedRef<WorkspaceSidePanelTab | null>;
  statePanelOpenByTabId: Ref<Record<string, boolean>>;
  sidePanelModeByTabId: Ref<Record<string, WorkspaceSidePanelMode>>;
  latestRunDetailByTabId: Ref<Record<string, RunDetail | null>>;
  focusedNodeIdByTabId: Ref<Record<string, string | null>>;
  focusRequestByTabId: Ref<Record<string, NodeFocusRequest | null>>;
  closeNodeCreationMenu: (tabId: string) => void;
  showGraphLockedEditToast: () => void;
};

export function useWorkspaceSidePanelController(input: WorkspaceSidePanelControllerInput) {
  const activeStatePanelOpen = computed(() => {
    const tab = input.activeTab.value;
    return tab ? isWorkspaceStatePanelOpen(input.statePanelOpenByTabId.value, tab.tabId) : false;
  });

  function isStatePanelOpen(tabId: string) {
    return isWorkspaceStatePanelOpen(input.statePanelOpenByTabId.value, tabId);
  }

  function sidePanelMode(tabId: string) {
    return resolveWorkspaceSidePanelMode(input.sidePanelModeByTabId.value, tabId);
  }

  function canShowHumanReviewPanel(tabId: string) {
    return canShowWorkspaceHumanReviewPanel(input.latestRunDetailByTabId.value, tabId);
  }

  function shouldShowHumanReviewPanel(tabId: string) {
    return shouldShowWorkspaceHumanReviewPanel(input.sidePanelModeByTabId.value, input.latestRunDetailByTabId.value, tabId);
  }

  function isHumanReviewPanelLockedOpen(tabId: string) {
    return canShowHumanReviewPanel(tabId) && sidePanelMode(tabId) === "human-review";
  }

  function focusNodeForTab(tabId: string, nodeId: string | null) {
    input.focusedNodeIdByTabId.value = setTabScopedRecordEntry(input.focusedNodeIdByTabId.value, tabId, nodeId);
  }

  function requestNodeFocusForTab(tabId: string, nodeId: string | null) {
    focusNodeForTab(tabId, nodeId);
    if (!nodeId) {
      input.focusRequestByTabId.value = setTabScopedRecordEntry(input.focusRequestByTabId.value, tabId, null);
      return;
    }

    const previousSequence = input.focusRequestByTabId.value[tabId]?.sequence ?? 0;
    input.focusRequestByTabId.value = setTabScopedRecordEntry(input.focusRequestByTabId.value, tabId, {
      nodeId,
      sequence: previousSequence + 1,
    });
  }

  function toggleStatePanel(tabId: string) {
    if (isHumanReviewPanelLockedOpen(tabId)) {
      input.showGraphLockedEditToast();
      return;
    }
    input.statePanelOpenByTabId.value = setTabScopedRecordEntry(input.statePanelOpenByTabId.value, tabId, !isStatePanelOpen(tabId));
  }

  function openHumanReviewPanelForTab(tabId: string, nodeId: string | null) {
    if (!canShowHumanReviewPanel(tabId)) {
      return;
    }
    input.closeNodeCreationMenu(tabId);
    input.sidePanelModeByTabId.value = setTabScopedRecordEntry(input.sidePanelModeByTabId.value, tabId, "human-review");
    input.statePanelOpenByTabId.value = setTabScopedRecordEntry(input.statePanelOpenByTabId.value, tabId, true);
    focusNodeForTab(tabId, nodeId);
  }

  function toggleActiveStatePanel() {
    const tab = input.activeTab.value;
    if (!tab) {
      return;
    }
    const tabId = tab.tabId;
    if (isHumanReviewPanelLockedOpen(tabId)) {
      openHumanReviewPanelForTab(tabId, input.latestRunDetailByTabId.value[tabId]?.current_node_id ?? null);
      input.showGraphLockedEditToast();
      return;
    }
    if (sidePanelMode(tabId) !== "state") {
      input.sidePanelModeByTabId.value = setTabScopedRecordEntry(input.sidePanelModeByTabId.value, tabId, "state");
      input.statePanelOpenByTabId.value = setTabScopedRecordEntry(input.statePanelOpenByTabId.value, tabId, true);
      return;
    }
    input.sidePanelModeByTabId.value = setTabScopedRecordEntry(input.sidePanelModeByTabId.value, tabId, "state");
    toggleStatePanel(tabId);
  }

  function sidePanelOpenWidth(tabId: string) {
    return sidePanelMode(tabId) === "human-review"
      ? "var(--editor-human-review-panel-open-width)"
      : "var(--editor-state-panel-open-width)";
  }

  function editorMainStyle(tabId: string) {
    if (!isStatePanelOpen(tabId)) {
      return {};
    }

    return {
      "--editor-canvas-minimap-right-clearance": `calc(${sidePanelOpenWidth(tabId)} + 12px)`,
    };
  }

  function sidePanelLayerStyle(tabId: string) {
    return {
      width: sidePanelOpenWidth(tabId),
    };
  }

  return {
    activeStatePanelOpen,
    isStatePanelOpen,
    sidePanelMode,
    canShowHumanReviewPanel,
    shouldShowHumanReviewPanel,
    isHumanReviewPanelLockedOpen,
    toggleStatePanel,
    openHumanReviewPanelForTab,
    focusNodeForTab,
    requestNodeFocusForTab,
    toggleActiveStatePanel,
    editorMainStyle,
    sidePanelLayerStyle,
    sidePanelOpenWidth,
  };
}
