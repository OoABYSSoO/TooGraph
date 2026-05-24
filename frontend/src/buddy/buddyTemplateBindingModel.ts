import type { GraphNode, InputNode, TemplateRecord } from "../types/node-system.ts";
import type {
  BuddyMemoryReviewInputSource,
  BuddyMemoryReviewTemplateBinding,
  BuddyRunInputSource,
  BuddyRunTemplateBinding,
  BuddyRunTemplateBindingValidation,
} from "../types/buddy.ts";

export const DEFAULT_BUDDY_RUN_TEMPLATE_ID = "buddy_autonomous_loop";
export const DEFAULT_BUDDY_MEMORY_REVIEW_TEMPLATE_ID = "buddy_autonomous_review";

const BUDDY_MEMORY_REVIEW_REQUIRED_INPUT_SOURCES = new Set<BuddyMemoryReviewInputSource>([
  "source_run_id",
  "current_session_id",
  "user_message",
  "public_response",
  "buddy_home_context",
]);

const BUDDY_MEMORY_REVIEW_INTERNAL_STATES = new Set([
  "recall_request",
  "session_recall_context",
  "recalled_sessions",
  "memory_candidates",
  "memory_filter_report",
  "memory_update_plan",
  "memory_review_result",
  "memory_write_success",
  "applied_memory_commands",
  "skipped_memory_commands",
  "memory_write_result",
]);

export type BuddyRunInputSourceOption = {
  value: BuddyRunInputSource | "";
  labelKey: string;
};

export type BuddyMemoryReviewInputSourceOption = {
  value: BuddyMemoryReviewInputSource | "";
  labelKey: string;
};

export type BuddyRunTemplateInputRow = {
  nodeId: string;
  nodeName: string;
  nodeDescription: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  stateDescription: string;
  disabledReason: string;
};

export type BuddyRunTemplateSourceRow = {
  source: BuddyRunInputSource;
  labelKey: string;
  required: boolean;
  selectedNodeId: string;
};

export type BuddyMemoryReviewTemplateSourceRow = {
  source: BuddyMemoryReviewInputSource;
  labelKey: string;
  required: boolean;
  selectedNodeId: string;
};

export type BuddyRunInputNodeOption = {
  value: string;
  label: string;
  nodeName: string;
  stateName: string;
  stateKey: string;
  stateType: string;
  disabledSource?: BuddyRunInputSource | BuddyMemoryReviewInputSource;
  disabled: boolean;
  disabledReason: string;
};

export const BUDDY_RUN_INPUT_SOURCE_OPTIONS: BuddyRunInputSourceOption[] = [
  { value: "", labelKey: "buddyPage.binding.sources.none" },
  { value: "current_message", labelKey: "buddyPage.binding.sources.currentMessage" },
  { value: "conversation_history", labelKey: "buddyPage.binding.sources.conversationHistory" },
  { value: "session_summary", labelKey: "buddyPage.binding.sources.sessionSummary" },
  { value: "buddy_home_context", labelKey: "buddyPage.binding.sources.buddyHomeContext" },
  { value: "current_session_id", labelKey: "buddyPage.binding.memoryReviewSources.currentSessionId" },
];

export const BUDDY_MEMORY_REVIEW_INPUT_SOURCE_OPTIONS: BuddyMemoryReviewInputSourceOption[] = [
  { value: "", labelKey: "buddyPage.binding.sources.none" },
  { value: "source_run_id", labelKey: "buddyPage.binding.memoryReviewSources.sourceRunId" },
  { value: "current_session_id", labelKey: "buddyPage.binding.memoryReviewSources.currentSessionId" },
  { value: "user_message", labelKey: "buddyPage.binding.memoryReviewSources.userMessage" },
  { value: "public_response", labelKey: "buddyPage.binding.memoryReviewSources.publicResponse" },
  { value: "buddy_home_context", labelKey: "buddyPage.binding.memoryReviewSources.buddyHomeContext" },
  { value: "conversation_history", labelKey: "buddyPage.binding.sources.conversationHistory" },
  { value: "request_understanding", labelKey: "buddyPage.binding.memoryReviewSources.requestUnderstanding" },
  { value: "capability_result", labelKey: "buddyPage.binding.memoryReviewSources.capabilityResult" },
  { value: "capability_review", labelKey: "buddyPage.binding.memoryReviewSources.capabilityReview" },
];

export function buildDefaultBuddyRunTemplateBinding(): BuddyRunTemplateBinding {
  return {
    version: 1,
    template_id: DEFAULT_BUDDY_RUN_TEMPLATE_ID,
    input_bindings: {
      input_user_message: "current_message",
      input_conversation_history: "conversation_history",
      input_existing_session_summary: "session_summary",
      input_buddy_context: "buddy_home_context",
      input_current_session_id: "current_session_id",
    },
  };
}

export function buildDefaultBuddyMemoryReviewTemplateBinding(): BuddyMemoryReviewTemplateBinding {
  return {
    version: 1,
    template_id: DEFAULT_BUDDY_MEMORY_REVIEW_TEMPLATE_ID,
    input_bindings: {
      input_source_run_id: "source_run_id",
      input_current_session_id: "current_session_id",
      input_user_message: "user_message",
      input_conversation_history: "conversation_history",
      input_buddy_context: "buddy_home_context",
      input_request_understanding: "request_understanding",
      input_capability_result: "capability_result",
      input_capability_review: "capability_review",
      input_public_response: "public_response",
    },
  };
}

export function buildBuddyRunTemplateSourceRows(binding: Pick<BuddyRunTemplateBinding, "input_bindings">): BuddyRunTemplateSourceRow[] {
  return BUDDY_RUN_INPUT_SOURCE_OPTIONS
    .filter((option): option is { value: BuddyRunInputSource; labelKey: string } => isBuddyRunInputSource(option.value))
    .map((option) => ({
      source: option.value,
      labelKey: option.labelKey,
      required: option.value === "current_message",
      selectedNodeId: findBoundInputNodeIdForSource(binding, option.value),
    }));
}

export function buildBuddyMemoryReviewTemplateSourceRows(
  binding: Pick<BuddyMemoryReviewTemplateBinding, "input_bindings">,
): BuddyMemoryReviewTemplateSourceRow[] {
  return BUDDY_MEMORY_REVIEW_INPUT_SOURCE_OPTIONS
    .filter((option): option is { value: BuddyMemoryReviewInputSource; labelKey: string } => isBuddyMemoryReviewInputSource(option.value))
    .map((option) => ({
      source: option.value,
      labelKey: option.labelKey,
      required: BUDDY_MEMORY_REVIEW_REQUIRED_INPUT_SOURCES.has(option.value),
      selectedNodeId: findBoundInputNodeIdForSource(binding, option.value),
    }));
}

export function buildBuddyRunInputNodeOptions(
  template: TemplateRecord | null | undefined,
  binding: Pick<BuddyRunTemplateBinding, "input_bindings">,
  source: BuddyRunInputSource,
): BuddyRunInputNodeOption[] {
  const selectedByOtherSources = new Map(
    Object.entries(binding.input_bindings ?? {})
      .filter((entry): entry is [string, BuddyRunInputSource] => isBuddyRunInputSource(entry[1]) && entry[1] !== source)
      .map(([nodeId, selectedSource]) => [nodeId, selectedSource]),
  );

  return buildBuddyRunTemplateInputRows(template).map((row) => {
    const selectedSource = selectedByOtherSources.get(row.nodeId);
    const disabledReason = row.disabledReason || (selectedSource ? `Already bound to ${selectedSource}.` : "");
    return {
      value: row.nodeId,
      label: formatInputNodeOptionLabel(row),
      nodeName: row.nodeName,
      stateName: row.stateName,
      stateKey: row.stateKey,
      stateType: row.stateType,
      disabledSource: selectedSource,
      disabled: Boolean(disabledReason),
      disabledReason,
    };
  });
}

export function buildBuddyMemoryReviewInputNodeOptions(
  template: TemplateRecord | null | undefined,
  binding: Pick<BuddyMemoryReviewTemplateBinding, "input_bindings">,
  source: BuddyMemoryReviewInputSource,
): BuddyRunInputNodeOption[] {
  const selectedByOtherSources = new Map(
    Object.entries(binding.input_bindings ?? {})
      .filter((entry): entry is [string, BuddyMemoryReviewInputSource] => isBuddyMemoryReviewInputSource(entry[1]) && entry[1] !== source)
      .map(([nodeId, selectedSource]) => [nodeId, selectedSource]),
  );

  return buildBuddyMemoryReviewTemplateInputRows(template).map((row) => {
    const selectedSource = selectedByOtherSources.get(row.nodeId);
    const disabledReason = row.disabledReason || (selectedSource ? `Already bound to ${selectedSource}.` : "");
    return {
      value: row.nodeId,
      label: formatInputNodeOptionLabel(row),
      nodeName: row.nodeName,
      stateName: row.stateName,
      stateKey: row.stateKey,
      stateType: row.stateType,
      disabledSource: selectedSource,
      disabled: Boolean(disabledReason),
      disabledReason,
    };
  });
}

export function setBuddyRunTemplateSourceBinding(
  binding: BuddyRunTemplateBinding | Omit<BuddyRunTemplateBinding, "version">,
  source: BuddyRunInputSource,
  nodeId: string,
): BuddyRunTemplateBinding {
  const normalizedNodeId = String(nodeId || "").trim();
  const nextBindings = Object.fromEntries(
    Object.entries(binding.input_bindings ?? {}).filter(([boundNodeId, boundSource]) => {
      if (boundSource === source) {
        return false;
      }
      return normalizedNodeId ? boundNodeId !== normalizedNodeId : true;
    }),
  ) as Record<string, BuddyRunInputSource>;

  if (normalizedNodeId) {
    nextBindings[normalizedNodeId] = source;
  }

  return {
    ...binding,
    version: "version" in binding ? binding.version : 1,
    input_bindings: nextBindings,
  };
}

export function setBuddyMemoryReviewTemplateSourceBinding(
  binding: BuddyMemoryReviewTemplateBinding | Omit<BuddyMemoryReviewTemplateBinding, "version">,
  source: BuddyMemoryReviewInputSource,
  nodeId: string,
): BuddyMemoryReviewTemplateBinding {
  return setTemplateSourceBinding(binding, source, nodeId);
}

function setTemplateSourceBinding<
  TSource extends string,
  TBinding extends { template_id: string; input_bindings: Record<string, TSource>; version?: number; updated_at?: string },
>(
  binding: TBinding,
  source: TSource,
  nodeId: string,
): TBinding & { version: number } {
  const normalizedNodeId = String(nodeId || "").trim();
  const nextBindings = Object.fromEntries(
    Object.entries(binding.input_bindings ?? {}).filter(([boundNodeId, boundSource]) => {
      if (boundSource === source) {
        return false;
      }
      return normalizedNodeId ? boundNodeId !== normalizedNodeId : true;
    }),
  ) as Record<string, TSource>;

  if (normalizedNodeId) {
    nextBindings[normalizedNodeId] = source;
  }

  return {
    ...binding,
    version: "version" in binding ? binding.version ?? 1 : 1,
    input_bindings: nextBindings,
  };
}

export function buildBuddyRunTemplateInputRows(template: TemplateRecord | null | undefined): BuddyRunTemplateInputRow[] {
  if (!template) {
    return [];
  }
  return Object.entries(template.nodes)
    .filter((entry): entry is [string, InputNode] => entry[1].kind === "input")
    .map(([nodeId, node]) => buildInputRow(template, nodeId, node));
}

export function buildBuddyMemoryReviewTemplateInputRows(template: TemplateRecord | null | undefined): BuddyRunTemplateInputRow[] {
  return buildBuddyRunTemplateInputRows(template).map((row) => ({
    ...row,
    disabledReason: row.disabledReason || (BUDDY_MEMORY_REVIEW_INTERNAL_STATES.has(row.stateKey) ? "State is produced inside the memory review graph." : ""),
  }));
}

export function validateBuddyRunTemplateBinding(
  template: TemplateRecord | null | undefined,
  binding: BuddyRunTemplateBinding,
): BuddyRunTemplateBindingValidation {
  const issues: string[] = [];
  if (!template) {
    issues.push("Selected template is not loaded.");
    return { valid: false, issues };
  }
  if (template.status === "disabled") {
    issues.push("Selected template is disabled.");
  }
  if (template.hasBreakpointMetadata || template.capabilityDiscoverableBlockedReason === "breakpoint_metadata") {
    issues.push("Selected template contains breakpoint metadata and cannot be used as the Buddy main loop.");
  }
  if (binding.template_id !== template.template_id) {
    issues.push("Binding template_id does not match the selected template.");
  }
  const rows = buildBuddyRunTemplateInputRows(template);
  if (!rows.some((row) => !row.disabledReason)) {
    issues.push("Selected template has no bindable input nodes.");
  }
  const seenSources = new Map<BuddyRunInputSource, string>();
  let currentMessageCount = 0;
  for (const [nodeId, source] of Object.entries(binding.input_bindings ?? {})) {
    const row = rows.find((candidate) => candidate.nodeId === nodeId);
    if (!row) {
      issues.push(`Input node does not exist: ${nodeId}`);
      continue;
    }
    if (row.disabledReason) {
      issues.push(`${nodeId}: ${row.disabledReason}`);
      continue;
    }
    if (!isBuddyRunInputSource(source)) {
      issues.push(`Unsupported Buddy input source for ${nodeId}: ${String(source)}`);
      continue;
    }
    if (source === "current_message") {
      currentMessageCount += 1;
    }
    const previousNodeId = seenSources.get(source);
    if (previousNodeId) {
      issues.push(`${source} is already bound to ${previousNodeId}.`);
    } else {
      seenSources.set(source, nodeId);
    }
  }
  if (currentMessageCount !== 1) {
    issues.push("current_message must be bound exactly once.");
  }
  return { valid: issues.length === 0, issues };
}

export function validateBuddyMemoryReviewTemplateBinding(
  template: TemplateRecord | null | undefined,
  binding: BuddyMemoryReviewTemplateBinding,
): BuddyRunTemplateBindingValidation {
  const issues: string[] = [];
  if (!template) {
    issues.push("Selected memory review template is not loaded.");
    return { valid: false, issues };
  }
  if (template.status === "disabled") {
    issues.push("Selected memory review template is disabled.");
  }
  if (template.hasBreakpointMetadata || template.capabilityDiscoverableBlockedReason === "breakpoint_metadata") {
    issues.push("Selected memory review template contains breakpoint metadata.");
  }
  if (!isBuddyMemoryReviewTemplateRecord(template)) {
    issues.push("Selected template is not marked as a Buddy memory review template.");
  }
  if (binding.template_id !== template.template_id) {
    issues.push("Binding template_id does not match the selected memory review template.");
  }
  const rows = buildBuddyMemoryReviewTemplateInputRows(template);
  const seenSources = new Map<BuddyMemoryReviewInputSource, string>();
  for (const [nodeId, source] of Object.entries(binding.input_bindings ?? {})) {
    const row = rows.find((candidate) => candidate.nodeId === nodeId);
    if (!isBuddyMemoryReviewInputSource(source)) {
      issues.push(`Unsupported Buddy memory review input source for ${nodeId}: ${String(source)}`);
      continue;
    }
    if (!row) {
      issues.push(`Input node does not exist: ${nodeId}`);
      continue;
    }
    if (row.disabledReason) {
      issues.push(`${nodeId}: ${row.disabledReason}`);
      continue;
    }
    const previousNodeId = seenSources.get(source);
    if (previousNodeId) {
      issues.push(`${source} is already bound to ${previousNodeId}.`);
    } else {
      seenSources.set(source, nodeId);
    }
  }
  const boundSources = new Set(Object.values(binding.input_bindings ?? {}).filter(isBuddyMemoryReviewInputSource));
  for (const source of BUDDY_MEMORY_REVIEW_REQUIRED_INPUT_SOURCES) {
    if (!boundSources.has(source)) {
      issues.push(`${source} must be bound exactly once.`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function buildBuddyHomeContextValue() {
  return {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "policy.json"],
  };
}

export function isBuddyRunInputSource(value: unknown): value is BuddyRunInputSource {
  return value === "current_message"
    || value === "conversation_history"
    || value === "session_summary"
    || value === "buddy_home_context"
    || value === "current_session_id";
}

export function isBuddyMemoryReviewInputSource(value: unknown): value is BuddyMemoryReviewInputSource {
  return value === "source_run_id"
    || value === "current_session_id"
    || value === "user_message"
    || value === "conversation_history"
    || value === "buddy_home_context"
    || value === "request_understanding"
    || value === "capability_result"
    || value === "capability_review"
    || value === "public_response";
}

export function isBuddyMemoryReviewTemplateRecord(template: TemplateRecord | null | undefined): boolean {
  const metadata = template?.metadata ?? {};
  return metadata.role === "buddy_autonomous_review"
    || metadata.buddy_memory_review === true
    || metadata.buddyMemoryReview === true;
}

function findBoundInputNodeIdForSource<TSource extends string>(
  binding: Pick<{ input_bindings: Record<string, TSource> }, "input_bindings">,
  source: TSource,
) {
  return Object.entries(binding.input_bindings ?? {}).find(([, boundSource]) => boundSource === source)?.[0] ?? "";
}

function formatInputNodeOptionLabel(row: BuddyRunTemplateInputRow) {
  return `${row.nodeName} / ${row.stateName} (${row.stateKey || row.nodeId})`;
}

function buildInputRow(template: TemplateRecord, nodeId: string, node: InputNode): BuddyRunTemplateInputRow {
  const write = node.writes.length === 1 ? node.writes[0] : null;
  const state = write ? template.state_schema[write.state] : null;
  return {
    nodeId,
    nodeName: node.name || nodeId,
    nodeDescription: node.description || "",
    stateKey: write && state ? write.state : "",
    stateName: state?.name ?? "",
    stateType: state?.type ?? "",
    stateDescription: state?.description ?? "",
    disabledReason: resolveInputRowDisabledReason(node, state, write?.state),
  };
}

function resolveInputRowDisabledReason(node: GraphNode, state: unknown, stateKey: string | undefined) {
  if (node.kind !== "input") {
    return "Node is not an input node.";
  }
  if (node.writes.length !== 1) {
    return "Input node must write exactly one state.";
  }
  if (!stateKey || !state) {
    return "Input node writes a missing state.";
  }
  return "";
}
