export function listConditionBranchMappingKeys(branchMapping: Record<string, string>, branchKey: string) {
  return Object.entries(branchMapping)
    .filter(([, mappedBranchKey]) => mappedBranchKey === branchKey)
    .map(([mappingKey]) => mappingKey);
}

export function createConditionBranchKey(existingKeys: string[]) {
  let index = existingKeys.length + 1;
  let candidate = `branch_${index}`;
  while (existingKeys.includes(candidate)) {
    index += 1;
    candidate = `branch_${index}`;
  }
  return candidate;
}

export function parseConditionBranchMappingDraft(raw: string) {
  const seen = new Set<string>();
  const nextKeys: string[] = [];

  for (const token of raw.split(",")) {
    const normalized = token.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    nextKeys.push(normalized);
  }

  return nextKeys;
}

export function applyConditionBranchMapping(
  branchMapping: Record<string, string>,
  currentBranchKey: string,
  nextBranchKey: string,
  mappingKeys: string[],
) {
  const normalizedNextBranchKey = nextBranchKey.trim();
  if (!normalizedNextBranchKey) {
    return branchMapping;
  }

  const filteredEntries = Object.entries(branchMapping).filter(
    ([, mappedBranchKey]) => mappedBranchKey !== currentBranchKey && mappedBranchKey !== normalizedNextBranchKey,
  );

  for (const mappingKey of mappingKeys) {
    filteredEntries.push([mappingKey, normalizedNextBranchKey]);
  }

  return Object.fromEntries(filteredEntries);
}
