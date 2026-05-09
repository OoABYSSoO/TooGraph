import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";
import { translate } from "../../i18n/index.ts";
import { isAgentBreakpointEnabledInDocument } from "../../lib/graph-document.ts";

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
type RequiredStateMetadata = {
  firstConsumerOrder: number;
  consumerHits: number;
};

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
  const orderedWindowNodeIds = Array.from(windowNodeIds);
  const predecessors = resolveGraphPredecessors(document);
  const successors = resolveGraphSuccessors(document);
  const graphAvailability = resolveGraphStateAvailability(document, predecessors);
  const conditionalDescendantNodeIds = resolveConditionalDescendantNodeIds(document, successors);
  const breakpointStateKeys = resolveBreakpointStateKeys(document, currentNodeId, graphAvailability);
  const availableStatesBeforeNode = resolveWindowStateAvailability(
    document,
    predecessors,
    windowNodeIds,
    currentNodeId,
    breakpointStateKeys,
    graphAvailability.after,
    conditionalDescendantNodeIds,
  );
  const requiredCandidateKeys = new Set<string>();
  const requiredKeys = new Set<string>();
  const requiredMetadataByKey = new Map<string, RequiredStateMetadata>();

  for (const [consumerOrder, nodeId] of orderedWindowNodeIds.entries()) {
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
      requiredCandidateKeys.add(binding.state);
      const metadata = requiredMetadataByKey.get(binding.state);
      if (metadata) {
        metadata.consumerHits += 1;
      } else {
        requiredMetadataByKey.set(binding.state, {
          firstConsumerOrder: consumerOrder,
          consumerHits: 1,
        });
      }
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
        ...requiredCandidateKeys,
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

  const rowByKey = new Map(allRows.map((row) => [row.key, row]));
  const requiredNow = Array.from(requiredKeys)
    .map((key) => rowByKey.get(key))
    .filter((row): row is HumanReviewRow => row !== undefined)
    .sort((left, right) => {
      const leftMetadata = requiredMetadataByKey.get(left.key);
      const rightMetadata = requiredMetadataByKey.get(right.key);
      const leftOrder = leftMetadata?.firstConsumerOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = rightMetadata?.firstConsumerOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      const leftHits = leftMetadata?.consumerHits ?? 0;
      const rightHits = rightMetadata?.consumerHits ?? 0;
      if (leftHits !== rightHits) {
        return rightHits - leftHits;
      }
      const labelOrder = left.label.localeCompare(right.label);
      if (labelOrder !== 0) {
        return labelOrder;
      }
      return left.key.localeCompare(right.key);
    });
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
  const queue = [...(successors.get(currentNodeId) ?? [])];
  const result = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (result.has(nodeId)) {
      continue;
    }
    const isDownstreamBreakpoint = nodeId !== currentNodeId && breakpointNodeIds.has(nodeId);
    if (isDownstreamBreakpoint) {
      result.add(nodeId);
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

function unionStateSets(stateSets: Set<string>[]) {
  const result = new Set<string>();
  for (const stateSet of stateSets) {
    for (const stateKey of stateSet) {
      result.add(stateKey);
    }
  }
  return result;
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
  return new Set(availability.after.get(currentNodeId) ?? []);
}

function resolveConditionalDescendantNodeIds(
  document: GraphPayload | GraphDocument,
  successors: Map<string, string[]>,
) {
  const result = new Set<string>();
  const queue = document.conditional_edges.flatMap((edge) => Object.values(edge.branches));

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (result.has(nodeId)) {
      continue;
    }
    result.add(nodeId);
    queue.push(...(successors.get(nodeId) ?? []));
  }

  return result;
}

function resolveWindowStateAvailability(
  document: GraphPayload | GraphDocument,
  predecessors: Map<string, string[]>,
  windowNodeIds: Set<string>,
  currentNodeId: string | null,
  breakpointStateKeys: Set<string>,
  graphAvailabilityAfter: Map<string, Set<string>>,
  conditionalDescendantNodeIds: Set<string>,
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
        const allPredecessors = predecessors.get(nodeId) ?? [];
        const relevantPredecessors = allPredecessors.filter(
          (predecessorId) => windowNodeIds.has(predecessorId) || predecessorId === currentNodeId,
        );
        const sourceStateSets = relevantPredecessors.map((predecessorId) => {
          if (predecessorId === currentNodeId && !windowIncludesCurrent) {
            return breakpointStateKeys;
          }
          return after.get(predecessorId) ?? new Set<string>();
        });
        const localBefore =
          sourceStateSets.length === 0
            ? new Set<string>()
            : intersectStateSets(sourceStateSets);
        const stableExternalBefore = unionStateSets(
          allPredecessors
            .filter(
              (predecessorId) =>
                !windowNodeIds.has(predecessorId) &&
                predecessorId !== currentNodeId &&
                !conditionalDescendantNodeIds.has(predecessorId),
            )
            .map((predecessorId) => graphAvailabilityAfter.get(predecessorId) ?? new Set<string>()),
        );
        nextBefore = unionStateSets([localBefore, stableExternalBefore]);
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
    ? translate("humanReview.summaryEmpty")
    : translate("humanReview.summaryRequired", { count: requiredCount });
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
