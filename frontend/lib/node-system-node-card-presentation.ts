import type { CanonicalNode } from "./node-system-canonical.ts";

export type NodePortSectionPresentation = {
  inputTitle: string | null;
  outputTitle: string | null;
  inputActionLabel: string | null;
  outputActionLabel: string | null;
  outputVariant: "state" | "branch";
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
