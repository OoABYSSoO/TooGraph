import { computed, ref } from "vue";
import { defineStore } from "pinia";

export const useEditorWorkspaceStore = defineStore("editorWorkspace", () => {
  const activeRoute = ref<"templates" | "graphs">("templates");
  const activeTemplateId = ref<string | null>(null);
  const activeGraphId = ref<string | null>(null);

  const hasActiveTemplate = computed(() => activeTemplateId.value !== null);
  const hasActiveGraph = computed(() => activeGraphId.value !== null);

  function showTemplates(templateId: string | null = null) {
    activeRoute.value = "templates";
    activeTemplateId.value = templateId;
    activeGraphId.value = null;
  }

  function showGraphs(graphId: string | null = null) {
    activeRoute.value = "graphs";
    activeGraphId.value = graphId;
    activeTemplateId.value = null;
  }

  function openTemplate(templateId: string) {
    showTemplates(templateId);
  }

  function clearSelection() {
    activeTemplateId.value = null;
    activeGraphId.value = null;
  }

  function openGraph(graphId: string) {
    showGraphs(graphId);
  }

  return {
    activeRoute,
    activeTemplateId,
    activeGraphId,
    hasActiveTemplate,
    hasActiveGraph,
    showTemplates,
    showGraphs,
    openTemplate,
    openGraph,
    clearSelection,
  };
});
