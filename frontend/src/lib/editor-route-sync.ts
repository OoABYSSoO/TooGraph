export type EditorRouteInstruction =
  | {
      type: "restore-run";
      runId: string;
      snapshotId: string | null;
      navigation: "replace";
    }
  | {
      type: "open-new";
      templateId: string | null;
      navigation: "replace";
    }
  | {
      type: "open-existing";
      graphId: string;
      navigation: "none";
    }
  | {
      type: "noop";
    };

export function resolveEditorRouteInstruction(params: {
  routeMode: "root" | "new" | "existing";
  routeGraphId: string | null;
  defaultTemplateId: string | null;
  restoreRunId: string | null;
  restoreSnapshotId: string | null;
  activeTabRouteSignature: string | null;
  routeSignature: string;
  handledRouteSignature: string | null;
}): EditorRouteInstruction {
  if (params.handledRouteSignature === params.routeSignature) {
    return {
      type: "noop",
    };
  }

  if (params.activeTabRouteSignature === params.routeSignature) {
    return {
      type: "noop",
    };
  }

  if (params.routeMode === "new") {
    if (params.restoreRunId) {
      return {
        type: "restore-run",
        runId: params.restoreRunId,
        snapshotId: params.restoreSnapshotId,
        navigation: "replace",
      };
    }
    return {
      type: "open-new",
      templateId: params.defaultTemplateId,
      navigation: "replace",
    };
  }

  if (params.routeMode === "existing" && params.routeGraphId) {
    return {
      type: "open-existing",
      graphId: params.routeGraphId,
      navigation: "none",
    };
  }

  return {
    type: "noop",
  };
}
