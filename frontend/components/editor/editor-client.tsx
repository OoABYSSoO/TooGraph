"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE_URL, apiPost, type ApiIssue } from "@/lib/api";
import { cn } from "@/lib/cn";

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
  role: string;
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

type TemplateRecord = {
  template_id: string;
  label: string;
  description: string;
  default_graph_name: string;
  supported_node_types: string[];
  state_schema: StateField[];
  default_graph: Omit<GraphPayload, "graph_id">;
};

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
  initialGraph?: GraphPayload | null;
  graphId?: string;
  templates: TemplateRecord[];
};

type FlowNodeData = {
  label: string;
  nodeType: string;
  description: string;
  reads: string[];
  writes: string[];
  params: Record<string, unknown>;
  stateColors: StateColorMap;
};

type FlowNode = Node<FlowNodeData>;

type NodePreset = {
  type: string;
  label: string;
  description: string;
  reads: string[];
  writes: string[];
  params: Record<string, unknown>;
};

const HELLO_WORLD_TEMPLATE_ID = "hello_world";
const DEFAULT_STATE_COLOR = "#d97706";
const STATE_COLOR_PALETTE = ["#d97706", "#0f766e", "#2563eb", "#b45309", "#be185d", "#6d28d9", "#15803d", "#475569"];
const STATE_TYPE_OPTIONS = ["string", "number", "boolean", "object", "array", "markdown", "json", "file_list"] as const;
const STATE_ROLE_OPTIONS = ["input", "intermediate", "decision", "artifact", "final"] as const;

const NODE_PRESETS: Record<string, NodePreset> = {
  start: {
    type: "start",
    label: "Start",
    description: "Workflow entry point.",
    reads: [],
    writes: [],
    params: {},
  },
  hello_model: {
    type: "hello_model",
    label: "Hello Model",
    description: "Send a name to the local OpenAI-compatible model.",
    reads: ["name"],
    writes: ["name", "greeting", "final_result", "llm_response"],
    params: {
      name: "Abyss",
      temperature: 0.2,
      max_tokens: 40,
    },
  },
  end: {
    type: "end",
    label: "End",
    description: "Workflow exit point.",
    reads: ["greeting", "final_result"],
    writes: [],
    params: {},
  },
};

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

function graphNodeToFlowNode(node: GraphNodePayload): FlowNode {
  const preset = NODE_PRESETS[node.type];
  return {
    id: node.id,
    type: "default",
    position: node.position,
    data: {
      label: node.label,
      nodeType: node.type,
      description: preset?.description ?? `${node.type} node`,
      reads: node.reads,
      writes: node.writes,
      params: node.params ?? {},
      stateColors: {},
    },
    draggable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: getNodeStyle(node.type),
  };
}

function graphEdgeToFlowEdge(edge: GraphEdgePayload): Edge {
  const label = buildEdgeLabel(edge.flow_keys, edge.edge_kind, edge.branch_label ?? null);
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label,
    data: {
      flow_keys: edge.flow_keys,
      edge_kind: edge.edge_kind,
      branch_label: edge.branch_label ?? null,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#9a3412" },
    style: {
      stroke: "#9a3412",
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

function FlowNodeCard({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  const allStateKeys = Object.keys(data.stateColors);
  const reads =
    data.nodeType === "end"
      ? allStateKeys.length
        ? allStateKeys
        : ["none"]
      : data.reads.length
        ? data.reads
        : ["none"];
  const writes =
    data.nodeType === "start"
      ? allStateKeys.length
        ? allStateKeys
        : ["none"]
      : data.writes.length
        ? data.writes
        : ["none"];

  return (
    <div
      className={cn(
        "rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
        selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
      )}
    >
      <div className="grid min-h-[118px] grid-cols-[minmax(0,1fr)_176px_minmax(0,1fr)] items-stretch">
        <div className="border-r border-[rgba(154,52,18,0.08)] px-3 py-3">
          <div className="mb-2 text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Inputs</div>
          <div className="flex flex-col gap-1.5">
            {reads.map((key) => (
              <StateChip
                key={`read-${key}`}
                label={key}
                color={data.stateColors[key] ?? DEFAULT_STATE_COLOR}
                muted={key === "none"}
                side="input"
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
          <div className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{data.nodeType}</div>
          <div className="mt-2 text-base font-semibold text-[var(--text)]">{data.label}</div>
          <div className="mt-2 text-[0.8rem] leading-5 text-[var(--muted)]">{data.description}</div>
        </div>
        <div className="border-l border-[rgba(154,52,18,0.08)] px-3 py-3">
          <div className="mb-2 text-right text-[0.68rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Outputs</div>
          <div className="flex flex-col gap-1.5">
            {writes.map((key) => (
              <StateChip
                key={`write-${key}`}
                label={key}
                color={data.stateColors[key] ?? DEFAULT_STATE_COLOR}
                muted={key === "none"}
                side="output"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StateChip({
  label,
  color,
  muted = false,
  side,
}: {
  label: string;
  color: string;
  muted?: boolean;
  side: "input" | "output";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.7rem] font-medium",
        muted
          ? "border-[rgba(154,52,18,0.1)] bg-[rgba(255,255,255,0.74)] text-[var(--muted)]"
          : "border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.82)] text-[var(--text)]",
        side === "input" ? "justify-start self-start" : "justify-end self-end",
      )}
    >
      {side === "input" ? (
        <>
          <span className={cn("h-2.5 w-2.5 rounded-full border border-[rgba(154,52,18,0.24)] bg-white", muted && "opacity-40")} />
          {!muted ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
          <span>{label}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          {!muted ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
          <span className={cn("h-2.5 w-2.5 rounded-full border border-[rgba(154,52,18,0.24)] bg-white", muted && "opacity-40")} />
        </>
      )}
    </span>
  );
}

function buildEdgeLabel(flowKeys: string[], edgeKind: "normal" | "branch", branchLabel: "pass" | "revise" | "fail" | null) {
  const flowLabel = flowKeys.join(", ");
  if (edgeKind === "branch") {
    return branchLabel ? (flowLabel ? `${branchLabel} · ${flowLabel}` : branchLabel) : flowLabel || "branch";
  }
  return flowLabel || "flow";
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
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialGraph.nodes.map(graphNodeToFlowNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges.map(graphEdgeToFlowEdge));
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
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [validationIssues, setValidationIssues] = useState<ApiIssue[]>([]);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [newStateKey, setNewStateKey] = useState("");
  const [newStateDescription, setNewStateDescription] = useState("");
  const [newStateType, setNewStateType] = useState<(typeof STATE_TYPE_OPTIONS)[number]>("string");
  const [newStateRole, setNewStateRole] = useState<(typeof STATE_ROLE_OPTIONS)[number]>("intermediate");
  const reactFlow = useReactFlow<FlowNode, Edge>();

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
        },
      })),
    );
  }, [stateColors, setNodes]);

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
      return [field.key, field.type, field.role, field.description, field.title].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [stateSchema, stateSearch]);

  function buildPayload(): GraphPayload {
    const metadata = {
      ...initialGraph.metadata,
      state_colors: stateColors,
    };

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
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.data.nodeType,
        label: node.data.label,
        position: node.position,
        reads: node.data.reads,
        writes: node.data.writes,
        params: node.data.params,
        config: node.data.params,
        implementation: {
          executor: "node_handler",
          handler_key: node.data.nodeType,
          tool_keys: node.data.nodeType === "hello_model" ? ["generate_hello_greeting"] : [],
        },
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        flow_keys: ((edge.data?.flow_keys as string[] | undefined) ?? []).filter(Boolean),
        edge_kind: (edge.data?.edge_kind as "normal" | "branch" | undefined) ?? "normal",
        branch_label: (edge.data?.branch_label as "pass" | "revise" | "fail" | null | undefined) ?? null,
      })),
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
          nodeType: preset.type,
          description: preset.description,
          reads: [...preset.reads],
          writes: [...preset.writes],
          params: { ...preset.params },
          stateColors,
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
        role: newStateRole,
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
    setNewStateRole("intermediate");
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
          },
        })),
      );
      setEdges((current) =>
        current.map((edge) => {
          const flowKeys = ((edge.data?.flow_keys as string[] | undefined) ?? []).map((item) =>
            item === stateKey ? trimmedKey : item,
          );
          return {
            ...edge,
            label: buildEdgeLabel(
              flowKeys,
              ((edge.data?.edge_kind as "normal" | "branch" | undefined) ?? "normal"),
              ((edge.data?.branch_label as "pass" | "revise" | "fail" | null | undefined) ?? null),
            ),
            data: {
              ...(edge.data ?? {}),
              flow_keys: flowKeys,
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
              placeholder="Search state key or role"
            />
            <div className="mt-4 grid gap-2 rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.72)] p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_100px_100px] gap-2">
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
                <select
                  className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                  value={newStateRole}
                  onChange={(event) => setNewStateRole(event.target.value as (typeof STATE_ROLE_OPTIONS)[number])}
                >
                  {STATE_ROLE_OPTIONS.map((option) => (
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
                          {field.type} / {field.role}
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
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Create nodes after defining the state shape. Connect start, hello_model and end.</p>
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
              onConnect={(connection: Connection) => {
                const nextEdge: Edge = {
                  ...connection,
                  id: `edge_${crypto.randomUUID().slice(0, 8)}`,
                  markerEnd: { type: MarkerType.ArrowClosed, color: "#9a3412" },
                  style: { stroke: "#9a3412", strokeWidth: 1.8 },
                  label: "flow",
                  data: { flow_keys: [], edge_kind: "normal", branch_label: null },
                };
                setEdges((current) => addEdge(nextEdge, current));
                setStatusMessage("Connected nodes");
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
                          {field.type} / {field.role}
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
                <div className="grid grid-cols-[1fr_1fr] gap-3">
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
                  <label className="grid gap-1.5 text-sm text-[var(--muted)]">
                    <span>Role</span>
                    <select
                      className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3 py-3 text-[var(--text)]"
                      value={selectedState.role}
                      onChange={(event) => updateStateField(selectedState.key, { role: event.target.value })}
                    >
                      {STATE_ROLE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
                      updateEdge(selectedEdge.id, {
                        label: buildEdgeLabel(flowKeys, "normal", null),
                        data: {
                          ...(selectedEdge.data ?? {}),
                          flow_keys: flowKeys,
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
  const graph = initialGraph ?? createEditorDefaults(templates);

  return (
    <ReactFlowProvider>
      <EditorCanvas initialGraph={graph} mode={mode} graphId={graphId} />
    </ReactFlowProvider>
  );
}
