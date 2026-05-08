import { ref } from "vue";

import { buildAnchorModel } from "../anchors/anchorModel.ts";
import { resolveFlowAnchorOffset } from "./flowAnchorLayout.ts";
import type { MeasuredNodeSize } from "./canvasNodePresentationModel.ts";
import type { MeasuredAnchorOffset } from "./resolvedCanvasLayout.ts";
import type { GraphDocument, GraphPayload } from "../../types/node-system.ts";

export type CanvasNodeMeasurementsInput = {
  document: () => GraphPayload | GraphDocument;
  viewportScale: () => number;
};

export function useCanvasNodeMeasurements(input: CanvasNodeMeasurementsInput) {
  const measuredAnchorOffsets = ref<Record<string, MeasuredAnchorOffset>>({});
  const measuredNodeSizes = ref<Record<string, MeasuredNodeSize>>({});
  const nodeElementMap = new Map<string, HTMLElement>();
  const nodeResizeObserverMap = new Map<string, ResizeObserver>();
  const nodeMutationObserverMap = new Map<string, MutationObserver>();
  const pendingAnchorMeasurementNodeIds = new Set<string>();
  let scheduledAnchorMeasurementFrame: number | null = null;

  function registerNodeRef(nodeId: string, element: unknown) {
    if (isHTMLElement(element)) {
      nodeElementMap.set(nodeId, element);
      attachNodeMeasurementObservers(nodeId, element);
      scheduleAnchorMeasurement(nodeId);
      return;
    }
    nodeElementMap.delete(nodeId);
    detachNodeMeasurementObservers(nodeId);
    clearNodeAnchorOffsets(nodeId);
  }

  function attachNodeMeasurementObservers(nodeId: string, element: HTMLElement) {
    detachNodeMeasurementObservers(nodeId);

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        scheduleAnchorMeasurement(nodeId);
      });
      resizeObserver.observe(element);
      nodeResizeObserverMap.set(nodeId, resizeObserver);
    }

    if (typeof MutationObserver !== "undefined") {
      const mutationObserver = new MutationObserver(() => {
        scheduleAnchorMeasurement(nodeId);
      });
      mutationObserver.observe(element, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      nodeMutationObserverMap.set(nodeId, mutationObserver);
    }
  }

  function detachNodeMeasurementObservers(nodeId: string) {
    nodeResizeObserverMap.get(nodeId)?.disconnect();
    nodeResizeObserverMap.delete(nodeId);
    nodeMutationObserverMap.get(nodeId)?.disconnect();
    nodeMutationObserverMap.delete(nodeId);
  }

  function clearNodeAnchorOffsets(nodeId: string) {
    const nextAnchorOffsets = { ...measuredAnchorOffsets.value };
    let didChange = false;

    for (const anchorId of Object.keys(nextAnchorOffsets)) {
      if (!anchorId.startsWith(`${nodeId}:`)) {
        continue;
      }
      delete nextAnchorOffsets[anchorId];
      didChange = true;
    }

    if (didChange) {
      measuredAnchorOffsets.value = nextAnchorOffsets;
    }

    if (measuredNodeSizes.value[nodeId]) {
      const nextNodeSizes = { ...measuredNodeSizes.value };
      delete nextNodeSizes[nodeId];
      measuredNodeSizes.value = nextNodeSizes;
    }
  }

  function scheduleAnchorMeasurement(nodeId?: string) {
    if (nodeId) {
      pendingAnchorMeasurementNodeIds.add(nodeId);
    }

    if (scheduledAnchorMeasurementFrame !== null) {
      return;
    }

    if (typeof window === "undefined") {
      measureAnchorOffsets(pendingAnchorMeasurementNodeIds.size > 0 ? Array.from(pendingAnchorMeasurementNodeIds) : undefined);
      pendingAnchorMeasurementNodeIds.clear();
      return;
    }

    scheduledAnchorMeasurementFrame = window.requestAnimationFrame(() => {
      scheduledAnchorMeasurementFrame = null;
      measureAnchorOffsets(pendingAnchorMeasurementNodeIds.size > 0 ? Array.from(pendingAnchorMeasurementNodeIds) : undefined);
      pendingAnchorMeasurementNodeIds.clear();
    });
  }

  function measureAnchorOffsets(nodeIds?: string[]) {
    const nextAnchorOffsets = { ...measuredAnchorOffsets.value };
    const nextNodeSizes = { ...measuredNodeSizes.value };
    const measuredNodeIds = new Set(nodeIds ?? nodeElementMap.keys());
    let didChange = false;
    let didNodeSizeChange = false;

    for (const nodeId of measuredNodeIds) {
      for (const anchorId of Object.keys(nextAnchorOffsets)) {
        if (!anchorId.startsWith(`${nodeId}:`)) {
          continue;
        }
        delete nextAnchorOffsets[anchorId];
        didChange = true;
      }

      const nodeElement = nodeElementMap.get(nodeId);
      const node = input.document().nodes[nodeId];
      if (!nodeElement) {
        continue;
      }

      const nodeRect = nodeElement.getBoundingClientRect();
      const scale = input.viewportScale() || 1;
      const measuredNodeSize = {
        width: Math.round(nodeElement.offsetWidth),
        height: Math.round(nodeElement.offsetHeight),
      };
      const currentNodeSize = nextNodeSizes[nodeId];
      if (
        !currentNodeSize ||
        currentNodeSize.width !== measuredNodeSize.width ||
        currentNodeSize.height !== measuredNodeSize.height
      ) {
        nextNodeSizes[nodeId] = measuredNodeSize;
        didNodeSizeChange = true;
      }

      for (const slotElement of nodeElement.querySelectorAll("[data-anchor-slot-id]")) {
        if (!isHTMLElement(slotElement)) {
          continue;
        }

        const anchorId = slotElement.dataset.anchorSlotId;
        if (!anchorId) {
          continue;
        }

        const slotRect = slotElement.getBoundingClientRect();
        if (slotRect.width <= 0 || slotRect.height <= 0) {
          continue;
        }

        const measuredOffset = {
          offsetX: roundMeasuredOffset((slotRect.left + slotRect.width / 2 - nodeRect.left) / scale),
          offsetY: roundMeasuredOffset((slotRect.top + slotRect.height / 2 - nodeRect.top) / scale),
        };
        const currentOffset = nextAnchorOffsets[anchorId];
        if (
          !currentOffset ||
          currentOffset.offsetX !== measuredOffset.offsetX ||
          currentOffset.offsetY !== measuredOffset.offsetY
        ) {
          didChange = true;
        }
        nextAnchorOffsets[anchorId] = measuredOffset;
      }

      if (node) {
        const anchorModel = buildAnchorModel(nodeId, node);
        const flowAnchorsToMeasure = [anchorModel.flowIn, anchorModel.flowOut].filter(
          (anchor): anchor is NonNullable<typeof anchorModel.flowIn> => anchor !== null,
        );

        for (const flowAnchor of flowAnchorsToMeasure) {
          const measuredOffset = resolveFlowAnchorOffset({
            side: flowAnchor.side,
            width: nodeElement.offsetWidth,
            height: nodeElement.offsetHeight,
          });
          const anchorId = `${nodeId}:${flowAnchor.id}`;
          const currentOffset = nextAnchorOffsets[anchorId];
          if (
            !currentOffset ||
            currentOffset.offsetX !== measuredOffset.offsetX ||
            currentOffset.offsetY !== measuredOffset.offsetY
          ) {
            didChange = true;
          }
          nextAnchorOffsets[anchorId] = measuredOffset;
        }
      }
    }

    if (didChange || Object.keys(nextAnchorOffsets).length !== Object.keys(measuredAnchorOffsets.value).length) {
      measuredAnchorOffsets.value = nextAnchorOffsets;
    }
    if (didNodeSizeChange || Object.keys(nextNodeSizes).length !== Object.keys(measuredNodeSizes.value).length) {
      measuredNodeSizes.value = nextNodeSizes;
    }
  }

  function teardownNodeMeasurements() {
    for (const observer of nodeResizeObserverMap.values()) {
      observer.disconnect();
    }
    nodeResizeObserverMap.clear();

    for (const observer of nodeMutationObserverMap.values()) {
      observer.disconnect();
    }
    nodeMutationObserverMap.clear();

    if (scheduledAnchorMeasurementFrame !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(scheduledAnchorMeasurementFrame);
      scheduledAnchorMeasurementFrame = null;
    }
    pendingAnchorMeasurementNodeIds.clear();
  }

  return {
    measuredAnchorOffsets,
    measuredNodeSizes,
    nodeElementMap,
    registerNodeRef,
    scheduleAnchorMeasurement,
    measureAnchorOffsets,
    clearNodeAnchorOffsets,
    teardownNodeMeasurements,
  };
}

function roundMeasuredOffset(value: number) {
  return Math.round(value * 1000) / 1000;
}

function isHTMLElement(element: unknown): element is HTMLElement {
  return typeof HTMLElement !== "undefined" && element instanceof HTMLElement;
}
