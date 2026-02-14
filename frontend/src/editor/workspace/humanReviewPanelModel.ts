import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import {
  formatStateValueInput,
  parseStateValueInput,
  STATE_FIELD_TYPE_OPTIONS,
  type StateFieldType,
} from "./statePanelFields.ts";
import { sortHumanReviewStateKeys } from "./stateOrdering.ts";

export type HumanReviewRow = {
  key: string;
  label: string;
  description: string;
  type: StateFieldType;
  color: string;
  value: unknown;
  draft: string;
};

const stateFieldTypeSet = new Set<string>(STATE_FIELD_TYPE_OPTIONS);

export function resolveHumanReviewStateValues(run: RunDetail | null): Record<string, unknown> {
  if (!run) {
    return {};
  }
  return run.artifacts.state_values ?? run.state_snapshot.values ?? {};
}

export function resolveHumanReviewStateType(type: string | undefined): StateFieldType {
  const normalized = String(type ?? "").trim();
  return stateFieldTypeSet.has(normalized) ? (normalized as StateFieldType) : "text";
}

export function formatHumanReviewDraftValue(type: string | undefined, value: unknown) {
  return formatStateValueInput(resolveHumanReviewStateType(type), value);
}

export function buildHumanReviewRows(run: RunDetail | null, document: GraphPayload | GraphDocument): HumanReviewRow[] {
  const values = resolveHumanReviewStateValues(run);
  return sortHumanReviewStateKeys(Object.keys(values), document).map((key) => {
    const definition = document.state_schema[key];
    const type = resolveHumanReviewStateType(definition?.type);
    const label = definition?.name?.trim() || key;
    return {
      key,
      label,
      description: definition?.description ?? "",
      type,
      color: definition?.color || "#d97706",
      value: values[key],
      draft: formatHumanReviewDraftValue(type, values[key]),
    };
  });
}

export function buildHumanReviewResumePayload(rows: HumanReviewRow[], draftsByKey: Record<string, string>) {
  const payload: Record<string, unknown> = {};
  for (const row of rows) {
    const draft = draftsByKey[row.key] ?? row.draft;
    if (draft === row.draft) {
      continue;
    }
    payload[row.key] = parseStateValueInput(row.type, draft);
  }
  return payload;
}
