import type { UploadedAssetType } from "./uploadedAssetModel.ts";
import { isUploadedAssetStateType } from "./uploadedAssetModel.ts";
import { normalizeConditionLoopLimit } from "./conditionLoopLimit.ts";
import type { GraphNode, StateDefinition } from "../../types/node-system.ts";

export type NodePortViewModel = {
  key: string;
  label: string;
  required?: boolean;
  typeLabel: string;
  stateColor: string;
};

export type NodeConditionRouteOutputViewModel = {
  branch: string;
  routeTargetLabel: string | null;
  tone: "success" | "danger" | "warning" | "neutral";
};

export type BuildNodeCardViewModelOptions = {
  conditionRouteTargets?: Record<string, string | null>;
  runtime?: {
    latestRunStatus?: string | null;
    outputPreviewText?: string | null;
    outputDisplayMode?: string | null;
    failedMessage?: string | null;
  };
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
  stateSummary: {
    reads: string[];
    writes: string[];
  } | null;
  runtimeNote:
    | {
        tone: "danger";
        label: string;
        text: string;
      }
    | null;
  body:
    | {
        kind: "input";
        valueText: string;
        editorMode: "text" | "knowledge_base" | "asset" | "readonly";
        assetType: UploadedAssetType | null;
        primaryOutput: NodePortViewModel | null;
      }
    | {
        kind: "agent";
        taskInstruction: string;
        modelLabel: string;
        thinkingLabel: string;
        skillLabel: string;
        primaryInput: NodePortViewModel | null;
        primaryOutput: NodePortViewModel | null;
      }
    | {
        kind: "condition";
        sourceLabel: string;
        operatorLabel: string;
        valueLabel: string;
        maxLoopsLabel: string;
        primaryInput: NodePortViewModel | null;
        routeOutputs: NodeConditionRouteOutputViewModel[];
      }
    | {
        kind: "output";
        previewTitle: string;
        displayModeLabel: string;
        persistFormatLabel: string;
        connectedStateKey: string | null;
        connectedStateLabel: string | null;
        previewText: string;
        persistEnabled: boolean;
        persistLabel: string;
        fileNameTemplate: string;
      };
};

export function buildNodeCardViewModel(
  nodeId: string,
  node: GraphNode,
  stateSchema: Record<string, StateDefinition>,
  options: BuildNodeCardViewModelOptions = {},
): NodeCardViewModel {
  const inputs = node.reads.map((binding) => ({
    key: binding.state,
    label: getStateLabel(binding.state, stateSchema),
    required: binding.required,
    typeLabel: getStateTypeLabel(binding.state, stateSchema),
    stateColor: stateSchema[binding.state]?.color ?? "#d97706",
  }));

  const outputs =
    node.kind === "condition"
      ? []
      : node.writes.map((binding) => ({
          key: binding.state,
          label: getStateLabel(binding.state, stateSchema),
          typeLabel: getStateTypeLabel(binding.state, stateSchema),
          stateColor: stateSchema[binding.state]?.color ?? "#d97706",
        }));

  const branches =
    node.kind === "condition"
      ? node.config.branches.map((branch) => ({
          key: branch,
          label: branch,
          typeLabel: "branch",
          stateColor: "#9a3412",
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
    stateSummary: {
      reads: inputs.map((port) => port.label),
      writes: outputs.map((port) => port.label),
    },
    runtimeNote: buildRuntimeNote(node, options),
    body: buildBody(node, stateSchema, inputs, outputs, options),
  };
}

function buildBody(
  node: GraphNode,
  stateSchema: Record<string, StateDefinition>,
  inputs: NodePortViewModel[],
  outputs: NodePortViewModel[],
  options: BuildNodeCardViewModelOptions,
): NodeCardViewModel["body"] {
  if (node.kind === "input") {
    const editorModel = resolveInputEditorModel(node, stateSchema);
    return {
      kind: "input",
      valueText: stringifyValue(node.config.value),
      editorMode: editorModel.editorMode,
      assetType: editorModel.assetType,
      primaryOutput: outputs[0] ?? null,
    };
  }

  if (node.kind === "agent") {
    return {
      kind: "agent",
      taskInstruction: node.config.taskInstruction?.trim() || "",
      modelLabel: resolveAgentModelLabel(node),
      thinkingLabel: resolveThinkingLabel(node),
      skillLabel: node.config.skills.length > 0 ? `${node.config.skills.length} skill${node.config.skills.length > 1 ? "s" : ""}` : "No skills",
      primaryInput: inputs[0] ?? null,
      primaryOutput: outputs[0] ?? null,
    };
  }

  if (node.kind === "condition") {
    return {
      kind: "condition",
      sourceLabel: getStateLabel(node.config.rule.source, stateSchema),
      operatorLabel: node.config.rule.operator,
      valueLabel: node.config.rule.value === null ? "null" : String(node.config.rule.value),
      maxLoopsLabel: String(normalizeConditionLoopLimit(node.config.loopLimit)),
      primaryInput: inputs[0] ?? null,
      routeOutputs: mapConditionRouteOutputs(node, options.conditionRouteTargets ?? {}),
    };
  }

  const connectedState = inputs[0]?.key ?? null;
  const runtime = options.runtime;
  return {
    kind: "output",
    previewTitle: "Preview",
    displayModeLabel: formatOutputDisplayModeLabel(runtime?.outputDisplayMode?.trim() || node.config.displayMode),
    persistFormatLabel: formatOutputPersistFormatLabel(node.config.persistFormat),
    connectedStateKey: connectedState,
    connectedStateLabel: connectedState ? getStateLabel(connectedState, stateSchema) : null,
    previewText: resolveOutputPreviewText({
      connectedState,
      stateSchema,
      runtimeStatus: runtime?.latestRunStatus ?? null,
      runtimeOutputPreviewText:
        runtime?.outputPreviewText === null || runtime?.outputPreviewText === undefined ? null : runtime.outputPreviewText,
      runtimeFailedMessage: runtime?.failedMessage?.trim() || "",
    }),
    persistEnabled: node.config.persistEnabled,
    persistLabel: node.config.persistEnabled ? "Save on" : "Save off",
    fileNameTemplate: node.config.fileNameTemplate,
  };
}

function getStateLabel(stateKey: string, stateSchema: Record<string, StateDefinition>) {
  return stateSchema[stateKey]?.name?.trim() || stateKey;
}

function getStateTypeLabel(stateKey: string, stateSchema: Record<string, StateDefinition>) {
  const stateType = stateSchema[stateKey]?.type?.trim() || "text";
  return stateType.replace(/_/g, " ");
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

function resolveOutputPreviewText(input: {
  connectedState: string | null;
  stateSchema: Record<string, StateDefinition>;
  runtimeStatus: string | null;
  runtimeOutputPreviewText: string | null;
  runtimeFailedMessage: string;
}) {
  if (input.runtimeFailedMessage) {
    return `Latest run failed here:\n${input.runtimeFailedMessage}`;
  }
  if (input.runtimeOutputPreviewText !== null && input.runtimeOutputPreviewText !== "") {
    return input.runtimeOutputPreviewText;
  }
  if (input.runtimeStatus === "failed") {
    return "Latest run failed before this output was produced.";
  }
  if (input.runtimeStatus === "completed") {
    return "Latest run completed, but this output did not produce a value.";
  }
  if (input.connectedState) {
    return stringifyValue(input.stateSchema[input.connectedState]?.value ?? "");
  }
  return "Connect a state to preview output.";
}

function resolveInputEditorModel(node: Extract<GraphNode, { kind: "input" }>, stateSchema: Record<string, StateDefinition>) {
  const primaryOutputStateKey = node.writes[0]?.state ?? "";
  const primaryOutputType = stateSchema[primaryOutputStateKey]?.type?.trim() || "";

  if (primaryOutputType === "knowledge_base") {
    return {
      editorMode: "knowledge_base" as const,
      assetType: null,
    };
  }

  if (isUploadedAssetStateType(primaryOutputType)) {
    return {
      editorMode: "asset" as const,
      assetType: primaryOutputType,
    };
  }

  if (typeof node.config.value === "string" || node.config.value === null || node.config.value === undefined) {
    return {
      editorMode: "text" as const,
      assetType: null,
    };
  }

  return {
    editorMode: "readonly" as const,
    assetType: null,
  };
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

function buildRuntimeNote(node: GraphNode, options: BuildNodeCardViewModelOptions) {
  const failedMessage = options.runtime?.failedMessage?.trim() || "";
  if (!failedMessage || node.kind === "output") {
    return null;
  }
  return {
    tone: "danger" as const,
    label: "Latest run",
    text: `Latest run failed here:\n${failedMessage}`,
  };
}

function mapConditionRouteOutputs(
  node: Extract<GraphNode, { kind: "condition" }>,
  conditionRouteTargets: Record<string, string | null>,
): NodeConditionRouteOutputViewModel[] {
  return node.config.branches.map((branch, index) => ({
    branch,
    routeTargetLabel: conditionRouteTargets[branch] ?? null,
    tone: resolveConditionRouteTone(branch, index),
  }));
}

function resolveConditionRouteTone(branch: string, index: number): NodeConditionRouteOutputViewModel["tone"] {
  const normalizedBranch = branch.trim().toLowerCase();
  if (normalizedBranch === "true") {
    return "success";
  }
  if (normalizedBranch === "false") {
    return "danger";
  }
  if (normalizedBranch === "exhausted" || normalizedBranch === "exausted") {
    return "neutral";
  }
  if (index === 0) {
    return "success";
  }
  if (index === 1) {
    return "danger";
  }
  return "warning";
}

function formatOutputDisplayModeLabel(displayMode: string) {
  switch (displayMode) {
    case "markdown":
      return "MD";
    case "plain":
      return "PLAIN";
    case "json":
      return "JSON";
    default:
      return "AUTO";
  }
}

function formatOutputPersistFormatLabel(persistFormat: Extract<GraphNode, { kind: "output" }>["config"]["persistFormat"]) {
  switch (persistFormat) {
    case "md":
      return "MD";
    case "txt":
      return "TXT";
    case "json":
      return "JSON";
    default:
      return "AUTO";
  }
}
