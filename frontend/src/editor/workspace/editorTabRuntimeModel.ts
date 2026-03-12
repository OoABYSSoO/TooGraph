export function omitTabScopedRecordEntry<T>(record: Record<string, T>, tabId: string): Record<string, T> {
  const nextRecord = { ...record };
  delete nextRecord[tabId];
  return nextRecord;
}

export function setTabScopedRecordEntry<T>(record: Record<string, T>, tabId: string, value: T): Record<string, T> {
  return {
    ...record,
    [tabId]: value,
  };
}
