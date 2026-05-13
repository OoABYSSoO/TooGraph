import { cloneGraphDocument } from "../../lib/graph-document.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";

export type SaveMetadataTarget = "graph" | "template";

export type SaveMetadataRequest = {
  document: GraphPayload | GraphDocument;
  target: SaveMetadataTarget;
};

export type SaveMetadataDraft = {
  name: string;
  description: string;
};

const DEFAULT_SAVE_NAMES = new Set(["Untitled Graph", "Node System Playground"]);

export function isDefaultGraphSaveName(name: string | null | undefined) {
  const normalizedName = String(name ?? "").trim();
  return !normalizedName || DEFAULT_SAVE_NAMES.has(normalizedName);
}

export function shouldRequestSaveMetadata(document: GraphPayload | GraphDocument) {
  return isDefaultGraphSaveName(document.name);
}

export function readGraphSaveDescription(document: GraphPayload | GraphDocument) {
  const description = document.metadata.description;
  return typeof description === "string" ? description : "";
}

export function applyGraphSaveMetadata<T extends GraphPayload | GraphDocument>(document: T, draft: SaveMetadataDraft): T {
  const nextName = draft.name.trim();
  if (!nextName) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  nextDocument.name = nextName;
  nextDocument.metadata = {
    ...nextDocument.metadata,
    description: draft.description.trim(),
  };
  return nextDocument;
}
