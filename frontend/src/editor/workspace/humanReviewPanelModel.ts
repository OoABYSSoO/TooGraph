import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";
import {
  isAgentBreakpointEnabledInDocument,
  resolveAgentBreakpointTimingInDocument,
} from "../../lib/graph-document.ts";

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

export type HumanReviewPanelModel = {
  requiredNow: HumanReviewRow[];
  otherRows: HumanReviewRow[];
  allRows: HumanReviewRow[];
  requiredCount: number;
  hasBlockingEmptyRequiredField: boolean;
  firstBlockingRequiredKey: string | null;
  summaryText: string;
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

export function buildHumanReviewPanelModel(
  run: RunDetail | null,
  document: GraphPayload | GraphDocument,
): HumanReviewPanelModel {
  const values = resolveHumanReviewStateValues(run);
  const currentNodeId = run?.current_node_id ?? null;
  const windowNodeIds = collectBreakpointWindowNodeIds(document, currentNodeId);
  const predecessors = resolveGraphPredecessors(document);
  const graphAvailability = resolveGraphStateAvailability(document, predecessors);
  const breakpointStateKeys = resolveBreakpointStateKeys(document, currentNodeId, graphAvailability);
  const availableStatesBeforeNode = resolveWindowStateAvailability(
    document,
    predecessors,
    windowNodeIds,
    currentNodeId,
    breakpointStateKeys,
  );
  const requiredCandidates: Array<{ stateKey: string }> = [];
  const requiredKeys = new Set<string>();

  for (const nodeId of windowNodeIds) {
    const node = document.nodes[nodeId];
    if (!node) {
      continue;
    }
    if (node.kind !== "agent" && node.kind !== "condition") {
      continue;
    }
    for (const binding of node.reads) {
      if (binding.required === false) {
        continue;
      }
      requiredCandidates.push({ stateKey: binding.state });
      if (availableStatesBeforeNode.get(nodeId)?.has(binding.state)) {
        continue;
      }
      requiredKeys.add(binding.state);
    }
  }

  const rowKeys = sortHumanReviewStateKeys(
    Array.from(
      new Set([
        ...Object.keys(values),
        ...requiredCandidates.map((candidate) => candidate.stateKey),
      ]),
    ),
    document,
  );

  const allRows = rowKeys.map((key) => {
    const definition = document.state_schema[key];
    const type = resolveHumanReviewStateType(definition?.type);
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : definition?.value ?? "";
    return {
      key,
      label: definition?.name?.trim() || key,
      description: definition?.description ?? "",
      type,
      color: definition?.color || "#d97706",
      value,
      draft: formatHumanReviewDraftValue(type, value),
    };
  });

  const requiredNow = allRows.filter((row) => requiredKeys.has(row.key));
  const otherRows = allRows.filter((row) => !requiredKeys.has(row.key));
  const firstBlockingRequiredKey = requiredNow.find(draftValueIsBlocking)?.key ?? null;

  return {
    requiredNow,
    otherRows,
    allRows,
    requiredCount: requiredNow.length,
    hasBlockingEmptyRequiredField: firstBlockingRequiredKey !== null,
    firstBlockingRequiredKey,
    summaryText: resolveSummaryText(requiredNow.length),
  };
}

function resolveGraphSuccessors(document: GraphPayload | GraphDocument) {
  const successors = new Map<string, string[]>();
  for (const nodeId of Object.keys(document.nodes)) {
    successors.set(nodeId, []);
  }
  for (const edge of document.edges) {
    successors.set(edge.source, [...(successors.get(edge.source) ?? []), edge.target]);
  }
  for (const edge of document.conditional_edges) {
    successors.set(edge.source, [...(successors.get(edge.source) ?? []), ...Object.values(edge.branches)]);
  }
  return successors;
}

function resolveGraphPredecessors(document: GraphPayload | GraphDocument) {
  const predecessors = new Map<string, string[]>();
  for (const nodeId of Object.keys(document.nodes)) {
    predecessors.set(nodeId, []);
  }
  for (const edge of document.edges) {
    predecessors.set(edge.target, [...(predecessors.get(edge.target) ?? []), edge.source]);
  }
  for (const edge of document.conditional_edges) {
    for (const target of Object.values(edge.branches)) {
      predecessors.set(target, [...(predecessors.get(target) ?? []), edge.source]);
    }
  }
  return predecessors;
}

function resolveBreakpointNodeIds(document: GraphPayload | GraphDocument) {
  return new Set(
    Object.keys(document.nodes).filter((nodeId) => isAgentBreakpointEnabledInDocument(document, nodeId)),
  );
}

function collectBreakpointWindowNodeIds(document: GraphPayload | GraphDocument, currentNodeId: string | null) {
  if (!currentNodeId) {
    return new Set<string>();
  }
  const successors = resolveGraphSuccessors(document);
  const breakpointNodeIds = resolveBreakpointNodeIds(document);
  const currentTiming = resolveAgentBreakpointTimingInDocument(document, currentNodeId);
  const queue =
    currentTiming === "before"
      ? [currentNodeId]
      : [...(successors.get(currentNodeId) ?? [])];
  const result = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (result.has(nodeId)) {
      continue;
    }
    if (nodeId !== currentNodeId && breakpointNodeIds.has(nodeId)) {
      continue;
    }
    result.add(nodeId);
    queue.push(...(successors.get(nodeId) ?? []));
  }

  return result;
}

function applyNodeWrites(
  document: GraphPayload | GraphDocument,
  nodeId: string,
  stateKeys: Set<string>,
) {
  const nextStateKeys = new Set(stateKeys);
  const node = document.nodes[nodeId];
  if (!node) {
    return nextStateKeys;
  }
  for (const binding of node.writes) {
    nextStateKeys.add(binding.state);
  }
  return nextStateKeys;
}

function intersectStateSets(stateSets: Set<string>[]) {
  if (stateSets.length === 0) {
    return new Set<string>();
  }
  const result = new Set(stateSets[0]);
  for (const stateSet of stateSets.slice(1)) {
    for (const stateKey of Array.from(result)) {
      if (!stateSet.has(stateKey)) {
        result.delete(stateKey);
      }
    }
  }
  return result;
}

function stateSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }
  for (const stateKey of left) {
    if (!right.has(stateKey)) {
      return false;
    }
  }
  return true;
}

function resolveGraphStateAvailability(
  document: GraphPayload | GraphDocument,
  predecessors: Map<string, string[]>,
): { before: Map<string, Set<string>>; after: Map<string, Set<string>> } {
  const before = new Map<string, Set<string>>();
  const after = new Map<string, Set<string>>();

  for (const nodeId of Object.keys(document.nodes)) {
    before.set(nodeId, new Set<string>());
    after.set(nodeId, new Set<string>());
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of Object.keys(document.nodes)) {
      const incomingNodeIds = predecessors.get(nodeId) ?? [];
      const nextBefore =
        incomingNodeIds.length === 0
          ? new Set<string>()
          : intersectStateSets(incomingNodeIds.map((predecessorId) => after.get(predecessorId) ?? new Set<string>()));
      const nextAfter = applyNodeWrites(document, nodeId, nextBefore);

      if (!stateSetsEqual(before.get(nodeId) ?? new Set<string>(), nextBefore)) {
        before.set(nodeId, nextBefore);
        changed = true;
      }
      if (!stateSetsEqual(after.get(nodeId) ?? new Set<string>(), nextAfter)) {
        after.set(nodeId, nextAfter);
        changed = true;
      }
    }
  }

  return { before, after };
}

function resolveBreakpointStateKeys(
  document: GraphPayload | GraphDocument,
  currentNodeId: string | null,
  availability: { before: Map<string, Set<string>>; after: Map<string, Set<string>> },
) {
  if (!currentNodeId) {
    return new Set<string>();
  }
  return resolveAgentBreakpointTimingInDocument(document, currentNodeId) === "before"
    ? new Set(availability.before.get(currentNodeId) ?? [])
    : new Set(availability.after.get(currentNodeId) ?? []);
}

function resolveWindowStateAvailability(
  document: GraphPayload | GraphDocument,
  predecessors: Map<string, string[]>,
  windowNodeIds: Set<string>,
  currentNodeId: string | null,
  breakpointStateKeys: Set<string>,
) {
  const before = new Map<string, Set<string>>();
  const after = new Map<string, Set<string>>();
  const windowNodeList = Array.from(windowNodeIds);
  const windowIncludesCurrent = currentNodeId !== null && windowNodeIds.has(currentNodeId);

  for (const nodeId of windowNodeList) {
    before.set(nodeId, new Set<string>());
    after.set(nodeId, new Set<string>());
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of windowNodeList) {
      let nextBefore: Set<string>;
      if (nodeId === currentNodeId && windowIncludesCurrent) {
        nextBefore = new Set(breakpointStateKeys);
      } else {
        const relevantPredecessors = (predecessors.get(nodeId) ?? []).filter(
          (predecessorId) => windowNodeIds.has(predecessorId) || predecessorId === currentNodeId,
        );
        const sourceStateSets = relevantPredecessors.map((predecessorId) => {
          if (predecessorId === currentNodeId && !windowIncludesCurrent) {
            return breakpointStateKeys;
          }
          return after.get(predecessorId) ?? new Set<string>();
        });
        nextBefore =
          sourceStateSets.length === 0
            ? new Set<string>()
            : intersectStateSets(sourceStateSets);
      }
      const nextAfter = applyNodeWrites(document, nodeId, nextBefore);

      if (!stateSetsEqual(before.get(nodeId) ?? new Set<string>(), nextBefore)) {
        before.set(nodeId, nextBefore);
        changed = true;
      }
      if (!stateSetsEqual(after.get(nodeId) ?? new Set<string>(), nextAfter)) {
        after.set(nodeId, nextAfter);
        changed = true;
      }
    }
  }

  return before;
}

function draftValueIsBlocking(row: HumanReviewRow) {
  return row.draft.trim().length === 0;
}

function resolveSummaryText(requiredCount: number) {
  return requiredCount === 0
    ? "当前断点后没有需要人工补充的输入"
    : `到下一个断点前，需人工填写 ${requiredCount} 项输入`;
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
