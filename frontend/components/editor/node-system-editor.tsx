"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
import { RichContent, formatRichContentValue, resolveRichContentDisplayMode } from "@/components/ui/rich-content";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  buildCanonicalNodeFromLegacyNode,
  buildEditorNodeConfigFromCanonicalNode,
  buildEditorPresetRecordFromCanonicalPreset,
  buildEditorStateFieldsFromCanonicalGraph,
  type CanonicalPresetDocument,
  type CanonicalGraphPayload,
  type CanonicalTemplateRecord,
  type CanonicalNode,
  type EditorPresetRecord,
} from "@/lib/node-system-canonical";
import { EMPTY_AGENT_PRESET, getNodePresetById, NODE_PRESETS_MOCK, TEXT_INPUT_PRESET } from "@/lib/node-presets-mock";
import {
  isValueTypeCompatible,
  type AgentNode,
  type AgentThinkingMode,
  type BranchDefinition,
  type ConditionNode,
  type ConditionRule,
  type InputBoundaryNode,
  type NodeFamily,
  type NodeSystemRunDetail,
  type NodePresetDefinition,
  type NodeViewportSize,
  type OutputBoundaryNode,
  type PortDefinition,
  type RunNodeStatus,
  type RunStatus,
  type SkillAttachment,
  type StateField,
  type StateFieldType,
  type ValueType,
} from "@/lib/node-system-schema";

type GraphPayload = CanonicalGraphPayload;
type TemplateRecord = CanonicalTemplateRecord;

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
  displayName?: string;
  displayDescription?: string;
  previewText: string;
  resolvedDisplayMode?: string;
  executionStatus?: RunNodeStatus;
  isCurrentRunNode?: boolean;
  isExpanded?: boolean;
  collapsedSize?: NodeViewportSize | null;
  expandedSize?: NodeViewportSize | null;
  connectingSourceType?: ValueType | null;
  onConfigChange?: (updater: (config: NodePresetDefinition) => NodePresetDefinition) => void;
  onResizeEnd?: (width: number, height: number, isExpanded: boolean) => void;
  onToggleExpanded?: () => void;
  onDelete?: () => void;
  onSavePreset?: () => void;
  skillDefinitions?: SkillDefinition[];
  skillDefinitionsLoading?: boolean;
  skillDefinitionsError?: string | null;
  globalTextModelRef?: string;
  globalThinkingEnabled?: boolean;
  defaultAgentTemperature?: number;
  availableModelRefs?: string[];
  modelDisplayLookup?: Record<string, string>;
  knowledgeBases?: KnowledgeBaseOption[];
  stateFieldLookup?: Record<string, string>;
  stateFields?: StateField[];
  onRenameStateName?: (stateKey: string, nextName: string) => void;
  onBindStateToPort?: (side: "input" | "output", stateKey: string) => boolean;
  onCreateStateAndBindToPort?: (side: "input" | "output", field: StateField) => boolean;
  onOpenStatePanel?: () => void;
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

type KnowledgeBaseOption = {
  name: string;
  label?: string;
  version?: string;
  description?: string;
  documentCount?: number;
  chunkCount?: number;
};

type EditorSettingsPayload = {
  model: {
    text_model: string;
    text_model_ref: string;
    video_model: string;
    video_model_ref: string;
  };
  agent_runtime_defaults?: {
    model: string;
    thinking_enabled: boolean;
    temperature: number;
  };
  model_catalog?: {
    default_text_model_ref: string;
    default_video_model_ref: string;
    providers: Array<{
      provider_id: string;
      label: string;
      description: string;
      transport: string;
      configured: boolean;
      base_url: string;
      models: Array<{
        model_ref: string;
        model: string;
        label: string;
        reasoning: boolean;
        modalities: string[];
        context_window: number | null;
        max_tokens: number | null;
        route_target?: string | null;
      }>;
      example_model_refs: string[];
    }>;
  };
};

type RunDetail = NodeSystemRunDetail;
type CanonicalGraph = CanonicalGraphPayload;

type CreationMenuEntry = {
  id: string;
  family: NodeFamily;
  label: string;
  description: string;
  mode: "preset" | "node";
  presetId?: string;
  nodeKind?: "input" | "output";
};

type StateBindingSummary = {
  id: string;
  nodeId: string;
  nodeLabel: string;
  nodeFamily: NodeFamily;
  portKey: string;
  portLabel: string;
  valid: boolean;
};

type StateBindingNodeOption = {
  id: string;
  label: string;
  family: NodeFamily;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
};

const CREATION_MENU_FAMILY_PRIORITY: Record<NodeFamily, number> = {
  input: 0,
  output: 1,
  agent: 2,
  condition: 3,
};

const HELLO_WORLD_TEMPLATE_ID = "hello_world";
const DEFAULT_EDITOR_TEXT_MODEL_REF = "local/lm-local";
const DEFAULT_AGENT_THINKING_ENABLED = true;
const DEFAULT_AGENT_TEMPERATURE = 0.2;
const KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base";
const KNOWLEDGE_BASE_SKILL_LIMIT = "4";
const TYPE_COLORS: Record<ValueType, string> = {
  text: "#d97706",
  json: "#2563eb",
  image: "#0f766e",
  audio: "#7c3aed",
  video: "#be185d",
  file: "#475569",
  knowledge_base: "#0369a1",
  any: "#64748b",
};

const VALUE_TYPE_OPTIONS: ValueType[] = ["text", "json", "image", "audio", "video", "file", "knowledge_base", "any"];
const STATE_FIELD_TYPE_OPTIONS: StateFieldType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "markdown",
  "json",
  "file_list",
  "image",
  "audio",
  "video",
  "file",
  "knowledge_base",
];
const RULE_OPERATOR_OPTIONS: ConditionRule["operator"][] = ["==", "!=", ">=", "<=", ">", "<", "exists"];

const INPUT_TYPE_BUTTONS: Array<{ value: ValueType; label: string; icon: ReactNode }> = [
  {
    value: "text",
    label: "文本",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <path d="M3 4.5h10M8 4.5v7M5.5 11.5h5" />
      </svg>
    ),
  },
  {
    value: "file",
    label: "文件",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <path d="M5 2.5h4l2.5 2.5V12a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3.5 12V4A1.5 1.5 0 0 1 5 2.5Z" />
        <path d="M9 2.5V5h2.5" />
      </svg>
    ),
  },
  {
    value: "knowledge_base",
    label: "知识库",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
        <path d="M3 3.5h10v9H3z" />
        <path d="M5.5 3.5V2M8 3.5V2M10.5 3.5V2" />
        <path d="M5.5 6.5h5M5.5 9h3" />
      </svg>
    ),
  },
];

const OUTPUT_DISPLAY_MODE_BUTTONS: Array<{ value: OutputBoundaryNode["displayMode"]; label: string }> = [
  { value: "auto", label: "AUTO" },
  { value: "plain", label: "PLAIN" },
  { value: "markdown", label: "MD" },
  { value: "json", label: "JSON" },
];

const OUTPUT_SAVE_FORMAT_BUTTONS: Array<{ value: OutputBoundaryNode["persistFormat"]; label: string }> = [
  { value: "auto", label: "AUTO" },
  { value: "txt", label: "TXT" },
  { value: "md", label: "MD" },
  { value: "json", label: "JSON" },
];

function normalizeAgentTemperature(value: number | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_AGENT_TEMPERATURE;
  return Math.min(2, Math.max(0, numeric));
}

function defaultStateValueForType(type: StateFieldType): unknown {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "object":
    case "json":
      return {};
    case "array":
    case "file_list":
      return [];
    case "image":
    case "audio":
    case "video":
    case "file":
    case "knowledge_base":
    case "markdown":
    case "string":
    default:
      return "";
  }
}

function createStateKey(base: string, existingKeys: string[]) {
  const normalizedBase = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "state";
  let nextKey = normalizedBase;
  let index = 2;
  const existing = new Set(existingKeys);
  while (existing.has(nextKey)) {
    nextKey = `${normalizedBase}_${index}`;
    index += 1;
  }
  return nextKey;
}

function getStateDisplayName(field: Pick<StateField, "key" | "name">) {
  return String(field.name ?? "").trim() || field.key;
}

function createDefaultStateField(existingKeys: string[]): StateField {
  const key = createStateKey(`state_${existingKeys.length + 1}`, existingKeys);
  return {
    key,
    type: "string",
    name: key,
    description: "",
    value: "",
    ui: {
      color: "",
    },
  };
}

function isStructuredStateType(type: StateFieldType) {
  return type === "object" || type === "array" || type === "json" || type === "file_list";
}

function stateFieldTypeToValueType(type: StateFieldType): ValueType {
  switch (type) {
    case "object":
    case "array":
    case "json":
    case "file_list":
      return "json";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "file":
      return "file";
    case "knowledge_base":
      return "knowledge_base";
    case "number":
    case "boolean":
    case "markdown":
    case "string":
    default:
      return "text";
  }
}

function valueTypeToStateFieldType(type: ValueType): StateFieldType {
  switch (type) {
    case "json":
      return "json";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "file":
      return "file";
    case "knowledge_base":
      return "knowledge_base";
    case "text":
    case "any":
    default:
      return "string";
  }
}

function stateFieldTypeToCanonicalStateType(type: StateFieldType): CanonicalGraphPayload["state_schema"][string]["type"] {
  switch (type) {
    case "string":
      return "text";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    case "array":
      return "array";
    case "markdown":
      return "markdown";
    case "json":
      return "json";
    case "file_list":
      return "file_list";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "file":
      return "file";
    case "knowledge_base":
      return "knowledge_base";
    default:
      return "text";
  }
}

function getStateFieldByKey(stateFields: StateField[], stateKey: string) {
  return stateFields.find((field) => field.key === stateKey);
}

function stringifyStateValue(value: unknown, type: StateFieldType) {
  if (!isStructuredStateType(type)) {
    return String(value ?? "");
  }

  const fallback = type === "array" || type === "file_list" ? [] : {};
  return JSON.stringify(value ?? fallback, null, 2);
}

function normalizeNodeConfig<T extends NodePresetDefinition>(config: T): T {
  const normalizedName =
    String((config as { name?: string }).name ?? "").trim() ||
    String((config as { label?: string }).label ?? "").trim() ||
    "Node";
  const normalizedStateReads = config.stateReads ?? [];
  const normalizedStateWrites = (config.stateWrites ?? []).map((binding) => ({
    ...binding,
    mode: binding.mode ?? "replace",
  }));

  if (config.family === "input") {
    const legacyConfig = config as InputBoundaryNode & { defaultValue?: string };
    return {
      ...legacyConfig,
      name: normalizedName,
      value: legacyConfig.value ?? legacyConfig.defaultValue ?? "",
      stateReads: normalizedStateReads,
      stateWrites: normalizedStateWrites,
    } as T;
  }

  if (config.family !== "agent") {
    return {
      ...config,
      name: normalizedName,
      stateReads: normalizedStateReads,
      stateWrites: normalizedStateWrites,
    } as T;
  }

  const normalizedConfig = {
    ...config,
    name: normalizedName,
    stateReads: normalizedStateReads,
    stateWrites: normalizedStateWrites,
    modelSource: config.modelSource ?? "global",
    model: config.model ?? "",
    thinkingMode: config.thinkingMode === "off" ? "off" : "on",
    temperature: normalizeAgentTemperature(config.temperature),
  } satisfies AgentNode;
  return normalizedConfig as T;
}

function getNodeDisplayName(config: NodePresetDefinition, nodeId?: string) {
  return (
    String((config as { name?: string }).name ?? "").trim() ||
    String((config as { label?: string }).label ?? "").trim() ||
    nodeId ||
    "node"
  );
}

function getCanonicalNodeDisplayName(canonicalGraph: CanonicalGraphPayload, nodeId: string) {
  return canonicalGraph.nodes[nodeId]?.name?.trim() || nodeId;
}

function withNodeStateBindings(
  config: NodePresetDefinition,
  stateReads: NodePresetDefinition["stateReads"],
  stateWrites: NodePresetDefinition["stateWrites"],
) {
  return normalizeNodeConfig({
    ...config,
    stateReads,
    stateWrites,
  } as NodePresetDefinition);
}

function renameStateKeyInPort(port: PortDefinition, currentKey: string, nextKey: string): PortDefinition {
  if (port.key !== currentKey) return port;
  return {
    ...port,
    key: nextKey,
    label: port.label === currentKey ? nextKey : port.label,
  };
}

function renameStateKeyInNodeConfig(config: NodePresetDefinition, currentKey: string, nextKey: string): NodePresetDefinition {
  if (config.family === "input") {
    return normalizeNodeConfig({
      ...config,
      output: renameStateKeyInPort(config.output, currentKey, nextKey),
      stateWrites: (config.stateWrites ?? []).map((binding) =>
        binding.stateKey === currentKey || binding.outputKey === currentKey
          ? {
              ...binding,
              stateKey: binding.stateKey === currentKey ? nextKey : binding.stateKey,
              outputKey: binding.outputKey === currentKey ? nextKey : binding.outputKey,
            }
          : binding,
      ),
    } satisfies InputBoundaryNode);
  }

  if (config.family === "output") {
    return normalizeNodeConfig({
      ...config,
      input: renameStateKeyInPort(config.input, currentKey, nextKey),
      stateReads: (config.stateReads ?? []).map((binding) =>
        binding.stateKey === currentKey || binding.inputKey === currentKey
          ? {
              ...binding,
              stateKey: binding.stateKey === currentKey ? nextKey : binding.stateKey,
              inputKey: binding.inputKey === currentKey ? nextKey : binding.inputKey,
            }
          : binding,
      ),
    } satisfies OutputBoundaryNode);
  }

  if (config.family === "condition") {
    return normalizeNodeConfig({
      ...config,
      inputs: config.inputs.map((port) => renameStateKeyInPort(port, currentKey, nextKey)),
      stateReads: (config.stateReads ?? []).map((binding) =>
        binding.stateKey === currentKey || binding.inputKey === currentKey
          ? {
              ...binding,
              stateKey: binding.stateKey === currentKey ? nextKey : binding.stateKey,
              inputKey: binding.inputKey === currentKey ? nextKey : binding.inputKey,
            }
          : binding,
      ),
    } satisfies ConditionNode);
  }

  return normalizeNodeConfig({
    ...config,
    inputs: config.inputs.map((port) => renameStateKeyInPort(port, currentKey, nextKey)),
    outputs: config.outputs.map((port) => renameStateKeyInPort(port, currentKey, nextKey)),
    stateReads: (config.stateReads ?? []).map((binding) =>
      binding.stateKey === currentKey || binding.inputKey === currentKey
        ? {
            ...binding,
            stateKey: binding.stateKey === currentKey ? nextKey : binding.stateKey,
            inputKey: binding.inputKey === currentKey ? nextKey : binding.inputKey,
          }
        : binding,
    ),
    stateWrites: (config.stateWrites ?? []).map((binding) =>
      binding.stateKey === currentKey || binding.outputKey === currentKey
        ? {
            ...binding,
            stateKey: binding.stateKey === currentKey ? nextKey : binding.stateKey,
            outputKey: binding.outputKey === currentKey ? nextKey : binding.outputKey,
          }
        : binding,
    ),
  } satisfies AgentNode);
}

function resolveAgentRuntimeConfig(
  config: AgentNode,
  defaults?: {
    globalTextModelRef?: string;
    globalThinkingEnabled?: boolean;
    defaultAgentTemperature?: number;
  },
) {
  const normalizedConfig = normalizeNodeConfig(config) as AgentNode;
  const globalTextModelRef = defaults?.globalTextModelRef || DEFAULT_EDITOR_TEXT_MODEL_REF;
  const globalThinkingEnabled = defaults?.globalThinkingEnabled ?? DEFAULT_AGENT_THINKING_ENABLED;
  const defaultAgentTemperature = normalizeAgentTemperature(defaults?.defaultAgentTemperature);
  const overrideModel = normalizedConfig.model?.trim() ?? "";
  const resolvedModel =
    normalizedConfig.modelSource === "override" && overrideModel ? overrideModel : globalTextModelRef;
  const resolvedThinking = normalizedConfig.thinkingMode === "on";
  const resolvedTemperature = normalizeAgentTemperature(normalizedConfig.temperature ?? defaultAgentTemperature);

  return {
    ...normalizedConfig,
    globalTextModelRef,
    globalThinkingEnabled,
    defaultAgentTemperature,
    resolvedModel,
    resolvedThinking,
    resolvedTemperature,
  };
}

const NODE_SELECT_CLASS =
  "min-h-[44px] w-full appearance-none rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3.5 py-3 pr-10 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] outline-none transition focus:border-[rgba(154,52,18,0.28)] focus:bg-white";

const NODE_TEXTAREA_CLASS =
  "w-full resize-none rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] px-3.5 py-3 text-sm leading-6 text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] outline-none transition focus:border-[rgba(154,52,18,0.28)] focus:bg-white";

type FieldSelectOption = {
  value: string;
  label: string;
  detail?: string;
};

function FieldSelect({
  value,
  onValueChange,
  options,
  className,
  wrapperClassName,
  iconClassName,
  menuClassName,
  triggerLabelClassName,
  optionLabelClassName,
  tone = "light",
  menuTone = "light",
  align = "start",
  ariaLabel,
  title,
  disabled = false,
  minMenuWidth = 0,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: FieldSelectOption[];
  className?: string;
  wrapperClassName?: string;
  iconClassName?: string;
  menuClassName?: string;
  triggerLabelClassName?: string;
  optionLabelClassName?: string;
  tone?: "light" | "dark";
  menuTone?: "light" | "dark";
  align?: "start" | "end";
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  minMenuWidth?: number;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const preferredPlacement: FloatingPlacement = align === "end" ? "bottom-end" : "bottom-start";
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex] ?? options[0] ?? null;
  const isDisabled = disabled || options.length === 0;
  const resolvedMenuWidth = menuWidth ? Math.max(menuWidth, minMenuWidth) : minMenuWidth || undefined;

  useEffect(() => {
    if (!open) return;

    const syncMenuWidth = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuWidth(Math.round(rect.width));
    };

    syncMenuWidth();

    if (typeof ResizeObserver === "undefined" || !triggerRef.current) {
      window.addEventListener("resize", syncMenuWidth);
      return () => window.removeEventListener("resize", syncMenuWidth);
    }

    const observer = new ResizeObserver(syncMenuWidth);
    observer.observe(triggerRef.current);
    window.addEventListener("resize", syncMenuWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncMenuWidth);
    };
  }, [minMenuWidth, open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const frameId = window.requestAnimationFrame(() => {
      menuRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (isDisabled && open) {
      setOpen(false);
    }
  }, [isDisabled, open]);

  const stopSelectEvent = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  const stopDragEvent = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  const selectOption = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  const moveActiveIndex = (direction: 1 | -1) => {
    if (options.length === 0) return;
    setActiveIndex((current) => {
      const baseIndex = current >= 0 ? current : selectedIndex >= 0 ? selectedIndex : 0;
      return (baseIndex + direction + options.length) % options.length;
    });
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        return;
      }
      moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(options.length - 1, 0));
        return;
      }
      moveActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(options.length - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) {
        selectOption(options[activeIndex].value);
      }
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const triggerToneClassName =
    tone === "dark"
      ? "border-[rgba(15,23,42,0.12)] bg-[rgba(30,36,48,0.96)] text-[rgba(255,250,241,0.96)] shadow-[0_10px_18px_rgba(15,23,42,0.16)] focus:border-[rgba(217,119,6,0.32)] focus:bg-[rgba(38,44,56,0.98)]"
      : "border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.88)] text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:border-[rgba(154,52,18,0.22)]";

  const menuToneClassName =
    menuTone === "dark"
      ? "border-[rgba(15,23,42,0.18)] bg-[rgba(30,36,48,0.98)]"
      : "border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)]";

  const optionBaseClassName =
    menuTone === "dark"
      ? "text-[rgba(255,250,241,0.92)] hover:bg-[rgba(255,255,255,0.08)]"
      : "text-[var(--text)] hover:bg-[rgba(154,52,18,0.08)]";

  const optionSelectedClassName =
    menuTone === "dark"
      ? "bg-[rgba(217,119,6,0.18)] text-[rgba(255,250,241,0.98)]"
      : "bg-[rgba(154,52,18,0.12)] text-[var(--accent-strong)]";

  const optionActiveClassName =
    menuTone === "dark"
      ? "bg-[rgba(255,255,255,0.06)]"
      : "bg-[rgba(154,52,18,0.06)]";

  return (
    <div className={cn("relative nodrag nowheel pointer-events-auto", wrapperClassName)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        title={title}
        disabled={isDisabled}
        onPointerDown={stopDragEvent}
        onMouseDown={stopDragEvent}
        onKeyDown={handleTriggerKeyDown}
        onClick={(event) => {
          stopSelectEvent(event);
          if (isDisabled) return;
          setOpen((current) => !current);
        }}
        className={cn(
          NODE_SELECT_CLASS,
          "nodrag nowheel pointer-events-auto flex items-center text-left",
          triggerToneClassName,
          isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className,
        )}
      >
        <span className={cn("block min-w-0 flex-1 truncate", triggerLabelClassName)}>{selectedOption?.label ?? value}</span>
      </button>
      <svg
        viewBox="0 0 16 16"
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-[var(--muted)] transition-transform",
          open ? "rotate-180" : null,
          tone === "dark" ? "stroke-[rgba(255,250,241,0.72)]" : null,
          iconClassName,
        )}
        strokeWidth="1.5"
      >
        <path d="m4.5 6 3.5 4 3.5-4" />
      </svg>
      <FloatingLayer anchorRef={triggerRef} open={open} placement={preferredPlacement}>
        <div
          id={listboxId}
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          tabIndex={-1}
          className={cn(
            "nodrag nowheel pointer-events-auto max-h-[260px] overflow-y-auto overflow-x-hidden rounded-[16px] border p-1 shadow-[0_20px_40px_rgba(60,41,20,0.18)] backdrop-blur focus:outline-none",
            menuToneClassName,
            menuClassName,
          )}
          style={{ width: resolvedMenuWidth ? `${resolvedMenuWidth}px` : undefined }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="grid gap-1">
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;
              return (
                <button
                  id={`${listboxId}-option-${index}`}
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "nodrag nowheel pointer-events-auto flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left text-sm transition",
                    optionBaseClassName,
                    selected ? optionSelectedClassName : active ? optionActiveClassName : null,
                  )}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    selectOption(option.value);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", optionLabelClassName)}>{option.label}</span>
                    {option.detail ? (
                      <span
                        className={cn(
                          "mt-0.5 block text-[0.72rem]",
                          menuTone === "dark" ? "text-[rgba(255,250,241,0.56)]" : "text-[var(--muted)]",
                        )}
                      >
                        {option.detail}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn("opacity-0 transition", selected ? "opacity-100" : null)}>
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                      <path d="m3.5 8.5 3 3 6-7" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </FloatingLayer>
    </div>
  );
}

function FieldTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(NODE_TEXTAREA_CLASS, className)} {...props} />;
}

function FloatingEditorCard({
  anchorRef,
  open,
  placement,
  title,
  description,
  widthClassName = "w-[360px]",
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  placement: FloatingPlacement;
  title: string;
  description?: string;
  widthClassName?: string;
  children: ReactNode;
}) {
  return (
    <FloatingLayer anchorRef={anchorRef} open={open} placement={placement}>
      <div
        className={cn(
          widthClassName,
          "rounded-[20px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.98)] p-4 shadow-[0_18px_40px_rgba(60,41,20,0.16)] backdrop-blur",
        )}
      >
        <div className="mb-3">
          <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
          {description ? <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</div> : null}
        </div>
        <div className="grid gap-3">{children}</div>
      </div>
    </FloatingLayer>
  );
}

function PanelIconButton({
  label,
  tone = "neutral",
  onClick,
  children,
}: {
  label: string;
  tone?: "neutral" | "positive" | "danger";
  onClick: () => void;
  children: ReactNode;
}) {
  const toneClassName =
    tone === "positive"
      ? "border-[rgba(21,128,61,0.16)] bg-[rgba(240,253,244,0.9)] text-[#15803d] hover:border-[rgba(21,128,61,0.28)] hover:bg-[rgba(240,253,244,1)]"
      : tone === "danger"
        ? "border-[rgba(185,28,28,0.16)] bg-[rgba(255,248,248,0.92)] text-[rgb(153,27,27)] hover:border-[rgba(185,28,28,0.28)] hover:bg-[rgba(255,248,248,1)]"
        : "border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.88)] text-[var(--text)] hover:border-[rgba(154,52,18,0.28)] hover:bg-white";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-[14px] border shadow-[0_8px_18px_rgba(60,41,20,0.08)] transition hover:-translate-y-0.5",
        toneClassName,
      )}
    >
      {children}
    </button>
  );
}

function EditorSwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.78)] px-3.5 py-3">
      <span className="text-sm text-[var(--text)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-[var(--accent)]" : "bg-[rgba(154,52,18,0.2)]",
        )}
        onClick={() => onCheckedChange(!checked)}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

function InlineRuntimeSelect({
  value,
  onChange,
  options,
  ariaLabel,
  minMenuWidth = 0,
  className,
  triggerLabelClassName,
  optionLabelClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FieldSelectOption[];
  ariaLabel: string;
  minMenuWidth?: number;
  className?: string;
  triggerLabelClassName?: string;
  optionLabelClassName?: string;
}) {
  return (
    <div className="nodrag nowheel pointer-events-auto">
      <FieldSelect
        ariaLabel={ariaLabel}
        title={ariaLabel}
        value={value}
        onValueChange={onChange}
        options={options}
        minMenuWidth={minMenuWidth}
        wrapperClassName="min-w-0"
        triggerLabelClassName={triggerLabelClassName}
        optionLabelClassName={optionLabelClassName}
        className={cn(
          "nodrag nowheel min-h-[52px] min-w-0 rounded-[18px] px-4 py-3 pr-10 text-[0.94rem] font-medium leading-5",
          className,
        )}
      />
    </div>
  );
}

function formatModelChoiceLabel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

function getConcreteModelName(model: {
  model_ref: string;
  model: string;
  label: string;
  route_target?: string | null;
}) {
  return (
    model.route_target?.trim() ||
    model.label?.trim() ||
    model.model?.trim() ||
    formatModelChoiceLabel(model.model_ref)
  );
}

function buildModelDisplayLookup(
  models: Array<{
    model_ref: string;
    model: string;
    label: string;
    route_target?: string | null;
  }>,
) {
  const baseLabels = models.map((model) => getConcreteModelName(model));
  const duplicateCount = new Map<string, number>();
  for (const label of baseLabels) {
    duplicateCount.set(label, (duplicateCount.get(label) ?? 0) + 1);
  }

  return Object.fromEntries(
    models.map((model, index) => {
      const baseLabel = baseLabels[index];
      const alias = model.model?.trim() || formatModelChoiceLabel(model.model_ref);
      const label =
        (duplicateCount.get(baseLabel) ?? 0) > 1 && alias && alias !== baseLabel
          ? `${baseLabel} · ${alias}`
          : baseLabel;
      return [model.model_ref, label];
    }),
  ) as Record<string, string>;
}

function getModelDisplayLabel(
  modelRef: string,
  modelDisplayLookup: Record<string, string>,
) {
  return modelDisplayLookup[modelRef] || formatModelChoiceLabel(modelRef);
}

function buildModelSelectOptions(
  agentRuntime: ReturnType<typeof resolveAgentRuntimeConfig>,
  availableModelRefs: string[],
  modelDisplayLookup: Record<string, string>,
) {
  const resolvedModel = agentRuntime.resolvedModel?.trim() ?? "";
  const options: FieldSelectOption[] = [];
  const seen = new Set<string>();
  const candidates = resolvedModel
    ? [resolvedModel, ...availableModelRefs]
    : availableModelRefs;

  for (const modelRef of candidates) {
    const trimmed = modelRef.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    options.push({
      value: trimmed,
      label: getModelDisplayLabel(trimmed, modelDisplayLookup),
    });
  }

  return options;
}

function buildThinkingSelectOptions() {
  return [
    {
      value: "off",
      label: "thinking off",
    },
    {
      value: "on",
      label: "thinking on",
    },
  ];
}

function AgentInlineRuntimeControls({
  agentRuntime,
  availableModelRefs,
  modelDisplayLookup,
  onConfigChange,
}: {
  agentRuntime: ReturnType<typeof resolveAgentRuntimeConfig>;
  availableModelRefs: string[];
  modelDisplayLookup: Record<string, string>;
  onConfigChange: (updater: (config: AgentNode) => AgentNode) => void;
}) {
  const modelOptions = buildModelSelectOptions(agentRuntime, availableModelRefs, modelDisplayLookup);
  const thinkingOptions = buildThinkingSelectOptions();
  const selectedModelValue = agentRuntime.resolvedModel;

  return (
    <div className="grid grid-cols-[minmax(0,1.9fr)_132px] items-start gap-2">
      <InlineRuntimeSelect
        ariaLabel="Select model"
        value={selectedModelValue}
        options={modelOptions}
        minMenuWidth={340}
        className="text-[0.9rem]"
        triggerLabelClassName="whitespace-nowrap"
        optionLabelClassName="whitespace-normal break-words leading-6"
        onChange={(nextValue) =>
          onConfigChange((currentConfig) => {
            const currentAgent = currentConfig as AgentNode;
            if (nextValue === agentRuntime.globalTextModelRef) {
              return {
                ...currentAgent,
                modelSource: "global",
                model: "",
              };
            }
            return {
              ...currentAgent,
              modelSource: "override",
              model: nextValue,
            };
          })
        }
      />
      <InlineRuntimeSelect
        ariaLabel="Select thinking mode"
        value={agentRuntime.resolvedThinking ? "on" : "off"}
        options={thinkingOptions}
        minMenuWidth={180}
        className="text-[0.88rem]"
        triggerLabelClassName="whitespace-nowrap"
        optionLabelClassName="whitespace-normal break-words leading-6"
        onChange={(nextValue) =>
          onConfigChange((currentConfig) => ({
            ...(currentConfig as AgentNode),
            thinkingMode: nextValue as AgentThinkingMode,
          }))
        }
      />
    </div>
  );
}

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
    case "knowledge_base":
      return "Knowledge Base";
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

function formatValueTypeDetail(valueType: ValueType) {
  switch (valueType) {
    case "text":
      return "Plain prompts, prose, and free-form strings.";
    case "json":
      return "Structured objects and machine-readable payloads.";
    case "image":
      return "Image files or generated visuals.";
    case "audio":
      return "Audio clips, speech, or sound assets.";
    case "video":
      return "Video assets and motion outputs.";
    case "file":
      return "Generic uploaded files with no fixed schema.";
    case "knowledge_base":
      return "A reference to one of the workspace knowledge bases.";
    case "any":
      return "Accept any compatible upstream value.";
    default:
      return "";
  }
}

const VALUE_TYPE_SELECT_OPTIONS: FieldSelectOption[] = VALUE_TYPE_OPTIONS.map((option) => ({
  value: option,
  label: formatValueTypeLabel(option),
  detail: formatValueTypeDetail(option),
}));

const RULE_OPERATOR_SELECT_OPTIONS: FieldSelectOption[] = RULE_OPERATOR_OPTIONS.map((option) => ({
  value: option,
  label: option,
}));

const CONDITION_MODE_SELECT_OPTIONS: FieldSelectOption[] = [
  { value: "rule", label: "Rule", detail: "Evaluate an explicit source/operator/value rule." },
  { value: "cycle", label: "Cycle", detail: "Use the rule as a loop gate inside a cyclic graph." },
  // { value: "model", label: "Model", detail: "Let the model decide the branch from context." },
];

function normalizeViewportSize(size: unknown): NodeViewportSize | null {
  if (!size || typeof size !== "object") return null;
  const candidate = size as Record<string, unknown>;
  const width = typeof candidate.width === "number" && Number.isFinite(candidate.width) ? candidate.width : undefined;
  const height = typeof candidate.height === "number" && Number.isFinite(candidate.height) ? candidate.height : undefined;
  if (width === undefined && height === undefined) return null;
  return { width, height };
}

function getInitialExpandedHeight(config: NodePresetDefinition) {
  if (config.family === "agent") return 520;
  if (config.family === "condition") return 440;
  if (config.family === "output") return 360;
  return getNodeMinHeight(config);
}

function buildNodeStyleFromState(
  config: NodePresetDefinition,
  isExpanded: boolean,
  size: NodeViewportSize | null,
  fallbackWidth?: number,
  fallbackHeight?: number,
) {
  const width = size?.width ?? fallbackWidth ?? getDefaultNodeWidth(config);
  const height = size?.height ?? fallbackHeight;
  return {
    background: "transparent",
    border: "none",
    padding: 0,
    width,
    ...(typeof height === "number" ? { height } : {}),
  };
}

function resolveNodeExecutionVisual(status?: RunNodeStatus, isCurrentRunNode?: boolean) {
  if (status === "running") {
    return {
      haloClass: isCurrentRunNode ? "node-execution-halo-running-current" : "node-execution-halo-running",
      shellClass: isCurrentRunNode ? "node-execution-shell-running-current" : "node-execution-shell-running",
    };
  }
  if (status === "success") {
    return {
      shellClass: "node-execution-shell-success",
    };
  }
  if (status === "failed") {
    return {
      shellClass: "node-execution-shell-failed",
    };
  }
  return null;
}

function summarizeRunNodeStates(nodeIds: string[], nodeStatusMap: Record<string, RunNodeStatus>) {
  return nodeIds.reduce(
    (counts, nodeId) => {
      const status = nodeStatusMap[nodeId] ?? "idle";
      counts[status] += 1;
      return counts;
    },
    {
      idle: 0,
      running: 0,
      success: 0,
      failed: 0,
    } satisfies Record<RunNodeStatus, number>,
  );
}

function isPresetEligibleFamily(family: NodeFamily) {
  return family === "agent" || family === "condition";
}

function createGenericInputNodeConfig(): InputBoundaryNode {
  const baseConfig = deepClonePreset(TEXT_INPUT_PRESET);
  return {
    ...baseConfig,
    presetId: "node.input.generic",
    name: "Input",
    description: "Provide a value to the current workflow.",
    output: {
      ...baseConfig.output,
      key: "value",
      label: "Value",
      valueType: "text",
    },
    valueType: "text",
  } satisfies InputBoundaryNode;
}

function createGenericOutputNodeConfig(sourceType: ValueType | null = null): OutputBoundaryNode {
  return {
    presetId: "node.output.generic",
    name: "Output",
    description: "Preview or persist the current workflow result.",
    family: "output",
    input: {
      key: "value",
      label: "Value",
      valueType: sourceType ?? "any",
      required: true,
    },
    displayMode: "auto",
    persistEnabled: false,
    persistFormat: "auto",
    fileNameTemplate: "",
  } satisfies OutputBoundaryNode;
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
      name: preferredTemplate.default_graph_name,
      state_schema: preferredTemplate.state_schema,
      nodes: preferredTemplate.nodes,
      edges: preferredTemplate.edges,
      conditional_edges: preferredTemplate.conditional_edges,
      metadata: preferredTemplate.metadata,
      graph_id: null,
    };
  }

  return {
    graph_id: null,
    name: "Node System Playground",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function createFlowNodeFromCanonicalNode(
  nodeId: string,
  node: CanonicalNode,
  stateSchema: CanonicalGraphPayload["state_schema"],
): FlowNode {
  const config = normalizeNodeConfig(deepClonePreset(buildEditorNodeConfigFromCanonicalNode(nodeId, node, stateSchema)));
  const isExpanded = config.family === "input" ? true : !Boolean(node.ui.collapsed);
  const collapsedSize = normalizeViewportSize(node.ui.collapsedSize);
  const expandedSize = normalizeViewportSize(node.ui.expandedSize);
  const activeSize = isExpanded ? expandedSize : collapsedSize;
  const defaultWidth = getDefaultNodeWidth(config);
  return {
    id: nodeId,
    type: "default",
    position: node.ui.position ?? { x: 0, y: 0 },
    data: {
      nodeId,
      config,
      previewText: "",
      isExpanded,
      collapsedSize,
      expandedSize,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: buildNodeStyleFromState(config, isExpanded, activeSize, defaultWidth),
  } satisfies FlowNode;
}

function createFlowEdgeFromCanonicalEdge(edge: CanonicalGraphPayload["edges"][number], nodesById: Map<string, FlowNode>): Edge {
  const sourceNode = nodesById.get(edge.source);
  const flowSourceHandle = `output:${edge.sourceHandle.split(":", 2)[1] ?? edge.sourceHandle}`;
  const flowTargetHandle = `input:${edge.targetHandle.split(":", 2)[1] ?? edge.targetHandle}`;
  const sourceType = sourceNode ? getPortType(sourceNode.data.config, flowSourceHandle) : "any";
  const color = TYPE_COLORS[sourceType ?? "any"];
  return {
    id: `edge:${edge.source}:${edge.sourceHandle}:${edge.target}:${edge.targetHandle}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: flowSourceHandle,
    targetHandle: flowTargetHandle,
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: {
      stroke: color,
      strokeWidth: 1.8,
    },
  } satisfies Edge;
}

function firstCanonicalInputHandle(node: CanonicalNode | undefined): string | null {
  if (!node) return null;
  const firstRead = node.reads[0];
  return firstRead ? `input:${firstRead.state}` : null;
}

function createFlowEdgesFromCanonicalGraph(graph: CanonicalGraphPayload, nodesById: Map<string, FlowNode>): Edge[] {
  const edges = graph.edges.map((edge) => createFlowEdgeFromCanonicalEdge(edge, nodesById));
  for (const conditionalEdge of graph.conditional_edges) {
    for (const [branchKey, target] of Object.entries(conditionalEdge.branches)) {
      const sourceNode = nodesById.get(conditionalEdge.source);
      const sourceType = sourceNode ? getPortType(sourceNode.data.config, `output:${branchKey}`) : "any";
      const color = TYPE_COLORS[sourceType ?? "any"];
      edges.push({
        id: `conditional:${conditionalEdge.source}:${branchKey}:${target}`,
        source: conditionalEdge.source,
        target,
        sourceHandle: `output:${branchKey}`,
        targetHandle: firstCanonicalInputHandle(graph.nodes[target]),
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: {
          stroke: color,
          strokeWidth: 1.8,
        },
      } satisfies Edge);
    }
  }
  return edges;
}

function buildCanonicalNodeFromFlowNode(node: FlowNode, config: NodePresetDefinition = node.data.config) {
  return buildCanonicalNodeFromLegacyNode({
    id: node.id,
    type: node.type ?? "default",
    position: node.position,
    data: {
      nodeId: node.data.nodeId,
      config,
      previewText: node.data.previewText ?? "",
      isExpanded: config.family === "input" ? true : Boolean(node.data.isExpanded),
      collapsedSize: node.data.collapsedSize ?? null,
      expandedSize: node.data.expandedSize ?? null,
    },
  });
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

function listStateWritablePorts(config: NodePresetDefinition) {
  if (config.family === "output") {
    return [config.input];
  }
  return listOutputPorts(config);
}

function getBoundStateKeyForPort(config: NodePresetDefinition, side: "input" | "output", portKey: string) {
  if (side === "input") {
    if (config.family === "agent" || config.family === "condition") {
      return (config.stateReads ?? []).find((binding) => binding.inputKey === portKey)?.stateKey ?? portKey;
    }
    if (config.family === "output") {
      return (config.stateReads ?? []).find((binding) => binding.inputKey === portKey)?.stateKey ?? portKey;
    }
    return null;
  }

  if (config.family === "agent" || config.family === "input") {
    return (config.stateWrites ?? []).find((binding) => binding.outputKey === portKey)?.stateKey ?? portKey;
  }

  return null;
}

function resolvePortForDisplay(
  config: NodePresetDefinition,
  side: "input" | "output",
  port: PortDefinition,
  stateFields: StateField[],
): PortDefinition {
  const stateKey = getBoundStateKeyForPort(config, side, port.key);
  const stateField = stateKey ? getStateFieldByKey(stateFields, stateKey) : null;
  if (!stateField) {
    return port;
  }

  return {
    ...port,
    label: getStateDisplayName(stateField),
    valueType: stateFieldTypeToValueType(stateField.type),
  };
}

function resolvePortsForDisplay(
  config: NodePresetDefinition,
  side: "input" | "output",
  stateFields: StateField[],
) {
  const ports = side === "input" ? listInputPorts(config) : listOutputPorts(config);
  return ports.map((port) => resolvePortForDisplay(config, side, port, stateFields));
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

const GENERIC_STATE_KEYS = new Set(["value", "input", "output", "result", "text"]);

function chooseStateKeyForConnection(sourceStateKey: string, targetStateKey: string) {
  if (sourceStateKey === targetStateKey) return sourceStateKey;
  const sourceGeneric = GENERIC_STATE_KEYS.has(sourceStateKey);
  const targetGeneric = GENERIC_STATE_KEYS.has(targetStateKey);
  if (sourceGeneric && !targetGeneric) return targetStateKey;
  if (targetGeneric && !sourceGeneric) return sourceStateKey;
  return targetStateKey || sourceStateKey;
}

function buildCanonicalFlowProjection(
  nodes: FlowNode[],
  edges: Edge[],
): Pick<CanonicalGraph, "nodes" | "edges" | "conditional_edges"> {
  const flowNodeMap = new Map(nodes.map((node) => [node.id, node]));
  const canonicalNodes = Object.fromEntries(nodes.map((node) => [node.id, buildCanonicalNodeFromFlowNode(node)]));
  const conditionalEdgesBySource: Record<string, Record<string, string>> = {};
  const canonicalEdges: CanonicalGraph["edges"] = [];

  for (const edge of edges) {
    const sourceNode = flowNodeMap.get(edge.source);
    const targetNode = flowNodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourcePortKey = getPortKeyFromHandle(edge.sourceHandle);
    const targetPortKey = getPortKeyFromHandle(edge.targetHandle);

    if (sourceNode.data.config.family === "condition") {
      if (sourcePortKey) {
        conditionalEdgesBySource[edge.source] = {
          ...(conditionalEdgesBySource[edge.source] ?? {}),
          [sourcePortKey]: edge.target,
        };
      }
      continue;
    }

    if (!sourcePortKey || !targetPortKey) continue;

    const sourceStateKey = getBoundStateKeyForPort(sourceNode.data.config, "output", sourcePortKey) ?? sourcePortKey;
    const targetStateKey = getBoundStateKeyForPort(targetNode.data.config, "input", targetPortKey) ?? targetPortKey;
    const stateKey = chooseStateKeyForConnection(sourceStateKey, targetStateKey);

    canonicalEdges.push({
      source: edge.source,
      target: edge.target,
      sourceHandle: `write:${stateKey}`,
      targetHandle: `read:${stateKey}`,
    });
  }

  return {
    nodes: canonicalNodes,
    edges: canonicalEdges,
    conditional_edges: Object.entries(conditionalEdgesBySource).map(([source, branches]) => ({
      source,
      branches,
    })),
  };
}

function isKnowledgeBaseSkill(skill: SkillAttachment) {
  return skill.skillKey === KNOWLEDGE_BASE_SKILL_KEY;
}

function areSkillAttachmentsEqual(left: SkillAttachment[], right: SkillAttachment[]) {
  if (left.length !== right.length) return false;
  return left.every((skill, index) => JSON.stringify(skill) === JSON.stringify(right[index]));
}

function pickAgentKnowledgeQueryInputKey(config: AgentNode, knowledgeBaseInputKey: string) {
  const candidateInputs = config.inputs.filter((port) => port.key !== knowledgeBaseInputKey && port.valueType !== "knowledge_base");
  const preferredKeys = ["question", "query", "input"];
  for (const key of preferredKeys) {
    const matched = candidateInputs.find((port) => port.key === key);
    if (matched) {
      return matched.key;
    }
  }

  const preferredTextInput =
    candidateInputs.find((port) => port.required && (port.valueType === "text" || port.valueType === "any")) ??
    candidateInputs.find((port) => port.valueType === "text" || port.valueType === "any");
  if (preferredTextInput) {
    return preferredTextInput.key;
  }

  return candidateInputs.find((port) => port.required)?.key ?? candidateInputs[0]?.key ?? null;
}

function createKnowledgeBaseSkillAttachment(knowledgeBaseInputKey: string, queryInputKey: string): SkillAttachment {
  return {
    name: KNOWLEDGE_BASE_SKILL_KEY,
    skillKey: KNOWLEDGE_BASE_SKILL_KEY,
    inputMapping: {
      knowledge_base: `$inputs.${knowledgeBaseInputKey}`,
      query: `$inputs.${queryInputKey}`,
      limit: KNOWLEDGE_BASE_SKILL_LIMIT,
    },
    contextBinding: {},
    usage: "optional",
  };
}

function collectAgentKnowledgeBaseBindings(agentNode: FlowNode, nodesById: Map<string, FlowNode>, edges: Edge[]) {
  const connectedInputKeys = new Set<string>();

  for (const edge of edges) {
    if (edge.target !== agentNode.id) continue;
    const sourceNode = nodesById.get(edge.source);
    if (!sourceNode) continue;
    if (getPortType(sourceNode.data.config, edge.sourceHandle) !== "knowledge_base") continue;
    const inputKey = getPortKeyFromHandle(edge.targetHandle);
    if (!inputKey) continue;
    connectedInputKeys.add(inputKey);
  }

  return Array.from(connectedInputKeys);
}

function syncKnowledgeBaseSkillOnAgent(agentNode: FlowNode, nodesById: Map<string, FlowNode>, edges: Edge[]) {
  if (agentNode.data.config.family !== "agent") {
    return agentNode.data.config;
  }

  const config = agentNode.data.config as AgentNode;
  const knowledgeBaseInputKeys = collectAgentKnowledgeBaseBindings(agentNode, nodesById, edges);
  const skillsWithoutKnowledgeBase = config.skills.filter((skill) => !isKnowledgeBaseSkill(skill));

  if (knowledgeBaseInputKeys.length !== 1) {
    return areSkillAttachmentsEqual(skillsWithoutKnowledgeBase, config.skills)
      ? config
      : normalizeNodeConfig({
          ...config,
          skills: skillsWithoutKnowledgeBase,
        } satisfies AgentNode);
  }

  const knowledgeBaseInputKey = knowledgeBaseInputKeys[0];
  const queryInputKey = pickAgentKnowledgeQueryInputKey(config, knowledgeBaseInputKey);
  if (!queryInputKey) {
    return areSkillAttachmentsEqual(skillsWithoutKnowledgeBase, config.skills)
      ? config
      : normalizeNodeConfig({
          ...config,
          skills: skillsWithoutKnowledgeBase,
        } satisfies AgentNode);
  }

  const nextKnowledgeBaseSkill = createKnowledgeBaseSkillAttachment(knowledgeBaseInputKey, queryInputKey);
  const nextSkills = [...skillsWithoutKnowledgeBase, nextKnowledgeBaseSkill];
  return areSkillAttachmentsEqual(nextSkills, config.skills)
    ? config
    : normalizeNodeConfig({
        ...config,
        skills: nextSkills,
      } satisfies AgentNode);
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
    return config.value;
  }

  return `Connected to ${getNodeDisplayName(config)}.${sourcePortKey ?? "value"}`;
}

function OutputPreviewContent({ text, displayMode }: { text: string; displayMode: string }) {
  return (
    <RichContent
      text={text}
      displayMode={displayMode}
      copyable
      empty={<span className="text-[var(--muted)]">Connect an upstream output to preview/export it.</span>}
    />
  );
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
      <FieldTextarea
        className={cn(minHeight, "font-mono text-[0.82rem]")}
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

function SkillPickerPanel({
  anchorRef,
  open,
  definitions,
  loading,
  error,
  onClose,
  onPick,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  definitions: SkillDefinition[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (definition: SkillDefinition) => void;
}) {
  return (
    <FloatingEditorCard
      anchorRef={anchorRef}
      open={open}
      placement="bottom-start"
      title="Add Skill"
      description="这里只负责附加已有 skill，不在编排界面里编辑 skill 内容。"
      widthClassName="w-[360px]"
    >
      {loading ? (
        <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-4 py-3 text-sm text-[var(--muted)]">
          Loading skills...
        </div>
      ) : error ? (
        <div className="rounded-[16px] border border-[rgba(185,28,28,0.14)] bg-[rgba(255,248,248,0.86)] px-4 py-3 text-sm text-[rgb(153,27,27)]">
          {error}
        </div>
      ) : definitions.length === 0 ? (
        <div className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.78)] px-4 py-3 text-sm text-[var(--muted)]">
          No available skills to attach.
        </div>
      ) : (
        <div className="grid max-h-[320px] gap-2 overflow-y-auto pr-1">
          {definitions.map((definition) => (
            <button
              key={definition.skillKey}
              type="button"
              className="rounded-[16px] border border-[rgba(37,99,235,0.14)] bg-[rgba(239,246,255,0.58)] px-3.5 py-3 text-left transition hover:border-[rgba(37,99,235,0.24)] hover:bg-[rgba(239,246,255,0.84)]"
              onClick={() => onPick(definition)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[rgba(37,99,235,0.1)] text-[#2563eb]">
                  <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.6">
                    <path d="M8 2.5v4l2.5 1.5" />
                    <circle cx="8" cy="8" r="5.5" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--text)]">{definition.label}</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{definition.description}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[0.68rem]">
                    {definition.inputSchema.length > 0 ? (
                      <span className="rounded-full border border-[rgba(37,99,235,0.12)] bg-white/70 px-2 py-0.5 text-[#2563eb]">
                        In {definition.inputSchema.length}
                      </span>
                    ) : null}
                    {definition.outputSchema.length > 0 ? (
                      <span className="rounded-full border border-[rgba(37,99,235,0.12)] bg-white/70 px-2 py-0.5 text-[#2563eb]">
                        Out {definition.outputSchema.length}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </FloatingEditorCard>
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
          <FieldSelect
            value={rule.operator}
            onValueChange={(nextValue) => onChange({ ...rule, operator: nextValue as ConditionRule["operator"] })}
            options={RULE_OPERATOR_SELECT_OPTIONS}
          />
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

type FloatingPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "top-center";

function clampFloatingCoordinate(value: number, min: number, max: number) {
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
}

function computeFloatingPosition(
  anchorRect: DOMRect,
  floatingRect: DOMRect,
  placement: FloatingPlacement,
) {
  const viewportPadding = 12;
  const offset = 8;
  const horizontalAlignment = placement.endsWith("end")
    ? "end"
    : placement.endsWith("center")
      ? "center"
      : "start";
  const preferTop = placement.startsWith("top");
  const spaceAbove = anchorRect.top - viewportPadding;
  const spaceBelow = window.innerHeight - anchorRect.bottom - viewportPadding;
  const fitsAbove = floatingRect.height + offset <= spaceAbove;
  const fitsBelow = floatingRect.height + offset <= spaceBelow;
  const placeAbove = preferTop ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
  const rawTop = placeAbove ? anchorRect.top - floatingRect.height - offset : anchorRect.bottom + offset;
  const rawLeft =
    horizontalAlignment === "end"
      ? anchorRect.right - floatingRect.width
      : horizontalAlignment === "center"
        ? anchorRect.left + anchorRect.width / 2 - floatingRect.width / 2
        : anchorRect.left;

  return {
    left: Math.round(
      clampFloatingCoordinate(rawLeft, viewportPadding, window.innerWidth - floatingRect.width - viewportPadding),
    ),
    top: Math.round(
      clampFloatingCoordinate(rawTop, viewportPadding, window.innerHeight - floatingRect.height - viewportPadding),
    ),
  };
}

function FloatingLayer({
  anchorRef,
  open,
  placement,
  className,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  placement: FloatingPlacement;
  className?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const lastSignatureRef = useRef("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !open) {
      setPosition(null);
      lastSignatureRef.current = "";
      return;
    }

    let frameId = 0;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (!anchor || !floating) return;
      const nextPosition = computeFloatingPosition(anchor.getBoundingClientRect(), floating.getBoundingClientRect(), placement);
      const signature = `${nextPosition.left}:${nextPosition.top}`;
      if (signature !== lastSignatureRef.current) {
        lastSignatureRef.current = signature;
        setPosition(nextPosition);
      }
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updatePosition);
    };

    scheduleUpdate();

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;
    if (observer && anchorRef.current) {
      observer.observe(anchorRef.current);
    }
    if (observer && floatingRef.current) {
      observer.observe(floatingRef.current);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      observer?.disconnect();
    };
  }, [anchorRef, mounted, open, placement]);

  if (!mounted || !open || !position) {
    if (!mounted || !open) {
      return null;
    }
  }

  return createPortal(
    <div
      ref={floatingRef}
      className={cn("fixed left-0 top-0 z-[2000]", className)}
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function PortRow({
  nodeId,
  port,
  side,
  editable = false,
  onRename,
  boundState,
  portEditor,
}: {
  nodeId: string;
  port: PortDefinition;
  side: "input" | "output";
  editable?: boolean;
  onRename?: (nextLabel: string) => void;
  boundState?: StateField | null;
  portEditor?: {
    onChange: (nextPort: PortDefinition) => void;
    onRemove?: () => void;
  };
}) {
  const color = TYPE_COLORS[port.valueType];
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(boundState ? getStateDisplayName(boundState) : port.label);
  const [isEditingPortConfig, setIsEditingPortConfig] = useState(false);
  const [draftPort, setDraftPort] = useState<PortDefinition>({
    ...port,
    label: boundState ? getStateDisplayName(boundState) : port.label,
  });
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const displayLabel = boundState ? getStateDisplayName(boundState) : port.label;

  useEffect(() => {
    setDraftLabel(displayLabel);
    setDraftPort((current) => {
      const nextPort: PortDefinition = {
        ...port,
        label: displayLabel,
      };
      if (
        current.key === nextPort.key &&
        current.label === nextPort.label &&
        current.valueType === nextPort.valueType &&
        Boolean(current.required) === Boolean(nextPort.required)
      ) {
        return current;
      }
      return nextPort;
    });
  }, [displayLabel, port.key, port.label, port.required, port.valueType]);

  function startEditing() {
    if (portEditor) {
      setDraftPort({
        ...port,
        label: displayLabel,
      });
      setIsEditingPortConfig(true);
      return;
    }
    if (!editable) return;
    setDraftLabel(displayLabel);
    setIsEditing(true);
  }

  function commitEditing() {
    const nextLabel = draftLabel.trim();
    if (nextLabel && nextLabel !== displayLabel) {
      onRename?.(nextLabel);
    }
    setIsEditing(false);
  }

  function commitPortEditing() {
    const nextLabel = draftPort.label.trim();
    const nextKey = draftPort.key.trim();
    if (!nextLabel || (!boundState && !nextKey)) {
      setDraftPort(port);
      setIsEditingPortConfig(false);
      return;
    }
    if (boundState) {
      if (nextLabel !== getStateDisplayName(boundState)) {
        onRename?.(nextLabel);
      }
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
          <span ref={labelRef} className="ml-2 truncate cursor-text" onDoubleClick={startEditing}>
            {displayLabel}
          </span>
          <FloatingEditorCard
            anchorRef={labelRef}
            open={isEditing}
            placement="bottom-start"
            title="Edit Port Name"
            widthClassName="w-[320px]"
          >
            <Input
              className="h-11"
              value={draftLabel}
              autoFocus
              onChange={(event) => setDraftLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitEditing();
                if (event.key === "Escape") {
                  setDraftLabel(displayLabel);
                  setIsEditing(false);
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <PanelIconButton
                label="Cancel"
                onClick={() => {
                  setDraftLabel(displayLabel);
                  setIsEditing(false);
                }}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                  <path d="m4.5 4.5 7 7" />
                  <path d="m11.5 4.5-7 7" />
                </svg>
              </PanelIconButton>
              <PanelIconButton label="Save" tone="positive" onClick={commitEditing}>
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </PanelIconButton>
            </div>
          </FloatingEditorCard>
          <FloatingEditorCard
            anchorRef={labelRef}
            open={isEditingPortConfig}
            placement="bottom-start"
            title="Edit Port"
            widthClassName="w-[340px]"
          >
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>{boundState ? "State Key" : "Key"}</span>
              <Input
                value={boundState?.key ?? draftPort.key}
                disabled={Boolean(boundState)}
                onChange={(event) => setDraftPort((current) => ({ ...current, key: event.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>{boundState ? "Name" : "Label"}</span>
              <Input value={draftPort.label} onChange={(event) => setDraftPort((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>{boundState ? "State Type" : "Value Type"}</span>
              <FieldSelect
                value={draftPort.valueType}
                disabled={Boolean(boundState)}
                onValueChange={(nextValue) => setDraftPort((current) => ({ ...current, valueType: nextValue as ValueType }))}
                options={VALUE_TYPE_SELECT_OPTIONS}
              />
            </label>
            {side === "input" ? (
              <EditorSwitchRow
                label="Required"
                checked={Boolean(draftPort.required)}
                onCheckedChange={(checked) => setDraftPort((current) => ({ ...current, required: checked }))}
              />
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {portEditor?.onRemove ? (
                  <PanelIconButton
                    label="Remove"
                    tone="danger"
                    onClick={() => {
                      portEditor.onRemove?.();
                      setIsEditingPortConfig(false);
                    }}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7">
                      <path d="M3.5 4.5h9" />
                      <path d="M6 4.5V3.4c0-.5.4-.9.9-.9h2.2c.5 0 .9.4.9.9v1.1" />
                      <path d="M5.2 6.2v5.1" />
                      <path d="M8 6.2v5.1" />
                      <path d="M10.8 6.2v5.1" />
                      <path d="M4.4 4.5 5 12.6c0 .5.4.9.9.9h4.2c.5 0 .9-.4.9-.9l.6-8.1" />
                    </svg>
                  </PanelIconButton>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <PanelIconButton
                  label="Cancel"
                  onClick={() => {
                    setDraftPort(port);
                    setIsEditingPortConfig(false);
                  }}
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                    <path d="m4.5 4.5 7 7" />
                    <path d="m11.5 4.5-7 7" />
                  </svg>
                </PanelIconButton>
                <PanelIconButton label="Save" tone="positive" onClick={commitPortEditing}>
                  <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                </PanelIconButton>
              </div>
            </div>
          </FloatingEditorCard>
        </>
      ) : (
        <>
          <span ref={labelRef} className="truncate text-right cursor-text" onDoubleClick={startEditing}>
            {displayLabel}
          </span>
          <FloatingEditorCard
            anchorRef={labelRef}
            open={isEditing}
            placement="bottom-end"
            title="Edit Port Name"
            widthClassName="w-[320px]"
          >
            <Input
              className="h-11 text-left"
              value={draftLabel}
              autoFocus
              onChange={(event) => setDraftLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitEditing();
                if (event.key === "Escape") {
                  setDraftLabel(displayLabel);
                  setIsEditing(false);
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <PanelIconButton
                label="Cancel"
                onClick={() => {
                  setDraftLabel(displayLabel);
                  setIsEditing(false);
                }}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                  <path d="m4.5 4.5 7 7" />
                  <path d="m11.5 4.5-7 7" />
                </svg>
              </PanelIconButton>
              <PanelIconButton label="Save" tone="positive" onClick={commitEditing}>
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </PanelIconButton>
            </div>
          </FloatingEditorCard>
          <FloatingEditorCard
            anchorRef={labelRef}
            open={isEditingPortConfig}
            placement="bottom-end"
            title="Edit Port"
            widthClassName="w-[340px]"
          >
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>{boundState ? "State Key" : "Key"}</span>
              <Input
                value={boundState?.key ?? draftPort.key}
                disabled={Boolean(boundState)}
                onChange={(event) => setDraftPort((current) => ({ ...current, key: event.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>{boundState ? "Name" : "Label"}</span>
              <Input value={draftPort.label} onChange={(event) => setDraftPort((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>{boundState ? "State Type" : "Value Type"}</span>
              <FieldSelect
                value={draftPort.valueType}
                disabled={Boolean(boundState)}
                onValueChange={(nextValue) => setDraftPort((current) => ({ ...current, valueType: nextValue as ValueType }))}
                options={VALUE_TYPE_SELECT_OPTIONS}
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {portEditor?.onRemove ? (
                  <PanelIconButton
                    label="Remove"
                    tone="danger"
                    onClick={() => {
                      portEditor.onRemove?.();
                      setIsEditingPortConfig(false);
                    }}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7">
                      <path d="M3.5 4.5h9" />
                      <path d="M6 4.5V3.4c0-.5.4-.9.9-.9h2.2c.5 0 .9.4.9.9v1.1" />
                      <path d="M5.2 6.2v5.1" />
                      <path d="M8 6.2v5.1" />
                      <path d="M10.8 6.2v5.1" />
                      <path d="M4.4 4.5 5 12.6c0 .5.4.9.9.9h4.2c.5 0 .9-.4.9-.9l.6-8.1" />
                    </svg>
                  </PanelIconButton>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <PanelIconButton
                  label="Cancel"
                  onClick={() => {
                    setDraftPort(port);
                    setIsEditingPortConfig(false);
                  }}
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                    <path d="m4.5 4.5 7 7" />
                    <path d="m11.5 4.5-7 7" />
                  </svg>
                </PanelIconButton>
                <PanelIconButton label="Save" tone="positive" onClick={commitPortEditing}>
                  <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                </PanelIconButton>
              </div>
            </div>
          </FloatingEditorCard>
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

function normalizeStateSearchText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isSubsequence(query: string, target: string) {
  if (!query) return true;
  let index = 0;
  for (const character of target) {
    if (character === query[index]) {
      index += 1;
      if (index === query.length) {
        return true;
      }
    }
  }
  return false;
}

function matchesStateSearch(field: StateField, query: string) {
  const normalizedQuery = normalizeStateSearchText(query);
  if (!normalizedQuery) return true;

  const displayName = getStateDisplayName(field);
  const haystacks = [
    normalizeStateSearchText(displayName),
    normalizeStateSearchText(field.key),
    normalizeStateSearchText(field.description),
  ];

  if (haystacks.some((value) => value.includes(normalizedQuery))) {
    return true;
  }

  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const words = normalizeStateSearchText(`${displayName} ${field.key}`).split(" ").filter(Boolean);
  if (
    queryTerms.length > 0 &&
    queryTerms.every((term) => words.some((word) => word.startsWith(term)))
  ) {
    return true;
  }

  const queryCompact = normalizedQuery.replace(/\s+/g, "");
  const initials = words.map((word) => word[0] ?? "").join("");
  return isSubsequence(queryCompact, initials) || haystacks.some((value) => isSubsequence(queryCompact, value.replace(/\s+/g, "")));
}

function createDraftStateFromQuery(query: string, existingKeys: string[]): StateField {
  const trimmedQuery = query.trim();
  const key = createStateKey(trimmedQuery || "state", existingKeys);
  return {
    key,
    name: trimmedQuery || key,
    type: "string",
    description: "",
    value: "",
    ui: {
      color: "",
    },
  };
}

function StatePortCreateButton({
  side,
  visible,
  stateFields,
  onBindState,
  onCreateState,
}: {
  side: "input" | "output";
  visible: boolean;
  stateFields: StateField[];
  onBindState: (stateKey: string) => boolean;
  onCreateState: (field: StateField) => boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draftState, setDraftState] = useState<StateField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const matchingStates = useMemo(
    () => stateFields.filter((field) => matchesStateSearch(field, search)),
    [search, stateFields],
  );

  function openEditor() {
    setSearch("");
    setDraftState(null);
    setError(null);
    setIsOpen(true);
  }

  function closeEditor() {
    setIsOpen(false);
    setSearch("");
    setDraftState(null);
    setError(null);
  }

  function beginCreateState() {
    setDraftState(createDraftStateFromQuery(search, stateFields.map((field) => field.key)));
    setError(null);
  }

  function commitCreateState() {
    if (!draftState) return;
    const nextKey = draftState.key.trim();
    const nextName = draftState.name.trim() || nextKey;
    if (!nextKey) {
      setError("State key cannot be empty.");
      return;
    }
    if (stateFields.some((field) => field.key === nextKey)) {
      setError(`State key '${nextKey}' already exists.`);
      return;
    }
    if (
      onCreateState({
        ...draftState,
        key: nextKey,
        name: nextName,
      })
    ) {
      closeEditor();
    }
  }

  if (!visible && !isOpen) {
    return null;
  }

  return (
    <div className="group relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[0.68rem] font-medium transition",
          side === "input"
            ? "border-[rgba(34,197,94,0.3)] bg-[rgba(220,252,231,0.55)] text-[#16a34a] hover:bg-[rgba(220,252,231,0.95)] hover:text-[#15803d]"
            : "border-[rgba(217,119,6,0.3)] bg-[rgba(254,243,199,0.55)] text-[#d97706] hover:bg-[rgba(254,243,199,0.95)] hover:text-[#b45309]",
        )}
        onClick={openEditor}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.8">
          <path d="M8 3.5v9M3.5 8h9" />
        </svg>
        {side === "input" ? "input" : "output"}
      </button>
      <FloatingEditorCard
        anchorRef={triggerRef}
        open={isOpen}
        placement={side === "input" ? "bottom-start" : "bottom-end"}
        title={draftState ? `Create ${side === "input" ? "Input" : "Output"} State` : `Select ${side === "input" ? "Input" : "Output"} State`}
        widthClassName="w-[360px]"
      >
        {draftState ? (
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Name</span>
              <Input
                value={draftState.name}
                onChange={(event) => setDraftState((current) => (current ? { ...current, name: event.target.value } : current))}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Key</span>
              <Input
                value={draftState.key}
                onChange={(event) => setDraftState((current) => (current ? { ...current, key: event.target.value } : current))}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Type</span>
              <FieldSelect
                value={draftState.type}
                onValueChange={(nextValue) =>
                  setDraftState((current) =>
                    current
                      ? {
                          ...current,
                          type: nextValue as StateFieldType,
                          value: defaultStateValueForType(nextValue as StateFieldType),
                        }
                      : current,
                  )
                }
                options={STATE_FIELD_TYPE_OPTIONS.map((type) => ({
                  value: type,
                  label: type,
                }))}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--muted)]">
              <span>Description</span>
              <FieldTextarea
                rows={3}
                value={draftState.description}
                onChange={(event) => setDraftState((current) => (current ? { ...current, description: event.target.value } : current))}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_88px]">
              <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                <span>Color</span>
                <Input
                  value={draftState.ui?.color ?? ""}
                  placeholder="#d97706"
                  onChange={(event) =>
                    setDraftState((current) =>
                      current
                        ? {
                            ...current,
                            ui: {
                              ...(current.ui ?? {}),
                              color: event.target.value,
                            },
                          }
                        : current,
                    )
                  }
                />
              </label>
              <div className="grid gap-1.5 text-sm text-[var(--muted)]">
                <span>Swatch</span>
                <div
                  className="h-11 rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                  style={{ backgroundColor: draftState.ui?.color?.trim() || "rgba(255,255,255,0.78)" }}
                />
              </div>
            </div>
            <StateDefaultValueEditor
              field={draftState}
              onChange={(nextValue) => setDraftState((current) => (current ? { ...current, value: nextValue } : current))}
            />
            <div className={cn("text-xs", error ? "text-[rgb(153,27,27)]" : "text-[var(--muted)]")}>
              {error ?? "Create the state and bind this port to it immediately."}
            </div>
            <div className="flex items-center justify-end gap-2">
              <PanelIconButton
                label="Back"
                onClick={() => {
                  setDraftState(null);
                  setError(null);
                }}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                  <path d="M10.5 3.5 5.5 8l5 4.5" />
                </svg>
              </PanelIconButton>
              <PanelIconButton label="Create" tone="positive" onClick={commitCreateState}>
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </PanelIconButton>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <Input
              className="h-11"
              value={search}
              autoFocus
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search or create ${side === "input" ? "input" : "output"} state`}
            />
            <div className="grid gap-2">
              {search.trim() ? (
                <button
                  type="button"
                  className="rounded-[16px] border border-[rgba(154,52,18,0.16)] bg-[rgba(255,244,240,0.92)] px-3 py-2 text-left transition hover:bg-[rgba(255,248,240,1)]"
                  onClick={beginCreateState}
                >
                  <div className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Create</div>
                  <div className="mt-0.5 text-sm font-semibold text-[var(--text)]">新增 “{search.trim()}”</div>
                </button>
              ) : null}
              {matchingStates.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] px-3 py-2 text-left transition hover:bg-[rgba(255,248,240,0.92)]"
                  onClick={() => {
                    if (onBindState(field.key)) {
                      closeEditor();
                    }
                  }}
                >
                  <div className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{field.type}</div>
                  <div className="mt-0.5 text-sm font-semibold text-[var(--text)]">{getStateDisplayName(field)}</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{field.key}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <PanelIconButton label="Cancel" onClick={closeEditor}>
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                  <path d="m4.5 4.5 7 7" />
                  <path d="m11.5 4.5-7 7" />
                </svg>
              </PanelIconButton>
            </div>
          </div>
        )}
      </FloatingEditorCard>
    </div>
  );
}

function getNodeMinHeight(config: NodePresetDefinition) {
  if (config.family === "input") return 260;
  if (config.family === "output") return 280;
  if (config.family === "agent") return 360;
  if (config.family === "condition") return 300;
  return 180;
}

const DEFAULT_NODE_WIDTH = 360;

function getDefaultNodeWidth(_config: NodePresetDefinition) {
  return DEFAULT_NODE_WIDTH;
}

function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config;
  const displayName = data.displayName ?? getNodeDisplayName(config, data.nodeId);
  const displayDescription = data.displayDescription?.trim() || config.description;
  const stateFields = data.stateFields ?? [];
  const inputs = resolvePortsForDisplay(config, "input", stateFields);
  const outputs = resolvePortsForDisplay(config, "output", stateFields);
  const isInputNode = config.family === "input";
  const minHeight = getNodeMinHeight(config);
  const executionVisual = resolveNodeExecutionVisual(data.executionStatus, data.isCurrentRunNode);
  const getBoundState = (side: "input" | "output", portKey: string) => {
    const stateKey = getBoundStateKeyForPort(config, side, portKey);
    return stateKey ? getStateFieldByKey(stateFields, stateKey) ?? null : null;
  };
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isHoveringNode, setIsHoveringNode] = useState(false);
  const [isResizingNode, setIsResizingNode] = useState(false);
  const [draftLabel, setDraftLabel] = useState(displayName);
  const [draftDescription, setDraftDescription] = useState(displayDescription);
  const [isDeleteConfirmActive, setIsDeleteConfirmActive] = useState(false);
  const [isPresetConfirmActive, setIsPresetConfirmActive] = useState(false);
  const deleteConfirmTimeoutRef = useRef<number | null>(null);
  const presetConfirmTimeoutRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const presetButtonRef = useRef<HTMLButtonElement | null>(null);
  const skillPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const labelAnchorRef = useRef<HTMLDivElement | null>(null);
  const descriptionAnchorRef = useRef<HTMLDivElement | null>(null);
  const uploadedAsset = config.family === "input" ? tryParseUploadedAssetEnvelope(config.value) : null;
  const agentRuntime =
    config.family === "agent"
      ? resolveAgentRuntimeConfig(config, {
          globalTextModelRef: data.globalTextModelRef,
          globalThinkingEnabled: data.globalThinkingEnabled,
          defaultAgentTemperature: data.defaultAgentTemperature,
        })
      : null;
  const [isSkillPickerOpen, setIsSkillPickerOpen] = useState(false);
  const attachedSkillKeys = useMemo(() => new Set((config.family === "agent" ? config.skills : []).map((skill) => skill.skillKey)), [config]);
  const availableSkillDefinitions = useMemo(
    () => (data.skillDefinitions ?? []).filter((definition) => !attachedSkillKeys.has(definition.skillKey)),
    [attachedSkillKeys, data.skillDefinitions],
  );

  useEffect(() => {
    setDraftLabel(displayName);
  }, [displayName]);

  useEffect(() => {
    setDraftDescription(displayDescription);
  }, [displayDescription]);

  useEffect(() => {
    if (selected) return;
    setIsDeleteConfirmActive(false);
    setIsPresetConfirmActive(false);
    setIsSkillPickerOpen(false);
  }, [selected]);

  useEffect(() => {
    return () => {
      if (deleteConfirmTimeoutRef.current) {
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      }
      if (presetConfirmTimeoutRef.current) {
        window.clearTimeout(presetConfirmTimeoutRef.current);
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

  function clearPresetConfirmState() {
    if (presetConfirmTimeoutRef.current) {
      window.clearTimeout(presetConfirmTimeoutRef.current);
      presetConfirmTimeoutRef.current = null;
    }
    setIsPresetConfirmActive(false);
  }

  function startPresetConfirmWindow() {
    if (presetConfirmTimeoutRef.current) {
      window.clearTimeout(presetConfirmTimeoutRef.current);
    }
    setIsPresetConfirmActive(true);
    presetConfirmTimeoutRef.current = window.setTimeout(() => {
      presetConfirmTimeoutRef.current = null;
      setIsPresetConfirmActive(false);
    }, 2000);
  }

  function commitLabelEdit() {
    const nextLabel = draftLabel.trim();
    if (nextLabel && nextLabel !== displayName) {
      data.onConfigChange?.((currentConfig) => ({ ...currentConfig, name: nextLabel }));
    }
    setIsEditingLabel(false);
  }

  function commitDescriptionEdit() {
    const nextDescription = draftDescription.trim();
    if (nextDescription !== displayDescription) {
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
      value: JSON.stringify(envelope),
    }));
  }

  function updateNodePort(side: "input" | "output", portIndex: number, nextPort: PortDefinition) {
    data.onConfigChange?.((currentConfig) => {
      if (currentConfig.family === "agent") {
        const currentPorts = side === "input" ? currentConfig.inputs : currentConfig.outputs;
        const previousPort = currentPorts[portIndex];
        const nextPorts = [...currentPorts];
        nextPorts[portIndex] = nextPort;
        return side === "input"
          ? {
              ...currentConfig,
              inputs: nextPorts,
              stateReads: (currentConfig.stateReads ?? []).map((binding) =>
                binding.inputKey === previousPort?.key ? { ...binding, inputKey: nextPort.key } : binding,
              ),
            }
          : {
              ...currentConfig,
              outputs: nextPorts,
              stateWrites: (currentConfig.stateWrites ?? []).map((binding) =>
                binding.outputKey === previousPort?.key ? { ...binding, outputKey: nextPort.key } : binding,
              ),
            };
      }
      if (currentConfig.family === "condition" && side === "input") {
        const previousPort = currentConfig.inputs[portIndex];
        const nextPorts = [...currentConfig.inputs];
        nextPorts[portIndex] = nextPort;
        return {
          ...currentConfig,
          inputs: nextPorts,
          stateReads: (currentConfig.stateReads ?? []).map((binding) =>
            binding.inputKey === previousPort?.key ? { ...binding, inputKey: nextPort.key } : binding,
          ),
        };
      }
      return currentConfig;
    });
  }

  function removeNodePort(side: "input" | "output", portIndex: number) {
    data.onConfigChange?.((currentConfig) => {
      if (currentConfig.family === "agent") {
        const currentPorts = side === "input" ? currentConfig.inputs : currentConfig.outputs;
        const removedPort = currentPorts[portIndex];
        const nextPorts = currentPorts.filter((_, index) => index !== portIndex);
        return side === "input"
          ? {
              ...currentConfig,
              inputs: nextPorts,
              stateReads: (currentConfig.stateReads ?? []).filter((binding) => binding.inputKey !== removedPort?.key),
            }
          : {
              ...currentConfig,
              outputs: nextPorts,
              stateWrites: (currentConfig.stateWrites ?? []).filter((binding) => binding.outputKey !== removedPort?.key),
            };
      }
      if (currentConfig.family === "condition" && side === "input") {
        const removedPort = currentConfig.inputs[portIndex];
        return {
          ...currentConfig,
          inputs: currentConfig.inputs.filter((_, index) => index !== portIndex),
          stateReads: (currentConfig.stateReads ?? []).filter((binding) => binding.inputKey !== removedPort?.key),
        };
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
      <div className="relative h-full overflow-visible" onPointerEnter={showNodeResizeHandles} onPointerLeave={hideNodeResizeHandles}>
        <div className="absolute inset-[-14px]" />
        {executionVisual?.haloClass ? (
          <div
            aria-hidden="true"
            className={cn("pointer-events-none absolute inset-[-6px] rounded-[24px] transition-all duration-300", executionVisual.haloClass)}
          />
        ) : null}
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
            data.onResizeEnd?.(params.width, params.height, true);
          }}
        />
        <div
          data-node-card="true"
          className={cn(
            "group/node relative z-10 flex h-full min-w-[160px] flex-col overflow-hidden rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
            executionVisual?.shellClass,
            selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
          )}
          onClickCapture={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("[data-delete-surface='true']")) return;
          if (isDeleteConfirmActive) {
            clearDeleteConfirmState();
          }
          }}
        >
        {isPresetEligibleFamily(config.family) ? (
          <button
            ref={presetButtonRef}
            type="button"
            aria-label="Save as Preset"
            title="Save as Preset"
            data-delete-surface="true"
            className={cn(
              "absolute right-[52px] top-3 z-20 grid h-8 w-8 place-items-center rounded-full shadow-[0_10px_24px_rgba(60,41,20,0.08)] transition",
              selected || isPresetConfirmActive ? "opacity-100" : "opacity-0 group-hover/node:opacity-100",
              isPresetConfirmActive
                ? "border border-[rgba(34,197,94,0.3)] bg-[rgb(34,197,94)] text-white hover:border-[rgba(34,197,94,0.4)] hover:bg-[rgb(22,163,74)]"
                : "border border-[rgba(154,52,18,0.14)] bg-[rgba(255,252,247,0.92)] text-[var(--muted)] hover:border-[rgba(154,52,18,0.24)] hover:text-[var(--accent)]",
            )}
            onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isPresetConfirmActive) {
                clearPresetConfirmState();
                void data.onSavePreset?.();
                return;
              }
              startPresetConfirmWindow();
            }}
          >
            {isPresetConfirmActive ? (
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7">
                <path d="m4.5 8 2.25 2.25L11.5 5.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5">
                <path d="M2.5 10.5V13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.5L11 3.5H3.5a1 1 0 0 0-1 1v6z" />
                <path d="M5 10.5V8h6v2.5" />
                <path d="M5 3.5V2.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
              </svg>
            )}
          </button>
        ) : null}
        <FloatingLayer anchorRef={presetButtonRef} open={isPresetConfirmActive} placement="top-center" className="pointer-events-none">
          <div className="whitespace-nowrap rounded-full border border-[rgba(34,197,94,0.16)] bg-[rgba(220,252,231,0.98)] px-3.5 py-1.5 text-[0.76rem] font-medium uppercase tracking-[0.16em] text-[rgb(22,163,74)] shadow-[0_14px_32px_rgba(21,128,61,0.14)]">
            Save preset?
          </div>
        </FloatingLayer>
        <button
          ref={deleteButtonRef}
          type="button"
          aria-label={isDeleteConfirmActive ? "确认删除节点" : "删除节点"}
          title={isDeleteConfirmActive ? "确认删除节点" : "删除节点"}
          data-delete-surface="true"
          className={cn(
            "absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full shadow-[0_10px_24px_rgba(60,41,20,0.08)] transition",
            selected || isDeleteConfirmActive ? "opacity-100" : "opacity-0 group-hover/node:opacity-100",
            isDeleteConfirmActive
              ? "border border-[rgba(185,28,28,0.28)] bg-[rgb(185,28,28)] text-white hover:border-[rgba(185,28,28,0.36)] hover:bg-[rgb(153,27,27)]"
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
        <FloatingLayer anchorRef={deleteButtonRef} open={isDeleteConfirmActive} placement="top-center" className="pointer-events-none">
          <div className="whitespace-nowrap rounded-full border border-[rgba(185,28,28,0.16)] bg-[rgba(255,248,248,0.98)] px-3.5 py-1.5 text-[0.76rem] font-medium uppercase tracking-[0.16em] text-[rgb(153,27,27)] shadow-[0_14px_32px_rgba(127,29,29,0.14)]">
            Delete node?
          </div>
        </FloatingLayer>
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(154,52,18,0.12)] pl-4 pr-14 py-3">
          <div className="min-w-0 flex-1">
            <div className="relative flex min-w-0 items-center gap-2">
              <span className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.72)] px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--accent-strong)]">
                {config.family}
              </span>
              <div ref={labelAnchorRef} className="truncate cursor-text text-left text-sm font-semibold text-[var(--text)]" onDoubleClick={() => setIsEditingLabel(true)}>
                {displayName}
              </div>
              <FloatingEditorCard
                anchorRef={labelAnchorRef}
                open={isEditingLabel}
                placement="bottom-start"
                title="Edit Name"
                widthClassName="w-[360px]"
              >
                <Input
                  className="h-11"
                  value={draftLabel}
                  autoFocus
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitLabelEdit();
                    if (event.key === "Escape") {
                      setDraftLabel(displayName);
                      setIsEditingLabel(false);
                    }
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <PanelIconButton
                    label="Cancel"
                    onClick={() => {
                      setDraftLabel(displayName);
                      setIsEditingLabel(false);
                    }}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                      <path d="m4.5 4.5 7 7" />
                      <path d="m11.5 4.5-7 7" />
                    </svg>
                  </PanelIconButton>
                  <PanelIconButton label="Save" tone="positive" onClick={commitLabelEdit}>
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                      <path d="m3.5 8.5 3 3 6-7" />
                    </svg>
                  </PanelIconButton>
                </div>
              </FloatingEditorCard>
            </div>
            {config.family ? (
              <div className="relative mt-1">
                <div ref={descriptionAnchorRef} className="line-clamp-2 cursor-text text-left text-xs leading-5 text-[var(--muted)]" onDoubleClick={() => setIsEditingDescription(true)}>
                  {displayDescription}
                </div>
                <FloatingEditorCard
                  anchorRef={descriptionAnchorRef}
                  open={isEditingDescription}
                  placement="bottom-start"
                  title="Edit Description"
                  widthClassName="w-[420px]"
                >
                  <FieldTextarea
                    rows={6}
                    value={draftDescription}
                    autoFocus
                    onChange={(event) => setDraftDescription(event.target.value)}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <PanelIconButton
                      label="Cancel"
                      onClick={() => {
                        setDraftDescription(displayDescription);
                        setIsEditingDescription(false);
                      }}
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                        <path d="m4.5 4.5 7 7" />
                        <path d="m11.5 4.5-7 7" />
                      </svg>
                    </PanelIconButton>
                    <PanelIconButton label="Save" tone="positive" onClick={commitDescriptionEdit}>
                      <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                        <path d="m3.5 8.5 3 3 6-7" />
                      </svg>
                    </PanelIconButton>
                  </div>
                </FloatingEditorCard>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2" />
        </div>

        <div className="flex flex-shrink-0 flex-col gap-3 px-4 pt-3">
          {config.family === "input" ? (
            <div className={cn("grid items-center gap-3", uploadedAsset ? "grid-cols-[1fr_auto]" : "grid-cols-[minmax(0,1fr)_auto]")}>
              {!uploadedAsset ? (
                <div className="flex gap-1.5">
                  {INPUT_TYPE_BUTTONS.map((option) => {
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
                            const prev = currentConfig as InputBoundaryNode;
                            if (option.value === "knowledge_base") {
                              return {
                                ...prev,
                                valueType: option.value,
                                value: (data.knowledgeBases ?? [])[0]?.name ?? "",
                                output: { ...prev.output, key: "knowledge_base", label: "Knowledge Base", valueType: option.value },
                              };
                            }
                            return {
                              ...prev,
                              valueType: option.value,
                              value: option.value === "file" ? "" : (prev.valueType === "knowledge_base" ? "" : prev.value),
                              output: { ...prev.output, valueType: option.value },
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
                    boundState={getBoundState("output", port.key)}
                    onRename={(nextLabel) =>
                      getBoundState("output", port.key)
                        ? data.onRenameStateName?.(getBoundState("output", port.key)!.key, nextLabel)
                        : data.onConfigChange?.((currentConfig) => ({
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
          ) : null}

          {config.family !== "input" && config.family !== "output" && (inputs.length > 0 || outputs.length > 0) ? (
            <div className="grid grid-cols-2 items-start gap-x-6">
              <div className="grid gap-1">
                {inputs.map((port, index) => (
                  <PortRow
                    key={`input-${port.key}`}
                    nodeId={data.nodeId}
                    port={port}
                    side="input"
                    boundState={getBoundState("input", port.key)}
                    onRename={(nextLabel) => {
                      const boundState = getBoundState("input", port.key);
                      if (boundState) {
                        data.onRenameStateName?.(boundState.key, nextLabel);
                      }
                    }}
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
{/* hover add-input button removed — use the +input pill in the skill bar instead */}
              </div>
              <div className="grid gap-1">
                {outputs.map((port, index) => (
                  <PortRow
                    key={`output-${port.key}`}
                    nodeId={data.nodeId}
                    port={port}
                    side="output"
                    boundState={getBoundState("output", port.key)}
                    onRename={(nextLabel) => {
                      const boundState = getBoundState("output", port.key);
                      if (boundState) {
                        data.onRenameStateName?.(boundState.key, nextLabel);
                      }
                    }}
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
{/* hover add-output button removed — use the +output pill in the skill bar instead */}
              </div>
            </div>
          ) : null}

          {config.family === "output" ? (
            <div className="flex items-center gap-3">
              <div className="grid gap-1">
                {inputs.map((port) => (
                  <PortRow
                    key={`input-${port.key}`}
                    nodeId={data.nodeId}
                    port={port}
                    side="input"
                    editable
                    boundState={getBoundState("input", port.key)}
                    onRename={(nextLabel) =>
                      getBoundState("input", port.key)
                        ? data.onRenameStateName?.(getBoundState("input", port.key)!.key, nextLabel)
                        : data.onConfigChange?.((currentConfig) => ({
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
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-[var(--muted)]">Save</span>
                <button
                  type="button"
                  aria-label="Toggle auto-save"
                  role="switch"
                  aria-checked={config.persistEnabled}
                  className={cn(
                    "relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors",
                    config.persistEnabled ? "bg-[var(--accent)]" : "bg-[rgba(154,52,18,0.2)]",
                  )}
                  onClick={() =>
                    data.onConfigChange?.((currentConfig) => {
                      const outputConfig = currentConfig as OutputBoundaryNode;
                      return {
                        ...outputConfig,
                        persistEnabled: !outputConfig.persistEnabled,
                      };
                    })
                  }
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform",
                      config.persistEnabled ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </div>
            </div>
          ) : null}

          {/* skill pills moved to scrollable area */}
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 overflow-y-auto overscroll-contain"
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <NodeStateBindingSummary
            config={config}
            stateFieldLookup={data.stateFieldLookup}
            onOpenStatePanel={data.onOpenStatePanel}
          />

          {config.family === "input" ? (
            <>
              <div className="flex flex-1 flex-col gap-2">
                {config.valueType === "knowledge_base" ? (
                  (data.knowledgeBases ?? []).length > 0 ? (
                    <FieldSelect
                      value={config.value}
                      onValueChange={(nextValue) =>
                        data.onConfigChange?.((currentConfig) => ({
                          ...(currentConfig as InputBoundaryNode),
                          value: nextValue,
                        }))
                      }
                      className="min-h-[48px] rounded-[16px] px-3 py-3 text-sm"
                      options={(data.knowledgeBases ?? []).map((kb) => ({
                        value: kb.name,
                        label: kb.label || kb.name,
                        detail: kb.version || (typeof kb.chunkCount === "number" ? `${kb.chunkCount} chunks` : undefined),
                      }))}
                    />
                  ) : (
                    <div className="grid min-h-[60px] place-items-center rounded-[16px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.82)] px-4 py-4 text-center text-sm text-[var(--muted)]">
                      No knowledge bases found
                    </div>
                  )
                ) : config.valueType === "text" || config.valueType === "json" ? (
                  <FieldTextarea
                    value={config.value}
                    rows={6}
                    onChange={(event) =>
                      data.onConfigChange?.((currentConfig) => ({
                        ...(currentConfig as InputBoundaryNode),
                        value: event.target.value,
                      }))
                    }
                    className="min-h-[132px] h-full flex-1"
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
                                  value: "",
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

          {config.family === "agent" ? (
            <>
              {agentRuntime ? (
                <AgentInlineRuntimeControls
                  agentRuntime={agentRuntime}
                  availableModelRefs={data.availableModelRefs ?? []}
                  modelDisplayLookup={data.modelDisplayLookup ?? {}}
                  onConfigChange={(updater) => data.onConfigChange?.((currentConfig) => updater(currentConfig as AgentNode))}
                />
              ) : null}
              {/* ── action buttons row: +skill, +input, +output ── */}
              <div className="flex items-center gap-1.5">
                {/* +skill button */}
                {availableSkillDefinitions.length > 0 || data.skillDefinitionsLoading || data.skillDefinitionsError ? (
                  <>
                    <button
                      ref={skillPickerButtonRef}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-[rgba(37,99,235,0.24)] bg-[rgba(239,246,255,0.5)] px-2.5 py-0.5 text-[0.68rem] font-medium text-[#2563eb] transition hover:bg-[rgba(239,246,255,0.9)]"
                      onClick={() => setIsSkillPickerOpen((current) => !current)}
                    >
                      <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.8">
                        <path d="M8 3.5v9M3.5 8h9" />
                      </svg>
                      skill
                    </button>
                    <SkillPickerPanel
                      anchorRef={skillPickerButtonRef}
                      open={isSkillPickerOpen}
                      definitions={availableSkillDefinitions}
                      loading={Boolean(data.skillDefinitionsLoading)}
                      error={data.skillDefinitionsError ?? null}
                      onClose={() => setIsSkillPickerOpen(false)}
                      onPick={(definition) => {
                        data.onConfigChange?.((currentConfig) => ({
                          ...(currentConfig as AgentNode),
                          skills: [
                            ...(currentConfig as AgentNode).skills,
                            { name: definition.skillKey, skillKey: definition.skillKey, inputMapping: {}, contextBinding: {}, usage: "optional" as const },
                          ],
                        }));
                        setIsSkillPickerOpen(false);
                      }}
                    />
                  </>
                ) : null}
                {/* +input button */}
                <StatePortCreateButton
                  side="input"
                  visible
                  stateFields={stateFields}
                  onBindState={(stateKey) => data.onBindStateToPort?.("input", stateKey) ?? false}
                  onCreateState={(field) => data.onCreateStateAndBindToPort?.("input", field) ?? false}
                />
                {/* +output button */}
                <StatePortCreateButton
                  side="output"
                  visible
                  stateFields={stateFields}
                  onBindState={(stateKey) => data.onBindStateToPort?.("output", stateKey) ?? false}
                  onCreateState={(field) => data.onCreateStateAndBindToPort?.("output", field) ?? false}
                />
              </div>
              {/* ── attached skill pills ── */}
              {config.skills.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {config.skills.map((skill) => {
                    const def = (data.skillDefinitions ?? []).find((d) => d.skillKey === skill.skillKey);
                    return (
                      <span
                        key={skill.skillKey}
                        title={def?.description ?? skill.skillKey}
                        className="group/pill inline-flex items-center gap-1 rounded-full border border-[rgba(37,99,235,0.18)] bg-[rgba(239,246,255,0.88)] px-2.5 py-0.5 text-[0.68rem] font-medium text-[#2563eb]"
                      >
                        <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.6">
                          <path d="M8 2.5v4l2.5 1.5" />
                          <circle cx="8" cy="8" r="5.5" />
                        </svg>
                        {def?.label ?? skill.name}
                        <button
                          type="button"
                          title="Remove skill"
                          className="ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full opacity-0 transition hover:bg-[rgba(185,28,28,0.12)] hover:text-[rgb(185,28,28)] group-hover/pill:opacity-100"
                          onClick={() => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), skills: (currentConfig as AgentNode).skills.filter((s) => s.skillKey !== skill.skillKey) }))}
                        >
                          <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-none stroke-current" strokeWidth="2">
                            <path d="m5 5 6 6" />
                            <path d="m11 5-6 6" />
                          </svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <FieldTextarea
                className="min-h-20"
                value={config.taskInstruction}
                placeholder="描述这个节点应该做什么（可留空）"
                onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), taskInstruction: event.target.value }))}
              />
              <details className="text-sm text-[var(--muted)]">
                <summary className="cursor-pointer select-none py-1 text-xs font-medium uppercase tracking-wider">Advanced</summary>
                <div className="mt-2 grid gap-3">
                  {agentRuntime ? (
                    <>
                      <label className="grid gap-1.5">
                        <span>Temperature</span>
                        <Input type="number" min={0} max={2} step={0.1} value={String(agentRuntime.temperature)} onChange={(event) => { const v = event.target.value === "" ? DEFAULT_AGENT_TEMPERATURE : Number(event.target.value); if (Number.isFinite(v)) data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as AgentNode), temperature: normalizeAgentTemperature(v) })); }} />
                      </label>
                    </>
                  ) : null}
                  <AdvancedJsonSection
                    sections={[
                      { label: "Inputs JSON", value: config.inputs, onChange: (v) => data.onConfigChange?.((c) => ({ ...(c as AgentNode), inputs: v as PortDefinition[] })) },
                      { label: "Outputs JSON", value: config.outputs, onChange: (v) => data.onConfigChange?.((c) => ({ ...(c as AgentNode), outputs: v as PortDefinition[] })) },
                      { label: "Output Binding JSON", value: config.outputBinding, onChange: (v) => data.onConfigChange?.((c) => ({ ...(c as AgentNode), outputBinding: v as Record<string, string> })), minHeight: "min-h-24" },
                    ]}
                  />
                </div>
              </details>
            </>
          ) : null}

          {config.family === "condition" ? (
            <>
                  <BranchEditorList
                    branches={config.branches}
                    onChange={(nextBranches) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), branches: nextBranches }))}
                  />
                  <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                    <span>Condition Mode</span>
                    <FieldSelect
                      value={config.conditionMode}
                      onValueChange={(nextValue) =>
                        data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as ConditionNode), conditionMode: nextValue as ConditionNode["conditionMode"] }))
                      }
                      options={CONDITION_MODE_SELECT_OPTIONS}
                    />
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
          ) : null}

          {config.family === "output" ? (
            <>
              {/* Preview */}
              <div className="flex min-h-[160px] flex-1 flex-col rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Preview</div>
                  <div className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{resolveRichContentDisplayMode(data.resolvedDisplayMode ?? config.displayMode, data.previewText)}</div>
                </div>
                <div className="nodrag nowheel min-h-[120px] flex-1 overflow-auto rounded-[12px] bg-[rgba(248,242,234,0.8)] px-3 py-3 text-sm leading-6 text-[var(--text)] select-text">
                  <OutputPreviewContent text={data.previewText} displayMode={config.displayMode} />
                </div>
              </div>
              {/* Advanced */}
              <details className="text-sm text-[var(--muted)]">
                <summary className="cursor-pointer select-none py-1 text-xs font-medium uppercase tracking-wider">Advanced</summary>
                <div className="mt-2 grid gap-3">
                  {/* Display */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xs">Display</span>
                    <div className="flex items-center gap-2">
                      {OUTPUT_DISPLAY_MODE_BUTTONS.map((option) => {
                        const active = config.displayMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            title={option.label}
                            aria-label={option.label}
                            className={cn(
                              "inline-flex h-7 items-center rounded-full border px-2.5 text-[0.68rem] font-medium transition-colors",
                              active
                                ? "border-[var(--accent)] bg-[rgba(154,52,18,0.1)] text-[var(--accent-strong)]"
                                : "border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.72)] text-[var(--muted)] hover:bg-[rgba(255,248,240,0.92)]",
                            )}
                            onClick={() =>
                              data.onConfigChange?.((currentConfig) => ({
                                ...(currentConfig as OutputBoundaryNode),
                                displayMode: option.value,
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Format */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xs">Format</span>
                    <div className="flex items-center gap-2">
                      {OUTPUT_SAVE_FORMAT_BUTTONS.map((option) => {
                        const active = config.persistFormat === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            title={option.label}
                            aria-label={option.label}
                            className={cn(
                              "inline-flex h-7 items-center rounded-full border px-2.5 text-[0.68rem] font-medium transition-colors",
                              active
                                ? "border-[var(--accent)] bg-[rgba(154,52,18,0.1)] text-[var(--accent-strong)]"
                                : "border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.72)] text-[var(--muted)] hover:bg-[rgba(255,248,240,0.92)]",
                            )}
                            onClick={() =>
                              data.onConfigChange?.((currentConfig) => ({
                                ...(currentConfig as OutputBoundaryNode),
                                persistFormat: option.value,
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* FileName */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 text-xs">FileName</span>
                    <Input
                      value={config.fileNameTemplate}
                      onChange={(event) => data.onConfigChange?.((currentConfig) => ({ ...(currentConfig as OutputBoundaryNode), fileNameTemplate: event.target.value }))}
                      placeholder={getNodeDisplayName(config) || "Output"}
                      className="h-8 min-w-0 flex-1 text-xs"
                    />
                  </div>
                </div>
              </details>
            </>
          ) : null}

          {data.previewText && config.family !== "output" ? (
            <div className="whitespace-pre-wrap rounded-[16px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,244,240,0.9)] px-3 py-3 text-sm leading-6 text-[var(--text)]">
              {data.previewText}
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

function StateDefaultValueEditor({
  field,
  onChange,
}: {
  field: StateField;
  onChange: (nextValue: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => stringifyStateValue(field.value, field.type));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(stringifyStateValue(field.value, field.type));
    setError(null);
  }, [field.value, field.type]);

  if (field.type === "boolean") {
    return <EditorSwitchRow label="Value" checked={Boolean(field.value)} onCheckedChange={onChange} />;
  }

  if (field.type === "number") {
    return (
      <label className="grid gap-1.5 text-sm text-[var(--muted)]">
        <span>Value</span>
        <Input
          type="number"
          value={typeof field.value === "number" ? String(field.value) : ""}
          placeholder="0"
          onChange={(event) => {
            const nextValue = event.target.value.trim();
            onChange(nextValue === "" ? null : Number(nextValue));
          }}
        />
      </label>
    );
  }

  if (isStructuredStateType(field.type)) {
    const applyDraft = () => {
      try {
        const parsed = draft.trim() === "" ? defaultStateValueForType(field.type) : JSON.parse(draft);
        if ((field.type === "array" || field.type === "file_list") && !Array.isArray(parsed)) {
          setError("This state type requires a JSON array.");
          return;
        }
        if (field.type === "object" && (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")) {
          setError("This state type requires a JSON object.");
          return;
        }
        setError(null);
        onChange(parsed);
      } catch {
        setError("Default value must be valid JSON.");
      }
    };

    return (
      <div className="grid gap-2">
        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
          <span>Value</span>
          <FieldTextarea
            rows={5}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            placeholder={field.type === "array" || field.type === "file_list" ? "[]" : "{}"}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <div className={cn("text-xs leading-5", error ? "text-[rgb(153,27,27)]" : "text-[var(--muted)]")}>
            {error ?? "Apply JSON to sync the structured value."}
          </div>
          <button
            type="button"
            className="inline-flex items-center rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.9)] px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--accent-strong)] transition hover:bg-white"
            onClick={applyDraft}
          >
            Apply JSON
          </button>
        </div>
      </div>
    );
  }

  return (
    <label className="grid gap-1.5 text-sm text-[var(--muted)]">
      <span>Value</span>
      <FieldTextarea
        rows={field.type === "markdown" ? 5 : 3}
        value={typeof field.value === "string" ? field.value : String(field.value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.type === "markdown" ? "Write markdown..." : "Value"}
      />
    </label>
  );
}

function StateBindingChip({
  binding,
  selected,
  label,
  onFocus,
  onRemove,
}: {
  binding: StateBindingSummary;
  selected: boolean;
  label: string;
  onFocus: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[16px] border px-3 py-2 shadow-[0_10px_24px_rgba(60,41,20,0.06)]",
        binding.valid
          ? selected
            ? "border-[rgba(154,52,18,0.28)] bg-[rgba(255,244,240,0.96)]"
            : "border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.86)]"
          : "border-[rgba(185,28,28,0.18)] bg-[rgba(255,248,248,0.96)]",
      )}
    >
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onFocus}>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--accent-strong)]">
            {binding.nodeFamily}
          </span>
          <span className="truncate text-sm font-medium text-[var(--text)]">{binding.nodeLabel}</span>
        </div>
        <div className={cn("mt-1 text-xs leading-5", binding.valid ? "text-[var(--muted)]" : "text-[rgb(153,27,27)]")}>
          {label}: <span className="font-medium text-[var(--text)]">{binding.portLabel}</span>
          {binding.valid ? null : " · missing port"}
        </div>
      </button>
      <button
        type="button"
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border border-[rgba(154,52,18,0.14)] bg-[rgba(255,252,247,0.92)] text-[var(--muted)] transition hover:border-[rgba(185,28,28,0.22)] hover:text-[rgb(153,27,27)]"
        title="Remove binding"
        aria-label="Remove binding"
        onClick={onRemove}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.8">
          <path d="m5 5 6 6" />
          <path d="m11 5-6 6" />
        </svg>
      </button>
    </div>
  );
}

function NodeStateBindingSummary({
  config,
  stateFieldLookup,
  onOpenStatePanel,
}: {
  config: NodePresetDefinition;
  stateFieldLookup?: Record<string, string>;
  onOpenStatePanel?: () => void;
}) {
  void config;
  void stateFieldLookup;
  void onOpenStatePanel;
  return null;
}

function StateBindingCreateForm({
  mode,
  nodeOptions,
  onAdd,
  onCancel,
}: {
  mode: "read" | "write";
  nodeOptions: StateBindingNodeOption[];
  onAdd: (nodeId: string, portKey: string) => boolean;
  onCancel: () => void;
}) {
  const eligibleNodes = useMemo(
    () => nodeOptions.filter((node) => (mode === "read" ? node.inputs.length > 0 : node.outputs.length > 0)),
    [mode, nodeOptions],
  );
  const [nodeId, setNodeId] = useState(eligibleNodes[0]?.id ?? "");
  const selectedNode = eligibleNodes.find((node) => node.id === nodeId) ?? eligibleNodes[0] ?? null;
  const availablePorts = selectedNode ? (mode === "read" ? selectedNode.inputs : selectedNode.outputs) : [];
  const [portKey, setPortKey] = useState(availablePorts[0]?.key ?? "");

  useEffect(() => {
    if (!eligibleNodes.some((node) => node.id === nodeId)) {
      setNodeId(eligibleNodes[0]?.id ?? "");
    }
  }, [eligibleNodes, nodeId]);

  useEffect(() => {
    if (!availablePorts.some((port) => port.key === portKey)) {
      setPortKey(availablePorts[0]?.key ?? "");
    }
  }, [availablePorts, portKey]);

  if (eligibleNodes.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.78)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
        No eligible nodes are available for this binding type.
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-[18px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] p-3 shadow-[0_10px_24px_rgba(60,41,20,0.06)]">
      <label className="grid gap-1.5 text-sm text-[var(--muted)]">
        <span>{mode === "read" ? "Reader Node" : "Writer Node"}</span>
        <FieldSelect
          value={selectedNode?.id ?? ""}
          onValueChange={setNodeId}
          options={eligibleNodes.map((node) => ({
            value: node.id,
            label: node.label,
            detail: node.family,
          }))}
        />
      </label>
      <label className="grid gap-1.5 text-sm text-[var(--muted)]">
        <span>{mode === "read" ? "Input Port" : "Output Port"}</span>
        <FieldSelect
          value={portKey}
          onValueChange={setPortKey}
          options={availablePorts.map((port) => ({
            value: port.key,
            label: port.label,
            detail: port.key,
          }))}
          disabled={availablePorts.length === 0}
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="inline-flex items-center rounded-full border border-[rgba(154,52,18,0.14)] bg-[rgba(255,252,247,0.92)] px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--muted)] transition hover:bg-white"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,244,240,0.94)] px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--accent-strong)] transition hover:bg-[rgba(255,248,240,1)]"
          disabled={!selectedNode || !portKey}
          onClick={() => {
            if (!selectedNode || !portKey) return;
            if (onAdd(selectedNode.id, portKey)) {
              onCancel();
            }
          }}
        >
          {mode === "read" ? "Add Reader" : "Add Writer"}
        </button>
      </div>
    </div>
  );
}

function StateFieldCard({
  field,
  readers,
  writers,
  nodeOptions,
  selectedNodeId,
  onRenameState,
  onUpdateState,
  onDeleteState,
  onAddReader,
  onRemoveReader,
  onAddWriter,
  onRemoveWriter,
  onFocusNode,
}: {
  field: StateField;
  readers: StateBindingSummary[];
  writers: StateBindingSummary[];
  nodeOptions: StateBindingNodeOption[];
  selectedNodeId: string | null;
  onRenameState: (currentKey: string, nextKey: string) => boolean;
  onUpdateState: (stateKey: string, updater: (current: StateField) => StateField) => void;
  onDeleteState: (stateKey: string) => void;
  onAddReader: (stateKey: string, nodeId: string, inputKey: string) => boolean;
  onRemoveReader: (stateKey: string, nodeId: string, inputKey: string) => void;
  onAddWriter: (stateKey: string, nodeId: string, outputKey: string) => boolean;
  onRemoveWriter: (stateKey: string, nodeId: string, outputKey: string) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  const [draftKey, setDraftKey] = useState(field.key);
  const [showReaderForm, setShowReaderForm] = useState(false);
  const [showWriterForm, setShowWriterForm] = useState(false);

  useEffect(() => {
    setDraftKey(field.key);
  }, [field.key]);

  const commitKey = () => {
    const nextKey = draftKey.trim();
    if (!nextKey) {
      setDraftKey(field.key);
      return;
    }
    if (nextKey === field.key) {
      return;
    }
    const renamed = onRenameState(field.key, nextKey);
    if (!renamed) {
      setDraftKey(field.key);
    }
  };

  return (
    <div className="rounded-[24px] border border-[rgba(154,52,18,0.16)] bg-[linear-gradient(180deg,rgba(255,250,241,0.96)_0%,rgba(248,237,219,0.94)_100%)] p-4 shadow-[0_18px_36px_rgba(60,41,20,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.72)] px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--accent-strong)]">
              state
            </span>
            <div className="truncate text-sm font-semibold text-[var(--text)]">{getStateDisplayName(field)}</div>
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {readers.length} readers · {writers.length} writers
          </div>
        </div>
        <button
          type="button"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-[rgba(154,52,18,0.14)] bg-[rgba(255,252,247,0.92)] text-[var(--muted)] transition hover:border-[rgba(185,28,28,0.22)] hover:text-[rgb(153,27,27)]"
          title="Delete state"
          aria-label="Delete state"
          onClick={() => onDeleteState(field.key)}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7">
            <path d="M3.5 4.5h9" />
            <path d="M6.5 2.75h3" />
            <path d="M5 4.5V12a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4.5" />
            <path d="M6.75 6.5v4" />
            <path d="M9.25 6.5v4" />
          </svg>
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
          <span>Key</span>
          <Input
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            onBlur={commitKey}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitKey();
              }
              if (event.key === "Escape") {
                setDraftKey(field.key);
              }
            }}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_148px]">
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Name</span>
            <Input
              value={field.name}
              onChange={(event) =>
                onUpdateState(field.key, (current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Type</span>
            <FieldSelect
              value={field.type}
              onValueChange={(nextValue) =>
                onUpdateState(field.key, (current) => ({
                  ...current,
                  type: nextValue as StateFieldType,
                  value: defaultStateValueForType(nextValue as StateFieldType),
                }))
              }
              options={STATE_FIELD_TYPE_OPTIONS.map((type) => ({
                value: type,
                label: type,
              }))}
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm text-[var(--muted)]">
          <span>Description</span>
          <FieldTextarea
            rows={3}
            value={field.description}
            onChange={(event) =>
              onUpdateState(field.key, (current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_88px]">
          <label className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Color</span>
            <Input
              value={field.ui?.color ?? ""}
              placeholder="#d97706"
              onChange={(event) =>
                onUpdateState(field.key, (current) => ({
                  ...current,
                  ui: {
                    ...(current.ui ?? {}),
                    color: event.target.value,
                  },
                }))
              }
            />
          </label>
          <div className="grid gap-1.5 text-sm text-[var(--muted)]">
            <span>Swatch</span>
            <div
              className="h-11 rounded-[16px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
              style={{ backgroundColor: field.ui?.color?.trim() || "rgba(255,255,255,0.78)" }}
            />
          </div>
        </div>

        <StateDefaultValueEditor
          field={field}
          onChange={(nextValue) =>
            onUpdateState(field.key, (current) => ({
              ...current,
              value: nextValue,
            }))
          }
        />
      </div>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Readers</div>
              <div className="mt-1 text-xs leading-5 text-[var(--muted)]">State values injected into node inputs.</div>
            </div>
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,244,240,0.94)] px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--accent-strong)] transition hover:bg-[rgba(255,248,240,1)]"
              onClick={() => setShowReaderForm((current) => !current)}
            >
              {showReaderForm ? "Close" : "Add Reader"}
            </button>
          </div>
          {readers.length > 0 ? (
            <div className="grid gap-2">
              {readers.map((binding) => (
                <StateBindingChip
                  key={binding.id}
                  binding={binding}
                  selected={selectedNodeId === binding.nodeId}
                  label="Input"
                  onFocus={() => onFocusNode(binding.nodeId)}
                  onRemove={() => onRemoveReader(field.key, binding.nodeId, binding.portKey)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.78)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
              No readers yet.
            </div>
          )}
          {showReaderForm ? (
            <StateBindingCreateForm
              mode="read"
              nodeOptions={nodeOptions}
              onAdd={(nodeId, inputKey) => onAddReader(field.key, nodeId, inputKey)}
              onCancel={() => setShowReaderForm(false)}
            />
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Writers</div>
              <div className="mt-1 text-xs leading-5 text-[var(--muted)]">Node outputs that write back into this state.</div>
            </div>
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,244,240,0.94)] px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--accent-strong)] transition hover:bg-[rgba(255,248,240,1)]"
              onClick={() => setShowWriterForm((current) => !current)}
            >
              {showWriterForm ? "Close" : "Add Writer"}
            </button>
          </div>
          {writers.length > 0 ? (
            <div className="grid gap-2">
              {writers.map((binding) => (
                <StateBindingChip
                  key={binding.id}
                  binding={binding}
                  selected={selectedNodeId === binding.nodeId}
                  label="Output"
                  onFocus={() => onFocusNode(binding.nodeId)}
                  onRemove={() => onRemoveWriter(field.key, binding.nodeId, binding.portKey)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.78)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
              No writers yet.
            </div>
          )}
          {showWriterForm ? (
            <StateBindingCreateForm
              mode="write"
              nodeOptions={nodeOptions}
              onAdd={(nodeId, outputKey) => onAddWriter(field.key, nodeId, outputKey)}
              onCancel={() => setShowWriterForm(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatePanel({
  open,
  stateSchema,
  readersByKey,
  writersByKey,
  nodeOptions,
  selectedNodeId,
  onToggle,
  onAddState,
  onRenameState,
  onUpdateState,
  onDeleteState,
  onAddReader,
  onRemoveReader,
  onAddWriter,
  onRemoveWriter,
  onFocusNode,
}: {
  open: boolean;
  stateSchema: StateField[];
  readersByKey: Record<string, StateBindingSummary[]>;
  writersByKey: Record<string, StateBindingSummary[]>;
  nodeOptions: StateBindingNodeOption[];
  selectedNodeId: string | null;
  onToggle: () => void;
  onAddState: () => void;
  onRenameState: (currentKey: string, nextKey: string) => boolean;
  onUpdateState: (stateKey: string, updater: (current: StateField) => StateField) => void;
  onDeleteState: (stateKey: string) => void;
  onAddReader: (stateKey: string, nodeId: string, inputKey: string) => boolean;
  onRemoveReader: (stateKey: string, nodeId: string, inputKey: string) => void;
  onAddWriter: (stateKey: string, nodeId: string, outputKey: string) => boolean;
  onRemoveWriter: (stateKey: string, nodeId: string, outputKey: string) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  if (!open) {
    return (
      <aside className="flex h-full min-h-0 items-center justify-center border-l border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.72)] px-2 backdrop-blur-xl">
        <button
          type="button"
          className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-4 rounded-[22px] border border-[rgba(154,52,18,0.16)] bg-[linear-gradient(180deg,rgba(255,250,241,0.92)_0%,rgba(248,237,219,0.92)_100%)] px-2 py-4 text-[var(--text)] shadow-[0_18px_36px_rgba(60,41,20,0.08)] transition hover:bg-[linear-gradient(180deg,rgba(255,252,247,0.96)_0%,rgba(249,239,223,0.96)_100%)]"
          onClick={onToggle}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current text-[var(--accent-strong)]" strokeWidth="1.7">
            <path d="M4 4.5h8v7H4z" />
            <path d="M6.5 6.5h3M6.5 9h3" />
          </svg>
          <span className="[writing-mode:vertical-rl] rotate-180 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            State Panel
          </span>
          <span className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,255,255,0.82)] px-2 py-0.5 text-[0.68rem] font-medium text-[var(--muted)]">
            {stateSchema.length}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.78)] backdrop-blur-xl">
      <div className="border-b border-[rgba(154,52,18,0.14)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.16em] text-[var(--accent-strong)]">Graph State</div>
            <div className="mt-2 text-xl font-semibold text-[var(--text)]">State Panel</div>
            <div className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Edit graph-level state and sync reader or writer bindings back to nodes.
            </div>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(154,52,18,0.14)] bg-[rgba(255,252,247,0.92)] text-[var(--muted)] transition hover:bg-white"
            title="Collapse state panel"
            aria-label="Collapse state panel"
            onClick={onToggle}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
              <path d="M10.5 3.5 5.5 8l5 4.5" />
            </svg>
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 shadow-[0_10px_24px_rgba(60,41,20,0.06)]">
          <div>
            <div className="text-sm font-medium text-[var(--text)]">{stateSchema.length} state objects</div>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">These objects are persisted with the graph and restored during editing.</div>
          </div>
          <Button size="sm" onClick={onAddState}>
            Add State
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {stateSchema.length > 0 ? (
          <div className="grid gap-4">
            {stateSchema.map((field) => (
              <StateFieldCard
                key={field.key}
                field={field}
                readers={readersByKey[field.key] ?? []}
                writers={writersByKey[field.key] ?? []}
                nodeOptions={nodeOptions}
                selectedNodeId={selectedNodeId}
                onRenameState={onRenameState}
                onUpdateState={onUpdateState}
                onDeleteState={onDeleteState}
                onAddReader={onAddReader}
                onRemoveReader={onRemoveReader}
                onAddWriter={onAddWriter}
                onRemoveWriter={onRemoveWriter}
                onFocusNode={onFocusNode}
              />
            ))}
          </div>
        ) : (
          <div className="grid min-h-full place-items-center rounded-[28px] border border-dashed border-[rgba(154,52,18,0.24)] bg-[rgba(255,250,241,0.72)] px-6 py-8 text-center shadow-[0_18px_40px_rgba(60,41,20,0.08)]">
            <div className="max-w-[280px]">
              <div className="text-[0.72rem] uppercase tracking-[0.16em] text-[var(--accent-strong)]">No State Yet</div>
              <div className="mt-3 text-lg font-semibold text-[var(--text)]">Create the first graph state object</div>
              <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                State definitions live with the graph and can be wired into node inputs or outputs from this panel.
              </div>
              <Button size="sm" className="mt-4" onClick={onAddState}>
                Add State
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function NodeSystemCanvas({ initialGraph, isNewFromTemplate }: { initialGraph: GraphPayload; isNewFromTemplate: boolean }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const reactFlow = useReactFlow<FlowNode, Edge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const [canonicalGraphState, setCanonicalGraphState] = useState<CanonicalGraph>(() => JSON.parse(JSON.stringify(initialGraph)) as CanonicalGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const nodesInitialized = useNodesInitialized();
  const autoLayoutDoneRef = useRef(false);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isStatePanelOpen, setIsStatePanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState("Node system phase 4: skill definitions connected.");
  const [persistedPresets, setPersistedPresets] = useState<EditorPresetRecord[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunStatus, setActiveRunStatus] = useState<RunStatus | null>(null);
  const [currentRunNodeId, setCurrentRunNodeId] = useState<string | null>(null);
  const [runNodeStatusMap, setRunNodeStatusMap] = useState<Record<string, RunNodeStatus>>({});
  const [skillDefinitions, setSkillDefinitions] = useState<SkillDefinition[]>([]);
  const [skillDefinitionsLoading, setSkillDefinitionsLoading] = useState(true);
  const [skillDefinitionsError, setSkillDefinitionsError] = useState<string | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [editorSettings, setEditorSettings] = useState<EditorSettingsPayload | null>(null);
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
  const graphName = canonicalGraphState.name;
  const graphId = canonicalGraphState.graph_id ?? null;
  const metadata = canonicalGraphState.metadata;
  const stateSchema = useMemo(() => buildEditorStateFieldsFromCanonicalGraph(canonicalGraphState), [canonicalGraphState]);

  const allPresets = useMemo(
    () => [...NODE_PRESETS_MOCK, ...persistedPresets.map((preset) => preset.definition)].filter((preset) => isPresetEligibleFamily(preset.family)),
    [persistedPresets],
  );
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
    const boundaryEntries: CreationMenuEntry[] = sourceType
      ? [
          {
            id: `node-output-${sourceType}`,
            family: "output",
            label: "Output",
            description: `Preview or persist the current ${formatValueTypeLabel(sourceType).toLowerCase()} result.`,
            mode: "node",
            nodeKind: "output",
          },
        ]
      : [
          {
            id: "node-input",
            family: "input",
            label: "Input",
            description: "Create a workflow input boundary for the current graph.",
            mode: "node",
            nodeKind: "input",
          },
          {
            id: "node-output",
            family: "output",
            label: "Output",
            description: "Create a workflow output boundary for the current graph.",
            mode: "node",
            nodeKind: "output",
          },
        ];
    const presetEntries: CreationMenuEntry[] = getRecommendedPresets(sourceType).map((preset) => ({
      id: `preset-${preset.presetId}`,
      family: preset.family,
      label: getNodeDisplayName(preset, preset.presetId),
      description: preset.description,
      mode: "preset",
      presetId: preset.presetId,
    }));
    return [...boundaryEntries, ...presetEntries]
      .filter((entry) => {
        if (!query) return true;
        return [entry.label, entry.description, entry.family, entry.presetId ?? entry.nodeKind ?? entry.id].some((value) =>
          value.toLowerCase().includes(query),
        );
      })
      .sort((left, right) => {
        const familyDelta = CREATION_MENU_FAMILY_PRIORITY[left.family] - CREATION_MENU_FAMILY_PRIORITY[right.family];
        if (familyDelta !== 0) return familyDelta;
        if (left.mode !== right.mode) return left.mode === "node" ? -1 : 1;
        return left.label.localeCompare(right.label);
      });
  }, [creationMenu?.sourceValueType, getRecommendedPresets, search]);

  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const previewTextByNode = useMemo(() => {
    return Object.fromEntries(nodes.map((node) => [node.id, createPreviewText(node, nodes, edges)]));
  }, [edges, nodes]);
  const derivedCanonicalGraph = useMemo<CanonicalGraph>(() => {
    const projection = buildCanonicalFlowProjection(nodes, edges);
    return {
      graph_id: graphId,
      name: graphName,
      state_schema: canonicalGraphState.state_schema,
      nodes: projection.nodes,
      edges: projection.edges,
      conditional_edges: projection.conditional_edges,
      metadata,
    };
  }, [canonicalGraphState.state_schema, edges, graphId, graphName, metadata, nodes]);
  const canonicalGraph = canonicalGraphState;
  const canonicalGraphForSubmission = useMemo<CanonicalGraph>(() => {
    const mergedNodes = { ...derivedCanonicalGraph.nodes };
    for (const [nodeId, currentNode] of Object.entries(canonicalGraphState.nodes)) {
      const derivedNode = derivedCanonicalGraph.nodes[nodeId];
      mergedNodes[nodeId] = derivedNode
        ? {
            ...derivedNode,
            ...currentNode,
            ui: derivedNode.ui,
          }
        : currentNode;
    }

    return {
      ...derivedCanonicalGraph,
      graph_id: canonicalGraphState.graph_id,
      name: canonicalGraphState.name,
      state_schema: canonicalGraphState.state_schema,
      nodes: mergedNodes,
      metadata: canonicalGraphState.metadata,
    };
  }, [canonicalGraphState, derivedCanonicalGraph]);
  const canonicalNodeKeys = useMemo(() => Object.keys(canonicalGraph.nodes), [canonicalGraph]);
  const canonicalStateCount = useMemo(() => Object.keys(canonicalGraph.state_schema).length, [canonicalGraph]);
  const nodeLabelLookup = useMemo(
    () => new Map(Object.keys(canonicalGraph.nodes).map((nodeId) => [nodeId, getCanonicalNodeDisplayName(canonicalGraph, nodeId)])),
    [canonicalGraph],
  );
  const stateFieldLookup = useMemo(
    () =>
      Object.fromEntries(
        stateSchema.map((field) => [field.key, getStateDisplayName(field)]),
      ),
    [stateSchema],
  );
  const stateBindingNodeOptions = useMemo<StateBindingNodeOption[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        label: getCanonicalNodeDisplayName(canonicalGraph, node.id),
        family: node.data.config.family,
        inputs: resolvePortsForDisplay(node.data.config, "input", stateSchema),
        outputs:
          node.data.config.family === "output"
            ? resolvePortsForDisplay(node.data.config, "input", stateSchema)
            : resolvePortsForDisplay(node.data.config, "output", stateSchema),
      })),
    [canonicalGraph, nodes, stateSchema],
  );
  const stateBindingsByKey = useMemo(() => {
    const readersByKey: Record<string, StateBindingSummary[]> = {};
    const writersByKey: Record<string, StateBindingSummary[]> = {};

    for (const node of nodes) {
      const nodeLabel = getCanonicalNodeDisplayName(canonicalGraph, node.id);
      const inputPorts = resolvePortsForDisplay(node.data.config, "input", stateSchema);
      const outputPorts =
        node.data.config.family === "output"
          ? resolvePortsForDisplay(node.data.config, "input", stateSchema)
          : resolvePortsForDisplay(node.data.config, "output", stateSchema);

      for (const binding of node.data.config.stateReads ?? []) {
        const matchedPort = inputPorts.find((port) => port.key === binding.inputKey);
        const summary: StateBindingSummary = {
          id: `${node.id}:read:${binding.inputKey}:${binding.stateKey}`,
          nodeId: node.id,
          nodeLabel,
          nodeFamily: node.data.config.family,
          portKey: binding.inputKey,
          portLabel: matchedPort?.label ?? binding.inputKey,
          valid: Boolean(matchedPort),
        };
        readersByKey[binding.stateKey] = [...(readersByKey[binding.stateKey] ?? []), summary];
      }

      for (const binding of node.data.config.stateWrites ?? []) {
        const matchedPort = outputPorts.find((port) => port.key === binding.outputKey);
        const summary: StateBindingSummary = {
          id: `${node.id}:write:${binding.outputKey}:${binding.stateKey}`,
          nodeId: node.id,
          nodeLabel,
          nodeFamily: node.data.config.family,
          portKey: binding.outputKey,
          portLabel: matchedPort?.label ?? binding.outputKey,
          valid: Boolean(matchedPort),
        };
        writersByKey[binding.stateKey] = [...(writersByKey[binding.stateKey] ?? []), summary];
      }
    }

    return {
      readersByKey,
      writersByKey,
    };
  }, [canonicalGraph, nodes, stateSchema]);
  const runNodeSummary = useMemo(() => summarizeRunNodeStates(nodeIds, runNodeStatusMap), [nodeIds, runNodeStatusMap]);
  const suppressOutputPreviewFallback = activeRunStatus === "queued" || activeRunStatus === "running";
  const knowledgeSkillSyncSignature = useMemo(
    () =>
      nodes
        .map((node) => {
          const inputs = listInputPorts(node.data.config)
            .map((port) => `${port.key}:${port.valueType}:${port.required ? "1" : "0"}`)
            .join(",");
          const outputs = listOutputPorts(node.data.config)
            .map((port) => `${port.key}:${port.valueType}`)
            .join(",");
          return `${node.id}|${node.data.config.family}|${inputs}|${outputs}`;
        })
        .join("::"),
    [nodes],
  );
  const agentRuntimeDefaults = useMemo(
    () => ({
      globalTextModelRef:
        editorSettings?.agent_runtime_defaults?.model || editorSettings?.model.text_model_ref || DEFAULT_EDITOR_TEXT_MODEL_REF,
      globalThinkingEnabled:
        editorSettings?.agent_runtime_defaults?.thinking_enabled ?? DEFAULT_AGENT_THINKING_ENABLED,
      defaultAgentTemperature:
        editorSettings?.agent_runtime_defaults?.temperature ?? DEFAULT_AGENT_TEMPERATURE,
    }),
    [editorSettings],
  );
  const availableModelRefs = useMemo(
    () =>
      Array.from(
        new Set(
          (editorSettings?.model_catalog?.providers ?? [])
            .filter((provider) => provider.configured)
            .flatMap((provider) => provider.models.map((model) => model.model_ref)),
        ),
      ),
    [editorSettings],
  );
  const modelDisplayLookup = useMemo(
    () =>
      buildModelDisplayLookup(
        (editorSettings?.model_catalog?.providers ?? [])
          .filter((provider) => provider.configured)
          .flatMap((provider) => provider.models),
      ),
    [editorSettings],
  );
  const formatRunStatusText = useCallback(
    (run: RunDetail) => {
      const summary = summarizeRunNodeStates(nodeIds, run.node_status_map ?? {});
      const currentNodeLabel = run.current_node_id ? nodeLabelLookup.get(run.current_node_id) ?? run.current_node_id : null;
      const cycleSummaryText =
        run.cycle_summary?.has_cycle
          ? ` Iterations ${run.cycle_summary.iteration_count}/${run.cycle_summary.max_iterations || run.cycle_summary.iteration_count}.`
          : "";
      if (run.status === "queued") {
        return `Run ${run.run_id} queued. Pending ${summary.idle} nodes.${cycleSummaryText}`;
      }
      if (run.status === "running") {
        const currentLabelText = currentNodeLabel ? `Running ${currentNodeLabel}. ` : "";
        return `${currentLabelText}Done ${summary.success} · Active ${summary.running} · Pending ${summary.idle} · Failed ${summary.failed}.${cycleSummaryText}`;
      }
      if (run.status === "failed") {
        const runErrors = run.errors?.filter(Boolean) ?? [];
        const baseText = currentNodeLabel ? `Run failed at ${currentNodeLabel}.` : `Run ${run.run_id} failed.`;
        const detailText = runErrors.length > 0 ? `${baseText} ${runErrors.join("; ")}` : baseText;
        return `${detailText}${cycleSummaryText}`;
      }
      return `Run completed. OK ${summary.success} · Pending ${summary.idle} · Failed ${summary.failed}.${cycleSummaryText}`;
    },
    [nodeIds, nodeLabelLookup],
  );

  const hydrateRunResult = useCallback(
    (run: RunDetail) => {
      setActiveRunStatus(run.status);
      setCurrentRunNodeId(run.current_node_id ?? null);
      setRunNodeStatusMap(run.node_status_map ?? {});
      const outputPreviewMap = new Map<string, string>();
      const resolvedDisplayModeMap = new Map<string, string>();
      for (const output of run.artifacts.exported_outputs ?? []) {
        if (!output.node_id) continue;
        outputPreviewMap.set(output.node_id, formatRichContentValue(output.value));
        if (output.display_mode) {
          resolvedDisplayModeMap.set(output.node_id, output.display_mode);
        }
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
            const resolvedDisplayMode = resolvedDisplayModeMap.get(node.id);
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
                resolvedDisplayMode,
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
    [setActiveRunStatus, setCurrentRunNodeId, setNodes, setRunNodeStatusMap],
  );

  useEffect(() => {
    if (!activeRunId) return;

    let cancelled = false;
    let pollTimer: number | null = null;

    async function pollRun() {
      try {
        const run = await apiGet<RunDetail>(`/api/runs/${activeRunId}`);
        if (cancelled) return;
        hydrateRunResult(run);
        setStatusMessage(formatRunStatusText(run));
        if (run.status === "queued" || run.status === "running") {
          pollTimer = window.setTimeout(() => {
            void pollRun();
          }, 500);
        }
      } catch (error) {
        if (cancelled) return;
        setStatusMessage(error instanceof Error ? error.message : "Failed to load run detail.");
        pollTimer = window.setTimeout(() => {
          void pollRun();
        }, 1000);
      }
    }

    void pollRun();

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [activeRunId, formatRunStatusText, hydrateRunResult]);

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
    apiGet<KnowledgeBaseOption[]>("/api/knowledge/bases").then(setKnowledgeBases).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadEditorSettings() {
      try {
        const payload = await apiGet<EditorSettingsPayload>("/api/settings");
        if (!active) return;
        setEditorSettings(payload);
      } catch {
        if (!active) return;
        setEditorSettings(null);
      }
    }

    void loadEditorSettings();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const initialNodes = Object.entries(initialGraph.nodes).map(([nodeId, node]) =>
      createFlowNodeFromCanonicalNode(nodeId, node, initialGraph.state_schema),
    );
    const nodesById = new Map(initialNodes.map((node) => [node.id, node]));
    const initialEdges = createFlowEdgesFromCanonicalGraph(initialGraph, nodesById);
    autoLayoutDoneRef.current = false;
    setCanonicalGraphState(JSON.parse(JSON.stringify(initialGraph)) as CanonicalGraph);
    setActiveRunId(null);
    setActiveRunStatus(null);
    setCurrentRunNodeId(null);
    setRunNodeStatusMap({});
    setSelectedNodeId(null);
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialGraph, setEdges, setNodes]);

  useEffect(() => {
    const derivedCanonical = buildCanonicalFlowProjection(nodes, edges);
    setCanonicalGraphState((current) => {
      let changed = false;
      const flowNodeIds = new Set(nodes.map((node) => node.id));
      const nextNodes = { ...current.nodes };

      for (const [nodeId, existingNode] of Object.entries(current.nodes)) {
        if (!flowNodeIds.has(nodeId)) {
          delete nextNodes[nodeId];
          changed = true;
          continue;
        }
        const derivedNode = derivedCanonical.nodes[nodeId];
        if (derivedNode && JSON.stringify(existingNode.ui) !== JSON.stringify(derivedNode.ui)) {
          nextNodes[nodeId] = {
            ...existingNode,
            ui: derivedNode.ui,
          };
          changed = true;
        }
      }

      for (const node of nodes) {
        if (!nextNodes[node.id]) {
          nextNodes[node.id] = buildCanonicalNodeFromFlowNode(node);
          changed = true;
        }
      }

      const nextEdges =
        JSON.stringify(current.edges) === JSON.stringify(derivedCanonical.edges) ? current.edges : derivedCanonical.edges;
      const nextConditionalEdges =
        JSON.stringify(current.conditional_edges) === JSON.stringify(derivedCanonical.conditional_edges)
          ? current.conditional_edges
          : derivedCanonical.conditional_edges;

      if (nextEdges !== current.edges || nextConditionalEdges !== current.conditional_edges) {
        changed = true;
      }

      if (!changed) {
        return current;
      }

      return {
        ...current,
        nodes: nextNodes,
        edges: nextEdges,
        conditional_edges: nextConditionalEdges,
      };
    });
  }, [edges, nodes]);

  useEffect(() => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    let changed = false;
    const changedCanonicalNodes: Record<string, CanonicalGraph["nodes"][string]> = {};
    const nextNodes = nodes.map((node) => {
      if (node.data.config.family !== "agent") {
        return node;
      }
      const nextConfig = syncKnowledgeBaseSkillOnAgent(node, nodesById, edges);
      if (nextConfig === node.data.config) {
        return node;
      }
      changed = true;
      changedCanonicalNodes[node.id] = buildCanonicalNodeFromFlowNode(
        {
          ...node,
          data: {
            ...node.data,
            config: nextConfig,
          },
        },
        nextConfig,
      );
      return {
        ...node,
        data: {
          ...node.data,
          config: nextConfig,
        },
      };
    });

    if (!changed) {
      return;
    }

    setNodes(nextNodes);
    setCanonicalGraphState((current) => ({
      ...current,
      nodes: {
        ...current.nodes,
        ...changedCanonicalNodes,
      },
    }));
  }, [edges, knowledgeSkillSyncSignature, nodes, setNodes]);

  useEffect(() => {
    if (!isNewFromTemplate) return;
    if (!nodesInitialized) return;
    if (autoLayoutDoneRef.current) return;
    autoLayoutDoneRef.current = true;

    setNodes((current) => {
      if (current.length === 0) return current;

      // Group nodes into columns by their original x position (within 200px tolerance)
      const sorted = [...current].sort((a, b) => a.position.x - b.position.x);
      const columns: FlowNode[][] = [];
      for (const node of sorted) {
        const lastColumn = columns[columns.length - 1];
        if (lastColumn && Math.abs(node.position.x - lastColumn[0].position.x) < 200) {
          lastColumn.push(node);
        } else {
          columns.push([node]);
        }
      }

      // Layout columns: each column gets a fresh x, nodes within a column keep their relative y
      const GAP = 80;
      let nextX = sorted[0].position.x;
      const positionMap = new Map<string, { x: number; y: number }>();

      for (const column of columns) {
        const maxWidth = Math.max(...column.map((n) => n.measured?.width ?? (typeof n.style?.width === "number" ? n.style.width : 280)));
        for (const node of column) {
          positionMap.set(node.id, { x: nextX, y: node.position.y });
        }
        nextX += maxWidth + GAP;
      }

      return current.map((node) => {
        const pos = positionMap.get(node.id);
        return pos ? { ...node, position: pos } : node;
      });
    });
  }, [isNewFromTemplate, nodesInitialized, setNodes]);

  useEffect(() => {
    let active = true;

    async function loadPersistedPresets() {
      try {
        setPresetsLoading(true);
        setPresetsError(null);
        const payload = await apiGet<CanonicalPresetDocument[]>("/api/presets");
        if (!active) return;
        setPersistedPresets(
          payload
            .map(buildEditorPresetRecordFromCanonicalPreset)
            .filter((item) => isPresetEligibleFamily(item.definition.family)),
        );
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
    const normalizedConfig = normalizeNodeConfig(config);
    const id = `${config.family}_${crypto.randomUUID().slice(0, 8)}`;
    const defaultWidth = getDefaultNodeWidth(normalizedConfig);
    return {
      id,
      type: "default",
      position,
      data: {
        nodeId: id,
        config: normalizedConfig,
        previewText: "",
        isExpanded: true,
        collapsedSize: null,
        expandedSize: { width: defaultWidth },
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: buildNodeStyleFromState(normalizedConfig, true, { width: defaultWidth }, defaultWidth),
    } satisfies FlowNode;
  }

  function createNodeFromPreset(preset: NodePresetDefinition, position: { x: number; y: number }) {
    const config = deepClonePreset(preset);
    return createNodeFromConfig(config, position);
  }

  function ensurePresetStateFields(stateFieldsToMerge: StateField[]) {
    const existingKeys = new Set(stateSchema.map((field) => field.key));
    for (const field of stateFieldsToMerge) {
      if (existingKeys.has(field.key)) continue;
      upsertCanonicalStateField(field);
      existingKeys.add(field.key);
    }
  }

  async function addInputNodeFromFile(file: File, position: { x: number; y: number }) {
    const envelope = await fileToEnvelope(file);
    const typeLabel = formatValueTypeLabel(envelope.detectedType);
    const inputConfig = {
      ...deepClonePreset(TEXT_INPUT_PRESET),
      name: `${typeLabel} Input`,
      description: `Uploaded ${typeLabel.toLowerCase()} asset from ${file.name}.`,
      valueType: envelope.detectedType,
      output: {
        ...deepClonePreset(TEXT_INPUT_PRESET).output,
        key: envelope.detectedType,
        label: typeLabel,
        valueType: envelope.detectedType,
      },
      value: JSON.stringify(envelope),
    } satisfies InputBoundaryNode;

    const nextNode = createNodeFromConfig(inputConfig, position);
    setNodes((current) => current.concat(nextNode));
    setSelectedNodeId(nextNode.id);
    setStatusMessage(`Added ${getNodeDisplayName(inputConfig)} from ${file.name}`);
  }

  function addGenericBoundaryNode(
    nodeKind: "input" | "output",
    position: { x: number; y: number },
    connectionSource?: { sourceNodeId?: string; sourceHandle?: string; sourceValueType?: ValueType | null },
  ) {
    const config =
      nodeKind === "input"
        ? createGenericInputNodeConfig()
        : createGenericOutputNodeConfig(connectionSource?.sourceValueType ?? null);
    const nextNode = createNodeFromConfig(config, position);
    setNodes((current) => current.concat(nextNode));
    setSelectedNodeId(nextNode.id);

    if (nodeKind === "output" && connectionSource?.sourceNodeId && connectionSource.sourceHandle && connectionSource.sourceValueType) {
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

    setStatusMessage(`Added ${getNodeDisplayName(config)}`);
    setCreationMenu(null);
  }

  function addNodeFromPresetId(presetId: string, position: { x: number; y: number }, connectionSource?: { sourceNodeId?: string; sourceHandle?: string; sourceValueType?: ValueType | null }) {
    const staticPreset = getNodePresetById(presetId);
    const persistedPreset = persistedPresets.find((item) => item.presetId === presetId);
    const preset = staticPreset ?? persistedPreset?.definition;
    if (!preset) return;

    if (persistedPreset) {
      ensurePresetStateFields(persistedPreset.stateSchema);
    }

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
    setStatusMessage(`Added ${getNodeDisplayName(preset, preset.presetId)}`);

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

  function addNodeFromCreationEntry(
    entry: CreationMenuEntry,
    position: { x: number; y: number },
    connectionSource?: { sourceNodeId?: string; sourceHandle?: string; sourceValueType?: ValueType | null },
  ) {
    if (entry.mode === "node" && entry.nodeKind) {
      addGenericBoundaryNode(entry.nodeKind, position, connectionSource);
      return;
    }
    if (entry.mode === "preset" && entry.presetId) {
      addNodeFromPresetId(entry.presetId, position, connectionSource);
    }
  }

  async function saveNodeAsPreset(nodeId: string) {
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode) return;
    if (!isPresetEligibleFamily(targetNode.data.config.family)) {
      setStatusMessage("Only agent and condition nodes can be saved as presets.");
      return;
    }
    const displayName = getNodeDisplayName(targetNode.data.config, targetNode.id);
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom";
    const presetId = `preset.local.${slug}.${crypto.randomUUID().slice(0, 6)}`;
    const canonicalNode = canonicalGraphForSubmission.nodes[nodeId];
    if (!canonicalNode) {
      setStatusMessage("Failed to resolve canonical node for preset save.");
      return;
    }
    const referencedStateKeys = Array.from(new Set([...canonicalNode.reads.map((binding) => binding.state), ...canonicalNode.writes.map((binding) => binding.state)]));
    const presetStateSchema = Object.fromEntries(
      referencedStateKeys
        .map((stateKey) => {
          const definition = canonicalGraphForSubmission.state_schema[stateKey];
          if (!definition) return null;
          return [stateKey, definition] as const;
        })
        .filter((entry): entry is readonly [string, (typeof canonicalGraphForSubmission.state_schema)[string]] => Boolean(entry)),
    );
    const editorPresetRecord = buildEditorPresetRecordFromCanonicalPreset({
      presetId,
      sourcePresetId: targetNode.data.config.presetId,
      definition: {
        label: displayName,
        description: canonicalNode.description ?? "",
        state_schema: presetStateSchema,
        node: {
          ...canonicalNode,
          name: displayName,
          ui: {
            ...canonicalNode.ui,
            position: { x: 0, y: 0 },
          },
        },
      },
    });
    try {
      await apiPost<{ presetId: string; updatedAt?: string | null }>("/api/presets", {
        presetId,
        sourcePresetId: targetNode.data.config.presetId,
        definition: {
          label: displayName,
          description: canonicalNode.description ?? "",
          state_schema: presetStateSchema,
          node: {
            ...canonicalNode,
            name: displayName,
            ui: {
              ...canonicalNode.ui,
              position: { x: 0, y: 0 },
            },
          },
        },
      });
      setPersistedPresets((current) => [editorPresetRecord, ...current.filter((item) => item.presetId !== presetId)]);
      setStatusMessage(`Saved preset ${presetId}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save preset.");
    }
  }

  function buildPayload(): CanonicalGraph {
    return canonicalGraphForSubmission;
  }

  async function handleSave() {
    try {
      const response = await apiPost<{ graph_id: string; validation: { valid: boolean; issues: Array<{ message: string }> } }>("/api/graphs/save", buildPayload());
      setCanonicalGraphState((current) => ({
        ...current,
        graph_id: response.graph_id,
      }));
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
      const queuedStatusMap = Object.fromEntries(canonicalNodeKeys.map((nodeKey) => [nodeKey, "idle"])) as Record<string, RunNodeStatus>;
      setRunNodeStatusMap(queuedStatusMap);
      setActiveRunStatus(response.status as RunStatus);
      setCurrentRunNodeId(null);
      setActiveRunId(response.run_id);
      setStatusMessage(`Run ${response.run_id} queued. Pending ${nodes.length} nodes.`);
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          data: {
            ...node.data,
            previewText: node.data.config.family === "input" ? node.data.previewText : "",
            resolvedDisplayMode: node.data.config.family === "output" ? undefined : node.data.resolvedDisplayMode,
          },
        })),
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to run graph.");
    }
  }

  const focusNode = useCallback(
    (nodeId: string) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) return;

      const width =
        targetNode.data.expandedSize?.width
        ?? targetNode.data.collapsedSize?.width
        ?? (typeof targetNode.style?.width === "number" ? targetNode.style.width : undefined)
        ?? getDefaultNodeWidth(targetNode.data.config);
      const height =
        targetNode.data.expandedSize?.height
        ?? targetNode.data.collapsedSize?.height
        ?? (typeof targetNode.style?.height === "number" ? targetNode.style.height : undefined)
        ?? getNodeMinHeight(targetNode.data.config);

      setSelectedNodeId(nodeId);
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: node.id === nodeId,
        })),
      );
      reactFlow.setCenter(targetNode.position.x + width / 2, targetNode.position.y + height / 2, {
        zoom: Math.max(reactFlow.getZoom(), 0.95),
        duration: 260,
      });
    },
    [nodes, reactFlow, setNodes],
  );

  const syncCanonicalNodeFromLegacyConfig = useCallback(
    (nodeId: string, nextConfig: NodePresetDefinition, nodeSnapshot?: FlowNode) => {
      const sourceNode = nodeSnapshot ?? nodes.find((node) => node.id === nodeId);
      if (!sourceNode) return;
      const canonicalNode = buildCanonicalNodeFromFlowNode(
        {
          ...sourceNode,
          data: {
            ...sourceNode.data,
            config: nextConfig,
          },
        },
        nextConfig,
      );
      setCanonicalGraphState((current) => ({
        ...current,
        nodes: {
          ...current.nodes,
          [nodeId]: canonicalNode,
        },
      }));
    },
    [nodes],
  );

  const upsertCanonicalStateField = useCallback((field: StateField) => {
    const normalizedKey = field.key.trim();
    if (!normalizedKey) return;
    setCanonicalGraphState((current) => ({
      ...current,
      state_schema: {
        ...current.state_schema,
        [normalizedKey]: {
          name: field.name.trim() || normalizedKey,
          description: field.description,
          type: stateFieldTypeToCanonicalStateType(field.type),
          value: field.value,
          color: field.ui?.color ?? "",
        },
      },
    }));
  }, []);

  const updateStateField = useCallback(
    (stateKey: string, updater: (current: StateField) => StateField) => {
      const currentField = stateSchema.find((field) => field.key === stateKey);
      if (!currentField) return;
      upsertCanonicalStateField(updater(currentField));
    },
    [stateSchema, upsertCanonicalStateField],
  );

  const renameStateField = useCallback(
    (currentKey: string, nextKey: string) => {
      const normalizedKey = nextKey.trim();
      if (!normalizedKey) {
        setStatusMessage("State key cannot be empty.");
        return false;
      }
      if (stateSchema.some((field) => field.key === normalizedKey && field.key !== currentKey)) {
        setStatusMessage(`State key '${normalizedKey}' already exists.`);
        return false;
      }

      setCanonicalGraphState((current) => {
        const { [currentKey]: currentDefinition, ...restStateSchema } = current.state_schema;
        if (!currentDefinition) return current;
        return {
          ...current,
          state_schema: {
            ...restStateSchema,
            [normalizedKey]: {
              ...currentDefinition,
              name: currentDefinition.name || normalizedKey,
            },
          },
        };
      });
      const readNodeIds = new Set(
        nodes.filter((node) => (node.data.config.stateReads ?? []).some((binding) => binding.stateKey === currentKey)).map((node) => node.id),
      );
      const writeNodeIds = new Set(
        nodes.filter((node) => (node.data.config.stateWrites ?? []).some((binding) => binding.stateKey === currentKey)).map((node) => node.id),
      );
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          data: {
            ...node.data,
            config: renameStateKeyInNodeConfig(node.data.config, currentKey, normalizedKey),
          },
        })),
      );
      setEdges((current) =>
        current.map((edge) => ({
          ...edge,
          sourceHandle:
            edge.sourceHandle && writeNodeIds.has(edge.source) && getPortKeyFromHandle(edge.sourceHandle) === currentKey
              ? buildHandleId("output", normalizedKey)
              : edge.sourceHandle,
          targetHandle:
            edge.targetHandle && readNodeIds.has(edge.target) && getPortKeyFromHandle(edge.targetHandle) === currentKey
              ? buildHandleId("input", normalizedKey)
              : edge.targetHandle,
        })),
      );
      setStatusMessage(`Renamed state ${currentKey} -> ${normalizedKey}`);
      return true;
    },
    [nodes, setEdges, setNodes, stateSchema],
  );

  const renameStateName = useCallback((stateKey: string, nextName: string) => {
    const normalizedName = nextName.trim();
    setCanonicalGraphState((current) => {
      const currentDefinition = current.state_schema[stateKey];
      if (!currentDefinition) return current;
      return {
        ...current,
        state_schema: {
          ...current.state_schema,
          [stateKey]: {
            ...currentDefinition,
            name: normalizedName || stateKey,
          },
        },
      };
    });
    setStatusMessage(`Updated state ${stateKey} name.`);
  }, []);

  const bindStateFieldToPort = useCallback(
    (nodeId: string, side: "input" | "output", field: StateField) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return false;
      }

      const displayName = getNodeDisplayName(targetNode.data.config, targetNode.id);
      const port: PortDefinition = {
        key: field.key,
        label: getStateDisplayName(field),
        valueType: stateFieldTypeToValueType(field.type),
        ...(side === "input" ? { required: targetNode.data.config.family === "output" } : {}),
      };

      if (side === "input") {
        if (targetNode.data.config.family === "agent") {
          const config = targetNode.data.config as AgentNode;
          if (config.inputs.some((input) => input.key === field.key) || (config.stateReads ?? []).some((binding) => binding.inputKey === field.key)) {
            setStatusMessage(`Node '${displayName}' already has input '${field.key}'.`);
            return false;
          }
          const nextConfig = normalizeNodeConfig({
            ...config,
            inputs: [...config.inputs, port],
            stateReads: [...(config.stateReads ?? []), { stateKey: field.key, inputKey: field.key, required: false }],
          } satisfies AgentNode);
          setNodes((current) =>
            current.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      config: nextConfig,
                    },
                  }
                : node,
            ),
          );
          syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
          setStatusMessage(`Bound state ${field.key} to ${displayName}.${field.key}`);
          return true;
        }

        if (targetNode.data.config.family === "condition") {
          const config = targetNode.data.config as ConditionNode;
          if (config.inputs.some((input) => input.key === field.key) || (config.stateReads ?? []).some((binding) => binding.inputKey === field.key)) {
            setStatusMessage(`Node '${displayName}' already has input '${field.key}'.`);
            return false;
          }
          const nextConfig = normalizeNodeConfig({
            ...config,
            inputs: [...config.inputs, port],
            stateReads: [...(config.stateReads ?? []), { stateKey: field.key, inputKey: field.key, required: false }],
          } satisfies ConditionNode);
          setNodes((current) =>
            current.map((node) =>
              node.id === nodeId
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    config: nextConfig,
                  },
                }
              : node,
            ),
          );
          syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
          setStatusMessage(`Bound state ${field.key} to ${displayName}.${field.key}`);
          return true;
        }

        if (targetNode.data.config.family === "output") {
          const config = targetNode.data.config as OutputBoundaryNode;
          const nextConfig = normalizeNodeConfig({
            ...config,
            input: {
              ...port,
              required: true,
            },
            stateReads: [{ stateKey: field.key, inputKey: field.key, required: true }],
          } satisfies OutputBoundaryNode);
          setNodes((current) =>
            current.map((node) =>
              node.id === nodeId
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    config: nextConfig,
                  },
                }
              : node,
            ),
          );
          syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
          setStatusMessage(`Bound state ${field.key} to ${displayName}.${field.key}`);
          return true;
        }

        return false;
      }

      if (targetNode.data.config.family === "agent") {
        const config = targetNode.data.config as AgentNode;
        if (config.outputs.some((output) => output.key === field.key) || (config.stateWrites ?? []).some((binding) => binding.outputKey === field.key)) {
          setStatusMessage(`Node '${displayName}' already has output '${field.key}'.`);
          return false;
        }
        const nextConfig = normalizeNodeConfig({
          ...config,
          outputs: [...config.outputs, port],
          stateWrites: [...(config.stateWrites ?? []), { stateKey: field.key, outputKey: field.key, mode: "replace" }],
        } satisfies AgentNode);
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    config: nextConfig,
                  },
                }
              : node,
          ),
        );
        syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
        setStatusMessage(`Bound ${displayName}.${field.key} to state ${field.key}`);
        return true;
      }

      if (targetNode.data.config.family === "input") {
        const config = targetNode.data.config as InputBoundaryNode;
        const nextConfig = normalizeNodeConfig({
          ...config,
          output: port,
          stateWrites: [{ stateKey: field.key, outputKey: field.key, mode: "replace" }],
        } satisfies InputBoundaryNode);
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    config: nextConfig,
                  },
                }
              : node,
          ),
        );
        syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
        setStatusMessage(`Bound ${displayName}.${field.key} to state ${field.key}`);
        return true;
      }

      return false;
    },
    [nodes, setNodes, syncCanonicalNodeFromLegacyConfig],
  );

  const createStateAndBindToPort = useCallback(
    (nodeId: string, side: "input" | "output", field: StateField) => {
      const normalizedKey = field.key.trim();
      if (!normalizedKey) {
        setStatusMessage("State key cannot be empty.");
        return false;
      }
      if (stateSchema.some((item) => item.key === normalizedKey)) {
        setStatusMessage(`State key '${normalizedKey}' already exists.`);
        return false;
      }
      const nextField: StateField = {
        ...field,
        key: normalizedKey,
        name: field.name.trim() || normalizedKey,
      };
      upsertCanonicalStateField(nextField);
      return bindStateFieldToPort(nodeId, side, nextField);
    },
    [bindStateFieldToPort, stateSchema, upsertCanonicalStateField],
  );

  const addStateField = useCallback(() => {
    const nextField = createDefaultStateField(stateSchema.map((field) => field.key));
    upsertCanonicalStateField(nextField);
    setStatusMessage(`Added state ${nextField.key}`);
    setIsStatePanelOpen(true);
  }, [stateSchema, upsertCanonicalStateField]);

  const deleteStateField = useCallback(
    (stateKey: string) => {
      setCanonicalGraphState((current) => {
        const { [stateKey]: _, ...restStateSchema } = current.state_schema;
        const nextNodes = Object.fromEntries(
          Object.entries(current.nodes).map(([nodeId, node]) => [
            nodeId,
            {
              ...node,
              reads: node.reads.filter((binding) => binding.state !== stateKey),
              writes: node.writes.filter((binding) => binding.state !== stateKey),
            },
          ]),
        );
        return {
          ...current,
          state_schema: restStateSchema,
          nodes: nextNodes,
        };
      });
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          data: {
            ...node.data,
            config: withNodeStateBindings(
              node.data.config,
              (node.data.config.stateReads ?? []).filter((binding) => binding.stateKey !== stateKey),
              (node.data.config.stateWrites ?? []).filter((binding) => binding.stateKey !== stateKey),
            ),
          },
        })),
      );
      setStatusMessage(`Deleted state ${stateKey}`);
    },
    [setNodes],
  );

  const addStateReadBinding = useCallback(
    (stateKey: string, nodeId: string, inputKey: string) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) return false;
      const inputHandleId = buildHandleId("input", inputKey);
      const hasIncomingEdge = edges.some((edge) => edge.target === nodeId && edge.targetHandle === inputHandleId);
      if (hasIncomingEdge) {
        setStatusMessage(`Node '${getNodeDisplayName(targetNode.data.config, targetNode.id)}' input '${inputKey}' is already connected by an edge.`);
        return false;
      }
      const existingBinding = (targetNode.data.config.stateReads ?? []).find((binding) => binding.inputKey === inputKey);
      if (existingBinding) {
        setStatusMessage(`Node '${getNodeDisplayName(targetNode.data.config, targetNode.id)}' input '${inputKey}' already reads state '${existingBinding.stateKey}'.`);
        return false;
      }
      const nextConfig = withNodeStateBindings(
        targetNode.data.config,
        [...(targetNode.data.config.stateReads ?? []), { stateKey, inputKey, required: false }],
        targetNode.data.config.stateWrites ?? [],
      );

      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: nextConfig,
                },
              }
            : node,
        ),
      );
      syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
      setStatusMessage(`Bound state ${stateKey} to ${getNodeDisplayName(targetNode.data.config, targetNode.id)}.${inputKey}`);
      return true;
    },
    [edges, nodes, setNodes, syncCanonicalNodeFromLegacyConfig],
  );

  const removeStateReadBinding = useCallback(
    (stateKey: string, nodeId: string, inputKey: string) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) return;
      const nextConfig = withNodeStateBindings(
        targetNode.data.config,
        (targetNode.data.config.stateReads ?? []).filter(
          (binding) => !(binding.stateKey === stateKey && binding.inputKey === inputKey),
        ),
        targetNode.data.config.stateWrites ?? [],
      );
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: nextConfig,
                },
              }
            : node,
        ),
      );
      syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
      setStatusMessage(`Removed reader ${nodeLabelLookup.get(nodeId) ?? nodeId}.${inputKey} from state ${stateKey}`);
    },
    [nodeLabelLookup, nodes, setNodes, syncCanonicalNodeFromLegacyConfig],
  );

  const addStateWriteBinding = useCallback(
    (stateKey: string, nodeId: string, outputKey: string) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) return false;
      const existingBinding = (targetNode.data.config.stateWrites ?? []).find((binding) => binding.outputKey === outputKey);
      if (existingBinding) {
        setStatusMessage(`Node '${getNodeDisplayName(targetNode.data.config, targetNode.id)}' output '${outputKey}' already writes state '${existingBinding.stateKey}'.`);
        return false;
      }
      const nextConfig = withNodeStateBindings(
        targetNode.data.config,
        targetNode.data.config.stateReads ?? [],
        [...(targetNode.data.config.stateWrites ?? []), { stateKey, outputKey, mode: "replace" }],
      );

      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: nextConfig,
                },
              }
            : node,
        ),
      );
      syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
      setStatusMessage(`Bound ${getNodeDisplayName(targetNode.data.config, targetNode.id)}.${outputKey} to state ${stateKey}`);
      return true;
    },
    [nodes, setNodes, syncCanonicalNodeFromLegacyConfig],
  );

  const removeStateWriteBinding = useCallback(
    (stateKey: string, nodeId: string, outputKey: string) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) return;
      const nextConfig = withNodeStateBindings(
        targetNode.data.config,
        targetNode.data.config.stateReads ?? [],
        (targetNode.data.config.stateWrites ?? []).filter(
          (binding) => !(binding.stateKey === stateKey && binding.outputKey === outputKey),
        ),
      );
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: nextConfig,
                },
              }
            : node,
        ),
      );
      syncCanonicalNodeFromLegacyConfig(nodeId, nextConfig, targetNode);
      setStatusMessage(`Removed writer ${nodeLabelLookup.get(nodeId) ?? nodeId}.${outputKey} from state ${stateKey}`);
    },
    [nodeLabelLookup, nodes, setNodes, syncCanonicalNodeFromLegacyConfig],
  );

  return (
    <div className="grid h-screen grid-rows-[56px_minmax(0,1fr)_36px] bg-[radial-gradient(circle_at_top,rgba(154,52,18,0.1),transparent_22%),linear-gradient(180deg,#f5efe2_0%,#ede4d2_100%)]">
      <header className="grid grid-cols-[minmax(220px,320px)_1fr_auto] items-center gap-3 border-b border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.82)] px-4 backdrop-blur-xl">
        <Input
          className="h-10"
          value={graphName}
          onChange={(event) =>
            setCanonicalGraphState((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          placeholder="Graph name"
        />
        <div className="text-sm text-[var(--muted)]">Double click canvas to create nodes. Drop files on empty canvas to create input nodes. Drag from an output handle into empty space for type-aware suggestions.</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
              isStatePanelOpen
                ? "border-[var(--accent)] bg-[rgba(255,244,240,0.94)] text-[var(--accent-strong)]"
                : "border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] text-[var(--text)] hover:bg-white",
            )}
            onClick={() => setIsStatePanelOpen((current) => !current)}
          >
            <span>State</span>
            <span className="rounded-full border border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.92)] px-2 py-0.5 text-[0.68rem] text-[var(--muted)]">
              {canonicalStateCount}
            </span>
          </button>
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

      <div
        className="grid min-w-0 min-h-0 h-full transition-[grid-template-columns] duration-300"
        style={{
          gridTemplateColumns: isStatePanelOpen ? "minmax(0,1fr) 380px" : "minmax(0,1fr) 56px",
        }}
      >
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
                  displayName: canonicalGraph.nodes[node.id]?.name?.trim() || getNodeDisplayName(node.data.config, node.id),
                  displayDescription: canonicalGraph.nodes[node.id]?.description ?? node.data.config.description,
                  previewText:
                    node.data.config.family === "output" && suppressOutputPreviewFallback
                      ? node.data.previewText
                      : node.data.previewText || previewTextByNode[node.id] || "",
                  executionStatus: runNodeStatusMap[node.id],
                  isCurrentRunNode: currentRunNodeId === node.id,
                  isExpanded: node.data.isExpanded,
                  collapsedSize: node.data.collapsedSize ?? null,
                  expandedSize: node.data.expandedSize ?? null,
                  onConfigChange: (updater: (config: NodePresetDefinition) => NodePresetDefinition) => {
                    const targetNode = nodes.find((candidate) => candidate.id === node.id);
                    if (targetNode) {
                      const nextConfig = normalizeNodeConfig(updater(targetNode.data.config));
                      syncCanonicalNodeFromLegacyConfig(node.id, nextConfig, targetNode);
                    }
                    setNodes((current) =>
                      current.map((candidate) =>
                        candidate.id === node.id
                          ? {
                              ...candidate,
                              data: {
                                ...candidate.data,
                                config: normalizeNodeConfig(updater(candidate.data.config)),
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
                          ? (() => {
                              const currentExpanded = Boolean(candidate.data.isExpanded);
                              const nextExpanded = candidate.data.config.family === "input" ? true : !currentExpanded;
                              const currentWidth =
                                typeof candidate.style?.width === "number"
                                  ? candidate.style.width
                                  : candidate.data.expandedSize?.width
                                    ?? candidate.data.collapsedSize?.width
                                    ?? getDefaultNodeWidth(candidate.data.config);
                              const currentHeight =
                                typeof candidate.style?.height === "number" ? candidate.style.height : undefined;
                              const preservedCollapsedSize =
                                currentExpanded || candidate.data.config.family === "input"
                                  ? candidate.data.collapsedSize ?? null
                                  : candidate.data.collapsedSize ?? {
                                      width: currentWidth,
                                      ...(typeof currentHeight === "number" ? { height: currentHeight } : {}),
                                    };
                              const preservedExpandedSize =
                                currentExpanded
                                  ? candidate.data.expandedSize ?? {
                                      width: currentWidth,
                                      ...(typeof currentHeight === "number" ? { height: currentHeight } : {}),
                                    }
                                  : candidate.data.expandedSize ?? null;
                              const targetSize = nextExpanded
                                ? preservedExpandedSize ?? {
                                    width: currentWidth,
                                    height: getInitialExpandedHeight(candidate.data.config),
                                  }
                                : preservedCollapsedSize;

                              return {
                                ...candidate,
                                style: buildNodeStyleFromState(
                                  candidate.data.config,
                                  nextExpanded,
                                  targetSize,
                                  currentWidth,
                                  typeof currentHeight === "number" && !nextExpanded ? currentHeight : undefined,
                                ),
                                data: {
                                  ...candidate.data,
                                  isExpanded: nextExpanded,
                                  collapsedSize: preservedCollapsedSize,
                                  expandedSize: preservedExpandedSize ?? (nextExpanded ? targetSize : null),
                                },
                              };
                            })()
                          : candidate,
                      ),
                    );
                  },
                  onResizeEnd: (width: number, height: number, isExpanded: boolean) => {
                    setNodes((current) =>
                      current.map((n) =>
                        n.id === node.id
                          ? {
                              ...n,
                              style: buildNodeStyleFromState(n.data.config, isExpanded, { width, height }, width, height),
                              data: {
                                ...n.data,
                                collapsedSize: isExpanded ? n.data.collapsedSize ?? null : { width, height },
                                expandedSize: isExpanded ? { width, height } : n.data.expandedSize ?? null,
                              },
                            }
                          : n,
                      ),
                    );
                  },
                  onDelete: () => {
                    setCanonicalGraphState((current) => {
                      const { [node.id]: _, ...restNodes } = current.nodes;
                      return {
                        ...current,
                        nodes: restNodes,
                        edges: current.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id),
                        conditional_edges: current.conditional_edges
                          .filter((edge) => edge.source !== node.id)
                          .map((edge) => ({
                            ...edge,
                            branches: Object.fromEntries(
                              Object.entries(edge.branches).filter(([, target]) => target !== node.id),
                            ),
                          })),
                      };
                    });
                    setNodes((current) => current.filter((candidate) => candidate.id !== node.id));
                    setEdges((current) => current.filter((edge) => edge.source !== node.id && edge.target !== node.id));
                    setSelectedNodeId((current) => (current === node.id ? null : current));
                  },
                  onSavePreset: () => saveNodeAsPreset(node.id),
                  connectingSourceType,
                  skillDefinitions,
                  skillDefinitionsLoading,
                  skillDefinitionsError,
                  globalTextModelRef: agentRuntimeDefaults.globalTextModelRef,
                  globalThinkingEnabled: agentRuntimeDefaults.globalThinkingEnabled,
                  defaultAgentTemperature: agentRuntimeDefaults.defaultAgentTemperature,
                  availableModelRefs,
                  modelDisplayLookup,
                  knowledgeBases,
                  stateFields: stateSchema,
                  stateFieldLookup,
                  onRenameStateName: renameStateName,
                  onBindStateToPort: (side: "input" | "output", stateKey: string) => {
                    const field = getStateFieldByKey(stateSchema, stateKey);
                    if (!field) {
                      setStatusMessage(`State '${stateKey}' not found.`);
                      return false;
                    }
                    const bound = bindStateFieldToPort(node.id, side, field);
                    if (bound) {
                      requestAnimationFrame(() => updateNodeInternals(node.id));
                    }
                    return bound;
                  },
                  onCreateStateAndBindToPort: (side: "input" | "output", field: StateField) => {
                    const created = createStateAndBindToPort(node.id, side, field);
                    if (created) {
                      requestAnimationFrame(() => updateNodeInternals(node.id));
                    }
                    return created;
                  },
                  onOpenStatePanel: () => setIsStatePanelOpen(true),
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
                    const sourcePortKey = getPortKeyFromHandle(connection.sourceHandle) || `${sourceType}_input`;
                    const existingState = getStateFieldByKey(stateSchema, sourcePortKey);
                    const nextField =
                      existingState ??
                      {
                        ...createDraftStateFromQuery(sourcePortKey, stateSchema.map((field) => field.key)),
                        name: sourcePortKey,
                        type: valueTypeToStateFieldType(sourceType),
                        value: defaultStateValueForType(valueTypeToStateFieldType(sourceType)),
                      };
                    if (!existingState) {
                      upsertCanonicalStateField(nextField);
                    }
                    if (!bindStateFieldToPort(targetNode.id, "input", nextField)) {
                      setConnectingSourceType(null);
                      return;
                    }
                    nextTargetHandle = buildHandleId("input", nextField.key);
                    targetType = stateFieldTypeToValueType(nextField.type);
                    requestAnimationFrame(() => updateNodeInternals(targetNode.id));
                  } else if (targetNode.data.config.family === "condition") {
                    const sourcePortKey = getPortKeyFromHandle(connection.sourceHandle) || `${sourceType}_input`;
                    const existingState = getStateFieldByKey(stateSchema, sourcePortKey);
                    const nextField =
                      existingState ??
                      {
                        ...createDraftStateFromQuery(sourcePortKey, stateSchema.map((field) => field.key)),
                        name: sourcePortKey,
                        type: valueTypeToStateFieldType(sourceType),
                        value: defaultStateValueForType(valueTypeToStateFieldType(sourceType)),
                      };
                    if (!existingState) {
                      upsertCanonicalStateField(nextField);
                    }
                    if (!bindStateFieldToPort(targetNode.id, "input", nextField)) {
                      setConnectingSourceType(null);
                      return;
                    }
                    nextTargetHandle = buildHandleId("input", nextField.key);
                    targetType = stateFieldTypeToValueType(nextField.type);
                    requestAnimationFrame(() => updateNodeInternals(targetNode.id));
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
                setStatusMessage(`Connected ${getNodeDisplayName(sourceNode.data.config, sourceNode.id)} -> ${getNodeDisplayName(targetNode.data.config, targetNode.id)}`);
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
              className="absolute z-[1500] w-[320px] rounded-[20px] border border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.98)] p-3 shadow-[0_24px_48px_rgba(60,41,20,0.18)]"
              style={{
                left: Math.max(12, creationMenu.clientX - (wrapperRef.current?.getBoundingClientRect().left ?? 0) - 20),
                top: Math.max(12, creationMenu.clientY - (wrapperRef.current?.getBoundingClientRect().top ?? 0) - 20),
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Create Node</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {creationMenu.sourceValueType
                      ? `Choose a node for ${formatValueTypeLabel(creationMenu.sourceValueType)} output`
                      : "Choose a node to create"}
                  </div>
                </div>
                <button type="button" className="text-sm text-[var(--muted)]" onClick={() => setCreationMenu(null)}>
                  Close
                </button>
              </div>
              <Input className="mt-3 h-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search nodes and presets" />
              <div className="mt-3 grid gap-2">
                {nodePalette.map((entry) => (
                  <button
                    key={`menu-${entry.id}`}
                    type="button"
                    className="rounded-[16px] border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.82)] px-3 py-2 text-left transition-colors hover:bg-[rgba(255,248,240,0.92)]"
                    onClick={() =>
                      addNodeFromCreationEntry(
                        entry,
                        { x: creationMenu.flowX, y: creationMenu.flowY },
                        {
                          sourceNodeId: creationMenu.sourceNodeId,
                          sourceHandle: creationMenu.sourceHandle,
                          sourceValueType: creationMenu.sourceValueType,
                        },
                      )
                    }
                  >
                    <div className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{entry.family}</div>
                    <div className="mt-0.5 text-sm font-semibold text-[var(--text)]">{entry.label}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{entry.description}</div>
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
            {activeRunStatus ? (
              <span className="ml-2 inline-flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[rgba(154,52,18,0.12)] bg-[rgba(255,255,255,0.72)] px-2 py-0.5 uppercase tracking-[0.12em] text-[var(--accent-strong)]">
                  {activeRunStatus}
                </span>
                <span>OK {runNodeSummary.success}</span>
                <span>Running {runNodeSummary.running}</span>
                <span>Pending {runNodeSummary.idle}</span>
                <span>Failed {runNodeSummary.failed}</span>
                {currentRunNodeId ? <span>Current {nodeLabelLookup.get(currentRunNodeId) ?? currentRunNodeId}</span> : null}
              </span>
            ) : null}
            {activeRunId ? (
              <span className="pointer-events-auto ml-2">
                Latest run:{" "}
                <a className="text-[var(--accent-strong)] underline" href={`/runs/${activeRunId}`}>
                  {activeRunId}
                </a>
              </span>
            ) : null}
          </div>
        </div>

        <StatePanel
          open={isStatePanelOpen}
          stateSchema={stateSchema}
          readersByKey={stateBindingsByKey.readersByKey}
          writersByKey={stateBindingsByKey.writersByKey}
          nodeOptions={stateBindingNodeOptions}
          selectedNodeId={selectedNodeId}
          onToggle={() => setIsStatePanelOpen((current) => !current)}
          onAddState={addStateField}
          onRenameState={renameStateField}
          onUpdateState={updateStateField}
          onDeleteState={deleteStateField}
          onAddReader={addStateReadBinding}
          onRemoveReader={removeStateReadBinding}
          onAddWriter={addStateWriteBinding}
          onRemoveWriter={removeStateWriteBinding}
          onFocusNode={focusNode}
        />
      </div>

      <footer className="flex items-center justify-between border-t border-[rgba(154,52,18,0.16)] bg-[rgba(255,250,241,0.82)] px-4 text-sm text-[var(--muted)]">
        <span>{canonicalNodeKeys.length} nodes / {edges.length} edges</span>
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
