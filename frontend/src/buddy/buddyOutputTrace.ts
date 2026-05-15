import type { ConditionalEdge, GraphEdge, GraphNode, GraphPayload } from "../types/node-system.ts";
import type { ActivityEvent, NodeExecutionDetail, RunDetail } from "../types/run.ts";
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
    const boundaryNodeId = binding.upstreamNodeIds[0]?.trim();
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

  return {
    order,
    segmentsById,
    segmentIdByBoundaryNodeId,
    segmentIdByOutputNodeId,
    segmentIdByNodeId: buildNearestBoundarySegmentByNodeId(graph, segmentIdByBoundaryNodeId),
  };
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
  const nodeType = normalizeText(payload.node_type) || resolveTraceNodeType(graph, nodeId, subgraphNodeId);
  if (nodeType === "input" || nodeType === "output") {
    return state;
  }

  const eventTimeMs = resolveNodeEventTime(payload, eventType, nowEpochMs);
  if (eventType === "node.started") {
    const segmentId = resolveSegmentIdForEvent(state, plan, nodeId, subgraphNodeId);
    if (!segmentId) {
      return state;
    }
    const runtimeKey = buildNodeRecordRuntimeKey(nodeId, subgraphNodeId);
    return upsertRecordInSegment(state, segmentId, {
      runtimeKey,
      kind: "node",
      label: resolveTraceNodePathLabel(graph, nodeId, subgraphNodeId),
      status: "running",
      startedAtMs: eventTimeMs,
      completedAtMs: null,
      durationMs: null,
      nodeId,
      nodeType,
      subgraphNodeId: subgraphNodeId || null,
      aggregateSubgraphNodeId: !subgraphNodeId && nodeType === "subgraph" ? nodeId : null,
    });
  }

  const segmentId = findSegmentIdWithRunningRecord(state, buildNodeRecordRuntimeKey(nodeId, subgraphNodeId))
    ?? resolveSegmentIdForEvent(state, plan, nodeId, subgraphNodeId);
  if (!segmentId) {
    return state;
  }
  const status: BuddyOutputTraceRecordStatus = eventType === "node.failed" ? "failed" : "completed";
  const nextState = upsertRecordInSegment(state, segmentId, {
    runtimeKey: buildNodeRecordRuntimeKey(nodeId, subgraphNodeId),
    kind: "node",
    label: resolveTraceNodePathLabel(graph, nodeId, subgraphNodeId),
    status,
    startedAtMs: parseEventEpochMs(payload.started_at),
    completedAtMs: eventTimeMs,
    durationMs: normalizeDurationMs(payload.duration_ms),
    nodeId,
    nodeType,
    subgraphNodeId: subgraphNodeId || null,
    aggregateSubgraphNodeId: !subgraphNodeId && nodeType === "subgraph" ? nodeId : null,
  });

  if (!subgraphNodeId && plan.segmentIdByBoundaryNodeId[nodeId] === segmentId) {
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
  return state;
}

export function listBuddyOutputTraceSegmentsForDisplay(state: BuddyOutputTraceRuntimeState): BuddyOutputTraceSegment[] {
  return state.order
    .map((segmentId) => state.segmentsById[segmentId])
    .filter((segment): segment is BuddyOutputTraceSegment => Boolean(segment))
    .map((segment) => ({
      ...segment,
      records: listVisibleTraceRecords(segment.records),
    }))
    .filter((segment) => segment.status !== "idle" || segment.records.length > 0);
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
    summary: normalizeText(payload.summary),
  });
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
  const segmentIndex = plan.order.indexOf(segmentId);
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

function buildActivityRecordRuntimeKey(payload: RunEventPayload, nodeId: string, subgraphNodeId: string) {
  const sequence = normalizePositiveInteger(payload.sequence);
  const kind = normalizeText(payload.kind) || "activity";
  return `activity:${sequence ?? kind}:${subgraphNodeId ? `${subgraphNodeId}/` : ""}${nodeId}`;
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
  const capabilityLabel =
    normalizeText(recordFromUnknown(payload.detail)?.skill_key)
    || normalizeText(recordFromUnknown(payload.detail)?.capability_key)
    || normalizeText(payload.kind)
    || "activity";
  return `${nodeLabel} / ${capabilityLabel}`;
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
  const subgraphIdsWithInnerRecords = new Set(
    records.map((record) => record.subgraphNodeId).filter((value): value is string => Boolean(value)),
  );
  return records.filter((record) => {
    const aggregateSubgraphNodeId = record.aggregateSubgraphNodeId?.trim();
    return !aggregateSubgraphNodeId || !subgraphIdsWithInnerRecords.has(aggregateSubgraphNodeId);
  });
}

function buildTraceTimelineFromRunDetail(run: RunDetail) {
  const items: TraceTimelineItem[] = [];
  let order = 0;
  for (const execution of run.node_executions ?? []) {
    appendExecutionTimelineItems(items, execution, "", [], () => {
      order += 1;
      return order;
    });
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
      },
      timeMs: startedAtMs,
      order: nextOrder(),
    });
  }

  const childExecutions = execution.artifacts?.subgraph?.node_executions;
  if (Array.isArray(childExecutions)) {
    const childPath = [...subgraphPath, nodeId];
    for (const childExecution of childExecutions) {
      appendExecutionTimelineItems(items, childExecution, nodeId, childPath, nextOrder);
    }
  }

  if (completionEventTimeMs !== null) {
    items.push({
      eventType: normalizeExecutionStatus(execution.status) === "failed" ? "node.failed" : "node.completed",
      payload: {
        node_id: nodeId,
        node_type: nodeType,
        status: execution.status,
        started_at: execution.started_at,
        duration_ms: execution.duration_ms,
        ...context,
      },
      timeMs: completionEventTimeMs,
      order: nextOrder(),
    });
  }
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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
