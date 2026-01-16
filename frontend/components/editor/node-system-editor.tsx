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
  onConfigChange?: (updater: (config: NodePresetDefinition) => NodePresetDefinition) => void;
  onResizeEnd?: (width: number, height: number) => void;
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
  any: "#64748b",
};

const VALUE_TYPE_OPTIONS: ValueType[] = ["text", "json", "image", "audio", "video", "any"];
const RULE_OPERATOR_OPTIONS: ConditionRule["operator"][] = ["==", "!=", ">=", "<=", ">", "<", "exists"];

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
}: {
  nodeId: string;
  port: PortDefinition;
  side: "input" | "output";
}) {
  const color = TYPE_COLORS[port.valueType];

  return (
    <div className={cn("relative flex h-6 items-center text-[0.9rem] text-[var(--text)]", side === "input" ? "justify-start" : "justify-end")}>
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
          <span className="ml-2 truncate">{port.label}</span>
        </>
      ) : (
        <>
          <span className="truncate text-right">{port.label}</span>
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

function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config;
  const inputs = listInputPorts(config);
  const outputs = listOutputPorts(config);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={48}
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
      <div className="flex items-center justify-between border-b border-[rgba(154,52,18,0.12)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[rgba(154,52,18,0.55)]" />
          <div className="truncate text-sm font-semibold text-[var(--text)]">{config.label}</div>
        </div>
        <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{config.family}</div>
      </div>

      <div className="grid gap-3 px-4 py-3">
        {config.family === "input" ? null : inputs.length > 0 || outputs.length > 0 ? (
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

        {config.family === "input" && outputs.length > 0 ? (
          <div className="grid gap-1">
            {outputs.map((port) => (
              <PortRow key={`output-${port.key}`} nodeId={data.nodeId} port={port} side="output" />
            ))}
          </div>
        ) : null}

        {config.family === "input" ? (
          <div className="grid gap-2">
            <textarea
              value={config.defaultValue}
              rows={5}
              placeholder={config.placeholder}
              onChange={(event) => data.onConfigChange?.((currentConfig) => ({
                ...(currentConfig as InputBoundaryNode),
                defaultValue: event.target.value,
              }))}
              className="min-h-[120px] resize-none rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3 py-3 text-sm text-[var(--text)]"
            />
            <div className="text-xs leading-5 text-[var(--muted)]">
              这里可以直接编辑输入内容；右侧 Inspector 里继续调整占位符、类型和端口配置。
            </div>
          </div>
        ) : null}

        {config.family === "agent" ? (
          <div className="grid gap-3">
            <div className="text-sm leading-6 text-[var(--muted)]">{config.description}</div>
            <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm text-[var(--text)]">
              {summarizeNode(config)}
            </div>
            {config.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {config.skills.map((skill) => (
                  <span key={skill.name} className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] px-2.5 py-1 text-[0.74rem] text-[var(--accent-strong)]">
                    {skill.skillKey}
                  </span>
                ))}
              </div>
            ) : null}
            {data.previewText ? (
              <div className="whitespace-pre-wrap rounded-[16px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,244,240,0.9)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
                {data.previewText}
              </div>
            ) : null}
          </div>
        ) : null}

        {config.family === "condition" ? (
          <div className="grid gap-3">
            <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
              {summarizeNode(config)}
            </div>
            {data.previewText ? (
              <div className="whitespace-pre-wrap rounded-[16px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,244,240,0.9)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
                {data.previewText}
              </div>
            ) : null}
          </div>
        ) : null}

        {config.family === "output" ? (
          <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Preview</div>
              <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{config.displayMode}</div>
            </div>
            <div className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
              {data.previewText || "Connect an upstream output to preview/export it."}
            </div>
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

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

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

  function updateSelectedNode(updater: (config: NodePresetDefinition) => NodePresetDefinition) {
    if (!selectedNode) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                config: updater(node.data.config),
              },
            }
          : node,
      ),
    );
  }

  async function saveSelectedNodeAsPreset() {
    if (!selectedNode) return;
    const slug = selectedNode.data.config.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom";
    const nextPreset = {
      ...deepClonePreset(selectedNode.data.config),
      presetId: `preset.local.${slug}.${crypto.randomUUID().slice(0, 6)}`,
      label: `${selectedNode.data.config.label} Copy`,
    } satisfies NodePresetDefinition;
    try {
      await apiPost<{ presetId: string; updatedAt?: string | null }>("/api/presets", {
        presetId: nextPreset.presetId,
        sourcePresetId: selectedNode.data.config.presetId,
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
        <div className="text-sm text-[var(--muted)]">Preset-driven node system prototype</div>
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

      <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-r border-[rgba(154,52,18,0.16)] bg-[rgba(255,248,240,0.76)] px-4 py-4">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Node Library</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Create Nodes</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Empty agent comes first. Preset agents are suggested by current value type when created from a dragged connection.
            </p>
          </div>
          <Input className="mt-4 h-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search presets" />
          <div className="mt-4 grid min-h-0 gap-3 overflow-y-auto pr-1">
            {nodePalette.map((preset) => (
              <button
                key={preset.presetId}
                type="button"
                draggable
                className="cursor-grab rounded-[20px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.92)] p-4 text-left shadow-[0_10px_24px_rgba(60,41,20,0.06)] transition-transform hover:-translate-y-px active:cursor-grabbing"
                onClick={() => {
                  const wrapperBounds = wrapperRef.current?.getBoundingClientRect();
                  const position = wrapperBounds
                    ? reactFlow.screenToFlowPosition({
                        x: wrapperBounds.left + wrapperBounds.width * 0.52,
                        y: wrapperBounds.top + wrapperBounds.height * 0.4,
                      })
                    : { x: 200, y: 200 };
                  addNodeFromPresetId(preset.presetId, position);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/graphiteui-node-preset", preset.presetId);
                  event.dataTransfer.effectAllowed = "move";
                }}
              >
                <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{preset.family}</div>
                <div className="mt-1 text-lg font-semibold text-[var(--text)]">{preset.label}</div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{preset.description}</div>
              </button>
            ))}
          </div>
        </aside>

        <div
          className="relative min-w-0 min-h-0"
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
                  onResizeEnd: (width: number, height: number) => {
                    setNodes((current) =>
                      current.map((n) =>
                        n.id === node.id
                          ? { ...n, style: { ...n.style, width, height } }
                          : n,
                      ),
                    );
                  },
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
                <div className="mt-3 text-2xl font-semibold text-[var(--text)]">Double click or drag a preset to start</div>
                <div className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                  Drag from an output handle into empty space to get type-aware preset suggestions.
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-l border-[rgba(154,52,18,0.16)] bg-[rgba(255,248,240,0.76)] px-4 py-4">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Inspector</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
              {selectedNode ? selectedNode.data.config.label : "Graph"}
            </h2>
          </div>

          <div className="mt-4 min-h-0 space-y-4 overflow-y-auto pr-1">
            {!selectedNode ? (
              <div className="grid gap-4">
                <section className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
                  <div className="text-sm font-semibold text-[var(--text)]">Current Phase</div>
                  <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    <div>Preset-driven node creation</div>
                    <div>Structured inspector editing</div>
                    <div>Type-aware creation suggestions</div>
                    <div>Advanced JSON kept as fallback</div>
                    <div>Skill definitions connected</div>
                    <div>Preset persistence {presetsLoading ? "loading" : presetsError ? "degraded" : "connected"}</div>
                    <div>Runtime migration pending</div>
                  </div>
                </section>
                <section className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
                  <div className="text-sm font-semibold text-[var(--text)]">Graph Info</div>
                  <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    <div>Nodes: {nodes.length}</div>
                    <div>Edges: {edges.length}</div>
                    <div>Built from new preset system</div>
                  </div>
                </section>
              </div>
            ) : null}

            {selectedNode ? (
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Label</span>
                  <Input value={selectedNode.data.config.label} onChange={(event) => updateSelectedNode((config) => ({ ...config, label: event.target.value }))} />
                </label>
                <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                  <span>Description</span>
                  <Input value={selectedNode.data.config.description} onChange={(event) => updateSelectedNode((config) => ({ ...config, description: event.target.value }))} />
                </label>
                <div className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4 text-sm leading-6 text-[var(--muted)]">
                  <div>Family: {selectedNode.data.config.family}</div>
                  <div>Preset ID: {selectedNode.data.config.presetId}</div>
                </div>

                {selectedNode.data.config.family === "input" ? (
                  <>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Value Type</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.valueType}
                        onChange={(event) =>
                          updateSelectedNode((config) => {
                            const nextType = event.target.value as ValueType;
                            const inputConfig = config as InputBoundaryNode;
                            return {
                              ...inputConfig,
                              valueType: nextType,
                              output: {
                                ...inputConfig.output,
                                valueType: nextType,
                              },
                            };
                          })
                        }
                      >
                        {Object.keys(TYPE_COLORS).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Default Value</span>
                      <textarea
                        className="min-h-32 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.defaultValue}
                        onChange={(event) => updateSelectedNode((config) => ({ ...(config as InputBoundaryNode), defaultValue: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Placeholder</span>
                      <Input value={selectedNode.data.config.placeholder} onChange={(event) => updateSelectedNode((config) => ({ ...(config as InputBoundaryNode), placeholder: event.target.value }))} />
                    </label>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Input Mode</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.inputMode}
                        onChange={(event) =>
                          updateSelectedNode((config) => ({ ...(config as InputBoundaryNode), inputMode: event.target.value as InputBoundaryNode["inputMode"] }))
                        }
                      >
                        {["inline", "reference"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <PanelSection title="Output Port" description="输入边界只暴露一个输出端口。">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                          <span>Output Key</span>
                          <Input
                            value={selectedNode.data.config.output.key}
                            onChange={(event) =>
                              updateSelectedNode((config) => ({
                                ...(config as InputBoundaryNode),
                                output: {
                                  ...(config as InputBoundaryNode).output,
                                  key: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                          <span>Output Label</span>
                          <Input
                            value={selectedNode.data.config.output.label}
                            onChange={(event) =>
                              updateSelectedNode((config) => ({
                                ...(config as InputBoundaryNode),
                                output: {
                                  ...(config as InputBoundaryNode).output,
                                  label: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </PanelSection>
                    <AdvancedJsonSection
                      sections={[
                        {
                          label: "Input Boundary JSON",
                          value: selectedNode.data.config,
                          onChange: (nextValue) => updateSelectedNode(() => nextValue as InputBoundaryNode),
                          minHeight: "min-h-40",
                        },
                      ]}
                    />
                  </>
                ) : null}

                {selectedNode.data.config.family === "agent" ? (
                  <>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>System Instruction</span>
                      <textarea
                        className="min-h-28 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.systemInstruction}
                        onChange={(event) => updateSelectedNode((config) => ({ ...(config as AgentNode), systemInstruction: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Task Instruction</span>
                      <textarea
                        className="min-h-32 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.taskInstruction}
                        onChange={(event) => updateSelectedNode((config) => ({ ...(config as AgentNode), taskInstruction: event.target.value }))}
                      />
                    </label>
                    <PortEditorList
                      label="Inputs"
                      side="input"
                      ports={selectedNode.data.config.inputs}
                      onChange={(nextPorts) => updateSelectedNode((config) => ({ ...(config as AgentNode), inputs: nextPorts }))}
                    />
                    <PortEditorList
                      label="Outputs"
                      side="output"
                      ports={selectedNode.data.config.outputs}
                      onChange={(nextPorts) => updateSelectedNode((config) => ({ ...(config as AgentNode), outputs: nextPorts }))}
                    />
                    <SkillEditorList
                      skills={selectedNode.data.config.skills}
                      onChange={(nextSkills) => updateSelectedNode((config) => ({ ...(config as AgentNode), skills: nextSkills }))}
                      definitions={skillDefinitions}
                      definitionsLoading={skillDefinitionsLoading}
                      definitionsError={skillDefinitionsError}
                    />
                    <MappingEditor
                      title="Output Binding"
                      value={selectedNode.data.config.outputBinding}
                      addLabel="Add Output Binding"
                      onChange={(nextValue) => updateSelectedNode((config) => ({ ...(config as AgentNode), outputBinding: nextValue }))}
                    />
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Response Mode</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.responseMode}
                        onChange={(event) =>
                          updateSelectedNode((config) => ({ ...(config as AgentNode), responseMode: event.target.value as AgentNode["responseMode"] }))
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
                          value: selectedNode.data.config.inputs,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as AgentNode), inputs: nextValue as PortDefinition[] })),
                        },
                        {
                          label: "Outputs JSON",
                          value: selectedNode.data.config.outputs,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as AgentNode), outputs: nextValue as PortDefinition[] })),
                        },
                        {
                          label: "Skills JSON",
                          value: selectedNode.data.config.skills,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as AgentNode), skills: nextValue as AgentNode["skills"] })),
                        },
                        {
                          label: "Output Binding JSON",
                          value: selectedNode.data.config.outputBinding,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as AgentNode), outputBinding: nextValue as Record<string, string> })),
                          minHeight: "min-h-24",
                        },
                      ]}
                    />
                  </>
                ) : null}

                {selectedNode.data.config.family === "condition" ? (
                  <>
                    <PortEditorList
                      label="Inputs"
                      side="input"
                      ports={selectedNode.data.config.inputs}
                      onChange={(nextPorts) => updateSelectedNode((config) => ({ ...(config as ConditionNode), inputs: nextPorts }))}
                    />
                    <BranchEditorList
                      branches={selectedNode.data.config.branches}
                      onChange={(nextBranches) => updateSelectedNode((config) => ({ ...(config as ConditionNode), branches: nextBranches }))}
                    />
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Condition Mode</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.conditionMode}
                        onChange={(event) =>
                          updateSelectedNode((config) => ({ ...(config as ConditionNode), conditionMode: event.target.value as ConditionNode["conditionMode"] }))
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
                      rule={selectedNode.data.config.rule}
                      onChange={(nextRule) => updateSelectedNode((config) => ({ ...(config as ConditionNode), rule: nextRule }))}
                    />
                    <MappingEditor
                      title="Branch Mapping"
                      value={selectedNode.data.config.branchMapping}
                      addLabel="Add Branch Mapping"
                      onChange={(nextValue) => updateSelectedNode((config) => ({ ...(config as ConditionNode), branchMapping: nextValue }))}
                    />
                    <AdvancedJsonSection
                      sections={[
                        {
                          label: "Inputs JSON",
                          value: selectedNode.data.config.inputs,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as ConditionNode), inputs: nextValue as PortDefinition[] })),
                        },
                        {
                          label: "Branches JSON",
                          value: selectedNode.data.config.branches,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as ConditionNode), branches: nextValue as ConditionNode["branches"] })),
                          minHeight: "min-h-24",
                        },
                        {
                          label: "Rule JSON",
                          value: selectedNode.data.config.rule,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as ConditionNode), rule: nextValue as ConditionNode["rule"] })),
                          minHeight: "min-h-24",
                        },
                        {
                          label: "Branch Mapping JSON",
                          value: selectedNode.data.config.branchMapping,
                          onChange: (nextValue) => updateSelectedNode((config) => ({ ...(config as ConditionNode), branchMapping: nextValue as Record<string, string> })),
                          minHeight: "min-h-24",
                        },
                      ]}
                    />
                  </>
                ) : null}

                {selectedNode.data.config.family === "output" ? (
                  <>
                    <PanelSection title="Input Port" description="输出边界只接收一个上游输入。">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                          <span>Input Key</span>
                          <Input
                            value={selectedNode.data.config.input.key}
                            onChange={(event) =>
                              updateSelectedNode((config) => ({
                                ...(config as OutputBoundaryNode),
                                input: {
                                  ...(config as OutputBoundaryNode).input,
                                  key: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                          <span>Input Label</span>
                          <Input
                            value={selectedNode.data.config.input.label}
                            onChange={(event) =>
                              updateSelectedNode((config) => ({
                                ...(config as OutputBoundaryNode),
                                input: {
                                  ...(config as OutputBoundaryNode).input,
                                  label: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                          <span>Value Type</span>
                          <select
                            className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                            value={selectedNode.data.config.input.valueType}
                            onChange={(event) =>
                              updateSelectedNode((config) => ({
                                ...(config as OutputBoundaryNode),
                                input: {
                                  ...(config as OutputBoundaryNode).input,
                                  valueType: event.target.value as ValueType,
                                },
                              }))
                            }
                          >
                            {VALUE_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mt-7 flex items-center gap-2 text-sm text-[var(--muted)]">
                          <input
                            checked={Boolean(selectedNode.data.config.input.required)}
                            type="checkbox"
                            onChange={(event) =>
                              updateSelectedNode((config) => ({
                                ...(config as OutputBoundaryNode),
                                input: {
                                  ...(config as OutputBoundaryNode).input,
                                  required: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span>Required</span>
                        </label>
                      </div>
                    </PanelSection>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Display Mode</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.displayMode}
                        onChange={(event) => updateSelectedNode((config) => ({ ...(config as OutputBoundaryNode), displayMode: event.target.value as OutputBoundaryNode["displayMode"] }))}
                      >
                        {["auto", "plain", "markdown", "json"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <input
                        checked={selectedNode.data.config.persistEnabled}
                        type="checkbox"
                        onChange={(event) => updateSelectedNode((config) => ({ ...(config as OutputBoundaryNode), persistEnabled: event.target.checked }))}
                      />
                      <span>Persist output</span>
                    </label>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>Persist Format</span>
                      <select
                        className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                        value={selectedNode.data.config.persistFormat}
                        onChange={(event) => updateSelectedNode((config) => ({ ...(config as OutputBoundaryNode), persistFormat: event.target.value as OutputBoundaryNode["persistFormat"] }))}
                      >
                        {["txt", "md", "json"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                      <span>File Name Template</span>
                      <Input value={selectedNode.data.config.fileNameTemplate} onChange={(event) => updateSelectedNode((config) => ({ ...(config as OutputBoundaryNode), fileNameTemplate: event.target.value }))} />
                    </label>
                    <AdvancedJsonSection
                      sections={[
                        {
                          label: "Output Boundary JSON",
                          value: selectedNode.data.config,
                          onChange: (nextValue) => updateSelectedNode(() => nextValue as OutputBoundaryNode),
                          minHeight: "min-h-40",
                        },
                      ]}
                    />
                  </>
                ) : null}

                <Button variant="ghost" onClick={() => void saveSelectedNodeAsPreset()}>
                  Save As Preset
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
                    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
                    setSelectedNodeId(null);
                  }}
                >
                  Delete Node
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-[18px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] px-3 py-2 text-sm text-[var(--muted)]">
            <span>Status</span>
            <span className="text-[var(--text)]">{statusMessage}</span>
          </div>
          {activeRunId ? (
            <div className="mt-3 rounded-[18px] border border-[rgba(31,111,80,0.16)] bg-[rgba(241,250,245,0.92)] px-3 py-2 text-sm text-[var(--muted)]">
              Latest run: <a className="text-[var(--accent-strong)] underline" href={`/runs/${activeRunId}`}>{activeRunId}</a>
            </div>
          ) : null}
        </aside>
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
