export type EditorRouteInstruction =
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
  routeSignature: string;
  handledRouteSignature: string | null;
}): EditorRouteInstruction {
  if (params.handledRouteSignature === params.routeSignature) {
    return {
      type: "noop",
    };
  }

  if (params.routeMode === "new") {
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
