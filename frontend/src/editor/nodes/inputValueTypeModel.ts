import type { StateFieldType } from "../workspace/statePanelFields.ts";

export type InputBoundaryType = "text" | "file" | "knowledge_base" | "image" | "audio" | "video";

export function resolveStateTypeForInputBoundary(type: InputBoundaryType): StateFieldType {
  return type;
}

export function resolveNextInputValueForBoundaryType(input: {
  nextType: Extract<InputBoundaryType, "text" | "file" | "knowledge_base">;
  currentType: string | null;
  currentValue: unknown;
  knowledgeBaseNames: string[];
}) {
  if (input.nextType === "knowledge_base") {
    return input.knowledgeBaseNames[0] ?? "";
  }

  if (input.nextType === "file") {
    return "";
  }

  if (input.currentType === "knowledge_base") {
    return "";
  }

  if (isUploadedAssetBoundaryType(input.currentType)) {
    return "";
  }

  return typeof input.currentValue === "string" ? input.currentValue : "";
}

export function isSwitchableInputBoundaryType(type: string): type is Extract<InputBoundaryType, "text" | "file" | "knowledge_base"> {
  return type === "text" || type === "file" || type === "knowledge_base";
}

function isUploadedAssetBoundaryType(type: string | null) {
  return type === "file" || type === "image" || type === "audio" || type === "video";
}
