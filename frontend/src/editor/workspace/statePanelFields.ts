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
  | "markdown"
  | "json"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "knowledge_base"
  | "capability"
  | "result_package";

export type StateColorOption = {
  value: string;
  label: string;
  swatch: string;
};

const STATE_KEY_COUNTER_METADATA_KEY = "graphiteui_state_key_counter";

export const STATE_FIELD_TYPE_OPTIONS: StateFieldType[] = [
  "text",
  "number",
  "boolean",
  "markdown",
  "json",
  "image",
  "audio",
  "video",
  "file",
  "knowledge_base",
  "capability",
  "result_package",
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

const DEFAULT_STATE_COLOR_VALUES = STATE_COLOR_OPTIONS.map((option) => option.value).filter(Boolean);

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

export function resolveDefaultStateColor(stateKey: string, existingKeys: string[] = []) {
  const match = stateKey.match(/^state_(\d+)$/);
  const seed = match ? Number(match[1]) - 1 : existingKeys.length;
  const normalizedSeed = Number.isInteger(seed) && seed >= 0 ? seed : 0;
  return DEFAULT_STATE_COLOR_VALUES[normalizedSeed % DEFAULT_STATE_COLOR_VALUES.length] ?? "#d97706";
}

export function buildDefaultStateField(existingKeys: string[], startIndex = 1) {
  let index = Math.max(1, Math.floor(startIndex));
  while (existingKeys.includes(`state_${index}`)) {
    index += 1;
  }

  const key = `state_${index}`;
  return {
    key,
    definition: {
      name: `State ${index}`,
      description: "",
      type: "text" as const,
      value: defaultValueForStateType("text"),
      color: resolveDefaultStateColor(key, existingKeys),
    },
  };
}

export function buildNextDefaultStateField(
  document: GraphPayload | GraphDocument,
  definitionPatch: Partial<StateDefinition> = {},
): StateFieldDraft {
  const nextField = buildDefaultStateField(Object.keys(document.state_schema), resolveNextDefaultStateKeyIndex(document));
  const nextType = (definitionPatch.type ?? nextField.definition.type) as StateFieldType;
  const hasValuePatch = Object.prototype.hasOwnProperty.call(definitionPatch, "value");
  const hasColorPatch = Object.prototype.hasOwnProperty.call(definitionPatch, "color");
  const nextColor =
    hasColorPatch && typeof definitionPatch.color === "string" && definitionPatch.color.trim()
      ? definitionPatch.color
      : nextField.definition.color;
  return {
    key: nextField.key,
    definition: {
      ...nextField.definition,
      ...definitionPatch,
      type: nextType,
      value: hasValuePatch ? definitionPatch.value : defaultValueForStateType(nextType),
      color: nextColor,
    },
  };
}

export function addStateFieldToDocument<T extends GraphPayload | GraphDocument>(document: T): T {
  const nextField = buildNextDefaultStateField(document);
  const nextDocument = insertStateFieldIntoDocument(document, nextField);
  if (nextDocument === document) {
    return document;
  }
  rememberDefaultStateKeyIndex(nextDocument, nextField.key);
  return nextDocument;
}

export function insertStateFieldIntoDocument<T extends GraphPayload | GraphDocument>(document: T, field: StateFieldDraft): T {
  if (document.state_schema[field.key]) {
    return document;
  }
  const nextDocument = cloneGraphDocument(document);
  nextDocument.state_schema[field.key] = field.definition;
  rememberDefaultStateKeyIndex(nextDocument, field.key);
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

export function listStateFieldUsageLabels(document: GraphPayload | GraphDocument, stateKey: string): string[] {
  const labels: string[] = [];
  const seenNodeIds = new Set<string>();

  for (const [nodeId, node] of Object.entries(document.nodes)) {
    const usesState =
      node.reads.some((binding) => binding.state === stateKey) ||
      node.writes.some((binding) => binding.state === stateKey) ||
      (node.kind === "condition" && node.config.rule.source === stateKey);

    if (!usesState || seenNodeIds.has(nodeId)) {
      continue;
    }

    seenNodeIds.add(nodeId);
    labels.push(node.name.trim() || nodeId);
  }

  return labels;
}

function resolveNextDefaultStateKeyIndex(document: GraphPayload | GraphDocument) {
  return Math.max(readDefaultStateKeyCounter(document), readHighestDefaultStateKeyIndex(Object.keys(document.state_schema))) + 1;
}

function readDefaultStateKeyCounter(document: GraphPayload | GraphDocument) {
  const value = document.metadata[STATE_KEY_COUNTER_METADATA_KEY];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function readHighestDefaultStateKeyIndex(keys: string[]) {
  return keys.reduce((highest, key) => {
    const match = key.match(/^state_(\d+)$/);
    if (!match) {
      return highest;
    }
    const index = Number(match[1]);
    return Number.isInteger(index) && index > highest ? index : highest;
  }, 0);
}

export function rememberDefaultStateKeyIndex(document: GraphPayload | GraphDocument, stateKey: string) {
  const match = stateKey.match(/^state_(\d+)$/);
  if (!match) {
    return;
  }
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index <= 0) {
    return;
  }
  document.metadata = {
    ...document.metadata,
    [STATE_KEY_COUNTER_METADATA_KEY]: Math.max(readDefaultStateKeyCounter(document), index),
  };
}

export function deleteStateFieldFromDocument<T extends GraphPayload | GraphDocument>(document: T, stateKey: string): T {
  if (!document.state_schema[stateKey] || listStateFieldUsageLabels(document, stateKey).length > 0) {
    return document;
  }

  const nextDocument = cloneGraphDocument(document);
  const { [stateKey]: _, ...restStateSchema } = nextDocument.state_schema;
  nextDocument.state_schema = restStateSchema;

  return nextDocument;
}

export function formatStateValueInput(type: StateFieldType, value: unknown) {
  if (type === "json" || type === "capability" || type === "result_package") {
    return JSON.stringify(value ?? defaultValueForStateType(type), null, 2);
  }
  if (isFileReferenceStateType(type) && (Array.isArray(value) || (value !== null && typeof value === "object"))) {
    return JSON.stringify(value, null, 2);
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
  if (type === "json" || type === "capability" || type === "result_package") {
    try {
      return JSON.parse(input || JSON.stringify(defaultValueForStateType(type)));
    } catch {
      return defaultValueForStateType(type);
    }
  }
  if (isFileReferenceStateType(type)) {
    return parseFileReferenceStateInput(input);
  }
  return input;
}

export function defaultValueForStateType(type: StateFieldType): unknown {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "json":
      return {};
    case "capability":
      return { kind: "none" };
    case "result_package":
      return {};
    default:
      return "";
  }
}

function isFileReferenceStateType(type: StateFieldType) {
  return type === "file" || type === "image" || type === "audio" || type === "video";
}

function parseFileReferenceStateInput(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    return input;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}
