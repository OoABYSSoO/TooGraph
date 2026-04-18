import { watch, type Ref } from "vue";

import { useSelection } from "./useSelection.ts";

export type NodeFocusRequest = {
  nodeId: string;
  sequence: number;
};

type UseNodeSelectionFocusOptions = {
  externalSelectedNodeId?: Ref<string | null | undefined>;
  externalFocusRequest?: Ref<NodeFocusRequest | null | undefined>;
  onSelectedNodeIdChange?: (nodeId: string | null) => void;
  onFocusNode?: (nodeId: string) => void;
};

export function useNodeSelectionFocus(options: UseNodeSelectionFocusOptions = {}) {
  const selection = useSelection({
    externalSelectedNodeId: options.externalSelectedNodeId,
    onSelectedNodeIdChange: options.onSelectedNodeIdChange,
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
