import type { ComputedRef, Ref } from "vue";

import { resolveEditorRouteInstruction } from "../../lib/editor-route-sync.ts";
import { resolveWorkspaceTabUrl, type EditorWorkspaceTab } from "../../lib/editor-workspace.ts";

type WorkspaceRouteMode = "root" | "new" | "existing";
type WorkspaceRouteTab = Pick<EditorWorkspaceTab, "graphId" | "kind" | "templateId" | "defaultTemplateId" | "subgraphSource">;
type RouteNavigation = "push" | "replace" | "none";

type WorkspaceRouteControllerInput = {
  routeMode: () => WorkspaceRouteMode;
  routeGraphId: () => string | null;
  defaultTemplateId: () => string | null;
  restoreRunId: () => string | null;
  restoreSnapshotId: () => string | null;
  activeTabRouteSignature: ComputedRef<string | null> | Ref<string | null>;
  routeSignature: ComputedRef<string> | Ref<string>;
  handledRouteSignature: Ref<string | null>;
  routeRestoreError: Ref<string | null>;
  currentRouteFullPath: () => string;
  pushRoute: (targetUrl: string) => void | Promise<unknown>;
  replaceRoute: (targetUrl: string) => void | Promise<unknown>;
  openRestoredRunTab: (runId: string, snapshotId: string | null, navigation: Extract<RouteNavigation, "replace">) => void;
  openNewTab: (templateId: string | null, navigation: Extract<RouteNavigation, "replace">) => void;
  openExistingGraph: (graphId: string, navigation: Extract<RouteNavigation, "none">) => void;
};

export function useWorkspaceRouteController(input: WorkspaceRouteControllerInput) {
  function syncRouteToUrl(targetUrl: string, mode: "push" | "replace" = "push") {
    if (input.currentRouteFullPath() === targetUrl) {
      return;
    }
    if (mode === "replace") {
      void input.replaceRoute(targetUrl);
      return;
    }
    void input.pushRoute(targetUrl);
  }

  function syncRouteToTab(tab: WorkspaceRouteTab, mode: "push" | "replace" = "push") {
    syncRouteToUrl(resolveWorkspaceTabUrl(tab), mode);
  }

  function applyCurrentRouteInstruction() {
    const instruction = resolveEditorRouteInstruction({
      routeMode: input.routeMode(),
      routeGraphId: input.routeGraphId(),
      defaultTemplateId: input.defaultTemplateId(),
      restoreRunId: input.restoreRunId(),
      restoreSnapshotId: input.restoreSnapshotId(),
      activeTabRouteSignature: input.activeTabRouteSignature.value,
      routeSignature: input.routeSignature.value,
      handledRouteSignature: input.handledRouteSignature.value,
    });

    if (instruction.type === "restore-run") {
      input.openRestoredRunTab(instruction.runId, instruction.snapshotId ?? null, instruction.navigation);
      return;
    }

    if (instruction.type === "open-new") {
      input.routeRestoreError.value = null;
      input.openNewTab(instruction.templateId, instruction.navigation);
      return;
    }

    if (instruction.type === "open-existing") {
      input.routeRestoreError.value = null;
      input.openExistingGraph(instruction.graphId, instruction.navigation);
      return;
    }

    input.handledRouteSignature.value = input.routeSignature.value;
  }

  return {
    applyCurrentRouteInstruction,
    syncRouteToUrl,
    syncRouteToTab,
  };
}
