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
      <svg class="editor-canvas__edges" viewBox="0 0 4000 3000" preserveAspectRatio="none" aria-hidden="true">
        <path
          v-for="edge in projectedEdges"
          :key="edge.id"
          :d="edge.path"
          class="editor-canvas__edge"
          :class="{
            'editor-canvas__edge--route': edge.kind === 'route',
          }"
        />
        <circle
          v-for="anchor in projectedAnchors"
          :key="anchor.id"
          :cx="anchor.x"
          :cy="anchor.y"
          class="editor-canvas__anchor"
          :class="{
            'editor-canvas__anchor--state': anchor.kind === 'state-in' || anchor.kind === 'state-out',
            'editor-canvas__anchor--route': anchor.kind === 'route-out',
          }"
          r="5.5"
        />
      </svg>
      <div
        v-for="[nodeId, node] in nodeEntries"
        :key="nodeId"
        class="editor-canvas__node"
        :style="nodeStyle(node.ui.position)"
        @pointerdown.stop="handleNodePointerDown(nodeId, $event)"
      >
        <NodeCard
          :node-id="nodeId"
          :node="node"
          :state-schema="document.state_schema"
          :selected="selection.selectedNodeId.value === nodeId"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import NodeCard from "@/editor/nodes/NodeCard.vue";
import { projectCanvasAnchors, projectCanvasEdges } from "@/editor/canvas/edgeProjection";
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
const projectedEdges = computed(() => projectCanvasEdges(props.document));
const projectedAnchors = computed(() => projectCanvasAnchors(props.document));
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
  height: 100%;
  min-height: 0;
  background:
    radial-gradient(circle at 1px 1px, rgba(217, 119, 6, 0.16) 1px, transparent 0) 0 0 / 28px 28px,
    linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  cursor: grab;
}

.editor-canvas__viewport {
  position: absolute;
  inset: 0;
  transform-origin: top left;
}

.editor-canvas__edges {
  position: absolute;
  inset: 0;
  width: 4000px;
  height: 3000px;
  overflow: visible;
  pointer-events: none;
}

.editor-canvas__edge {
  fill: none;
  stroke: rgba(217, 119, 6, 0.88);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.editor-canvas__edge--route {
  stroke-dasharray: 10 8;
}

.editor-canvas__anchor {
  fill: rgba(154, 52, 18, 0.92);
  stroke: rgba(255, 250, 241, 0.96);
  stroke-width: 2;
}

.editor-canvas__anchor--state {
  fill: rgba(217, 119, 6, 0.92);
}

.editor-canvas__anchor--route {
  fill: rgba(124, 58, 237, 0.92);
}

.editor-canvas__node {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
