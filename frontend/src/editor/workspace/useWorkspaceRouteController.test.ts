import assert from "node:assert/strict";
import test from "node:test";
import { computed, ref } from "vue";

import type { EditorWorkspaceTab } from "@/lib/editor-workspace";

import { useWorkspaceRouteController } from "./useWorkspaceRouteController.ts";

function createRouteHarness() {
  const routeMode = ref<"root" | "new" | "existing">("new");
  const routeGraphId = ref<string | null>(null);
  const defaultTemplateId = ref<string | null>(null);
  const restoreRunId = ref<string | null>(null);
  const restoreSnapshotId = ref<string | null>(null);
  const activeTabRouteSignature = ref<string | null>(null);
  const routeSignature = computed(() => {
    if (routeMode.value === "existing") {
      return `existing:${routeGraphId.value ?? ""}`;
    }
    if (routeMode.value === "new") {
      if (restoreRunId.value) {
        return `restore:${restoreRunId.value}:${restoreSnapshotId.value ?? ""}`;
      }
      return `new:${defaultTemplateId.value ?? ""}`;
    }
    return "root";
  });
  const handledRouteSignature = ref<string | null>(null);
  const routeRestoreError = ref<string | null>("stale");
  const currentRouteFullPath = ref("/editor/new");
  const pushedUrls: string[] = [];
  const replacedUrls: string[] = [];
  const openedNewTabs: Array<{ templateId: string | null; navigation: string }> = [];
  const openedExistingGraphs: Array<{ graphId: string; navigation: string }> = [];
  const restoredRuns: Array<{ runId: string; snapshotId: string | null; navigation: string }> = [];

  const controller = useWorkspaceRouteController({
    routeMode: () => routeMode.value,
    routeGraphId: () => routeGraphId.value,
    defaultTemplateId: () => defaultTemplateId.value,
    restoreRunId: () => restoreRunId.value,
    restoreSnapshotId: () => restoreSnapshotId.value,
    activeTabRouteSignature,
    routeSignature,
    handledRouteSignature,
    routeRestoreError,
    currentRouteFullPath: () => currentRouteFullPath.value,
    pushRoute: async (url) => {
      pushedUrls.push(url);
    },
    replaceRoute: async (url) => {
      replacedUrls.push(url);
    },
    openRestoredRunTab: (runId, snapshotId, navigation) => {
      restoredRuns.push({ runId, snapshotId, navigation });
    },
    openNewTab: (templateId, navigation) => {
      openedNewTabs.push({ templateId, navigation });
    },
    openExistingGraph: (graphId, navigation) => {
      openedExistingGraphs.push({ graphId, navigation });
    },
  });

  return {
    routeMode,
    routeGraphId,
    defaultTemplateId,
    restoreRunId,
    restoreSnapshotId,
    activeTabRouteSignature,
    handledRouteSignature,
    routeRestoreError,
    currentRouteFullPath,
    pushedUrls,
    replacedUrls,
    openedNewTabs,
    openedExistingGraphs,
    restoredRuns,
    controller,
  };
}

test("useWorkspaceRouteController syncs tab routes with push and replace", () => {
  const harness = createRouteHarness();
  const tab = {
    graphId: "graph_a",
    kind: "existing",
    templateId: null,
    defaultTemplateId: null,
    subgraphSource: null,
  } satisfies Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId" | "subgraphSource">;

  harness.controller.syncRouteToTab(tab);
  harness.controller.syncRouteToTab(tab, "replace");
  harness.currentRouteFullPath.value = "/editor/graph_a";
  harness.controller.syncRouteToTab(tab);

  assert.deepEqual(harness.pushedUrls, ["/editor/graph_a"]);
  assert.deepEqual(harness.replacedUrls, ["/editor/graph_a"]);
});

test("useWorkspaceRouteController dispatches route instructions without owning open behavior", () => {
  const harness = createRouteHarness();

  harness.defaultTemplateId.value = "template_a";
  harness.controller.applyCurrentRouteInstruction();
  assert.deepEqual(harness.openedNewTabs, [{ templateId: "template_a", navigation: "replace" }]);
  assert.equal(harness.routeRestoreError.value, null);

  harness.routeMode.value = "existing";
  harness.routeGraphId.value = "graph_a";
  harness.controller.applyCurrentRouteInstruction();
  assert.deepEqual(harness.openedExistingGraphs, [{ graphId: "graph_a", navigation: "none" }]);

  harness.routeMode.value = "new";
  harness.restoreRunId.value = "run_a";
  harness.restoreSnapshotId.value = "snapshot_a";
  harness.controller.applyCurrentRouteInstruction();
  assert.deepEqual(harness.restoredRuns, [{ runId: "run_a", snapshotId: "snapshot_a", navigation: "replace" }]);
});

