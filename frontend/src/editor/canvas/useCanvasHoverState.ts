import { ref } from "vue";

export const NODE_HOVER_RELEASE_DELAY_MS = 2000;

type TimerScheduler = {
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timeoutId: number) => void;
};

type CanvasHoverStateInput = {
  scheduleAnchorMeasurement: (nodeId: string) => void;
  timerScheduler?: TimerScheduler;
};

function resolveDefaultTimerScheduler(): TimerScheduler | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return {
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timeoutId) => window.clearTimeout(timeoutId),
  };
}

export function useCanvasHoverState(input: CanvasHoverStateInput) {
  const timerScheduler = input.timerScheduler ?? resolveDefaultTimerScheduler();
  const hoveredNodeId = ref<string | null>(null);
  const hoveredNodeReleaseTimeoutRef = ref<number | null>(null);
  const hoveredPointAnchorNodeId = ref<string | null>(null);
  const hoveredFlowHandleNodeId = ref<string | null>(null);

  function clearScheduledHoveredNodeRelease() {
    if (hoveredNodeReleaseTimeoutRef.value !== null) {
      timerScheduler?.clearTimeout(hoveredNodeReleaseTimeoutRef.value);
    }
    hoveredNodeReleaseTimeoutRef.value = null;
  }

  function setHoveredNode(nodeId: string) {
    clearScheduledHoveredNodeRelease();
    hoveredNodeId.value = nodeId;
    input.scheduleAnchorMeasurement(nodeId);
  }

  function clearHoveredNode(nodeId: string) {
    if (hoveredNodeId.value !== nodeId) {
      return;
    }

    clearScheduledHoveredNodeRelease();
    if (!timerScheduler) {
      hoveredNodeId.value = null;
      input.scheduleAnchorMeasurement(nodeId);
      return;
    }

    hoveredNodeReleaseTimeoutRef.value = timerScheduler.setTimeout(() => {
      hoveredNodeReleaseTimeoutRef.value = null;
      if (hoveredNodeId.value === nodeId) {
        hoveredNodeId.value = null;
        input.scheduleAnchorMeasurement(nodeId);
      }
    }, NODE_HOVER_RELEASE_DELAY_MS);
  }

  function setHoveredPointAnchorNode(nodeId: string) {
    hoveredPointAnchorNodeId.value = nodeId;
    input.scheduleAnchorMeasurement(nodeId);
  }

  function clearHoveredPointAnchorNode(nodeId: string) {
    if (hoveredPointAnchorNodeId.value === nodeId) {
      hoveredPointAnchorNodeId.value = null;
      input.scheduleAnchorMeasurement(nodeId);
    }
  }

  function setHoveredFlowHandleNode(nodeId: string) {
    hoveredFlowHandleNodeId.value = nodeId;
  }

  function clearHoveredFlowHandleNode(nodeId: string) {
    if (hoveredFlowHandleNodeId.value === nodeId) {
      hoveredFlowHandleNodeId.value = null;
    }
  }

  return {
    clearHoveredFlowHandleNode,
    clearHoveredNode,
    clearHoveredPointAnchorNode,
    clearScheduledHoveredNodeRelease,
    hoveredFlowHandleNodeId,
    hoveredNodeId,
    hoveredPointAnchorNodeId,
    setHoveredFlowHandleNode,
    setHoveredNode,
    setHoveredPointAnchorNode,
  };
}
