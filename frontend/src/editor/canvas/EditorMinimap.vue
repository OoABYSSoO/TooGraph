<template>
  <aside
    v-if="minimapModel"
    ref="containerRef"
    class="editor-minimap"
    :class="{ 'editor-minimap--dragging': isDragging }"
    :aria-label="t('editor.minimap')"
    @dblclick.stop
    @pointerdown.stop.prevent="handlePointerDown"
    @pointermove.stop.prevent="handlePointerMove"
    @pointerup.stop.prevent="handlePointerUp"
    @pointercancel.stop.prevent="handlePointerUp"
  >
    <svg class="editor-minimap__surface" :viewBox="`0 0 ${minimapModel.width} ${minimapModel.height}`" role="img">
      <path
        v-for="edge in minimapModel.edges"
        :key="edge.id"
        :d="edge.path"
        :transform="edge.transform"
        class="editor-minimap__edge"
        :class="{
          'editor-minimap__edge--flow': edge.kind === 'flow',
          'editor-minimap__edge--route': edge.kind === 'route',
          'editor-minimap__edge--data': edge.kind === 'data',
        }"
        :style="edge.color ? { '--editor-minimap-edge': edge.color } : undefined"
      />
      <rect
        v-for="node in minimapModel.nodes"
        :key="node.id"
        :x="node.x"
        :y="node.y"
        :width="Math.max(node.width, 3)"
        :height="Math.max(node.height, 3)"
        rx="3.5"
        class="editor-minimap__node"
        :class="{
          'editor-minimap__node--input': node.kind === 'input',
          'editor-minimap__node--agent': node.kind === 'agent',
          'editor-minimap__node--condition': node.kind === 'condition',
          'editor-minimap__node--output': node.kind === 'output',
          'editor-minimap__node--selected': node.selected,
          'editor-minimap__node--running': node.runState === 'running',
          'editor-minimap__node--failed': node.runState === 'failed',
          'editor-minimap__node--success': node.runState === 'success',
        }"
      />
      <rect
        :x="minimapModel.viewportRect.x"
        :y="minimapModel.viewportRect.y"
        :width="Math.max(minimapModel.viewportRect.width, 10)"
        :height="Math.max(minimapModel.viewportRect.height, 8)"
        rx="5"
        class="editor-minimap__viewport"
      />
    </svg>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import {
  buildEditorMinimapModel,
  mapMinimapPointToWorld,
  type EditorMinimapEdgeInput,
  type EditorMinimapNodeInput,
  type EditorMinimapSize,
  type EditorMinimapViewport,
} from "./minimapModel";

const props = withDefaults(
  defineProps<{
    nodes: EditorMinimapNodeInput[];
    edges: EditorMinimapEdgeInput[];
    viewport: EditorMinimapViewport;
    canvasSize: EditorMinimapSize;
    width?: number;
    height?: number;
  }>(),
  {
    width: 224,
    height: 160,
  },
);

const emit = defineEmits<{
  (event: "center-view", payload: { worldX: number; worldY: number }): void;
}>();

const { t } = useI18n();
const containerRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);

const minimapModel = computed(() =>
  buildEditorMinimapModel({
    width: props.width,
    height: props.height,
    canvasSize: props.canvasSize,
    viewport: props.viewport,
    nodes: props.nodes,
    edges: props.edges,
  }),
);

function handlePointerDown(event: PointerEvent) {
  isDragging.value = true;
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  emitWorldPointFromEvent(event);
}

function handlePointerMove(event: PointerEvent) {
  if (!isDragging.value) {
    return;
  }
  emitWorldPointFromEvent(event);
}

function handlePointerUp(event: PointerEvent) {
  isDragging.value = false;
  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

function emitWorldPointFromEvent(event: PointerEvent) {
  const model = minimapModel.value;
  const container = containerRef.value;
  if (!model || !container) {
    return;
  }

  const rect = container.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / rect.width) * model.width;
  const localY = ((event.clientY - rect.top) / rect.height) * model.height;
  const worldPoint = mapMinimapPointToWorld(model, { x: localX, y: localY });
  emit("center-view", { worldX: worldPoint.x, worldY: worldPoint.y });
}
</script>

<style scoped>
.editor-minimap {
  position: absolute;
  right: calc(22px + var(--editor-canvas-minimap-right-clearance, 0px));
  bottom: 22px;
  z-index: 30;
  width: 224px;
  height: 160px;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 18px;
  background: var(--graphite-glass-bg);
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
  backdrop-filter: blur(24px) saturate(1.6) contrast(1.02);
  cursor: grab;
  touch-action: none;
  transition: right 180ms ease;
}

.editor-minimap::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens);
  mix-blend-mode: screen;
  opacity: 0.52;
}

.editor-minimap--dragging {
  cursor: grabbing;
}

.editor-minimap__surface {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
}

.editor-minimap__edge {
  fill: none;
  stroke: var(--editor-minimap-edge, rgba(171, 98, 41, 0.48));
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.25;
  opacity: 0.72;
  vector-effect: non-scaling-stroke;
}

.editor-minimap__edge--route {
  stroke-dasharray: 4 4;
}

.editor-minimap__edge--data {
  opacity: 0.56;
  stroke-dasharray: 2 4;
}

.editor-minimap__node {
  fill: rgba(129, 86, 45, 0.45);
  stroke: rgba(255, 252, 246, 0.72);
  stroke-width: 1;
}

.editor-minimap__node--input {
  fill: rgba(201, 107, 31, 0.5);
}

.editor-minimap__node--agent {
  fill: rgba(149, 91, 47, 0.5);
}

.editor-minimap__node--condition {
  fill: rgba(132, 112, 75, 0.52);
}

.editor-minimap__node--output {
  fill: rgba(94, 83, 73, 0.45);
}

.editor-minimap__node--selected {
  stroke: rgba(35, 25, 18, 0.72);
  stroke-width: 1.6;
}

.editor-minimap__node--running {
  stroke: rgba(16, 185, 129, 0.88);
}

.editor-minimap__node--success {
  stroke: rgba(180, 83, 9, 0.82);
}

.editor-minimap__node--failed {
  stroke: rgba(220, 38, 38, 0.86);
}

.editor-minimap__viewport {
  fill: rgba(255, 255, 255, 0.18);
  stroke: rgba(92, 54, 24, 0.74);
  stroke-width: 1.8;
  vector-effect: non-scaling-stroke;
}
</style>
