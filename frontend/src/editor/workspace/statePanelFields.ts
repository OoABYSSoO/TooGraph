import { cloneGraphDocument } from "../../lib/graph-document.ts";
import type { GraphDocument, GraphPayload, StateDefinition } from "../../types/node-system.ts";

export type StateFieldDraft = {
  key: string;
  definition: StateDefinition;
};

export type StateFieldType =
  | "text"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "markdown"
  | "json"
  | "file_list"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "knowledge_base";

export type StateColorOption = {
  value: string;
  label: string;
  swatch: string;
};

export const STATE_FIELD_TYPE_OPTIONS: StateFieldType[] = [
  "text",
  "number",
  "boolean",
  "object",
  "array",
  "markdown",
  "json",
  "file_list",
  "image",
  "audio",
  "video",
  "file",
  "knowledge_base",
];

export const STATE_COLOR_OPTIONS: StateColorOption[] = [
  { value: "", label: "Auto", swatch: "#d97706" },
  { value: "#d97706", label: "Amber", swatch: "#d97706" },
  { value: "#2563eb", label: "Blue", swatch: "#2563eb" },
  { value: "#7c3aed", label: "Violet", swatch: "#7c3aed" },
  { value: "#10b981", label: "Emerald", swatch: "#10b981" },
  { value: "#0891b2", label: "Cyan", swatch: "#0891b2" },
  { value: "#e11d48", label: "Rose", swatch: "#e11d48" },
  { value: "#475569", label: "Slate", swatch: "#475569" },
  { value: "#9a3412", label: "Walnut", swatch: "#9a3412" },
];

export function resolveStateColorOptions(currentColor: string): StateColorOption[] {
  const normalized = currentColor.trim();
  if (!normalized) {
    return STATE_COLOR_OPTIONS;
  }

  if (STATE_COLOR_OPTIONS.some((option) => option.value === normalized)) {
    return STATE_COLOR_OPTIONS;
  }

  return [
    { value: normalized, label: normalized.toUpperCase(), swatch: normalized },
    ...STATE_COLOR_OPTIONS,
  ];
}

export function buildDefaultStateField(existingKeys: string[]) {
  let index = 1;
  while (existingKeys.includes(`state_${index}`)) {
    index += 1;
  }

  const key = `state_${index}`;
  return {
    key,
    definition: {
      name: key,
      description: "",
      type: "text" as const,
      value: defaultValueForStateType("text"),
      color: "",
    },
  };
}

export function addStateFieldToDocument<T extends GraphPayload | GraphDocument>(document: T): T {
  const nextField = buildDefaultStateField(Object.keys(document.state_schema));
  return insertStateFieldIntoDocument(document, nextField);
}

export function insertStateFieldIntoDocument<T extends GraphPayload | GraphDocument>(document: T, field: StateFieldDraft): T {
  if (document.state_schema[field.key]) {
    return document;
  }
  const nextDocument = cloneGraphDocument(document);
  nextDocument.state_schema[field.key] = field.definition;
  return nextDocument;
}

export function updateStateFieldInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  stateKey: string,
  updater: (current: StateDefinition) => StateDefinition,
): T {
  const current = document.state_schema[stateKey];
  if (!current) {
    return document;
  }
  const nextDefinition = updater(current);
  if (JSON.stringify(nextDefinition) === JSON.stringify(current)) {
    return document;
  }
  const nextDocument = cloneGraphDocument(document);
  nextDocument.state_schema[stateKey] = nextDefinition;
  if (JSON.stringify(nextDefinition.value) !== JSON.stringify(current.value)) {
    for (const node of Object.values(nextDocument.nodes)) {
      if (node.kind === "input" && node.writes.some((binding) => binding.state === stateKey)) {
        node.config.value = nextDefinition.value;
      }
    }
  }
  return nextDocument;
}

export function renameStateFieldInDocument<T extends GraphPayload | GraphDocument>(
  document: T,
  currentKey: string,
  nextKey: string,
): T {
  const normalizedNextKey = nextKey.trim();
  if (!normalizedNextKey || normalizedNextKey === currentKey || document.state_schema[normalizedNextKey]) {
    return document;
  }

  const currentDefinition = document.state_schema[currentKey];
  if (!currentDefinition) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const { [currentKey]: _, ...restStateSchema } = nextDocument.state_schema;
  nextDocument.state_schema = {
    ...restStateSchema,
    [normalizedNextKey]: {
      ...currentDefinition,
      name: currentDefinition.name || normalizedNextKey,
    },
  };

  for (const node of Object.values(nextDocument.nodes)) {
    node.reads = node.reads.map((binding) => (binding.state === currentKey ? { ...binding, state: normalizedNextKey } : binding));
    node.writes = node.writes.map((binding) => (binding.state === currentKey ? { ...binding, state: normalizedNextKey } : binding));

    if (node.kind === "condition" && node.config.rule.source === currentKey) {
      node.config.rule.source = normalizedNextKey;
    }
  }

  return nextDocument;
}

export function deleteStateFieldFromDocument<T extends GraphPayload | GraphDocument>(document: T, stateKey: string): T {
  if (!document.state_schema[stateKey]) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const { [stateKey]: _, ...restStateSchema } = nextDocument.state_schema;
  nextDocument.state_schema = restStateSchema;

  for (const node of Object.values(nextDocument.nodes)) {
    node.reads = node.reads.filter((binding) => binding.state !== stateKey);
    node.writes = node.writes.filter((binding) => binding.state !== stateKey);

    if (node.kind === "condition" && node.config.rule.source === stateKey) {
      node.config.rule.source = node.reads[0]?.state ?? "";
    }
  }

  return nextDocument;
}

export function formatStateValueInput(type: StateFieldType, value: unknown) {
  if (type === "json" || type === "object" || type === "array" || type === "file_list") {
    return JSON.stringify(value ?? defaultValueForStateType(type), null, 2);
  }
  if (type === "boolean") {
    return String(Boolean(value));
  }
  if (type === "number") {
    return String(typeof value === "number" ? value : 0);
  }
  return typeof value === "string" ? value : String(value ?? "");
}

export function parseStateValueInput(type: StateFieldType, input: string): unknown {
  if (type === "number") {
    const nextValue = Number(input);
    return Number.isFinite(nextValue) ? nextValue : 0;
  }
  if (type === "boolean") {
    return input === "true";
  }
  if (type === "json" || type === "object" || type === "array" || type === "file_list") {
    try {
      return JSON.parse(input || JSON.stringify(defaultValueForStateType(type)));
    } catch {
      return defaultValueForStateType(type);
    }
  }
  return input;
}

export function defaultValueForStateType(type: StateFieldType): unknown {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "object":
    case "json":
      return {};
    case "array":
    case "file_list":
      return [];
    default:
      return "";
  }
}
