import { watch, type Ref } from "vue";

import { useSelection, type SelectionChange } from "./useSelection.ts";

export type NodeFocusRequest = {
  nodeId: string;
  sequence: number;
};

type UseNodeSelectionFocusOptions = {
  externalSelectedNodeId?: Ref<string | null | undefined>;
  externalSelectedNodeIds?: Ref<string[] | readonly string[] | null | undefined>;
  externalFocusRequest?: Ref<NodeFocusRequest | null | undefined>;
  onSelectedNodeIdChange?: (nodeId: string | null) => void;
  onSelectionChange?: (change: SelectionChange) => void;
  onFocusNode?: (nodeId: string) => void;
};

export function useNodeSelectionFocus(options: UseNodeSelectionFocusOptions = {}) {
  const selection = useSelection({
    externalSelectedNodeId: options.externalSelectedNodeId,
    externalSelectedNodeIds: options.externalSelectedNodeIds,
    onSelectedNodeIdChange: options.onSelectedNodeIdChange,
    onSelectionChange: options.onSelectionChange,
  });

  watch(
    () => options.externalFocusRequest?.value?.sequence ?? null,
    () => {
      const request = options.externalFocusRequest?.value;
      if (!request) {
        return;
      }
      selection.selectNode(request.nodeId);
      options.onFocusNode?.(request.nodeId);
    },
  );

  return selection;
}
