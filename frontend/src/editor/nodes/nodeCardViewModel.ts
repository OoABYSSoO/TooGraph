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
import type { SkillDefinition } from "../../types/skills.ts";
import { resolveDisplayAgentSkillInstructionBlocks } from "./skillPickerModel.ts";
import { resolveNodeDisplayDescription, resolveNodeDisplayTitle } from "./nodeDefaultTextModel.ts";

export type NodePortViewModel = {
  key: string;
  label: string;
  required?: boolean;
  typeLabel: string;
  stateColor: string;
  virtual?: boolean;
  managedBySkill?: {
    role: "input" | "output";
    skillKey: string;
    fieldKey: string;
  };
  managedByCapability?: {
    role: "input" | "result_package";
  };
};

export type NodeConditionRouteOutputViewModel = {
  branch: string;
  routeTargetLabel: string | null;
  tone: "success" | "danger" | "warning" | "neutral";
};

export type SubgraphThumbnailStatus = "idle" | "queued" | "running" | "paused" | "success" | "failed";

export type SubgraphThumbnailNodeViewModel = {
  id: string;
  label: string;
  kind: GraphNode["kind"];
  column: number;
  row: number;
  status: SubgraphThumbnailStatus;
  active: boolean;
};

export type SubgraphThumbnailEdgeViewModel = {
  source: string;
  target: string;
  active: boolean;
  status: SubgraphThumbnailStatus;
};

export type SubgraphRuntimeSummaryViewModel = {
  tone: "idle" | "running" | "success" | "failed" | "paused";
  completedCount: number;
  activeCount: number;
  failedCount: number;
  totalCount: number;
  currentNodeLabel: string | null;
};

export type BuildNodeCardViewModelOptions = {
  conditionRouteTargets?: Record<string, string | null>;
  skillDefinitions?: SkillDefinition[];
  runtime?: {
    latestRunStatus?: string | null;
    outputPreviewText?: string | null;
    outputDisplayMode?: string | null;
    failedMessage?: string | null;
    subgraphNodeStatusMap?: Record<string, string>;
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
        editorMode: "text" | "knowledge_base" | "asset" | "folder" | "readonly";
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
        kind: "subgraph";
        inputCount: number;
        outputCount: number;
        thumbnailNodes: SubgraphThumbnailNodeViewModel[];
        thumbnailEdges: SubgraphThumbnailEdgeViewModel[];
        thumbnailColumnCount: number;
        thumbnailRowCount: number;
        runtimeSummary: SubgraphRuntimeSummaryViewModel | null;
        capabilities: string[];
        primaryInput: NodePortViewModel | null;
        primaryOutput: NodePortViewModel | null;
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
        managedBySkill: resolveManagedSkillInputPort(binding),
        managedByCapability: resolveManagedCapabilityInputPort(node, binding.state, stateSchema),
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
          managedBySkill: resolveManagedSkillOutputPort(nodeId, binding.state, stateSchema),
          managedByCapability: resolveManagedCapabilityOutputPort(nodeId, binding.state, stateSchema),
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
    kindLabel: formatNodeKindLabel(node.kind),
    title: resolveNodeDisplayTitle(node.kind, node.name),
    description: resolveNodeDisplayDescription(node.kind, node.description),
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

function formatNodeKindLabel(kind: GraphNode["kind"]): string {
  return kind === "agent" ? "LLM" : kind.toUpperCase();
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
      skillInstructionBlocks: resolveDisplayAgentSkillInstructionBlocks(
        node.config.skillKey,
        options.skillDefinitions ?? [],
        node.config.skillInstructionBlocks ?? {},
      ),
      modelLabel: resolveAgentModelLabel(node),
      thinkingLabel: resolveThinkingLabel(node),
      skillLabel: node.config.skillKey.trim() || "No skill",
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

  if (node.kind === "subgraph") {
    const thumbnail = buildSubgraphThumbnail(node, options.runtime?.subgraphNodeStatusMap ?? {});
    return {
      kind: "subgraph",
      inputCount: node.reads.length,
      outputCount: node.writes.length,
      thumbnailNodes: thumbnail.nodes,
      thumbnailEdges: thumbnail.edges,
      thumbnailColumnCount: thumbnail.columnCount,
      thumbnailRowCount: thumbnail.rowCount,
      runtimeSummary: summarizeSubgraphRuntime(thumbnail.nodes),
      capabilities: listSubgraphCapabilities(node),
      primaryInput: inputs[0] ?? null,
      primaryOutput: outputs[0] ?? null,
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

function buildSubgraphThumbnail(node: Extract<GraphNode, { kind: "subgraph" }>, statusMap: Record<string, string>) {
  const entries = Object.entries(node.config.graph.nodes);
  const edgePairs = [
    ...node.config.graph.edges,
    ...node.config.graph.conditional_edges.flatMap((edge) =>
      Object.values(edge.branches).map((target) => ({
        source: edge.source,
        target,
      })),
    ),
  ];
  const visibleEntries = entries.filter(([, innerNode]) => isSubgraphThumbnailVisibleNode(innerNode));
  const orderedIds = orderSubgraphThumbnailNodeIds(
    visibleEntries.map(([id]) => id),
    edgePairs,
  );
  const columnCount = Math.max(1, Math.min(4, orderedIds.length));
  const positionById = new Map<string, { column: number; row: number }>();
  orderedIds.forEach((id, index) => {
    const row = Math.floor(index / columnCount) + 1;
    const columnOffset = index % columnCount;
    const column = columnOffset + 1;
    positionById.set(id, { column, row });
  });

  const entryById = new Map(entries);
  const nodes = orderedIds.flatMap((id) => {
    const innerNode = entryById.get(id);
    if (!innerNode) {
      return [];
    }
    const position = positionById.get(id) ?? { column: 1, row: 1 };
    const status = normalizeSubgraphThumbnailStatus(statusMap[id]);
    return [
      {
        id,
        label: innerNode.name?.trim() || id,
        kind: innerNode.kind,
        column: position.column,
        row: position.row,
        status,
        active: isActiveSubgraphThumbnailStatus(status),
      },
    ];
  });
  const statusByNodeId = new Map(nodes.map((item) => [item.id, item.status]));
  const visibleNodeIds = new Set(nodes.map((item) => item.id));
  const seenEdgeKeys = new Set<string>();
  return {
    nodes,
    edges: edgePairs.flatMap((edge) => {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
        return [];
      }
      const edgeKey = `${edge.source}->${edge.target}`;
      if (seenEdgeKeys.has(edgeKey)) {
        return [];
      }
      seenEdgeKeys.add(edgeKey);
      const status = statusByNodeId.get(edge.target) ?? "idle";
      return [
        {
          source: edge.source,
          target: edge.target,
          status,
          active: isActiveSubgraphThumbnailStatus(status) || isActiveSubgraphThumbnailStatus(statusByNodeId.get(edge.source) ?? "idle"),
        },
      ];
    }),
    columnCount,
    rowCount: Math.max(1, ...nodes.map((item) => item.row)),
  };
}

function isSubgraphThumbnailVisibleNode(node: GraphNode) {
  return node.kind !== "input" && node.kind !== "output";
}

function orderSubgraphThumbnailNodeIds(nodeIds: string[], edges: Array<{ source: string; target: string }>) {
  const orderIndex = new Map(nodeIds.map((id, index) => [id, index]));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(nodeIds.map((id) => [id, 0]));

  for (const edge of edges) {
    if (!orderIndex.has(edge.source) || !orderIndex.has(edge.target)) {
      continue;
    }
    const sourceIndex = orderIndex.get(edge.source) ?? 0;
    const targetIndex = orderIndex.get(edge.target) ?? 0;
    if (targetIndex <= sourceIndex) {
      continue;
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = nodeIds
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((left, right) => (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0));
  const ordered: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next)) {
      continue;
    }
    visited.add(next);
    ordered.push(next);
    for (const target of outgoing.get(next) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if ((indegree.get(target) ?? 0) === 0) {
        queue.push(target);
        queue.sort((left, right) => (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0));
      }
    }
  }

  return [...ordered, ...nodeIds.filter((id) => !visited.has(id))];
}

function normalizeSubgraphThumbnailStatus(status: string | null | undefined): SubgraphThumbnailStatus {
  if (status === "queued") {
    return "queued";
  }
  if (status === "running" || status === "resuming") {
    return "running";
  }
  if (status === "paused" || status === "awaiting_human") {
    return "paused";
  }
  if (status === "success" || status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "failed";
  }
  return "idle";
}

function isActiveSubgraphThumbnailStatus(status: SubgraphThumbnailStatus) {
  return status === "queued" || status === "running" || status === "paused";
}

function summarizeSubgraphRuntime(nodes: SubgraphThumbnailNodeViewModel[]): SubgraphRuntimeSummaryViewModel | null {
  const progressNodes = nodes.filter(isSubgraphRuntimeProgressNode);
  const touchedNodes = progressNodes.filter((item) => item.status !== "idle");
  if (touchedNodes.length === 0) {
    return null;
  }
  const completedCount = progressNodes.filter((item) => item.status === "success").length;
  const activeNodes = progressNodes.filter((item) => isActiveSubgraphThumbnailStatus(item.status));
  const failedCount = progressNodes.filter((item) => item.status === "failed").length;
  const currentNode = activeNodes[0] ?? null;
  const tone =
    failedCount > 0
      ? "failed"
      : activeNodes.some((item) => item.status === "paused")
        ? "paused"
        : activeNodes.length > 0
          ? "running"
          : completedCount === progressNodes.length
            ? "success"
            : "idle";
  return {
    tone,
    completedCount,
    activeCount: activeNodes.length,
    failedCount,
    totalCount: progressNodes.length,
    currentNodeLabel: currentNode?.label ?? null,
  };
}

function isSubgraphRuntimeProgressNode(node: SubgraphThumbnailNodeViewModel) {
  return node.kind !== "input" && node.kind !== "output";
}

function listSubgraphCapabilities(node: Extract<GraphNode, { kind: "subgraph" }>) {
  const capabilities = new Set<string>();
  for (const innerNode of Object.values(node.config.graph.nodes)) {
    if (innerNode.kind === "agent") {
      const skillKey = innerNode.config.skillKey.trim();
      if (skillKey) {
        capabilities.add(skillKey);
      }
    }
    if (innerNode.kind === "subgraph") {
      for (const capability of listSubgraphCapabilities(innerNode)) {
        capabilities.add(capability);
      }
    }
  }
  return [...capabilities].sort();
}

function getStateLabel(stateKey: string, stateSchema: Record<string, StateDefinition>) {
  return stateSchema[stateKey]?.name?.trim() || stateKey;
}

function getStateTypeLabel(stateKey: string, stateSchema: Record<string, StateDefinition>) {
  const stateType = stateSchema[stateKey]?.type?.trim() || "text";
  return stateType.replace(/_/g, " ");
}

function resolveManagedSkillOutputPort(
  nodeId: string,
  stateKey: string,
  stateSchema: Record<string, StateDefinition>,
): NodePortViewModel["managedBySkill"] {
  const binding = stateSchema[stateKey]?.binding;
  if (binding?.kind !== "skill_output" || binding.nodeId !== nodeId || binding.managed === false) {
    return undefined;
  }
  return {
    role: "output",
    skillKey: binding.skillKey,
    fieldKey: binding.fieldKey,
  };
}

function resolveManagedSkillInputPort(binding: Extract<GraphNode, { kind: "agent" }>["reads"][number]): NodePortViewModel["managedBySkill"] {
  if (binding.binding?.kind !== "skill_input" || binding.binding.managed === false) {
    return undefined;
  }
  return {
    role: "input",
    skillKey: binding.binding.skillKey,
    fieldKey: binding.binding.fieldKey,
  };
}

function resolveManagedCapabilityInputPort(
  node: GraphNode,
  stateKey: string,
  stateSchema: Record<string, StateDefinition>,
): NodePortViewModel["managedByCapability"] {
  if (node.kind !== "agent" || stateSchema[stateKey]?.type?.trim() !== "capability") {
    return undefined;
  }
  return { role: "input" };
}

function resolveManagedCapabilityOutputPort(
  nodeId: string,
  stateKey: string,
  stateSchema: Record<string, StateDefinition>,
): NodePortViewModel["managedByCapability"] {
  const binding = stateSchema[stateKey]?.binding;
  if (binding?.kind !== "capability_result" || binding.nodeId !== nodeId || binding.managed === false) {
    return undefined;
  }
  return { role: "result_package" };
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
  if (input.connectedStateType === "html") {
    return "html";
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

  if (primaryOutputType === "file" && isLocalFolderInputValue(primaryOutputValue)) {
    return {
      editorMode: "folder" as const,
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

function isLocalFolderInputValue(value: unknown): boolean {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as { kind?: unknown }).kind === "local_folder");
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
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
