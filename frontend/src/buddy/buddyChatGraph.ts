import type { AgentNode, GraphNode, GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type { SkillDefinition } from "../types/skills.ts";
import { GLOBAL_RUNTIME_MODEL_OPTION_VALUE } from "../lib/runtimeModelCatalog.ts";
import { routeStreamingJsonStateText } from "../lib/streamingJsonStateRouter.ts";

export const BUDDY_TEMPLATE_ID = "buddy_autonomous_loop";
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
export const DEFAULT_BUDDY_MODE = "advisory";

export type BuddyChatRole = "user" | "assistant";
export type BuddyMode = "advisory" | "approval" | "unrestricted";

export type BuddyModeOption = {
  value: BuddyMode;
  labelKey: string;
  descriptionKey: string;
  disabled: boolean;
};

export const BUDDY_MODE_OPTIONS: BuddyModeOption[] = [
  {
    value: "advisory",
    labelKey: "buddy.modes.advisory",
    descriptionKey: "buddy.modeDescriptions.advisory",
    disabled: false,
  },
  {
    value: "approval",
    labelKey: "buddy.modes.approval",
    descriptionKey: "buddy.modeDescriptions.approval",
    disabled: false,
  },
  {
    value: "unrestricted",
    labelKey: "buddy.modes.unrestricted",
    descriptionKey: "buddy.modeDescriptions.unrestricted",
    disabled: true,
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
};

export type BuildBuddyChatGraphInput = {
  userMessage: string;
  history: BuddyChatMessage[];
  pageContext: string;
  buddyMode?: unknown;
  buddyModel?: unknown;
  skillCatalog?: SkillDefinition[];
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
      buddy_template_id: template.template_id,
      buddy_run: true,
      buddy_mode: buddyMode,
      buddy_can_execute_actions: false,
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
  for (const stateName of ["buddy_reply", "final_reply", "direct_reply", "denied_reply", "approval_prompt"]) {
    setStateValueByName(graph, stateName, "");
  }

  syncInputNodeValueByNameOrKey(graph, "user_message", BUDDY_USER_MESSAGE_STATE_KEY, input.userMessage);
  syncInputNodeValueByNameOrKey(graph, "conversation_history", BUDDY_HISTORY_STATE_KEY, historyValue);
  syncInputNodeValueByNameOrKey(graph, "page_context", BUDDY_PAGE_CONTEXT_STATE_KEY, pageContextValue);
  syncInputNodeValueByNameOrKey(graph, "buddy_mode", BUDDY_MODE_STATE_KEY, buddyMode);
  syncInputNodeValueByName(graph, "skill_catalog_snapshot", skillCatalogSnapshot);
  if (buddyMode !== "unrestricted") {
    enforceAdvisoryBuddyGraph(graph);
  }

  return graph;
}

export function resolveBuddyMode(value: unknown): BuddyMode {
  return value === "approval" || value === DEFAULT_BUDDY_MODE ? value : DEFAULT_BUDDY_MODE;
}

export function buildBuddySkillCatalogSnapshot(skills: SkillDefinition[], buddyMode: BuddyMode) {
  return skills.map((skill) => {
    const snapshot = cloneJson(skill);
    const configuredDefaultPolicy = snapshot.capabilityPolicy?.default ?? {};
    const defaultPolicy = {
      ...configuredDefaultPolicy,
      selectable: configuredDefaultPolicy.selectable ?? true,
      requiresApproval: configuredDefaultPolicy.requiresApproval ?? false,
    };
    const buddyPolicy = {
      ...defaultPolicy,
      ...(snapshot.capabilityPolicy?.origins?.buddy ?? {}),
    };
    const buddyOriginPolicy =
      buddyMode === "approval" || !buddyPolicy.requiresApproval
        ? buddyPolicy
        : {
            ...buddyPolicy,
            selectable: false,
          };
    snapshot.capabilityPolicy = {
      default: defaultPolicy,
      origins: {
        ...(snapshot.capabilityPolicy?.origins ?? {}),
        buddy: buddyOriginPolicy,
      },
    };
    return snapshot;
  });
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

  const labels = resolveBuddyRunNodeLabels(graph, nodeId, subgraphNodeId);
  const params = buildBuddyActivityParams(labels);
  if (eventType === "node.output.delta") {
    const preview = resolveBuddyRunEventOutputPreview(payload);
    return preview
      ? {
          labelKey: "buddy.activity.generatingOutput",
          params,
          preview,
          tone: "stream",
          replaceKey: buildBuddyTraceReplaceKey("stream", nodeId, subgraphNodeId),
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
        }
      : null;
  }

  const activity = resolveBuddyRunActivityFromRunEvent(eventType, payload, graph);
  if (!activity) {
    return null;
  }
  return {
    ...activity,
    preview: "",
    tone: eventType === "node.failed" ? "error" : eventType === "node.completed" ? "success" : "info",
    replaceKey: buildBuddyTraceReplaceKey(eventType, nodeId, subgraphNodeId),
  };
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

function enforceAdvisoryBuddyGraph(graph: GraphPayload) {
  const agentNode = graph.nodes.buddy_reply_agent;
  if (!agentNode || agentNode.kind !== "agent") {
    return;
  }
  const buddyAgent = agentNode as AgentNode;
  buddyAgent.config = {
    ...buddyAgent.config,
    skillKey: "",
    skillBindings: [],
  };
}

function applyBuddyModePolicy(graph: GraphPayload, buddyMode: BuddyMode) {
  graph.metadata.buddy_permission_tier = buddyMode === "approval" ? 2 : 1;
  graph.metadata.buddy_can_execute_actions = false;
  graph.metadata.buddy_requires_approval = buddyMode === "approval";
  graph.metadata.buddy_graph_patch_drafts_enabled = buddyMode === "approval";
  if (buddyMode !== "approval") {
    return;
  }
  const approvalNodeId = graph.nodes.request_approval_agent ? "request_approval_agent" : "buddy_reply_agent";
  graph.metadata.interrupt_after = addUniqueMetadataNodeId(graph.metadata.interrupt_after, approvalNodeId);
}

function applyBuddyModelOverride(graph: GraphPayload, value: unknown) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model || model === GLOBAL_RUNTIME_MODEL_OPTION_VALUE) {
    delete graph.metadata.buddy_model_ref;
    for (const node of Object.values(graph.nodes)) {
      if (node.kind !== "agent") {
        continue;
      }
      node.config = {
        ...node.config,
        modelSource: "global",
        model: "",
      };
    }
    return;
  }
  graph.metadata.buddy_model_ref = model;
  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== "agent") {
      continue;
    }
    node.config = {
      ...node.config,
      modelSource: "override",
      model,
    };
  }
}

function addUniqueMetadataNodeId(value: unknown, nodeId: string) {
  const items = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : typeof value === "string" && value.trim()
      ? [value.trim()]
      : [];
  return items.includes(nodeId) ? items : [...items, nodeId];
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
  review_buddy_memory: "reviewingMemory",
  decide_memory_update: "reviewingMemory",
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

function resolveBuddyReplyStateKeys(graphSnapshot: Record<string, unknown> | null | undefined) {
  const stateSchema = isRecord(graphSnapshot?.state_schema) ? graphSnapshot.state_schema : null;
  const keysFromNames = stateSchema
    ? Object.entries(stateSchema)
        .filter(([, definition]) => isRecord(definition) && typeof definition.name === "string")
        .filter(([, definition]) =>
          [
            "buddy_reply",
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
