<template>
  <section
    ref="canvasRef"
    class="editor-canvas"
    @pointerdown="handleCanvasPointerDown"
    @pointermove="handleCanvasPointerMove"
    @pointerup="handleCanvasPointerUp"
    @pointerleave="handleCanvasPointerUp"
    @wheel.prevent="handleWheel"
  >
    <div class="editor-canvas__viewport" :style="viewportStyle">
      <div
        v-for="[nodeId, node] in nodeEntries"
        :key="nodeId"
        class="editor-canvas__node"
        :style="nodeStyle(node.ui.position)"
        @pointerdown.stop="handleNodePointerDown(nodeId, $event)"
      >
        <NodeCard :node-id="nodeId" :node="node" :selected="selection.selectedNodeId.value === nodeId" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import NodeCard from "@/editor/nodes/NodeCard.vue";
import { useSelection } from "./useSelection";
import { useViewport } from "./useViewport";
import type { GraphDocument, GraphPayload, GraphPosition } from "@/types/node-system";

const props = defineProps<{
  document: GraphPayload | GraphDocument;
}>();

const emit = defineEmits<{
  (event: "update:node-position", payload: { nodeId: string; position: GraphPosition }): void;
}>();

const canvasRef = ref<HTMLElement | null>(null);
const viewport = useViewport();
const selection = useSelection();
const nodeDrag = ref<{
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
} | null>(null);

const nodeEntries = computed(() => Object.entries(props.document.nodes));
const viewportStyle = computed(() => ({
  transform: `translate(${viewport.viewport.x}px, ${viewport.viewport.y}px) scale(${viewport.viewport.scale})`,
}));

function nodeStyle(position: GraphPosition) {
  return {
    transform: `translate(${position.x}px, ${position.y}px)`,
  };
}

function handleCanvasPointerDown(event: PointerEvent) {
  selection.clearSelection();
  viewport.beginPan(event);
}

function handleCanvasPointerMove(event: PointerEvent) {
  if (nodeDrag.value && nodeDrag.value.pointerId === event.pointerId) {
    const deltaX = (event.clientX - nodeDrag.value.startClientX) / viewport.viewport.scale;
    const deltaY = (event.clientY - nodeDrag.value.startClientY) / viewport.viewport.scale;
    emit("update:node-position", {
      nodeId: nodeDrag.value.nodeId,
      position: {
        x: Math.round(nodeDrag.value.originX + deltaX),
        y: Math.round(nodeDrag.value.originY + deltaY),
      },
    });
    return;
  }
  viewport.movePan(event);
}

function handleCanvasPointerUp(event: PointerEvent) {
  if (nodeDrag.value && nodeDrag.value.pointerId === event.pointerId) {
    nodeDrag.value = null;
  }
  viewport.endPan(event);
}

function handleNodePointerDown(nodeId: string, event: PointerEvent) {
  const node = props.document.nodes[nodeId];
  if (!node) {
    return;
  }
  selection.selectNode(nodeId);
  nodeDrag.value = {
    nodeId,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originX: node.ui.position.x,
    originY: node.ui.position.y,
  };
}

function handleWheel(event: WheelEvent) {
  viewport.zoomBy(event.deltaY);
}
</script>

<style scoped>
.editor-canvas {
  position: relative;
  overflow: hidden;
  min-height: 720px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 26px;
  background:
    radial-gradient(circle at 1px 1px, rgba(217, 119, 6, 0.16) 1px, transparent 0) 0 0 / 28px 28px,
    linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
  cursor: grab;
}

.editor-canvas__viewport {
  position: absolute;
  inset: 0;
  transform-origin: top left;
}

.editor-canvas__node {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
