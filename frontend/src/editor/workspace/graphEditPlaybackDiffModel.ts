import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { GraphEditPlaybackAuditDiffEntry } from "@/buddy/graphEditPlaybackAudit";

export function buildGraphEditPlaybackDocumentDiff(
  previousDocument: GraphPayload | GraphDocument,
  nextDocument: GraphPayload | GraphDocument,
): GraphEditPlaybackAuditDiffEntry[] {
  return diffGraphValues(previousDocument, nextDocument, "");
}

function diffGraphValues(previousValue: unknown, nextValue: unknown, path: string): GraphEditPlaybackAuditDiffEntry[] {
  if (isRecord(previousValue) && isRecord(nextValue)) {
    const diff: GraphEditPlaybackAuditDiffEntry[] = [];
    const keys = [...new Set([...Object.keys(previousValue), ...Object.keys(nextValue)])].sort();
    for (const key of keys) {
      const nextPath = `${path}/${escapeJsonPointer(key)}`;
      const previousHasKey = Object.prototype.hasOwnProperty.call(previousValue, key);
      const nextHasKey = Object.prototype.hasOwnProperty.call(nextValue, key);
      if (previousHasKey && !nextHasKey) {
        diff.push({ op: "remove", path: nextPath, previous: previousValue[key] });
      } else if (!previousHasKey && nextHasKey) {
        diff.push({ op: "add", path: nextPath, next: nextValue[key] });
      } else {
        diff.push(...diffGraphValues(previousValue[key], nextValue[key], nextPath));
      }
    }
    return diff;
  }
  if (!areDiffValuesEqual(previousValue, nextValue)) {
    return [{ op: "replace", path, previous: previousValue, next: nextValue }];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function areDiffValuesEqual(previousValue: unknown, nextValue: unknown) {
  return JSON.stringify(previousValue) === JSON.stringify(nextValue);
}

function escapeJsonPointer(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
