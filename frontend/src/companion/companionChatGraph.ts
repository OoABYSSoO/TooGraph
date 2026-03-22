import type { GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

export const COMPANION_TEMPLATE_ID = "companion_chat_loop";
export const COMPANION_USER_MESSAGE_STATE_KEY = "state_1";
export const COMPANION_HISTORY_STATE_KEY = "state_2";
export const COMPANION_PAGE_CONTEXT_STATE_KEY = "state_3";
export const COMPANION_REPLY_STATE_KEY = "state_4";
export const MAX_COMPANION_HISTORY_MESSAGES = 12;

export type CompanionChatRole = "user" | "assistant";

export type CompanionChatMessage = {
  role: CompanionChatRole;
  content: string;
};

export type BuildCompanionChatGraphInput = {
  userMessage: string;
  history: CompanionChatMessage[];
  pageContext: string;
};

export function formatCompanionHistory(messages: CompanionChatMessage[], maxMessages = MAX_COMPANION_HISTORY_MESSAGES) {
  const entries = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-maxMessages);

  if (entries.length === 0) {
    return "暂无历史对话。";
  }

  return entries.map((message) => `${message.role === "user" ? "用户" : "桌宠"}: ${message.content}`).join("\n");
}

export function buildCompanionChatGraph(template: TemplateRecord, input: BuildCompanionChatGraphInput): GraphPayload {
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
    },
  };

  setStateValue(graph, COMPANION_USER_MESSAGE_STATE_KEY, input.userMessage);
  setStateValue(graph, COMPANION_HISTORY_STATE_KEY, formatCompanionHistory(input.history));
  setStateValue(graph, COMPANION_PAGE_CONTEXT_STATE_KEY, input.pageContext.trim() || "当前页面上下文不可用。");
  setStateValue(graph, COMPANION_REPLY_STATE_KEY, "");

  syncInputNodeValue(graph, COMPANION_USER_MESSAGE_STATE_KEY, input.userMessage);
  syncInputNodeValue(graph, COMPANION_HISTORY_STATE_KEY, graph.state_schema[COMPANION_HISTORY_STATE_KEY]?.value ?? "");
  syncInputNodeValue(graph, COMPANION_PAGE_CONTEXT_STATE_KEY, graph.state_schema[COMPANION_PAGE_CONTEXT_STATE_KEY]?.value ?? "");

  return graph;
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
