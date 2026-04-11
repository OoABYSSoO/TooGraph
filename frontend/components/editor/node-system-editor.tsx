"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  MarkerType,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EMPTY_AGENT_PRESET, getNodePresetById, NODE_PRESETS_MOCK, TEXT_INPUT_PRESET } from "@/lib/node-presets-mock";
import {
  isValueTypeCompatible,
  type AgentNode,
  type BranchDefinition,
  type ConditionNode,
  type ConditionRule,
  type InputBoundaryNode,
  type NodePresetDefinition,
  type OutputBoundaryNode,
  type PortDefinition,
  type SkillAttachment,
  type ValueType,
} from "@/lib/node-system-schema";

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
};

type GraphPayload = {
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
  default_node_system_graph: Omit<GraphPayload, "graph_id">;
};

type EditorClientProps = {
  mode: "new" | "existing";
  initialGraph?: GraphPayload | null;
  graphId?: string;
  templates: TemplateRecord[];
  defaultTemplateId?: string;
};

type FlowNodeData = {
  nodeId: string;
  config: NodePresetDefinition;
  previewText: string;
  isExpanded?: boolean;
  connectingSourceType?: ValueType | null;
  onConfigChange?: (updater: (config: NodePresetDefinition) => NodePresetDefinition) => void;
  onResizeEnd?: (width: number, height: number) => void;
  onToggleExpanded?: () => void;
  onDelete?: () => void;
  onSavePreset?: () => void;
  skillDefinitions?: SkillDefinition[];
  skillDefinitionsLoading?: boolean;
  skillDefinitionsError?: string | null;
};

type FlowNode = Node<FlowNodeData>;

type SkillDefinitionField = {
  key: string;
  label: string;
  valueType: string;
  required: boolean;
  description: string;
};

type SkillDefinition = {
  skillKey: string;
  label: string;
  description: string;
  inputSchema: SkillDefinitionField[];
  outputSchema: SkillDefinitionField[];
  supportedValueTypes: string[];
  sideEffects: string[];
};

type RunOutputPreview = {
  node_id?: string;
  state_key?: string;
  label?: string;
  value?: unknown;
};

type RunNodeExecution = {
  node_id: string;
  status: string;
  errors?: string[];
};

type RunDetail = {
  run_id: string;
  status: string;
  final_result?: string | null;
  errors?: string[];
  artifacts: {
    exported_outputs?: RunOutputPreview[];
  };
  node_executions: RunNodeExecution[];
};

type PresetDocument = {
  presetId: string;
  sourcePresetId?: string | null;
  definition: NodePresetDefinition;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const HELLO_WORLD_TEMPLATE_ID = "hello_world";
const TYPE_COLORS: Record<ValueType, string> = {
  text: "#d97706",
  json: "#2563eb",
  image: "#0f766e",
  audio: "#7c3aed",
  video: "#be185d",
  file: "#475569",
  any: "#64748b",
};

const VALUE_TYPE_OPTIONS: ValueType[] = ["text", "json", "image", "audio", "video", "file", "any"];
const RULE_OPERATOR_OPTIONS: ConditionRule["operator"][] = ["==", "!=", ">=", "<=", ">", "<", "exists"];

const INPUT_VALUE_TYPE_OPTIONS: Array<{ value: ValueType; label: string; icon: ReactNode }> = [
  {
    value: "text",
    label: "Text",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <path d="M3 4.5h10M8 4.5v7M5.5 11.5h5" />
      </svg>
    ),
  },
  {
    value: "file",
    label: "File",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <path d="M5 2.5h4l2.5 2.5V12a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3.5 12V4A1.5 1.5 0 0 1 5 2.5Z" />
        <path d="M9 2.5V5h2.5" />
      </svg>
    ),
  },
];

function UploadedAssetActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,252,247,0.92)] text-[var(--text)] shadow-[0_10px_24px_rgba(154,52,18,0.14)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[rgba(154,52,18,0.28)] hover:text-[var(--accent)]"
    >
      {children}
    </button>
  );
}

type UploadedAssetEnvelope = {
  kind: "uploaded_file";
  name: string;
  mimeType: string;
  size: number;
  detectedType: ValueType;
  content: string;
  encoding: "text" | "data_url";
};

function detectInputValueTypeFromFileName(fileName: string): ValueType {
  const normalized = fileName.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(normalized)) return "image";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(normalized)) return "audio";
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(normalized)) return "video";
  if (/\.(txt|md|py|js|ts|tsx|jsx|json|yaml|yml|toml|csv|log|xml)$/.test(normalized)) return "file";
  return "file";
}

function tryParseUploadedAssetEnvelope(value: string): UploadedAssetEnvelope | null {
  try {
    const parsed = JSON.parse(value) as UploadedAssetEnvelope;
    if (parsed && parsed.kind === "uploaded_file" && typeof parsed.name === "string") {
      return parsed;
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
}

function renderUploadedAssetPreview(asset: UploadedAssetEnvelope, actions?: ReactNode) {
  if (asset.detectedType === "image" && asset.encoding === "data_url") {
    return (
      <div className="grid gap-3">
        <div className="group/uploaded-asset relative overflow-hidden rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)]">
          {actions ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex translate-y-1 gap-2 opacity-0 transition duration-150 group-hover/uploaded-asset:translate-y-0 group-hover/uploaded-asset:opacity-100 group-focus-within/uploaded-asset:translate-y-0 group-focus-within/uploaded-asset:opacity-100">
              {actions}
            </div>
          ) : null}
          <img src={asset.content} alt={asset.name} className="max-h-[240px] w-full object-contain bg-[rgba(248,242,234,0.8)]" />
        </div>
        <div className="text-xs leading-5 text-[var(--muted)]">{asset.name}</div>
      </div>
    );
  }

  if (asset.detectedType === "audio" && asset.encoding === "data_url") {
    return (
      <div className="grid gap-3">
        <div className="group/uploaded-asset relative rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)] p-3">
          {actions ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex translate-y-1 gap-2 opacity-0 transition duration-150 group-hover/uploaded-asset:translate-y-0 group-hover/uploaded-asset:opacity-100 group-focus-within/uploaded-asset:translate-y-0 group-focus-within/uploaded-asset:opacity-100">
              {actions}
            </div>
          ) : null}
          <audio controls className="w-full">
            <source src={asset.content} type={asset.mimeType} />
          </audio>
        </div>
        <div className="text-xs leading-5 text-[var(--muted)]">{asset.name}</div>
      </div>
    );
  }

  if (asset.detectedType === "video" && asset.encoding === "data_url") {
    return (
      <div className="grid gap-3">
        <div className="group/uploaded-asset relative overflow-hidden rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)]">
          {actions ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex translate-y-1 gap-2 opacity-0 transition duration-150 group-hover/uploaded-asset:translate-y-0 group-hover/uploaded-asset:opacity-100 group-focus-within/uploaded-asset:translate-y-0 group-focus-within/uploaded-asset:opacity-100">
              {actions}
            </div>
          ) : null}
          <video controls className="max-h-[240px] w-full bg-[rgba(248,242,234,0.8)]">
            <source src={asset.content} type={asset.mimeType} />
          </video>
        </div>
        <div className="text-xs leading-5 text-[var(--muted)]">{asset.name}</div>
      </div>
    );
  }

  if (asset.detectedType === "file") {
    return (
      <div className="grid gap-3">
        <div className="group/uploaded-asset relative rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)] p-3">
          {actions ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex translate-y-1 gap-2 opacity-0 transition duration-150 group-hover/uploaded-asset:translate-y-0 group-hover/uploaded-asset:opacity-100 group-focus-within/uploaded-asset:translate-y-0 group-focus-within/uploaded-asset:opacity-100">
              {actions}
            </div>
          ) : null}
          <div className="text-sm font-medium text-[var(--text)]">{asset.name}</div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {asset.mimeType} · {Math.max(1, Math.round(asset.size / 1024))} KB
          </div>
          {asset.encoding === "text" ? (
            <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-xs leading-5 text-[var(--text)]">
              {asset.content.slice(0, 3000)}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="group/uploaded-asset relative rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)] p-3">
        {actions ? (
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex translate-y-1 gap-2 opacity-0 transition duration-150 group-hover/uploaded-asset:translate-y-0 group-hover/uploaded-asset:opacity-100 group-focus-within/uploaded-asset:translate-y-0 group-focus-within/uploaded-asset:opacity-100">
            {actions}
          </div>
        ) : null}
        <div className="text-sm font-medium text-[var(--text)]">{asset.name}</div>
        <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
          {asset.detectedType} · {asset.mimeType} · {Math.max(1, Math.round(asset.size / 1024))} KB
        </div>
      </div>
    </div>
  );
}

function formatValueTypeLabel(valueType: ValueType) {
  switch (valueType) {
    case "image":
      return "Image";
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "file":
      return "File";
    case "json":
      return "JSON";
    case "any":
      return "Any";
    case "text":
    default:
      return "Text";
  }
}

async function fileToEnvelope(file: File): Promise<UploadedAssetEnvelope> {
  const detectedType = detectInputValueTypeFromFileName(file.name);
  const encoding = detectedType === "file" ? "text" : "data_url";
  const content =
    encoding === "text"
      ? await file.text()
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
          reader.readAsDataURL(file);
        });

  return {
    kind: "uploaded_file",
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    detectedType,
    content,
    encoding,
  };
}

function createEditorDefaults(templates: TemplateRecord[], defaultTemplateId?: string): GraphPayload {
  const preferredTemplate =
    templates.find((item) => item.template_id === defaultTemplateId) ??
    templates.find((item) => item.template_id === HELLO_WORLD_TEMPLATE_ID) ??
    templates[0];
  if (preferredTemplate) {
    return {
      ...preferredTemplate.default_node_system_graph,
      graph_id: null,
    };
  }

  return {
    graph_family: "node_system",
    graph_id: null,
    name: "Node System Playground",
    template_id: defaultTemplateId ?? HELLO_WORLD_TEMPLATE_ID,
    theme_config: {
      theme_preset: "node_system",
      domain: "workflow",
      genre: "agent_framework",
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
    state_schema: [],
    nodes: [],
    edges: [],
    metadata: {},
  };
}

function createFlowNodeFromGraphNode(node: any): FlowNode {
  const hasExplicitSize = typeof node.style?.width === "number" && typeof node.style?.height === "number";
  const config = deepClonePreset(node.data?.config as NodePresetDefinition);
  const defaultWidth = getDefaultNodeWidth(config);
  return {
    id: node.id,
    type: node.type ?? "default",
    position: node.position ?? { x: 0, y: 0 },
    data: {
      nodeId: node.data?.nodeId ?? node.id,
      config,
      previewText: node.data?.previewText ?? "",
      isExpanded: false,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: hasExplicitSize
      ? { background: "transparent", border: "none", padding: 0, width: node.style.width, height: node.style.height }
      : { background: "transparent", border: "none", padding: 0, width: defaultWidth ?? "auto" },
  } satisfies FlowNode;
}

function createFlowEdgeFromGraphEdge(edge: any, nodesById: Map<string, FlowNode>): Edge {
  const sourceNode = nodesById.get(edge.source);
  const sourceType = sourceNode ? getPortType(sourceNode.data.config, edge.sourceHandle) : "any";
  const color = TYPE_COLORS[sourceType ?? "any"];
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: {
      stroke: color,
      strokeWidth: 1.8,
    },
  } satisfies Edge;
}

function deepClonePreset<T extends NodePresetDefinition>(preset: T): T {
  return JSON.parse(JSON.stringify(preset)) as T;
}

function buildHandleId(side: "input" | "output", key: string) {
  return `${side}:${key}`;
}

const CREATE_INPUT_PORT_KEY = "__create__";

function getPortKeyFromHandle(handleId?: string | null) {
  if (!handleId) return null;
  const [, key] = handleId.split(":");
  return key ?? null;
}

function getPortType(config: NodePresetDefinition, handleId?: string | null): ValueType | null {
  const key = getPortKeyFromHandle(handleId);
  if (!key) return null;

  if (config.family === "input") {
    return handleId?.startsWith("output:") && config.output.key === key ? config.output.valueType : null;
  }
  if (config.family === "output") {
    return handleId?.startsWith("input:") && config.input.key === key ? config.input.valueType : null;
  }
  if (config.family === "agent") {
    if (handleId?.startsWith("input:") && key === CREATE_INPUT_PORT_KEY) return "any";
    if (handleId?.startsWith("input:")) return config.inputs.find((item) => item.key === key)?.valueType ?? null;
    if (handleId?.startsWith("output:")) return config.outputs.find((item) => item.key === key)?.valueType ?? null;
  }
  if (config.family === "condition") {
    if (handleId?.startsWith("input:") && key === CREATE_INPUT_PORT_KEY) return "any";
    if (handleId?.startsWith("input:")) return config.inputs.find((item) => item.key === key)?.valueType ?? null;
    if (handleId?.startsWith("output:")) return "any";
  }
  return null;
}

function listInputPorts(config: NodePresetDefinition) {
  if (config.family === "agent") return config.inputs;
  if (config.family === "condition") return config.inputs;
  if (config.family === "output") return [config.input];
  return [] as PortDefinition[];
}

function listOutputPorts(config: NodePresetDefinition) {
  if (config.family === "agent") return config.outputs;
  if (config.family === "input") return [config.output];
  if (config.family === "condition") {
    return config.branches.map((branch) => ({ key: branch.key, label: branch.label, valueType: "any" as const }));
  }
  return [] as PortDefinition[];
}

function findFirstCompatibleInputHandle(config: NodePresetDefinition, sourceType: ValueType) {
  const inputPort = listInputPorts(config).find((port) => isValueTypeCompatible(sourceType, port.valueType));
  return inputPort ? buildHandleId("input", inputPort.key) : null;
}

function createPortKey(base: string, existingPorts: PortDefinition[]) {
  const normalizedBase = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "input";
  let nextKey = normalizedBase;
  let index = 2;
  const existingKeys = new Set(existingPorts.map((port) => port.key));
  while (existingKeys.has(nextKey)) {
    nextKey = `${normalizedBase}_${index}`;
    index += 1;
  }
  return nextKey;
}

function createAutoInputPort(existingPorts: PortDefinition[], sourceType: ValueType): PortDefinition {
  const typeLabel = formatValueTypeLabel(sourceType);
  return {
    key: createPortKey(`${sourceType}_input`, existingPorts),
    label: typeLabel,
    valueType: sourceType,
    required: true,
  };
}

function createDefaultPort(side: "input" | "output", existingPorts: PortDefinition[]): PortDefinition {
  const index = existingPorts.length + 1;
  const typeLabel = "Text";
  return {
    key: createPortKey(side === "input" ? `input_${index}` : `output_${index}`, existingPorts),
    label: side === "input" ? `${typeLabel} Input` : `${typeLabel} Output`,
    valueType: "text",
    ...(side === "input" ? { required: false } : {}),
  };
}

function summarizeNode(config: NodePresetDefinition) {
  if (config.family === "input") {
    return config.placeholder || "Inline input boundary";
  }
  if (config.family === "agent") {
    return config.description || config.taskInstruction || "Configure this agent node.";
  }
  if (config.family === "condition") {
    return `${config.rule.source} ${config.rule.operator} ${String(config.rule.value)}`;
  }
  return "Preview or persist an upstream output.";
}

function createPreviewText(node: FlowNode, nodes: FlowNode[], edges: Edge[]) {
  if (node.data.config.family !== "output") {
    return "";
  }

  const incoming = edges.find((edge) => edge.target === node.id);
  if (!incoming) {
    return "";
  }

  const sourceNode = nodes.find((candidate) => candidate.id === incoming.source);
  if (!sourceNode) {
    return "";
  }

  const sourcePortKey = getPortKeyFromHandle(incoming.sourceHandle);
  const config = sourceNode.data.config;

  if (config.family === "input" && sourcePortKey === config.output.key) {
    return config.defaultValue;
  }

  return `Connected to ${config.label}.${sourcePortKey ?? "value"}`;
}

function formatPreviewValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function JsonTextArea({
  label,
  value,
  onChange,
  minHeight = "min-h-28",
}: {
  label: string;
  value: unknown;
  onChange: (nextValue: unknown) => void;
  minHeight?: string;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
      <span>{label}</span>
      <textarea
        className={cn(minHeight, "rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 font-mono text-[0.82rem] text-[var(--text)]")}
        value={text}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          try {
            onChange(JSON.parse(nextText));
          } catch {
            // allow invalid intermediate JSON while preserving local editing state
          }
        }}
      />
    </label>
  );
}

function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
          {description ? <div className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</div> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function MappingEditor({
  title,
  value,
  onChange,
  addLabel,
}: {
  title: string;
  value: Record<string, string>;
  onChange: (nextValue: Record<string, string>) => void;
  addLabel: string;
}) {
  const entries = Object.entries(value);

  return (
    <PanelSection title={title}>
      {entries.map(([entryKey, entryValue], index) => (
        <div key={`${entryKey}-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.72)] p-3">
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Key</span>
            <Input
              value={entryKey}
              onChange={(event) => {
                const nextEntries = [...entries];
                nextEntries[index] = [event.target.value, entryValue];
                onChange(Object.fromEntries(nextEntries));
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Value</span>
            <Input
              value={entryValue}
              onChange={(event) => {
                const nextEntries = [...entries];
                nextEntries[index] = [entryKey, event.target.value];
                onChange(Object.fromEntries(nextEntries));
              }}
            />
          </label>
          <div className="flex items-end justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                const nextEntries = entries.filter((_, entryIndex) => entryIndex !== index);
                onChange(Object.fromEntries(nextEntries));
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <div className="flex justify-start">
        <Button
          variant="ghost"
          onClick={() => {
            const nextKey = `key_${entries.length + 1}`;
            onChange({
              ...value,
              [nextKey]: "",
            });
          }}
        >
          {addLabel}
        </Button>
      </div>
    </PanelSection>
  );
}

function SkillEditorList({
  skills,
  onChange,
  definitions,
  definitionsLoading,
  definitionsError,
}: {
  skills: SkillAttachment[];
  onChange: (nextSkills: SkillAttachment[]) => void;
  definitions: SkillDefinition[];
  definitionsLoading: boolean;
  definitionsError: string | null;
}) {
  const definitionOptions = definitions.map((definition) => definition.skillKey);

  function updateSkill(index: number, updater: (skill: SkillAttachment) => SkillAttachment) {
    onChange(skills.map((item, skillIndex) => (skillIndex === index ? updater(item) : item)));
  }

  return (
    <PanelSection title="Skills" description="以结构化方式编辑技能挂载与映射。">
      <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.64)] px-3 py-2 text-sm leading-6 text-[var(--muted)]">
        {definitionsLoading ? "Loading skill definitions..." : definitionsError ? `Skill definitions unavailable: ${definitionsError}` : `Loaded ${definitions.length} skill definitions.`}
      </div>
      {skills.map((skill, index) => (
        <div key={`${skill.name}-${index}`} className="grid gap-3 rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.72)] p-3">
          {(() => {
            const definition = definitions.find((item) => item.skillKey === skill.skillKey);
            const skillKeyOptions = skill.skillKey && !definitionOptions.includes(skill.skillKey) ? [skill.skillKey, ...definitionOptions] : definitionOptions;

            return (
              <>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Name</span>
              <Input
                value={skill.name}
                onChange={(event) => updateSkill(index, (currentSkill) => ({ ...currentSkill, name: event.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Skill Key</span>
              <select
                className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                value={skill.skillKey}
                onChange={(event) =>
                  updateSkill(index, (currentSkill) => {
                    const selectedDefinition = definitions.find((item) => item.skillKey === event.target.value);
                    return {
                      ...currentSkill,
                      skillKey: event.target.value,
                      name:
                        currentSkill.name === "" ||
                        currentSkill.name === currentSkill.skillKey ||
                        currentSkill.name.startsWith("skill_")
                          ? selectedDefinition?.label ?? event.target.value
                          : currentSkill.name,
                    };
                  })
                }
              >
                <option value="">Select a skill</option>
                {skillKeyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {definition ? (
            <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.72)] px-3 py-3 text-sm leading-6 text-[var(--muted)]">
              <div className="font-medium text-[var(--text)]">{definition.label}</div>
              <div>{definition.description}</div>
              <div className="mt-2">Supported Value Types: {definition.supportedValueTypes.join(", ") || "n/a"}</div>
              <div>Side Effects: {definition.sideEffects.join(", ") || "none"}</div>
              <div className="mt-2">Inputs: {definition.inputSchema.map((field) => `${field.key}:${field.valueType}`).join(", ") || "none"}</div>
              <div>Outputs: {definition.outputSchema.map((field) => `${field.key}:${field.valueType}`).join(", ") || "none"}</div>
            </div>
          ) : skill.skillKey ? (
            <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.72)] px-3 py-3 text-sm leading-6 text-[var(--muted)]">
              No registered definition found for `{skill.skillKey}`. You can still keep editing mappings, or use Advanced JSON as fallback.
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Usage</span>
              <select
                className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                value={skill.usage ?? "optional"}
                onChange={(event) =>
                  updateSkill(index, (currentSkill) => ({ ...currentSkill, usage: event.target.value as SkillAttachment["usage"] }))
                }
              >
                {["required", "optional"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <MappingEditor
            title="Input Mapping"
            value={skill.inputMapping}
            addLabel="Add Input Mapping"
            onChange={(nextValue) => updateSkill(index, (currentSkill) => ({ ...currentSkill, inputMapping: nextValue }))}
          />
          <MappingEditor
            title="Context Binding"
            value={skill.contextBinding}
            addLabel="Add Context Binding"
            onChange={(nextValue) => updateSkill(index, (currentSkill) => ({ ...currentSkill, contextBinding: nextValue }))}
          />
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => onChange(skills.filter((_, skillIndex) => skillIndex !== index))}>
              Remove Skill
            </Button>
          </div>
              </>
            );
          })()}
        </div>
      ))}
      <div className="flex justify-start">
        <Button
          variant="ghost"
          onClick={() =>
            onChange(
              skills.concat({
                name: `skill_${skills.length + 1}`,
                skillKey: "",
                inputMapping: {},
                contextBinding: {},
                usage: "optional",
              }),
            )
          }
        >
          Add Skill
        </Button>
      </div>
    </PanelSection>
  );
}

function BranchEditorList({
  branches,
  onChange,
}: {
  branches: BranchDefinition[];
  onChange: (nextBranches: BranchDefinition[]) => void;
}) {
  return (
    <PanelSection title="Branches" description="通过增删行维护条件分支定义。">
      {branches.map((branch, index) => (
        <div key={`${branch.key}-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.72)] p-3">
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Key</span>
            <Input
              value={branch.key}
              onChange={(event) =>
                onChange(branches.map((item, branchIndex) => (branchIndex === index ? { ...item, key: event.target.value } : item)))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Label</span>
            <Input
              value={branch.label}
              onChange={(event) =>
                onChange(branches.map((item, branchIndex) => (branchIndex === index ? { ...item, label: event.target.value } : item)))
              }
            />
          </label>
          <div className="flex items-end justify-end">
            <Button variant="ghost" onClick={() => onChange(branches.filter((_, branchIndex) => branchIndex !== index))}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      <div className="flex justify-start">
        <Button
          variant="ghost"
          onClick={() =>
            onChange(
              branches.concat({
                key: `branch_${branches.length + 1}`,
                label: `Branch ${branches.length + 1}`,
              }),
            )
          }
        >
          Add Branch
        </Button>
      </div>
    </PanelSection>
  );
}

function RuleEditor({
  rule,
  onChange,
}: {
  rule: ConditionRule;
  onChange: (nextRule: ConditionRule) => void;
}) {
  return (
    <PanelSection title="Rule" description="配置条件节点的判断规则。">
      <label className="grid gap-1.5 text-sm text-[var(--muted)]">
        <span>Source</span>
        <Input value={rule.source} onChange={(event) => onChange({ ...rule, source: event.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
          <span>Operator</span>
          <select
            className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
            value={rule.operator}
            onChange={(event) => onChange({ ...rule, operator: event.target.value as ConditionRule["operator"] })}
          >
            {RULE_OPERATOR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
          <span>Value</span>
          <Input
            value={String(rule.value)}
            onChange={(event) => onChange({ ...rule, value: event.target.value })}
            disabled={rule.operator === "exists"}
          />
        </label>
      </div>
    </PanelSection>
  );
}

function AdvancedJsonSection({
  sections,
}: {
  sections: Array<{
    label: string;
    value: unknown;
    onChange: (nextValue: unknown) => void;
    minHeight?: string;
  }>;
}) {
  return (
    <details className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.7)] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--text)]">Advanced JSON</summary>
      <div className="mt-4 grid gap-3">
        {sections.map((section) => (
          <JsonTextArea
            key={section.label}
            label={section.label}
            value={section.value}
            onChange={section.onChange}
            minHeight={section.minHeight}
          />
        ))}
      </div>
    </details>
  );
}

function PortRow({
  nodeId,
  port,
  side,
  editable = false,
  onRename,
  portEditor,
}: {
  nodeId: string;
  port: PortDefinition;
  side: "input" | "output";
  editable?: boolean;
  onRename?: (nextLabel: string) => void;
  portEditor?: {
    onChange: (nextPort: PortDefinition) => void;
    onRemove?: () => void;
  };
}) {
  const color = TYPE_COLORS[port.valueType];
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(port.label);
  const [isEditingPortConfig, setIsEditingPortConfig] = useState(false);
  const [draftPort, setDraftPort] = useState<PortDefinition>(port);

  useEffect(() => {
    setDraftLabel(port.label);
    setDraftPort(port);
  }, [port]);

  function startEditing() {
    if (portEditor) {
      setDraftPort(port);
      setIsEditingPortConfig(true);
      return;
    }
    if (!editable) return;
    setDraftLabel(port.label);
    setIsEditing(true);
  }

  function commitEditing() {
    const nextLabel = draftLabel.trim();
    if (nextLabel && nextLabel !== port.label) {
      onRename?.(nextLabel);
    }
    setIsEditing(false);
  }

  function commitPortEditing() {
    const nextLabel = draftPort.label.trim();
    const nextKey = draftPort.key.trim();
    if (!nextLabel || !nextKey) {
      setDraftPort(port);
      setIsEditingPortConfig(false);
      return;
    }
    portEditor?.onChange({
      ...draftPort,
      label: nextLabel,
      key: nextKey,
    });
    setIsEditingPortConfig(false);
  }

  return (
    <div className={cn("group relative flex min-h-6 items-center text-[0.9rem] text-[var(--text)]", side === "input" ? "justify-start" : "justify-end")}>
      {side === "input" ? (
        <>
          <Handle
            id={buildHandleId("input", port.key)}
            type="target"
            position={Position.Left}
            className="!left-[-7px] !top-1/2 !m-0 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-[rgba(255,250,241,0.96)]"
            style={{ backgroundColor: color }}
            isConnectable
          />
          <span className="ml-2 truncate cursor-text" onDoubleClick={startEditing}>
            {port.label}
          </span>
          {isEditing ? (
            <div className="absolute left-5 top-full z-20 mt-2 w-[220px] rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-2 shadow-[0_14px_32px_rgba(60,41,20,0.14)]">
              <Input
                className="h-9"
                value={draftLabel}
                autoFocus
                onChange={(event) => setDraftLabel(event.target.value)}
                onBlur={commitEditing}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitEditing();
                  if (event.key === "Escape") {
                    setDraftLabel(port.label);
                    setIsEditing(false);
                  }
                }}
              />
            </div>
          ) : null}
          {isEditingPortConfig ? (
            <div className="absolute left-5 top-full z-20 mt-2 w-[260px] rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-3 shadow-[0_14px_32px_rgba(60,41,20,0.14)]">
              <div className="grid gap-3">
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  <span>Key</span>
                  <Input value={draftPort.key} onChange={(event) => setDraftPort((current) => ({ ...current, key: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  <span>Label</span>
                  <Input value={draftPort.label} onChange={(event) => setDraftPort((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  <span>Value Type</span>
                  <select
                    className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-2 text-[var(--text)]"
                    value={draftPort.valueType}
                    onChange={(event) => setDraftPort((current) => ({ ...current, valueType: event.target.value as ValueType }))}
                  >
                    {VALUE_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                {side === "input" ? (
                  <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <input
                      checked={Boolean(draftPort.required)}
                      type="checkbox"
                      onChange={(event) => setDraftPort((current) => ({ ...current, required: event.target.checked }))}
                    />
                    <span>Required</span>
                  </label>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDraftPort(port);
                      setIsEditingPortConfig(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <div className="flex items-center gap-2">
                    {portEditor?.onRemove ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          portEditor.onRemove?.();
                          setIsEditingPortConfig(false);
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={commitPortEditing}>
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <span className="truncate text-right cursor-text" onDoubleClick={startEditing}>
            {port.label}
          </span>
          {isEditing ? (
            <div className="absolute right-5 top-full z-20 mt-2 w-[220px] rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-2 shadow-[0_14px_32px_rgba(60,41,20,0.14)]">
              <Input
                className="h-9 text-right"
                value={draftLabel}
                autoFocus
                onChange={(event) => setDraftLabel(event.target.value)}
                onBlur={commitEditing}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitEditing();
                  if (event.key === "Escape") {
                    setDraftLabel(port.label);
                    setIsEditing(false);
                  }
                }}
              />
            </div>
          ) : null}
          {isEditingPortConfig ? (
            <div className="absolute right-5 top-full z-20 mt-2 w-[260px] rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-3 shadow-[0_14px_32px_rgba(60,41,20,0.14)]">
              <div className="grid gap-3">
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  <span>Key</span>
                  <Input value={draftPort.key} onChange={(event) => setDraftPort((current) => ({ ...current, key: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  <span>Label</span>
                  <Input value={draftPort.label} onChange={(event) => setDraftPort((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-xs text-[var(--muted)]">
                  <span>Value Type</span>
                  <select
                    className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-2 text-[var(--text)]"
                    value={draftPort.valueType}
                    onChange={(event) => setDraftPort((current) => ({ ...current, valueType: event.target.value as ValueType }))}
                  >
                    {VALUE_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDraftPort(port);
                      setIsEditingPortConfig(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <div className="flex items-center gap-2">
                    {portEditor?.onRemove ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          portEditor.onRemove?.();
                          setIsEditingPortConfig(false);
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={commitPortEditing}>
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <Handle
            id={buildHandleId("output", port.key)}
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

function PortCreateButton({
  side,
  visible,
  initialPort,
  onCreate,
}: {
  side: "input" | "output";
  visible: boolean;
  initialPort: PortDefinition;
  onCreate: (port: PortDefinition) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftPort, setDraftPort] = useState<PortDefinition>(initialPort);

  function openEditor() {
    setDraftPort(initialPort);
    setIsOpen(true);
  }

  function closeEditor() {
    setIsOpen(false);
  }

  function commit() {
    const nextKey = draftPort.key.trim();
    const nextLabel = draftPort.label.trim();
    if (!nextKey || !nextLabel) return;
    onCreate({
      ...draftPort,
      key: nextKey,
      label: nextLabel,
    });
    setIsOpen(false);
  }

  return (
    <div className={cn("group relative flex min-h-6 items-center", side === "input" ? "justify-start" : "justify-end")}>
      <button
        type="button"
        className={cn(
          "relative inline-flex max-w-full items-center text-sm text-[var(--muted)] transition",
          side === "input" ? "-ml-[7px] justify-start pl-[7px] text-left" : "-mr-[7px] justify-end pr-[7px] text-right",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={openEditor}
      >
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.96)]",
            side === "input" ? "left-0" : "right-0",
          )}
        >
          <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent-strong)]" />
          <span className="absolute left-1/2 top-1/2 h-[7px] w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent-strong)]" />
        </span>
        <span
          className={cn(
            "relative inline-flex min-h-7 max-w-full items-center rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,252,247,0.92)] shadow-[0_8px_18px_rgba(60,41,20,0.06)] transition hover:border-[rgba(154,52,18,0.24)] hover:bg-[rgba(255,248,240,0.92)] hover:text-[var(--accent)]",
            side === "input" ? "ml-2 pl-5 pr-3" : "mr-2 pl-3 pr-5",
          )}
        >
          <span>{side === "input" ? "Add input" : "Add output"}</span>
        </span>
      </button>
      {isOpen ? (
        <div
          className={cn(
            "absolute top-full z-20 mt-2 w-[260px] rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-3 shadow-[0_14px_32px_rgba(60,41,20,0.14)]",
            side === "input" ? "left-5" : "right-5",
          )}
        >
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              <span>Key</span>
              <Input value={draftPort.key} onChange={(event) => setDraftPort((current) => ({ ...current, key: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              <span>Label</span>
              <Input value={draftPort.label} onChange={(event) => setDraftPort((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              <span>Value Type</span>
              <select
                className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-2 text-[var(--text)]"
                value={draftPort.valueType}
                onChange={(event) => setDraftPort((current) => ({ ...current, valueType: event.target.value as ValueType }))}
              >
                {VALUE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {side === "input" ? (
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  checked={Boolean(draftPort.required)}
                  type="checkbox"
                  onChange={(event) => setDraftPort((current) => ({ ...current, required: event.target.checked }))}
                />
                <span>Required</span>
              </label>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={closeEditor}>
                Cancel
              </Button>
              <Button variant="ghost" onClick={commit}>
                Create
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getNodeMinHeight(config: NodePresetDefinition, isExpanded: boolean) {
  if (config.family === "input") {
    return 320;
  }
  if (config.family === "output") {
    return isExpanded ? 280 : 240;
  }
  if (config.family === "agent") {
    return isExpanded ? 420 : 280;
  }
  if (config.family === "condition") {
    return isExpanded ? 340 : 240;
  }
  return 180;
}

const DEFAULT_NODE_WIDTH = 360;

function getDefaultNodeWidth(_config: NodePresetDefinition) {
  return DEFAULT_NODE_WIDTH;
}

function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config;
  const inputs = listInputPorts(config);
  const outputs = listOutputPorts(config);
  const isInputNode = config.family === "input";
  const isCollapsible = config.family !== "input";
  const isExpanded = config.family === "input" ? true : Boolean(data.isExpanded);
  const minHeight = getNodeMinHeight(config, isExpanded);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isHoveringNode, setIsHoveringNode] = useState(false);
  const [isResizingNode, setIsResizingNode] = useState(false);
  const [draftLabel, setDraftLabel] = useState(config.label);
  const [draftDescription, setDraftDescription] = useState(config.description);
  const [isDeleteConfirmActive, setIsDeleteConfirmActive] = useState(false);
  const deleteConfirmTimeoutRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedAsset = config.family === "input" ? tryParseUploadedAssetEnvelope(config.defaultValue) : null;

  useEffect(() => {
    setDraftLabel(config.label);
  }, [config.label]);

  useEffect(() => {
    setDraftDescription(config.description);
  }, [config.description]);

  useEffect(() => {
    if (selected) return;
    setIsDeleteConfirmActive(false);
  }, [selected]);

  useEffect(() => {
    return () => {
      if (deleteConfirmTimeoutRef.current) {
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      }
    };
  }, []);

  function showNodeResizeHandles() {
    setIsHoveringNode(true);
  }

  function hideNodeResizeHandles() {
    if (isResizingNode) return;
    setIsHoveringNode(false);
  }

  function clearDeleteConfirmState() {
    if (deleteConfirmTimeoutRef.current) {
      window.clearTimeout(deleteConfirmTimeoutRef.current);
      deleteConfirmTimeoutRef.current = null;
    }
    setIsDeleteConfirmActive(false);
  }

  function startDeleteConfirmWindow() {
    if (deleteConfirmTimeoutRef.current) {
      window.clearTimeout(deleteConfirmTimeoutRef.current);
    }
    setIsDeleteConfirmActive(true);
    deleteConfirmTimeoutRef.current = window.setTimeout(() => {
      deleteConfirmTimeoutRef.current = null;
      setIsDeleteConfirmActive(false);
    }, 2000);
  }

  function commitLabelEdit() {
    const nextLabel = draftLabel.trim();
    if (nextLabel && nextLabel !== config.label) {
      data.onConfigChange?.((currentConfig) => ({ ...currentConfig, label: nextLabel }));
    }
    setIsEditingLabel(false);
  }

  function commitDescriptionEdit() {
    const nextDescription = draftDescription.trim();
    if (nextDescription !== config.description) {
      data.onConfigChange?.((currentConfig) => ({ ...currentConfig, description: nextDescription }));
    }
    setIsEditingDescription(false);
  }

  async function handleInputFileSelection(file: File | null) {
    if (!file || config.family !== "input") return;
    const envelope = await fileToEnvelope(file);
    data.onConfigChange?.((currentConfig) => ({
      ...(currentConfig as InputBoundaryNode),
      valueType: envelope.detectedType,
      output: {
        ...(currentConfig as InputBoundaryNode).output,
        valueType: envelope.detectedType,
      },
      defaultValue: JSON.stringify(envelope),
    }));
  }

  function updateNodePort(side: "input" | "output", portIndex: number, nextPort: PortDefinition) {
    data.onConfigChange?.((currentConfig) => {
      if (currentConfig.family === "agent") {
        const nextPorts = side === "input" ? [...currentConfig.inputs] : [...currentConfig.outputs];
        nextPorts[portIndex] = nextPort;
        return side === "input"
          ? { ...currentConfig, inputs: nextPorts }
          : { ...currentConfig, outputs: nextPorts };
      }
      if (currentConfig.family === "condition" && side === "input") {
        const nextPorts = [...currentConfig.inputs];
        nextPorts[portIndex] = nextPort;
        return { ...currentConfig, inputs: nextPorts };
      }
      return currentConfig;
    });
  }

  function removeNodePort(side: "input" | "output", portIndex: number) {
    data.onConfigChange?.((currentConfig) => {
      if (currentConfig.family === "agent") {
        const nextPorts = (side === "input" ? currentConfig.inputs : currentConfig.outputs).filter((_, index) => index !== portIndex);
        return side === "input"
          ? { ...currentConfig, inputs: nextPorts }
          : { ...currentConfig, outputs: nextPorts };
      }
      if (currentConfig.family === "condition" && side === "input") {
        return { ...currentConfig, inputs: currentConfig.inputs.filter((_, index) => index !== portIndex) };
      }
      return currentConfig;
    });
  }

  function addNodePort(side: "input" | "output", port: PortDefinition) {
    data.onConfigChange?.((currentConfig) => {
      if (currentConfig.family === "agent") {
        return side === "input"
          ? { ...currentConfig, inputs: [...currentConfig.inputs, port] }
          : { ...currentConfig, outputs: [...currentConfig.outputs, port] };
      }
      if (currentConfig.family === "condition" && side === "input") {
        return { ...currentConfig, inputs: [...currentConfig.inputs, port] };
      }
      return currentConfig;
    });
  }

  return (
    <>
      <div className="relative h-full" onPointerEnter={showNodeResizeHandles} onPointerLeave={hideNodeResizeHandles}>
        <div className="absolute inset-[-14px]" />
        <NodeResizer
          isVisible={selected || isHoveringNode || isResizingNode}
          minWidth={160}
          minHeight={minHeight}
          handleStyle={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)", border: "none" }}
          lineStyle={{ borderColor: "var(--accent)", borderWidth: 1 }}
          onResizeStart={() => {
            showNodeResizeHandles();
            setIsResizingNode(true);
          }}
          onResizeEnd={(_event, params) => {
            setIsResizingNode(false);
            data.onResizeEnd?.(params.width, params.height);
          }}
        />
        <div
          data-node-card="true"
          className={cn(
            "group/node relative z-10 flex h-full min-w-[160px] flex-col overflow-hidden rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
            selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
          )}
          onDoubleClickCapture={(event) => {
          if (!isCollapsible || isExpanded) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest("button, input, textarea, select, summary, [data-delete-surface='true']")) return;
          event.preventDefault();
          event.stopPropagation();
          data.onToggleExpanded?.();
          }}
          onClickCapture={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("[data-delete-surface='true']")) return;
          if (isDeleteConfirmActive) {
            clearDeleteConfirmState();
          }
          }}
        >
        <button
          type="button"
          aria-label={isDeleteConfirmActive ? "确认删除节点" : "删除节点"}
          title={isDeleteConfirmActive ? "确认删除节点" : "删除节点"}
          data-delete-surface="true"
          className={cn(
            "absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full shadow-[0_10px_24px_rgba(60,41,20,0.08)] transition hover:border-[rgba(154,52,18,0.28)] hover:bg-[rgba(255,248,240,0.92)]",
            selected || isDeleteConfirmActive ? "opacity-100" : "opacity-0 group-hover/node:opacity-100",
            isDeleteConfirmActive
              ? "border border-[rgba(185,28,28,0.28)] bg-[rgb(185,28,28)] text-white"
              : "border border-[rgba(154,52,18,0.14)] bg-[rgba(255,252,247,0.92)] text-[var(--muted)] hover:border-[rgba(154,52,18,0.24)] hover:text-[var(--accent)]",
          )}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isDeleteConfirmActive) {
              clearDeleteConfirmState();
              data.onDelete?.();
              return;
            }
            startDeleteConfirmWindow();
          }}
        >
          {isDeleteConfirmActive ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7">
              <path d="m4.5 8 2.25 2.25L11.5 5.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5">
              <path d="M3.5 4.5h9" />
              <path d="M6.5 2.75h3" />
              <path d="M5 4.5V12a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4.5" />
              <path d="M6.75 6.5v4" />
              <path d="M9.25 6.5v4" />
            </svg>
          )}
        </button>
        {isDeleteConfirmActive ? (
          <div className="pointer-events-none absolute right-3 top-3 z-30 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-full border border-[rgba(185,28,28,0.16)] bg-[rgba(255,248,248,0.96)] px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-[rgb(153,27,27)] shadow-[0_10px_24px_rgba(127,29,29,0.12)]">
            Delete node?
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(154,52,18,0.12)] pl-4 pr-14 py-3">
          <div className="min-w-0 flex-1">
            <div className="relative flex min-w-0 items-center gap-2">
              <span className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.72)] px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--accent-strong)]">
                {config.family}
              </span>
              <div className="truncate text-sm font-semibold text-[var(--text)] cursor-text" onDoubleClick={() => setIsEditingLabel(true)}>
                {config.label}
              </div>
              {isEditingLabel ? (
                <div className="absolute left-0 top-full z-20 mt-2 w-[260px] rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-2 shadow-[0_14px_32px_rgba(60,41,20,0.14)]">
                  <Input
                    className="h-9"
                    value={draftLabel}
                    autoFocus
                    onChange={(event) => setDraftLabel(event.target.value)}
                    onBlur={commitLabelEdit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitLabelEdit();
                      if (event.key === "Escape") {
                        setDraftLabel(config.label);
                        setIsEditingLabel(false);
                      }
                    }}
                  />
                </div>
              ) : null}
            </div>
            {config.family !== "agent" ? (
              <div className="relative mt-1">
                <div className="line-clamp-2 text-xs leading-5 text-[var(--muted)] cursor-text" onDoubleClick={() => setIsEditingDescription(true)}>
                  {config.description || summarizeNode(config)}
                </div>
                {isEditingDescription ? (
                  <div className="absolute left-0 top-full z-20 mt-2 w-[320px] rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-2 shadow-[0_14px_32px_rgba(60,41,20,0.14)]">
                    <Input
                      className="h-9"
                      value={draftDescription}
                      autoFocus
                      onChange={(event) => setDraftDescription(event.target.value)}
                      onBlur={commitDescriptionEdit}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitDescriptionEdit();
                        if (event.key === "Escape") {
                          setDraftDescription(config.description);
                          setIsEditingDescription(false);
                        }
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {isCollapsible ? (
              <button
                type="button"
                aria-label={isExpanded ? "折叠节点" : "展开节点"}
                title={isExpanded ? "折叠节点" : "展开节点"}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full border border-[rgba(154,52,18,0.14)] bg-[rgba(255,252,247,0.92)] text-[var(--muted)] shadow-[0_10px_24px_rgba(60,41,20,0.08)] transition hover:border-[rgba(154,52,18,0.24)] hover:bg-[rgba(255,248,240,0.92)] hover:text-[var(--accent)]",
                  selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100",
                )}
                onClick={() => data.onToggleExpanded?.()}
              >
                <svg
                  viewBox="0 0 16 16"
                  className={cn("h-4 w-4 fill-none stroke-current transition-transform", isExpanded ? "" : "rotate-180")}
                  strokeWidth="1.6"
                >
                  <path d="m4.5 10 3.5-4 3.5 4" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
          {config.family === "input" ? (
            <>
              <div className={cn("grid items-center gap-3", uploadedAsset ? "grid-cols-[1fr_auto]" : "grid-cols-[minmax(0,1fr)_auto]")}>
                {!uploadedAsset ? (
                  <div className="flex flex-wrap gap-2">
                    {INPUT_VALUE_TYPE_OPTIONS.map((option) => {
                      const active = config.valueType === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          title={option.label}
                          aria-label={option.label}
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                            active
                              ? "border-[var(--accent)] bg-[rgba(154,52,18,0.12)] text-[var(--accent-strong)]"
                              : "border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.72)] text-[var(--muted)] hover:bg-[rgba(255,248,240,0.92)]",
                          )}
                          onClick={() =>
                            data.onConfigChange?.((currentConfig) => {
                              const currentInput = currentConfig as InputBoundaryNode;
                              return {
                                ...currentInput,
                                valueType: option.value,
                                output: {
                                  ...currentInput.output,
                                  valueType: option.value,
                                },
                              };
                            })
                          }
                        >
                          {option.icon}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs leading-5 text-[var(--muted)]">
                    Uploaded asset locked this input as <span className="font-medium text-[var(--text)]">{uploadedAsset.detectedType}</span>.
                  </div>
                )}
                <div className="grid gap-1">
                  {outputs.map((port) => (
                    <PortRow
                      key={`output-${port.key}`}
                      nodeId={data.nodeId}
                      port={port}
                      side="output"
                      editable
                      onRename={(nextLabel) =>
                        data.onConfigChange?.((currentConfig) => ({
                          ...(currentConfig as InputBoundaryNode),
                          output: {
                            ...(currentConfig as InputBoundaryNode).output,
                            label: nextLabel,
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {config.valueType === "text" ? (
                  <textarea
                    value={config.defaultValue}
                    rows={5}
                    placeholder={config.placeholder}
                    onChange={(event) =>
                      data.onConfigChange?.((currentConfig) => ({
                        ...(currentConfig as InputBoundaryNode),
                        defaultValue: event.target.value,
                      }))
                    }
                    className="min-h-[160px] h-full flex-1 resize-none rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3 py-3 text-sm text-[var(--text)]"
                  />
                ) : (
                  <>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void handleInputFileSelection(file);
                        event.currentTarget.value = "";
                      }}
                    />
                    {!uploadedAsset ? (
                      <button
                        type="button"
                        className="grid min-h-[160px] flex-1 place-items-center rounded-[16px] border border-dashed border-[rgba(154,52,18,0.24)] bg-[rgba(255,255,255,0.82)] px-4 py-5 text-center"
                        onClick={() => uploadInputRef.current?.click()}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const file = event.dataTransfer.files?.[0] ?? null;
                          void handleInputFileSelection(file);
                        }}
                      >
                        <div className="grid gap-2">
                          <div className="text-sm font-medium text-[var(--text)]">Drop file here</div>
                          <div className="text-xs leading-5 text-[var(--muted)]">Or click to choose a file from your device.</div>
                        </div>
                      </button>
                    ) : (
                      <div
                        className="grid min-h-[160px] flex-1 gap-3 text-left"
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const file = event.dataTransfer.files?.[0] ?? null;
                          void handleInputFileSelection(file);
                        }}
                      >
                        {renderUploadedAssetPreview(
                          uploadedAsset,
                          <>
                            <UploadedAssetActionButton label="替换文件" onClick={() => uploadInputRef.current?.click()}>
                              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5">
                                <path d="M11.5 6.5A3.5 3.5 0 0 0 5.7 4L4.5 5" />
                                <path d="M4.5 2.8V5h2.2" />
                                <path d="M4.5 9.5A3.5 3.5 0 0 0 10.3 12l1.2-1" />
                                <path d="M9.3 11H11.5v2.2" />
                              </svg>
                            </UploadedAssetActionButton>
                            <UploadedAssetActionButton
                              label="取消上传"
                              onClick={() =>
                                data.onConfigChange?.((currentConfig) => ({
                                  ...(currentConfig as InputBoundaryNode),
                                  defaultValue: "",
                                }))
                              }
                            >
                              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5">
                                <path d="m4.5 4.5 7 7" />
                                <path d="m11.5 4.5-7 7" />
                              </svg>
                            </UploadedAssetActionButton>
                          </>,
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}

          {config.family !== "input" && (config.family === "agent" || isExpanded) && (inputs.length > 0 || outputs.length > 0) ? (
            <div className="grid grid-cols-2 items-start gap-x-6">
              <div className="grid gap-1">
                {inputs.map((port, index) => (
                  <PortRow
                    key={`input-${port.key}`}
                    nodeId={data.nodeId}
                    port={port}
                    side="input"
                    portEditor={
                      config.family === "agent" || config.family === "condition"
                        ? {
                            onChange: (nextPort) => updateNodePort("input", index, nextPort),
                            onRemove: inputs.length > 1 ? () => removeNodePort("input", index) : undefined,
                          }
                        : undefined
                    }
                  />
                ))}
                {(config.family === "agent" || config.family === "condition") && data.connectingSourceType ? (
                  <div className="group relative flex min-h-6 items-center justify-start text-[0.9rem] text-[var(--muted)]">
                    <Handle
                      id={buildHandleId("input", CREATE_INPUT_PORT_KEY)}
                      type="target"
                      position={Position.Left}
                      className="!left-[-7px] !top-1/2 !m-0 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-[rgba(154,52,18,0.18)] !bg-[rgba(255,255,255,0.96)] before:content-[''] before:absolute before:left-1/2 before:top-1/2 before:h-[1.5px] before:w-[7px] before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-[var(--accent-strong)] after:content-[''] after:absolute after:left-1/2 after:top-1/2 after:h-[7px] after:w-[1.5px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-[var(--accent-strong)]"
                      isConnectable
                    />
                    <span className="ml-2 inline-flex items-center gap-2 text-sm">
                      <span>Add {formatValueTypeLabel(data.connectingSourceType)} input</span>
                    </span>
                  </div>
                ) : null}
                {config.family === "agent" || config.family === "condition" ? (
                  <PortCreateButton
                    side="input"
                    visible={selected || isHoveringNode}
                    initialPort={createDefaultPort("input", inputs)}
                    onCreate={(nextPort) => addNodePort("input", nextPort)}
                  />
                ) : null}
              </div>
              <div className="grid gap-1">
                {outputs.map((port, index) => (
                  <PortRow
                    key={`output-${port.key}`}
                    nodeId={data.nodeId}
                    port={port}
                    side="output"
                    portEditor={
                      config.family === "agent"
                        ? {
                            onChange: (nextPort) => updateNodePort("output", index, nextPort),
                            onRemove: outputs.length > 1 ? () => removeNodePort("output", index) : undefined,
                          }
                        : undefined
                    }
                  />
                ))}
                {config.family === "agent" ? (
                  <PortCreateButton
                    side="output"
                    visible={selected || isHoveringNode}
                    initialPort={createDefaultPort("output", outputs)}
                    onCreate={(nextPort) => addNodePort("output", nextPort)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {config.family === "agent" ? (
            <>
              {!isExpanded ? (
                <div className="flex min-h-[140px] flex-1 items-center justify-center rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-5 py-4 text-center text-sm text-[var(--text)] break-words">
                  {summarizeNode(config)}
                </div>
              ) : (
                <>
                  <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                    <span>Task Introduction</span>
                    <textarea
                      className="min-h-24 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                      value={config.description}
                      onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), description: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                    <span>System Instruction</span>
                    <textarea
                      className="min-h-24 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                      value={config.systemInstruction}
                      onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), systemInstruction: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                    <span>Task Instruction</span>
                    <textarea
                      className="min-h-28 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                      value={config.taskInstruction}
                      onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), taskInstruction: event.target.value }))}
                    />
                  </label>
                  <SkillEditorList
                    skills={config.skills}
                    onChange={(nextSkills) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), skills: nextSkills }))}
                    definitions={data.skillDefinitions ?? []}
                    definitionsLoading={Boolean(data.skillDefinitionsLoading)}
                    definitionsError={data.skillDefinitionsError ?? null}
                  />
                  <MappingEditor
                    title="Output Binding"
                    value={config.outputBinding}
                    addLabel="Add Output Binding"
                    onChange={(nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), outputBinding: nextValue }))}
                  />
                  <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                    <span>Response Mode</span>
                    <select
                      className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                      value={config.responseMode}
                      onChange={(event) =>
                        data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), responseMode: event.target.value as AgentNode["responseMode"] }))
                      }
                    >
                      {["json", "text"].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <AdvancedJsonSection
                    sections={[
                      {
                        label: "Inputs JSON",
                        value: config.inputs,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), inputs: nextValue as PortDefinition[] })),
                      },
                      {
                        label: "Outputs JSON",
                        value: config.outputs,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), outputs: nextValue as PortDefinition[] })),
                      },
                      {
                        label: "Skills JSON",
                        value: config.skills,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), skills: nextValue as AgentNode["skills"] })),
                      },
                      {
                        label: "Output Binding JSON",
                        value: config.outputBinding,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), outputBinding: nextValue as Record<string, string> })),
                        minHeight: "min-h-24",
                      },
                    ]}
                  />
                </>
              )}
            </>
          ) : null}

          {config.family === "condition" ? (
            <>
              {!isExpanded ? (
                <div className="flex min-h-[120px] flex-1 items-center rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-4 py-4 text-sm leading-6 text-[var(--text)] break-words">
                  {summarizeNode(config)}
                </div>
              ) : (
                <>
                  <BranchEditorList
                    branches={config.branches}
                    onChange={(nextBranches) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), branches: nextBranches }))}
                  />
                  <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                    <span>Condition Mode</span>
                    <select
                      className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                      value={config.conditionMode}
                      onChange={(event) =>
                        data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), conditionMode: event.target.value as ConditionNode["conditionMode"] }))
                      }
                    >
                      {["rule", "model"].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <RuleEditor
                    rule={config.rule}
                    onChange={(nextRule) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), rule: nextRule }))}
                  />
                  <MappingEditor
                    title="Branch Mapping"
                    value={config.branchMapping}
                    addLabel="Add Branch Mapping"
                    onChange={(nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), branchMapping: nextValue }))}
                  />
                  <AdvancedJsonSection
                    sections={[
                      {
                        label: "Inputs JSON",
                        value: config.inputs,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), inputs: nextValue as PortDefinition[] })),
                      },
                      {
                        label: "Branches JSON",
                        value: config.branches,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), branches: nextValue as ConditionNode["branches"] })),
                        minHeight: "min-h-24",
                      },
                      {
                        label: "Rule JSON",
                        value: config.rule,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), rule: nextValue as ConditionNode["rule"] })),
                        minHeight: "min-h-24",
                      },
                      {
                        label: "Branch Mapping JSON",
                        value: config.branchMapping,
                        onChange: (nextValue) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), branchMapping: nextValue as Record<string, string> })),
                        minHeight: "min-h-24",
                      },
                    ]}
                  />
                </>
              )}
            </>
          ) : null}

          {config.family === "output" ? (
            <>
              <div className="grid gap-1">
                {inputs.map((port) => (
                  <PortRow
                    key={`input-${port.key}`}
                    nodeId={data.nodeId}
                    port={port}
                    side="input"
                    editable
                    onRename={(nextLabel) =>
                      data.onConfigChange?.((currentConfig) => ({
                        ...(currentConfig as OutputBoundaryNode),
                        input: {
                          ...(currentConfig as OutputBoundaryNode).input,
                          label: nextLabel,
                        },
                      }))
                    }
                  />
                ))}
              </div>
              {isExpanded ? (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3">
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Display Mode</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={config.displayMode}
                        onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as OutputBoundaryNode), displayMode: event.target.value as OutputBoundaryNode["displayMode"] }))}
                      >
                        {["auto", "plain", "markdown", "json"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-7 flex items-center gap-2 text-sm text-[var(--muted)]">
                      <input
                        checked={config.persistEnabled}
                        type="checkbox"
                        onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as OutputBoundaryNode), persistEnabled: event.target.checked }))}
                      />
                      <span>Persist</span>
                    </label>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Persist Format</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={config.persistFormat}
                        onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as OutputBoundaryNode), persistFormat: event.target.value as OutputBoundaryNode["persistFormat"] }))}
                      >
                        {["txt", "md", "json"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-2">
                    <Input
                      value={config.fileNameTemplate}
                      onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as OutputBoundaryNode), fileNameTemplate: event.target.value }))}
                      placeholder="File name template"
                    />
                  </div>
                </>
              ) : null}
              <div className="flex min-h-[160px] flex-1 flex-col rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Preview</div>
                  <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{config.displayMode}</div>
                </div>
                <div className="min-h-[120px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
                  {data.previewText || "Connect an upstream output to preview/export it."}
                </div>
              </div>
            </>
          ) : null}

          {data.previewText && config.family !== "output" ? (
            <div className="whitespace-pre-wrap rounded-[16px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,244,240,0.9)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
              {data.previewText}
            </div>
          ) : null}

          {selected && config.family !== "input" && config.family !== "output" ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => void data.onSavePreset?.()}>
                Save As Preset
              </Button>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </>
  );
}

const nodeTypes = {
  default: NodeCard,
};

function NodeSystemCanvas({ initialGraph, isNewFromTemplate }: { initialGraph: GraphPayload; isNewFromTemplate: boolean }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const reactFlow = useReactFlow<FlowNode, Edge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const [graphName, setGraphName] = useState(initialGraph.name);
  const [graphId, setGraphId] = useState<string | null>(initialGraph.graph_id ?? null);
  const [templateId] = useState(initialGraph.template_id);
  const [themeConfig] = useState(initialGraph.theme_config);
  const [stateSchema] = useState(initialGraph.state_schema);
  const [metadata] = useState(initialGraph.metadata);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const nodesInitialized = useNodesInitialized();
  const autoLayoutDoneRef = useRef(false);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState("Node system phase 4: skill definitions connected.");
  const [persistedPresets, setPersistedPresets] = useState<NodePresetDefinition[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [skillDefinitions, setSkillDefinitions] = useState<SkillDefinition[]>([]);
  const [skillDefinitionsLoading, setSkillDefinitionsLoading] = useState(true);
  const [skillDefinitionsError, setSkillDefinitionsError] = useState<string | null>(null);
  const [connectingSourceType, setConnectingSourceType] = useState<ValueType | null>(null);
  const [creationMenu, setCreationMenu] = useState<{
    clientX: number;
    clientY: number;
    flowX: number;
    flowY: number;
    sourceNodeId?: string;
    sourceHandle?: string;
    sourceValueType?: ValueType | null;
  } | null>(null);
  const pendingConnectRef = useRef<{
    sourceNodeId?: string;
    sourceHandle?: string | null;
    sourceValueType?: ValueType | null;
    completed: boolean;
  }>({
    completed: false,
  });
  const ignoreNextPaneClickRef = useRef(false);

  const allPresets = useMemo(() => [...NODE_PRESETS_MOCK, ...persistedPresets], [persistedPresets]);
  const getRecommendedPresets = useCallback(
    (sourceType: ValueType | null) => {
      if (!sourceType) {
        return [EMPTY_AGENT_PRESET, ...allPresets.filter((preset) => preset.presetId !== EMPTY_AGENT_PRESET.presetId)];
      }

      const supportsType = (preset: NodePresetDefinition) => {
        if (preset.family === "agent") {
          return preset.inputs.some((input) => input.valueType === "any" || input.valueType === sourceType);
        }
        if (preset.family === "condition") {
          return preset.inputs.some((input) => input.valueType === "any" || input.valueType === sourceType);
        }
        if (preset.family === "output") {
          return preset.input.valueType === "any" || preset.input.valueType === sourceType;
        }
        return false;
      };

      return [EMPTY_AGENT_PRESET, ...allPresets.filter((preset) => preset.presetId !== EMPTY_AGENT_PRESET.presetId && supportsType(preset))];
    },
    [allPresets],
  );

  const nodePalette = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sourceType = creationMenu?.sourceValueType ?? null;
    const recommended = getRecommendedPresets(sourceType);
    return recommended.filter((preset) => {
      if (!query) return true;
      return [preset.label, preset.description, preset.presetId].some((value) => value.toLowerCase().includes(query));
    });
  }, [creationMenu?.sourceValueType, getRecommendedPresets, search]);

  const previewTextByNode = useMemo(() => {
    return Object.fromEntries(nodes.map((node) => [node.id, createPreviewText(node, nodes, edges)]));
  }, [edges, nodes]);

  const hydrateRunResult = useCallback(
    (run: RunDetail) => {
      const outputPreviewMap = new Map<string, string>();
      for (const output of run.artifacts.exported_outputs ?? []) {
        if (!output.node_id) continue;
        outputPreviewMap.set(output.node_id, formatPreviewValue(output.value));
      }

      const failedNodeMap = new Map<string, string>();
      for (const execution of run.node_executions) {
        if (execution.status !== "failed") continue;
        const errorText = execution.errors?.filter(Boolean).join("\n") || "Run failed on this node.";
        failedNodeMap.set(execution.node_id, errorText);
      }

      setNodes((current) =>
        current.map((node) => {
          const failedText = failedNodeMap.get(node.id);
          if (failedText) {
            return {
              ...node,
              data: {
                ...node.data,
                previewText: `Latest run failed here:\n${failedText}`,
              },
            };
          }

          if (node.data.config.family === "output") {
            const outputText = outputPreviewMap.get(node.id);
            let nextPreviewText = outputText ?? "";
            if (!nextPreviewText && run.status === "failed") {
              nextPreviewText = "Latest run failed before this output was produced.";
            } else if (!nextPreviewText && run.status === "completed") {
              nextPreviewText = "Latest run completed, but this output did not produce a value.";
            }
            return {
              ...node,
              data: {
                ...node.data,
                previewText: nextPreviewText,
              },
            };
          }

          if (node.data.config.family === "agent" || node.data.config.family === "condition") {
            return {
              ...node,
              data: {
                ...node.data,
                previewText: "",
              },
            };
          }

          return node;
        }),
      );
    },
    [setNodes],
  );

  const loadRunResult = useCallback(
    async (runId: string) => {
      let latestError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const run = await apiGet<RunDetail>(`/api/runs/${runId}`);
          hydrateRunResult(run);
          const runErrors = run.errors?.filter(Boolean) ?? [];
          if (run.status === "failed" && runErrors.length > 0) {
            setStatusMessage(`Run ${runId} failed: ${runErrors.join("; ")}`);
          } else {
            setStatusMessage(`Run ${runId} ${run.status}`);
          }
          return;
        } catch (error) {
          latestError = error instanceof Error ? error : new Error("Failed to load run detail.");
          await new Promise((resolve) => {
            window.setTimeout(resolve, 250 * (attempt + 1));
          });
        }
      }
      if (latestError) {
        setStatusMessage(latestError.message);
      }
    },
    [hydrateRunResult],
  );

  useEffect(() => {
    let active = true;

    async function loadSkillDefinitions() {
      try {
        setSkillDefinitionsLoading(true);
        setSkillDefinitionsError(null);
        const payload = await apiGet<SkillDefinition[]>("/api/skills/definitions");
        if (!active) return;
        setSkillDefinitions(payload);
      } catch (error) {
        if (!active) return;
        setSkillDefinitionsError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        if (active) {
          setSkillDefinitionsLoading(false);
        }
      }
    }

    void loadSkillDefinitions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const initialNodes = Array.isArray(initialGraph.nodes) ? initialGraph.nodes.map((node) => createFlowNodeFromGraphNode(node)) : [];
    const nodesById = new Map(initialNodes.map((node) => [node.id, node]));
    const initialEdges = Array.isArray(initialGraph.edges)
      ? initialGraph.edges.map((edge) => createFlowEdgeFromGraphEdge(edge, nodesById))
      : [];
    autoLayoutDoneRef.current = false;
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialGraph.edges, initialGraph.nodes, setEdges, setNodes]);

  useEffect(() => {
    if (!isNewFromTemplate) return;
    if (!nodesInitialized) return;
    if (autoLayoutDoneRef.current) return;
    autoLayoutDoneRef.current = true;

    setNodes((current) => {
      if (current.length === 0) return current;

      const sorted = [...current].sort((a, b) => a.position.x - b.position.x);
      const GAP = 80;
      let nextX = sorted[0].position.x;
      const centerY = sorted.reduce((sum, n) => sum + n.position.y, 0) / sorted.length;

      return sorted.map((node) => {
        const width = node.measured?.width ?? (typeof node.style?.width === "number" ? node.style.width : 280);
        const updatedNode = { ...node, position: { x: nextX, y: centerY } };
        nextX += width + GAP;
        return updatedNode;
      });
    });
  }, [isNewFromTemplate, nodesInitialized, setNodes]);

  useEffect(() => {
    let active = true;

    async function loadPersistedPresets() {
      try {
        setPresetsLoading(true);
        setPresetsError(null);
        const payload = await apiGet<PresetDocument[]>("/api/presets");
        if (!active) return;
        setPersistedPresets(payload.map((item) => item.definition));
      } catch (error) {
        if (!active) return;
        setPresetsError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        if (active) {
          setPresetsLoading(false);
        }
      }
    }

    void loadPersistedPresets();

    return () => {
      active = false;
    };
  }, []);

  const openCreationMenuAtClientPoint = useCallback(
    (clientX: number, clientY: number, sourceValueType: ValueType | null = null) => {
      const position = reactFlow.screenToFlowPosition({ x: clientX, y: clientY });
      setCreationMenu({
        clientX,
        clientY,
        flowX: position.x,
        flowY: position.y,
        sourceValueType,
      });
    },
    [reactFlow],
  );

  function createNodeFromConfig(config: NodePresetDefinition, position: { x: number; y: number }) {
    const id = `${config.family}_${crypto.randomUUID().slice(0, 8)}`;
    const defaultWidth = getDefaultNodeWidth(config);
    return {
      id,
      type: "default",
      position,
      data: {
        nodeId: id,
        config,
        previewText: "",
        isExpanded: false,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: "transparent",
        border: "none",
        padding: 0,
        width: defaultWidth ?? "auto",
      },
    } satisfies FlowNode;
  }

function createNodeFromPreset(preset: NodePresetDefinition, position: { x: number; y: number }) {
  const config = deepClonePreset(preset);
  return createNodeFromConfig(config, position);
}

  async function addInputNodeFromFile(file: File, position: { x: number; y: number }) {
    const envelope = await fileToEnvelope(file);
    const typeLabel = formatValueTypeLabel(envelope.detectedType);
    const inputConfig = {
      ...deepClonePreset(TEXT_INPUT_PRESET),
      label: `${typeLabel} Input`,
      description: `Uploaded ${typeLabel.toLowerCase()} asset from ${file.name}.`,
      valueType: envelope.detectedType,
      output: {
        ...deepClonePreset(TEXT_INPUT_PRESET).output,
        key: envelope.detectedType,
        label: typeLabel,
        valueType: envelope.detectedType,
      },
      defaultValue: JSON.stringify(envelope),
      placeholder: "",
    } satisfies InputBoundaryNode;

    const nextNode = createNodeFromConfig(inputConfig, position);
    setNodes((current) => current.concat(nextNode));
    setSelectedNodeId(nextNode.id);
    setStatusMessage(`Added ${inputConfig.label} from ${file.name}`);
  }

  function addNodeFromPresetId(presetId: string, position: { x: number; y: number }, connectionSource?: { sourceNodeId?: string; sourceHandle?: string; sourceValueType?: ValueType | null }) {
    const preset = getNodePresetById(presetId) ?? persistedPresets.find((item) => item.presetId === presetId);
    if (!preset) return;

    const nextNode = createNodeFromPreset(preset, position);
    if (nextNode.data.config.family === "agent" && connectionSource?.sourceValueType) {
      const agentConfig = nextNode.data.config as AgentNode;
      if (agentConfig.inputs.length === 0) {
        agentConfig.inputs = [
          {
            key: "input",
            label: "Input",
            valueType: connectionSource.sourceValueType,
            required: true,
          },
        ];
      }
    }
    if (nextNode.data.config.family === "condition" && connectionSource?.sourceValueType) {
      const conditionConfig = nextNode.data.config as ConditionNode;
      if (conditionConfig.inputs.length === 0) {
        conditionConfig.inputs = [
          {
            key: "input",
            label: "Input",
            valueType: connectionSource.sourceValueType,
            required: true,
          },
        ];
      }
    }
    setNodes((current) => current.concat(nextNode));
    setSelectedNodeId(nextNode.id);
    setStatusMessage(`Added ${preset.label}`);

    if (connectionSource?.sourceNodeId && connectionSource.sourceHandle && connectionSource.sourceValueType) {
      const targetHandle = findFirstCompatibleInputHandle(nextNode.data.config, connectionSource.sourceValueType);
      if (targetHandle) {
        setEdges((current) =>
          current.concat({
            id: `edge_${crypto.randomUUID().slice(0, 8)}`,
            source: connectionSource.sourceNodeId ?? "",
            target: nextNode.id,
            sourceHandle: connectionSource.sourceHandle ?? null,
            targetHandle,
            markerEnd: { type: MarkerType.ArrowClosed, color: TYPE_COLORS[connectionSource.sourceValueType ?? "any"] },
            style: {
              stroke: TYPE_COLORS[connectionSource.sourceValueType ?? "any"],
              strokeWidth: 1.8,
            },
          }),
        );
      }
    }

    setCreationMenu(null);
  }

  async function saveNodeAsPreset(nodeId: string) {
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode) return;
    const slug = targetNode.data.config.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom";
    const nextPreset = {
      ...deepClonePreset(targetNode.data.config),
      presetId: `preset.local.${slug}.${crypto.randomUUID().slice(0, 6)}`,
      label: `${targetNode.data.config.label} Copy`,
    } satisfies NodePresetDefinition;
    try {
      await apiPost<{ presetId: string; updatedAt?: string | null }>("/api/presets", {
        presetId: nextPreset.presetId,
        sourcePresetId: targetNode.data.config.presetId,
        definition: nextPreset,
      });
      setPersistedPresets((current) => [nextPreset, ...current.filter((item) => item.presetId !== nextPreset.presetId)]);
      setStatusMessage(`Saved preset ${nextPreset.presetId}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save preset.");
    }
  }

  function buildPayload(): GraphPayload {
    return {
      graph_family: "node_system",
      graph_id: graphId,
      name: graphName,
      template_id: templateId,
      theme_config: themeConfig,
      state_schema: stateSchema,
      nodes: nodes.map((node) => ({
        id: node.id,
        type: "default",
        position: node.position,
        style: node.style,
        data: {
          nodeId: node.data.nodeId,
          config: node.data.config,
          previewText: node.data.previewText || previewTextByNode[node.id] || "",
        },
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
      })),
      metadata,
    };
  }

  async function handleSave() {
    try {
      const response = await apiPost<{ graph_id: string; validation: { valid: boolean; issues: Array<{ message: string }> } }>("/api/graphs/save", buildPayload());
      setGraphId(response.graph_id);
      setStatusMessage(`Saved graph ${response.graph_id}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save graph.");
    }
  }

  async function handleValidate() {
    try {
      const response = await apiPost<{ valid: boolean; issues: Array<{ message: string }> }>("/api/graphs/validate", buildPayload());
      setStatusMessage(response.valid ? "Validation passed." : response.issues.map((issue) => issue.message).join("; "));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to validate graph.");
    }
  }

  async function handleRun() {
    try {
      const response = await apiPost<{ run_id: string; status: string }>("/api/graphs/run", buildPayload());
      setActiveRunId(response.run_id);
      await loadRunResult(response.run_id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to run graph.");
    }
  }

  return (
    <div className="grid h-screen grid-rows-[56px_minmax(0,1fr)_36px] bg-[radial-gradient(circle_at_top,rgba(154,52,18,0.1),transparent_22%),linear-gradient(180deg,#f5efe2_0%,#ede4d2_100%)]">
      <header className="grid grid-cols-[minmax(220px,320px)_1fr_auto] items-center gap-3 border-b border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.82)] px-4 backdrop-blur-xl">
        <Input className="h-10" value={graphName} onChange={(event) => setGraphName(event.target.value)} placeholder="Graph name" />
        <div className="text-sm text-[var(--muted)]">Double click canvas to create nodes. Drop files on empty canvas to create input nodes. Drag from an output handle into empty space for type-aware suggestions.</div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void handleSave()}>
            Save
          </Button>
          <Button size="sm" onClick={() => void handleValidate()}>
            Validate
          </Button>
          <Button size="sm" variant="primary" onClick={() => void handleRun()}>
            Run
          </Button>
        </div>
      </header>

      <div className="relative min-w-0 min-h-0 h-full">
        <div
          className="relative min-w-0 min-h-0 h-full"
          ref={wrapperRef}
          onDoubleClickCapture={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest(".react-flow__node, [data-node-card='true']")) return;
            openCreationMenuAtClientPoint(event.clientX, event.clientY, null);
          }}
        >
          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes.map((node) => ({
                ...node,
                data: {
                  ...node.data,
                  previewText: node.data.previewText || previewTextByNode[node.id] || "",
                  isExpanded: node.data.isExpanded,
                  onConfigChange: (updater: (config: NodePresetDefinition) => NodePresetDefinition) => {
                    setNodes((current) =>
                      current.map((candidate) =>
                        candidate.id === node.id
                          ? {
                              ...candidate,
                              data: {
                                ...candidate.data,
                                config: updater(candidate.data.config),
                              },
                            }
                          : candidate,
                      ),
                    );
                  },
                  onToggleExpanded: () => {
                    setNodes((current) =>
                      current.map((candidate) =>
                        candidate.id === node.id
                          ? {
                              ...candidate,
                              style: {
                                ...candidate.style,
                                height: undefined,
                              },
                              data: {
                                ...candidate.data,
                                isExpanded: !candidate.data.isExpanded,
                              },
                            }
                          : candidate,
                      ),
                    );
                  },
                  onResizeEnd: (width: number, height: number) => {
                    setNodes((current) =>
                      current.map((n) =>
                        n.id === node.id
                          ? { ...n, style: { ...n.style, width, height } }
                          : n,
                      ),
                    );
                  },
                  onDelete: () => {
                    setNodes((current) => current.filter((candidate) => candidate.id !== node.id));
                    setEdges((current) => current.filter((edge) => edge.source !== node.id && edge.target !== node.id));
                    setSelectedNodeId((current) => (current === node.id ? null : current));
                  },
                  onSavePreset: () => saveNodeAsPreset(node.id),
                  connectingSourceType,
                  skillDefinitions,
                  skillDefinitionsLoading,
                  skillDefinitionsError,
                },
              }))}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onSelectionChange={({ nodes: selectedNodes }) => setSelectedNodeId(selectedNodes[0]?.id ?? null)}
              onPaneClick={() => {
                if (ignoreNextPaneClickRef.current) {
                  ignoreNextPaneClickRef.current = false;
                  return;
                }
                setSelectedNodeId(null);
                setCreationMenu(null);
              }}
              onConnectStart={(_, params) => {
                if (params.handleType !== "source" || !params.nodeId || !params.handleId) return;
                const sourceNode = nodes.find((node) => node.id === params.nodeId);
                const sourceValueType = sourceNode ? getPortType(sourceNode.data.config, params.handleId) : null;
                setConnectingSourceType(sourceValueType);
                pendingConnectRef.current = {
                  sourceNodeId: params.nodeId,
                  sourceHandle: params.handleId,
                  sourceValueType,
                  completed: false,
                };
              }}
              onConnect={(connection: Connection) => {
                const sourceNode = nodes.find((node) => node.id === connection.source);
                const targetNode = nodes.find((node) => node.id === connection.target);
                if (!sourceNode || !targetNode) return;

                const sourceType = getPortType(sourceNode.data.config, connection.sourceHandle);
                let nextTargetHandle = connection.targetHandle ?? null;
                let targetType = getPortType(targetNode.data.config, nextTargetHandle);

                if (getPortKeyFromHandle(connection.targetHandle) === CREATE_INPUT_PORT_KEY && sourceType) {
                  if (targetNode.data.config.family === "agent") {
                    const nextPort = createAutoInputPort(targetNode.data.config.inputs, sourceType);
                    nextTargetHandle = buildHandleId("input", nextPort.key);
                    targetType = nextPort.valueType;
                    const nextTargetNodeId = targetNode.id;
                    setNodes((current) =>
                      current.map((candidate) =>
                        candidate.id === nextTargetNodeId
                          ? (() => {
                              const currentConfig = candidate.data.config as AgentNode;
                              return {
                                ...candidate,
                                data: {
                                  ...candidate.data,
                                  config: {
                                    ...currentConfig,
                                    inputs: [...currentConfig.inputs, nextPort],
                                  } satisfies AgentNode,
                                },
                              };
                            })()
                          : candidate,
                      ),
                    );
                    requestAnimationFrame(() => updateNodeInternals(nextTargetNodeId));
                  } else if (targetNode.data.config.family === "condition") {
                    const nextPort = createAutoInputPort(targetNode.data.config.inputs, sourceType);
                    nextTargetHandle = buildHandleId("input", nextPort.key);
                    targetType = nextPort.valueType;
                    const nextTargetNodeId = targetNode.id;
                    setNodes((current) =>
                      current.map((candidate) =>
                        candidate.id === nextTargetNodeId
                          ? (() => {
                              const currentConfig = candidate.data.config as ConditionNode;
                              return {
                                ...candidate,
                                data: {
                                  ...candidate.data,
                                  config: {
                                    ...currentConfig,
                                    inputs: [...currentConfig.inputs, nextPort],
                                  } satisfies ConditionNode,
                                },
                              };
                            })()
                          : candidate,
                      ),
                    );
                    requestAnimationFrame(() => updateNodeInternals(nextTargetNodeId));
                  }
                }

                if (!sourceType || !targetType || !isValueTypeCompatible(sourceType, targetType)) {
                  setStatusMessage("Only compatible value types can be connected.");
                  setConnectingSourceType(null);
                  return;
                }

                pendingConnectRef.current.completed = true;
                setConnectingSourceType(null);
                setEdges((current) =>
                  current
                    .filter(
                      (edge) =>
                        !(
                          edge.source === connection.source &&
                          edge.target === connection.target &&
                          edge.sourceHandle === connection.sourceHandle &&
                          edge.targetHandle === connection.targetHandle
                        ),
                    )
                    .concat({
                      id: `edge_${crypto.randomUUID().slice(0, 8)}`,
                      source: connection.source ?? "",
                      target: connection.target ?? "",
                      sourceHandle: connection.sourceHandle ?? null,
                      targetHandle: nextTargetHandle,
                      markerEnd: { type: MarkerType.ArrowClosed, color: TYPE_COLORS[sourceType] },
                      style: {
                        stroke: TYPE_COLORS[sourceType],
                        strokeWidth: 1.8,
                      },
                    }),
                );
                setStatusMessage(`Connected ${sourceNode.data.config.label} -> ${targetNode.data.config.label}`);
              }}
              onConnectEnd={(event) => {
                const pending = pendingConnectRef.current;
                if (!pending.completed && pending.sourceNodeId && pending.sourceHandle && "clientX" in event && "clientY" in event) {
                  ignoreNextPaneClickRef.current = true;
                  const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                  setCreationMenu({
                    clientX: event.clientX,
                    clientY: event.clientY,
                    flowX: position.x,
                    flowY: position.y,
                    sourceNodeId: pending.sourceNodeId,
                    sourceHandle: pending.sourceHandle,
                    sourceValueType: pending.sourceValueType ?? null,
                  });
                }
                setConnectingSourceType(null);
                pendingConnectRef.current = { completed: false };
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? "copy" : "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const presetId = event.dataTransfer.getData("application/graphiteui-node-preset");
                if (presetId) {
                  const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                  addNodeFromPresetId(presetId, position);
                  return;
                }

                const droppedFile = event.dataTransfer.files?.[0] ?? null;
                if (!droppedFile) return;
                const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                void addInputNodeFromFile(droppedFile, position);
              }}
              fitView
              minZoom={0.35}
              maxZoom={1.8}
              defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
              nodeTypes={nodeTypes}
              className="bg-[linear-gradient(180deg,rgba(247,241,231,0.72)_0%,rgba(237,228,210,0.72)_100%)]"
            >
              <Background id="editor-grid" color="#cfb58f" gap={24} size={1.4} variant={BackgroundVariant.Dots} />
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

          {creationMenu ? (
            <div
              className="absolute z-20 w-[320px] rounded-[20px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.98)] p-3 shadow-[0_24px_48px_rgba(60,41,20,0.18)]"
              style={{
                left: Math.max(12, creationMenu.clientX - (wrapperRef.current?.getBoundingClientRect().left ?? 0) - 20),
                top: Math.max(12, creationMenu.clientY - (wrapperRef.current?.getBoundingClientRect().top ?? 0) - 20),
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Create Node</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {creationMenu.sourceValueType ? `Suggestions for ${creationMenu.sourceValueType}` : "Double click preset picker"}
                  </div>
                </div>
                <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setCreationMenu(null)}>
                  Close
                </button>
              </div>
              <Input className="mt-3 h-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search presets" />
              <div className="mt-3 grid gap-2">
                {nodePalette.map((preset) => (
                  <button
                    key={`menu-${preset.presetId}`}
                    type="button"
                    className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] px-3 py-2 text-left transition-colors hover:bg-[rgba(255,248,240,0.92)]"
                    onClick={() =>
                      addNodeFromPresetId(
                        preset.presetId,
                        { x: creationMenu.flowX, y: creationMenu.flowY },
                        {
                          sourceNodeId: creationMenu.sourceNodeId,
                          sourceHandle: creationMenu.sourceHandle,
                          sourceValueType: creationMenu.sourceValueType,
                        },
                      )
                    }
                  >
                    <div className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{preset.family}</div>
                    <div className="mt-0.5 text-sm font-semibold text-[var(--text)]">{preset.label}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {nodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="rounded-[28px] border border-dashed border-[rgba(154,52,18,0.26)] bg-[rgba(255,250,241,0.72)] px-8 py-6 text-center shadow-[0_18px_40px_rgba(60,41,20,0.08)]">
                <div className="text-[0.72rem] uppercase tracking-[0.16em] text-[var(--accent-strong)]">Empty Canvas</div>
                <div className="mt-3 text-2xl font-semibold text-[var(--text)]">Double click to create your first node</div>
                <div className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                  Drag from an output handle into empty space to get type-aware preset suggestions.
                </div>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-[440px] rounded-[18px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] px-3 py-2 text-sm text-[var(--muted)] shadow-[0_14px_32px_rgba(60,41,20,0.1)]">
            <span>Status: </span>
            <span className="text-[var(--text)]">{statusMessage}</span>
            {activeRunId ? (
              <span className="pointer-events-auto ml-2">
                Latest run: <a className="text-[var(--accent-strong)] underline" href={`/runs/${activeRunId}`}>{activeRunId}</a>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.82)] px-4 text-sm text-[var(--muted)]">
        <span>{nodes.length} nodes / {edges.length} edges</span>
        <span>Double click canvas or drag from an output handle to open preset suggestions.</span>
      </footer>
    </div>
  );
}

export function NodeSystemEditor(props: EditorClientProps) {
  const graph = props.initialGraph ?? createEditorDefaults(props.templates, props.defaultTemplateId);
  const isNewFromTemplate = props.mode === "new" && props.initialGraph == null;

  return (
    <ReactFlowProvider>
      <NodeSystemCanvas initialGraph={graph} isNewFromTemplate={isNewFromTemplate} />
    </ReactFlowProvider>
  );
}
