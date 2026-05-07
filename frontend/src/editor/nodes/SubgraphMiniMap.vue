<template>
  <div ref="containerRef" class="subgraph-mini-map" aria-label="Subgraph DAG mini map">
    <div
      class="subgraph-mini-map__canvas"
      :style="{
        width: `${layout.canvasWidth}px`,
        height: `${layout.canvasHeight}px`,
      }"
    >
      <svg class="subgraph-mini-map__edges" :viewBox="`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`" aria-hidden="true">
        <path
          v-for="edge in layout.edges"
          :key="`${edge.source}-${edge.target}`"
          class="subgraph-mini-map__edge"
          :class="[
            `subgraph-mini-map__edge--${edge.status}`,
            { 'subgraph-mini-map__edge--active': edge.active },
          ]"
          :d="edge.path"
        />
      </svg>
      <span
        v-for="node in layout.nodes"
        :key="node.id"
        class="subgraph-mini-map__node"
        :class="[
          `subgraph-mini-map__node--${node.kind}`,
          `subgraph-mini-map__node--${node.status}`,
          { 'subgraph-mini-map__node--active': node.active },
        ]"
        :style="nodeStyle(node)"
        :title="`${node.label} - ${formatStatus(node.status)}`"
      >
        <span class="subgraph-mini-map__node-kind" aria-hidden="true" />
        <span class="subgraph-mini-map__node-status" aria-hidden="true" />
        <span class="subgraph-mini-map__node-label">{{ node.label }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { SubgraphThumbnailEdgeViewModel, SubgraphThumbnailNodeViewModel, SubgraphThumbnailStatus } from "./nodeCardViewModel";
import { buildSubgraphMiniMapLayout } from "./subgraphMiniMapLayout";
import type { SubgraphMiniMapPlacedNode } from "./subgraphMiniMapLayout";

const props = defineProps<{
  nodes: SubgraphThumbnailNodeViewModel[];
  edges: SubgraphThumbnailEdgeViewModel[];
}>();

const containerRef = ref<HTMLElement | null>(null);
const containerWidth = ref<number | null>(null);
let resizeObserver: ResizeObserver | null = null;

const layout = computed(() => buildSubgraphMiniMapLayout(props.nodes, props.edges, containerWidth.value ?? Number.POSITIVE_INFINITY));

onMounted(() => {
  const element = containerRef.value;
  if (!element) {
    return;
  }
  const observedElement = element.parentElement ?? element;
  const updateWidth = () => {
    containerWidth.value = element.parentElement?.clientWidth ?? element.clientWidth;
  };
  updateWidth();
  resizeObserver = new ResizeObserver(updateWidth);
  resizeObserver.observe(observedElement);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function nodeStyle(node: SubgraphMiniMapPlacedNode) {
  return {
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: `${node.width}px`,
    height: `${node.height}px`,
  };
}

function formatStatus(status: SubgraphThumbnailStatus) {
  if (status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "paused") {
    return "paused";
  }
  if (status === "success") {
    return "success";
  }
  if (status === "failed") {
    return "failed";
  }
  return "idle";
}
</script>

<style scoped>
.subgraph-mini-map {
  min-height: 176px;
  overflow: visible;
  width: 100%;
  min-width: 0;
  display: grid;
  align-items: center;
  justify-items: center;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 242, 0.72));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.subgraph-mini-map__canvas {
  position: relative;
  width: fit-content;
  margin: 0 auto;
}

.subgraph-mini-map__edges {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.subgraph-mini-map__edge {
  fill: none;
  stroke: rgba(87, 83, 78, 0.5);
  stroke-width: 3.2;
  stroke-dasharray: 12 12;
  stroke-linecap: round;
  stroke-linejoin: round;
  animation: subgraph-mini-map-flow-line 1.6s linear infinite;
  opacity: 0.9;
}

.subgraph-mini-map__edge--active {
  stroke: rgba(16, 185, 129, 0.82);
  stroke-width: 3.8;
  filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.28));
}

.subgraph-mini-map__edge--queued,
.subgraph-mini-map__edge--running {
  stroke: rgba(16, 185, 129, 0.74);
}

.subgraph-mini-map__edge--paused {
  stroke: rgba(245, 158, 11, 0.72);
}

.subgraph-mini-map__edge--success {
  stroke: rgba(180, 83, 9, 0.58);
}

.subgraph-mini-map__edge--failed {
  stroke: rgba(239, 68, 68, 0.8);
}

.subgraph-mini-map__node {
  position: absolute;
  display: grid;
  grid-template-columns: 5px 8px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  border: 1.5px solid rgba(120, 113, 108, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  color: #292524;
  box-shadow: 0 8px 18px rgba(60, 41, 20, 0.06);
  padding: 0 12px 0 0;
  font-size: 12px;
  font-weight: 680;
  line-height: 1.2;
}

.subgraph-mini-map__node-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subgraph-mini-map__node-status {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(120, 113, 108, 0.42);
}

.subgraph-mini-map__node-kind {
  width: 5px;
  height: 22px;
  border-radius: 999px;
  background: rgba(120, 113, 108, 0.38);
}

.subgraph-mini-map__node--input {
  border-color: rgba(20, 120, 78, 0.24);
  background: rgba(246, 253, 248, 0.98);
}

.subgraph-mini-map__node--input .subgraph-mini-map__node-kind {
  background: #16a34a;
}

.subgraph-mini-map__node--agent {
  border-color: rgba(37, 99, 235, 0.24);
  background: rgba(248, 251, 255, 0.98);
}

.subgraph-mini-map__node--agent .subgraph-mini-map__node-kind {
  background: #2563eb;
}

.subgraph-mini-map__node--condition {
  border-color: rgba(217, 119, 6, 0.28);
  background: rgba(255, 251, 235, 0.98);
}

.subgraph-mini-map__node--condition .subgraph-mini-map__node-kind {
  background: #d97706;
}

.subgraph-mini-map__node--output {
  border-color: rgba(154, 52, 18, 0.24);
  background: rgba(255, 250, 245, 0.98);
}

.subgraph-mini-map__node--output .subgraph-mini-map__node-kind {
  background: #9a3412;
}

.subgraph-mini-map__node--subgraph {
  border-color: rgba(13, 148, 136, 0.28);
}

.subgraph-mini-map__node--subgraph .subgraph-mini-map__node-kind {
  background: #0d9488;
}

.subgraph-mini-map__node--queued,
.subgraph-mini-map__node--running {
  border-color: rgba(16, 185, 129, 0.58);
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.12),
    0 10px 22px rgba(16, 185, 129, 0.16);
}

.subgraph-mini-map__node--paused {
  border-color: rgba(245, 158, 11, 0.58);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.12),
    0 10px 22px rgba(245, 158, 11, 0.16);
}

.subgraph-mini-map__node--success {
  border-color: rgba(180, 83, 9, 0.42);
}

.subgraph-mini-map__node--failed {
  border-color: rgba(239, 68, 68, 0.68);
  box-shadow:
    0 0 0 3px rgba(239, 68, 68, 0.1),
    0 10px 22px rgba(127, 29, 29, 0.14);
}

.subgraph-mini-map__node--queued .subgraph-mini-map__node-status,
.subgraph-mini-map__node--running .subgraph-mini-map__node-status {
  background: #10b981;
}

.subgraph-mini-map__node--paused .subgraph-mini-map__node-status {
  background: #f59e0b;
}

.subgraph-mini-map__node--success .subgraph-mini-map__node-status {
  background: #b45309;
}

.subgraph-mini-map__node--failed .subgraph-mini-map__node-status {
  background: #ef4444;
}

@media (prefers-reduced-motion: no-preference) {
  .subgraph-mini-map__node--active {
    animation: subgraph-mini-map-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes subgraph-mini-map-pulse {
  0%,
  100% {
    transform: translateZ(0);
  }
  50% {
    transform: translateY(-1px);
  }
}

@keyframes subgraph-mini-map-flow-line {
  from {
    stroke-dashoffset: 0;
  }

  to {
    stroke-dashoffset: -24;
  }
}
</style>
