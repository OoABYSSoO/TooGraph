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
import { EMPTY_AGENT_PRESET, getNodePresetById, NODE_PRESETS_MOCK } from "@/lib/node-presets-mock";
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
    value: "image",
    label: "Image",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
        <circle cx="6" cy="6.5" r="1" />
        <path d="m4 11 2.5-2.5L8.5 10l1.5-1.5L12 11" />
      </svg>
    ),
  },
  {
    value: "audio",
    label: "Audio",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <path d="M9.5 3.5v6.2a1.8 1.8 0 1 1-1-1.6V5.2l4-1v4.5a1.8 1.8 0 1 1-1-1.6V3.5Z" />
      </svg>
    ),
  },
  {
    value: "video",
    label: "Video",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <rect x="2.5" y="4" width="8.5" height="8" rx="1.5" />
        <path d="m11 7 2.5-1.5v5L11 9" />
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

function renderUploadedAssetPreview(asset: UploadedAssetEnvelope) {
  if (asset.detectedType === "image" && asset.encoding === "data_url") {
    return (
      <div className="grid gap-3">
        <div className="overflow-hidden rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)]">
          <img src={asset.content} alt={asset.name} className="max-h-[240px] w-full object-contain bg-[rgba(248,242,234,0.8)]" />
        </div>
        <div className="text-xs leading-5 text-[var(--muted)]">{asset.name}</div>
      </div>
    );
  }

  if (asset.detectedType === "audio" && asset.encoding === "data_url") {
    return (
      <div className="grid gap-3">
        <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)] p-3">
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
        <div className="overflow-hidden rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)]">
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
        <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)] p-3">
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
      <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.88)] p-3">
        <div className="text-sm font-medium text-[var(--text)]">{asset.name}</div>
        <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
          {asset.detectedType} · {asset.mimeType} · {Math.max(1, Math.round(asset.size / 1024))} KB
        </div>
      </div>
    </div>
  );
}

function openUploadedAsset(asset: UploadedAssetEnvelope) {
  if (typeof window === "undefined") return;

  if (asset.encoding === "data_url") {
    window.open(asset.content, "_blank", "noopener,noreferrer");
    return;
  }

  const blob = new Blob([asset.content], { type: asset.mimeType || "text/plain" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
  return {
    id: node.id,
    type: node.type ?? "default",
    position: node.position ?? { x: 0, y: 0 },
    data: {
      nodeId: node.data?.nodeId ?? node.id,
      config: deepClonePreset(node.data?.config as NodePresetDefinition),
      previewText: node.data?.previewText ?? "",
      isExpanded: false,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: hasExplicitSize
      ? { background: "transparent", border: "none", padding: 0, width: node.style.width, height: node.style.height }
      : { background: "transparent", border: "none", padding: 0, width: "auto" },
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
    if (handleId?.startsWith("input:")) return config.inputs.find((item) => item.key === key)?.valueType ?? null;
    if (handleId?.startsWith("output:")) return config.outputs.find((item) => item.key === key)?.valueType ?? null;
  }
  if (config.family === "condition") {
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

function summarizeNode(config: NodePresetDefinition) {
  if (config.family === "input") {
    return config.placeholder || "Inline input boundary";
  }
  if (config.family === "agent") {
    return config.taskInstruction || "Configure this agent node.";
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

function PortEditorList({
  label,
  ports,
  side,
  onChange,
}: {
  label: string;
  ports: PortDefinition[];
  side: "input" | "output";
  onChange: (nextPorts: PortDefinition[]) => void;
}) {
  return (
    <PanelSection title={label} description={side === "input" ? "通过表单维护输入端口。" : "通过表单维护输出端口。"}>
      {ports.map((port, index) => (
        <div key={`${port.key}-${index}`} className="grid gap-3 rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,250,241,0.72)] p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Key</span>
              <Input
                value={port.key}
                onChange={(event) =>
                  onChange(ports.map((item, portIndex) => (portIndex === index ? { ...item, key: event.target.value } : item)))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Label</span>
              <Input
                value={port.label}
                onChange={(event) =>
                  onChange(ports.map((item, portIndex) => (portIndex === index ? { ...item, label: event.target.value } : item)))
                }
              />
            </label>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Value Type</span>
              <select
                className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                value={port.valueType}
                onChange={(event) =>
                  onChange(
                    ports.map((item, portIndex) =>
                      portIndex === index ? { ...item, valueType: event.target.value as ValueType } : item,
                    ),
                  )
                }
              >
                {VALUE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {side === "input" ? (
              <label className="mt-7 flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  checked={Boolean(port.required)}
                  type="checkbox"
                  onChange={(event) =>
                    onChange(
                      ports.map((item, portIndex) =>
                        portIndex === index ? { ...item, required: event.target.checked } : item,
                      ),
                    )
                  }
                />
                <span>Required</span>
              </label>
            ) : (
              <div />
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => onChange(ports.filter((_, portIndex) => portIndex !== index))}>
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
              ports.concat({
                key: side === "input" ? `input_${ports.length + 1}` : `output_${ports.length + 1}`,
                label: side === "input" ? `Input ${ports.length + 1}` : `Output ${ports.length + 1}`,
                valueType: "text",
                ...(side === "input" ? { required: false } : {}),
              }),
            )
          }
        >
          Add {side === "input" ? "Input" : "Output"}
        </Button>
      </div>
    </PanelSection>
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
}: {
  nodeId: string;
  port: PortDefinition;
  side: "input" | "output";
  editable?: boolean;
  onRename?: (nextLabel: string) => void;
}) {
  const color = TYPE_COLORS[port.valueType];
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(port.label);

  useEffect(() => {
    setDraftLabel(port.label);
  }, [port.label]);

  function startEditing() {
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

// 各节点类型的最小高度，防止缩放导致内容显示不全
const NODE_MIN_HEIGHT: Record<string, number> = {
  input: 240,     // header + port row + textarea(min-h-120) + hint text + padding
  output: 180,    // header + port row + preview area + padding
  agent: 120,     // header + port rows + description + padding
  condition: 100, // header + port rows + rule summary + padding
};

function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config;
  const inputs = listInputPorts(config);
  const outputs = listOutputPorts(config);
  const minHeight = NODE_MIN_HEIGHT[config.family] ?? 80;
  const isInputNode = config.family === "input";
  const isCollapsible = config.family !== "input";
  const isExpanded = config.family === "input" ? true : Boolean(data.isExpanded);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [draftLabel, setDraftLabel] = useState(config.label);
  const [draftDescription, setDraftDescription] = useState(config.description);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedAsset = config.family === "input" ? tryParseUploadedAssetEnvelope(config.defaultValue) : null;

  useEffect(() => {
    setDraftLabel(config.label);
  }, [config.label]);

  useEffect(() => {
    setDraftDescription(config.description);
  }, [config.description]);

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

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={minHeight}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)", border: "none" }}
        lineStyle={{ borderColor: "var(--accent)", borderWidth: 1 }}
        onResizeEnd={(_event, params) => data.onResizeEnd?.(params.width, params.height)}
      />
      <div
        data-node-card="true"
        className={cn(
          "h-full min-w-[160px] rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
          selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(154,52,18,0.12)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="relative flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(154,52,18,0.55)]" />
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
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{config.family}</div>
            {isCollapsible ? (
              <button
                type="button"
                className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]"
                onClick={() => data.onToggleExpanded?.()}
              >
                {isExpanded ? "Fold" : "Open"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 px-4 py-3">
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
              <div className="grid gap-2">
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
                    className="min-h-[120px] resize-none rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3 py-3 text-sm text-[var(--text)]"
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
                        className="grid min-h-[120px] place-items-center rounded-[16px] border border-dashed border-[rgba(154,52,18,0.24)] bg-[rgba(255,255,255,0.82)] px-4 py-5 text-center"
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
                        className="grid min-h-[120px] gap-3 rounded-[16px] border border-dashed border-[rgba(154,52,18,0.24)] bg-[rgba(255,255,255,0.82)] px-4 py-5 text-left"
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
                        {renderUploadedAssetPreview(uploadedAsset)}
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" onClick={() => openUploadedAsset(uploadedAsset)}>
                            打开本地文件
                          </Button>
                          <Button variant="ghost" onClick={() => uploadInputRef.current?.click()}>
                            替换文件
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              data.onConfigChange?.((currentConfig) => ({
                                ...(currentConfig as InputBoundaryNode),
                                defaultValue: "",
                              }))
                            }
                          >
                            取消上传
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}

          {config.family !== "input" && isExpanded && (inputs.length > 0 || outputs.length > 0) ? (
            <div className="grid grid-cols-2 items-start gap-x-6">
              <div className="grid gap-1">
                {inputs.map((port) => (
                  <PortRow key={`input-${port.key}`} nodeId={data.nodeId} port={port} side="input" />
                ))}
              </div>
              <div className="grid gap-1">
                {outputs.map((port) => (
                  <PortRow key={`output-${port.key}`} nodeId={data.nodeId} port={port} side="output" />
                ))}
              </div>
            </div>
          ) : null}

          {config.family === "agent" ? (
            <>
              {!isExpanded ? (
                <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm text-[var(--text)]">
                  {summarizeNode(config)}
                </div>
              ) : (
                <>
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
                  <PortEditorList
                    label="Inputs"
                    side="input"
                    ports={config.inputs}
                    onChange={(nextPorts) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), inputs: nextPorts }))}
                  />
                  <PortEditorList
                    label="Outputs"
                    side="output"
                    ports={config.outputs}
                    onChange={(nextPorts) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), outputs: nextPorts }))}
                  />
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
                <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
                  {summarizeNode(config)}
                </div>
              ) : (
                <>
                  <PortEditorList
                    label="Inputs"
                    side="input"
                    ports={config.inputs}
                    onChange={(nextPorts) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), inputs: nextPorts }))}
                  />
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
              <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Preview</div>
                  <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{config.displayMode}</div>
                </div>
                <div className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
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
              <Button variant="ghost" onClick={() => data.onDelete?.()}>
                Delete Node
              </Button>
            </div>
          ) : null}
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

function createNodeFromPreset(preset: NodePresetDefinition, position: { x: number; y: number }) {
  const config = deepClonePreset(preset);
  const id = `${config.family}_${crypto.randomUUID().slice(0, 8)}`;
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
        width: "auto",
      },
    } satisfies FlowNode;
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
        <div className="text-sm text-[var(--muted)]">Double click canvas to create nodes. Drag from an output handle into empty space for type-aware suggestions.</div>
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
                pendingConnectRef.current = {
                  sourceNodeId: params.nodeId,
                  sourceHandle: params.handleId,
                  sourceValueType: sourceNode ? getPortType(sourceNode.data.config, params.handleId) : null,
                  completed: false,
                };
              }}
              onConnect={(connection: Connection) => {
                const sourceNode = nodes.find((node) => node.id === connection.source);
                const targetNode = nodes.find((node) => node.id === connection.target);
                if (!sourceNode || !targetNode) return;

                const sourceType = getPortType(sourceNode.data.config, connection.sourceHandle);
                const targetType = getPortType(targetNode.data.config, connection.targetHandle);
                if (!sourceType || !targetType || !isValueTypeCompatible(sourceType, targetType)) {
                  setStatusMessage("Only compatible value types can be connected.");
                  return;
                }

                pendingConnectRef.current.completed = true;
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
                      targetHandle: connection.targetHandle ?? null,
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
                pendingConnectRef.current = { completed: false };
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const presetId = event.dataTransfer.getData("application/graphiteui-node-preset");
                if (!presetId) return;
                const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                addNodeFromPresetId(presetId, position);
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
