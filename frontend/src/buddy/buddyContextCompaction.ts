import type { GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import { buildBuddyHomeContextValue } from "./buddyTemplateBindingModel.ts";

export const BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID = "buddy_context_compaction";

export type BuddyContextCompactionTrigger = "preflight" | "capability_result" | "overflow_recovery" | "background";

export type BuddyContextHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  includeInContext?: boolean;
};

export type BuddyContextBudgetReport = {
  version: number;
  trigger: BuddyContextCompactionTrigger;
  history_message_count: number;
  included_history_message_count: number;
  omitted_history_message_count: number;
  raw_history_chars: number;
  rendered_history_chars: number;
  user_message_chars: number;
  session_summary_chars: number;
  capability_result_chars: number;
  public_response_chars: number;
  provider_prompt_tokens: number | null;
  model_context_window_tokens: number | null;
  prompt_token_pressure: number | null;
  thresholds: {
    raw_history_chars: number;
    omitted_history_messages: number;
    prompt_token_pressure: number;
    capability_result_chars: number;
    public_response_chars: number;
  };
};

export type BuddyContextCompactionDecision = {
  shouldCompact: boolean;
  reason: "history_pressure" | "result_pressure" | "provider_usage_pressure" | "overflow_recovery" | "none";
};

export type BuildBuddyContextBudgetReportInput = {
  trigger: BuddyContextCompactionTrigger;
  history: BuddyContextHistoryMessage[];
  userMessage: string;
  sessionSummary: string;
  capabilityResult?: unknown;
  publicResponse?: string;
  sourceRun?: RunDetail | null;
  modelContextWindowTokens?: number | null;
};

export type BuildBuddyContextCompactionGraphInput = BuildBuddyContextBudgetReportInput & {
  sourceRunId?: string;
  currentSessionId: string;
  buddyModel?: unknown;
};

const DEFAULT_RECENT_HISTORY_MESSAGES = 12;
const DEFAULT_HISTORY_CONTEXT_CHARS = 4000;
const OMITTED_HISTORY_PREVIEW_COUNT = 5;
const OMITTED_HISTORY_PREVIEW_CHARS = 48;
const RAW_HISTORY_COMPACTION_THRESHOLD_CHARS = 9000;
const OMITTED_HISTORY_COMPACTION_THRESHOLD_MESSAGES = 8;
const PROMPT_TOKEN_PRESSURE_THRESHOLD = 0.62;
const CAPABILITY_RESULT_COMPACTION_THRESHOLD_CHARS = 6000;
const PUBLIC_RESPONSE_COMPACTION_THRESHOLD_CHARS = 7000;
const DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS = 100000;

export function formatBuddyHistoryWithSessionSummary(
  messages: BuddyContextHistoryMessage[],
  sessionSummary: string,
  maxMessages = DEFAULT_RECENT_HISTORY_MESSAGES,
  maxChars = DEFAULT_HISTORY_CONTEXT_CHARS,
): string {
  const renderedHistory = formatRecentBuddyHistory(messages, maxMessages, maxChars);
  const normalizedSummary = normalizeText(sessionSummary);
  if (!normalizedSummary || normalizedSummary === "当前对话尚未形成摘要。") {
    return renderedHistory;
  }
  return [
    "## 会话摘要",
    normalizedSummary,
    "",
    "## 最近原文",
    renderedHistory,
  ].join("\n");
}

export function buildBuddyContextBudgetReport(input: BuildBuddyContextBudgetReportInput): BuddyContextBudgetReport {
  const includedHistory = normalizeHistoryMessages(input.history);
  const renderedHistory = formatBuddyHistoryWithSessionSummary(input.history, input.sessionSummary);
  const rawHistoryChars = includedHistory.reduce((total, message) => total + formatBuddyHistoryLine(message).length + 1, 0);
  const providerPromptTokens = resolveProviderPromptTokens(input.sourceRun);
  const modelContextWindowTokens = normalizePositiveInteger(input.modelContextWindowTokens) ?? DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS;
  return {
    version: 1,
    trigger: input.trigger,
    history_message_count: input.history.length,
    included_history_message_count: includedHistory.length,
    omitted_history_message_count: Math.max(0, includedHistory.length - DEFAULT_RECENT_HISTORY_MESSAGES),
    raw_history_chars: rawHistoryChars,
    rendered_history_chars: renderedHistory.length,
    user_message_chars: normalizeText(input.userMessage).length,
    session_summary_chars: normalizeText(input.sessionSummary).length,
    capability_result_chars: countValueChars(input.capabilityResult),
    public_response_chars: normalizeText(input.publicResponse).length,
    provider_prompt_tokens: providerPromptTokens,
    model_context_window_tokens: modelContextWindowTokens,
    prompt_token_pressure: providerPromptTokens === null ? null : providerPromptTokens / modelContextWindowTokens,
    thresholds: {
      raw_history_chars: RAW_HISTORY_COMPACTION_THRESHOLD_CHARS,
      omitted_history_messages: OMITTED_HISTORY_COMPACTION_THRESHOLD_MESSAGES,
      prompt_token_pressure: PROMPT_TOKEN_PRESSURE_THRESHOLD,
      capability_result_chars: CAPABILITY_RESULT_COMPACTION_THRESHOLD_CHARS,
      public_response_chars: PUBLIC_RESPONSE_COMPACTION_THRESHOLD_CHARS,
    },
  };
}

export function shouldRunBuddyContextCompaction(report: BuddyContextBudgetReport): BuddyContextCompactionDecision {
  if (report.trigger === "overflow_recovery") {
    return { shouldCompact: true, reason: "overflow_recovery" };
  }
  if (
    report.raw_history_chars >= report.thresholds.raw_history_chars
    || report.omitted_history_message_count >= report.thresholds.omitted_history_messages
  ) {
    return { shouldCompact: true, reason: "history_pressure" };
  }
  if (
    report.capability_result_chars >= report.thresholds.capability_result_chars
    || report.public_response_chars >= report.thresholds.public_response_chars
  ) {
    return { shouldCompact: true, reason: "result_pressure" };
  }
  if (
    report.prompt_token_pressure !== null
    && report.prompt_token_pressure >= report.thresholds.prompt_token_pressure
  ) {
    return { shouldCompact: true, reason: "provider_usage_pressure" };
  }
  return { shouldCompact: false, reason: "none" };
}

export function buildBuddyContextCompactionGraph(
  template: TemplateRecord,
  input: BuildBuddyContextCompactionGraphInput,
): GraphPayload {
  if (template.template_id !== BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID) {
    throw new Error(`Expected ${BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID}, received ${template.template_id}.`);
  }
  const contextBudgetReport = buildBuddyContextBudgetReport(input);
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
      buddy_context_compaction_run: true,
      buddy_compaction_trigger: input.trigger,
      internal: true,
    },
  };
  applyBuddyModelOverride(graph, input.buddyModel);
  setInputValue(graph, "input_trigger", input.trigger);
  setInputValue(graph, "input_source_run_id", input.sourceRunId ?? input.sourceRun?.run_id ?? "");
  setInputValue(graph, "input_current_session_id", input.currentSessionId);
  setInputValue(graph, "input_user_message", input.userMessage);
  setInputValue(graph, "input_conversation_history", formatRawBuddyHistoryForCompaction(input.history));
  setInputValue(graph, "input_existing_session_summary", input.sessionSummary);
  setInputValue(graph, "input_buddy_context", buildBuddyHomeContextValue());
  setInputValue(graph, "input_context_budget_report", contextBudgetReport);
  setInputValue(graph, "input_capability_result", input.capabilityResult ?? {});
  setInputValue(graph, "input_public_response", input.publicResponse ?? "");
  return graph;
}

export function isContextOverflowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /context (length|window|overflow)|maximum context|too many tokens|request entity too large|http 413|status 413|413/i.test(message);
}

function formatRecentBuddyHistory(
  messages: BuddyContextHistoryMessage[],
  maxMessages: number,
  maxChars: number,
): string {
  const entries = normalizeHistoryMessages(messages);
  if (entries.length === 0) {
    return "暂无历史对话。";
  }
  const limitedEntries = entries.slice(-Math.max(1, maxMessages));
  const omittedEntries = entries.slice(0, entries.length - limitedEntries.length);
  const keptLines: string[] = [];
  const omittedByBudget: BuddyContextHistoryMessage[] = [];
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

export function formatRawBuddyHistoryForCompaction(messages: BuddyContextHistoryMessage[]): string {
  const entries = normalizeHistoryMessages(messages);
  if (entries.length === 0) {
    return "暂无历史对话。";
  }
  return entries.map(formatBuddyHistoryLine).join("\n");
}

function normalizeHistoryMessages(messages: BuddyContextHistoryMessage[]): BuddyContextHistoryMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: normalizeText(message.content),
      includeInContext: message.includeInContext,
    }))
    .filter((message) => message.includeInContext !== false)
    .filter((message) => message.content.length > 0);
}

function formatBuddyHistoryLine(message: Pick<BuddyContextHistoryMessage, "role" | "content">): string {
  return `${message.role === "user" ? "用户" : "伙伴"}: ${message.content}`;
}

function formatBuddyHistoryOmittedLines(messages: Array<Pick<BuddyContextHistoryMessage, "role" | "content">>): string[] {
  const previewMessages = messages.slice(-OMITTED_HISTORY_PREVIEW_COUNT);
  return [
    "省略的历史对话:",
    `omitted_count: ${messages.length}`,
    ...previewMessages.map((message) => `- ${formatBuddyHistoryLine({
      role: message.role,
      content: truncateText(message.content, OMITTED_HISTORY_PREVIEW_CHARS),
    })}`),
  ];
}

function setInputValue(graph: GraphPayload, nodeId: string, value: unknown) {
  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "input") {
    throw new Error(`Buddy context compaction template is missing input node: ${nodeId}`);
  }
  const inputNode = node as InputNode;
  inputNode.config.value = cloneJson(value);
  for (const binding of inputNode.writes) {
    const state = graph.state_schema[binding.state];
    if (state) {
      state.value = cloneJson(value);
    }
  }
}

function applyBuddyModelOverride(graph: GraphPayload, buddyModel: unknown) {
  const model = normalizeText(buddyModel);
  if (!model) {
    return;
  }
  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== "agent") {
      continue;
    }
    node.config.modelSource = "override";
    node.config.model = model;
  }
}

function resolveProviderPromptTokens(run: RunDetail | null | undefined): number | null {
  if (!run) {
    return null;
  }
  let maxPromptTokens: number | null = null;
  for (const execution of run.node_executions ?? []) {
    const runtimeConfig = execution.artifacts?.runtime_config;
    const usage = isRecord(runtimeConfig) ? runtimeConfig.provider_usage : null;
    const promptTokens = readPromptTokens(usage);
    if (promptTokens !== null) {
      maxPromptTokens = Math.max(maxPromptTokens ?? 0, promptTokens);
    }
  }
  return maxPromptTokens;
}

function readPromptTokens(usage: unknown): number | null {
  if (!isRecord(usage)) {
    return null;
  }
  for (const key of ["prompt_tokens", "input_tokens", "promptTokens", "inputTokens"]) {
    const value = normalizePositiveInteger(usage[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function countValueChars(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length;
  }
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return String(value).length;
  }
}

function normalizePositiveInteger(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }
  return Math.floor(numberValue);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 3) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
