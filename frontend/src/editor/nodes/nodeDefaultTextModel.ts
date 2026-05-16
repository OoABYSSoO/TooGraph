import type { GraphNode } from "../../types/node-system.ts";

type NodeDefaultText = {
  title: string;
  description: string;
};

const DEFAULT_NODE_TEXT_BY_KIND: Partial<Record<GraphNode["kind"], NodeDefaultText>> = {
  input: {
    title: "Input",
    description: "Provide a value to the current workflow.",
  },
  output: {
    title: "Output",
    description: "Preview or persist the current workflow result.",
  },
};

export function resolveDefaultNodeTitle(kind: string | undefined) {
  return resolveDefaultNodeText(kind)?.title ?? "";
}

export function resolveDefaultNodeDescription(kind: string | undefined) {
  return resolveDefaultNodeText(kind)?.description ?? "";
}

export function resolveNodeDisplayTitle(kind: string | undefined, value: string) {
  return value.trim() || resolveDefaultNodeTitle(kind);
}

export function resolveNodeDisplayDescription(kind: string | undefined, value: string) {
  return value.trim() || resolveDefaultNodeDescription(kind) || "No description yet.";
}

export function resolveNodeEditableTitle(kind: string | undefined, value: string) {
  return isDefaultNodeTitle(kind, value) ? "" : value;
}

export function resolveNodeEditableDescription(kind: string | undefined, value: string) {
  return isDefaultNodeDescription(kind, value) ? "" : value;
}

export function isDefaultNodeTitle(kind: string | undefined, value: string) {
  const defaultTitle = resolveDefaultNodeTitle(kind);
  return Boolean(defaultTitle && value.trim() === defaultTitle);
}

export function isDefaultNodeDescription(kind: string | undefined, value: string) {
  const defaultDescription = resolveDefaultNodeDescription(kind);
  return Boolean(defaultDescription && value.trim() === defaultDescription);
}

function resolveDefaultNodeText(kind: string | undefined) {
  if (kind !== "input" && kind !== "output") {
    return null;
  }
  return DEFAULT_NODE_TEXT_BY_KIND[kind] ?? null;
}
