"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  Position,
  useUpdateNodeInternals,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NodeSystemEditor } from "@/components/editor/node-system-editor";
import { API_BASE_URL, apiPost, type ApiIssue } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  EDITOR_NODE_DEFINITIONS,
  createEditorNodePreset,
  getEditorNodeInspectorFields,
  getEditorNodeDefinition,
  getEditorNodeUi,
  getInlinePortKeys,
  getVisiblePorts,
  getWidgetValue as getDefinitionWidgetValue,
  hydrateEditorNodeParams,
  resolveRuntimeParams,
  resolveRuntimeReads,
  resolvePortStateKey,
  resolveRuntimeWrites,
  setWidgetValue as setDefinitionWidgetValue,
  type EditorNodeInspectorFieldDefinition,
  type EditorNodePreset,
  type EditorPortType,
} from "@/lib/editor-node-definitions";

type ThemeConfig = {
  theme_preset: string;
  domain: string;
  genre: string;
  market: string;
  platform: string;
  language: string;
  creative_style: string;
  tone: string;
  language_constraints: string[];
  evaluation_policy: Record<string, unknown>;
  asset_source_policy: Record<string, unknown>;
  strategy_profile: Record<string, unknown>;
};

type StateField = {
  key: string;
  type: string;
  title: string;
  description: string;
  example?: unknown;
  source_nodes?: string[];
  target_nodes?: string[];
};

type GraphNodePayload = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  reads: string[];
  writes: string[];
  params: Record<string, unknown>;
  config?: Record<string, unknown>;
  implementation?: {
    executor?: string;
    handler_key?: string;
    tool_keys?: string[];
  };
};

type GraphEdgePayload = {
  id: string;
  source: string;
  target: string;
  flow_keys: string[];
  edge_kind: "normal" | "branch";
  branch_label?: "pass" | "revise" | "fail" | null;
};

type GraphPayload = {
  graph_id?: string | null;
  name: string;
  template_id: string;
  theme_config: ThemeConfig;
  state_schema: StateField[];
  nodes: GraphNodePayload[];
  edges: GraphEdgePayload[];
  metadata: Record<string, unknown>;
};

export type EditorClientGraphPayload = {
  graph_family?: "node_system";
  graph_id?: string | null;
  name: string;
  template_id: string;
  theme_config: ThemeConfig;
  state_schema: StateField[];
  nodes: unknown[];
  edges: unknown[];
  metadata: Record<string, unknown>;
};

type TemplateRecord = {
  template_id: string;
  label: string;
  description: string;
  default_graph_name: string;
  supported_node_types: string[];
  state_schema: StateField[];
  default_graph: Omit<GraphPayload, "graph_id">;
  default_node_system_graph?: Omit<EditorClientGraphPayload, "graph_id"> | null;
};

export type EditorClientTemplateRecord = TemplateRecord;

type RunDetail = {
  run_id: string;
  status: string;
  final_result?: string | null;
  state_snapshot?: Record<string, unknown>;
  warnings: string[];
  errors: string[];
};

type StateColorMap = Record<string, string>;

type EditorClientProps = {
  mode: "new" | "existing";
  initialGraph?: EditorClientGraphPayload | null;
  graphId?: string;
  templates: EditorClientTemplateRecord[];
  defaultTemplateId?: string;
};

type FlowNodeData = {
  nodeId: string;
  label: string;
  nodeType: string;
  description: string;
  reads: string[];
  writes: string[];
  params: Record<string, unknown>;
  stateColors: StateColorMap;
  paramBindings: Record<string, string>;
  isConnecting: boolean;
  outputPreview: {
    kind: "plain" | "markdown" | "json";
    text: string;
  } | null;
};

type FlowNode = Node<FlowNodeData>;

const HELLO_WORLD_TEMPLATE_ID = "hello_world";
const DEFAULT_STATE_COLOR = "#d97706";
const STATE_COLOR_PALETTE = ["#d97706", "#0f766e", "#2563eb", "#b45309", "#be185d", "#6d28d9", "#15803d", "#475569"];
const STATE_TYPE_OPTIONS = ["string", "number", "boolean", "object", "array", "markdown", "json", "file_list"] as const;

const NODE_PRESETS: Record<string, EditorNodePreset> = Object.fromEntries(
  Object.values(EDITOR_NODE_DEFINITIONS).map((definition) => [
    definition.type,
    createEditorNodePreset(definition),
  ]),
);

function createEditorDefaults(templates: TemplateRecord[]): GraphPayload {
  const helloWorldTemplate = templates.find((item) => item.template_id === HELLO_WORLD_TEMPLATE_ID);

  return {
    graph_id: null,
    name: helloWorldTemplate?.default_graph_name ?? "Hello World",
    template_id: helloWorldTemplate?.template_id ?? HELLO_WORLD_TEMPLATE_ID,
    theme_config:
      helloWorldTemplate?.default_graph.theme_config ?? {
        theme_preset: "hello_local",
        domain: "llm_validation",
        genre: "hello_world",
        market: "local",
        platform: "openai_compatible",
        language: "zh",
        creative_style: "minimal",
        tone: "plain",
        language_constraints: [],
        evaluation_policy: {},
        asset_source_policy: {},
        strategy_profile: {},
      },
    state_schema: helloWorldTemplate?.state_schema ?? [],
    nodes: [],
    edges: [],
    metadata: {},
  };
}

function runtimeNodeTypeToEditorNodeType(nodeType: string) {
  if (nodeType === "start") {
    return "text_input";
  }
  if (nodeType === "end") {
    return "text_output";
  }
  return nodeType;
}

function editorNodeTypeToRuntimeNodeType(nodeType: string) {
  if (nodeType === "text_input") {
    return "start";
  }
  if (nodeType === "text_output") {
    return "end";
  }
  return nodeType;
}

function inferBoundaryKeys(node: GraphNodePayload, graph: GraphPayload) {
  if (node.type === "start") {
    const outgoingKeys = graph.edges.filter((edge) => edge.source === node.id).flatMap((edge) => edge.flow_keys);
    return {
      reads: [],
      writes: uniqueKeys(outgoingKeys),
    };
  }
  if (node.type === "end") {
    const incomingKeys = graph.edges.filter((edge) => edge.target === node.id).flatMap((edge) => edge.flow_keys);
    return {
      reads: uniqueKeys(incomingKeys),
      writes: [],
    };
  }
  return {
    reads: node.reads,
    writes: node.writes,
  };
}

function graphNodeToFlowNode(node: GraphNodePayload, graph: GraphPayload): FlowNode {
  const editorNodeType = runtimeNodeTypeToEditorNodeType(node.type);
  const preset = NODE_PRESETS[editorNodeType];
  const definition = getEditorNodeDefinition(editorNodeType);
  const boundaryKeys = inferBoundaryKeys(node, graph);
  const rawParams = (node.params ?? {}) as Record<string, unknown>;
  const persistedParamBindings =
    rawParams.__param_bindings && typeof rawParams.__param_bindings === "object"
      ? (rawParams.__param_bindings as Record<string, string>)
      : {};
  const derivedParams = hydrateEditorNodeParams({
    definition,
    rawParams,
    nodeReads: boundaryKeys.reads,
    nodeWrites: boundaryKeys.writes,
  });
  return {
    id: node.id,
    type: "default",
    position: node.position,
    data: {
      nodeId: node.id,
      label: node.label,
      nodeType: editorNodeType,
      description: preset?.description ?? `${editorNodeType} node`,
      reads: boundaryKeys.reads,
      writes: boundaryKeys.writes,
      params: derivedParams,
      stateColors: {},
      paramBindings: persistedParamBindings,
      isConnecting: false,
      outputPreview: null,
    },
    draggable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: getNodeStyle(node.type),
  };
}

function getNodeStyle(nodeType: string) {
  const base = {
    borderRadius: 18,
    border: "1px solid rgba(154,52,18,0.25)",
    background: "linear-gradient(180deg, rgba(255,250,241,0.96) 0%, rgba(248,237,219,0.98) 100%)",
    color: "#1f2937",
    boxShadow: "0 18px 36px rgba(60,41,20,0.10)",
    padding: 0,
    width: 220,
  } as const;

  if (nodeType === "start") {
    return { ...base, border: "1px solid rgba(31,111,80,0.35)" };
  }
  if (nodeType === "end") {
    return { ...base, border: "1px solid rgba(159,18,57,0.3)" };
  }
  return base;
}

function getVisualInputKeys(nodeType: string, reads: string[], stateColors: StateColorMap, params: Record<string, unknown>) {
  return getVisiblePorts(getEditorNodeDefinition(nodeType), "input").map((port) =>
    resolvePortStateKey({
      definition: getEditorNodeDefinition(nodeType),
      nodeParams: params,
      nodeReads: reads,
      side: "input",
      portKey: port.key,
    }),
  );
}

function getVisualOutputKeys(nodeType: string, writes: string[], stateColors: StateColorMap, params: Record<string, unknown>) {
  return getVisiblePorts(getEditorNodeDefinition(nodeType), "output").map((port) =>
    resolvePortStateKey({
      definition: getEditorNodeDefinition(nodeType),
      nodeParams: params,
      nodeWrites: writes,
      side: "output",
      portKey: port.key,
    }),
  );
}

function getNodePreset(nodeType: string) {
  const definition = getEditorNodeDefinition(nodeType);
  if (definition) {
    return createEditorNodePreset(definition);
  }
  return NODE_PRESETS[nodeType];
}

function getWidgetValue(node: FlowNodeData, widgetKey: string) {
  return getDefinitionWidgetValue({
    definition: getEditorNodeDefinition(node.nodeType),
    nodeParams: node.params,
    widgetKey,
  });
}

function updateWidgetValue(node: FlowNodeData, widgetKey: string, nextValue: string) {
  return {
    ...node,
    params: setDefinitionWidgetValue({
      definition: getEditorNodeDefinition(node.nodeType),
      nodeParams: node.params,
      widgetKey,
      nextValue,
    }),
  };
}

function resolveOutputStateKey(node: FlowNodeData, portKey: string) {
  return resolvePortStateKey({
    definition: getEditorNodeDefinition(node.nodeType),
    nodeParams: node.params,
    nodeWrites: node.writes,
    side: "output",
    portKey,
  });
}

function resolveInputStateKey(node: FlowNodeData, portKey: string) {
  return resolvePortStateKey({
    definition: getEditorNodeDefinition(node.nodeType),
    nodeParams: node.params,
    nodeReads: node.reads,
    side: "input",
    portKey,
  });
}

function resolveHandlePortType(node: FlowNodeData, handleId?: string | null): EditorPortType | null {
  const preset = getNodePreset(node.nodeType);
  const stateKey = getStateKeyFromHandle(handleId);
  if (stateKey) {
    const inputPort = preset?.inputs?.find((item) => item.key === stateKey);
    if (inputPort) return inputPort.valueType;
    const outputPort = preset?.outputs?.find((item) => item.key === stateKey);
    if (outputPort) return outputPort.valueType;
    return "text";
  }
  const paramName = getParamNameFromHandle(handleId);
  if (paramName) {
    return preset?.widgets?.find((item) => item.key === paramName)?.valueType ?? "text";
  }
  return null;
}

function resolveActualFlowKeyFromNode(node: FlowNodeData, handleId?: string | null) {
  const stateKey = getStateKeyFromHandle(handleId);
  if (!stateKey) {
    return null;
  }
  if (handleId?.startsWith("output:")) {
    return resolveOutputStateKey(node, stateKey);
  }
  return resolveInputStateKey(node, stateKey);
}

function FlowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const reactFlow = useReactFlow<FlowNode, Edge>();
  const definition = getEditorNodeDefinition(data.nodeType);
  const preset = getNodePreset(data.nodeType);
  const ui = getEditorNodeUi(definition);
  const reads = getVisualInputKeys(data.nodeType, data.reads, data.stateColors, data.params);
  const writes = getVisualOutputKeys(data.nodeType, data.writes, data.stateColors, data.params);
  const inlineInputPorts = getInlinePortKeys(definition, "input").map((portKey) => {
    const portDefinition = definition?.inputs.find((port) => port.key === portKey);
    const actualKey = resolveInputStateKey(data, portKey);
    return {
      portKey,
      label: portDefinition?.label ?? portKey,
      actualKey,
      color: data.stateColors[actualKey] ?? DEFAULT_STATE_COLOR,
    };
  });
  const inlineOutputPorts = getInlinePortKeys(definition, "output").map((portKey) => {
    const portDefinition = definition?.outputs.find((port) => port.key === portKey);
    const actualKey = resolveOutputStateKey(data, portKey);
    return {
      portKey,
      label: portDefinition?.label ?? portKey,
      actualKey,
      color: data.stateColors[actualKey] ?? DEFAULT_STATE_COLOR,
    };
  });

  return (
    <div
      className={cn(
        "min-w-[260px] rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
        selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
      )}
    >
      <div className="flex items-center justify-between border-b border-[rgba(154,52,18,0.12)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[rgba(154,52,18,0.55)]" />
          <div className="truncate text-sm font-semibold text-[var(--text)]">{data.label}</div>
        </div>
        <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{data.nodeType}</div>
      </div>

      <div className="grid gap-3 px-4 py-3">
        {reads.length > 0 ? (
          <div className="grid gap-1">
            {reads.map((key) => (
              <SidePortRow
                key={`read-${key}`}
                nodeId={data.nodeId}
                label={key}
                color={data.stateColors[key] ?? DEFAULT_STATE_COLOR}
                side="input"
              />
            ))}
          </div>
        ) : null}

        {preset?.widgets?.length ? (
          <div className="grid gap-3">
            {ui.showDescription ? (
              <div className="text-sm leading-6 text-[var(--muted)]">{data.description}</div>
            ) : null}
            {inlineOutputPorts.map((port) => (
              <PortLine
                key={`inline-output-${port.portKey}`}
                nodeId={data.nodeId}
                label={port.label}
                rightSocket
                color={port.color}
              />
            ))}
            {preset.widgets.map((widget) => {
              const binding = data.paramBindings[widget.key];
              const showSocket = Boolean(widget.bindable) && (data.isConnecting || Boolean(binding));
              const disabled = Boolean(binding);
              return (
                <SocketField
                  key={widget.key}
                  nodeId={data.nodeId}
                  paramName={widget.key}
                  label={ui.showDescription ? widget.label : ""}
                  value={getWidgetValue(data, widget.key)}
                  binding={binding}
                  showSocket={showSocket}
                  disabled={disabled}
                  widgetType={widget.widget}
                  rows={widget.rows}
                  socketAnchor={ui.widgetSocketAnchor}
                  placeholder={widget.placeholder ?? String(data.params.placeholder ?? "")}
                  onChange={(nextValue) => {
                    reactFlow.setNodes((current) =>
                      current.map((node) =>
                        node.id === data.nodeId
                          ? {
                              ...node,
                              data: updateWidgetValue(node.data, widget.key, nextValue),
                            }
                          : node,
                      ),
                    );
                  }}
                />
              );
            })}
          </div>
        ) : null}

        {inlineInputPorts.length > 0 ? (
          <div className="grid gap-2">
            {inlineInputPorts.map((port) => (
              <PortLine
                key={`inline-input-${port.portKey}`}
                nodeId={data.nodeId}
                label={port.label}
                leftInput
                color={port.color}
              />
            ))}
            {ui.outputPreview.inputKey ? (
              <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <WidgetLabel label="Preview" />
                  {data.outputPreview ? (
                    <span className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">
                      {data.outputPreview.kind}
                    </span>
                  ) : null}
                </div>
                <OutputPreviewPanel preview={data.outputPreview} emptyText={ui.outputPreview.emptyText} />
              </div>
            ) : null}
          </div>
        ) : null}

        {writes.length > 0 ? (
          <div className="grid gap-1">
            {writes.map((key) => (
              <SidePortRow
                key={`write-${key}`}
                nodeId={data.nodeId}
                label={key}
                color={data.stateColors[key] ?? DEFAULT_STATE_COLOR}
                side="output"
              />
            ))}
          </div>
        ) : null}

        {reads.length === 0 && writes.length === 0 && inlineInputPorts.length === 0 && inlineOutputPorts.length === 0 ? (
          <EmptyIoState side="input" />
        ) : null}
      </div>
    </div>
  );
}

function WidgetLabel({ label }: { label: string }) {
  return <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{label}</div>;
}

function PortLine({
  nodeId,
  label,
  color,
  leftInput,
  rightSocket,
}: {
  nodeId: string;
  label: string;
  color: string;
  leftInput?: boolean;
  rightSocket?: boolean;
}) {
  return (
    <div className="relative flex h-6 items-center justify-between px-1 text-[0.82rem] uppercase tracking-[0.16em] text-[var(--accent-strong)]">
      <div className="relative flex h-6 min-w-[18px] items-center justify-start">
        {leftInput ? (
          <Handle
            id={buildHandleId("input", label)}
            type="target"
            position={Position.Left}
            className="!left-[-7px] !top-1/2 !m-0 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-[rgba(255,250,241,0.96)]"
            style={{ backgroundColor: color }}
            isConnectable
          />
        ) : null}
      </div>
      <div className={cn("flex-1 px-2", rightSocket ? "text-right" : "text-left")}>{label}</div>
      <div className="relative flex h-6 min-w-[28px] items-center justify-end">
        {rightSocket ? (
          <Handle
            id={buildHandleId("output", label)}
            type="source"
            position={Position.Right}
            className="!right-[-7px] !top-1/2 !m-0 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-[rgba(255,250,241,0.96)]"
            style={{ backgroundColor: color }}
            isConnectable
          />
        ) : null}
      </div>
    </div>
  );
}

function SidePortRow({
  nodeId,
  label,
  color,
  side,
}: {
  nodeId: string;
  label: string;
  color: string;
  side: "input" | "output";
}) {
  return (
    <div className={cn("relative flex h-6 items-center text-[0.92rem] text-[var(--text)]", side === "input" ? "justify-start" : "justify-end")}>
      {side === "input" ? (
        <>
          <Handle
            id={buildHandleId("input", label)}
            type="target"
            position={Position.Left}
            className="!left-[-7px] !top-1/2 !m-0 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-[rgba(255,250,241,0.96)]"
            style={{ backgroundColor: color }}
            isConnectable
          />
          <span className="ml-2 truncate">{label}</span>
        </>
      ) : (
        <>
          <span className="truncate text-right">{label}</span>
          <Handle
            id={buildHandleId("output", label)}
            type="source"
            position={Position.Right}
            className="!right-[-7px] !top-1/2 !m-0 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-[rgba(255,250,241,0.96)]"
            style={{ backgroundColor: color }}
            isConnectable
          />
        </>
      )}
    </div>
  );
}

function SocketField({
  nodeId,
  paramName,
  label,
  value,
  binding,
  showSocket,
  disabled,
  widgetType,
  rows,
  socketAnchor,
  placeholder,
  onChange,
}: {
  nodeId: string;
  paramName: string;
  label: string;
  value: string;
  binding?: string;
  showSocket: boolean;
  disabled: boolean;
  widgetType: "text" | "textarea";
  rows?: number;
  socketAnchor?: "center-left" | "top-left";
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const baseInputClass = cn(
    "w-full border-none bg-transparent text-sm outline-none placeholder:text-[var(--muted)]",
    disabled && "cursor-not-allowed text-[rgba(31,41,55,0.55)]",
  );

  return (
    <div className="grid gap-1.5">
      {label ? <WidgetLabel label={label} /> : null}
      <div
        className={cn(
          "relative rounded-[14px] border px-2.5 py-2 transition-colors",
          disabled
            ? "border-[rgba(154,52,18,0.12)] bg-[rgba(238,232,225,0.92)] text-[rgba(31,41,55,0.55)]"
            : "border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)]",
        )}
      >
        {showSocket ? (
          <Handle
            id={buildParamHandleId(paramName)}
            type="target"
            position={Position.Left}
            className={cn(
              "!left-[-7px] !m-0 !h-3 !w-3 !border-2 !border-[rgba(255,250,241,0.96)] !bg-white",
              socketAnchor === "top-left" ? "!top-[16px]" : "!top-1/2 !-translate-y-1/2",
              binding ? "!border-[rgba(31,111,80,0.5)] !shadow-[0_0_0_3px_rgba(31,111,80,0.12)]" : "!border-[rgba(217,119,6,0.55)] !shadow-[0_0_0_3px_rgba(217,119,6,0.12)]",
            )}
            style={{ backgroundColor: binding ? "#0f766e" : "#d97706" }}
            isConnectable
          />
        ) : null}
        {widgetType === "textarea" ? (
          <textarea
            value={value}
            disabled={disabled}
            rows={rows ?? 5}
            onChange={(event) => {
              event.stopPropagation();
              onChange(event.target.value);
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={placeholder ?? paramName}
            className={cn(baseInputClass, "min-h-[110px] resize-none px-1 py-1 leading-6")}
            aria-label={`${nodeId}-${paramName}`}
          />
        ) : (
          <input
            value={value}
            disabled={disabled}
            onChange={(event) => {
              event.stopPropagation();
              onChange(event.target.value);
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={placeholder ?? paramName}
            className={baseInputClass}
            aria-label={`${nodeId}-${paramName}`}
          />
        )}
        {binding ? (
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--accent-strong)]">
            override
          </span>
        ) : null}
      </div>
    </div>
  );
}

function OutputPreviewPanel({
  preview,
  emptyText,
}: {
  preview: FlowNodeData["outputPreview"];
  emptyText?: string;
}) {
  if (!preview?.text) {
    return (
      <div className="max-h-[180px] overflow-auto rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-sm text-[var(--muted)]">
        {emptyText ?? "No output yet"}
      </div>
    );
  }

  if (preview.kind === "json") {
    return (
      <pre className="max-h-[180px] overflow-auto rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 font-mono text-[0.76rem] leading-6 text-[var(--text)]">
        {preview.text}
      </pre>
    );
  }

  if (preview.kind === "markdown") {
    return (
      <div className="max-h-[180px] overflow-auto rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
        <SimpleMarkdownPreview text={preview.text} />
      </div>
    );
  }

  return (
    <div className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
      {preview.text}
    </div>
  );
}

function SimpleMarkdownPreview({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) {
          return null;
        }
        if (trimmed.startsWith("### ")) {
          return <h3 key={index} className="text-sm font-semibold">{trimmed.slice(4)}</h3>;
        }
        if (trimmed.startsWith("## ")) {
          return <h2 key={index} className="text-base font-semibold">{trimmed.slice(3)}</h2>;
        }
        if (trimmed.startsWith("# ")) {
          return <h1 key={index} className="text-lg font-semibold">{trimmed.slice(2)}</h1>;
        }
        if (trimmed.startsWith("- ")) {
          return (
            <ul key={index} className="space-y-1 pl-4">
              {trimmed.split("\n").map((line, lineIndex) => (
                <li key={lineIndex} className="list-disc">{line.replace(/^- /, "")}</li>
              ))}
            </ul>
          );
        }
        if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
          return (
            <pre key={index} className="overflow-auto rounded-[10px] bg-[rgba(255,255,255,0.78)] px-3 py-2 font-mono text-[0.76rem] leading-6">
              {trimmed.replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "")}
            </pre>
          );
        }
        return <p key={index} className="whitespace-pre-wrap break-words">{trimmed}</p>;
      })}
    </div>
  );
}

function EmptyIoState({ side }: { side: "input" | "output" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[rgba(154,52,18,0.1)] bg-[rgba(255,255,255,0.74)] px-2 py-1 text-[0.7rem] font-medium text-[var(--muted)]",
        side === "input" ? "justify-start self-start" : "justify-end self-end",
      )}
    >
      <span>none</span>
    </span>
  );
}

function InspectorField({
  field,
  value,
  onChange,
}: {
  field: EditorNodeInspectorFieldDefinition;
  value: unknown;
  onChange: (value: string | boolean) => void;
}) {
  if (field.control === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <input checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.control === "select") {
    return (
      <label className="grid gap-1.5 text-sm text-[var(--muted)]">
        <span>{field.label}</span>
        <select
          className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
      <span>{field.label}</span>
      <Input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function buildEdgeLabel(flowKeys: string[], edgeKind: "normal" | "branch", branchLabel: "pass" | "revise" | "fail" | null) {
  const flowLabel = flowKeys.join(", ");
  if (edgeKind === "branch") {
    return branchLabel ? (flowLabel ? `${branchLabel} · ${flowLabel}` : branchLabel) : flowLabel || "branch";
  }
  return flowLabel || "flow";
}

function buildHandleId(side: "input" | "output", stateKey: string) {
  return `${side}:${stateKey}`;
}

function buildParamHandleId(paramName: string) {
  return `param:${paramName}`;
}

function uniqueKeys(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isLikelyMarkdown(value: string) {
  return /(^|\n)(#{1,6}\s|-\s|>\s|\d+\.\s|```)/.test(value);
}

function detectOutputPreview(value: unknown, displayMode?: string): FlowNodeData["outputPreview"] {
  if (value === null || value === undefined) {
    return null;
  }

  if (displayMode === "json") {
    if (typeof value === "string") {
      try {
        return {
          kind: "json",
          text: JSON.stringify(JSON.parse(value), null, 2),
        };
      } catch {
        return { kind: "json", text: value };
      }
    }
    return { kind: "json", text: JSON.stringify(value, null, 2) };
  }

  if (displayMode === "markdown") {
    return { kind: "markdown", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) };
  }

  if (typeof value === "object") {
    return { kind: "json", text: JSON.stringify(value, null, 2) };
  }

  const text = String(value);
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return {
        kind: "json",
        text: JSON.stringify(JSON.parse(trimmed), null, 2),
      };
    } catch {
      // fall through
    }
  }

  if (displayMode === "plain") {
    return { kind: "plain", text };
  }

  if (isLikelyMarkdown(text)) {
    return { kind: "markdown", text };
  }

  return { kind: "plain", text };
}

function getStateKeyFromHandle(handleId?: string | null) {
  if (!handleId) {
    return null;
  }
  if (!handleId.startsWith("input:") && !handleId.startsWith("output:")) {
    return null;
  }
  const [, stateKey] = handleId.split(":");
  return stateKey || null;
}

function getParamNameFromHandle(handleId?: string | null) {
  if (!handleId || !handleId.startsWith("param:")) {
    return null;
  }
  const [, paramName] = handleId.split(":");
  return paramName || null;
}

function createVisualEdge(params: {
  id: string;
  source: string;
  target: string;
  flowKey: string | null;
  actualFlowKey?: string | null;
  edgeKind?: "normal" | "branch";
  branchLabel?: "pass" | "revise" | "fail" | null;
  stateColors: StateColorMap;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  logicalId?: string;
}): Edge {
  const edgeKind = params.edgeKind ?? "normal";
  const branchLabel = params.branchLabel ?? null;
  const flowKeys = params.flowKey ? [params.flowKey] : [];
  const colorKey = params.actualFlowKey ?? params.flowKey;
  const color = colorKey ? params.stateColors[colorKey] ?? "#9a3412" : "#9a3412";

  return {
    id: params.id,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle ?? (params.flowKey ? buildHandleId("output", params.flowKey) : null),
    targetHandle: params.targetHandle ?? (params.flowKey ? buildHandleId("input", params.flowKey) : null),
    label: buildEdgeLabel(flowKeys, edgeKind, branchLabel),
    data: {
      flow_keys: flowKeys,
      edge_kind: edgeKind,
      branch_label: branchLabel,
      logical_id: params.logicalId ?? params.id,
      flow_key: params.flowKey,
      actual_flow_key: params.actualFlowKey ?? params.flowKey,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: {
      stroke: color,
      strokeWidth: 1.8,
    },
    labelStyle: {
      fill: "#7c2d12",
      fontSize: 11,
      fontWeight: 600,
    },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 999,
    labelBgStyle: {
      fill: "rgba(255,250,241,0.96)",
      stroke: "rgba(154,52,18,0.14)",
      strokeWidth: 1,
    },
  };
}

function explodeGraphEdges(graph: GraphPayload, colors: StateColorMap): Edge[] {
  return graph.edges.flatMap((edge) => {
    const sourceNode = graph.nodes.find((node) => node.id === edge.source);
    const targetNode = graph.nodes.find((node) => node.id === edge.target);

    if (edge.flow_keys.length === 0) {
      return [
        createVisualEdge({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          flowKey: null,
          actualFlowKey: null,
          edgeKind: edge.edge_kind,
          branchLabel: edge.branch_label ?? null,
          stateColors: colors,
          logicalId: edge.id,
        }),
      ];
    }

    return edge.flow_keys.map((flowKey, index) =>
      createVisualEdge({
        id: `${edge.id}__${flowKey}__${index}`,
        source: edge.source,
        target: edge.target,
        flowKey: sourceNode?.type === "start" || targetNode?.type === "end" ? "text" : flowKey,
        actualFlowKey: flowKey,
        edgeKind: edge.edge_kind,
        branchLabel: edge.branch_label ?? null,
        stateColors: colors,
        sourceHandle: sourceNode?.type === "start" ? buildHandleId("output", "text") : undefined,
        targetHandle: targetNode?.type === "end" ? buildHandleId("input", "text") : undefined,
        logicalId: edge.id,
      }),
    );
  });
}

function collectParamBindings(edges: Edge[]) {
  return edges.reduce<Record<string, Record<string, string>>>((accumulator, edge) => {
    const sourceKey = ((edge.data?.actual_flow_key as string | undefined) ?? getStateKeyFromHandle(edge.sourceHandle)) || null;
    const paramName = getParamNameFromHandle(edge.targetHandle);
    if (!sourceKey || !paramName) {
      return accumulator;
    }
    const existing = accumulator[edge.target] ?? {};
    return {
      ...accumulator,
      [edge.target]: {
        ...existing,
        [paramName]: sourceKey,
      },
    };
  }, {});
}

function collapseVisualEdges(edges: Edge[]): GraphEdgePayload[] {
  const grouped = new Map<string, GraphEdgePayload>();

  edges.forEach((edge, index) => {
    const edgeKind = (edge.data?.edge_kind as "normal" | "branch" | undefined) ?? "normal";
    const branchLabel = (edge.data?.branch_label as "pass" | "revise" | "fail" | null | undefined) ?? null;
    const flowKey = (edge.data?.actual_flow_key as string | null | undefined) ?? getStateKeyFromHandle(edge.sourceHandle);
    const groupKey = [edge.source, edge.target, edgeKind, branchLabel ?? ""].join("::");
    const existing =
      grouped.get(groupKey) ??
      {
        id: (edge.data?.logical_id as string | undefined) ?? `edge_${index + 1}`,
        source: edge.source,
        target: edge.target,
        flow_keys: [],
        edge_kind: edgeKind,
        branch_label: branchLabel,
      };

    if (flowKey && !existing.flow_keys.includes(flowKey)) {
      existing.flow_keys.push(flowKey);
    }

    grouped.set(groupKey, existing);
  });

  return [...grouped.values()];
}

function getInitialStateColors(graph: GraphPayload): StateColorMap {
  const colors = (graph.metadata?.state_colors as StateColorMap | undefined) ?? {};
  const result: StateColorMap = {};

  graph.state_schema.forEach((field, index) => {
    result[field.key] = colors[field.key] ?? STATE_COLOR_PALETTE[index % STATE_COLOR_PALETTE.length] ?? DEFAULT_STATE_COLOR;
  });

  return result;
}

const nodeTypes = {
  default: FlowNodeCard,
};

function EditorCanvas({ initialGraph, mode, graphId }: { initialGraph: GraphPayload; mode: "new" | "existing"; graphId?: string }) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialGraph.nodes.map((node) => graphNodeToFlowNode(node, initialGraph)));
  const [edges, setEdges, onEdgesChange] = useEdgesState(explodeGraphEdges(initialGraph, getInitialStateColors(initialGraph)));
  const [graphName, setGraphName] = useState(initialGraph.name);
  const [currentGraphId, setCurrentGraphId] = useState<string | null>(initialGraph.graph_id ?? graphId ?? null);
  const [stateSchema, setStateSchema] = useState<StateField[]>(initialGraph.state_schema);
  const [stateColors, setStateColors] = useState<StateColorMap>(() => getInitialStateColors(initialGraph));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStateKey, setSelectedStateKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [validationIssues, setValidationIssues] = useState<ApiIssue[]>([]);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [newStateKey, setNewStateKey] = useState("");
  const [newStateDescription, setNewStateDescription] = useState("");
  const [newStateType, setNewStateType] = useState<(typeof STATE_TYPE_OPTIONS)[number]>("string");
  const reactFlow = useReactFlow<FlowNode, Edge>();
  const updateNodeInternals = useUpdateNodeInternals();

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const selectedState = useMemo(
    () => stateSchema.find((field) => field.key === selectedStateKey) ?? null,
    [stateSchema, selectedStateKey],
  );
  const selectedNodeDefinition = useMemo(
    () => (selectedNode ? getEditorNodeDefinition(selectedNode.data.nodeType) : undefined),
    [selectedNode],
  );
  const paramBindingsByNode = useMemo(() => collectParamBindings(edges), [edges]);

  const stateRelationships = useMemo(() => {
    return stateSchema.reduce<Record<string, { readers: string[]; writers: string[] }>>((accumulator, field) => {
      const readers = nodes
        .filter((node) => node.data.reads.includes(field.key))
        .map((node) => node.data.label || node.id);
      const writers = nodes
        .filter((node) => node.data.writes.includes(field.key))
        .map((node) => node.data.label || node.id);
      accumulator[field.key] = { readers, writers };
      return accumulator;
    }, {});
  }, [nodes, stateSchema]);

  useEffect(() => {
    if (nodes.length > 0) {
      window.requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.2, duration: 250 });
      });
    }
  }, [nodes.length, reactFlow]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          stateColors,
          paramBindings: paramBindingsByNode[node.id] ?? {},
          isConnecting,
          outputPreview: (() => {
            const definition = getEditorNodeDefinition(node.data.nodeType);
            const previewInputKey = getEditorNodeUi(definition).outputPreview.inputKey;
            if (!previewInputKey) {
              return null;
            }
            const previewStateKey = resolvePortStateKey({
              definition,
              nodeParams: node.data.params,
              nodeReads: node.data.reads,
              side: "input",
              portKey: previewInputKey,
            });
            return detectOutputPreview(
              runDetail?.state_snapshot?.[previewStateKey] ?? runDetail?.final_result ?? "",
              String(node.data.params.display_mode ?? "auto"),
            );
          })(),
        },
      })),
    );
  }, [isConnecting, paramBindingsByNode, runDetail, stateColors, setNodes]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      nodes.forEach((node) => updateNodeInternals(node.id));
    });
  }, [isConnecting, nodes, paramBindingsByNode, updateNodeInternals]);

  useEffect(() => {
    setEdges((current) =>
      current.map((edge) => {
        const flowKey = (edge.data?.actual_flow_key as string | null | undefined) ?? (edge.data?.flow_key as string | null | undefined) ?? null;
        const color = flowKey ? stateColors[flowKey] ?? "#9a3412" : "#9a3412";
        return {
          ...edge,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: {
            stroke: color,
            strokeWidth: 1.8,
          },
        };
      }),
    );
  }, [setEdges, stateColors]);

  const nodePalette = useMemo(() => {
    return Object.values(NODE_PRESETS).filter((item) => {
      const query = search.trim().toLowerCase();
      if (!query) {
        return true;
      }
      return [item.label, item.type, item.description].some((value) => value.toLowerCase().includes(query));
    });
  }, [search]);

  const visibleStates = useMemo(() => {
    const query = stateSearch.trim().toLowerCase();
    return stateSchema.filter((field) => {
      if (!query) {
        return true;
      }
      return [field.key, field.type, field.description, field.title].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [stateSchema, stateSearch]);

  function buildPayload(): GraphPayload {
    const metadata = {
      ...initialGraph.metadata,
      state_colors: stateColors,
    };

    const compiledNodes = nodes.map((node) => {
      const runtimeType = editorNodeTypeToRuntimeNodeType(node.data.nodeType);
      const paramBindings = paramBindingsByNode[node.id] ?? {};
      const definition = getEditorNodeDefinition(node.data.nodeType);
      const reads = resolveRuntimeReads({
        definition,
        nodeReads: node.data.reads,
        nodeParams: node.data.params,
        paramBindings,
      });
      const writes = resolveRuntimeWrites({
        definition,
        nodeWrites: node.data.writes,
        nodeParams: node.data.params,
      });
      const params = resolveRuntimeParams({
        definition,
        nodeParams: node.data.params,
        nodeLabel: node.data.label,
        paramBindings,
      });

      return {
        id: node.id,
        type: runtimeType,
        label: node.data.label,
        position: node.position,
        reads,
        writes,
        params,
        config: params,
        implementation: {
          executor: "node_handler",
          handler_key: definition?.runtime.handlerKey ?? runtimeType,
          tool_keys: definition?.runtime.toolKeys ?? [],
        },
      };
    });

    return {
      graph_id: currentGraphId,
      name: graphName.trim() || "Untitled Graph",
      template_id: initialGraph.template_id,
      theme_config: initialGraph.theme_config,
      state_schema: stateSchema.map((field) => ({
        ...field,
        title: field.title || field.key,
      })),
      metadata,
      nodes: compiledNodes,
      edges: collapseVisualEdges(edges),
    };
  }

  function addNode(nodeType: string, position?: { x: number; y: number }) {
    const preset = NODE_PRESETS[nodeType];
    if (!preset) {
      return;
    }

    const wrapperBounds = wrapperRef.current?.getBoundingClientRect();
    const fallbackPosition = wrapperBounds
      ? reactFlow.screenToFlowPosition({
          x: wrapperBounds.left + wrapperBounds.width * 0.5,
          y: wrapperBounds.top + wrapperBounds.height * 0.42,
        })
      : { x: 180, y: 180 };
    const nextPosition = position ?? fallbackPosition;
    const nextId = `${nodeType}_${crypto.randomUUID().slice(0, 8)}`;

    setNodes((current) =>
      current.concat({
        id: nextId,
        type: "default",
        position: nextPosition,
        data: {
          label: preset.label,
          nodeId: nextId,
          nodeType: preset.type,
          description: preset.description,
          reads: [...preset.reads],
          writes: [...preset.writes],
          params: { ...preset.params },
          stateColors,
          paramBindings: {},
          isConnecting: false,
          outputPreview: null,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: getNodeStyle(nodeType),
      }),
    );
    setSelectedNodeId(nextId);
    setSelectedEdgeId(null);
    setStatusMessage(`Added ${preset.label}`);
    window.requestAnimationFrame(() => {
      reactFlow.setCenter(nextPosition.x, nextPosition.y, { duration: 250, zoom: 1 });
    });
  }

  function addStateField() {
    const key = newStateKey.trim();
    if (!key) {
      setStatusMessage("State key is required");
      return;
    }
    if (stateSchema.some((field) => field.key === key)) {
      setStatusMessage(`State '${key}' already exists`);
      return;
    }

    setStateSchema((current) =>
      current.concat({
        key,
        type: newStateType,
        title: key,
        description: newStateDescription.trim(),
      }),
    );
    setStateColors((current) => ({
      ...current,
      [key]: STATE_COLOR_PALETTE[stateSchema.length % STATE_COLOR_PALETTE.length] ?? DEFAULT_STATE_COLOR,
    }));
    setSelectedStateKey(key);
    setNewStateKey("");
    setNewStateDescription("");
    setNewStateType("string");
    setStatusMessage(`Added state ${key}`);
  }

  function updateStateField(stateKey: string, partial: Partial<StateField>) {
    let nextKey = stateKey;

    setStateSchema((current) =>
      current.map((field) => {
        if (field.key !== stateKey) {
          return field;
        }

        nextKey = (partial.key ?? field.key).trim();
        return {
          ...field,
          ...partial,
          key: nextKey,
          title: partial.title ?? field.title ?? nextKey,
        };
      }),
    );

    if (partial.key && partial.key.trim() && partial.key.trim() !== stateKey) {
      const trimmedKey = partial.key.trim();
      setStateColors((current) => {
        const nextColors = { ...current, [trimmedKey]: current[stateKey] ?? DEFAULT_STATE_COLOR };
        delete nextColors[stateKey];
        return nextColors;
      });
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          data: {
            ...node.data,
            reads: node.data.reads.map((item) => (item === stateKey ? trimmedKey : item)),
            writes: node.data.writes.map((item) => (item === stateKey ? trimmedKey : item)),
            paramBindings: Object.fromEntries(
              Object.entries(node.data.paramBindings).map(([paramName, bindingKey]) => [
                paramName,
                bindingKey === stateKey ? trimmedKey : bindingKey,
              ]),
            ),
          },
        })),
      );
      setEdges((current) =>
        current.map((edge) => {
          const flowKeys = ((edge.data?.flow_keys as string[] | undefined) ?? []).map((item) =>
            item === stateKey ? trimmedKey : item,
          );
          const sourceKey = getStateKeyFromHandle(edge.sourceHandle);
          return {
            ...edge,
            sourceHandle: sourceKey === stateKey ? buildHandleId("output", trimmedKey) : edge.sourceHandle,
            targetHandle: edge.targetHandle?.startsWith("param:")
              ? edge.targetHandle
              : getStateKeyFromHandle(edge.targetHandle) === stateKey
                ? buildHandleId("input", trimmedKey)
                : edge.targetHandle,
            label: buildEdgeLabel(
              flowKeys,
              ((edge.data?.edge_kind as "normal" | "branch" | undefined) ?? "normal"),
              ((edge.data?.branch_label as "pass" | "revise" | "fail" | null | undefined) ?? null),
            ),
            data: {
              ...(edge.data ?? {}),
              flow_keys: flowKeys,
              flow_key: flowKeys[0] ?? null,
            },
          };
        }),
      );
      setSelectedStateKey(trimmedKey);
    }
  }

  function updateNodeData(nodeId: string, updater: (data: FlowNodeData) => FlowNodeData) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: updater(node.data),
            }
          : node,
      ),
    );
  }

  function updateEdge(edgeId: string, partial: Partial<Edge>) {
    setEdges((current) => current.map((edge) => (edge.id === edgeId ? { ...edge, ...partial } : edge)));
  }

  function handleSelectionChange({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams<FlowNode, Edge>) {
    setSelectedNodeId(selectedNodes[0]?.id ?? null);
    setSelectedEdgeId(selectedEdges[0]?.id ?? null);
    setSelectedStateKey(null);
  }

  async function handleSave() {
    setIsSaving(true);
    setStatusMessage("Saving graph...");
    setValidationIssues([]);

    try {
      const response = await apiPost<{ graph_id: string; validation: { issues: ApiIssue[] } }>("/api/graphs/save", buildPayload());
      setCurrentGraphId(response.graph_id);
      setStatusMessage("Graph saved");
      if (mode === "new") {
        router.replace(`/editor/${response.graph_id}`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleValidate() {
    setIsValidating(true);
    setStatusMessage("Validating graph...");

    try {
      const response = await apiPost<{ valid: boolean; issues: ApiIssue[] }>("/api/graphs/validate", buildPayload());
      setValidationIssues(response.issues);
      setStatusMessage(response.valid ? "Validation passed" : `Validation failed with ${response.issues.length} issue(s)`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Validation failed");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleRun() {
    setIsRunning(true);
    setRunDetail(null);
    setStatusMessage("Running graph...");
    setValidationIssues([]);

    try {
      const runResponse = await apiPost<{ run_id: string; status: string }>("/api/graphs/run", buildPayload());
      const detail = await pollRun(runResponse.run_id);
      setRunDetail(detail);
      setStatusMessage(detail.status === "completed" ? "Run completed" : `Run ${detail.status}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Run failed");
    } finally {
      setIsRunning(false);
    }
  }

  async function pollRun(runId: string): Promise<RunDetail> {
    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${API_BASE_URL}/api/runs/${runId}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load run ${runId}`);
      }
      const detail = (await response.json()) as RunDetail;
      if (detail.status === "completed" || detail.status === "failed") {
        return detail;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    }

    const finalResponse = await fetch(`${API_BASE_URL}/api/runs/${runId}`, { cache: "no-store" });
    if (!finalResponse.ok) {
      throw new Error(`Failed to load run ${runId}`);
    }
    return (await finalResponse.json()) as RunDetail;
  }

  return (
    <div className="grid h-screen grid-rows-[56px_minmax(0,1fr)_36px] bg-[radial-gradient(circle_at_top,rgba(154,52,18,0.1),transparent_22%),linear-gradient(180deg,#f5efe2_0%,#ede4d2_100%)]">
      <header className="grid grid-cols-[minmax(220px,320px)_1fr_auto] items-center gap-3 border-b border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.82)] px-4 backdrop-blur-xl">
        <Input className="h-10" value={graphName} onChange={(event) => setGraphName(event.target.value)} placeholder="Graph name" />
        <div className="text-sm text-[var(--muted)]">
          {currentGraphId ? `Graph ID: ${currentGraphId}` : "Unsaved graph"}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            Save
          </Button>
          <Button size="sm" onClick={handleValidate} disabled={isValidating}>
            Validate
          </Button>
          <Button size="sm" variant="primary" onClick={handleRun} disabled={isRunning}>
            Run
          </Button>
          <Button size="sm" onClick={() => reactFlow.fitView({ padding: 0.2, duration: 250 })}>
            Fit View
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="grid min-h-0 grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] border-r border-[rgba(154,52,18,0.16)] bg-[rgba(255,248,240,0.76)] px-4 py-4">
          <section className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)]">
            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">State Panel</div>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">State Registry</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Define the shared state and inspect which nodes read or write each field.</p>
            </div>
            <Input
              className="mt-4 h-10"
              value={stateSearch}
              onChange={(event) => setStateSearch(event.target.value)}
              placeholder="Search state key or type"
            />
            <div className="mt-4 grid gap-2 rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                <Input value={newStateKey} onChange={(event) => setNewStateKey(event.target.value)} placeholder="state key" />
                <select
                  className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                  value={newStateType}
                  onChange={(event) => setNewStateType(event.target.value as (typeof STATE_TYPE_OPTIONS)[number])}
                >
                  {STATE_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <Input value={newStateDescription} onChange={(event) => setNewStateDescription(event.target.value)} placeholder="short description" />
              <Button size="sm" onClick={addStateField}>
                Add State
              </Button>
            </div>
            <div className="mt-4 grid min-h-0 gap-3 overflow-y-auto pr-1">
              {visibleStates.map((field) => {
                const relationships = stateRelationships[field.key] ?? { readers: [], writers: [] };
                const isSelected = selectedStateKey === field.key;
                return (
                  <button
                    key={field.key}
                    type="button"
                    className={cn(
                      "rounded-[20px] border bg-[rgba(255,250,241,0.92)] p-4 text-left shadow-[0_10px_24px_rgba(60,41,20,0.06)] transition-transform hover:-translate-y-px",
                      isSelected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.18)]",
                    )}
                    onClick={() => {
                      setSelectedStateKey(field.key);
                      setSelectedNodeId(null);
                      setSelectedEdgeId(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stateColors[field.key] ?? DEFAULT_STATE_COLOR }} />
                          <span className="text-sm font-semibold text-[var(--text)]">{field.key}</span>
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                          {field.type}
                        </div>
                      </div>
                      <div className="text-xs text-[var(--muted)]">{relationships.writers.length}W · {relationships.readers.length}R</div>
                    </div>
                    {field.description ? <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{field.description}</div> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-t border-[rgba(154,52,18,0.12)] pt-4">
            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Node Palette</div>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Build Hello World</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Create a text input, a processing node and a text output after defining the state shape.</p>
            </div>
            <Input
              className="mt-4 h-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search node type or label"
            />
            <div className="mt-4 grid min-h-0 gap-3 overflow-y-auto pr-1">
              {nodePalette.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  draggable
                  className="cursor-grab rounded-[20px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.92)] p-4 text-left shadow-[0_10px_24px_rgba(60,41,20,0.06)] transition-transform hover:-translate-y-px active:cursor-grabbing"
                  onClick={() => addNode(item.type)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/graphiteui-node", item.type);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{item.type}</div>
                  <div className="mt-1 text-lg font-semibold text-[var(--text)]">{item.label}</div>
                  <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <div className="relative min-w-0 min-h-0" ref={wrapperRef}>
          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnectStart={() => setIsConnecting(true)}
              onConnectEnd={() => setIsConnecting(false)}
              onConnect={(connection: Connection) => {
                const sourceNode = nodes.find((node) => node.id === connection.source)?.data;
                const targetNode = nodes.find((node) => node.id === connection.target)?.data;
                const sourceKey = getStateKeyFromHandle(connection.sourceHandle);
                const targetKey = getStateKeyFromHandle(connection.targetHandle);
                const targetParam = getParamNameFromHandle(connection.targetHandle);
                const sourceType = sourceNode ? resolveHandlePortType(sourceNode, connection.sourceHandle) : null;
                const targetType = targetNode ? resolveHandlePortType(targetNode, connection.targetHandle) : null;

                if (!sourceNode || !targetNode || !sourceKey) {
                  setIsConnecting(false);
                  setStatusMessage("Connect from a state output handle.");
                  return;
                }
                if (!targetKey && !targetParam) {
                  setIsConnecting(false);
                  setStatusMessage("Connect to a state input or parameter handle.");
                  return;
                }
                if (sourceType && targetType && sourceType !== "any" && targetType !== "any" && sourceType !== targetType) {
                  setIsConnecting(false);
                  setStatusMessage("Only compatible value types can be connected.");
                  return;
                }

                const actualFlowKey = resolveActualFlowKeyFromNode(sourceNode, connection.sourceHandle);
                const actualTargetKey = targetKey ? resolveActualFlowKeyFromNode(targetNode, connection.targetHandle) : null;

                const nextEdge = createVisualEdge({
                  id: `edge_${crypto.randomUUID().slice(0, 8)}`,
                  source: connection.source ?? "",
                  target: connection.target ?? "",
                  sourceHandle: connection.sourceHandle,
                  targetHandle: connection.targetHandle,
                  flowKey: sourceKey,
                  actualFlowKey,
                  stateColors,
                });

                setEdges((current) => {
                  const filtered = current.filter((edge) => {
                    if (targetParam && edge.target === nextEdge.target && edge.targetHandle === nextEdge.targetHandle) {
                      return false;
                    }
                    if (targetKey && edge.target === nextEdge.target && edge.targetHandle === nextEdge.targetHandle) {
                      return false;
                    }
                    return !(
                      edge.source === nextEdge.source &&
                      edge.target === nextEdge.target &&
                      edge.sourceHandle === nextEdge.sourceHandle &&
                      edge.targetHandle === nextEdge.targetHandle
                    );
                  });
                  return filtered.concat(nextEdge);
                });
                if (targetNode.nodeType === "text_output" && actualFlowKey) {
                  updateNodeData(targetNode.nodeId, (data) => ({
                    ...data,
                    reads: uniqueKeys([actualFlowKey]),
                    params: {
                      ...data.params,
                      source_state_key: actualFlowKey,
                    },
                  }));
                }
                if (targetNode.nodeType !== "text_output" && targetKey && actualTargetKey && actualTargetKey !== actualFlowKey) {
                  updateNodeData(targetNode.nodeId, (data) => ({
                    ...data,
                    reads: data.reads.map((item) => (item === actualTargetKey ? actualFlowKey ?? item : item)),
                  }));
                }
                setIsConnecting(false);
                setStatusMessage(targetParam ? `Bound ${actualFlowKey ?? sourceKey} to ${targetParam}` : `Connected ${actualFlowKey ?? sourceKey}`);
              }}
              onSelectionChange={handleSelectionChange}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
                setSelectedStateKey(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const nodeType = event.dataTransfer.getData("application/graphiteui-node");
                if (!nodeType) {
                  return;
                }
                const position = reactFlow.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                });
                addNode(nodeType, position);
              }}
              fitView
              minZoom={0.35}
              maxZoom={1.8}
              defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
              nodeTypes={nodeTypes}
              className={cn(
                "bg-[linear-gradient(180deg,rgba(247,241,231,0.72)_0%,rgba(237,228,210,0.72)_100%)]",
                dragActive && "ring-4 ring-[rgba(154,52,18,0.12)]",
              )}
            >
              <Background
                id="editor-grid"
                color="#cfb58f"
                gap={24}
                size={1.4}
                variant={BackgroundVariant.Dots}
              />
              <Controls
                position="top-right"
                className="[&>button]:border-[rgba(154,52,18,0.18)] [&>button]:bg-[rgba(255,250,241,0.92)] [&>button]:text-[var(--text)]"
              />
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                className="!bottom-4 !right-4 !h-[168px] !w-[220px] !bg-transparent !shadow-none"
                maskColor="rgba(154,52,18,0.08)"
                nodeColor="#d97706"
              />
            </ReactFlow>
          </div>

          {nodes.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="rounded-[28px] border border-dashed border-[rgba(154,52,18,0.26)] bg-[rgba(255,250,241,0.72)] px-8 py-6 text-center shadow-[0_18px_40px_rgba(60,41,20,0.08)]">
                <div className="text-[0.72rem] uppercase tracking-[0.16em] text-[var(--accent-strong)]">Empty Canvas</div>
                <div className="mt-3 text-2xl font-semibold text-[var(--text)]">Drop your first node here</div>
                <div className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                  Define state on the left, then drag from the node palette or click a node card to create it in the visible area.
                </div>
              </div>
            </div>
          ) : null}

        </div>

        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-l border-[rgba(154,52,18,0.16)] bg-[rgba(255,248,240,0.76)] px-4 py-4">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Inspector</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
              {selectedNode ? selectedNode.data.label : selectedEdge ? "Edge" : selectedState ? selectedState.key : "Graph"}
            </h2>
          </div>

          <div className="mt-4 min-h-0 space-y-4 overflow-y-auto pr-1">
            {!selectedNode && !selectedEdge && !selectedState ? (
              <div className="grid gap-4">
                <section className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
                  <div className="text-sm font-semibold text-[var(--text)]">Graph Info</div>
                  <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    <div>Template: {initialGraph.template_id}</div>
                    <div>Nodes: {nodes.length}</div>
                    <div>Edges: {edges.length}</div>
                    <div>States: {stateSchema.length}</div>
                  </div>
                </section>
                <section className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
                  <div className="text-sm font-semibold text-[var(--text)]">State Schema</div>
                  <div className="mt-3 grid gap-2">
                    {stateSchema.map((field) => (
                      <div key={field.key} className="rounded-2xl border border-[rgba(154,52,18,0.1)] bg-[rgba(255,250,241,0.82)] px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stateColors[field.key] ?? DEFAULT_STATE_COLOR }} />
                          <div className="text-sm font-semibold text-[var(--text)]">{field.key}</div>
                        </div>
                        <div className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                          {field.type}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {selectedNode ? (
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Label</span>
                  <Input
                    value={selectedNode.data.label}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, (data) => ({
                        ...data,
                        label: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4 text-sm leading-6 text-[var(--muted)]">
                  <div>Type: {selectedNode.data.nodeType}</div>
                  <div>Description: {selectedNode.data.description}</div>
                </div>
                {(selectedNodeDefinition?.widgets?.length ?? 0) > 0 ? (
                  <div className="grid gap-3">
                    {selectedNodeDefinition?.widgets.map((widget) => (
                      <label key={widget.key} className="grid gap-1.5 text-sm text-[var(--muted)]">
                        <span>{widget.label}</span>
                        <Input
                          value={getWidgetValue(selectedNode.data, widget.key)}
                          disabled={Boolean(selectedNode.data.paramBindings[widget.key])}
                          onChange={(event) =>
                            updateNodeData(selectedNode.id, (data) => updateWidgetValue(data, widget.key, event.target.value))
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                {getEditorNodeInspectorFields(selectedNodeDefinition).map((field) => (
                  <InspectorField
                    key={field.key}
                    field={field}
                    value={selectedNode.data.params[field.paramKey]}
                    onChange={(nextValue) => {
                      updateNodeData(selectedNode.id, (data) => {
                        const nextData: FlowNodeData = {
                          ...data,
                          params: {
                            ...data.params,
                            [field.paramKey]: nextValue,
                          },
                        };

                        if (field.syncPort?.side === "input") {
                          nextData.reads = uniqueKeys([
                            String(nextValue).trim() || resolveInputStateKey(data, field.syncPort.key) || "",
                          ]);
                        }

                        if (field.syncPort?.side === "output") {
                          nextData.writes = uniqueKeys([
                            String(nextValue).trim() || resolveOutputStateKey(data, field.syncPort.key) || "",
                          ]);
                        }

                        return nextData;
                      });
                    }}
                  />
                ))}
                {Object.keys(selectedNode.data.paramBindings).length > 0 ? (
                  <div className="rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                    {Object.entries(selectedNode.data.paramBindings).map(([paramName, bindingKey]) => (
                      <div key={paramName}>
                        {paramName}: {bindingKey} overrides local value
                      </div>
                    ))}
                  </div>
                ) : null}
                {selectedNodeDefinition?.kind === "output_boundary" && runDetail ? (
                  <div className="rounded-[20px] border border-[rgba(31,111,80,0.18)] bg-[rgba(241,250,245,0.92)] p-4 text-sm leading-6 text-[var(--text)]">
                    <div className="font-semibold text-[var(--success)]">Output Preview</div>
                    <div className="mt-2 whitespace-pre-wrap break-words">
                      {String(
                        runDetail.state_snapshot?.[
                          resolveInputStateKey(
                            selectedNode.data,
                            getEditorNodeUi(selectedNodeDefinition).outputPreview.inputKey || selectedNode.data.reads[0] || "",
                          )
                        ] ??
                          runDetail.final_result ??
                          "",
                      )}
                    </div>
                    {Array.isArray((runDetail.state_snapshot?.saved_outputs as unknown[]) ?? [])
                      ? ((runDetail.state_snapshot?.saved_outputs as Array<{ file_name?: string; format?: string }>) ?? []).map((item, index) => (
                          <div key={`${item.file_name ?? "saved"}-${index}`} className="mt-2 text-xs text-[var(--muted)]">
                            Saved: {item.file_name ?? "output"} ({item.format ?? "txt"})
                          </div>
                        ))
                      : null}
                  </div>
                ) : null}
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Reads</span>
                  <Input
                    value={selectedNode.data.reads.join(", ")}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, (data) => ({
                        ...data,
                        reads: splitCommaValues(event.target.value),
                      }))
                    }
                    placeholder="name, greeting"
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Writes</span>
                  <Input
                    value={selectedNode.data.writes.join(", ")}
                    onChange={(event) =>
                      updateNodeData(selectedNode.id, (data) => ({
                        ...data,
                        writes: splitCommaValues(event.target.value),
                      }))
                    }
                    placeholder="greeting, final_result"
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Params JSON</span>
                  <textarea
                    className="min-h-40 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                    value={JSON.stringify(selectedNode.data.params, null, 2)}
                    onChange={(event) => {
                      try {
                        const parsed = JSON.parse(event.target.value) as Record<string, unknown>;
                        updateNodeData(selectedNode.id, (data) => ({
                          ...data,
                          params: parsed,
                        }));
                      } catch {
                        setStatusMessage("Params JSON is invalid");
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}

            {selectedState ? (
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>State Key</span>
                  <Input
                    value={selectedState.key}
                    onChange={(event) => updateStateField(selectedState.key, { key: event.target.value })}
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Description</span>
                  <Input
                    value={selectedState.description}
                    onChange={(event) => updateStateField(selectedState.key, { description: event.target.value })}
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Type</span>
                  <select
                    className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                    value={selectedState.type}
                    onChange={(event) => updateStateField(selectedState.key, { type: event.target.value })}
                  >
                    {STATE_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-2 rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
                  <div className="text-sm font-semibold text-[var(--text)]">Color</div>
                  <div className="flex flex-wrap gap-2">
                    {STATE_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-transform hover:scale-105",
                          (stateColors[selectedState.key] ?? DEFAULT_STATE_COLOR) === color
                            ? "border-[var(--text)]"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() =>
                          setStateColors((current) => ({
                            ...current,
                            [selectedState.key]: color,
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4 text-sm leading-6 text-[var(--muted)]">
                  <div>
                    <div className="font-semibold text-[var(--text)]">Writers</div>
                    <div>{(stateRelationships[selectedState.key]?.writers ?? []).join(", ") || "No writers yet"}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--text)]">Readers</div>
                    <div>{(stateRelationships[selectedState.key]?.readers ?? []).join(", ") || "No readers yet"}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedEdge ? (
              <div className="grid gap-4">
                <div className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4 text-sm leading-6 text-[var(--muted)]">
                  <div>Source: {selectedEdge.source}</div>
                  <div>Target: {selectedEdge.target}</div>
                </div>
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Flow Keys</span>
                  <Input
                    value={((selectedEdge.data?.flow_keys as string[] | undefined) ?? []).join(", ")}
                    onChange={(event) => {
                      const flowKeys = splitCommaValues(event.target.value);
                      const primaryKey = flowKeys[0] ?? null;
                      const targetParam = getParamNameFromHandle(selectedEdge.targetHandle);
                      updateEdge(selectedEdge.id, {
                        sourceHandle: primaryKey ? buildHandleId("output", primaryKey) : selectedEdge.sourceHandle,
                        targetHandle: targetParam
                          ? selectedEdge.targetHandle
                          : primaryKey
                            ? buildHandleId("input", primaryKey)
                            : selectedEdge.targetHandle,
                        label: buildEdgeLabel(flowKeys, "normal", null),
                        data: {
                          ...(selectedEdge.data ?? {}),
                          flow_keys: flowKeys,
                          flow_key: primaryKey,
                          edge_kind: "normal",
                          branch_label: null,
                        },
                      });
                    }}
                  />
                </label>
              </div>
            ) : null}

            {validationIssues.length > 0 ? (
              <section className="rounded-[20px] border border-[rgba(159,18,57,0.18)] bg-[rgba(255,245,247,0.9)] p-4">
                <div className="text-sm font-semibold text-[var(--danger)]">Validation Issues</div>
                <div className="mt-3 grid gap-2 text-sm text-[var(--danger)]">
                  {validationIssues.map((issue, index) => (
                    <div key={`${issue.code}-${index}`} className="rounded-2xl border border-[rgba(159,18,57,0.14)] px-3 py-2">
                      <div>{issue.message}</div>
                      {issue.path ? <div className="text-xs uppercase tracking-[0.08em]">{issue.path}</div> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {runDetail ? (
              <section className="rounded-[20px] border border-[rgba(31,111,80,0.18)] bg-[rgba(241,250,245,0.92)] p-4">
                <div className="text-sm font-semibold text-[var(--success)]">Run Result</div>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--text)]">
                  <div>Status: {runDetail.status}</div>
                  <div>Greeting: {String(runDetail.state_snapshot?.greeting ?? runDetail.final_result ?? "")}</div>
                  {runDetail.errors.length > 0 ? <div>Errors: {runDetail.errors.join(" | ")}</div> : null}
                  {runDetail.warnings.length > 0 ? <div>Warnings: {runDetail.warnings.join(" | ")}</div> : null}
                </div>
              </section>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-[18px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] px-3 py-2 text-sm text-[var(--muted)]">
            <span>Status</span>
            <span className="text-[var(--text)]">{statusMessage}</span>
          </div>
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.82)] px-4 text-sm text-[var(--muted)]">
        <span>{nodes.length} nodes / {edges.length} edges</span>
        <span>Wheel to zoom, drag canvas to pan, drag cards to create nodes.</span>
      </footer>
    </div>
  );
}

function splitCommaValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function EditorClient({ mode, initialGraph, graphId, templates }: EditorClientProps) {
  return <NodeSystemEditor mode={mode} initialGraph={initialGraph} graphId={graphId} templates={templates} />;
}
