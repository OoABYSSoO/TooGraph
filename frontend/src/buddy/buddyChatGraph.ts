import type { GraphNode, GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type { BuddyMemoryReviewInputSource, BuddyMemoryReviewTemplateBinding, BuddyRunInputSource, BuddyRunTemplateBinding } from "../types/buddy.ts";
import { GLOBAL_RUNTIME_MODEL_OPTION_VALUE } from "../lib/runtimeModelCatalog.ts";
import { routeStreamingJsonStateText } from "../lib/streamingJsonStateRouter.ts";
import {
  buildBuddyHomeContextValue,
  resolveEffectiveBuddyMemoryReviewTemplateBinding,
  resolveEffectiveBuddyRunTemplateBinding,
  validateBuddyMemoryReviewTemplateBinding,
  validateBuddyRunTemplateBinding,
} from "./buddyTemplateBindingModel.ts";

export const BUDDY_REVIEW_TEMPLATE_ID = "buddy_autonomous_review";
export const BUDDY_REPLY_STATE_KEY = "state_4";
export const BUDDY_AGENTIC_REPLY_STATE_KEYS = ["state_27", "state_25", "state_26", "state_16", "state_18"];
export const MAX_BUDDY_HISTORY_MESSAGES = 12;
export const MAX_BUDDY_HISTORY_CONTEXT_CHARS = 4000;
const MAX_BUDDY_HISTORY_OMITTED_PREVIEWS = 5;
const MAX_BUDDY_HISTORY_OMITTED_PREVIEW_CHARS = 48;
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
  id?: string;
  role: BuddyChatRole;
  content: string;
  includeInContext?: boolean;
  sourceRevisionId?: string;
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
  sessionSummary?: string;
  currentSessionId?: string;
  currentMessageId?: string;
  pageOperationContext?: BuddyActionRuntimeContext | null;
  buddyMode?: unknown;
  buddyModel?: unknown;
};

export type BuddyActionRuntimeContext = {
  page_path?: string;
  page_snapshot?: unknown;
  page_operation_book?: unknown;
};

export type BuildBuddyReviewGraphInput = {
  mainRun: RunDetail;
  binding: BuddyMemoryReviewTemplateBinding;
  currentSessionId: string;
  buddyModel?: unknown;
};

export function formatBuddyHistory(
  messages: BuddyChatMessage[],
  maxMessages = MAX_BUDDY_HISTORY_MESSAGES,
  maxChars = MAX_BUDDY_HISTORY_CONTEXT_CHARS,
) {
  const entries = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
      includeInContext: message.includeInContext,
    }))
    .filter((message) => message.includeInContext !== false)
    .filter((message) => message.content.length > 0);

  if (entries.length === 0) {
    return "暂无历史对话。";
  }

  const limitedEntries = entries.slice(-Math.max(1, maxMessages));
  const omittedEntries = entries.slice(0, entries.length - limitedEntries.length);
  const keptLines: string[] = [];
  const omittedByBudget: typeof entries = [];
  let usedChars = 0;
  const normalizedMaxChars = Math.max(80, maxChars);

  for (let index = limitedEntries.length - 1; index >= 0; index -= 1) {
    const entry = limitedEntries[index];
    const line = formatBuddyHistoryLine(entry);
    const separatorChars = keptLines.length > 0 ? 1 : 0;
    if (usedChars + separatorChars + line.length <= normalizedMaxChars || keptLines.length === 0) {
      const availableChars = Math.max(1, normalizedMaxChars - usedChars - separatorChars);
      keptLines.unshift(line.length <= availableChars ? line : truncateText(line, availableChars));
      usedChars += separatorChars + Math.min(line.length, availableChars);
    } else {
      omittedByBudget.unshift(entry);
    }
  }

  const omitted = [...omittedEntries, ...omittedByBudget];
  if (omitted.length === 0) {
    return keptLines.join("\n");
  }
  return [...keptLines, "", ...formatBuddyHistoryOmittedLines(omitted)].join("\n");
}

function formatBuddyHistoryLine(message: Pick<BuddyChatMessage, "role" | "content">) {
  return `${message.role === "user" ? "用户" : "伙伴"}: ${message.content}`;
}

function formatBuddyHistoryOmittedLines(messages: Array<Pick<BuddyChatMessage, "role" | "content">>) {
  const previewMessages = messages.slice(-MAX_BUDDY_HISTORY_OMITTED_PREVIEWS);
  return [
    "省略的历史对话:",
    `omitted_count: ${messages.length}`,
    ...previewMessages.map((message) => `- ${formatBuddyHistoryLine({
      role: message.role,
      content: truncateText(message.content, MAX_BUDDY_HISTORY_OMITTED_PREVIEW_CHARS),
    })}`),
  ];
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 3) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

export function buildBuddyChatGraph(
  template: TemplateRecord,
  input: BuildBuddyChatGraphInput,
  binding: BuddyRunTemplateBinding,
): GraphPayload {
  const buddyMode = resolveBuddyMode(input.buddyMode);
  const effectiveBinding = resolveEffectiveBuddyRunTemplateBinding(template, binding);
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
      buddy_template_binding: cloneJson(effectiveBinding),
      buddy_mode: buddyMode,
      buddy_can_execute_actions: buddyMode === "full_access",
      capability_permission_policy: buildBuddyCapabilityPermissionPolicy(buddyMode),
      runtime_context: {
        invocation_source: "buddy_chat",
        buddy_session_id: input.currentSessionId ?? "",
        buddy_current_message_id: input.currentMessageId ?? "",
      },
      action_runtime_context: cloneJson(input.pageOperationContext ?? {}),
    },
  };
  applyBuddyModePolicy(graph, buddyMode);
  applyBuddyModelOverride(graph, input.buddyModel);

  const validation = validateBuddyRunTemplateBinding(template, binding);
  if (!validation.valid) {
    throw new Error(`Buddy run template binding is invalid: ${validation.issues.join(" ")}`);
  }
  applyBuddyRunTemplateBinding(graph, effectiveBinding, buildBuddyRuntimeSourceValues(input));
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

  const validation = validateBuddyMemoryReviewTemplateBinding(template, input.binding);
  if (!validation.valid) {
    throw new Error(`Buddy memory review template binding is invalid: ${validation.issues.join(" ")}`);
  }
  const effectiveBinding = resolveEffectiveBuddyMemoryReviewTemplateBinding(template, input.binding);
  applyBuddyRunTemplateBinding(graph, effectiveBinding, buildBuddyMemoryReviewRuntimeSourceValues(input));

  const outputDefaults: Record<string, unknown> = {
    autonomous_review: {},
    improvement_candidates: [],
    memory_update_plan: { has_updates: false, commands: [] },
    user_context_update_plan: { has_updates: false, commands: [] },
    structured_memory_update_plan: { has_updates: false, commands: [] },
    memory_review_result: "",
    user_context_review_result: "",
    memory_write_success: false,
    applied_memory_commands: [],
    skipped_memory_commands: [],
    memory_write_result: "",
    user_context_write_success: false,
    applied_user_context_commands: [],
    skipped_user_context_commands: [],
    user_context_write_result: "",
    structured_memory_write_success: false,
    applied_structured_memory_commands: [],
    skipped_structured_memory_commands: [],
    written_structured_memories: [],
    structured_memory_write_result: "",
    buddy_identity_update_plan: { has_updates: false, requires_confirmation: false, commands: [] },
    buddy_identity_review_result: "",
    buddy_identity_write_success: false,
    applied_buddy_identity_commands: [],
    skipped_buddy_identity_commands: [],
    buddy_identity_write_result: "",
  };

  for (const [stateName, value] of Object.entries(outputDefaults)) {
    setStateValueByName(graph, stateName, value);
  }

  return graph;
}

export function resolveBuddyMode(value: unknown): BuddyMode {
  if (value === "full_access" || value === "unrestricted") {
    return "full_access";
  }
  return DEFAULT_BUDDY_MODE;
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

type BuddyRuntimeSourceValues<TSource extends string> = Partial<Record<TSource, unknown>>;

function buildBuddyRuntimeSourceValues(input: BuildBuddyChatGraphInput): BuddyRuntimeSourceValues<BuddyRunInputSource> {
  return {
    current_message: input.userMessage,
    conversation_history: buildBuddyConversationHistoryContextPackage(input),
    session_summary: input.sessionSummary ?? "",
    buddy_home_context: buildBuddyHomeContextValue(),
    current_session_id: input.currentSessionId ?? "",
  };
}

type BuddyContextAssemblySourceRef = {
  source_kind: "buddy_message" | "buddy_session_summary";
  source_id: string;
  role: BuddyChatRole | "summary";
  ordinal: number;
  source_revision_id?: string;
};

type BuddyContextAssemblyRef = {
  kind: "context_assembly_ref";
  assembly_id: string;
  target_state_key: "conversation_history";
  renderer_key: "buddy_history";
  renderer_version: "1";
  rendered_content_hash: string;
  source_count: number;
  source_refs: BuddyContextAssemblySourceRef[];
  budget: {
    max_messages: number;
    max_chars: number;
  };
  metadata: {
    current_session_id: string;
    current_message_id: string;
  };
  preview: string;
};

type BuddyContextPackageItem = {
  id: string;
  title: string;
  source_ref: BuddyContextAssemblySourceRef;
  metadata: {
    source_kind: BuddyContextAssemblySourceRef["source_kind"];
    role: BuddyContextAssemblySourceRef["role"];
    ordinal: number;
  };
};

type BuddyConversationHistoryContextPackage = {
  kind: "context_package";
  package_id: string;
  source_kind: "session";
  authority: "history";
  title: string;
  items: BuddyContextPackageItem[];
  source_refs: BuddyContextAssemblySourceRef[];
  source_count: number;
  context_ref: BuddyContextAssemblyRef;
  budget: {
    max_messages: number;
    max_chars: number;
    source_chars: number;
    used_chars: number;
    omitted_count: number;
  };
  warnings: Array<{ code: string; message: string }>;
  metadata: {
    current_session_id: string;
    current_message_id: string;
    renderer_key: "buddy_history";
    renderer_version: "1";
  };
};

function buildBuddyConversationHistoryContextPackage(input: BuildBuddyChatGraphInput): BuddyConversationHistoryContextPackage {
  const sourceRefs = buildBuddyConversationHistorySourceRefs(input);
  const contextRef = buildBuddyConversationHistoryContextRef(input, sourceRefs);
  const sourceChars = estimateBuddyConversationHistorySourceChars(input);
  const usedChars = sourceRefs.length > 0 ? buildBuddyConversationHistoryRenderedPreview(input).length : 0;
  const omittedCount = estimateBuddyConversationHistoryOmittedCount(input, sourceRefs);
  return {
    kind: "context_package",
    package_id: buildPendingContextPackageId(contextRef.assembly_id),
    source_kind: "session",
    authority: "history",
    title: "Buddy conversation history",
    items: buildBuddyConversationHistoryPackageItems(sourceRefs),
    source_refs: sourceRefs,
    source_count: sourceRefs.length,
    context_ref: contextRef,
    budget: {
      max_messages: MAX_BUDDY_HISTORY_MESSAGES,
      max_chars: MAX_BUDDY_HISTORY_CONTEXT_CHARS,
      source_chars: sourceChars,
      used_chars: usedChars,
      omitted_count: omittedCount,
    },
    warnings: [],
    metadata: {
      current_session_id: input.currentSessionId ?? "",
      current_message_id: input.currentMessageId ?? "",
      renderer_key: "buddy_history",
      renderer_version: "1",
    },
  };
}

function buildBuddyConversationHistoryContextRef(
  input: BuildBuddyChatGraphInput,
  sourceRefs = buildBuddyConversationHistorySourceRefs(input),
): BuddyContextAssemblyRef {
  return {
    kind: "context_assembly_ref",
    assembly_id: buildPendingContextAssemblyId(input.currentSessionId ?? "", sourceRefs),
    target_state_key: "conversation_history",
    renderer_key: "buddy_history",
    renderer_version: "1",
    rendered_content_hash: "",
    source_count: sourceRefs.length,
    source_refs: sourceRefs,
    budget: {
      max_messages: MAX_BUDDY_HISTORY_MESSAGES,
      max_chars: MAX_BUDDY_HISTORY_CONTEXT_CHARS,
    },
    metadata: {
      current_session_id: input.currentSessionId ?? "",
      current_message_id: input.currentMessageId ?? "",
    },
    preview: buildBuddyConversationHistoryPreview(input),
  };
}

function buildBuddyConversationHistorySourceRefs(input: BuildBuddyChatGraphInput): BuddyContextAssemblySourceRef[] {
  const refs: BuddyContextAssemblySourceRef[] = [];
  const sessionSummary = (input.sessionSummary ?? "").trim();
  if (sessionSummary) {
    refs.push({
      source_kind: "buddy_session_summary",
      source_id: "session_summary",
      role: "summary",
      ordinal: refs.length,
    });
  }

  const messages = input.history
    .filter((message) => message.includeInContext !== false)
    .filter((message) => message.content.trim().length > 0)
    .filter((message) => typeof message.id === "string" && message.id.trim().length > 0)
    .slice(-Math.max(1, MAX_BUDDY_HISTORY_MESSAGES));

  for (const message of messages) {
    const sourceRef: BuddyContextAssemblySourceRef = {
      source_kind: "buddy_message",
      source_id: String(message.id),
      role: message.role,
      ordinal: refs.length,
    };
    if (message.sourceRevisionId?.trim()) {
      sourceRef.source_revision_id = message.sourceRevisionId.trim();
    }
    refs.push(sourceRef);
  }
  return refs;
}

function buildBuddyConversationHistoryPreview(input: BuildBuddyChatGraphInput) {
  const sourceCount = buildBuddyConversationHistorySourceRefs(input).length;
  if (sourceCount === 0) {
    return "暂无历史对话。";
  }
  return `context assembly sources: ${sourceCount}`;
}

function buildPendingContextAssemblyId(sessionId: string, sourceRefs: BuddyContextAssemblySourceRef[]) {
  const key = JSON.stringify({
    session_id: sessionId,
    source_refs: sourceRefs.map((source) => [
      source.source_kind,
      source.source_id,
      source.source_revision_id ?? "",
      source.role,
      source.ordinal,
    ]),
  });
  return `ctx_pending_${stableHashString(key)}`;
}

function buildPendingContextPackageId(assemblyId: string) {
  return assemblyId.startsWith("ctx_") ? `pkg_${assemblyId.slice(4)}` : `pkg_${stableHashString(assemblyId)}`;
}

function buildBuddyConversationHistoryPackageItems(sourceRefs: BuddyContextAssemblySourceRef[]): BuddyContextPackageItem[] {
  return sourceRefs.map((sourceRef) => ({
    id: sourceRef.source_id,
    title: sourceRef.source_kind === "buddy_session_summary" ? "已有会话摘要" : buddyMessageSourceTitle(sourceRef.role),
    source_ref: sourceRef,
    metadata: {
      source_kind: sourceRef.source_kind,
      role: sourceRef.role,
      ordinal: sourceRef.ordinal,
    },
  }));
}

function buddyMessageSourceTitle(role: BuddyContextAssemblySourceRef["role"]) {
  if (role === "user") {
    return "用户消息";
  }
  if (role === "assistant") {
    return "伙伴消息";
  }
  return "会话摘要";
}

function estimateBuddyConversationHistorySourceChars(input: BuildBuddyChatGraphInput) {
  const summaryChars = (input.sessionSummary ?? "").trim().length;
  const messageChars = input.history
    .filter((message) => message.includeInContext !== false)
    .reduce((total, message) => total + message.content.trim().length, 0);
  return summaryChars + messageChars;
}

function estimateBuddyConversationHistoryOmittedCount(
  input: BuildBuddyChatGraphInput,
  sourceRefs: BuddyContextAssemblySourceRef[],
) {
  const selectedMessageCount = sourceRefs.filter((sourceRef) => sourceRef.source_kind === "buddy_message").length;
  const visibleMessageCount = input.history
    .filter((message) => message.includeInContext !== false)
    .filter((message) => message.content.trim().length > 0)
    .filter((message) => typeof message.id === "string" && message.id.trim().length > 0)
    .length;
  return Math.max(0, visibleMessageCount - selectedMessageCount);
}

function buildBuddyConversationHistoryRenderedPreview(input: BuildBuddyChatGraphInput) {
  const summary = (input.sessionSummary ?? "").trim();
  const history = formatBuddyHistory(input.history);
  if (!summary) {
    return history === "暂无历史对话。" ? "" : history;
  }
  return history === "暂无历史对话。" ? `已有会话摘要:\n${summary}` : `已有会话摘要:\n${summary}\n${history}`;
}

function stableHashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildBuddyMemoryReviewRuntimeSourceValues(
  input: BuildBuddyReviewGraphInput,
): BuddyRuntimeSourceValues<BuddyMemoryReviewInputSource> {
  return {
    source_run_id: input.mainRun.run_id,
  };
}

function applyBuddyRunTemplateBinding(
  graph: GraphPayload,
  binding: Pick<BuddyRunTemplateBinding, "input_bindings"> | Pick<BuddyMemoryReviewTemplateBinding, "input_bindings">,
  sourceValues: Record<string, unknown>,
) {
  for (const [nodeId, source] of Object.entries(binding.input_bindings ?? {})) {
    const node = graph.nodes[nodeId];
    if (!node || node.kind !== "input") {
      throw new Error(`Buddy binding references a missing input node: ${nodeId}`);
    }
    if (node.writes.length !== 1) {
      throw new Error(`Buddy binding input node must write exactly one state: ${nodeId}`);
    }
    const stateKey = node.writes[0].state;
    if (!graph.state_schema[stateKey]) {
      throw new Error(`Buddy binding input node writes a missing state: ${nodeId}`);
    }
    const value = sourceValues[source];
    node.config = {
      ...node.config,
      value: cloneJson(value),
    };
    graph.state_schema[stateKey] = {
      ...graph.state_schema[stateKey],
      value: cloneJson(value),
    };
  }
}

function setStateValueByName(graph: GraphPayload, stateName: string, value: unknown) {
  const stateKey = findStateKeyByName(graph, stateName);
  if (!stateKey) {
    return;
  }
  setStateValue(graph, stateKey, value);
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
  graph.metadata.capability_permission_policy = buildBuddyCapabilityPermissionPolicy(buddyMode);
}

function buildBuddyCapabilityPermissionPolicy(buddyMode: BuddyMode) {
  return {
    allowed_permission_tiers: ["none", "guarded", "external", "risky"],
    approval_required_permission_tiers: buddyMode === "ask_first" ? ["risky"] : [],
  };
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
  buddy_turn_intake: "understanding",
  understand_request: "understanding",
  need_clarification: "checkingClarification",
  ask_clarification: "askingClarification",
  needs_capability: "checkingCapabilityNeed",
  buddy_capability_loop: "selectingCapability",
  select_capability: "selectingCapability",
  should_call_capability_condition: "selectingCapability",
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
  buddy_public_response: "draftingReply",
  draft_public_response: "draftingReply",
  decide_autonomous_review: "reviewingMemory",
  prepare_session_recall_request: "reviewingMemory",
  recall_related_sessions: "reviewingMemory",
  extract_memory_candidates: "reviewingMemory",
  filter_memory_candidates: "reviewingMemory",
  merge_memory_document: "reviewingMemory",
  has_memory_updates: "reviewingMemory",
  write_memory_updates: "reviewingMemory",
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
            "public_response",
            "direct_reply",
            "denied_reply",
            "approval_prompt",
            "missing_action_proposal",
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
