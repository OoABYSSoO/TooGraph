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
import type { GraphCanvasNode } from "@/types/editor";

function EditorWorkbenchInner({ graphId }: { graphId: string }) {
  const {
    initGraph,
    hydrateGraph,
    updateGraphIdentity,
    updateGraphName,
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
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    selectEdge,
    updateSelectedNodeLabel,
    updateSelectedNodeDescription,
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
      useEditorStore.setState({
        runtimeLabel: `Run started: ${response.run_id}`,
      });
      router.push(`/runs/${response.run_id}`);
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

              <label className="field">
                <span>Node Data JSON</span>
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
