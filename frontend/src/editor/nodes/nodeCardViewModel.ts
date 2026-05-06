import type { UploadedAssetType } from "./uploadedAssetModel.ts";
import { isUploadedAssetStateType, tryParseUploadedAssetEnvelope } from "./uploadedAssetModel.ts";
import { formatOutputDisplayModeLabel, formatOutputPersistFormatLabel } from "./outputConfigModel.ts";
import { OUTPUT_WAITING_TEXT, resolveOutputPreviewDisplayMode } from "./outputPreviewContentModel.ts";
import {
  buildVirtualAnyInputPort,
  buildVirtualAnyOutputPort,
  shouldExposeVirtualAnyInput,
  shouldExposeVirtualAnyOutput,
} from "../../lib/virtual-any-input.ts";
import { normalizeInputBoundaryConfigType } from "../../lib/input-boundary.ts";
import type { GraphNode, StateDefinition } from "../../types/node-system.ts";

export type NodePortViewModel = {
  key: string;
  label: string;
  required?: boolean;
  typeLabel: string;
  stateColor: string;
  virtual?: boolean;
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
        skillInstructionBlocks: NonNullable<Extract<GraphNode, { kind: "agent" }>["config"]["skillInstructionBlocks"]>;
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
        primaryInput: NodePortViewModel | null;
        routeOutputs: NodeConditionRouteOutputViewModel[];
      }
    | {
        kind: "output";
        previewTitle: string;
        displayMode: string;
        displayModeLabel: string;
        persistFormatLabel: string;
        primaryInput: NodePortViewModel | null;
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
  const inputs = shouldExposeVirtualAnyInput(node)
    ? [buildVirtualAnyInputPort()]
    : node.reads.map((binding) => ({
        key: binding.state,
        label: getStateLabel(binding.state, stateSchema),
        required: binding.required,
        typeLabel: getStateTypeLabel(binding.state, stateSchema),
        stateColor: stateSchema[binding.state]?.color ?? "#d97706",
      }));

  const outputs = shouldExposeVirtualAnyOutput(node)
    ? [buildVirtualAnyOutputPort()]
    : node.kind === "condition"
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
    const inputStateKey = outputs[0]?.key ?? node.writes[0]?.state ?? "";
    const inputStateValue = resolveInputStateValue(node, stateSchema, inputStateKey);
    return {
      kind: "input",
      valueText: stringifyValue(inputStateValue ?? node.config.value),
      editorMode: editorModel.editorMode,
      assetType: editorModel.assetType,
      primaryOutput: outputs[0] ?? null,
    };
  }

  if (node.kind === "agent") {
    return {
      kind: "agent",
      taskInstruction: node.config.taskInstruction?.trim() || "",
      skillInstructionBlocks: node.config.skillInstructionBlocks ?? {},
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
      primaryInput: inputs[0] ?? null,
      routeOutputs: mapConditionRouteOutputs(node, options.conditionRouteTargets ?? {}),
    };
  }

  const connectedState = node.reads[0]?.state ?? null;
  const runtime = options.runtime;
  const connectedStateType = connectedState ? stateSchema[connectedState]?.type?.trim() || "" : "";
  const configuredDisplayMode = resolveConfiguredOutputDisplayMode({
    configuredDisplayMode: node.config.displayMode,
    runtimeDisplayMode: runtime?.outputDisplayMode,
    connectedStateType,
  });
  const previewText = resolveOutputPreviewText({
    connectedState,
    stateSchema,
    runtimeStatus: runtime?.latestRunStatus ?? null,
    runtimeOutputPreviewText:
      runtime?.outputPreviewText === null || runtime?.outputPreviewText === undefined ? null : runtime.outputPreviewText,
    runtimeFailedMessage: runtime?.failedMessage?.trim() || "",
  });
  const displayMode = resolveOutputPreviewDisplayMode(previewText, configuredDisplayMode);
  return {
    kind: "output",
    previewTitle: "Preview",
    displayMode,
    displayModeLabel: formatOutputDisplayModeLabel(displayMode),
    persistFormatLabel: formatOutputPersistFormatLabel(node.config.persistFormat),
    primaryInput: inputs[0] ?? null,
    connectedStateKey: connectedState,
    connectedStateLabel: connectedState ? getStateLabel(connectedState, stateSchema) : null,
    previewText,
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
  if (isActiveRunStatus(input.runtimeStatus)) {
    return OUTPUT_WAITING_TEXT;
  }
  if (input.connectedState) {
    const stateValueText = stringifyValue(input.stateSchema[input.connectedState]?.value ?? "");
    if (stateValueText.trim()) {
      return stateValueText;
    }
    return `Connected to ${getStateLabel(input.connectedState, input.stateSchema)}. Run the graph to preview/export it.`;
  }
  return "Connect an upstream output to preview/export it.";
}

function resolveConfiguredOutputDisplayMode(input: {
  configuredDisplayMode: string;
  runtimeDisplayMode: string | null | undefined;
  connectedStateType: string;
}) {
  if (input.configuredDisplayMode !== "auto") {
    return input.configuredDisplayMode;
  }
  if (isDocumentStateType(input.connectedStateType)) {
    return "documents";
  }
  return input.runtimeDisplayMode?.trim() || input.configuredDisplayMode;
}

function isDocumentStateType(stateType: string) {
  return stateType === "file" || stateType === "image" || stateType === "audio" || stateType === "video";
}

function isActiveRunStatus(status: string | null) {
  return status === "queued" || status === "running" || status === "resuming";
}

function resolveInputEditorModel(node: Extract<GraphNode, { kind: "input" }>, stateSchema: Record<string, StateDefinition>) {
  const primaryOutputStateKey = node.writes[0]?.state ?? "";
  const uploadedAssetType = primaryOutputStateKey ? null : tryParseUploadedAssetEnvelope(node.config.value)?.detectedType ?? null;
  const primaryOutputType =
    stateSchema[primaryOutputStateKey]?.type?.trim() || uploadedAssetType || normalizeInputBoundaryConfigType(node.config.boundaryType);
  const primaryOutputValue = resolveInputStateValue(node, stateSchema, primaryOutputStateKey);

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

  if (typeof primaryOutputValue === "string" || primaryOutputValue === null || primaryOutputValue === undefined) {
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

function resolveInputStateValue(
  node: Extract<GraphNode, { kind: "input" }>,
  stateSchema: Record<string, StateDefinition>,
  stateKey: string,
) {
  const definition = stateKey ? stateSchema[stateKey] : null;
  if (definition && Object.prototype.hasOwnProperty.call(definition, "value")) {
    return definition.value;
  }
  return node.config.value;
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
  const mode = String(node.config.thinkingMode === "on" ? "high" : node.config.thinkingMode || "off");
  if (mode === "xhigh") {
    return "thinking Extra High";
  }
  if (mode === "minimal") {
    return "thinking low";
  }
  if (mode === "off" || mode === "low" || mode === "medium" || mode === "high") {
    return `thinking ${mode}`;
  }
  return "thinking off";
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
