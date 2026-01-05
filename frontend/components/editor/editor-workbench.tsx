"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { apiGet, apiPost } from "@/lib/api";
import { fromBackendGraphDocument, toBackendGraphPayload, type BackendGraphDocument } from "@/lib/graph-api";
import { NODE_PRESETS } from "@/lib/editor-presets";
import { useEditorStore } from "@/stores/editor-store";
import type { GraphCanvasNode, GraphNodeConfig, RunDetailPayload } from "@/types/editor";

function EditorWorkbenchInner({ graphId }: { graphId: string }) {
  const {
    initGraph,
    hydrateGraph,
    updateGraphIdentity,
    updateGraphName,
    applyRunDetail,
    setCurrentRunId,
    graphId: activeGraphId,
    graphName,
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    lastSavedAt,
    validationIssues,
    runtimeLabel,
    configDraft,
    validationPassed,
    currentRunId,
    currentRunStatus,
    currentNodeId,
    nodeExecutionMap,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    selectEdge,
    updateSelectedNodeLabel,
    updateSelectedNodeDescription,
    updateSelectedNodeConfig,
    updateSelectedNodeConfigDraft,
    saveGraphLocally,
    validateGraph,
    simulateRun,
  } = useEditorStore();
  const router = useRouter();

  useEffect(() => {
    initGraph(graphId);
  }, [graphId, initGraph]);

  useEffect(() => {
    let cancelled = false;

    async function loadGraphFromBackend() {
      if (graphId === "demo-graph") {
        return;
      }
      try {
        const document = await apiGet<BackendGraphDocument>(`/api/graphs/${graphId}`);
        if (!cancelled) {
          const hydrated = fromBackendGraphDocument(document);
          hydrateGraph(
            {
              graphId: hydrated.graphId,
              name: hydrated.graphName,
              nodes: hydrated.nodes,
              edges: hydrated.edges,
              updatedAt: new Date().toISOString(),
            },
            "Loaded from backend",
          );
        }
      } catch (error) {
        if (!cancelled) {
          useEditorStore.setState({
            runtimeLabel:
              error instanceof Error ? `Backend load failed: ${error.message}` : "Backend load failed.",
          });
        }
      }
    }

    loadGraphFromBackend();
    return () => {
      cancelled = true;
    };
  }, [graphId, hydrateGraph]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const onNodeClick: NodeMouseHandler<GraphCanvasNode> = (_, node) => {
    selectNode(node.id);
  };

  const onEdgeClick: EdgeMouseHandler = (_, edge) => {
    selectEdge(edge.id);
  };

  const selectedNodeExecution = selectedNode ? nodeExecutionMap[selectedNode.id] ?? null : null;

  function updateNodeConfig(config: Partial<GraphNodeConfig>) {
    updateSelectedNodeConfig(config);
  }

  async function handleValidateBackend() {
    try {
      const payload = toBackendGraphPayload(activeGraphId, graphName, nodes, edges);
      const response = await apiPost<{ valid: boolean; issues: Array<{ code: string; message: string }> }>(
        "/api/graphs/validate",
        payload,
      );
      if (response.valid) {
        validateGraph();
      } else {
        useEditorStore.setState({
          validationIssues: response.issues,
          validationPassed: false,
          runtimeLabel: `Backend validation found ${response.issues.length} issue(s)`,
        });
      }
    } catch (error) {
      useEditorStore.setState({
        runtimeLabel: error instanceof Error ? error.message : "Backend validation failed.",
      });
    }
  }

  async function handleSaveBackend() {
    try {
      const payload = toBackendGraphPayload(activeGraphId, graphName, nodes, edges);
      const response = await apiPost<{ graph_id: string }>("/api/graphs/save", payload);
      updateGraphIdentity(response.graph_id);
      saveGraphLocally();
      useEditorStore.setState({
        runtimeLabel: `Saved graph ${response.graph_id}`,
      });
      if (graphId === "demo-graph" || graphId !== response.graph_id) {
        router.replace(`/editor/${response.graph_id}`);
      }
    } catch (error) {
      useEditorStore.setState({
        runtimeLabel: error instanceof Error ? error.message : "Save failed.",
      });
    }
  }

  async function handleRunBackend() {
    try {
      const payload = toBackendGraphPayload(activeGraphId, graphName, nodes, edges);
      const response = await apiPost<{ run_id: string; status: string }>("/api/graphs/run", payload);
      setCurrentRunId(response.run_id);
      useEditorStore.setState({
        runtimeLabel: `Run started: ${response.run_id}`,
      });
      const runDetail = await apiGet<RunDetailPayload>(`/api/runs/${response.run_id}`);
      applyRunDetail(runDetail);
    } catch (error) {
      useEditorStore.setState({
        runtimeLabel: error instanceof Error ? error.message : "Run failed.",
      });
    }
  }

  return (
    <div className="page">
      <section>
        <div className="eyebrow">Editor</div>
        <h1 className="page-title">{graphName}</h1>
        <p className="page-subtitle">
          This editor now supports node creation, connection, movement, selection, local save,
          and local graph validation. Backend save and run wiring comes next.
        </p>
      </section>

      <section className="card editor-toolbar-card">
        <div className="toolbar">
          <button className="button secondary" onClick={handleValidateBackend} type="button">
            Validate Graph
          </button>
          <button className="button secondary" onClick={handleSaveBackend} type="button">
            Save Graph
          </button>
          <button className="button" onClick={handleRunBackend} type="button">
            Run Graph
          </button>
          <button className="button secondary" onClick={saveGraphLocally} type="button">
            Save Local Draft
          </button>
          <button className="button secondary" onClick={simulateRun} type="button">
            Simulate Run
          </button>
          <span className="pill">{runtimeLabel}</span>
          {validationPassed !== null ? (
            <span className="pill">{validationPassed ? "Backend valid" : "Needs fixes"}</span>
          ) : null}
          {lastSavedAt ? <span className="pill">Saved {new Date(lastSavedAt).toLocaleTimeString()}</span> : null}
        </div>
      </section>

      <section className="editor-layout">
        <aside className="panel editor-side">
          <h2>Node Palette</h2>
          <div className="list">
            {NODE_PRESETS.map((preset) => (
              <button
                key={preset.kind}
                className="node-palette-item"
                onClick={() => addNode(preset.kind)}
                type="button"
              >
                <strong>{preset.label}</strong>
                <span className="muted">{preset.description}</span>
              </button>
            ))}
          </div>

          <div className="editor-summary">
            <div className="pill">Nodes {nodes.length}</div>
            <div className="pill">Edges {edges.length}</div>
            {currentRunStatus ? <div className="pill">Run {currentRunStatus}</div> : null}
            {currentNodeId ? <div className="pill">Current node {currentNodeId}</div> : null}
            {selectedEdgeId ? <div className="pill">Selected edge {selectedEdgeId}</div> : null}
          </div>

          {validationIssues.length > 0 ? (
            <div className="validation-box">
              <h3>Validation Issues</h3>
              <div className="list">
                {validationIssues.map((issue) => (
                  <div className="list-item" key={issue.code}>
                    <strong>{issue.code}</strong>
                    <div className="muted">{issue.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {currentRunId ? (
            <div className="validation-box">
              <h3>Latest Run</h3>
              <div className="list">
                <div className="list-item">
                  <strong>{currentRunId}</strong>
                  <div className="muted">Status: {currentRunStatus ?? "unknown"}</div>
                </div>
                <button className="button secondary" onClick={() => router.push(`/runs/${currentRunId}`)} type="button">
                  Open Run Detail
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="editor-canvas card">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <MiniMap zoomable pannable />
            <Controls />
            <Background gap={18} size={1} />
            <Panel position="top-left">
              <div className="pill">Click nodes to edit, drag to move, connect handles to link.</div>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="panel editor-side">
          <h2>Config Panel</h2>
          {selectedNode ? (
            <div className="config-form">
              <label className="field">
                <span>Graph Name</span>
                <input
                  className="text-input"
                  value={graphName}
                  onChange={(event) => updateGraphName(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Name</span>
                <input
                  className="text-input"
                  value={selectedNode.data.label}
                  onChange={(event) => updateSelectedNodeLabel(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  className="text-area"
                  rows={4}
                  value={selectedNode.data.description}
                  onChange={(event) => updateSelectedNodeDescription(event.target.value)}
                />
              </label>

              {selectedNode.data.kind === "input" ? (
                <label className="field">
                  <span>Task Input</span>
                  <textarea
                    className="text-area"
                    rows={4}
                    value={selectedNode.data.config.taskInput ?? ""}
                    onChange={(event) => updateNodeConfig({ taskInput: event.target.value })}
                  />
                </label>
              ) : null}

              {selectedNode.data.kind === "knowledge" ? (
                <label className="field">
                  <span>Knowledge Query</span>
                  <input
                    className="text-input"
                    value={selectedNode.data.config.query ?? ""}
                    onChange={(event) => updateNodeConfig({ query: event.target.value })}
                  />
                </label>
              ) : null}

              {selectedNode.data.kind === "memory" ? (
                <label className="field">
                  <span>Memory Type</span>
                  <select
                    className="text-input"
                    value={selectedNode.data.config.memoryType ?? "success_pattern"}
                    onChange={(event) => updateNodeConfig({ memoryType: event.target.value })}
                  >
                    <option value="success_pattern">success_pattern</option>
                    <option value="failure_reason">failure_reason</option>
                  </select>
                </label>
              ) : null}

              {selectedNode.data.kind === "planner" ? (
                <label className="field">
                  <span>Planner Mode</span>
                  <select
                    className="text-input"
                    value={selectedNode.data.config.plannerMode ?? "default"}
                    onChange={(event) => updateNodeConfig({ plannerMode: event.target.value })}
                  >
                    <option value="default">default</option>
                    <option value="fast">fast</option>
                    <option value="careful">careful</option>
                  </select>
                </label>
              ) : null}

              {selectedNode.data.kind === "skill_executor" ? (
                <label className="field">
                  <span>Selected Skills</span>
                  <input
                    className="text-input"
                    value={(selectedNode.data.config.selectedSkills ?? ["search_docs"]).join(", ")}
                    onChange={(event) =>
                      updateNodeConfig({
                        selectedSkills: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              ) : null}

              {selectedNode.data.kind === "evaluator" ? (
                <>
                  <label className="field">
                    <span>Decision</span>
                    <select
                      className="text-input"
                      value={selectedNode.data.config.evaluatorDecision ?? "pass"}
                      onChange={(event) =>
                        updateNodeConfig({
                          evaluatorDecision: event.target.value as "pass" | "revise" | "fail",
                        })
                      }
                    >
                      <option value="pass">pass</option>
                      <option value="revise">revise</option>
                      <option value="fail">fail</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Score</span>
                    <input
                      className="text-input"
                      type="number"
                      step="0.1"
                      value={selectedNode.data.config.score ?? 8.5}
                      onChange={(event) => updateNodeConfig({ score: Number(event.target.value) })}
                    />
                  </label>
                </>
              ) : null}

              {selectedNode.data.kind === "finalizer" ? (
                <label className="field">
                  <span>Final Message</span>
                  <textarea
                    className="text-area"
                    rows={3}
                    value={selectedNode.data.config.finalMessage ?? ""}
                    onChange={(event) => updateNodeConfig({ finalMessage: event.target.value })}
                  />
                </label>
              ) : null}

              <label className="field">
                <span>Advanced Node Data JSON</span>
                <textarea
                  className="text-area code-area"
                  rows={12}
                  value={configDraft}
                  onChange={(event) => updateSelectedNodeConfigDraft(event.target.value)}
                />
              </label>

              <div className="status-row">
                <span className="pill">Type {selectedNode.data.kind}</span>
                <span className="pill">Status {selectedNode.data.status ?? "idle"}</span>
              </div>

              {selectedNodeExecution ? (
                <div className="execution-box">
                  <h3>Latest Execution</h3>
                  <div className="list">
                    <div className="list-item">
                      <strong>{selectedNodeExecution.status}</strong>
                      <div className="muted">{selectedNodeExecution.input_summary}</div>
                    </div>
                    <div className="list-item">
                      <strong>Output</strong>
                      <div className="muted">{selectedNodeExecution.output_summary}</div>
                    </div>
                    <div className="status-row">
                      <span className="pill">{selectedNodeExecution.duration_ms}ms</span>
                      {(selectedNodeExecution.warnings ?? []).length > 0 ? (
                        <span className="pill">warnings {(selectedNodeExecution.warnings ?? []).length}</span>
                      ) : null}
                      {(selectedNodeExecution.errors ?? []).length > 0 ? (
                        <span className="pill">errors {(selectedNodeExecution.errors ?? []).length}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">
              Select a node to edit its label, description, and node data. Selecting an edge clears
              the node editor and shows edge focus on the left panel.
            </p>
          )}
        </aside>
      </section>
    </div>
  );
}

export function EditorWorkbench({ graphId }: { graphId: string }) {
  return (
    <ReactFlowProvider>
      <EditorWorkbenchInner graphId={graphId} />
    </ReactFlowProvider>
  );
}
