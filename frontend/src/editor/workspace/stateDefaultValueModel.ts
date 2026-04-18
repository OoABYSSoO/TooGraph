import { defaultValueForStateType, type StateFieldType } from "./statePanelFields.ts";

export type StateDefaultValueEditorMode = "boolean" | "number" | "structured" | "text";

export type StateDefaultValueEditorConfig = {
  mode: StateDefaultValueEditorMode;
  rows: number;
  placeholder: string;
};

export function resolveStateDefaultValueEditorConfig(type: StateFieldType): StateDefaultValueEditorConfig {
  if (type === "boolean") {
    return {
      mode: "boolean",
      rows: 0,
      placeholder: "",
    };
  }

  if (type === "number") {
    return {
      mode: "number",
      rows: 1,
      placeholder: "0",
    };
  }

  if (isStructuredStateType(type)) {
    return {
      mode: "structured",
      rows: 5,
      placeholder: type === "array" || type === "file_list" ? "[]" : "{}",
    };
  }

  return {
    mode: "text",
    rows: type === "markdown" ? 5 : 3,
    placeholder: type === "markdown" ? "Write markdown..." : "Value",
  };
}

export function parseStructuredStateDraft(type: StateFieldType, draft: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const parsed = draft.trim() === "" ? defaultValueForStateType(type) : JSON.parse(draft);
    if ((type === "array" || type === "file_list") && !Array.isArray(parsed)) {
      return {
        ok: false,
        error: "This state type requires a JSON array.",
      };
    }
    if (type === "object" && (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")) {
      return {
        ok: false,
        error: "This state type requires a JSON object.",
      };
    }
    return {
      ok: true,
      value: parsed,
    };
  } catch {
    return {
      ok: false,
      error: "Default value must be valid JSON.",
    };
  }
}

export function stringifyStructuredStateValue(type: StateFieldType, value: unknown) {
  return JSON.stringify(value ?? defaultValueForStateType(type), null, 2);
}

function isStructuredStateType(type: StateFieldType) {
  return type === "json" || type === "object" || type === "array" || type === "file_list";
}
