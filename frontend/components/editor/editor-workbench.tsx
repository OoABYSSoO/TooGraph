"use client";

import { useEffect, useMemo, useState } from "react";
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

import { NodeParamsForm } from "@/components/editor/node-params-form";
import { WorkflowEdge } from "@/components/editor/workflow-edge";
import { StatePanel } from "@/components/editor/state-panel";
import { ThemeConfigPanel } from "@/components/editor/theme-config-panel";
import { WorkflowNode } from "@/components/editor/workflow-node";
import { useLanguage } from "@/components/providers/language-provider";
import { apiGet, apiPost } from "@/lib/api";
import { NODE_PRESETS } from "@/lib/editor-presets";
import {
  fromBackendGraphDocument,
  fromBackendThemePreset,
  fromBackendTemplateDefaultGraph,
  toBackendGraphPayload,
  type BackendGraphDocument,
  type BackendTemplateDefinition,
} from "@/lib/graph-api";
import { getTemplateThemePresets } from "@/lib/templates";
import { useEditorStore } from "@/stores/editor-store";
import type { GraphCanvasNode, GraphDocument, RunDetailPayload, StateFieldRole, StateFieldType, TemplateDefinition, ThemePreset } from "@/types/editor";

const nodeTypes = {
  workflow: WorkflowNode,
};

const edgeTypes = {
  workflow: WorkflowEdge,
};

function EditorWorkbenchInner({ graphId }: { graphId: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [newReadKey, setNewReadKey] = useState("");
  const [newWriteKey, setNewWriteKey] = useState("");
  const [templatePresets, setTemplatePresets] = useState<ThemePreset[]>(getTemplateThemePresets("creative_factory"));
  const {
    initGraph,
    hydrateGraph,
    updateGraphIdentity,
    updateGraphName,
    updateThemeConfig,
    applyThemePreset,
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
    updateSelectedNodeParam,
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
      if (graphId === "creative-factory" || graphId.startsWith("template-")) {
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

  useEffect(() => {
    let cancelled = false;

    async function loadTemplateDefinition() {
      try {
        const payload = await apiGet<BackendTemplateDefinition>(`/api/templates/${templateId}`);
        if (cancelled) return;
        if ((graphId === "creative-factory" || graphId.startsWith("template-")) && payload.default_graph) {
          const hydrated = fromBackendTemplateDefaultGraph(templateId, graphId, payload.default_graph);
          hydrateGraph(hydrated, "Loaded from template registry");
        }
        const nextPresets: ThemePreset[] = payload.theme_presets.map(fromBackendThemePreset);
        if (nextPresets.length > 0) {
          setTemplatePresets(nextPresets);
        }
      } catch {
        if (!cancelled) {
          setTemplatePresets(getTemplateThemePresets(templateId));
        }
      }
    }

    loadTemplateDefinition();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);
  const selectedNodeExecution = selectedNode ? nodeExecutionMap[selectedNode.id] ?? null : null;
  const selectedThemePreset = useMemo(
    () => templatePresets.find((preset) => preset.id === themeConfig.themePreset) ?? null,
    [templatePresets, themeConfig.themePreset],
  );

  useEffect(() => {
    setNewReadKey("");
    setNewWriteKey("");
  }, [selectedNodeId]);

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

  function handleQuickAddState(
    nextKey: string,
    bindMode: "read" | "write",
    type: StateFieldType = "string",
    role: StateFieldRole = bindMode === "read" ? "input" : "artifact",
  ) {
    const key = nextKey.trim();
    if (!key || !selectedNode) return;
    const exists = stateSchema.some((field) => field.key === key);
    if (!exists) {
      addStateField({
        key,
        type,
        role,
        title: key,
        description: "",
      });
    }
    const alreadyBound = bindMode === "read" ? selectedNode.data.reads.includes(key) : selectedNode.data.writes.includes(key);
    if (!alreadyBound) {
      if (bindMode === "read") {
        toggleSelectedNodeRead(key);
      } else {
        toggleSelectedNodeWrite(key);
      }
    }
    if (bindMode === "read") setNewReadKey("");
    if (bindMode === "write") setNewWriteKey("");
  }

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
    <div className="grid gap-6">
      <section>
        <div className="inline-flex rounded-full border border-[rgba(154,52,18,0.18)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1.5 text-[0.82rem] uppercase tracking-[0.06em] text-[var(--accent-strong)]">Editor</div>
        <h1 className="mb-2.5 mt-3.5 text-[clamp(2rem,4vw,3.4rem)] leading-[1.05]">{graphName}</h1>
        <p className="max-w-[68ch] text-[1.02rem] leading-[1.7] text-[var(--muted)]">{t("editor.desc")}</p>
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] px-5 py-4 shadow-[0_10px_30px_var(--shadow)]">
        <div className="flex flex-wrap gap-2.5">
          <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" onClick={handleValidateBackend} type="button">
            {t("editor.validate")}
          </button>
          <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" onClick={handleSaveBackend} type="button">
            {t("editor.save")}
          </button>
          <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-[var(--accent)] px-[18px] py-3 text-white transition-transform duration-150 hover:-translate-y-px" onClick={handleRunBackend} type="button">
            {t("editor.run")}
          </button>
          <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" onClick={saveGraphLocally} type="button">
            {t("editor.save_local")}
          </button>
          <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" onClick={simulateRun} type="button">
            {t("editor.simulate")}
          </button>
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{runtimeLabel}</span>
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Template {templateId}</span>
          {validationPassed !== null ? <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{validationPassed ? "Schema valid" : "Needs fixes"}</span> : null}
          {lastSavedAt ? <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Saved {new Date(lastSavedAt).toLocaleTimeString()}</span> : null}
        </div>
      </section>

      <ThemeConfigPanel
        graphName={graphName}
        themeConfig={themeConfig}
        presets={templatePresets}
        onGraphNameChange={updateGraphName}
        onThemeConfigChange={updateThemeConfig}
        onApplyPreset={applyThemePreset}
      />

      <section className="grid min-h-[620px] grid-cols-[360px_minmax(0,1fr)_380px] gap-4 max-[960px]:grid-cols-1">
        <aside className="grid content-start gap-4 rounded-[22px] border border-dashed border-[rgba(154,52,18,0.25)] bg-[rgba(255,255,255,0.42)] p-[18px]">
          <StatePanel stateSchema={stateSchema} onAddField={addStateField} onUpdateField={updateStateField} onRemoveField={removeStateField} />

          <div className="grid gap-3">
            <h2 className="text-lg font-semibold">{t("editor.palette")}</h2>
            <div className="grid gap-3">
              {NODE_PRESETS.map((preset) => (
                <button key={preset.kind} className="grid gap-1.5 rounded-[18px] border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.78)] p-3.5 text-left text-[var(--text)] transition-transform hover:-translate-y-px hover:border-[rgba(154,52,18,0.45)]" onClick={() => addNode(preset.kind)} type="button">
                  <strong>{preset.label}</strong>
                  <span className="text-[var(--muted)]">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Nodes {nodes.length}</div>
            <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Edges {edges.length}</div>
            <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">State {stateSchema.length}</div>
            {currentRunStatus ? <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Run {currentRunStatus}</div> : null}
            {currentNodeId ? <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Current {currentNodeId}</div> : null}
            {selectedEdgeId ? <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Selected edge {selectedEdgeId}</div> : null}
          </div>

          {validationIssues.length > 0 ? (
            <div className="grid gap-2.5">
              <h3 className="font-semibold">Validation Issues</h3>
              <div className="grid gap-3">
                {validationIssues.map((issue) => (
                  <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5" key={`${issue.code}-${issue.message}`}>
                    <strong>{issue.code}</strong>
                    <div className="text-[var(--muted)]">{issue.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {currentRunId ? (
            <div className="grid gap-2.5">
              <h3 className="font-semibold">{t("editor.latest_run")}</h3>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
                  <strong>{currentRunId}</strong>
                  <div className="text-[var(--muted)]">Status: {currentRunStatus ?? "unknown"}</div>
                </div>
                <button className="inline-flex items-center justify-center rounded-[14px] border border-[var(--accent)] bg-transparent px-[18px] py-3 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" onClick={() => router.push(`/runs/${currentRunId}`)} type="button">
                  {t("editor.open_run")}
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="editor-canvas rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-0 shadow-[0_10px_30px_var(--shadow)]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
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
              <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Edges represent execution flow and carry major state keys.</div>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="grid content-start gap-4 rounded-[22px] border border-dashed border-[rgba(154,52,18,0.25)] bg-[rgba(255,255,255,0.42)] p-[18px]">
          <h2 className="text-lg font-semibold">{t("editor.config")}</h2>

          {selectedNode ? (
            <div className="grid gap-3.5">
              <label className="grid gap-2 text-[0.94rem]">
                <span>{t("editor.node_name")}</span>
                <input className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]" value={selectedNode.data.label} onChange={(event) => updateSelectedNodeLabel(event.target.value)} />
              </label>

              <label className="grid gap-2 text-[0.94rem]">
                <span>{t("editor.description")}</span>
                <textarea
                  className="w-full resize-y rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                  rows={3}
                  value={selectedNode.data.description}
                  onChange={(event) => updateSelectedNodeDescription(event.target.value)}
                />
              </label>

              <div className="grid gap-2 text-[0.94rem]">
                <span>Inputs</span>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                  <input
                    className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                    placeholder="new_input_key"
                    value={newReadKey}
                    onChange={(event) => setNewReadKey(event.target.value)}
                  />
                  <button className="inline-flex items-center justify-center rounded-xl border border-[var(--accent)] bg-transparent px-3 py-2.5 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" onClick={() => handleQuickAddState(newReadKey, "read")} type="button">
                    + Add
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5 max-[960px]:grid-cols-1">
                  {stateSchema.map((field) => (
                    <label className="flex items-center gap-2 rounded-[14px] border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] px-3 py-2.5" key={`read-${field.key}`}>
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

              <div className="grid gap-2 text-[0.94rem]">
                <span>Outputs</span>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                  <input
                    className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                    placeholder="new_output_key"
                    value={newWriteKey}
                    onChange={(event) => setNewWriteKey(event.target.value)}
                  />
                  <button className="inline-flex items-center justify-center rounded-xl border border-[var(--accent)] bg-transparent px-3 py-2.5 text-[var(--accent-strong)] transition-transform duration-150 hover:-translate-y-px" onClick={() => handleQuickAddState(newWriteKey, "write")} type="button">
                    + Add
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5 max-[960px]:grid-cols-1">
                  {stateSchema.map((field) => (
                    <label className="flex items-center gap-2 rounded-[14px] border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] px-3 py-2.5" key={`write-${field.key}`}>
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

              <div className="grid gap-2 text-[0.94rem]">
                <span>Structured Params</span>
                <NodeParamsForm node={selectedNode} onParamChange={updateSelectedNodeParam} />
              </div>

              <label className="grid gap-2 text-[0.94rem]">
                <span>Params JSON</span>
                <textarea
                  className="w-full resize-y rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 font-mono text-[0.88rem] text-[var(--text)]"
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

              <label className="grid gap-2 text-[0.94rem]">
                <span>{t("editor.advanced")}</span>
                <textarea
                  className="w-full resize-y rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 font-mono text-[0.88rem] text-[var(--text)]"
                  rows={10}
                  value={configDraft}
                  onChange={(event) => updateSelectedNodeConfigDraft(event.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-2.5">
                <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Type {selectedNode.data.kind}</span>
                <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Reads {selectedNode.data.reads.length}</span>
                <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Writes {selectedNode.data.writes.length}</span>
                <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">Status {selectedNode.data.status ?? "idle"}</span>
              </div>

              {selectedNodeExecution ? (
                <div className="grid gap-2.5">
                  <h3 className="font-semibold">{t("editor.latest_execution")}</h3>
                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
                      <strong>{selectedNodeExecution.status}</strong>
                      <div className="text-[var(--muted)]">{selectedNodeExecution.input_summary}</div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] p-3.5">
                      <strong>Output</strong>
                      <div className="text-[var(--muted)]">{selectedNodeExecution.output_summary}</div>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-2.5 py-1.5 text-[0.86rem] text-[var(--muted)]">{selectedNodeExecution.duration_ms}ms</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="grid gap-3.5">
              <div className="grid gap-2 text-[0.94rem]">
                <span>Edge Kind</span>
                <select
                  className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
                  value={selectedEdge.data?.edgeKind ?? "normal"}
                  onChange={(event) => updateSelectedEdgeKind(event.target.value as "normal" | "branch")}
                >
                  <option value="normal">normal</option>
                  <option value="branch">branch</option>
                </select>
              </div>

              {(selectedEdge.data?.edgeKind ?? "normal") === "branch" ? (
                <div className="grid gap-2 text-[0.94rem]">
                  <span>Branch Label</span>
                  <select
                    className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-3.5 py-3 text-[var(--text)]"
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

              <div className="grid gap-2 text-[0.94rem]">
                <span>Flow Keys</span>
                <div className="grid grid-cols-2 gap-2.5 max-[960px]:grid-cols-1">
                  {stateSchema.map((field) => {
                    const flowKeys = selectedEdge.data?.flowKeys ?? [];
                    const checked = flowKeys.includes(field.key);
                    return (
                      <label className="flex items-center gap-2 rounded-[14px] border border-[rgba(212,198,170,0.9)] bg-[rgba(255,255,255,0.65)] px-3 py-2.5" key={`edge-${field.key}`}>
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
            <p className="text-[var(--muted)]">Select a node to edit reads/writes/params, or select an edge to edit flow keys and branch metadata.</p>
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
