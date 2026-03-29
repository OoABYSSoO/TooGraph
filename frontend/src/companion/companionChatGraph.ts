import type { AgentNode, GraphPayload, InputNode, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type { SkillDefinition } from "../types/skills.ts";
import { GLOBAL_RUNTIME_MODEL_OPTION_VALUE } from "../lib/runtimeModelCatalog.ts";

export const COMPANION_TEMPLATE_ID = "companion_autonomous_loop";
export const COMPANION_USER_MESSAGE_STATE_KEY = "state_1";
export const COMPANION_HISTORY_STATE_KEY = "state_2";
export const COMPANION_PAGE_CONTEXT_STATE_KEY = "state_3";
export const COMPANION_REPLY_STATE_KEY = "state_4";
export const COMPANION_MODE_STATE_KEY = "state_5";
export const COMPANION_PROFILE_STATE_KEY = "state_6";
export const COMPANION_POLICY_STATE_KEY = "state_7";
export const COMPANION_MEMORY_CONTEXT_STATE_KEY = "state_8";
export const COMPANION_SESSION_SUMMARY_STATE_KEY = "state_9";
export const COMPANION_AGENTIC_REPLY_STATE_KEYS = ["state_27", "state_25", "state_26", "state_16", "state_18"];
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
  skillCatalog?: SkillDefinition[];
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

  const historyValue = formatCompanionHistory(input.history);
  const pageContextValue = input.pageContext.trim() || "当前页面上下文不可用。";
  const skillCatalogSnapshot = buildCompanionSkillCatalogSnapshot(input.skillCatalog ?? [], companionMode);

  setStateValueByNameOrKey(graph, "user_message", COMPANION_USER_MESSAGE_STATE_KEY, input.userMessage);
  setStateValueByNameOrKey(graph, "conversation_history", COMPANION_HISTORY_STATE_KEY, historyValue);
  setStateValueByNameOrKey(graph, "page_context", COMPANION_PAGE_CONTEXT_STATE_KEY, pageContextValue);
  setStateValueByNameOrKey(graph, "companion_mode", COMPANION_MODE_STATE_KEY, companionMode);
  setStateValueByName(graph, "skill_catalog_snapshot", skillCatalogSnapshot);
  for (const stateName of ["companion_reply", "final_reply", "direct_reply", "denied_reply", "approval_prompt"]) {
    setStateValueByName(graph, stateName, "");
  }

  syncInputNodeValueByNameOrKey(graph, "user_message", COMPANION_USER_MESSAGE_STATE_KEY, input.userMessage);
  syncInputNodeValueByNameOrKey(graph, "conversation_history", COMPANION_HISTORY_STATE_KEY, historyValue);
  syncInputNodeValueByNameOrKey(graph, "page_context", COMPANION_PAGE_CONTEXT_STATE_KEY, pageContextValue);
  syncInputNodeValueByNameOrKey(graph, "companion_mode", COMPANION_MODE_STATE_KEY, companionMode);
  syncInputNodeValueByName(graph, "skill_catalog_snapshot", skillCatalogSnapshot);
  if (companionMode !== "unrestricted") {
    enforceAdvisoryCompanionGraph(graph);
  }

  return graph;
}

export function resolveCompanionMode(value: unknown): CompanionMode {
  return value === "approval" || value === DEFAULT_COMPANION_MODE ? value : DEFAULT_COMPANION_MODE;
}

export function buildCompanionSkillCatalogSnapshot(skills: SkillDefinition[], companionMode: CompanionMode) {
  return skills.map((skill) => {
    const snapshot = cloneJson(skill);
    const configuredDefaultPolicy = snapshot.runPolicies?.default ?? {};
    const defaultPolicy = {
      ...configuredDefaultPolicy,
      discoverable: configuredDefaultPolicy.discoverable ?? true,
      autoSelectable: configuredDefaultPolicy.autoSelectable ?? false,
      requiresApproval: configuredDefaultPolicy.requiresApproval ?? false,
    };
    const companionPolicy = {
      ...defaultPolicy,
      ...(snapshot.runPolicies?.origins?.companion ?? {}),
    };
    const companionOriginPolicy =
      companionMode === "approval" || !companionPolicy.requiresApproval
        ? companionPolicy
        : {
            ...companionPolicy,
            autoSelectable: false,
          };
    snapshot.runPolicies = {
      default: defaultPolicy,
      origins: {
        ...(snapshot.runPolicies?.origins ?? {}),
        companion: companionOriginPolicy,
      },
    };
    return snapshot;
  });
}

export function resolveCompanionReplyText(run: RunDetail): string {
  const replyStateKeys = resolveCompanionReplyStateKeys(run.graph_snapshot);
  const candidates = [
    ...replyStateKeys.map((stateKey) => run.state_snapshot?.values?.[stateKey]),
    ...replyStateKeys.map((stateKey) => run.artifacts?.state_values?.[stateKey]),
    resolveOutputPreviewValue(run.output_previews, replyStateKeys),
    resolveOutputPreviewValue(run.artifacts?.output_previews, replyStateKeys),
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
  if (isCompanionReplyStateKey(stateKey)) {
    return stringifyCompanionReplyCandidate(payload.value ?? payload.text);
  }

  const outputKeys = Array.isArray(payload.output_keys)
    ? payload.output_keys.map((key) => String(key)).filter(Boolean)
    : [];
  if (outputKeys.some(isCompanionReplyStateKey)) {
    return stringifyCompanionReplyCandidate(payload.text ?? payload.value);
  }

  return "";
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

function enforceAdvisoryCompanionGraph(graph: GraphPayload) {
  const agentNode = graph.nodes.companion_reply_agent;
  if (!agentNode || agentNode.kind !== "agent") {
    return;
  }
  const companionAgent = agentNode as AgentNode;
  companionAgent.config = {
    ...companionAgent.config,
    skillKey: "",
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
  const approvalNodeId = graph.nodes.request_approval_agent ? "request_approval_agent" : "companion_reply_agent";
  graph.metadata.interrupt_after = addUniqueMetadataNodeId(graph.metadata.interrupt_after, approvalNodeId);
  graph.metadata.agent_breakpoint_timing = {
    ...(isRecord(graph.metadata.agent_breakpoint_timing) ? graph.metadata.agent_breakpoint_timing : {}),
    [approvalNodeId]: "after",
  };
}

function applyCompanionModelOverride(graph: GraphPayload, value: unknown) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model || model === GLOBAL_RUNTIME_MODEL_OPTION_VALUE) {
    delete graph.metadata.companion_model_ref;
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

function findStateKeyByName(graph: GraphPayload, stateName: string) {
  return Object.entries(graph.state_schema).find(([, definition]) => definition.name === stateName)?.[0] ?? null;
}

function resolveCompanionReplyStateKeys(graphSnapshot: Record<string, unknown> | null | undefined) {
  const stateSchema = isRecord(graphSnapshot?.state_schema) ? graphSnapshot.state_schema : null;
  const keysFromNames = stateSchema
    ? Object.entries(stateSchema)
        .filter(([, definition]) => isRecord(definition) && typeof definition.name === "string")
        .filter(([, definition]) =>
          [
            "companion_reply",
            "final_reply",
            "direct_reply",
            "denied_reply",
            "approval_prompt",
            "missing_skill_proposal",
          ].includes(String((definition as { name: string }).name)),
        )
        .map(([stateKey]) => stateKey)
    : [];
  return uniqueStrings([...keysFromNames, ...COMPANION_AGENTIC_REPLY_STATE_KEYS, COMPANION_REPLY_STATE_KEY]);
}

function isCompanionReplyStateKey(stateKey: string) {
  return stateKey === COMPANION_REPLY_STATE_KEY || COMPANION_AGENTIC_REPLY_STATE_KEYS.includes(stateKey);
}

function resolveOutputPreviewValue(previews: RunDetail["output_previews"] | undefined, stateKeys: string[]) {
  return previews?.find((preview) => stateKeys.includes(preview.source_key))?.value;
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

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
