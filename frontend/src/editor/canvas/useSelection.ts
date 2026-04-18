import { computed, ref, watch, type Ref } from "vue";

type UseSelectionOptions = {
  externalSelectedNodeId?: Ref<string | null | undefined>;
  onSelectedNodeIdChange?: (nodeId: string | null) => void;
};

export function useSelection(options: UseSelectionOptions = {}) {
  const selectedNodeId = ref<string | null>(options.externalSelectedNodeId?.value ?? null);

  const hasSelection = computed(() => selectedNodeId.value !== null);

  watch(
    () => options.externalSelectedNodeId?.value ?? null,
    (nodeId) => {
      selectedNodeId.value = nodeId;
    },
  );

  function selectNode(nodeId: string) {
    if (selectedNodeId.value === nodeId) {
      return;
    }
    selectedNodeId.value = nodeId;
    options.onSelectedNodeIdChange?.(nodeId);
  }

  function clearSelection() {
    if (selectedNodeId.value === null) {
      return;
    }
    selectedNodeId.value = null;
    options.onSelectedNodeIdChange?.(null);
  }

  return {
    selectedNodeId,
    hasSelection,
    selectNode,
    clearSelection,
  };
}
