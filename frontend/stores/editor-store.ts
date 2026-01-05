"use client";

import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from "@xyflow/react";
import { create } from "zustand";

import { createStarterGraph, NODE_PRESETS } from "@/lib/editor-presets";
import type {
  GraphCanvasEdge,
  GraphCanvasNode,
  GraphDocument,
  GraphNodeConfig,
  GraphNodeType,
  NodeExecutionSummary,
  RunDetailPayload,
} from "@/types/editor";

type ValidationIssue = {
  code: string;
  message: string;
};

type EditorState = {
  graphId: string;
  graphName: string;
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
  updateSelectedNodeConfig: (config: Partial<GraphNodeConfig>) => void;
  updateSelectedNodeConfigDraft: (draft: string) => void;
  saveGraphLocally: () => void;
  validateGraph: () => void;
  simulateRun: () => void;
};

const initialGraphName = "Untitled Graph";

const toStorageKey = (graphId: string) => `graphiteui:graph:${graphId}`;

export const useEditorStore = create<EditorState>((set, get) => ({
  graphId: "",
  graphName: initialGraphName,
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

    const starterNodes = createStarterGraph(graphId);
    const starterEdges: GraphCanvasEdge[] = [
      { id: "edge_input_planner", source: "input_1", target: "planner_1" },
      { id: "edge_planner_eval", source: "planner_1", target: "evaluator_1" },
      {
        id: "edge_eval_finalizer",
        source: "evaluator_1",
        target: "finalizer_1",
        label: "pass",
      },
    ];
    set({
      graphId,
      graphName: graphId === "demo-graph" ? "Demo Graph" : initialGraphName,
      nodes: starterNodes,
      edges: starterEdges,
      selectedNodeId: null,
      selectedEdgeId: null,
      validationIssues: [],
      runtimeLabel: "Starter graph ready",
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
    set((state) => ({
      graphId,
      graphName: graphName ?? state.graphName,
    }));
  },

  updateGraphName: (graphName) => {
    set({ graphName });
  },

  setCurrentRunId: (runId) => {
    set({ currentRunId: runId });
  },

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
          rawStatus === "running" || rawStatus === "success" || rawStatus === "failed"
            ? rawStatus
            : "idle";
        return {
          ...node,
          className: `graph-node status-${nodeStatus}`,
          data: {
            ...node.data,
            status: nodeStatus,
          },
        };
      }),
    }));
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          id: `edge_${connection.source}_${connection.target}_${state.edges.length + 1}`,
          animated: false,
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
        type: "default",
        className: "graph-node status-idle",
        position: {
          x: 160 + (state.nodes.length % 3) * 220,
          y: 120 + Math.floor(state.nodes.length / 3) * 140,
        },
        data: {
          label: preset.label,
          kind: preset.kind,
          description: preset.description,
          status: "idle",
          config:
            preset.kind === "input"
              ? { taskInput: "Describe the workflow task here." }
              : preset.kind === "knowledge"
                ? { query: "" }
                : preset.kind === "memory"
                  ? { memoryType: "success_pattern" }
                  : preset.kind === "planner"
                    ? { plannerMode: "default" }
                    : preset.kind === "skill_executor"
                      ? { selectedSkills: ["search_docs"] }
                      : preset.kind === "evaluator"
                        ? { evaluatorDecision: "pass", score: 8.5 }
                        : { finalMessage: "Finalize workflow output." },
        },
      };
      return {
        nodes: [...state.nodes, nextNode],
        selectedNodeId: nodeId,
        selectedEdgeId: null,
        configDraft: JSON.stringify(nextNode.data, null, 2),
      };
    });
  },

  selectNode: (nodeId) => {
    const state = get();
    const node = state.nodes.find((item) => item.id === nodeId);
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      configDraft: node ? JSON.stringify(node.data, null, 2) : "",
    });
  },

  selectEdge: (edgeId) => {
    set({ selectedEdgeId: edgeId, selectedNodeId: null, configDraft: "" });
  },

  updateSelectedNodeLabel: (label) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === state.selectedNodeId
          ? { ...node, data: { ...node.data, label } }
          : node,
      ),
    }));
  },

  updateSelectedNodeDescription: (description) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === state.selectedNodeId
          ? { ...node, data: { ...node.data, description } }
          : node,
      ),
    }));
  },

  updateSelectedNodeConfig: (config) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === state.selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...node.data.config,
                  ...config,
                },
              },
            }
          : node,
      );
      const updatedNode = nodes.find((node) => node.id === state.selectedNodeId);
      return {
        nodes,
        configDraft: updatedNode ? JSON.stringify(updatedNode.data, null, 2) : state.configDraft,
      };
    });
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
                  description:
                    typeof parsed.description === "string"
                      ? parsed.description
                      : node.data.description,
                  config:
                    parsed.config && typeof parsed.config === "object"
                      ? {
                          ...node.data.config,
                          ...parsed.config,
                        }
                      : node.data.config,
                },
              }
            : node,
        ),
      }));
    } catch {
      // keep draft text while invalid JSON is being edited
    }
  },

  saveGraphLocally: () => {
    const state = get();
    const payload: GraphDocument = {
      graphId: state.graphId,
      name: state.graphName,
      nodes: state.nodes,
      edges: state.edges,
      updatedAt: new Date().toISOString(),
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(toStorageKey(state.graphId), JSON.stringify(payload));
    }
    set({
      lastSavedAt: payload.updatedAt,
      runtimeLabel: "Saved locally",
    });
  },

  validateGraph: () => {
    const state = get();
    const issues: ValidationIssue[] = [];
    const inputCount = state.nodes.filter((node) => node.data.kind === "input").length;
    const evaluatorCount = state.nodes.filter((node) => node.data.kind === "evaluator").length;
    const finalizerCount = state.nodes.filter((node) => node.data.kind === "finalizer").length;

    if (inputCount !== 1) {
      issues.push({ code: "input_count", message: "Editor graph must contain exactly one Input node." });
    }
    if (evaluatorCount < 1) {
      issues.push({ code: "missing_evaluator", message: "Editor graph must include an Evaluator node." });
    }
    if (finalizerCount !== 1) {
      issues.push({ code: "finalizer_count", message: "Editor graph must contain exactly one Finalizer node." });
    }
    if (state.edges.length < Math.max(state.nodes.length - 1, 1)) {
      issues.push({ code: "edge_count", message: "Graph needs enough edges to connect the active node flow." });
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
      nodes: state.nodes.map((node, index) => ({
        ...node,
        className: "graph-node status-success",
        data: {
          ...node.data,
          status: index === state.nodes.length - 1 ? "success" : "success",
        },
      })),
      runtimeLabel: "Simulated run completed",
    }));
  },
}));
