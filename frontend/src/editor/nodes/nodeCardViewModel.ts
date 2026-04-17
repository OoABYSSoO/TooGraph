import type { GraphNode, StateDefinition } from "../../types/node-system.ts";

export type NodePortViewModel = {
  key: string;
  label: string;
  required?: boolean;
};

export type NodeBranchMappingViewModel = {
  branch: string;
  matchValues: string[];
};

export type NodeCardViewModel = {
  nodeId: string;
  kind: GraphNode["kind"];
  kindLabel: string;
  title: string;
  description: string;
  inputs: NodePortViewModel[];
  outputs: NodePortViewModel[];
  branches: NodePortViewModel[];
  body:
    | {
        kind: "input";
        valueText: string;
        primaryOutput: NodePortViewModel | null;
      }
    | {
        kind: "agent";
        taskInstruction: string;
        modelLabel: string;
        thinkingLabel: string;
        primaryInput: NodePortViewModel | null;
        primaryOutput: NodePortViewModel | null;
      }
    | {
        kind: "condition";
        ruleSummary: string;
        loopLimitLabel: string;
        branchMappings: NodeBranchMappingViewModel[];
      }
    | {
        kind: "output";
        previewTitle: string;
        displayModeLabel: string;
        connectedStateLabel: string | null;
        previewText: string;
        persistEnabled: boolean;
      };
};

export function buildNodeCardViewModel(
  nodeId: string,
  node: GraphNode,
  stateSchema: Record<string, StateDefinition>,
): NodeCardViewModel {
  const inputs = node.reads.map((binding) => ({
    key: binding.state,
    label: getStateLabel(binding.state, stateSchema),
    required: binding.required,
  }));

  const outputs =
    node.kind === "condition"
      ? []
      : node.writes.map((binding) => ({
          key: binding.state,
          label: getStateLabel(binding.state, stateSchema),
        }));

  const branches =
    node.kind === "condition"
      ? node.config.branches.map((branch) => ({
          key: branch,
          label: branch,
        }))
      : [];

  return {
    nodeId,
    kind: node.kind,
    kindLabel: node.kind.toUpperCase(),
    title: node.name,
    description: node.description?.trim() || "No description yet.",
    inputs,
    outputs,
    branches,
    body: buildBody(node, stateSchema, inputs, outputs),
  };
}

function buildBody(
  node: GraphNode,
  stateSchema: Record<string, StateDefinition>,
  inputs: NodePortViewModel[],
  outputs: NodePortViewModel[],
): NodeCardViewModel["body"] {
  if (node.kind === "input") {
    return {
      kind: "input",
      valueText: stringifyValue(node.config.value),
      primaryOutput: outputs[0] ?? null,
    };
  }

  if (node.kind === "agent") {
    return {
      kind: "agent",
      taskInstruction: node.config.taskInstruction?.trim() || "No task instruction yet.",
      modelLabel: resolveAgentModelLabel(node),
      thinkingLabel: resolveThinkingLabel(node),
      primaryInput: inputs[0] ?? null,
      primaryOutput: outputs[0] ?? null,
    };
  }

  if (node.kind === "condition") {
    return {
      kind: "condition",
      ruleSummary: formatConditionRule(node.config.rule, stateSchema),
      loopLimitLabel: node.config.loopLimit === -1 ? "Loop · Unlimited" : `Loop · ${node.config.loopLimit}`,
      branchMappings: mapConditionBranchMappings(node),
    };
  }

  const connectedState = inputs[0]?.key ?? null;
  return {
    kind: "output",
    previewTitle: "Preview",
    displayModeLabel: node.config.displayMode.toUpperCase(),
    connectedStateLabel: connectedState ? getStateLabel(connectedState, stateSchema) : null,
    previewText: connectedState ? stringifyValue(stateSchema[connectedState]?.value ?? "") : "Connect a state to preview output.",
    persistEnabled: node.config.persistEnabled,
  };
}

function getStateLabel(stateKey: string, stateSchema: Record<string, StateDefinition>) {
  return stateSchema[stateKey]?.name?.trim() || stateKey;
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function resolveAgentModelLabel(node: Extract<GraphNode, { kind: "agent" }>) {
  if (node.config.model?.trim()) {
    return node.config.model.trim();
  }
  if (node.config.modelSource === "override") {
    return "Override model";
  }
  return "Global model";
}

function resolveThinkingLabel(node: Extract<GraphNode, { kind: "agent" }>) {
  return node.config.thinkingMode === "on" ? "thinking on" : "thinking off";
}

function formatConditionRule(
  rule: Extract<GraphNode, { kind: "condition" }>["config"]["rule"],
  stateSchema: Record<string, StateDefinition>,
) {
  const sourceLabel = getStateLabel(rule.source, stateSchema);
  if (rule.operator === "exists") {
    return `${sourceLabel} exists`;
  }
  const valueLabel = rule.value === null ? "null" : String(rule.value);
  return `${sourceLabel} ${rule.operator} ${valueLabel}`;
}

function mapConditionBranchMappings(node: Extract<GraphNode, { kind: "condition" }>): NodeBranchMappingViewModel[] {
  return node.config.branches.map((branch) => ({
    branch,
    matchValues: Object.entries(node.config.branchMapping)
      .filter(([, mappedBranch]) => mappedBranch === branch)
      .map(([value]) => value),
  }));
}
