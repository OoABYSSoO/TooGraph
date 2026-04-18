import type { StateDefinition } from "../../types/node-system.ts";

export type StatePortSearchField = {
  key: string;
  name: string;
  description: string;
};

export type StatePortDraft = {
  key: string;
  definition: StateDefinition;
};

export function matchesStatePortSearch(field: StatePortSearchField, query: string) {
  const normalizedQuery = normalizeStateSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    normalizeStateSearchText(field.name.trim() || field.key),
    normalizeStateSearchText(field.key),
    normalizeStateSearchText(field.description),
  ];

  if (haystacks.some((value) => value.includes(normalizedQuery))) {
    return true;
  }

  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const words = normalizeStateSearchText(`${field.name} ${field.key}`).split(" ").filter(Boolean);
  if (queryTerms.length > 0 && queryTerms.every((term) => words.some((word) => word.startsWith(term)))) {
    return true;
  }

  const queryCompact = normalizedQuery.replace(/\s+/g, "");
  const initials = words.map((word) => word[0] ?? "").join("");
  return isSubsequence(queryCompact, initials) || haystacks.some((value) => isSubsequence(queryCompact, value.replace(/\s+/g, "")));
}

export function createStateDraftFromQuery(query: string, existingKeys: string[]): StatePortDraft {
  const trimmedQuery = query.trim();
  const key = createStateKey(trimmedQuery || "state", existingKeys);

  return {
    key,
    definition: {
      name: trimmedQuery || key,
      description: "",
      type: "text",
      value: "",
      color: "",
    },
  };
}

function createStateKey(base: string, existingKeys: string[]) {
  const normalizedBase = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "state";
  let nextKey = normalizedBase;
  let index = 2;
  const existing = new Set(existingKeys);

  while (existing.has(nextKey)) {
    nextKey = `${normalizedBase}_${index}`;
    index += 1;
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
