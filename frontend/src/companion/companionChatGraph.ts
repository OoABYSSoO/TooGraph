import type { AgentNode, GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

export const COMPANION_TEMPLATE_ID = "companion_chat_loop";
export const COMPANION_USER_MESSAGE_STATE_KEY = "state_1";
export const COMPANION_HISTORY_STATE_KEY = "state_2";
export const COMPANION_PAGE_CONTEXT_STATE_KEY = "state_3";
export const COMPANION_REPLY_STATE_KEY = "state_4";
export const COMPANION_MODE_STATE_KEY = "state_5";
export const COMPANION_PROFILE_STATE_KEY = "state_6";
export const COMPANION_POLICY_STATE_KEY = "state_7";
export const COMPANION_MEMORY_CONTEXT_STATE_KEY = "state_8";
export const COMPANION_SESSION_SUMMARY_STATE_KEY = "state_9";
export const MAX_COMPANION_HISTORY_MESSAGES = 12;
export const DEFAULT_COMPANION_MODE = "advisory";

export type CompanionChatRole = "user" | "assistant";
export type CompanionMode = "advisory" | "approval" | "unrestricted";

export type CompanionModeOption = {
  value: CompanionMode;
  labelKey: string;
  descriptionKey: string;
  disabled: boolean;
};

export const COMPANION_MODE_OPTIONS: CompanionModeOption[] = [
  {
    value: "advisory",
    labelKey: "companion.modes.advisory",
    descriptionKey: "companion.modeDescriptions.advisory",
    disabled: false,
  },
  {
    value: "approval",
    labelKey: "companion.modes.approval",
    descriptionKey: "companion.modeDescriptions.approval",
    disabled: false,
  },
  {
    value: "unrestricted",
    labelKey: "companion.modes.unrestricted",
    descriptionKey: "companion.modeDescriptions.unrestricted",
    disabled: true,
  },
];

export type CompanionChatMessage = {
  role: CompanionChatRole;
  content: string;
  includeInContext?: boolean;
};

export type BuildCompanionChatGraphInput = {
  userMessage: string;
  history: CompanionChatMessage[];
  pageContext: string;
  companionMode?: unknown;
  companionModel?: unknown;
};

export function formatCompanionHistory(messages: CompanionChatMessage[], maxMessages = MAX_COMPANION_HISTORY_MESSAGES) {
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

  return entries.map((message) => `${message.role === "user" ? "用户" : "桌宠"}: ${message.content}`).join("\n");
}

export function buildCompanionChatGraph(template: TemplateRecord, input: BuildCompanionChatGraphInput): GraphPayload {
  const companionMode = resolveCompanionMode(input.companionMode);
  const graph: GraphPayload = {
    graph_id: null,
    name: template.default_graph_name,
    state_schema: cloneJson(template.state_schema),
    nodes: cloneJson(template.nodes),
    edges: cloneJson(template.edges),
    conditional_edges: cloneJson(template.conditional_edges),
    metadata: {
      ...cloneJson(template.metadata),
      companion_template_id: template.template_id,
      companion_run: true,
      companion_mode: companionMode,
      companion_can_execute_actions: false,
    },
  };
  applyCompanionModePolicy(graph, companionMode);
  applyCompanionModelOverride(graph, input.companionModel);

  setStateValue(graph, COMPANION_USER_MESSAGE_STATE_KEY, input.userMessage);
  setStateValue(graph, COMPANION_HISTORY_STATE_KEY, formatCompanionHistory(input.history));
  setStateValue(graph, COMPANION_PAGE_CONTEXT_STATE_KEY, input.pageContext.trim() || "当前页面上下文不可用。");
  setStateValue(graph, COMPANION_REPLY_STATE_KEY, "");
  setStateValue(graph, COMPANION_MODE_STATE_KEY, companionMode);

  syncInputNodeValue(graph, COMPANION_USER_MESSAGE_STATE_KEY, input.userMessage);
  syncInputNodeValue(graph, COMPANION_HISTORY_STATE_KEY, graph.state_schema[COMPANION_HISTORY_STATE_KEY]?.value ?? "");
  syncInputNodeValue(graph, COMPANION_PAGE_CONTEXT_STATE_KEY, graph.state_schema[COMPANION_PAGE_CONTEXT_STATE_KEY]?.value ?? "");
  syncInputNodeValue(graph, COMPANION_MODE_STATE_KEY, companionMode);
  if (companionMode !== "unrestricted") {
    enforceAdvisoryCompanionGraph(graph);
  }

  return graph;
}

export function resolveCompanionMode(value: unknown): CompanionMode {
  return value === "approval" || value === DEFAULT_COMPANION_MODE ? value : DEFAULT_COMPANION_MODE;
}

export function resolveCompanionReplyText(run: RunDetail): string {
  const candidates = [
    run.state_snapshot?.values?.[COMPANION_REPLY_STATE_KEY],
    run.artifacts?.state_values?.[COMPANION_REPLY_STATE_KEY],
    resolveOutputPreviewValue(run.output_previews),
    resolveOutputPreviewValue(run.artifacts?.output_previews),
    run.final_result,
  ];

  for (const candidate of candidates) {
    const text = stringifyCompanionReplyCandidate(candidate);
    if (text) {
      return text;
    }
  }

  return "";
}

export function resolveCompanionReplyFromRunEvent(payload: Record<string, unknown>): string {
  const stateKey = typeof payload.state_key === "string" ? payload.state_key.trim() : "";
  if (stateKey === COMPANION_REPLY_STATE_KEY) {
    return stringifyCompanionReplyCandidate(payload.value ?? payload.text);
  }

  const outputKeys = Array.isArray(payload.output_keys)
    ? payload.output_keys.map((key) => String(key)).filter(Boolean)
    : [];
  if (outputKeys.includes(COMPANION_REPLY_STATE_KEY)) {
    return stringifyCompanionReplyCandidate(payload.text ?? payload.value);
  }

  return "";
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

function enforceAdvisoryCompanionGraph(graph: GraphPayload) {
  const agentNode = graph.nodes.companion_reply_agent;
  if (!agentNode || agentNode.kind !== "agent") {
    return;
  }
  const companionAgent = agentNode as AgentNode;
  companionAgent.config = {
    ...companionAgent.config,
    skills: [],
    skillBindings: [],
  };
}

function applyCompanionModePolicy(graph: GraphPayload, companionMode: CompanionMode) {
  graph.metadata.companion_permission_tier = companionMode === "approval" ? 2 : 1;
  graph.metadata.companion_can_execute_actions = false;
  graph.metadata.companion_requires_approval = companionMode === "approval";
  graph.metadata.companion_graph_patch_drafts_enabled = companionMode === "approval";
  if (companionMode !== "approval") {
    return;
  }
  graph.metadata.interrupt_after = addUniqueMetadataNodeId(graph.metadata.interrupt_after, "companion_reply_agent");
  graph.metadata.agent_breakpoint_timing = {
    ...(isRecord(graph.metadata.agent_breakpoint_timing) ? graph.metadata.agent_breakpoint_timing : {}),
    companion_reply_agent: "after",
  };
}

function applyCompanionModelOverride(graph: GraphPayload, value: unknown) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model) {
    delete graph.metadata.companion_model_ref;
    return;
  }
  graph.metadata.companion_model_ref = model;
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

function resolveOutputPreviewValue(previews: RunDetail["output_previews"] | undefined) {
  return previews?.find((preview) => preview.source_key === COMPANION_REPLY_STATE_KEY)?.value;
}

function stringifyCompanionReplyCandidate(value: unknown): string {
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
