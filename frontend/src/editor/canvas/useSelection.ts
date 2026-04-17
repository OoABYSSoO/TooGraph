import { computed, ref } from "vue";

export function useSelection() {
  const selectedNodeId = ref<string | null>(null);

  const hasSelection = computed(() => selectedNodeId.value !== null);

  function selectNode(nodeId: string) {
    selectedNodeId.value = nodeId;
  }

  function clearSelection() {
    selectedNodeId.value = null;
  }

  return {
    selectedNodeId,
    hasSelection,
    selectNode,
    clearSelection,
  };
}
