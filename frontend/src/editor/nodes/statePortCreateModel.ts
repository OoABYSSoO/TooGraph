import type { StateDefinition } from "../../types/node-system.ts";
import { defaultValueForStateType, resolveDefaultStateColor, type StateFieldType } from "../workspace/statePanelFields.ts";

export type StatePortSearchField = {
  key: string;
  name: string;
  description: string;
};

export type StatePortDraft = {
  key: string;
  definition: StateDefinition;
};

export const PORT_STATE_CREATE_NEW_VALUE = "__toograph_new_state__";

export type StatePortExistingStateOption = {
  value: string;
  key: string;
  name: string;
  label: string;
  type: string;
};

export function matchesStatePortSearch(field: StatePortSearchField, query: string) {
  const normalizedQuery = normalizeStateSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    normalizeStateSearchText(field.name.trim()),
    normalizeStateSearchText(field.description),
  ].filter(Boolean);

  if (haystacks.some((value) => value.includes(normalizedQuery))) {
    return true;
  }

  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const words = normalizeStateSearchText(field.name).split(" ").filter(Boolean);
  if (queryTerms.length > 0 && queryTerms.every((term) => words.some((word) => word.startsWith(term)))) {
    return true;
  }

  const queryCompact = normalizedQuery.replace(/\s+/g, "");
  const initials = words.map((word) => word[0] ?? "").join("");
  return isSubsequence(queryCompact, initials) || haystacks.some((value) => isSubsequence(queryCompact, value.replace(/\s+/g, "")));
}

export function buildStatePortExistingStateOptions(stateSchema: Record<string, StateDefinition>): StatePortExistingStateOption[] {
  return Object.entries(stateSchema).map(([key, definition]) => {
    const name = definition.name.trim() || key;
    return {
      value: key,
      key,
      name,
      label: `${key} · ${name}`,
      type: definition.type,
    };
  });
}

export function buildStatePortExistingStateDraft(stateKey: string, stateSchema: Record<string, StateDefinition>): StatePortDraft | null {
  const definition = stateSchema[stateKey];
  if (!definition) {
    return null;
  }
  return {
    key: stateKey,
    definition: cloneStateDefinition(definition),
  };
}

export function createStateDraftFromSourceState(
  draft: StatePortDraft,
  source: Pick<StateDefinition, "type" | "value">,
): StatePortDraft {
  const nextType = (source.type?.trim() || draft.definition.type) as StateFieldType;
  const hasValue = Object.prototype.hasOwnProperty.call(source, "value");
  return updateStatePortDraftDefinition(draft, {
    type: nextType,
    value: hasValue ? cloneStateValue(source.value) : defaultValueForStateType(nextType),
  });
}

export function createStateDraftFromQuery(query: string, existingKeys: string[]): StatePortDraft {
  const trimmedQuery = query.trim();
  const key = createIndexedStateKey("state", existingKeys);

  return {
    key,
    definition: {
      name: trimmedQuery || key,
      description: "",
      type: "text",
      value: "",
      color: resolveDefaultStateColor(key, existingKeys),
    },
  };
}

export function updateStatePortDraftName(draft: StatePortDraft, name: string | number) {
  return updateStatePortDraftDefinition(draft, { name: String(name ?? "") });
}

export function updateStatePortDraftDescription(draft: StatePortDraft, description: string | number) {
  return updateStatePortDraftDefinition(draft, { description: String(description ?? "") });
}

export function updateStatePortDraftType(draft: StatePortDraft, type: string | number | boolean | undefined) {
  const nextType = String(type ?? "text") as StateFieldType;
  return updateStatePortDraftDefinition(draft, {
    type: nextType,
    value: defaultValueForStateType(nextType),
  });
}

export function updateStatePortDraftColor(draft: StatePortDraft, color: string | number | boolean | undefined) {
  return updateStatePortDraftDefinition(draft, { color: String(color ?? "") });
}

export function updateStatePortDraftValue(draft: StatePortDraft, value: unknown) {
  return updateStatePortDraftDefinition(draft, { value });
}

function updateStatePortDraftDefinition(draft: StatePortDraft, patch: Partial<StateDefinition>): StatePortDraft {
  return {
    ...draft,
    definition: {
      ...draft.definition,
      ...patch,
    },
  };
}

function cloneStateDefinition(definition: StateDefinition): StateDefinition {
  if (typeof structuredClone === "function") {
    return structuredClone(definition) as StateDefinition;
  }

  const cloned: StateDefinition = { ...definition };
  if (definition.binding) {
    cloned.binding = { ...definition.binding };
  }
  return cloned;
}

function cloneStateValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function createIndexedStateKey(prefix: string, existingKeys: string[]) {
  const existing = new Set(existingKeys);
  let index = 1;
  let nextKey = `${prefix}_${index}`;
  while (existing.has(nextKey)) {
    index += 1;
    nextKey = `${prefix}_${index}`;
  }
  return nextKey;
}

function normalizeStateSearchText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isSubsequence(query: string, target: string) {
  let index = 0;
  for (const character of target) {
    if (character === query[index]) {
      index += 1;
      if (index === query.length) {
        return true;
      }
    }
  }
  return false;
}
