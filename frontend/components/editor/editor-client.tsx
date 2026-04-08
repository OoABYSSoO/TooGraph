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
    },
    draggable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: getNodeStyle(node.type),
  };
}

function graphEdgeToFlowEdge(edge: GraphEdgePayload): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.edge_kind === "branch" ? edge.branch_label ?? "branch" : edge.flow_keys.join(", "),
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
  return (
    <div
      className={cn(
        "rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
        selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
      )}
    >
      <div className="border-b border-[rgba(154,52,18,0.12)] px-4 py-3">
        <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">{data.nodeType}</div>
        <div className="mt-1 text-base font-semibold text-[var(--text)]">{data.label}</div>
      </div>
      <div className="grid gap-2 px-4 py-3 text-[0.82rem] text-[var(--muted)]">
        <div>{data.description}</div>
        <div>Reads: {data.reads.length ? data.reads.join(", ") : "none"}</div>
        <div>Writes: {data.writes.length ? data.writes.join(", ") : "none"}</div>
      </div>
    </div>
  );
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [validationIssues, setValidationIssues] = useState<ApiIssue[]>([]);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const reactFlow = useReactFlow<FlowNode, Edge>();

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  useEffect(() => {
    if (nodes.length > 0) {
      window.requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.2, duration: 250 });
      });
    }
  }, [nodes.length, reactFlow]);

  const nodePalette = useMemo(() => {
    return Object.values(NODE_PRESETS).filter((item) => {
      const query = search.trim().toLowerCase();
      if (!query) {
        return true;
      }
      return [item.label, item.type, item.description].some((value) => value.toLowerCase().includes(query));
    });
  }, [search]);

  function buildPayload(): GraphPayload {
    return {
      graph_id: currentGraphId,
      name: graphName.trim() || "Untitled Graph",
      template_id: initialGraph.template_id,
      theme_config: initialGraph.theme_config,
      state_schema: initialGraph.state_schema,
      metadata: initialGraph.metadata,
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
        <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-r border-[rgba(154,52,18,0.16)] bg-[rgba(255,248,240,0.76)] px-4 py-4">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Node Palette</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Build Hello World</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Click to add nodes, or drag them onto the canvas. Connect them in order: start, hello_model, end.</p>
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
                  data: { flow_keys: [], edge_kind: "normal", branch_label: null },
                };
                setEdges((current) => addEdge(nextEdge, current));
                setStatusMessage("Connected nodes");
              }}
              onSelectionChange={handleSelectionChange}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
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
                className="!bottom-4 !right-4 !h-[168px] !w-[220px] !rounded-[22px] !border !border-[rgba(154,52,18,0.18)] !bg-[rgba(255,250,241,0.95)] !shadow-[0_16px_36px_rgba(60,41,20,0.14)]"
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
                  Drag from the left palette or click a node card to create it in the visible area.
                </div>
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-4 right-4 -translate-y-[188px] rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,250,241,0.95)] px-3 py-1 text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)] shadow-[0_10px_24px_rgba(60,41,20,0.1)]">
            Mini Map
          </div>
        </div>

        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-l border-[rgba(154,52,18,0.16)] bg-[rgba(255,248,240,0.76)] px-4 py-4">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--accent-strong)]">Inspector</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
              {selectedNode ? selectedNode.data.label : selectedEdge ? "Edge" : "Graph"}
            </h2>
          </div>

          <div className="mt-4 min-h-0 space-y-4 overflow-y-auto pr-1">
            {!selectedNode && !selectedEdge ? (
              <div className="grid gap-4">
                <section className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
                  <div className="text-sm font-semibold text-[var(--text)]">Graph Info</div>
                  <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    <div>Template: {initialGraph.template_id}</div>
                    <div>Nodes: {nodes.length}</div>
                    <div>Edges: {edges.length}</div>
                  </div>
                </section>
                <section className="rounded-[20px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,255,255,0.76)] p-4">
                  <div className="text-sm font-semibold text-[var(--text)]">State Schema</div>
                  <div className="mt-3 grid gap-2">
                    {initialGraph.state_schema.map((field) => (
                      <div key={field.key} className="rounded-2xl border border-[rgba(154,52,18,0.1)] bg-[rgba(255,250,241,0.82)] px-3 py-2.5">
                        <div className="text-sm font-semibold text-[var(--text)]">{field.key}</div>
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
                        label: flowKeys.join(", "),
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
