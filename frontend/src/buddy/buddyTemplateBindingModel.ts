import type { GraphNode, InputNode, TemplateRecord } from "../types/node-system.ts";
import type {
  BuddyRunInputSource,
  BuddyRunTemplateBinding,
  BuddyRunTemplateBindingValidation,
} from "../types/buddy.ts";

export const DEFAULT_BUDDY_RUN_TEMPLATE_ID = "buddy_autonomous_loop";

export type BuddyRunInputSourceOption = {
  value: BuddyRunInputSource | "";
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

export type BuddyRunInputNodeOption = {
  value: string;
  label: string;
  disabled: boolean;
  disabledReason: string;
};

export const BUDDY_RUN_INPUT_SOURCE_OPTIONS: BuddyRunInputSourceOption[] = [
  { value: "", labelKey: "buddyPage.binding.sources.none" },
  { value: "current_message", labelKey: "buddyPage.binding.sources.currentMessage" },
  { value: "conversation_history", labelKey: "buddyPage.binding.sources.conversationHistory" },
  { value: "page_context", labelKey: "buddyPage.binding.sources.pageContext" },
  { value: "buddy_home_context", labelKey: "buddyPage.binding.sources.buddyHomeContext" },
];

export function buildDefaultBuddyRunTemplateBinding(): BuddyRunTemplateBinding {
  return {
    version: 1,
    template_id: DEFAULT_BUDDY_RUN_TEMPLATE_ID,
    input_bindings: {
      input_user_message: "current_message",
      input_conversation_history: "conversation_history",
      input_page_context: "page_context",
      input_buddy_context: "buddy_home_context",
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

export function buildBuddyRunTemplateInputRows(template: TemplateRecord | null | undefined): BuddyRunTemplateInputRow[] {
  if (!template) {
    return [];
  }
  return Object.entries(template.nodes)
    .filter((entry): entry is [string, InputNode] => entry[1].kind === "input")
    .map(([nodeId, node]) => buildInputRow(template, nodeId, node));
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
    || value === "page_context"
    || value === "buddy_home_context";
}

function findBoundInputNodeIdForSource(binding: Pick<BuddyRunTemplateBinding, "input_bindings">, source: BuddyRunInputSource) {
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
