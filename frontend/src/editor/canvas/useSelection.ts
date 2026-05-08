import { computed, ref, watch, type Ref } from "vue";

export type SelectionChange = {
  focusedNodeId: string | null;
  nodeIds: string[];
};

type UseSelectionOptions = {
  externalSelectedNodeId?: Ref<string | null | undefined>;
  externalSelectedNodeIds?: Ref<string[] | readonly string[] | null | undefined>;
  onSelectedNodeIdChange?: (nodeId: string | null) => void;
  onSelectionChange?: (change: SelectionChange) => void;
};

export function useSelection(options: UseSelectionOptions = {}) {
  const initialSelection = resolveExternalSelection(options);
  const selectedNodeId = ref<string | null>(initialSelection.focusedNodeId);
  const selectedNodeIds = ref<string[]>(initialSelection.nodeIds);

  const hasSelection = computed(() => selectedNodeIds.value.length > 0);

  watch(
    () => resolveExternalSelection(options),
    (selection) => {
      selectedNodeId.value = selection.focusedNodeId;
      selectedNodeIds.value = selection.nodeIds;
    },
  );

  function selectNode(nodeId: string) {
    commitSelection([nodeId], nodeId);
  }

  function selectNodes(nodeIds: string[], focusedNodeId?: string | null) {
    commitSelection(nodeIds, focusedNodeId ?? nodeIds.at(-1) ?? null);
  }

  function toggleNode(nodeId: string) {
    const currentSelection = selectedNodeIds.value;
    if (currentSelection.includes(nodeId)) {
      const nextSelection = currentSelection.filter((selectedId) => selectedId !== nodeId);
      const nextFocus = selectedNodeId.value === nodeId ? nextSelection[0] ?? null : selectedNodeId.value;
      commitSelection(nextSelection, nextFocus);
      return;
    }
    commitSelection([...currentSelection, nodeId], nodeId);
  }

  function clearSelection() {
    commitSelection([], null);
  }

  function isNodeSelected(nodeId: string) {
    return selectedNodeIds.value.includes(nodeId);
  }

  function commitSelection(nodeIds: string[], focusedNodeId: string | null) {
    const nextNodeIds = normalizeSelectionNodeIds(nodeIds);
    const nextFocusedNodeId = focusedNodeId && nextNodeIds.includes(focusedNodeId) ? focusedNodeId : nextNodeIds[0] ?? null;
    const focusedNodeChanged = selectedNodeId.value !== nextFocusedNodeId;
    const selectedNodesChanged = !areSelectionNodeIdsEqual(selectedNodeIds.value, nextNodeIds);
    if (!focusedNodeChanged && !selectedNodesChanged) {
      return;
    }

    selectedNodeId.value = nextFocusedNodeId;
    selectedNodeIds.value = nextNodeIds;
    if (focusedNodeChanged) {
      options.onSelectedNodeIdChange?.(nextFocusedNodeId);
    }
    options.onSelectionChange?.({
      focusedNodeId: nextFocusedNodeId,
      nodeIds: [...nextNodeIds],
    });
  }

  return {
    selectedNodeId,
    selectedNodeIds,
    hasSelection,
    selectNode,
    selectNodes,
    toggleNode,
    clearSelection,
    isNodeSelected,
  };
}

function resolveExternalSelection(options: UseSelectionOptions): SelectionChange {
  const externalNodeIds = normalizeSelectionNodeIds(options.externalSelectedNodeIds?.value ?? []);
  const fallbackFocusedNodeId = options.externalSelectedNodeId?.value ?? null;
  const nodeIds = externalNodeIds.length > 0
    ? externalNodeIds
    : fallbackFocusedNodeId
      ? [fallbackFocusedNodeId]
      : [];
  const focusedNodeId = fallbackFocusedNodeId && nodeIds.includes(fallbackFocusedNodeId) ? fallbackFocusedNodeId : nodeIds[0] ?? null;
  return { focusedNodeId, nodeIds };
}

function normalizeSelectionNodeIds(nodeIds: readonly string[]) {
  const normalized: string[] = [];
  for (const nodeId of nodeIds) {
    const compactNodeId = nodeId.trim();
    if (compactNodeId && !normalized.includes(compactNodeId)) {
      normalized.push(compactNodeId);
    }
  }
  return normalized;
}

function areSelectionNodeIdsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((nodeId, index) => nodeId === right[index]);
}
