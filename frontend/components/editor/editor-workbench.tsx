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
import { createTemplateGraphDocument, getTemplateThemePresets } from "@/lib/templates";
import { useEditorStore } from "@/stores/editor-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubtleCard } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { GraphCanvasNode, GraphDocument, NodeExecutionDetail, RunDetailPayload, StateFieldRole, StateFieldType, TemplateDefinition, ThemePreset } from "@/types/editor";

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
  const [latestRunDetail, setLatestRunDetail] = useState<RunDetailPayload | null>(null);
  const [selectedNodeDetail, setSelectedNodeDetail] = useState<NodeExecutionDetail | null>(null);
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
          if (graphId === "creative-factory" || graphId.startsWith("template-")) {
            hydrateGraph(
              createTemplateGraphDocument(templateId, graphId, themeConfig.themePreset),
              "Loaded from local fallback template",
            );
          }
          setTemplatePresets(getTemplateThemePresets(templateId));
        }
      }
    }

    loadTemplateDefinition();
    return () => {
      cancelled = true;
    };
  }, [graphId, hydrateGraph, templateId, themeConfig.themePreset]);

  useEffect(() => {
    if (!currentRunId) return;
    if (currentRunStatus === "completed" || currentRunStatus === "failed") return;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const runDetail = await apiGet<RunDetailPayload>(`/api/runs/${currentRunId}`);
        if (!cancelled) {
          setLatestRunDetail(runDetail);
          applyRunDetail(runDetail);
        }
      } catch (error) {
        if (!cancelled) {
          useEditorStore.setState({
            runtimeLabel: error instanceof Error ? `Run polling failed: ${error.message}` : "Run polling failed.",
          });
        }
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyRunDetail, currentRunId, currentRunStatus]);

  useEffect(() => {
    if (!currentRunId || !selectedNodeId) {
      setSelectedNodeDetail(null);
      return;
    }

    let cancelled = false;

    async function loadNodeDetail() {
      try {
        const payload = await apiGet<NodeExecutionDetail>(`/api/runs/${currentRunId}/nodes/${selectedNodeId}`);
        if (!cancelled) {
          setSelectedNodeDetail(payload);
        }
      } catch {
        if (!cancelled) {
          setSelectedNodeDetail(null);
        }
      }
    }

    loadNodeDetail();
    return () => {
      cancelled = true;
    };
  }, [currentRunId, selectedNodeId, nodeExecutionMap]);

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
      setLatestRunDetail(runDetail);
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
          <Button onClick={handleValidateBackend}>{t("editor.validate")}</Button>
          <Button onClick={handleSaveBackend}>{t("editor.save")}</Button>
          <Button onClick={handleRunBackend} variant="primary">{t("editor.run")}</Button>
          <Button onClick={saveGraphLocally}>{t("editor.save_local")}</Button>
          <Button onClick={simulateRun}>{t("editor.simulate")}</Button>
          <Badge>{runtimeLabel}</Badge>
          <Badge>Template {templateId}</Badge>
          {currentRunId && currentRunStatus !== "completed" && currentRunStatus !== "failed" ? <Badge>Polling run</Badge> : null}
          {validationPassed !== null ? <Badge>{validationPassed ? "Schema valid" : "Needs fixes"}</Badge> : null}
          {lastSavedAt ? <Badge>Saved {new Date(lastSavedAt).toLocaleTimeString()}</Badge> : null}
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
            <Badge>Nodes {nodes.length}</Badge>
            <Badge>Edges {edges.length}</Badge>
            <Badge>State {stateSchema.length}</Badge>
            {currentRunStatus ? <Badge>Run {currentRunStatus}</Badge> : null}
            {currentNodeId ? <Badge>Current {currentNodeId}</Badge> : null}
            {selectedEdgeId ? <Badge>Selected edge {selectedEdgeId}</Badge> : null}
          </div>

          {validationIssues.length > 0 ? (
            <div className="grid gap-2.5">
              <h3 className="font-semibold">Validation Issues</h3>
              <div className="grid gap-3">
                {validationIssues.map((issue) => (
                  <SubtleCard key={`${issue.code}-${issue.message}`}>
                    <strong>{issue.code}</strong>
                    <div className="text-[var(--muted)]">{issue.message}</div>
                  </SubtleCard>
                ))}
              </div>
            </div>
          ) : null}

          {currentRunId ? (
            <div className="grid gap-2.5">
              <h3 className="font-semibold">{t("editor.latest_run")}</h3>
              <div className="grid gap-3">
                <SubtleCard>
                  <strong>{currentRunId}</strong>
                  <div className="text-[var(--muted)]">Status: {currentRunStatus ?? "unknown"}</div>
                </SubtleCard>
                <Button onClick={() => router.push(`/runs/${currentRunId}`)}>{t("editor.open_run")}</Button>
                {latestRunDetail?.warnings?.length ? (
                  <SubtleCard>
                    <strong>Run warnings</strong>
                    <div className="mt-1.5 grid gap-1 text-[var(--muted)]">
                      {latestRunDetail.warnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                      ))}
                    </div>
                  </SubtleCard>
                ) : null}
                {latestRunDetail?.errors?.length ? (
                  <SubtleCard className="border-[rgba(159,18,57,0.28)]">
                    <strong>Run errors</strong>
                    <div className="mt-1.5 grid gap-1 text-[var(--muted)]">
                      {latestRunDetail.errors.map((error) => (
                        <div key={error}>{error}</div>
                      ))}
                    </div>
                  </SubtleCard>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="min-h-[620px] overflow-hidden rounded-[22px] border border-[var(--line)] bg-[rgba(255,250,241,0.86)] p-0 shadow-[0_10px_30px_var(--shadow)]">
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
            style={{
              background:
                "radial-gradient(circle at 20% 20%, rgba(154, 52, 18, 0.08), transparent 18%), linear-gradient(180deg, rgba(255, 250, 241, 0.85), rgba(250, 245, 236, 0.95))",
            }}
          >
            <MiniMap zoomable pannable />
            <Controls />
            <Background gap={18} size={1} />
            <Panel position="top-left">
              <Badge>Edges represent execution flow and carry major state keys.</Badge>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="grid content-start gap-4 rounded-[22px] border border-dashed border-[rgba(154,52,18,0.25)] bg-[rgba(255,255,255,0.42)] p-[18px]">
          <h2 className="text-lg font-semibold">{t("editor.config")}</h2>

          {selectedNode ? (
            <div className="grid gap-3.5">
              <label className="grid gap-2 text-[0.94rem]">
                <span>{t("editor.node_name")}</span>
                <Input value={selectedNode.data.label} onChange={(event) => updateSelectedNodeLabel(event.target.value)} />
              </label>

              <label className="grid gap-2 text-[0.94rem]">
                <span>{t("editor.description")}</span>
                <Textarea rows={3} value={selectedNode.data.description} onChange={(event) => updateSelectedNodeDescription(event.target.value)} />
              </label>

              <div className="grid gap-2 text-[0.94rem]">
                <span>Inputs</span>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                  <Input placeholder="new_input_key" value={newReadKey} onChange={(event) => setNewReadKey(event.target.value)} />
                  <Button size="sm" onClick={() => handleQuickAddState(newReadKey, "read")}>+ Add</Button>
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
                  <Input placeholder="new_output_key" value={newWriteKey} onChange={(event) => setNewWriteKey(event.target.value)} />
                  <Button size="sm" onClick={() => handleQuickAddState(newWriteKey, "write")}>+ Add</Button>
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
                <Textarea
                  className="font-mono text-[0.88rem]"
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
                <Textarea
                  className="font-mono text-[0.88rem]"
                  rows={10}
                  value={configDraft}
                  onChange={(event) => updateSelectedNodeConfigDraft(event.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-2.5">
                <Badge>Type {selectedNode.data.kind}</Badge>
                <Badge>Reads {selectedNode.data.reads.length}</Badge>
                <Badge>Writes {selectedNode.data.writes.length}</Badge>
                <Badge>Status {selectedNode.data.status ?? "idle"}</Badge>
              </div>

              {selectedNodeExecution ? (
                <div className="grid gap-2.5">
                  <h3 className="font-semibold">{t("editor.latest_execution")}</h3>
                  <div className="grid gap-3">
                    <SubtleCard>
                      <strong>{selectedNodeExecution.status}</strong>
                      <div className="text-[var(--muted)]">{selectedNodeExecution.input_summary}</div>
                    </SubtleCard>
                    <SubtleCard>
                      <strong>Output</strong>
                      <div className="text-[var(--muted)]">{selectedNodeExecution.output_summary}</div>
                    </SubtleCard>
                    <div className="flex flex-wrap gap-2.5">
                      <Badge>{selectedNodeExecution.duration_ms}ms</Badge>
                    </div>
                    {selectedNodeDetail?.warnings?.length ? (
                      <SubtleCard>
                        <strong>Warnings</strong>
                        <div className="mt-1.5 grid gap-1 text-[var(--muted)]">
                          {selectedNodeDetail.warnings.map((warning) => (
                            <div key={warning}>{warning}</div>
                          ))}
                        </div>
                      </SubtleCard>
                    ) : null}
                    {selectedNodeDetail?.errors?.length ? (
                      <SubtleCard className="border-[rgba(159,18,57,0.28)]">
                        <strong>Errors</strong>
                        <div className="mt-1.5 grid gap-1 text-[var(--muted)]">
                          {selectedNodeDetail.errors.map((error) => (
                            <div key={error}>{error}</div>
                          ))}
                        </div>
                      </SubtleCard>
                    ) : null}
                    {selectedNodeDetail?.artifacts && Object.keys(selectedNodeDetail.artifacts).length > 0 ? (
                      <label className="grid gap-2 text-[0.94rem]">
                        <span>Artifacts</span>
                        <Textarea
                          className="font-mono text-[0.82rem]"
                          rows={8}
                          readOnly
                          value={JSON.stringify(selectedNodeDetail.artifacts, null, 2)}
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="grid gap-3.5">
              <div className="grid gap-2 text-[0.94rem]">
                <span>Edge Kind</span>
                <Select value={selectedEdge.data?.edgeKind ?? "normal"} onChange={(event) => updateSelectedEdgeKind(event.target.value as "normal" | "branch")}>
                  <option value="normal">normal</option>
                  <option value="branch">branch</option>
                </Select>
              </div>

              {(selectedEdge.data?.edgeKind ?? "normal") === "branch" ? (
                <div className="grid gap-2 text-[0.94rem]">
                  <span>Branch Label</span>
                  <Select value={selectedEdge.data?.branchLabel ?? ""} onChange={(event) => updateSelectedEdgeBranchLabel(event.target.value as "pass" | "revise" | "fail" | "")}>
                    <option value="">select branch</option>
                    <option value="pass">pass</option>
                    <option value="revise">revise</option>
                    <option value="fail">fail</option>
                  </Select>
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
