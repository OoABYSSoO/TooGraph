import type { ConditionalEdge, GraphEdge, GraphNode, GraphPayload } from "../types/node-system.ts";
import type { NodeExecutionDetail, RunDetail } from "../types/run.ts";
import { listDelegationBoardTraceLabels } from "../lib/delegationBoardDiagnostic.ts";
import { listDelegationWorkerTraceLabels } from "../lib/delegationWorkerDiagnostic.ts";
import { summarizeVirtualOperationActivity, type VirtualOperationGraphRevision } from "../lib/virtual-operation-activity.ts";
import type { BuddyPublicOutputBinding } from "./buddyPublicOutput.ts";

export type BuddyOutputTraceRecordKind = "node" | "activity";
export type BuddyOutputTraceStatus = "idle" | "running" | "completed" | "failed";
export type BuddyOutputTraceRecordStatus = Exclude<BuddyOutputTraceStatus, "idle">;

export type BuddyOutputTraceSegmentPlan = {
  segmentId: string;
  boundaryNodeId: string;
  boundaryLabel: string;
  outputNodeIds: string[];
};

export type BuddyOutputTracePlan = {
  order: string[];
  segmentsById: Record<string, BuddyOutputTraceSegmentPlan>;
  segmentIdByBoundaryNodeId: Record<string, string>;
  segmentIdByOutputNodeId: Record<string, string>;
  segmentIdByNodeId: Record<string, string>;
};

export type BuddyOutputTraceRecord = {
  recordId: string;
  runtimeKey: string;
  kind: BuddyOutputTraceRecordKind;
  label: string;
  status: BuddyOutputTraceRecordStatus;
  startedAtMs: number | null;
  completedAtMs: number | null;
  durationMs: number | null;
  nodeId: string | null;
  nodeType: string;
  subgraphNodeId: string | null;
  aggregateSubgraphNodeId?: string | null;
  summary?: string;
  artifactLabels?: string[];
  triggeredRunId?: string;
  treeDepth?: number | null;
  dynamicCapabilityRunId?: string | null;
  graphRevision?: VirtualOperationGraphRevision;
  activityId?: string;
  parentActivityId?: string;
  invocationId?: string;
  capabilityKey?: string | null;
  activityKind?: string;
};

export type BuddyOutputTraceSegment = {
  segmentId: string;
  boundaryNodeId: string;
  boundaryLabel: string;
  outputNodeIds: string[];
  status: BuddyOutputTraceStatus;
  startedAtMs: number | null;
  completedAtMs: number | null;
  durationMs: number | null;
  records: BuddyOutputTraceRecord[];
};

export type BuddyOutputTraceRuntimeState = {
  order: string[];
  segmentsById: Record<string, BuddyOutputTraceSegment>;
  activeSegmentId: string | null;
  nextSegmentIndex: number;
};

type RunEventPayload = Record<string, unknown>;
type AgentLoopEventRecord = NonNullable<RunDetail["agent_loop_events"]>[number];

type TraceTimelineItem = {
  eventType: "node.started" | "node.completed" | "node.failed" | "activity.event";
  payload: RunEventPayload;
  timeMs: number;
  order: number;
};

export function buildBuddyOutputTracePlan(
  graph: Pick<GraphPayload, "nodes" | "edges" | "conditional_edges">,
  bindings: BuddyPublicOutputBinding[],
): BuddyOutputTracePlan {
  const order: string[] = [];
  const segmentsById: Record<string, BuddyOutputTraceSegmentPlan> = {};
  const segmentIdByBoundaryNodeId: Record<string, string> = {};
  const segmentIdByOutputNodeId: Record<string, string> = {};

  for (const binding of bindings) {
    const boundaryNodeId = resolveOutputTraceBoundaryNodeId(graph, binding);
    if (!boundaryNodeId) {
      continue;
    }
    const segmentId = buildBoundarySegmentId(boundaryNodeId);
    if (!segmentsById[segmentId]) {
      order.push(segmentId);
      segmentIdByBoundaryNodeId[boundaryNodeId] = segmentId;
      segmentsById[segmentId] = {
        segmentId,
        boundaryNodeId,
        boundaryLabel: resolveTraceNodeLabel(graph as GraphPayload, boundaryNodeId, ""),
        outputNodeIds: [],
      };
    }
    if (!segmentsById[segmentId].outputNodeIds.includes(binding.outputNodeId)) {
      segmentsById[segmentId].outputNodeIds.push(binding.outputNodeId);
    }
    segmentIdByOutputNodeId[binding.outputNodeId] = segmentId;
  }

  const orderedSegmentIds = orderBoundarySegmentIds(graph, order, segmentsById);

  return {
    order: orderedSegmentIds,
    segmentsById,
    segmentIdByBoundaryNodeId,
    segmentIdByOutputNodeId,
    segmentIdByNodeId: buildNearestBoundarySegmentByNodeId(graph, segmentIdByBoundaryNodeId),
  };
}

function orderBoundarySegmentIds(
  graph: Pick<GraphPayload, "nodes" | "edges" | "conditional_edges">,
  segmentIds: string[],
  segmentsById: Record<string, BuddyOutputTraceSegmentPlan>,
) {
  const originalIndex = new Map(segmentIds.map((segmentId, index) => [segmentId, index]));
  const adjacency = buildGraphAdjacency(graph.edges ?? [], graph.conditional_edges ?? []);
  const distanceFromEntry = buildGraphEntryDistances(graph, adjacency);
  return [...segmentIds].sort((left, right) => {
    const leftBoundary = segmentsById[left]?.boundaryNodeId ?? "";
    const rightBoundary = segmentsById[right]?.boundaryNodeId ?? "";
    const leftEntryDistance = distanceFromEntry[leftBoundary] ?? null;
    const rightEntryDistance = distanceFromEntry[rightBoundary] ?? null;
    if (leftEntryDistance !== null && rightEntryDistance !== null && leftEntryDistance !== rightEntryDistance) {
      return leftEntryDistance - rightEntryDistance;
    }
    if (leftEntryDistance !== null && rightEntryDistance === null) {
      return -1;
    }
    if (rightEntryDistance !== null && leftEntryDistance === null) {
      return 1;
    }
    const leftToRightDistance = findGraphDistance(leftBoundary, rightBoundary, adjacency);
    const rightToLeftDistance = findGraphDistance(rightBoundary, leftBoundary, adjacency);
    if (leftToRightDistance !== null && rightToLeftDistance === null) {
      return -1;
    }
    if (rightToLeftDistance !== null && leftToRightDistance === null) {
      return 1;
    }
    return (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0);
  });
}

function buildGraphEntryDistances(
  graph: Pick<GraphPayload, "nodes">,
  adjacency: Record<string, string[]>,
) {
  const incomingNodeIds = new Set(Object.values(adjacency).flat());
  const nonOutputNodeIds = Object.entries(graph.nodes ?? {})
    .filter(([, node]) => node.kind !== "output")
    .map(([nodeId]) => nodeId);
  const entryNodeIds = nonOutputNodeIds.filter((nodeId) => !incomingNodeIds.has(nodeId));
  const queue = (entryNodeIds.length > 0 ? entryNodeIds : nonOutputNodeIds).map((nodeId) => ({ nodeId, distance: 0 }));
  const distances: Record<string, number> = {};
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const currentNodeId = current.nodeId;
    if (!currentNodeId || distances[currentNodeId] !== undefined) {
      continue;
    }
    distances[currentNodeId] = current.distance;
    for (const next of adjacency[currentNodeId] ?? []) {
      if (distances[next] === undefined) {
        queue.push({ nodeId: next, distance: current.distance + 1 });
      }
    }
  }
  return distances;
}

function resolveOutputTraceBoundaryNodeId(
  graph: Pick<GraphPayload, "nodes" | "edges" | "conditional_edges">,
  binding: BuddyPublicOutputBinding,
) {
  const directWriterBoundary = resolveDirectWriterOutputBoundaryNodeId(graph, binding);
  if (directWriterBoundary) {
    return directWriterBoundary;
  }

  const outputNodeId = binding.outputNodeId.trim();
  if (outputNodeId) {
    for (const route of graph.conditional_edges ?? []) {
      if (!route.source?.trim()) {
        continue;
      }
      for (const target of Object.values(route.branches ?? {})) {
        if (target === outputNodeId) {
          return route.source.trim();
        }
      }
    }
  }
  return binding.upstreamNodeIds[0]?.trim() ?? "";
}

function resolveDirectWriterOutputBoundaryNodeId(
  graph: Pick<GraphPayload, "nodes" | "edges" | "conditional_edges">,
  binding: BuddyPublicOutputBinding,
) {
  const outputNodeId = binding.outputNodeId.trim();
  for (const edge of binding.upstreamEdges ?? []) {
    if (edge.kind !== "regular") {
      continue;
    }
    const sourceNodeId = edge.source.trim();
    const sourceNode = graph.nodes?.[sourceNodeId];
    if (
      sourceNodeWritesState(sourceNode, binding.stateKey) &&
      hasConditionOnlyDuplicateRouteToOutput(graph, sourceNodeId, outputNodeId)
    ) {
      return sourceNodeId;
    }
  }
  return "";
}

function sourceNodeWritesState(node: GraphNode | undefined, stateKey: string) {
  if (!node || !stateKey) {
    return false;
  }
  return (node.writes ?? []).some((write) => write.state === stateKey);
}

function hasConditionOnlyDuplicateRouteToOutput(
  graph: Pick<GraphPayload, "nodes" | "edges" | "conditional_edges">,
  sourceNodeId: string,
  outputNodeId: string,
) {
  if (!sourceNodeId || !outputNodeId) {
    return false;
  }

  const adjacency = buildGraphAdjacency(graph.edges ?? [], graph.conditional_edges ?? []);
  const queue = (adjacency[sourceNodeId] ?? []).map((nodeId) => ({ nodeId, passedCondition: false }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const nodeId = current.nodeId.trim();
    const seenKey = `${nodeId}:${current.passedCondition ? "condition" : "direct"}`;
    if (!nodeId || seen.has(seenKey)) {
      continue;
    }
    seen.add(seenKey);

    if (nodeId === outputNodeId) {
      if (current.passedCondition) {
        return true;
      }
      continue;
    }

    const node = graph.nodes?.[nodeId];
    if (!isTransparentConditionNode(node)) {
      continue;
    }
    for (const nextNodeId of adjacency[nodeId] ?? []) {
      queue.push({ nodeId: nextNodeId, passedCondition: true });
    }
  }
  return false;
}

function isTransparentConditionNode(node: GraphNode | undefined) {
  return node?.kind === "condition" && (node.writes ?? []).length === 0;
}

export function createBuddyOutputTraceRuntimeState(plan: BuddyOutputTracePlan): BuddyOutputTraceRuntimeState {
  const segmentsById: Record<string, BuddyOutputTraceSegment> = {};
  for (const segmentId of plan.order) {
    const segment = plan.segmentsById[segmentId];
    if (!segment) {
      continue;
    }
    segmentsById[segmentId] = {
      ...segment,
      status: "idle",
      startedAtMs: null,
      completedAtMs: null,
      durationMs: null,
      records: [],
    };
  }
  return {
    order: plan.order,
    segmentsById,
    activeSegmentId: null,
    nextSegmentIndex: 0,
  };
}

export function createBuddyPendingOutputTraceRuntimeState(
  plan: BuddyOutputTracePlan,
  startedAtMs: number,
): BuddyOutputTraceRuntimeState {
  const state = createBuddyOutputTraceRuntimeState(plan);
  const segmentId = state.order[0];
  const segment = segmentId ? state.segmentsById[segmentId] : null;
  if (!segment) {
    return state;
  }
  return {
    ...state,
    activeSegmentId: segmentId,
    segmentsById: {
      ...state.segmentsById,
      [segmentId]: {
        ...segment,
        status: "running",
        startedAtMs,
      },
    },
  };
}

export function reduceBuddyOutputTraceEvent(
  state: BuddyOutputTraceRuntimeState,
  plan: BuddyOutputTracePlan,
  graph: GraphPayload | null | undefined,
  eventType: string,
  payload: RunEventPayload,
  nowEpochMs: number,
): BuddyOutputTraceRuntimeState {
  if (plan.order.length === 0) {
    return state;
  }
  if (eventType === "activity.event") {
    return applyActivityEvent(state, plan, graph, payload, parseEventEpochMs(payload.created_at) ?? nowEpochMs);
  }
  if (eventType !== "node.started" && eventType !== "node.completed" && eventType !== "node.failed") {
    return state;
  }

  const nodeId = normalizeText(payload.node_id);
  if (!nodeId) {
    return state;
  }
  const subgraphNodeId = normalizeText(payload.subgraph_node_id);
  const dynamicCapabilityContext = resolveDynamicCapabilityContext(payload);
  const segmentScopeNodeId = subgraphNodeId || dynamicCapabilityContext.parentNodeId;
  const nodeType = normalizeText(payload.node_type) || resolveTraceNodeType(graph, nodeId, segmentScopeNodeId);
  if (nodeType === "input" || nodeType === "output") {
    return state;
  }
  const runtimeKey = dynamicCapabilityContext.parentNodeId
    ? buildDynamicCapabilityNodeRecordRuntimeKey(nodeId, dynamicCapabilityContext)
    : buildNodeRecordRuntimeKey(nodeId, subgraphNodeId);
  const nodeLabel = dynamicCapabilityContext.parentNodeId
    ? resolveDynamicCapabilityNodePathLabel(graph, nodeId, dynamicCapabilityContext)
    : resolveTraceNodePathLabel(graph, nodeId, subgraphNodeId);

  const eventTimeMs = resolveNodeEventTime(payload, eventType, nowEpochMs);
  if (eventType === "node.started") {
    const resolvedSegment = resolveSegmentIdForEventWithInstances(state, plan, nodeId, segmentScopeNodeId);
    state = resolvedSegment.state;
    const segmentId = resolvedSegment.segmentId;
    if (!segmentId) {
      return state;
    }
    return upsertRecordInSegment(state, segmentId, {
      runtimeKey,
      kind: "node",
      label: nodeLabel,
      status: "running",
      startedAtMs: eventTimeMs,
      completedAtMs: null,
      durationMs: null,
      nodeId,
      nodeType,
      subgraphNodeId: segmentScopeNodeId || null,
      aggregateSubgraphNodeId: !segmentScopeNodeId && nodeType === "subgraph" ? nodeId : null,
      treeDepth: dynamicCapabilityContext.parentNodeId ? 2 : undefined,
      dynamicCapabilityRunId: dynamicCapabilityContext.runId || null,
    });
  }

  const runningSegmentId = findSegmentIdWithRunningRecord(state, runtimeKey);
  const resolvedSegment = runningSegmentId
    ? { state, segmentId: runningSegmentId }
    : resolveSegmentIdForEventWithInstances(state, plan, nodeId, segmentScopeNodeId);
  state = resolvedSegment.state;
  const segmentId = resolvedSegment.segmentId;
  if (!segmentId) {
    return state;
  }
  const status: BuddyOutputTraceRecordStatus = eventType === "node.failed" ? "failed" : "completed";
  const nextState = upsertRecordInSegment(state, segmentId, {
    runtimeKey,
    kind: "node",
    label: nodeLabel,
    status,
    startedAtMs: parseEventEpochMs(payload.started_at),
    completedAtMs: eventTimeMs,
    durationMs: normalizeDurationMs(payload.duration_ms),
    nodeId,
    nodeType,
    subgraphNodeId: segmentScopeNodeId || null,
    aggregateSubgraphNodeId: !segmentScopeNodeId && nodeType === "subgraph" ? nodeId : null,
    artifactLabels: normalizeTextList(payload.artifact_labels),
    treeDepth: dynamicCapabilityContext.parentNodeId ? 2 : undefined,
    dynamicCapabilityRunId: dynamicCapabilityContext.runId || null,
  });

  if (!segmentScopeNodeId && isSegmentInstanceForBoundary(segmentId, plan.segmentIdByBoundaryNodeId[nodeId])) {
    return completeSegment(nextState, plan, segmentId, status === "failed" ? "failed" : "completed", eventTimeMs);
  }
  return nextState;
}

export function buildBuddyOutputTraceStateFromRunDetail(
  run: RunDetail,
  plan: BuddyOutputTracePlan,
  graph: GraphPayload | null | undefined,
): BuddyOutputTraceRuntimeState {
  let state = createBuddyOutputTraceRuntimeState(plan);
  const timeline = buildTraceTimelineFromRunDetail(run);
  for (const item of timeline) {
    state = reduceBuddyOutputTraceEvent(state, plan, graph, item.eventType, item.payload, item.timeMs);
  }
  return pruneInactiveTerminalOutputSegments(state, run);
}

export type BuddyOutputTraceDisplayOptions = {
  visibleOutputNodeIds?: ReadonlySet<string>;
};

export function listBuddyOutputTraceSegmentsForDisplay(
  state: BuddyOutputTraceRuntimeState,
  options: BuddyOutputTraceDisplayOptions = {},
): BuddyOutputTraceSegment[] {
  const segments = state.order
    .map((segmentId) => state.segmentsById[segmentId])
    .filter((segment): segment is BuddyOutputTraceSegment => Boolean(segment))
    .map((segment) => ({
      ...segment,
      records: listVisibleTraceRecords(segment.records),
    }))
    .filter((segment) => segment.status !== "idle" || segment.records.length > 0);
  return options.visibleOutputNodeIds
    ? coalesceTraceOnlyOutputSegments(segments, options.visibleOutputNodeIds)
    : segments;
}

function applyActivityEvent(
  state: BuddyOutputTraceRuntimeState,
  plan: BuddyOutputTracePlan,
  graph: GraphPayload | null | undefined,
  payload: RunEventPayload,
  eventTimeMs: number,
) {
  const nodeId = normalizeText(payload.node_id);
  if (!nodeId) {
    return state;
  }
  const subgraphNodeId = normalizeText(payload.subgraph_node_id);
  const segmentId = resolveSegmentIdForEvent(state, plan, nodeId, subgraphNodeId) ?? findLatestNonCompletedSegmentId(state);
  if (!segmentId) {
    return state;
  }
  const durationMs = normalizeDurationMs(payload.duration_ms);
  const activityStatus = normalizeActivityStatus(payload.status, payload.error);
  const runtimeKey = buildActivityRecordRuntimeKey(payload, nodeId, subgraphNodeId);
  const virtualOperation = summarizeVirtualOperationActivity(payload);
  const runEvidence = summarizeActivityRunEvidence(payload);
  const dynamicSubgraphActivity = isDynamicSubgraphActivity(payload);
  const activityIdentity = resolveActivityIdentity(payload);
  return upsertRecordInSegment(state, segmentId, {
    runtimeKey,
    kind: "activity",
    label: resolveTraceActivityLabel(graph, payload, nodeId, subgraphNodeId),
    status: activityStatus,
    startedAtMs: durationMs === null ? eventTimeMs : Math.max(0, eventTimeMs - durationMs),
    completedAtMs: activityStatus === "running" ? null : eventTimeMs,
    durationMs,
    nodeId,
    nodeType: "activity",
    subgraphNodeId: subgraphNodeId || null,
    summary: virtualOperation?.summary || normalizeText(payload.summary),
    artifactLabels: virtualOperation?.artifactLabels ?? runEvidence.artifactLabels,
    triggeredRunId: virtualOperation?.triggeredRunId ?? runEvidence.triggeredRunId,
    treeDepth: dynamicSubgraphActivity ? 1 : undefined,
    dynamicCapabilityRunId: dynamicSubgraphActivity ? runEvidence.triggeredRunId ?? null : null,
    graphRevision: virtualOperation?.graphRevision,
    ...activityIdentity,
  });
}

function summarizeActivityRunEvidence(payload: RunEventPayload): { triggeredRunId?: string; artifactLabels: string[] } {
  const detail = recordFromUnknown(payload.detail) ?? {};
  const triggeredRunId = normalizeText(
    detail.child_run_id
      ?? detail.childRunId
      ?? detail.triggered_run_id
      ?? detail.triggeredRunId,
  );
  if (!triggeredRunId) {
    return { artifactLabels: [] };
  }
  const status = normalizeText(
    detail.child_run_status
      ?? detail.childRunStatus
      ?? detail.triggered_run_status
      ?? detail.triggeredRunStatus,
  );
  return {
    triggeredRunId,
    artifactLabels: [`run: ${triggeredRunId}${status ? ` ${status}` : ""}`],
  };
}

function resolveActivityIdentity(payload: RunEventPayload) {
  const detail = recordFromUnknown(payload.detail) ?? {};
  return {
    activityId: normalizeText(payload.activity_id ?? detail.activity_id) || undefined,
    parentActivityId: normalizeText(payload.parent_activity_id ?? detail.parent_activity_id) || undefined,
    invocationId: normalizeText(payload.invocation_id ?? detail.invocation_id) || undefined,
    capabilityKey: (
      normalizeText(detail.action_key)
      || normalizeText(detail.tool_key)
      || normalizeText(detail.capability_key)
      || normalizeText(detail.subgraph_key)
      || null
    ),
    activityKind: normalizeText(payload.kind) || "activity",
  };
}

function pruneInactiveTerminalOutputSegments(
  state: BuddyOutputTraceRuntimeState,
  run: RunDetail,
): BuddyOutputTraceRuntimeState {
  if (!isTerminalTraceRunStatus(run.status)) {
    return state;
  }
  const producedOutputNodeIds = new Set(listRunDetailOutputPreviewNodeIds(run));
  if (producedOutputNodeIds.size === 0) {
    return state;
  }

  let changed = false;
  const segmentsById = { ...state.segmentsById };
  for (const segmentId of state.order) {
    const segment = state.segmentsById[segmentId];
    if (!segment) {
      continue;
    }
    const producedBySegment = segment.outputNodeIds.some((outputNodeId) => producedOutputNodeIds.has(outputNodeId));
    if (producedBySegment) {
      continue;
    }
    if (segment.records.some((record) => record.kind === "node" && record.nodeId === segment.boundaryNodeId && !record.subgraphNodeId)) {
      continue;
    }
    changed = true;
    segmentsById[segmentId] = {
      ...segment,
      status: "idle",
      startedAtMs: null,
      completedAtMs: null,
      durationMs: null,
      records: [],
    };
  }
  if (!changed) {
    return state;
  }
  const activeSegment = state.activeSegmentId ? segmentsById[state.activeSegmentId] : null;
  return {
    ...state,
    activeSegmentId: activeSegment?.status === "idle" ? null : state.activeSegmentId,
    segmentsById,
  };
}

function listRunDetailOutputPreviewNodeIds(run: RunDetail) {
  return [...(run.output_previews ?? []), ...(run.artifacts?.output_previews ?? [])]
    .map((preview) => normalizeText(preview.node_id))
    .filter(Boolean);
}

function isTerminalTraceRunStatus(status: string | null | undefined) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function upsertRecordInSegment(
  state: BuddyOutputTraceRuntimeState,
  segmentId: string,
  draft: Omit<BuddyOutputTraceRecord, "recordId">,
): BuddyOutputTraceRuntimeState {
  const segment = state.segmentsById[segmentId];
  if (!segment) {
    return state;
  }
  const existingIndex = findRecordIndexForDraft(segment.records, draft.runtimeKey);
  const previous = existingIndex >= 0 ? segment.records[existingIndex] : null;
  const startedAtMs = draft.startedAtMs ?? previous?.startedAtMs ?? draft.completedAtMs;
  const completedAtMs = draft.completedAtMs ?? (draft.status === "completed" || draft.status === "failed" ? previous?.completedAtMs ?? null : null);
  const durationMs = draft.durationMs ?? resolveDurationMs(startedAtMs, completedAtMs) ?? previous?.durationMs ?? null;
  const record: BuddyOutputTraceRecord = {
    ...(previous ?? { recordId: buildRecordId(segment, draft.runtimeKey) }),
    ...draft,
    startedAtMs,
    completedAtMs,
    durationMs,
  };
  const records =
    existingIndex >= 0
      ? segment.records.map((candidate, index) => (index === existingIndex ? record : candidate))
      : [...segment.records, record];
  const startedAtCandidates = [segment.startedAtMs, record.startedAtMs].filter(isNumber);
  const nextSegment: BuddyOutputTraceSegment = {
    ...segment,
    status: segment.status === "failed" || record.status === "failed" ? "failed" : record.status === "running" ? "running" : segment.status === "idle" ? "running" : segment.status,
    startedAtMs: startedAtCandidates.length > 0 ? Math.min(...startedAtCandidates) : segment.startedAtMs,
    completedAtMs: segment.completedAtMs,
    durationMs: segment.durationMs,
    records,
  };
  return {
    ...state,
    activeSegmentId: state.activeSegmentId ?? segmentId,
    segmentsById: {
      ...state.segmentsById,
      [segmentId]: nextSegment,
    },
  };
}

function completeSegment(
  state: BuddyOutputTraceRuntimeState,
  plan: BuddyOutputTracePlan,
  segmentId: string,
  status: Extract<BuddyOutputTraceStatus, "completed" | "failed">,
  completedAtMs: number,
): BuddyOutputTraceRuntimeState {
  const segment = state.segmentsById[segmentId];
  if (!segment) {
    return state;
  }
  const startedAtMs = segment.startedAtMs;
  const segmentIndex = state.order.indexOf(segmentId);
  return {
    ...state,
    activeSegmentId: state.activeSegmentId === segmentId ? null : state.activeSegmentId,
    nextSegmentIndex: segmentIndex >= 0 ? Math.max(state.nextSegmentIndex, segmentIndex + 1) : state.nextSegmentIndex,
    segmentsById: {
      ...state.segmentsById,
      [segmentId]: {
        ...segment,
        status,
        completedAtMs,
        durationMs: resolveDurationMs(startedAtMs, completedAtMs) ?? segment.durationMs,
      },
    },
  };
}

function resolveSegmentIdForEvent(
  state: BuddyOutputTraceRuntimeState,
  plan: BuddyOutputTracePlan,
  nodeId: string,
  subgraphNodeId: string,
) {
  const rootBoundarySegmentId = !subgraphNodeId ? plan.segmentIdByBoundaryNodeId[nodeId] : "";
  if (rootBoundarySegmentId && state.segmentsById[rootBoundarySegmentId]?.status !== "completed") {
    return rootBoundarySegmentId;
  }
  const mappedNodeId = subgraphNodeId || nodeId;
  const mappedSegmentId = plan.segmentIdByNodeId[mappedNodeId];
  if (mappedSegmentId && state.segmentsById[mappedSegmentId]?.status !== "completed") {
    return mappedSegmentId;
  }
  if (state.activeSegmentId) {
    return state.activeSegmentId;
  }
  return plan.order.slice(state.nextSegmentIndex).find((segmentId) => state.segmentsById[segmentId]?.status !== "completed") ?? null;
}

function isSegmentInstanceForBoundary(segmentId: string, boundarySegmentId: string | undefined) {
  return Boolean(boundarySegmentId) && (segmentId === boundarySegmentId || segmentId.startsWith(`${boundarySegmentId}:`));
}

function resolveSegmentIdForEventWithInstances(
  state: BuddyOutputTraceRuntimeState,
  plan: BuddyOutputTracePlan,
  nodeId: string,
  subgraphNodeId: string,
) {
  const segmentId = resolveSegmentIdForEvent(state, plan, nodeId, subgraphNodeId);
  if (segmentId) {
    return { state, segmentId };
  }
  const baseSegmentId = resolveBaseSegmentIdForEvent(plan, nodeId, subgraphNodeId);
  if (!baseSegmentId || state.segmentsById[baseSegmentId]?.status !== "completed") {
    return { state, segmentId: null };
  }
  const nextState = appendRepeatedBoundarySegmentInstance(state, plan, baseSegmentId);
  return { state: nextState, segmentId: nextState.order[nextState.order.length - 1] ?? null };
}

function resolveBaseSegmentIdForEvent(
  plan: BuddyOutputTracePlan,
  nodeId: string,
  subgraphNodeId: string,
) {
  if (!subgraphNodeId && plan.segmentIdByBoundaryNodeId[nodeId]) {
    return plan.segmentIdByBoundaryNodeId[nodeId];
  }
  return plan.segmentIdByNodeId[subgraphNodeId || nodeId] ?? "";
}

function appendRepeatedBoundarySegmentInstance(
  state: BuddyOutputTraceRuntimeState,
  plan: BuddyOutputTracePlan,
  baseSegmentId: string,
): BuddyOutputTraceRuntimeState {
  const basePlan = plan.segmentsById[baseSegmentId];
  if (!basePlan) {
    return state;
  }
  const repeatedCount = state.order.filter((segmentId) => segmentId === baseSegmentId || segmentId.startsWith(`${baseSegmentId}:`)).length;
  let segmentId = `${baseSegmentId}:iteration:${repeatedCount + 1}`;
  let suffix = repeatedCount + 1;
  while (state.segmentsById[segmentId]) {
    suffix += 1;
    segmentId = `${baseSegmentId}:iteration:${suffix}`;
  }
  return {
    ...state,
    order: [...state.order, segmentId],
    activeSegmentId: segmentId,
    segmentsById: {
      ...state.segmentsById,
      [segmentId]: {
        ...basePlan,
        segmentId,
        status: "idle",
        startedAtMs: null,
        completedAtMs: null,
        durationMs: null,
        records: [],
      },
    },
  };
}

function buildNearestBoundarySegmentByNodeId(
  graph: Pick<GraphPayload, "nodes" | "edges" | "conditional_edges">,
  segmentIdByBoundaryNodeId: Record<string, string>,
) {
  const result: Record<string, string> = {};
  const boundaryNodeIds = new Set(Object.keys(segmentIdByBoundaryNodeId));
  const adjacency = buildGraphAdjacency(graph.edges ?? [], graph.conditional_edges ?? []);
  for (const nodeId of Object.keys(graph.nodes ?? {})) {
    const segmentId = findNearestBoundarySegmentId(nodeId, adjacency, boundaryNodeIds, segmentIdByBoundaryNodeId);
    if (segmentId) {
      result[nodeId] = segmentId;
    }
  }
  return result;
}

function buildGraphAdjacency(edges: GraphEdge[], conditionalEdges: ConditionalEdge[]) {
  const adjacency: Record<string, string[]> = {};
  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      continue;
    }
    adjacency[edge.source] ??= [];
    adjacency[edge.source].push(edge.target);
  }
  for (const route of conditionalEdges) {
    if (!route.source) {
      continue;
    }
    adjacency[route.source] ??= [];
    for (const target of Object.values(route.branches ?? {})) {
      if (target) {
        adjacency[route.source].push(target);
      }
    }
  }
  return adjacency;
}

function findNearestBoundarySegmentId(
  nodeId: string,
  adjacency: Record<string, string[]>,
  boundaryNodeIds: Set<string>,
  segmentIdByBoundaryNodeId: Record<string, string>,
) {
  const queue = [nodeId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift() ?? "";
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (boundaryNodeIds.has(current)) {
      return segmentIdByBoundaryNodeId[current] ?? null;
    }
    for (const next of adjacency[current] ?? []) {
      if (!seen.has(next)) {
        queue.push(next);
      }
    }
  }
  return null;
}

function findGraphDistance(source: string, target: string, adjacency: Record<string, string[]>) {
  if (!source || !target || source === target) {
    return null;
  }
  const queue = (adjacency[source] ?? []).map((nodeId) => ({ nodeId, distance: 1 }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const currentNodeId = current.nodeId;
    if (!currentNodeId || seen.has(currentNodeId)) {
      continue;
    }
    if (currentNodeId === target) {
      return current.distance;
    }
    seen.add(currentNodeId);
    for (const next of adjacency[currentNodeId] ?? []) {
      if (!seen.has(next)) {
        queue.push({ nodeId: next, distance: current.distance + 1 });
      }
    }
  }
  return null;
}

function findSegmentIdWithRunningRecord(state: BuddyOutputTraceRuntimeState, runtimeKey: string) {
  for (const segmentId of state.order) {
    const segment = state.segmentsById[segmentId];
    if (segment?.records.some((record) => record.runtimeKey === runtimeKey && record.status === "running")) {
      return segmentId;
    }
  }
  return null;
}

function findLatestNonCompletedSegmentId(state: BuddyOutputTraceRuntimeState) {
  for (let index = state.order.length - 1; index >= 0; index -= 1) {
    const segmentId = state.order[index];
    const segment = state.segmentsById[segmentId];
    if (segment && segment.status !== "completed" && segment.status !== "idle") {
      return segmentId;
    }
  }
  return null;
}

function findRecordIndexForDraft(records: BuddyOutputTraceRecord[], runtimeKey: string) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.runtimeKey === runtimeKey && record.status === "running") {
      return index;
    }
  }
  return records.findIndex((record) => record.runtimeKey === runtimeKey && record.kind === "activity");
}

function buildRecordId(segment: BuddyOutputTraceSegment, runtimeKey: string) {
  return `${segment.segmentId}:${runtimeKey}:${segment.records.length + 1}`;
}

function buildBoundarySegmentId(boundaryNodeId: string) {
  return `boundary:${boundaryNodeId}`;
}

function buildNodeRecordRuntimeKey(nodeId: string, subgraphNodeId: string) {
  return `node:${subgraphNodeId ? `${subgraphNodeId}/` : ""}${nodeId}`;
}

function buildDynamicCapabilityNodeRecordRuntimeKey(
  nodeId: string,
  context: DynamicCapabilityTraceContext,
) {
  return `node:${context.parentNodeId}/${context.capabilityKey || context.capabilityLabel}/${nodeId}`;
}

function buildActivityRecordRuntimeKey(payload: RunEventPayload, nodeId: string, subgraphNodeId: string) {
  const dynamicSubgraphRuntimeKey = buildDynamicSubgraphActivityRecordRuntimeKey(payload, nodeId, subgraphNodeId);
  if (dynamicSubgraphRuntimeKey) {
    return dynamicSubgraphRuntimeKey;
  }
  const activityId = normalizeText(payload.activity_id);
  if (activityId) {
    return `activity:${activityId}:${subgraphNodeId ? `${subgraphNodeId}/` : ""}${nodeId}`;
  }
  const sequence = normalizePositiveInteger(payload.sequence);
  const kind = normalizeText(payload.kind) || "activity";
  return `activity:${sequence ?? kind}:${subgraphNodeId ? `${subgraphNodeId}/` : ""}${nodeId}`;
}

function buildDynamicSubgraphActivityRecordRuntimeKey(payload: RunEventPayload, nodeId: string, subgraphNodeId: string) {
  if (!isDynamicSubgraphActivity(payload)) {
    return "";
  }
  const detail = recordFromUnknown(payload.detail) ?? {};
  const childRunId = normalizeText(
    detail.child_run_id
      ?? detail.childRunId
      ?? detail.triggered_run_id
      ?? detail.triggeredRunId,
  );
  const capabilityKey = (
    normalizeText(detail.capability_key)
    || normalizeText(detail.subgraph_key)
    || normalizeText(detail.capability_name)
    || normalizeText(detail.subgraph_name)
  );
  const stableKey = childRunId || capabilityKey;
  return stableKey ? `activity:subgraph:${subgraphNodeId ? `${subgraphNodeId}/` : ""}${nodeId}:${stableKey}` : "";
}

type DynamicCapabilityTraceContext = {
  parentNodeId: string;
  capabilityKey: string;
  capabilityLabel: string;
  runId: string;
};

function resolveDynamicCapabilityContext(payload: RunEventPayload): DynamicCapabilityTraceContext {
  return {
    parentNodeId: normalizeText(payload.dynamic_capability_parent_node_id),
    capabilityKey: normalizeText(payload.dynamic_capability_key),
    capabilityLabel: normalizeText(payload.dynamic_capability_label),
    runId: normalizeText(payload.dynamic_capability_run_id),
  };
}

function resolveDynamicCapabilityNodePathLabel(
  graph: GraphPayload | null | undefined,
  nodeId: string,
  context: DynamicCapabilityTraceContext,
) {
  const parentLabel = resolveTraceNodeLabel(graph, context.parentNodeId, "");
  const capabilityLabel = context.capabilityLabel || context.capabilityKey || "capability";
  return `${parentLabel} / ${capabilityLabel} / ${humanizeRuntimeKey(nodeId)}`;
}

function isDynamicSubgraphActivity(payload: RunEventPayload) {
  if (normalizeText(payload.kind) !== "subgraph_invocation") {
    return false;
  }
  const detail = recordFromUnknown(payload.detail) ?? {};
  return Boolean(
    normalizeText(detail.capability_name)
    || normalizeText(detail.capability_key)
    || normalizeText(detail.subgraph_name)
    || normalizeText(detail.subgraph_key),
  );
}

function resolveTraceNodePathLabel(graph: GraphPayload | null | undefined, nodeId: string, subgraphNodeId: string) {
  const nodeLabel = resolveTraceNodeLabel(graph, nodeId, subgraphNodeId);
  if (!subgraphNodeId) {
    return nodeLabel;
  }
  const stageLabel = resolveTraceNodeLabel(graph, subgraphNodeId, "");
  return stageLabel && stageLabel !== nodeLabel ? `${stageLabel} / ${nodeLabel}` : nodeLabel;
}

function resolveTraceActivityLabel(
  graph: GraphPayload | null | undefined,
  payload: RunEventPayload,
  nodeId: string,
  subgraphNodeId: string,
) {
  const nodeLabel = resolveTraceNodePathLabel(graph, nodeId, subgraphNodeId);
  const virtualOperation = summarizeVirtualOperationActivity(payload);
  if (virtualOperation) {
    return `${nodeLabel} / ${virtualOperation.label}`;
  }
  const capabilityLabel = resolveActivityCapabilityLabel(payload);
  return `${nodeLabel} / ${resolveActivityDisplayLabel(payload, capabilityLabel)}`;
}

function resolveActivityDisplayLabel(payload: RunEventPayload, capabilityLabel: string) {
  const activityKind = normalizeText(payload.kind);
  if (
    activityKind
    && !isCapabilityInvocationActivityKind(activityKind)
    && activityKind !== capabilityLabel
  ) {
    return activityKind;
  }
  return capabilityLabel;
}

function isCapabilityInvocationActivityKind(kind: string) {
  return kind === "action_invocation" || kind === "tool_invocation" || kind === "subgraph_invocation";
}

function resolveActivityCapabilityLabel(payload: RunEventPayload) {
  const detail = recordFromUnknown(payload.detail) ?? {};
  return (
    normalizeText(detail.action_name)
    || normalizeText(detail.action_key)
    || normalizeText(detail.tool_name)
    || normalizeText(detail.tool_key)
    || normalizeText(detail.capability_name)
    || normalizeText(detail.capability_key)
    || normalizeText(detail.subgraph_name)
    || normalizeText(detail.subgraph_key)
    || normalizeText(payload.kind)
    || "activity"
  );
}

function resolveTraceNodeLabel(graph: GraphPayload | null | undefined, nodeId: string, subgraphNodeId: string) {
  const node = resolveTraceNode(graph, nodeId, subgraphNodeId);
  return node?.name?.trim() || node?.description?.trim() || humanizeRuntimeKey(nodeId);
}

function resolveTraceNodeType(graph: GraphPayload | null | undefined, nodeId: string, subgraphNodeId: string) {
  return resolveTraceNode(graph, nodeId, subgraphNodeId)?.kind ?? "";
}

function resolveTraceNode(graph: GraphPayload | null | undefined, nodeId: string, subgraphNodeId: string): GraphNode | null {
  if (!subgraphNodeId) {
    return graph?.nodes?.[nodeId] ?? null;
  }
  const subgraphNode = graph?.nodes?.[subgraphNodeId];
  return subgraphNode?.kind === "subgraph" ? subgraphNode.config.graph.nodes[nodeId] ?? null : null;
}

function listVisibleTraceRecords(records: BuddyOutputTraceRecord[]) {
  return records;
}

function coalesceTraceOnlyOutputSegments(
  segments: BuddyOutputTraceSegment[],
  visibleOutputNodeIds: ReadonlySet<string>,
) {
  const result: BuddyOutputTraceSegment[] = [];
  let pendingTraceOnlySegment: BuddyOutputTraceSegment | null = null;
  for (const segment of segments) {
    const hasVisibleOutput = segment.outputNodeIds.some((outputNodeId) => visibleOutputNodeIds.has(outputNodeId));
    const isTraceOnlyCompletedOutput =
      segment.status === "completed" &&
      segment.outputNodeIds.length > 0 &&
      !hasVisibleOutput;
    if (isTraceOnlyCompletedOutput) {
      pendingTraceOnlySegment = pendingTraceOnlySegment
        ? mergeBuddyOutputTraceSegments(pendingTraceOnlySegment, segment, { keepRightIdentity: false })
        : segment;
      continue;
    }
    const nextSegment = pendingTraceOnlySegment
      ? mergeBuddyOutputTraceSegments(pendingTraceOnlySegment, segment, { keepRightIdentity: true })
      : segment;
    pendingTraceOnlySegment = null;
    result.push(nextSegment);
  }
  if (pendingTraceOnlySegment && result.length === 0) {
    result.push(pendingTraceOnlySegment);
  }
  return result;
}

export function mergeBuddyOutputTraceSegments(
  left: BuddyOutputTraceSegment,
  right: BuddyOutputTraceSegment,
  options: { keepRightIdentity: boolean },
): BuddyOutputTraceSegment {
  const startedAtMs = minNullableNumber(left.startedAtMs, right.startedAtMs);
  const status = right.status === "idle" ? left.status : right.status;
  const completedAtMs = status === "running" ? null : right.completedAtMs ?? left.completedAtMs;
  return {
    ...right,
    segmentId: options.keepRightIdentity ? right.segmentId : left.segmentId,
    boundaryNodeId: options.keepRightIdentity ? right.boundaryNodeId : left.boundaryNodeId,
    boundaryLabel: options.keepRightIdentity ? right.boundaryLabel : left.boundaryLabel,
    outputNodeIds: unionTextLists(left.outputNodeIds, right.outputNodeIds),
    status,
    startedAtMs,
    completedAtMs,
    durationMs: status === "running" ? null : resolveDurationMs(startedAtMs, completedAtMs) ?? right.durationMs ?? left.durationMs,
    records: [...left.records, ...right.records],
  };
}

function unionTextLists(left: string[], right: string[]) {
  const result: string[] = [];
  for (const value of [...left, ...right]) {
    if (value && !result.includes(value)) {
      result.push(value);
    }
  }
  return result;
}

function minNullableNumber(left: number | null, right: number | null) {
  const values = [left, right].filter(isNumber);
  return values.length > 0 ? Math.min(...values) : null;
}

function buildTraceTimelineFromRunDetail(run: RunDetail) {
  const items: TraceTimelineItem[] = [];
  let order = 0;
  const agentLoopEventsByNode = buildAgentLoopEventsByNode(run.agent_loop_events);
  for (const execution of run.node_executions ?? []) {
    appendExecutionTimelineItems(items, execution, "", [], () => {
      order += 1;
      return order;
    }, { agentLoopEventsByNode });
  }
  for (const [index, event] of (run.artifacts?.activity_events ?? []).entries()) {
    const timeMs = parseEventEpochMs(event.created_at) ?? Number.MAX_SAFE_INTEGER;
    items.push({
      eventType: "activity.event",
      payload: event as unknown as RunEventPayload,
      timeMs,
      order: normalizePositiveInteger(event.sequence) ?? order + index + 1,
    });
  }
  return items.sort((left, right) => left.timeMs - right.timeMs || eventTypeOrder(left.eventType) - eventTypeOrder(right.eventType) || left.order - right.order);
}

function appendExecutionTimelineItems(
  items: TraceTimelineItem[],
  execution: NodeExecutionDetail,
  subgraphNodeId: string,
  subgraphPath: string[],
  nextOrder: () => number,
  options: {
    timelineTimeMs?: number | null;
    dynamicCapability?: DynamicCapabilityTraceContext;
    agentLoopEventsByNode?: Map<string, AgentLoopEventRecord[]>;
  } = {},
) {
  const nodeId = normalizeText(execution.node_id);
  if (!nodeId) {
    return;
  }
  const nodeType = normalizeText(execution.node_type) || normalizeText(execution.artifacts?.family);
  const startedAtMs = parseEventEpochMs(execution.started_at);
  const durationMs = normalizeDurationMs(execution.duration_ms);
  const finishedAtMs = parseEventEpochMs(execution.finished_at) ?? (startedAtMs !== null && durationMs !== null ? startedAtMs + durationMs : null);
  const completionEventTimeMs = finishedAtMs ?? (isTerminalExecutionStatus(execution.status) ? startedAtMs : null);
  const context = subgraphNodeId
    ? {
        subgraph_node_id: subgraphNodeId,
        subgraph_path: subgraphPath,
      }
    : {};
  if (startedAtMs !== null) {
    items.push({
      eventType: "node.started",
      payload: {
        node_id: nodeId,
        node_type: nodeType,
        started_at: execution.started_at,
        ...context,
        ...buildDynamicCapabilityTimelineContext(options.dynamicCapability),
      },
      timeMs: options.timelineTimeMs ?? startedAtMs,
      order: nextOrder(),
    });
  }

  const childExecutions = execution.artifacts?.subgraph?.node_executions;
  if (Array.isArray(childExecutions)) {
    const childPath = [...subgraphPath, nodeId];
    for (const childExecution of childExecutions) {
      appendExecutionTimelineItems(items, childExecution, nodeId, childPath, nextOrder, options);
    }
  }

  appendDynamicCapabilitySubgraphTimelineItems(
    items,
    execution,
    nodeId,
    completionEventTimeMs !== null ? completionEventTimeMs + 1 : null,
    nextOrder,
  );

  if (completionEventTimeMs !== null) {
    items.push({
      eventType: normalizeExecutionStatus(execution.status) === "failed" ? "node.failed" : "node.completed",
      payload: {
        node_id: nodeId,
        node_type: nodeType,
        status: execution.status,
        started_at: execution.started_at,
        duration_ms: execution.duration_ms,
        artifact_labels: buildAgentLoopArtifactLabels(execution, options.agentLoopEventsByNode?.get(nodeId) ?? []),
        ...context,
        ...buildDynamicCapabilityTimelineContext(options.dynamicCapability),
      },
      timeMs: options.timelineTimeMs ?? completionEventTimeMs,
      order: nextOrder(),
    });
  }
}

function appendDynamicCapabilitySubgraphTimelineItems(
  items: TraceTimelineItem[],
  execution: NodeExecutionDetail,
  parentNodeId: string,
  timelineTimeMs: number | null,
  nextOrder: () => number,
) {
  for (const capabilityOutput of listRecordArray(execution.artifacts?.capability_outputs)) {
    const subgraph = recordFromUnknown(capabilityOutput.subgraph);
    const childExecutions = Array.isArray(subgraph?.node_executions) ? subgraph.node_executions : [];
    if (childExecutions.length === 0) {
      continue;
    }
    const capabilityLabel = resolveCapabilityOutputLabel(capabilityOutput, subgraph);
    const capabilityKey = resolveCapabilityOutputKey(capabilityOutput, subgraph, capabilityLabel);
    const dynamicCapability: DynamicCapabilityTraceContext = {
      parentNodeId,
      capabilityKey,
      capabilityLabel,
      runId: normalizeText(subgraph?.child_run_id) || normalizeText(capabilityOutput.child_run_id),
    };
    for (const childExecution of childExecutions) {
      appendExecutionTimelineItems(
        items,
        childExecution as NodeExecutionDetail,
        "",
        [],
        nextOrder,
        {
          timelineTimeMs,
          dynamicCapability,
        },
      );
    }
  }
}

function buildAgentLoopArtifactLabels(execution: NodeExecutionDetail, agentLoopEvents: AgentLoopEventRecord[] = []) {
  const outputs = recordFromUnknown(execution.artifacts?.outputs);
  const report = recordFromUnknown(outputs?.agent_loop_report);
  return uniqueTextList([
    ...buildAgentLoopEventArtifactLabels(agentLoopEvents),
    ...buildAgentLoopReportArtifactLabels(report),
    ...buildDelegationWorkerArtifactLabels(execution, outputs),
    ...buildDelegationBoardArtifactLabels(execution, outputs),
  ].filter(Boolean));
}

function buildAgentLoopEventsByNode(events: RunDetail["agent_loop_events"]) {
  const byNode = new Map<string, AgentLoopEventRecord[]>();
  for (const event of events ?? []) {
    const nodeId = normalizeText(event.node_id);
    if (!nodeId) {
      continue;
    }
    byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), event]);
  }
  return byNode;
}

function buildAgentLoopEventArtifactLabels(events: AgentLoopEventRecord[]) {
  const event = latestAgentLoopEvent(events);
  if (!event) {
    return [];
  }
  const detail = recordFromUnknown(event.detail) ?? {};
  const budget = recordFromUnknown(event.budget_snapshot) ?? {};
  return buildAgentLoopReportArtifactLabels({
    ...detail,
    stop_reason: normalizeText(event.stop_reason) || normalizeText(detail.stop_reason),
    decision: normalizeText(detail.decision) || normalizeText(event.event_kind),
    capability_call_count: normalizeNumber(budget.capability_call_count) ?? normalizeNumber(detail.capability_call_count),
    max_capability_calls: normalizeNumber(budget.max_capability_calls) ?? normalizeNumber(detail.max_capability_calls),
  });
}

function latestAgentLoopEvent(events: AgentLoopEventRecord[]) {
  return [...events].sort((left, right) => {
    const iterationDelta = (normalizeNumber(right.iteration_index) ?? -1) - (normalizeNumber(left.iteration_index) ?? -1);
    if (iterationDelta !== 0) {
      return iterationDelta;
    }
    return normalizeText(right.created_at).localeCompare(normalizeText(left.created_at));
  })[0] ?? null;
}

function uniqueTextList(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function buildAgentLoopReportArtifactLabels(report: Record<string, unknown> | null) {
  if (!report) {
    return [];
  }
  const stopReason = normalizeText(report.stop_reason);
  const decision = normalizeText(report.decision);
  const capabilityCallCount = normalizeNumber(report.capability_call_count);
  const maxCapabilityCalls = normalizeNumber(report.max_capability_calls);
  return [
    stopReason ? `stop: ${stopReason}` : "",
    decision ? `decision: ${decision}` : "",
    capabilityCallCount !== null || maxCapabilityCalls !== null
      ? `capabilities: ${capabilityCallCount ?? "?"} / ${maxCapabilityCalls ?? "?"}`
      : "",
  ];
}

function buildDelegationWorkerArtifactLabels(
  execution: NodeExecutionDetail,
  outputs: Record<string, unknown> | null,
) {
  const stateWritePackage = findStateWriteValue(execution, "worker_result_package");
  return listDelegationWorkerTraceLabels(outputs?.worker_result_package ?? stateWritePackage);
}

function buildDelegationBoardArtifactLabels(
  execution: NodeExecutionDetail,
  outputs: Record<string, unknown> | null,
) {
  const stateWriteBoard = findStateWriteValue(execution, "delegation_board_snapshot");
  return listDelegationBoardTraceLabels(outputs?.delegation_board_snapshot ?? stateWriteBoard);
}

function findStateWriteValue(execution: NodeExecutionDetail, stateKey: string) {
  return (execution.artifacts?.state_writes ?? []).find((write) => normalizeText(write.state_key) === stateKey)?.value;
}

function buildDynamicCapabilityTimelineContext(context: DynamicCapabilityTraceContext | undefined) {
  if (!context?.parentNodeId) {
    return {};
  }
  return {
    dynamic_capability_parent_node_id: context.parentNodeId,
    dynamic_capability_key: context.capabilityKey,
    dynamic_capability_label: context.capabilityLabel,
    dynamic_capability_run_id: context.runId,
  };
}

function resolveCapabilityOutputLabel(
  capabilityOutput: Record<string, unknown>,
  subgraph: Record<string, unknown> | null,
) {
  return (
    normalizeText(capabilityOutput.capability_name)
    || normalizeText(capabilityOutput.name)
    || normalizeText(subgraph?.name)
    || normalizeText(capabilityOutput.capability_key)
    || normalizeText(subgraph?.graph_id)
    || "capability"
  );
}

function resolveCapabilityOutputKey(
  capabilityOutput: Record<string, unknown>,
  subgraph: Record<string, unknown> | null,
  fallback: string,
) {
  return (
    normalizeText(capabilityOutput.capability_key)
    || normalizeText(capabilityOutput.key)
    || normalizeText(subgraph?.graph_id)
    || fallback
  );
}

function eventTypeOrder(eventType: TraceTimelineItem["eventType"]) {
  if (eventType === "node.started") {
    return 0;
  }
  if (eventType === "activity.event") {
    return 1;
  }
  return 2;
}

function resolveNodeEventTime(payload: RunEventPayload, eventType: string, nowEpochMs: number) {
  if (eventType === "node.started") {
    return parseEventEpochMs(payload.started_at) ?? nowEpochMs;
  }
  const startedAtMs = parseEventEpochMs(payload.started_at);
  const durationMs = normalizeDurationMs(payload.duration_ms);
  if (startedAtMs !== null && durationMs !== null) {
    return startedAtMs + durationMs;
  }
  return parseEventEpochMs(payload.finished_at) ?? parseEventEpochMs(payload.completed_at) ?? nowEpochMs;
}

function normalizeActivityStatus(status: unknown, error: unknown): BuddyOutputTraceRecordStatus {
  if (normalizeText(error)) {
    return "failed";
  }
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "failed" || normalized === "error") {
    return "failed";
  }
  if (normalized === "running" || normalized === "pending" || normalized === "awaiting_human") {
    return "running";
  }
  return "completed";
}

function normalizeExecutionStatus(value: unknown) {
  const status = normalizeText(value).toLowerCase();
  return status === "failed" || status === "error" ? "failed" : "completed";
}

function isTerminalExecutionStatus(value: unknown) {
  const status = normalizeText(value).toLowerCase();
  return Boolean(status) && !["running", "pending", "queued", "awaiting_human", "in_progress"].includes(status);
}

function resolveDurationMs(startedAtMs: number | null | undefined, completedAtMs: number | null | undefined) {
  return isNumber(startedAtMs) && isNumber(completedAtMs) ? Math.max(0, Math.round(completedAtMs - startedAtMs)) : null;
}

function normalizeDurationMs(value: unknown) {
  const durationMs = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null;
}

function parseEventEpochMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? epochMs : null;
}

function normalizePositiveInteger(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : null;
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextList(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function listRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = recordFromUnknown(item);
        return record ? [record] : [];
      })
    : [];
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function humanizeRuntimeKey(value: string) {
  return value
    .trim()
    .replace(/^state_/, "State ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
