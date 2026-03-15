import assert from "node:assert/strict";
import test from "node:test";
import { computed, ref } from "vue";

import type { NodeFocusRequest } from "@/editor/canvas/useNodeSelectionFocus";
import type { RunDetail } from "@/types/run";

import type { WorkspaceSidePanelMode } from "./workspaceSidePanelModel.ts";
import { useWorkspaceSidePanelController } from "./useWorkspaceSidePanelController.ts";

function runWithStatus(status: string, currentNodeId: string | null = null): RunDetail {
  return { status, current_node_id: currentNodeId } as RunDetail;
}

function createSidePanelHarness(activeTabId: string | null = "tab_a") {
  const activeTabIdRef = ref(activeTabId);
  const statePanelOpenByTabId = ref<Record<string, boolean>>({});
  const sidePanelModeByTabId = ref<Record<string, WorkspaceSidePanelMode>>({});
  const latestRunDetailByTabId = ref<Record<string, RunDetail | null>>({});
  const focusedNodeIdByTabId = ref<Record<string, string | null>>({});
  const focusRequestByTabId = ref<Record<string, NodeFocusRequest | null>>({});
  const closedMenuTabIds: string[] = [];
  let lockedToastCount = 0;

  const controller = useWorkspaceSidePanelController({
    activeTab: computed(() => (activeTabIdRef.value ? { tabId: activeTabIdRef.value } : null)),
    statePanelOpenByTabId,
    sidePanelModeByTabId,
    latestRunDetailByTabId,
    focusedNodeIdByTabId,
    focusRequestByTabId,
    closeNodeCreationMenu: (tabId) => closedMenuTabIds.push(tabId),
    showGraphLockedEditToast: () => {
      lockedToastCount += 1;
    },
  });

  return {
    activeTabIdRef,
    statePanelOpenByTabId,
    sidePanelModeByTabId,
    latestRunDetailByTabId,
    focusedNodeIdByTabId,
    focusRequestByTabId,
    closedMenuTabIds,
    lockedToastCount: () => lockedToastCount,
    controller,
  };
}

test("useWorkspaceSidePanelController exposes panel visibility and width decisions", () => {
  const harness = createSidePanelHarness();
  harness.statePanelOpenByTabId.value = { tab_a: true };
  harness.sidePanelModeByTabId.value = { tab_a: "human-review" };
  harness.latestRunDetailByTabId.value = { tab_a: runWithStatus("awaiting_human") };

  assert.equal(harness.controller.activeStatePanelOpen.value, true);
  assert.equal(harness.controller.isStatePanelOpen("tab_missing"), false);
  assert.equal(harness.controller.sidePanelMode("tab_a"), "human-review");
  assert.equal(harness.controller.canShowHumanReviewPanel("tab_a"), true);
  assert.equal(harness.controller.shouldShowHumanReviewPanel("tab_a"), true);
  assert.equal(harness.controller.sidePanelOpenWidth("tab_a"), "var(--editor-human-review-panel-open-width)");
  assert.deepEqual(harness.controller.editorMainStyle("tab_a"), {
    "--editor-canvas-minimap-right-clearance": "calc(var(--editor-human-review-panel-open-width) + 12px)",
  });
  assert.deepEqual(harness.controller.sidePanelLayerStyle("tab_a"), {
    width: "var(--editor-human-review-panel-open-width)",
  });
});

test("useWorkspaceSidePanelController keeps Human Review locked open while awaiting input", () => {
  const harness = createSidePanelHarness();
  harness.statePanelOpenByTabId.value = { tab_a: true };
  harness.sidePanelModeByTabId.value = { tab_a: "human-review" };
  harness.latestRunDetailByTabId.value = { tab_a: runWithStatus("awaiting_human") };

  harness.controller.toggleStatePanel("tab_a");

  assert.equal(harness.lockedToastCount(), 1);
  assert.equal(harness.statePanelOpenByTabId.value.tab_a, true);
});

test("useWorkspaceSidePanelController opens Human Review mode only for awaiting-human runs", () => {
  const harness = createSidePanelHarness();
  harness.latestRunDetailByTabId.value = { tab_a: runWithStatus("running") };

  harness.controller.openHumanReviewPanelForTab("tab_a", "node_a");

  assert.deepEqual(harness.closedMenuTabIds, []);
  assert.deepEqual(harness.sidePanelModeByTabId.value, {});
  assert.deepEqual(harness.focusedNodeIdByTabId.value, {});

  harness.latestRunDetailByTabId.value = { tab_a: runWithStatus("awaiting_human") };
  harness.controller.openHumanReviewPanelForTab("tab_a", "node_a");

  assert.deepEqual(harness.closedMenuTabIds, ["tab_a"]);
  assert.equal(harness.sidePanelModeByTabId.value.tab_a, "human-review");
  assert.equal(harness.statePanelOpenByTabId.value.tab_a, true);
  assert.equal(harness.focusedNodeIdByTabId.value.tab_a, "node_a");
});

test("useWorkspaceSidePanelController keeps node focus request sequences tab-scoped", () => {
  const harness = createSidePanelHarness();

  harness.controller.requestNodeFocusForTab("tab_a", "node_a");
  harness.controller.requestNodeFocusForTab("tab_a", "node_b");
  harness.controller.requestNodeFocusForTab("tab_a", null);

  assert.equal(harness.focusedNodeIdByTabId.value.tab_a, null);
  assert.equal(harness.focusRequestByTabId.value.tab_a, null);

  harness.controller.requestNodeFocusForTab("tab_a", "node_c");

  assert.deepEqual(harness.focusRequestByTabId.value.tab_a, {
    nodeId: "node_c",
    sequence: 1,
  });
});

test("useWorkspaceSidePanelController toggles the active side panel without changing other tabs", () => {
  const harness = createSidePanelHarness();

  harness.sidePanelModeByTabId.value = { tab_a: "human-review", tab_b: "state" };
  harness.latestRunDetailByTabId.value = { tab_a: runWithStatus("running") };
  harness.controller.toggleActiveStatePanel();

  assert.equal(harness.sidePanelModeByTabId.value.tab_a, "state");
  assert.equal(harness.statePanelOpenByTabId.value.tab_a, true);
  assert.equal(harness.sidePanelModeByTabId.value.tab_b, "state");

  harness.controller.toggleActiveStatePanel();

  assert.equal(harness.sidePanelModeByTabId.value.tab_a, "state");
  assert.equal(harness.statePanelOpenByTabId.value.tab_a, false);
});

test("useWorkspaceSidePanelController routes locked active toggles back to Human Review", () => {
  const harness = createSidePanelHarness();
  harness.sidePanelModeByTabId.value = { tab_a: "human-review" };
  harness.latestRunDetailByTabId.value = { tab_a: runWithStatus("awaiting_human", "node_review") };

  harness.controller.toggleActiveStatePanel();

  assert.equal(harness.lockedToastCount(), 1);
  assert.deepEqual(harness.closedMenuTabIds, ["tab_a"]);
  assert.equal(harness.focusedNodeIdByTabId.value.tab_a, "node_review");
  assert.equal(harness.statePanelOpenByTabId.value.tab_a, true);
});
