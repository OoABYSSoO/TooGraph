import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { fetchGraph, fetchGraphs, fetchTemplate, fetchTemplates } from "@/api/graphs";
import { createDraftFromTemplate, createEmptyDraftGraph } from "@/lib/graph-document";
import type { ActiveDocument, GraphDocument, GraphPayload, TemplateRecord } from "@/types/node-system";

export const useGraphDocumentStore = defineStore("graphDocument", () => {
  const templates = ref<TemplateRecord[]>([]);
  const graphs = ref<GraphDocument[]>([]);
  const activeTemplate = ref<TemplateRecord | null>(null);
  const activeGraph = ref<GraphDocument | null>(null);
  const activeDraft = ref<GraphPayload | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const hasTemplates = computed(() => templates.value.length > 0);
  const hasGraphs = computed(() => graphs.value.length > 0);
  const hasActiveDocument = computed(() => activeDraft.value !== null || activeGraph.value !== null);
  const activeDocument = computed<ActiveDocument | null>(() => {
    if (activeTemplate.value && activeDraft.value) {
      return {
        source: "template",
        template: activeTemplate.value,
        draft: activeDraft.value,
      };
    }
    if (activeGraph.value) {
      return {
        source: "graph",
        graph: activeGraph.value,
      };
    }
    return null;
  });
  const currentDocument = computed(() =>
    activeDraft.value ?? activeGraph.value,
  );

  async function loadTemplates() {
    isLoading.value = true;
    error.value = null;
    try {
      templates.value = await fetchTemplates();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load templates";
    } finally {
      isLoading.value = false;
    }
  }

  async function loadGraphs() {
    isLoading.value = true;
    error.value = null;
    try {
      graphs.value = await fetchGraphs();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load graphs";
    } finally {
      isLoading.value = false;
    }
  }

  async function loadGraph(graphId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      activeGraph.value = await fetchGraph(graphId);
      activeTemplate.value = null;
      activeDraft.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : `Failed to load graph ${graphId}`;
    } finally {
      isLoading.value = false;
    }
  }

  async function ensureTemplatesLoaded() {
    if (templates.value.length > 0) {
      return;
    }
    await loadTemplates();
  }

  async function ensureGraphsLoaded() {
    if (graphs.value.length > 0) {
      return;
    }
    await loadGraphs();
  }

  async function selectTemplate(templateId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      let template = templates.value.find((entry) => entry.template_id === templateId) ?? null;
      if (!template) {
        template = await fetchTemplate(templateId);
        templates.value = [...templates.value, template];
      }
      activeTemplate.value = template;
      activeDraft.value = createDraftFromTemplate(template);
      activeGraph.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : `Failed to load template ${templateId}`;
    } finally {
      isLoading.value = false;
    }
  }

  function clearActiveDocument() {
    activeTemplate.value = null;
    activeGraph.value = null;
    activeDraft.value = null;
    error.value = null;
  }

  function createBlankDraft(name = "Untitled Graph") {
    activeTemplate.value = null;
    activeGraph.value = null;
    activeDraft.value = createEmptyDraftGraph(name);
    error.value = null;
  }

  function updateNodePosition(nodeId: string, position: { x: number; y: number }) {
    if (activeDraft.value?.nodes[nodeId]) {
      activeDraft.value.nodes[nodeId].ui.position = position;
      return;
    }
    if (activeGraph.value?.nodes[nodeId]) {
      activeGraph.value.nodes[nodeId].ui.position = position;
    }
  }

  return {
    templates,
    graphs,
    activeTemplate,
    activeGraph,
    activeDraft,
    isLoading,
    error,
    hasTemplates,
    hasGraphs,
    hasActiveDocument,
    activeDocument,
    currentDocument,
    loadTemplates,
    loadGraphs,
    loadGraph,
    ensureTemplatesLoaded,
    ensureGraphsLoaded,
    selectTemplate,
    clearActiveDocument,
    createBlankDraft,
    updateNodePosition,
  };
});
