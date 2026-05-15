import type { OutputNode } from "@/types/node-system";

export type OutputDisplayMode = OutputNode["config"]["displayMode"];
export type OutputPersistFormat = OutputNode["config"]["persistFormat"];

export type OutputConfigOption<T extends string> = {
  value: T;
  label: string;
};

export const OUTPUT_DISPLAY_MODE_OPTIONS: Array<OutputConfigOption<OutputDisplayMode>> = [
  { value: "auto", label: "AUTO" },
  { value: "plain", label: "PLAIN" },
  { value: "markdown", label: "MD" },
  { value: "html", label: "HTML" },
  { value: "json", label: "JSON" },
  { value: "documents", label: "DOCS" },
];

export const OUTPUT_PERSIST_FORMAT_OPTIONS: Array<OutputConfigOption<OutputPersistFormat>> = [
  { value: "auto", label: "AUTO" },
  { value: "txt", label: "TXT" },
  { value: "md", label: "MD" },
  { value: "json", label: "JSON" },
];

export function formatOutputDisplayModeLabel(displayMode: string) {
  switch (displayMode) {
    case "markdown":
      return "MD";
    case "html":
      return "HTML";
    case "plain":
      return "PLAIN";
    case "json":
      return "JSON";
    case "documents":
      return "DOCS";
    case "package":
      return "PAGES";
    default:
      return "AUTO";
  }
}

export function formatOutputPersistFormatLabel(persistFormat: OutputPersistFormat) {
  switch (persistFormat) {
    case "md":
      return "MD";
    case "txt":
      return "TXT";
    case "json":
      return "JSON";
    default:
      return "AUTO";
  }
}

export function isOutputDisplayModeActive(currentDisplayMode: string | null, displayMode: OutputDisplayMode) {
  return currentDisplayMode === displayMode;
}

export function isOutputPersistFormatActive(currentPersistFormat: OutputPersistFormat | null, persistFormat: OutputPersistFormat) {
  return currentPersistFormat === persistFormat;
}

export function resolveOutputPersistEnabledPatch(value: string | number | boolean): Pick<OutputNode["config"], "persistEnabled"> {
  return { persistEnabled: Boolean(value) };
}

export function resolveOutputFileNameTemplatePatch(value: string | number): Pick<OutputNode["config"], "fileNameTemplate"> | null {
  if (typeof value !== "string") {
    return null;
  }
  return { fileNameTemplate: value };
}
