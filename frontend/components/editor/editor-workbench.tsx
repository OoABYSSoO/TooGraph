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
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { StatePanel } from "@/components/editor/state-panel";
import { useLanguage } from "@/components/providers/language-provider";
import { apiGet, apiPost } from "@/lib/api";
import { NODE_PRESETS } from "@/lib/editor-presets";
import { fromBackendGraphDocument, toBackendGraphPayload, type BackendGraphDocument } from "@/lib/graph-api";
import { useEditorStore } from "@/stores/editor-store";
import type { GraphCanvasNode, GraphDocument, RunDetailPayload } from "@/types/editor";

function EditorWorkbenchInner({ graphId }: { graphId: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const {
    initGraph,
    hydrateGraph,
    updateGraphIdentity,
    updateGraphName,
    updateThemeConfig,
    updateStateField,
    addStateField,
    removeStateField,
    applyRunDetail,
    setCurrentRunId,
    graphId: activeGraphId,
    graphName,
    templateId,
    themeConfig,
    stateSchema,
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
    toggleSelectedNodeRead,
    toggleSelectedNodeWrite,
    replaceSelectedNodeParams,
    updateSelectedEdgeFlowKeys,
    updateSelectedEdgeKind,
    updateSelectedEdgeBranchLabel,
    updateSelectedNodeConfigDraft,
    saveGraphLocally,
    validateGraph,
    simulateRun,
  } = useEditorStore();

  useEffect(() => {
    initGraph(graphId);
  }, [graphId, initGraph]);

  useEffect(() => {
    let cancelled = false;

    async function loadGraphFromBackend() {
      if (graphId === "creative-factory" || graphId === "slg-creative-factory" || graphId.startsWith("template-")) {
        return;
      }
      try {
        const document = await apiGet<BackendGraphDocument>(`/api/graphs/${graphId}`);
        if (!cancelled) {
          const hydrated = fromBackendGraphDocument(document);
          hydrateGraph(hydrated, "Loaded from backend");
        }
      } catch (error) {
        if (!cancelled) {
          useEditorStore.setState({
            runtimeLabel: error instanceof Error ? `Backend load failed: ${error.message}` : "Backend load failed.",
          });
        }
      }
    }

    loadGraphFromBackend();
    return () => {
      cancelled = true;
    };
  }, [graphId, hydrateGraph]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);
  const selectedNodeExecution = selectedNode ? nodeExecutionMap[selectedNode.id] ?? null : null;

  const graphDocument: GraphDocument = useMemo(
    () => ({
      graphId: activeGraphId,
      name: graphName,
      templateId,
      themeConfig,
      stateSchema,
      nodes,
      edges,
      updatedAt: lastSavedAt ?? new Date().toISOString(),
    }),
    [activeGraphId, edges, graphName, lastSavedAt, nodes, stateSchema, templateId, themeConfig],
  );

  const onNodeClick: NodeMouseHandler<GraphCanvasNode> = (_, node) => selectNode(node.id);
  const onEdgeClick: EdgeMouseHandler = (_, edge) => selectEdge(edge.id);

  async function handleValidateBackend() {
    try {
      const payload = toBackendGraphPayload(graphDocument);
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
      const payload = toBackendGraphPayload(graphDocument);
      const response = await apiPost<{ graph_id: string }>("/api/graphs/save", payload);
      updateGraphIdentity(response.graph_id);
      saveGraphLocally();
      useEditorStore.setState({ runtimeLabel: `Saved graph ${response.graph_id}` });
      if (graphId !== response.graph_id) {
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
      const payload = toBackendGraphPayload(graphDocument);
      const response = await apiPost<{ run_id: string; status: string }>("/api/graphs/run", payload);
      setCurrentRunId(response.run_id);
      useEditorStore.setState({ runtimeLabel: `Run started: ${response.run_id}` });
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
        <p className="page-subtitle">{t("editor.desc")}</p>
      </section>

      <section className="card editor-toolbar-card">
        <div className="toolbar">
          <button className="button secondary" onClick={handleValidateBackend} type="button">
            {t("editor.validate")}
          </button>
          <button className="button secondary" onClick={handleSaveBackend} type="button">
            {t("editor.save")}
          </button>
          <button className="button" onClick={handleRunBackend} type="button">
            {t("editor.run")}
          </button>
          <button className="button secondary" onClick={saveGraphLocally} type="button">
            {t("editor.save_local")}
          </button>
          <button className="button secondary" onClick={simulateRun} type="button">
            {t("editor.simulate")}
          </button>
          <span className="pill">{runtimeLabel}</span>
          <span className="pill">Template {templateId}</span>
          {validationPassed !== null ? <span className="pill">{validationPassed ? "Schema valid" : "Needs fixes"}</span> : null}
          {lastSavedAt ? <span className="pill">Saved {new Date(lastSavedAt).toLocaleTimeString()}</span> : null}
        </div>
      </section>

      <section className="card editor-theme-card">
        <div className="theme-grid">
          <label className="field">
            <span>{t("editor.graph_name")}</span>
            <input className="text-input" value={graphName} onChange={(event) => updateGraphName(event.target.value)} />
          </label>
          <label className="field">
            <span>Domain</span>
            <input className="text-input" value={themeConfig.domain} onChange={(event) => updateThemeConfig({ domain: event.target.value })} />
          </label>
          <label className="field">
            <span>Genre</span>
            <input className="text-input" value={themeConfig.genre} onChange={(event) => updateThemeConfig({ genre: event.target.value })} />
          </label>
          <label className="field">
            <span>Market</span>
            <input className="text-input" value={themeConfig.market} onChange={(event) => updateThemeConfig({ market: event.target.value })} />
          </label>
          <label className="field">
            <span>Platform</span>
            <input className="text-input" value={themeConfig.platform} onChange={(event) => updateThemeConfig({ platform: event.target.value })} />
          </label>
          <label className="field">
            <span>Language</span>
            <input className="text-input" value={themeConfig.language} onChange={(event) => updateThemeConfig({ language: event.target.value })} />
          </label>
          <label className="field">
            <span>Creative Style</span>
            <input
              className="text-input"
              value={themeConfig.creativeStyle}
              onChange={(event) => updateThemeConfig({ creativeStyle: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Tone</span>
            <input className="text-input" value={themeConfig.tone} onChange={(event) => updateThemeConfig({ tone: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="editor-layout editor-layout-v2">
        <aside className="panel editor-side editor-left-stack">
          <StatePanel stateSchema={stateSchema} onAddField={addStateField} onUpdateField={updateStateField} onRemoveField={removeStateField} />

          <div className="editor-palette-box">
            <h2>{t("editor.palette")}</h2>
            <div className="list">
              {NODE_PRESETS.map((preset) => (
                <button key={preset.kind} className="node-palette-item" onClick={() => addNode(preset.kind)} type="button">
                  <strong>{preset.label}</strong>
                  <span className="muted">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="editor-summary">
            <div className="pill">Nodes {nodes.length}</div>
            <div className="pill">Edges {edges.length}</div>
            <div className="pill">State {stateSchema.length}</div>
            {currentRunStatus ? <div className="pill">Run {currentRunStatus}</div> : null}
            {currentNodeId ? <div className="pill">Current {currentNodeId}</div> : null}
            {selectedEdgeId ? <div className="pill">Selected edge {selectedEdgeId}</div> : null}
          </div>

          {validationIssues.length > 0 ? (
            <div className="validation-box">
              <h3>Validation Issues</h3>
              <div className="list">
                {validationIssues.map((issue) => (
                  <div className="list-item" key={`${issue.code}-${issue.message}`}>
                    <strong>{issue.code}</strong>
                    <div className="muted">{issue.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {currentRunId ? (
            <div className="validation-box">
              <h3>{t("editor.latest_run")}</h3>
              <div className="list">
                <div className="list-item">
                  <strong>{currentRunId}</strong>
                  <div className="muted">Status: {currentRunStatus ?? "unknown"}</div>
                </div>
                <button className="button secondary" onClick={() => router.push(`/runs/${currentRunId}`)} type="button">
                  {t("editor.open_run")}
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
              <div className="pill">Edges represent execution flow and carry major state keys.</div>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="panel editor-side">
          <h2>{t("editor.config")}</h2>

          {selectedNode ? (
            <div className="config-form">
              <label className="field">
                <span>{t("editor.node_name")}</span>
                <input className="text-input" value={selectedNode.data.label} onChange={(event) => updateSelectedNodeLabel(event.target.value)} />
              </label>

              <label className="field">
                <span>{t("editor.description")}</span>
                <textarea
                  className="text-area"
                  rows={3}
                  value={selectedNode.data.description}
                  onChange={(event) => updateSelectedNodeDescription(event.target.value)}
                />
              </label>

              <div className="field">
                <span>Inputs</span>
                <div className="toggle-grid">
                  {stateSchema.map((field) => (
                    <label className="toggle-card" key={`read-${field.key}`}>
                      <input
                        type="checkbox"
                        checked={selectedNode.data.reads.includes(field.key)}
                        onChange={() => toggleSelectedNodeRead(field.key)}
                      />
                      <span>{field.key}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Outputs</span>
                <div className="toggle-grid">
                  {stateSchema.map((field) => (
                    <label className="toggle-card" key={`write-${field.key}`}>
                      <input
                        type="checkbox"
                        checked={selectedNode.data.writes.includes(field.key)}
                        onChange={() => toggleSelectedNodeWrite(field.key)}
                      />
                      <span>{field.key}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="field">
                <span>Params JSON</span>
                <textarea
                  className="text-area code-area"
                  rows={8}
                  value={JSON.stringify(selectedNode.data.params, null, 2)}
                  onChange={(event) => {
                    try {
                      replaceSelectedNodeParams(JSON.parse(event.target.value) as Record<string, unknown>);
                    } catch {
                      // noop while typing invalid JSON
                    }
                  }}
                />
              </label>

              <label className="field">
                <span>{t("editor.advanced")}</span>
                <textarea
                  className="text-area code-area"
                  rows={10}
                  value={configDraft}
                  onChange={(event) => updateSelectedNodeConfigDraft(event.target.value)}
                />
              </label>

              <div className="status-row">
                <span className="pill">Type {selectedNode.data.kind}</span>
                <span className="pill">Reads {selectedNode.data.reads.length}</span>
                <span className="pill">Writes {selectedNode.data.writes.length}</span>
                <span className="pill">Status {selectedNode.data.status ?? "idle"}</span>
              </div>

              {selectedNodeExecution ? (
                <div className="execution-box">
                  <h3>{t("editor.latest_execution")}</h3>
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
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="config-form">
              <div className="field">
                <span>Edge Kind</span>
                <select
                  className="text-input"
                  value={selectedEdge.data?.edgeKind ?? "normal"}
                  onChange={(event) => updateSelectedEdgeKind(event.target.value as "normal" | "branch")}
                >
                  <option value="normal">normal</option>
                  <option value="branch">branch</option>
                </select>
              </div>

              {(selectedEdge.data?.edgeKind ?? "normal") === "branch" ? (
                <div className="field">
                  <span>Branch Label</span>
                  <select
                    className="text-input"
                    value={selectedEdge.data?.branchLabel ?? ""}
                    onChange={(event) => updateSelectedEdgeBranchLabel(event.target.value as "pass" | "revise" | "fail" | "")}
                  >
                    <option value="">select branch</option>
                    <option value="pass">pass</option>
                    <option value="revise">revise</option>
                    <option value="fail">fail</option>
                  </select>
                </div>
              ) : null}

              <div className="field">
                <span>Flow Keys</span>
                <div className="toggle-grid">
                  {stateSchema.map((field) => {
                    const flowKeys = selectedEdge.data?.flowKeys ?? [];
                    const checked = flowKeys.includes(field.key);
                    return (
                      <label className="toggle-card" key={`edge-${field.key}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            updateSelectedEdgeFlowKeys(
                              checked ? flowKeys.filter((value) => value !== field.key) : [...flowKeys, field.key],
                            )
                          }
                        />
                        <span>{field.key}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {!selectedNode && !selectedEdge ? (
            <p className="muted">Select a node to edit reads/writes/params, or select an edge to edit flow keys and branch metadata.</p>
          ) : null}
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
