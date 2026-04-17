import type { CanonicalNode } from "./node-system-canonical.ts";

export type NodePortSectionPresentation = {
  inputTitle: string | null;
  outputTitle: string | null;
  inputActionLabel: string | null;
  outputActionLabel: string | null;
  outputVariant: "state" | "branch";
};

export type FlowHandlePlacement = {
  showFlowInput: boolean;
  showFlowOutput: boolean;
  placement: "title-row" | "custom";
};

export type NodeHandleRailPresentation = {
  railWidthClass: string;
  sharedGridClass: string;
  leadingContentClass: string;
  trailingContentClass: string;
};

export type NodeTitleFlowOverlayPresentation = {
  overlayGridClass: string;
  inputCellClass: string;
  outputCellClass: string;
};

export function getNodePortSectionPresentation(kind: CanonicalNode["kind"]): NodePortSectionPresentation {
  if (kind === "condition") {
    return {
      inputTitle: null,
      outputTitle: null,
      inputActionLabel: "input",
      outputActionLabel: "branch",
      outputVariant: "branch",
    };
  }

  if (kind === "agent") {
    return {
      inputTitle: null,
      outputTitle: null,
      inputActionLabel: "input",
      outputActionLabel: "output",
      outputVariant: "state",
    };
  }

  return {
    inputTitle: null,
    outputTitle: null,
    inputActionLabel: null,
    outputActionLabel: null,
    outputVariant: "state",
  };
}

export function getFlowHandlePlacement(kind: CanonicalNode["kind"]): FlowHandlePlacement {
  switch (kind) {
    case "input":
      return {
        showFlowInput: false,
        showFlowOutput: true,
        placement: "title-row",
      };
    case "agent":
      return {
        showFlowInput: true,
        showFlowOutput: true,
        placement: "title-row",
      };
    case "output":
      return {
        showFlowInput: true,
        showFlowOutput: false,
        placement: "title-row",
      };
    case "condition":
    default:
      return {
        showFlowInput: false,
        showFlowOutput: false,
        placement: "custom",
      };
  }
}

export function getNodeHandleRailPresentation(): NodeHandleRailPresentation {
  return {
    railWidthClass: "w-5",
    sharedGridClass: "grid grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center",
    leadingContentClass: "pl-2",
    trailingContentClass: "pr-2",
  };
}

export function getNodeTitleFlowOverlayPresentation(kind: CanonicalNode["kind"]): NodeTitleFlowOverlayPresentation | null {
  switch (kind) {
    case "agent":
      return {
        overlayGridClass: "grid grid-cols-2 items-center gap-x-6",
        inputCellClass: "justify-start",
        outputCellClass: "justify-end",
      };
    case "input":
      return {
        overlayGridClass: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3",
        inputCellClass: "justify-start",
        outputCellClass: "justify-end",
      };
    case "output":
      return {
        overlayGridClass: "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3",
        inputCellClass: "justify-start",
        outputCellClass: "justify-end",
      };
    case "condition":
    default:
      return null;
  }
}
