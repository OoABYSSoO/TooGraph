import type { GraphNode, GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type { SkillDefinition } from "../types/skills.ts";
import { GLOBAL_RUNTIME_MODEL_OPTION_VALUE } from "../lib/runtimeModelCatalog.ts";
import { routeStreamingJsonStateText } from "../lib/streamingJsonStateRouter.ts";

export const BUDDY_TEMPLATE_ID = "buddy_autonomous_loop";
export const BUDDY_REVIEW_TEMPLATE_ID = "buddy_autonomous_review";
export const BUDDY_USER_MESSAGE_STATE_KEY = "state_1";
export const BUDDY_HISTORY_STATE_KEY = "state_2";
export const BUDDY_PAGE_CONTEXT_STATE_KEY = "state_3";
export const BUDDY_REPLY_STATE_KEY = "state_4";
export const BUDDY_MODE_STATE_KEY = "state_5";
export const BUDDY_PROFILE_STATE_KEY = "state_6";
export const BUDDY_POLICY_STATE_KEY = "state_7";
export const BUDDY_MEMORY_CONTEXT_STATE_KEY = "state_8";
export const BUDDY_SESSION_SUMMARY_STATE_KEY = "state_9";
export const BUDDY_AGENTIC_REPLY_STATE_KEYS = ["state_27", "state_25", "state_26", "state_16", "state_18"];
export const MAX_BUDDY_HISTORY_MESSAGES = 12;
export const DEFAULT_BUDDY_MODE = "ask_first";

export type BuddyChatRole = "user" | "assistant";
export type BuddyMode = "ask_first" | "full_access";

export type BuddyModeOption = {
  value: BuddyMode;
  labelKey: string;
  descriptionKey: string;
  disabled: boolean;
};

export const BUDDY_MODE_OPTIONS: BuddyModeOption[] = [
  {
    value: "ask_first",
    labelKey: "buddy.modes.askFirst",
    descriptionKey: "buddy.modeDescriptions.askFirst",
    disabled: false,
  },
  {
    value: "full_access",
    labelKey: "buddy.modes.fullAccess",
    descriptionKey: "buddy.modeDescriptions.fullAccess",
    disabled: false,
  },
];

export type BuddyChatMessage = {
  role: BuddyChatRole;
  content: string;
  includeInContext?: boolean;
};

export type BuddyRunActivityMessage = {
  labelKey: string;
  params: Record<string, string>;
};

export type BuddyRunTraceEntry = {
  labelKey: string;
  params: Record<string, string>;
  preview: string;
  tone: "info" | "stream" | "success" | "error";
  replaceKey: string;
  timingKey?: string;
  durationMs?: number;
};

export type BuildBuddyChatGraphInput = {
  userMessage: string;
  history: BuddyChatMessage[];
  pageContext: string;
  buddyMode?: unknown;
  buddyModel?: unknown;
  skillCatalog?: SkillDefinition[];
};

export type BuildBuddyReviewGraphInput = {
  mainRun: RunDetail;
  buddyModel?: unknown;
};

export function formatBuddyHistory(messages: BuddyChatMessage[], maxMessages = MAX_BUDDY_HISTORY_MESSAGES) {
  const entries = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
      includeInContext: message.includeInContext,
    }))
    .filter((message) => message.includeInContext !== false)
    .filter((message) => message.content.length > 0)
    .slice(-maxMessages);

  if (entries.length === 0) {
    return "暂无历史对话。";
  }

  return entries.map((message) => `${message.role === "user" ? "用户" : "伙伴"}: ${message.content}`).join("\n");
}

export function buildBuddyChatGraph(template: TemplateRecord, input: BuildBuddyChatGraphInput): GraphPayload {
  const buddyMode = resolveBuddyMode(input.buddyMode);
  const graph: GraphPayload = {
    graph_id: null,
    name: template.default_graph_name,
    state_schema: cloneJson(template.state_schema),
    nodes: cloneJson(template.nodes),
    edges: cloneJson(template.edges),
    conditional_edges: cloneJson(template.conditional_edges),
    metadata: {
      ...cloneJson(template.metadata),
      origin: "buddy",
      buddy_template_id: template.template_id,
      buddy_mode: buddyMode,
      buddy_can_execute_actions: buddyMode === "full_access",
    },
  };
  applyBuddyModePolicy(graph, buddyMode);
  applyBuddyModelOverride(graph, input.buddyModel);

  const historyValue = formatBuddyHistory(input.history);
  const pageContextValue = input.pageContext.trim() || "当前页面上下文不可用。";
  const skillCatalogSnapshot = buildBuddySkillCatalogSnapshot(input.skillCatalog ?? [], buddyMode);

  setStateValueByNameOrKey(graph, "user_message", BUDDY_USER_MESSAGE_STATE_KEY, input.userMessage);
  setStateValueByNameOrKey(graph, "conversation_history", BUDDY_HISTORY_STATE_KEY, historyValue);
  setStateValueByNameOrKey(graph, "page_context", BUDDY_PAGE_CONTEXT_STATE_KEY, pageContextValue);
  setStateValueByNameOrKey(graph, "buddy_mode", BUDDY_MODE_STATE_KEY, buddyMode);
  setStateValueByName(graph, "skill_catalog_snapshot", skillCatalogSnapshot);
  for (const stateName of ["buddy_reply", "visible_reply", "final_reply", "direct_reply", "denied_reply", "approval_prompt"]) {
    setStateValueByName(graph, stateName, "");
  }

  syncInputNodeValueByNameOrKey(graph, "user_message", BUDDY_USER_MESSAGE_STATE_KEY, input.userMessage);
  syncInputNodeValueByNameOrKey(graph, "conversation_history", BUDDY_HISTORY_STATE_KEY, historyValue);
  syncInputNodeValueByNameOrKey(graph, "page_context", BUDDY_PAGE_CONTEXT_STATE_KEY, pageContextValue);
  syncInputNodeValueByNameOrKey(graph, "buddy_mode", BUDDY_MODE_STATE_KEY, buddyMode);
  syncInputNodeValueByName(graph, "skill_catalog_snapshot", skillCatalogSnapshot);
  return graph;
}

export function buildBuddyReviewGraph(template: TemplateRecord, input: BuildBuddyReviewGraphInput): GraphPayload {
  const graph: GraphPayload = {
    graph_id: null,
    name: template.default_graph_name,
    state_schema: cloneJson(template.state_schema),
    nodes: cloneJson(template.nodes),
    edges: cloneJson(template.edges),
    conditional_edges: cloneJson(template.conditional_edges),
    metadata: {
      ...cloneJson(template.metadata),
      buddy_template_id: template.template_id,
      buddy_review_run: true,
      buddy_parent_run_id: input.mainRun.run_id,
      internal: true,
    },
  };
  applyBuddyModelOverride(graph, input.buddyModel);

  const stateValues: Record<string, unknown> = {
    source_run_id: input.mainRun.run_id,
    user_message: resolveRunStateValueByName(input.mainRun, "user_message", ""),
    conversation_history: resolveRunStateValueByName(input.mainRun, "conversation_history", ""),
    page_context: resolveRunStateValueByName(input.mainRun, "page_context", ""),
    buddy_mode: resolveRunStateValueByName(input.mainRun, "buddy_mode", DEFAULT_BUDDY_MODE),
    buddy_context: resolveRunStateValueByName(input.mainRun, "buddy_context", ""),
    request_understanding: resolveRunStateValueByName(input.mainRun, "request_understanding", {}),
    capability_result: resolveRunStateValueByName(input.mainRun, "capability_result", {}),
    capability_review: resolveRunStateValueByName(input.mainRun, "capability_review", {}),
    final_reply: resolveRunStateValueByName(input.mainRun, "final_reply", resolveBuddyReplyText(input.mainRun)),
    autonomous_review: {},
    writeback_commands: [],
    writeback_success: false,
    writeback_result: "",
    applied_writeback_commands: [],
    skipped_writeback_commands: [],
    writeback_revisions: [],
  };

  for (const [stateName, value] of Object.entries(stateValues)) {
    setStateValueByName(graph, stateName, value);
    syncInputNodeValueByName(graph, stateName, value);
  }

  return graph;
}

export function resolveBuddyMode(value: unknown): BuddyMode {
  if (value === "full_access" || value === "unrestricted") {
    return "full_access";
  }
  return DEFAULT_BUDDY_MODE;
}

export function buildBuddySkillCatalogSnapshot(skills: SkillDefinition[], buddyMode: BuddyMode) {
  void buddyMode;
  return skills.map((skill) => cloneJson(skill));
}

export function resolveBuddyReplyText(run: RunDetail): string {
  const replyStateKeys = resolveBuddyReplyStateKeys(run.graph_snapshot);
  const candidates = [
    ...replyStateKeys.map((stateKey) => run.state_snapshot?.values?.[stateKey]),
    ...replyStateKeys.map((stateKey) => run.artifacts?.state_values?.[stateKey]),
    resolveOutputPreviewValue(run.output_previews, replyStateKeys),
    resolveOutputPreviewValue(run.artifacts?.output_previews, replyStateKeys),
    run.final_result,
  ];

  for (const candidate of candidates) {
    const text = stringifyBuddyReplyCandidate(candidate);
    if (text) {
      return text;
    }
  }

  return "";
}

export function resolveBuddyReplyFromRunEvent(payload: Record<string, unknown>, graphSnapshot?: Record<string, unknown> | null): string {
  const replyStateKeys = resolveBuddyReplyStateKeys(graphSnapshot);
  const stateKey = typeof payload.state_key === "string" ? payload.state_key.trim() : "";
  if (replyStateKeys.includes(stateKey)) {
    return stringifyBuddyReplyCandidate(payload.value ?? payload.text);
  }

  const outputKeys = listBuddyRunEventOutputKeys(payload);
  const streamStateKeys = listBuddyRunEventOutputKeys({ output_keys: payload.stream_state_keys }, outputKeys);
  const streamedReply = resolveBuddyStreamingReplyText(payload, replyStateKeys, streamStateKeys);
  if (streamedReply) {
    return streamedReply;
  }

  const outputValues = isRecord(payload.output_values) ? payload.output_values : null;
  if (outputValues) {
    for (const replyStateKey of replyStateKeys) {
      if (replyStateKey in outputValues) {
        return stringifyBuddyReplyCandidate(outputValues[replyStateKey]);
      }
    }
  }

  const matchedOutputKey = outputKeys.find((key) => replyStateKeys.includes(key));
  if (matchedOutputKey && payload.value !== undefined) {
    return stringifyBuddyReplyCandidate(payload.value);
  }

  return "";
}

export function resolveBuddyRunTraceFromRunEvent(
  eventType: string,
  payload: Record<string, unknown>,
  graph: GraphPayload | null | undefined,
): BuddyRunTraceEntry | null {
  const nodeId = normalizeRunEventText(payload.node_id);
  const subgraphNodeId = normalizeRunEventText(payload.subgraph_node_id);
  if (!nodeId) {
    return null;
  }
  if (shouldSuppressBuddyRunTraceEvent(eventType, payload)) {
    return null;
  }

  const labels = resolveBuddyRunNodeLabels(graph, nodeId, subgraphNodeId);
  const params = buildBuddyActivityParams(labels);
  const timingKey = buildBuddyTraceTimingKey(nodeId, subgraphNodeId);
  const durationMs = resolveBuddyTraceDurationMs(payload);
  if (eventType === "activity.event") {
    const preview = clampBuddyTracePreview(normalizeRunEventText(payload.summary));
    if (!preview) {
      return null;
    }
    const status = normalizeRunEventText(payload.status).toLowerCase();
    const failed = status === "failed" || status === "error";
    const succeeded = status === "succeeded" || status === "success" || status === "ok";
    return {
      labelKey: failed ? "buddy.activity.failed" : succeeded ? "buddy.activity.completed" : "buddy.activity.running",
      params,
      preview,
      tone: failed ? "error" : succeeded ? "success" : "info",
      replaceKey: buildBuddyActivityTraceReplaceKey(payload, nodeId, subgraphNodeId),
      timingKey,
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  }
  if (eventType === "node.output.delta") {
    const preview = resolveBuddyRunEventOutputPreview(payload);
    return preview
      ? {
          labelKey: "buddy.activity.generatingOutput",
          params,
          preview,
          tone: "stream",
          replaceKey: buildBuddyTraceReplaceKey("node", nodeId, subgraphNodeId),
          timingKey,
        }
      : null;
  }

  if (eventType === "node.output.completed") {
    const preview = resolveBuddyRunEventOutputPreview(payload);
    return preview
      ? {
          labelKey: "buddy.activity.completed",
          params,
          preview,
          tone: "success",
          replaceKey: buildBuddyTraceReplaceKey("completed", nodeId, subgraphNodeId),
          timingKey,
          ...(durationMs !== undefined ? { durationMs } : {}),
        }
      : null;
  }

  const activity = resolveBuddyRunActivityFromRunEvent(eventType, payload, graph);
  if (!activity) {
    return null;
  }
  return {
    labelKey: activity.labelKey,
    params,
    preview: "",
    tone: eventType === "node.failed" ? "error" : eventType === "node.completed" ? "success" : "info",
    replaceKey: buildBuddyTraceReplaceKey("node", nodeId, subgraphNodeId),
    timingKey,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

function shouldSuppressBuddyRunTraceEvent(eventType: string, payload: Record<string, unknown>) {
  const nodeType = normalizeRunEventText(payload.node_type).toLowerCase();

  if (eventType === "node.output.completed") {
    return true;
  }
  if (nodeType === "input" || nodeType === "output") {
    return true;
  }
  if (nodeType === "subgraph" && (eventType === "node.started" || eventType === "node.completed")) {
    return true;
  }
  return false;
}

export function resolveBuddyRunActivityFromRunEvent(
  eventType: string,
  payload: Record<string, unknown>,
  graph: GraphPayload | null | undefined,
): BuddyRunActivityMessage | null {
  const nodeId = normalizeRunEventText(payload.node_id);
  const subgraphNodeId = normalizeRunEventText(payload.subgraph_node_id);

  if (!nodeId) {
    return null;
  }

  const labels = resolveBuddyRunNodeLabels(graph, nodeId, subgraphNodeId);
  if (eventType === "node.failed") {
    return {
      labelKey: "buddy.activity.failed",
      params: { node: labels.node },
    };
  }
  if (eventType === "node.completed") {
    return {
      labelKey: "buddy.activity.completed",
      params: { node: labels.node },
    };
  }
  if (eventType !== "node.started") {
    return null;
  }
  if (normalizeRunEventText(payload.node_type).toLowerCase() === "subgraph") {
    return {
      labelKey: "buddy.activity.running",
      params: { node: labels.node },
    };
  }

  return {
    labelKey: `buddy.activity.${resolveBuddyActivityPhase(nodeId, subgraphNodeId)}`,
    params: buildBuddyActivityParams(labels),
  };
}

function setStateValueByName(graph: GraphPayload, stateName: string, value: unknown) {
  const stateKey = findStateKeyByName(graph, stateName);
  if (!stateKey) {
    return;
  }
  setStateValue(graph, stateKey, value);
}

function setStateValueByNameOrKey(graph: GraphPayload, stateName: string, fallbackStateKey: string, value: unknown) {
  setStateValue(graph, findStateKeyByName(graph, stateName) ?? fallbackStateKey, value);
}

function setStateValue(graph: GraphPayload, stateKey: string, value: unknown) {
  if (!graph.state_schema[stateKey]) {
    return;
  }
  graph.state_schema[stateKey] = {
    ...graph.state_schema[stateKey],
    value,
  };
}

function syncInputNodeValueByName(graph: GraphPayload, stateName: string, value: unknown) {
  const stateKey = findStateKeyByName(graph, stateName);
  if (!stateKey) {
    return;
  }
  syncInputNodeValue(graph, stateKey, value);
}

function syncInputNodeValueByNameOrKey(graph: GraphPayload, stateName: string, fallbackStateKey: string, value: unknown) {
  syncInputNodeValue(graph, findStateKeyByName(graph, stateName) ?? fallbackStateKey, value);
}

function syncInputNodeValue(graph: GraphPayload, stateKey: string, value: unknown) {
  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== "input" || !node.writes.some((binding) => binding.state === stateKey)) {
      continue;
    }
    const inputNode = node as InputNode;
    inputNode.config = {
      ...inputNode.config,
      value,
    };
  }
}

function applyBuddyModePolicy(graph: GraphPayload, buddyMode: BuddyMode) {
  graph.metadata.buddy_can_execute_actions = buddyMode === "full_access";
  graph.metadata.buddy_requires_approval = buddyMode === "ask_first";
  graph.metadata.graph_permission_mode = buddyMode;
}

function applyBuddyModelOverride(graph: GraphPayload, value: unknown) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model || model === GLOBAL_RUNTIME_MODEL_OPTION_VALUE) {
    delete graph.metadata.buddy_model_ref;
    applyBuddyModelOverrideToNodes(graph.nodes, { modelSource: "global", model: "" });
    return;
  }
  graph.metadata.buddy_model_ref = model;
  applyBuddyModelOverrideToNodes(graph.nodes, { modelSource: "override", model });
}

function applyBuddyModelOverrideToNodes(
  nodes: Record<string, GraphNode>,
  patch: { modelSource: "global" | "override"; model: string },
) {
  for (const node of Object.values(nodes)) {
    if (node.kind === "agent") {
      node.config = {
        ...node.config,
        ...patch,
      };
      continue;
    }
    if (node.kind === "subgraph") {
      applyBuddyModelOverrideToNodes(node.config.graph.nodes, patch);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listBuddyRunEventOutputKeys(payload: Record<string, unknown>, fallback: string[] = []) {
  return Array.isArray(payload.output_keys) ? payload.output_keys.map((key) => String(key)).filter(Boolean) : fallback;
}

function resolveBuddyStreamingReplyText(payload: Record<string, unknown>, replyStateKeys: string[], streamStateKeys: string[]) {
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text || streamStateKeys.every((key) => !replyStateKeys.includes(key))) {
    return "";
  }
  const routed = routeStreamingJsonStateText(text, replyStateKeys);
  for (const replyStateKey of replyStateKeys) {
    const routedText = routed[replyStateKey]?.text?.trim();
    if (routedText) {
      return routedText;
    }
  }
  if (streamStateKeys.length === 1 && replyStateKeys.includes(streamStateKeys[0]) && !text.trimStart().startsWith("{")) {
    return stringifyBuddyReplyCandidate(text);
  }
  return "";
}

function resolveBuddyRunEventOutputPreview(payload: Record<string, unknown>) {
  const outputValues = isRecord(payload.output_values) ? payload.output_values : null;
  if (outputValues) {
    const outputKeys = listBuddyRunEventOutputKeys(payload, Object.keys(outputValues));
    for (const outputKey of outputKeys) {
      if (outputKey in outputValues) {
        const preview = stringifyBuddyTraceValue(outputValues[outputKey]);
        if (preview) {
          return preview;
        }
      }
    }
    for (const value of Object.values(outputValues)) {
      const preview = stringifyBuddyTraceValue(value);
      if (preview) {
        return preview;
      }
    }
  }

  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text) {
    return "";
  }
  const outputKeys = listBuddyRunEventOutputKeys(payload);
  const streamStateKeys = listBuddyRunEventOutputKeys({ output_keys: payload.stream_state_keys }, outputKeys);
  if (streamStateKeys.length > 0) {
    const routed = routeStreamingJsonStateText(text, streamStateKeys);
    for (const stateKey of streamStateKeys) {
      const route = routed[stateKey];
      if (route?.text?.trim()) {
        return clampBuddyTracePreview(route.text);
      }
    }
    if (streamStateKeys.length === 1 && !text.trimStart().startsWith("{")) {
      return clampBuddyTracePreview(text);
    }
  }
  return "";
}

function stringifyBuddyTraceValue(value: unknown) {
  const text = stringifyBuddyReplyCandidate(value);
  return clampBuddyTracePreview(text);
}

function clampBuddyTracePreview(value: string) {
  const lines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const preview = (lines.length > 0 ? lines.slice(0, 3).join("\n") : value.trim()).slice(0, 240).trim();
  return preview.length === 240 ? `${preview.slice(0, 239)}…` : preview;
}

function buildBuddyTraceReplaceKey(kind: string, nodeId: string, subgraphNodeId: string) {
  return `${kind}:${subgraphNodeId ? `${subgraphNodeId}:` : ""}${nodeId}`;
}

function buildBuddyTraceTimingKey(nodeId: string, subgraphNodeId: string) {
  return buildBuddyTraceReplaceKey("stage", nodeId, subgraphNodeId);
}

function buildBuddyActivityTraceReplaceKey(payload: Record<string, unknown>, nodeId: string, subgraphNodeId: string) {
  const sequence = normalizeRunEventSequence(payload.sequence);
  const fallback = normalizeRunEventText(payload.kind) || "event";
  return `${buildBuddyTraceReplaceKey("activity", nodeId, subgraphNodeId)}:${sequence ?? fallback}`;
}

function normalizeRunEventSequence(value: unknown) {
  const sequence = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(sequence) && sequence > 0 ? Math.round(sequence) : null;
}

function resolveBuddyTraceDurationMs(payload: Record<string, unknown>) {
  const rawValue = payload.duration_ms ?? payload.durationMs;
  const durationMs = typeof rawValue === "number" ? rawValue : typeof rawValue === "string" ? Number(rawValue) : NaN;
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : undefined;
}

function resolveBuddyActivityPhase(nodeId: string, subgraphNodeId: string) {
  const phase = BUDDY_ACTIVITY_PHASE_BY_NODE_ID[nodeId] ?? BUDDY_ACTIVITY_PHASE_BY_NODE_ID[subgraphNodeId];
  return phase ?? "running";
}

const BUDDY_ACTIVITY_PHASE_BY_NODE_ID: Record<string, string> = {
  input_buddy_context: "readingContext",
  intake_request: "understanding",
  understand_request: "understanding",
  need_clarification: "checkingClarification",
  ask_clarification: "askingClarification",
  merge_clarification: "understanding",
  needs_capability: "checkingCapabilityNeed",
  run_capability_cycle: "selectingCapability",
  select_capability: "selectingCapability",
  capability_found_condition: "selectingCapability",
  review_missing_capability: "reviewingCapability",
  review_capability_permission: "checkingPermission",
  needs_capability_approval: "checkingPermission",
  request_capability_approval: "awaitingApproval",
  review_approval_decision: "checkingPermission",
  approval_granted: "checkingPermission",
  review_denied_capability: "reviewingCapability",
  execute_capability: "executingCapability",
  review_capability_result: "reviewingCapability",
  continue_capability_loop: "reviewingCapability",
  finalize_capability_cycle: "reviewingCapability",
  draft_final_response: "draftingReply",
  draft_final_reply: "draftingReply",
  decide_autonomous_review: "reviewingMemory",
  should_write_buddy_home: "reviewingMemory",
  apply_buddy_home_writeback: "reviewingMemory",
};

function buildBuddyActivityParams(labels: { node: string; stage: string }) {
  const params: Record<string, string> = { node: labels.node };
  if (labels.stage && labels.stage !== labels.node) {
    params.stage = labels.stage;
  }
  return params;
}

function resolveBuddyRunNodeLabels(graph: GraphPayload | null | undefined, nodeId: string, subgraphNodeId: string) {
  const rootNode = subgraphNodeId ? graph?.nodes[subgraphNodeId] : graph?.nodes[nodeId];
  const innerNode = subgraphNodeId && rootNode?.kind === "subgraph" ? rootNode.config.graph.nodes[nodeId] : null;
  return {
    node: resolveBuddyNodeLabel(innerNode ?? rootNode, nodeId),
    stage: subgraphNodeId ? resolveBuddyNodeLabel(rootNode, subgraphNodeId) : "",
  };
}

function resolveBuddyNodeLabel(node: GraphNode | null | undefined, fallback: string) {
  const label = node?.name?.trim() || node?.description?.trim();
  return label || humanizeBuddyRuntimeKey(fallback);
}

function humanizeBuddyRuntimeKey(value: string) {
  return value
    .trim()
    .replace(/^state_/, "State ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeRunEventText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function findStateKeyByName(graph: GraphPayload, stateName: string) {
  return Object.entries(graph.state_schema).find(([, definition]) => definition.name === stateName)?.[0] ?? null;
}

function resolveRunStateValueByName(run: RunDetail, stateName: string, fallback: unknown) {
  const stateKey = findRunStateKeyByName(run, stateName) ?? stateName;
  if (stateKey in run.state_snapshot.values) {
    return run.state_snapshot.values[stateKey];
  }
  if (run.artifacts?.state_values && stateKey in run.artifacts.state_values) {
    return run.artifacts.state_values[stateKey];
  }
  return fallback;
}

function findRunStateKeyByName(run: RunDetail, stateName: string) {
  const stateSchema = isRecord(run.graph_snapshot?.state_schema) ? run.graph_snapshot.state_schema : null;
  if (!stateSchema) {
    return null;
  }
  return (
    Object.entries(stateSchema).find(
      ([, definition]) => isRecord(definition) && String(definition.name ?? "").trim() === stateName,
    )?.[0] ?? null
  );
}

function resolveBuddyReplyStateKeys(graphSnapshot: Record<string, unknown> | null | undefined) {
  const stateSchema = isRecord(graphSnapshot?.state_schema) ? graphSnapshot.state_schema : null;
  const keysFromNames = stateSchema
    ? Object.entries(stateSchema)
        .filter(([, definition]) => isRecord(definition) && typeof definition.name === "string")
        .filter(([, definition]) =>
          [
            "buddy_reply",
            "visible_reply",
            "final_reply",
            "direct_reply",
            "denied_reply",
            "approval_prompt",
            "missing_skill_proposal",
          ].includes(String((definition as { name: string }).name)),
        )
        .map(([stateKey]) => stateKey)
    : [];
  return uniqueStrings([...keysFromNames, ...BUDDY_AGENTIC_REPLY_STATE_KEYS, BUDDY_REPLY_STATE_KEY]);
}

function isBuddyReplyStateKey(stateKey: string) {
  return stateKey === BUDDY_REPLY_STATE_KEY || BUDDY_AGENTIC_REPLY_STATE_KEYS.includes(stateKey);
}

function resolveOutputPreviewValue(previews: RunDetail["output_previews"] | undefined, stateKeys: string[]) {
  return previews?.find((preview) => stateKeys.includes(preview.source_key))?.value;
}

function stringifyBuddyReplyCandidate(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
