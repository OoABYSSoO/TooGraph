"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";

import { NODE_PRESETS } from "@/lib/editor-presets";
import { createStarterGraphDocument, getTemplateThemePresetById } from "@/lib/templates";
import type {
  EdgeKind,
  GraphCanvasEdge,
  GraphCanvasNode,
  GraphDocument,
  GraphNodeType,
  NodeExecutionSummary,
  RunDetailPayload,
  StateField,
  ThemeConfig,
} from "@/types/editor";

type ValidationIssue = {
  code: string;
  message: string;
};

function recomputeStateBindings(fields: StateField[], nodes: GraphCanvasNode[]): StateField[] {
  return fields.map((field) => ({
    ...field,
    sourceNodes: nodes.filter((node) => node.data.writes.includes(field.key)).map((node) => node.id),
    targetNodes: nodes.filter((node) => node.data.reads.includes(field.key)).map((node) => node.id),
  }));
}

type EditorState = {
  graphId: string;
  graphName: string;
  templateId: string;
  themeConfig: ThemeConfig;
  stateSchema: StateField[];
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  lastSavedAt: string | null;
  validationIssues: ValidationIssue[];
  runtimeLabel: string;
  configDraft: string;
  validationPassed: boolean | null;
  currentRunId: string | null;
  currentRunStatus: string | null;
  currentNodeId: string | null;
  nodeExecutionMap: Record<string, NodeExecutionSummary>;
  initGraph: (graphId: string) => void;
  hydrateGraph: (graph: GraphDocument, sourceLabel: string) => void;
  updateGraphIdentity: (graphId: string, graphName?: string) => void;
  updateGraphName: (graphName: string) => void;
  updateThemeConfig: (patch: Partial<ThemeConfig>) => void;
  applyThemePreset: (themePresetId: string) => void;
  updateStateField: (key: string, patch: Partial<StateField>) => void;
  addStateField: (field?: Partial<StateField>) => void;
  removeStateField: (key: string) => void;
  applyRunDetail: (runDetail: RunDetailPayload) => void;
  setCurrentRunId: (runId: string | null) => void;
  onNodesChange: (changes: NodeChange<GraphCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<GraphCanvasEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: GraphNodeType) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  updateSelectedNodeLabel: (label: string) => void;
  updateSelectedNodeDescription: (description: string) => void;
  toggleSelectedNodeRead: (key: string) => void;
  toggleSelectedNodeWrite: (key: string) => void;
  updateSelectedNodeParam: (paramKey: string, value: unknown) => void;
  replaceSelectedNodeParams: (params: Record<string, unknown>) => void;
  updateSelectedEdgeFlowKeys: (flowKeys: string[]) => void;
  updateSelectedEdgeKind: (edgeKind: EdgeKind) => void;
  updateSelectedEdgeBranchLabel: (branchLabel: "pass" | "revise" | "fail" | "") => void;
  updateSelectedNodeConfigDraft: (draft: string) => void;
  saveGraphLocally: () => void;
  validateGraph: () => void;
  simulateRun: () => void;
};

const toStorageKey = (graphId: string) => `graphiteui:graph:${graphId}`;

function defaultStateField(partial?: Partial<StateField>): StateField {
  return {
    key: partial?.key ?? `field_${crypto.randomUUID().slice(0, 6)}`,
    type: partial?.type ?? "string",
    role: partial?.role ?? "intermediate",
    title: partial?.title ?? "",
    description: partial?.description ?? "",
    example: partial?.example,
    sourceNodes: partial?.sourceNodes ?? [],
    targetNodes: partial?.targetNodes ?? [],
  };
}

function graphForStorage(state: EditorState): GraphDocument {
  return {
    graphId: state.graphId,
    name: state.graphName,
    templateId: state.templateId,
    themeConfig: state.themeConfig,
    stateSchema: state.stateSchema,
    nodes: state.nodes,
    edges: state.edges,
    updatedAt: new Date().toISOString(),
  };
}

function buildDraftFromNode(node: GraphCanvasNode | null): string {
  if (!node) return "";
  return JSON.stringify(node.data, null, 2);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  graphId: "",
  graphName: "Creative Factory",
  templateId: "creative_factory",
  themeConfig: createStarterGraphDocument("template-creative-factory").themeConfig,
  stateSchema: createStarterGraphDocument("template-creative-factory").stateSchema,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  lastSavedAt: null,
  validationIssues: [],
  runtimeLabel: "Idle",
  configDraft: "",
  validationPassed: null,
  currentRunId: null,
  currentRunStatus: null,
  currentNodeId: null,
  nodeExecutionMap: {},

  initGraph: (graphId) => {
    const storage = typeof window !== "undefined" ? window.localStorage.getItem(toStorageKey(graphId)) : null;
    if (storage) {
      const parsed = JSON.parse(storage) as GraphDocument;
      set({
        graphId,
        graphName: parsed.name,
        templateId: parsed.templateId,
        themeConfig: parsed.themeConfig,
        stateSchema: parsed.stateSchema,
        nodes: parsed.nodes,
        edges: parsed.edges,
        selectedNodeId: null,
        selectedEdgeId: null,
        validationIssues: [],
        runtimeLabel: "Loaded from local draft",
        lastSavedAt: parsed.updatedAt,
        configDraft: "",
        validationPassed: null,
        currentRunId: null,
        currentRunStatus: null,
        currentNodeId: null,
        nodeExecutionMap: {},
      });
      return;
    }

    const starterGraph = createStarterGraphDocument(graphId);
    set({
      graphId,
      graphName: starterGraph.name,
      templateId: starterGraph.templateId,
      themeConfig: starterGraph.themeConfig,
      stateSchema: starterGraph.stateSchema,
      nodes: starterGraph.nodes,
      edges: starterGraph.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      validationIssues: [],
      runtimeLabel: "Standard template ready",
      lastSavedAt: starterGraph.updatedAt,
      configDraft: "",
      validationPassed: null,
      currentRunId: null,
      currentRunStatus: null,
      currentNodeId: null,
      nodeExecutionMap: {},
    });
  },

  hydrateGraph: (graph, sourceLabel) => {
    set({
      graphId: graph.graphId,
      graphName: graph.name,
      templateId: graph.templateId,
      themeConfig: graph.themeConfig,
      stateSchema: graph.stateSchema,
      nodes: graph.nodes,
      edges: graph.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      validationIssues: [],
      runtimeLabel: sourceLabel,
      lastSavedAt: graph.updatedAt,
      configDraft: "",
      validationPassed: null,
      currentRunId: null,
      currentRunStatus: null,
      currentNodeId: null,
      nodeExecutionMap: {},
    });
  },

  updateGraphIdentity: (graphId, graphName) => {
    set((state) => ({ graphId, graphName: graphName ?? state.graphName }));
  },

  updateGraphName: (graphName) => set({ graphName }),

  updateThemeConfig: (patch) => {
    set((state) => ({
      themeConfig: { ...state.themeConfig, ...patch },
    }));
  },

  applyThemePreset: (themePresetId) => {
    const { templateId } = get();
    const preset = getTemplateThemePresetById(templateId, themePresetId);
    if (!preset) return;
    set((state) => {
      const overrides = preset.nodeParamOverrides ?? {};
      return {
        graphName: preset.graphName ?? state.graphName,
        themeConfig: preset.themeConfig,
        nodes: state.nodes.map((node) => {
          const nodeOverrides = overrides[node.id];
          return nodeOverrides
            ? {
                ...node,
                data: {
                  ...node.data,
                  params: { ...node.data.params, ...nodeOverrides },
                },
              }
            : node;
        }),
        runtimeLabel: `Applied theme preset ${preset.label}`,
      };
    });
  },

  updateStateField: (key, patch) => {
    set((state) => {
      const nextStateSchema = state.stateSchema.map((field) => (field.key === key ? { ...field, ...patch } : field));
      return {
        stateSchema: recomputeStateBindings(nextStateSchema, state.nodes),
      };
    });
  },

  addStateField: (field) => {
    set((state) => ({
      stateSchema: recomputeStateBindings([...state.stateSchema, defaultStateField(field)], state.nodes),
    }));
  },

  removeStateField: (key) => {
    set((state) => ({
      stateSchema: state.stateSchema.filter((field) => field.key !== key),
      nodes: state.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          reads: node.data.reads.filter((value) => value !== key),
          writes: node.data.writes.filter((value) => value !== key),
        },
      })),
      edges: state.edges.map((edge) => ({
        ...edge,
        data: {
          flowKeys: (edge.data?.flowKeys ?? []).filter((value) => value !== key),
          edgeKind: edge.data?.edgeKind ?? "normal",
          branchLabel: edge.data?.branchLabel,
        },
      })),
    }));
  },

  setCurrentRunId: (runId) => set({ currentRunId: runId }),

  applyRunDetail: (runDetail) => {
    const nodeExecutionMap = Object.fromEntries(
      runDetail.node_executions.map((execution) => [execution.node_id, execution]),
    );
    set((state) => ({
      currentRunId: runDetail.run_id,
      currentRunStatus: runDetail.status,
      currentNodeId: runDetail.current_node_id ?? null,
      nodeExecutionMap,
      runtimeLabel:
        runDetail.status === "completed"
          ? `Run ${runDetail.run_id} completed`
          : `Run ${runDetail.run_id} ${runDetail.status}`,
      nodes: state.nodes.map((node) => {
        const rawStatus = runDetail.node_status_map[node.id];
        const nodeStatus =
          rawStatus === "running" || rawStatus === "success" || rawStatus === "failed" ? rawStatus : "idle";
        return {
          ...node,
          data: {
            ...node.data,
            status: nodeStatus,
          },
        };
      }),
    }));
  },

  onNodesChange: (changes) => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          id: `edge_${connection.source}_${connection.target}_${state.edges.length + 1}`,
          type: "workflow",
          animated: false,
          data: { flowKeys: [], edgeKind: "normal" },
        },
        state.edges,
      ),
    }));
  },

  addNode: (kind) => {
    const preset = NODE_PRESETS.find((item) => item.kind === kind);
    if (!preset) return;
    set((state) => {
      const count = state.nodes.filter((node) => node.data.kind === kind).length + 1;
      const nodeId = `${kind}_${count}`;
      const nextNode: GraphCanvasNode = {
        id: nodeId,
        type: "workflow",
        position: {
          x: 160 + (state.nodes.length % 3) * 240,
          y: 120 + Math.floor(state.nodes.length / 3) * 150,
        },
        data: {
          label: preset.label,
          kind: preset.kind,
          description: preset.description,
          status: "idle",
          reads: preset.defaultReads ?? [],
          writes: preset.defaultWrites ?? [],
          params: preset.defaultParams ?? {},
        },
      };
      return {
        nodes: [...state.nodes, nextNode],
        stateSchema: recomputeStateBindings(state.stateSchema, [...state.nodes, nextNode]),
        selectedNodeId: nodeId,
        selectedEdgeId: null,
        configDraft: buildDraftFromNode(nextNode),
      };
    });
  },

  selectNode: (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId) ?? null;
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      configDraft: buildDraftFromNode(node),
    });
  },

  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null, configDraft: "" }),

  updateSelectedNodeLabel: (label) => {
    set((state) => {
      const nodes = state.nodes.map((node) => (node.id === state.selectedNodeId ? { ...node, data: { ...node.data, label } } : node));
      return {
        nodes,
        stateSchema: recomputeStateBindings(state.stateSchema, nodes),
      };
    });
  },

  updateSelectedNodeDescription: (description) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === state.selectedNodeId ? { ...node, data: { ...node.data, description } } : node,
      );
      return {
        nodes,
        stateSchema: recomputeStateBindings(state.stateSchema, nodes),
      };
    });
  },

  toggleSelectedNodeRead: (key) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === state.selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                reads: node.data.reads.includes(key) ? node.data.reads.filter((value) => value !== key) : [...node.data.reads, key],
              },
            }
          : node,
      );
      return {
        nodes,
        stateSchema: recomputeStateBindings(state.stateSchema, nodes),
      };
    });
  },

  toggleSelectedNodeWrite: (key) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === state.selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                writes: node.data.writes.includes(key)
                  ? node.data.writes.filter((value) => value !== key)
                  : [...node.data.writes, key],
              },
            }
          : node,
      );
      return {
        nodes,
        stateSchema: recomputeStateBindings(state.stateSchema, nodes),
      };
    });
  },

  updateSelectedNodeParam: (paramKey, value) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === state.selectedNodeId
          ? { ...node, data: { ...node.data, params: { ...node.data.params, [paramKey]: value } } }
          : node,
      );
      const updatedNode = nodes.find((node) => node.id === state.selectedNodeId) ?? null;
      return {
        nodes,
        stateSchema: recomputeStateBindings(state.stateSchema, nodes),
        configDraft: buildDraftFromNode(updatedNode),
      };
    });
  },

  replaceSelectedNodeParams: (params) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === state.selectedNodeId ? { ...node, data: { ...node.data, params } } : node,
      );
      const updatedNode = nodes.find((node) => node.id === state.selectedNodeId) ?? null;
      return {
        nodes,
        stateSchema: recomputeStateBindings(state.stateSchema, nodes),
        configDraft: buildDraftFromNode(updatedNode),
      };
    });
  },

  updateSelectedEdgeFlowKeys: (flowKeys) => {
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === state.selectedEdgeId
          ? {
              ...edge,
              label: edge.data?.branchLabel ?? (flowKeys.length ? flowKeys.slice(0, 2).join(", ") : undefined),
              data: {
                flowKeys,
                edgeKind: edge.data?.edgeKind ?? "normal",
                branchLabel: edge.data?.branchLabel,
              },
            }
          : edge,
      ),
    }));
  },

  updateSelectedEdgeKind: (edgeKind) => {
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === state.selectedEdgeId
          ? {
              ...edge,
              label: edgeKind === "branch" ? edge.data?.branchLabel : edge.data?.flowKeys?.slice(0, 2).join(", "),
              data: {
                flowKeys: edge.data?.flowKeys ?? [],
                edgeKind,
                branchLabel: edgeKind === "branch" ? edge.data?.branchLabel : undefined,
              },
            }
          : edge,
      ),
    }));
  },

  updateSelectedEdgeBranchLabel: (branchLabel) => {
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === state.selectedEdgeId
          ? {
              ...edge,
              label: branchLabel || (edge.data?.flowKeys ?? []).slice(0, 2).join(", "),
              data: {
                flowKeys: edge.data?.flowKeys ?? [],
                edgeKind: branchLabel ? "branch" : edge.data?.edgeKind ?? "normal",
                branchLabel: branchLabel || undefined,
              },
            }
          : edge,
      ),
    }));
  },

  updateSelectedNodeConfigDraft: (draft) => {
    set({ configDraft: draft });
    try {
      const parsed = JSON.parse(draft) as GraphCanvasNode["data"];
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === state.selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...parsed,
                  label: typeof parsed.label === "string" ? parsed.label : node.data.label,
                  description: typeof parsed.description === "string" ? parsed.description : node.data.description,
                  reads: Array.isArray(parsed.reads)
                    ? parsed.reads.filter((value): value is string => typeof value === "string")
                    : node.data.reads,
                  writes: Array.isArray(parsed.writes)
                    ? parsed.writes.filter((value): value is string => typeof value === "string")
                    : node.data.writes,
                  params: parsed.params && typeof parsed.params === "object" ? parsed.params : node.data.params,
                },
              }
            : node,
        ),
        stateSchema: recomputeStateBindings(
          state.stateSchema,
          state.nodes.map((node) =>
            node.id === state.selectedNodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    ...parsed,
                    label: typeof parsed.label === "string" ? parsed.label : node.data.label,
                    description: typeof parsed.description === "string" ? parsed.description : node.data.description,
                    reads: Array.isArray(parsed.reads)
                      ? parsed.reads.filter((value): value is string => typeof value === "string")
                      : node.data.reads,
                    writes: Array.isArray(parsed.writes)
                      ? parsed.writes.filter((value): value is string => typeof value === "string")
                      : node.data.writes,
                    params: parsed.params && typeof parsed.params === "object" ? parsed.params : node.data.params,
                  },
                }
              : node,
          ),
        ),
      }));
    } catch {
      // keep draft text while invalid JSON is being edited
    }
  },

  saveGraphLocally: () => {
    const payload = graphForStorage(get());
    if (typeof window !== "undefined") {
      window.localStorage.setItem(toStorageKey(payload.graphId), JSON.stringify(payload));
    }
    set({ lastSavedAt: payload.updatedAt, runtimeLabel: "Saved locally" });
  },

  validateGraph: () => {
    const state = get();
    const issues: ValidationIssue[] = [];
    const startCount = state.nodes.filter((node) => node.data.kind === "start").length;
    const endCount = state.nodes.filter((node) => node.data.kind === "end").length;
    const conditionNodes = state.nodes.filter((node) => node.data.kind === "condition");
    const stateKeys = new Set(state.stateSchema.map((field) => field.key));

    if (startCount !== 1) {
      issues.push({ code: "start_count", message: "Graph must contain exactly one Start node." });
    }
    if (endCount !== 1) {
      issues.push({ code: "end_count", message: "Graph must contain exactly one End node." });
    }
    for (const node of state.nodes) {
      for (const readKey of node.data.reads) {
        if (!stateKeys.has(readKey)) {
          issues.push({ code: "unknown_read_key", message: `Node '${node.id}' reads missing state key '${readKey}'.` });
        }
      }
      for (const writeKey of node.data.writes) {
        if (!stateKeys.has(writeKey)) {
          issues.push({ code: "unknown_write_key", message: `Node '${node.id}' writes missing state key '${writeKey}'.` });
        }
      }
    }
    for (const node of conditionNodes) {
      const branchEdges = state.edges.filter((edge) => edge.source === node.id && edge.data?.edgeKind === "branch");
      if (branchEdges.length < 2) {
        issues.push({ code: "condition_branches", message: `Condition node '${node.id}' must have at least two branch edges.` });
      }
    }

    set({
      validationIssues: issues,
      validationPassed: issues.length === 0,
      runtimeLabel: issues.length === 0 ? "Local validation passed" : `Validation found ${issues.length} issue(s)`,
    });
  },

  simulateRun: () => {
    set((state) => ({
      currentRunStatus: "completed",
      currentNodeId: state.nodes.at(-1)?.id ?? null,
      nodes: state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, status: "success" },
      })),
      runtimeLabel: "Simulated run completed",
    }));
  },
}));
