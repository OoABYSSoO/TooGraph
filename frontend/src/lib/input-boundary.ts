import type { GraphNode, InputBoundaryConfigType } from "../types/node-system.ts";

export type InputBoundarySelection = "text" | "file" | "folder" | "knowledge_base";

export function isInputBoundaryConfigType(value: unknown): value is InputBoundaryConfigType {
  return (
    value === "text" ||
    value === "file" ||
    value === "knowledge_base" ||
    value === "image" ||
    value === "audio" ||
    value === "video"
  );
}

export function normalizeInputBoundaryConfigType(value: unknown): InputBoundaryConfigType {
  return isInputBoundaryConfigType(value) ? value : "text";
}

export function resolveInputBoundarySelection(type: InputBoundaryConfigType, value?: unknown): InputBoundarySelection {
  if (type === "knowledge_base") {
    return "knowledge_base";
  }
  if (type === "file" && isLocalFolderBoundaryValue(value)) {
    return "folder";
  }
  if (type === "file" || type === "image" || type === "audio" || type === "video") {
    return "file";
  }
  return "text";
}

export function resolveInputNodeVirtualOutputType(node: GraphNode | undefined): InputBoundaryConfigType | null {
  if (!node || node.kind !== "input" || node.writes.length > 0) {
    return null;
  }

  const uploadedType = resolveUploadedAssetTypeFromValue(node.config.value);
  if (uploadedType) {
    return uploadedType;
  }
  return normalizeInputBoundaryConfigType(node.config.boundaryType);
}

function resolveUploadedAssetTypeFromValue(value: unknown): InputBoundaryConfigType | null {
  const parsed = typeof value === "string" ? tryParseJson(value) : value;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as { kind?: unknown; detectedType?: unknown };
  if (candidate.kind !== "uploaded_file") {
    return null;
  }
  return isInputBoundaryConfigType(candidate.detectedType) ? candidate.detectedType : null;
}

function isLocalFolderBoundaryValue(value: unknown): boolean {
  const parsed = typeof value === "string" ? tryParseJson(value) : value;
  return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as { kind?: unknown }).kind === "local_folder");
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
