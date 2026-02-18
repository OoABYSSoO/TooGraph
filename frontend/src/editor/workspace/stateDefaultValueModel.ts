import { defaultValueForStateType, type StateFieldType } from "./statePanelFields.ts";
import { translate } from "../../i18n/index.ts";

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
    placeholder: type === "markdown" ? translate("nodeCard.markdownPlaceholder") : translate("common.value"),
  };
}

export function parseStructuredStateDraft(type: StateFieldType, draft: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const parsed = draft.trim() === "" ? defaultValueForStateType(type) : JSON.parse(draft);
    if ((type === "array" || type === "file_list") && !Array.isArray(parsed)) {
      return {
        ok: false,
        error: translate("nodeCard.jsonArrayRequired"),
      };
    }
    if (type === "object" && (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")) {
      return {
        ok: false,
        error: translate("nodeCard.jsonObjectRequired"),
      };
    }
    return {
      ok: true,
      value: parsed,
    };
  } catch {
    return {
      ok: false,
      error: translate("nodeCard.jsonRequired"),
    };
  }
}

export function stringifyStructuredStateValue(type: StateFieldType, value: unknown) {
  return JSON.stringify(value ?? defaultValueForStateType(type), null, 2);
}

function isStructuredStateType(type: StateFieldType) {
  return type === "json" || type === "object" || type === "array" || type === "file_list";
}
