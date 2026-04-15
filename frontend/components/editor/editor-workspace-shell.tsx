"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { EditorCloseConfirmDialog } from "@/components/editor/editor-close-confirm-dialog";
import { EditorTabBar } from "@/components/editor/editor-tab-bar";
import { EditorWelcomeState } from "@/components/editor/editor-welcome-state";
import {
  NodeSystemEditor,
  type NodeSystemEditorDocumentMeta,
  type NodeSystemEditorGraphSavedPayload,
  type NodeSystemEditorSaveAction,
} from "@/components/editor/node-system-editor";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  applyDocumentMetaToWorkspaceTab,
  closeWorkspaceTab,
  createUnsavedWorkspaceTab,
  ensureSavedGraphTab,
  readPersistedEditorWorkspace,
  resolveEditorUrl,
  writePersistedEditorWorkspace,
  type EditorWorkspaceTab,
  type PersistedEditorWorkspace,
} from "@/lib/editor-workspace";
import type { CanonicalGraphPayload, CanonicalTemplateRecord } from "@/lib/node-system-canonical";
import type { GraphSummary } from "@/lib/types";

type EditorWorkspaceShellProps = {
  routeMode: "root" | "new" | "existing";
  routeGraph?: CanonicalGraphPayload | null;
  routeGraphId?: string;
  templates: CanonicalTemplateRecord[];
  graphs: GraphSummary[];
  defaultTemplateId?: string | null;
};

function createEmptyWorkspace(): PersistedEditorWorkspace {
  return {
    activeTabId: null,
    tabs: [],
  };
}

export function EditorWorkspaceShell({
  routeMode,
  routeGraph,
  routeGraphId,
  templates,
  graphs,
  defaultTemplateId,
}: EditorWorkspaceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<PersistedEditorWorkspace>(createEmptyWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [documentsByTabId, setDocumentsByTabId] = useState<Record<string, CanonicalGraphPayload>>({});
  const [loadingByTabId, setLoadingByTabId] = useState<Record<string, boolean>>({});
  const [errorByTabId, setErrorByTabId] = useState<Record<string, string | null>>({});
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const handledRouteSignatureRef = useRef<string | null>(null);
  const saveActionsRef = useRef<Record<string, NodeSystemEditorSaveAction | null>>({});

  const templateById = useMemo(() => new Map(templates.map((template) => [template.template_id, template])), [templates]);
  const graphById = useMemo(() => new Map(graphs.map((graph) => [graph.graph_id, graph])), [graphs]);
  const activeTab = useMemo(
    () => workspace.tabs.find((tab) => tab.tabId === workspace.activeTabId) ?? null,
    [workspace.activeTabId, workspace.tabs],
  );
  const routeSignature = useMemo(() => {
    if (routeMode === "existing") {
      return `existing:${routeGraphId ?? ""}`;
    }
    if (routeMode === "new") {
      return `new:${defaultTemplateId ?? ""}`;
    }
    return "root";
  }, [defaultTemplateId, routeGraphId, routeMode]);

  const syncRouteToTab = useCallback(
    (graphId: string | null, mode: "push" | "replace" = "push") => {
      const targetUrl = resolveEditorUrl(graphId);
      if (pathname === targetUrl) {
        return;
      }
      if (mode === "replace") {
        router.replace(targetUrl);
        return;
      }
      router.push(targetUrl);
    },
    [pathname, router],
  );

  const updateWorkspaceTab = useCallback((tabId: string, updater: (tab: EditorWorkspaceTab) => EditorWorkspaceTab) => {
    setWorkspace((current) => {
      let changed = false;
      const tabs = current.tabs.map((tab) => {
        if (tab.tabId !== tabId) {
          return tab;
        }
        const nextTab = updater(tab);
        if (nextTab !== tab) {
          changed = true;
        }
        return nextTab;
      });

      return changed
        ? {
            ...current,
            tabs,
          }
        : current;
    });
  }, []);

  const registerDocumentForTab = useCallback((tabId: string, graph: CanonicalGraphPayload) => {
    setDocumentsByTabId((current) => ({
      ...current,
      [tabId]: graph,
    }));
    setLoadingByTabId((current) => ({
      ...current,
      [tabId]: false,
    }));
    setErrorByTabId((current) => ({
      ...current,
      [tabId]: null,
    }));
  }, []);

  const openNewTab = useCallback(
    (templateId?: string | null, navigation: "push" | "replace" | "none" = "push") => {
      const template = templateId ? templateById.get(templateId) ?? null : null;
      const tab = createUnsavedWorkspaceTab({
        kind: template ? "template" : "new",
        title: template?.label ?? "Untitled Graph",
        templateId: template?.template_id ?? null,
        defaultTemplateId: template?.template_id ?? null,
      });

      setWorkspace((current) => ({
        activeTabId: tab.tabId,
        tabs: [...current.tabs, tab],
      }));

      if (navigation !== "none") {
        syncRouteToTab(null, navigation === "replace" ? "replace" : "push");
      }
      handledRouteSignatureRef.current = templateId ? `new:${templateId}` : "new:";
    },
    [syncRouteToTab, templateById],
  );

  const openExistingGraph = useCallback(
    (
      graphId: string,
      title: string,
      prefetchedGraph?: CanonicalGraphPayload | null,
      navigation: "push" | "replace" | "none" = "push",
    ) => {
      let nextActiveTabId: string | null = null;
      setWorkspace((current) => {
        const next = ensureSavedGraphTab(current, { graphId, title });
        nextActiveTabId = next.activeTabId;
        return next;
      });

      if (prefetchedGraph && nextActiveTabId) {
        registerDocumentForTab(nextActiveTabId, prefetchedGraph);
      }

      if (navigation !== "none") {
        syncRouteToTab(graphId, navigation === "replace" ? "replace" : "push");
      }
      handledRouteSignatureRef.current = `existing:${graphId}`;
    },
    [registerDocumentForTab, syncRouteToTab],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      const tab = workspace.tabs.find((item) => item.tabId === tabId);
      if (!tab) {
        return;
      }
      setWorkspace((current) => ({
        ...current,
        activeTabId: tabId,
      }));
      syncRouteToTab(tab.graphId);
    },
    [syncRouteToTab, workspace.tabs],
  );

  const finalizeTabClose = useCallback(
    (tabId: string) => {
      let closedActive = false;
      let nextGraphId: string | null = null;
      setWorkspace((current) => {
        closedActive = current.activeTabId === tabId;
        const next = closeWorkspaceTab(current, tabId);
        nextGraphId = next.tabs.find((tab) => tab.tabId === next.activeTabId)?.graphId ?? null;
        return next;
      });

      setDocumentsByTabId((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setLoadingByTabId((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setErrorByTabId((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      delete saveActionsRef.current[tabId];

      if (closedActive) {
        syncRouteToTab(nextGraphId);
      }
    },
    [syncRouteToTab],
  );

  const requestCloseTab = useCallback(
    (tabId: string) => {
      const tab = workspace.tabs.find((item) => item.tabId === tabId);
      if (!tab) {
        return;
      }

      if (!tab.dirty) {
        finalizeTabClose(tabId);
        return;
      }

      setPendingCloseTabId(tabId);
      setCloseError(null);
    },
    [finalizeTabClose, workspace.tabs],
  );

  const handleDocumentMetaChange = useCallback((tabId: string, meta: NodeSystemEditorDocumentMeta) => {
    setWorkspace((current) => applyDocumentMetaToWorkspaceTab(current, tabId, meta));
  }, []);

  const handleGraphSaved = useCallback(
    (tabId: string, payload: NodeSystemEditorGraphSavedPayload) => {
      updateWorkspaceTab(tabId, (tab) => ({
        ...tab,
        kind: "existing",
        graphId: payload.graphId,
        title: payload.title.trim() || tab.title,
        dirty: false,
        templateId: null,
      }));
      if (workspace.activeTabId === tabId) {
        syncRouteToTab(payload.graphId, "replace");
      }
    },
    [syncRouteToTab, updateWorkspaceTab, workspace.activeTabId],
  );

  useEffect(() => {
    setWorkspace(readPersistedEditorWorkspace());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    writePersistedEditorWorkspace(workspace);
  }, [hydrated, workspace]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (routeMode === "new") {
      if (handledRouteSignatureRef.current === routeSignature) {
        return;
      }
      openNewTab(defaultTemplateId ?? null, "replace");
      return;
    }

    if (routeMode === "existing" && routeGraphId) {
      if (handledRouteSignatureRef.current === routeSignature) {
        return;
      }
      openExistingGraph(routeGraphId, routeGraph?.name ?? graphById.get(routeGraphId)?.name ?? routeGraphId, routeGraph, "none");
      return;
    }

    handledRouteSignatureRef.current = routeSignature;
  }, [defaultTemplateId, graphById, hydrated, openExistingGraph, openNewTab, routeGraph, routeGraphId, routeMode, routeSignature]);

  useEffect(() => {
    if (!hydrated || routeMode !== "root" || !activeTab) {
      return;
    }
    syncRouteToTab(activeTab.graphId, "replace");
  }, [activeTab, hydrated, routeMode, syncRouteToTab]);

  useEffect(() => {
    if (!activeTab?.graphId) {
      return;
    }
    if (documentsByTabId[activeTab.tabId] || loadingByTabId[activeTab.tabId]) {
      return;
    }

    let cancelled = false;
    setLoadingByTabId((current) => ({
      ...current,
      [activeTab.tabId]: true,
    }));
    setErrorByTabId((current) => ({
      ...current,
      [activeTab.tabId]: null,
    }));

    void apiGet<CanonicalGraphPayload>(`/api/graphs/${activeTab.graphId}`)
      .then((graph) => {
        if (cancelled) {
          return;
        }
        registerDocumentForTab(activeTab.tabId, graph);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadingByTabId((current) => ({
          ...current,
          [activeTab.tabId]: false,
        }));
        setErrorByTabId((current) => ({
          ...current,
          [activeTab.tabId]: error instanceof Error ? error.message : "Failed to load graph.",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, documentsByTabId, loadingByTabId, registerDocumentForTab]);

  const pendingCloseTab = pendingCloseTabId ? workspace.tabs.find((tab) => tab.tabId === pendingCloseTabId) ?? null : null;

  if (!hydrated && routeMode === "root") {
    return (
      <div className="relative flex h-screen flex-col overflow-hidden">
        <EditorWelcomeState
          templates={templates}
          graphs={graphs}
          onCreateNew={() => openNewTab(null)}
          onCreateFromTemplate={(templateId) => openNewTab(templateId)}
          onOpenGraph={(graphId) => openExistingGraph(graphId, graphById.get(graphId)?.name ?? graphId)}
        />
      </div>
    );
  }

  if (!hydrated) {
    return <div className="flex h-screen items-center justify-center text-sm text-[var(--muted)]">Loading editor workspace...</div>;
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      {workspace.tabs.length === 0 ? (
        <EditorWelcomeState
          templates={templates}
          graphs={graphs}
          onCreateNew={() => openNewTab(null)}
          onCreateFromTemplate={(templateId) => openNewTab(templateId)}
          onOpenGraph={(graphId) => openExistingGraph(graphId, graphById.get(graphId)?.name ?? graphId)}
        />
      ) : (
        <>
          <EditorTabBar
            tabs={workspace.tabs}
            activeTabId={workspace.activeTabId}
            templates={templates}
            graphs={graphs}
            onActivateTab={activateTab}
            onCloseTab={requestCloseTab}
            onCreateNew={() => openNewTab(null)}
            onCreateFromTemplate={(templateId) => openNewTab(templateId)}
            onOpenGraph={(graphId) => openExistingGraph(graphId, graphById.get(graphId)?.name ?? graphId)}
          />
          <div className="relative min-h-0 flex-1">
            {workspace.tabs.map((tab) => {
              const isActive = tab.tabId === workspace.activeTabId;
              const loadedGraph = documentsByTabId[tab.tabId];
              const isLoading = loadingByTabId[tab.tabId] ?? false;
              const loadError = errorByTabId[tab.tabId] ?? null;
              const hasLiveEditor = Boolean(saveActionsRef.current[tab.tabId]);
              const requiresExistingGraph = Boolean(tab.graphId) && !loadedGraph && tab.kind === "existing" && !hasLiveEditor;

              return (
                <div
                  key={tab.tabId}
                  className={cn(
                    "absolute inset-0",
                    isActive ? "visible opacity-100" : "invisible pointer-events-none opacity-0",
                  )}
                >
                  {requiresExistingGraph ? (
                    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(154,52,18,0.1),transparent_22%),linear-gradient(180deg,#f5efe2_0%,#ede4d2_100%)] px-6">
                      <div className="w-full max-w-xl rounded-[28px] border border-[rgba(154,52,18,0.14)] bg-[rgba(255,250,241,0.92)] p-6 text-center shadow-[0_20px_60px_var(--shadow)]">
                        <div className="text-sm uppercase tracking-[0.12em] text-[var(--accent-strong)]">Graph</div>
                        <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">{tab.title}</h2>
                        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                          {isLoading ? "Loading saved graph..." : loadError ?? "Saved graph is not available right now."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <NodeSystemEditor
                      documentKey={tab.tabId}
                      mode={tab.graphId ? "existing" : "new"}
                      initialGraph={loadedGraph}
                      graphId={tab.graphId ?? undefined}
                      templates={templates}
                      defaultTemplateId={tab.defaultTemplateId ?? tab.templateId ?? undefined}
                      onDocumentMetaChange={(meta) => handleDocumentMetaChange(tab.tabId, meta)}
                      onGraphSaved={(payload) => handleGraphSaved(tab.tabId, payload)}
                      onSaveActionReady={(action) => {
                        saveActionsRef.current[tab.tabId] = action;
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <EditorCloseConfirmDialog
        tab={pendingCloseTab}
        busy={closeBusy}
        error={closeError}
        onCancel={() => {
          if (closeBusy) {
            return;
          }
          setPendingCloseTabId(null);
          setCloseError(null);
        }}
        onDiscard={() => {
          if (!pendingCloseTabId || closeBusy) {
            return;
          }
          finalizeTabClose(pendingCloseTabId);
          setPendingCloseTabId(null);
          setCloseError(null);
        }}
        onSaveAndClose={() => {
          if (!pendingCloseTabId || closeBusy) {
            return;
          }

          const action = saveActionsRef.current[pendingCloseTabId];
          if (!action) {
            setCloseError("当前标签页还没有可用的保存动作。");
            return;
          }

          setCloseBusy(true);
          setCloseError(null);

          void action()
            .then((success) => {
              if (!success) {
                setCloseError("保存失败，标签页已保留。");
                return;
              }
              finalizeTabClose(pendingCloseTabId);
              setPendingCloseTabId(null);
              setCloseError(null);
            })
            .finally(() => {
              setCloseBusy(false);
            });
        }}
      />
    </div>
  );
}
