import type { BuddyCommandRecord, BuddyRevision } from "../types/buddy.ts";

export type BuddyRevisionDiffChangeKind = "added" | "removed" | "changed";
export type BuddyRevisionDiffEntry = {
  field: string;
  changeKind: BuddyRevisionDiffChangeKind;
  previousValueText: string;
  nextValueText: string;
};

export type BuddyRevisionHistoryRow = BuddyRevision & {
  sourceCommandId: string;
  sourceRunId: string;
  sourceAction: string;
  sourceLabel: string;
  previousValueText: string;
  nextValueText: string;
  diffEntries: BuddyRevisionDiffEntry[];
};

export const BUDDY_REVISION_HISTORY_TARGET_FILTERS = [
  "all",
  "profile",
  "policy",
  "memory",
  "session_summary",
  "run_template_binding",
  "report",
] as const;
export type BuddyRevisionHistoryTargetFilter = (typeof BUDDY_REVISION_HISTORY_TARGET_FILTERS)[number];

export function buildBuddyRevisionHistoryRows(
  revisions: BuddyRevision[],
  commands: BuddyCommandRecord[],
): BuddyRevisionHistoryRow[] {
  const commandByRevisionId = new Map<string, BuddyCommandRecord>();
  for (const command of commands) {
    const revisionId = command.revision_id?.trim();
    if (revisionId && !commandByRevisionId.has(revisionId)) {
      commandByRevisionId.set(revisionId, command);
    }
  }
  return [...revisions]
    .sort((left, right) => parseRevisionTime(right.created_at) - parseRevisionTime(left.created_at))
    .map((revision) => {
      const command = commandByRevisionId.get(revision.revision_id);
      return {
        ...revision,
        sourceCommandId: command?.command_id ?? "",
        sourceRunId: command?.run_id ?? "",
        sourceAction: command?.action ?? "",
        sourceLabel: buildSourceLabel(command),
        previousValueText: formatRevisionValue(revision.previous_value),
        nextValueText: formatRevisionValue(revision.next_value),
        diffEntries: buildRevisionDiffEntries(revision.previous_value, revision.next_value),
      };
    });
}

export function filterBuddyRevisionHistoryRows(
  rows: BuddyRevisionHistoryRow[],
  targetFilter: BuddyRevisionHistoryTargetFilter,
) {
  if (targetFilter === "all") {
    return rows;
  }
  return rows.filter((row) => row.target_type === targetFilter);
}

function buildSourceLabel(command: BuddyCommandRecord | undefined) {
  if (!command) {
    return "Legacy revision";
  }
  const parts = [];
  if (command.run_id) {
    parts.push(`Run ${command.run_id}`);
  }
  parts.push(`Command ${command.command_id}`);
  return parts.join(" | ");
}

function buildRevisionDiffEntries(
  previousValue: Record<string, unknown>,
  nextValue: Record<string, unknown>,
): BuddyRevisionDiffEntry[] {
  const fields = [...Object.keys(previousValue ?? {})];
  for (const field of Object.keys(nextValue ?? {})) {
    if (!fields.includes(field)) {
      fields.push(field);
    }
  }

  return fields.flatMap((field) => {
    const hasPrevious = Object.prototype.hasOwnProperty.call(previousValue, field);
    const hasNext = Object.prototype.hasOwnProperty.call(nextValue, field);
    if (hasPrevious && hasNext && areRevisionValuesEqual(previousValue[field], nextValue[field])) {
      return [];
    }
    const changeKind: BuddyRevisionDiffChangeKind = hasPrevious ? (hasNext ? "changed" : "removed") : "added";
    return [{
      field,
      changeKind,
      previousValueText: hasPrevious ? formatCompactRevisionValue(previousValue[field]) : "",
      nextValueText: hasNext ? formatCompactRevisionValue(nextValue[field]) : "",
    }];
  });
}

function areRevisionValuesEqual(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return Object.is(left, right);
  }
}

function formatCompactRevisionValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function formatRevisionValue(value: Record<string, unknown>) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function parseRevisionTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
