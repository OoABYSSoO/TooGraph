<template>
  <div class="subgraph-mini-map" aria-label="Subgraph DAG mini map">
    <div
      class="subgraph-mini-map__canvas"
      :style="{
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
      }"
    >
      <svg class="subgraph-mini-map__edges" :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`" aria-hidden="true">
        <defs>
          <marker id="subgraph-mini-map-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M 0 0 L 7 3.5 L 0 7 z" />
          </marker>
        </defs>
        <path
          v-for="edge in edgePaths"
          :key="`${edge.source}-${edge.target}`"
          class="subgraph-mini-map__edge"
          :class="[
            `subgraph-mini-map__edge--${edge.status}`,
            { 'subgraph-mini-map__edge--active': edge.active },
          ]"
          :d="edge.path"
          marker-end="url(#subgraph-mini-map-arrow)"
        />
      </svg>
      <span
        v-for="node in nodes"
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
import { computed } from "vue";

import type {
  SubgraphThumbnailEdgeViewModel,
  SubgraphThumbnailNodeViewModel,
  SubgraphThumbnailStatus,
} from "./nodeCardViewModel";

const NODE_WIDTH = 94;
const NODE_HEIGHT = 32;
const COLUMN_WIDTH = 108;
const ROW_HEIGHT = 52;
const PADDING_X = 18;
const PADDING_Y = 18;

const props = defineProps<{
  nodes: SubgraphThumbnailNodeViewModel[];
  edges: SubgraphThumbnailEdgeViewModel[];
  columnCount: number;
  rowCount: number;
}>();

const canvasWidth = computed(() => Math.max(240, PADDING_X * 2 + Math.max(1, props.columnCount) * COLUMN_WIDTH - (COLUMN_WIDTH - NODE_WIDTH)));
const canvasHeight = computed(() => Math.max(132, PADDING_Y * 2 + Math.max(1, props.rowCount) * ROW_HEIGHT - (ROW_HEIGHT - NODE_HEIGHT)));
const nodeById = computed(() => new Map(props.nodes.map((node) => [node.id, node])));
const edgePaths = computed(() =>
  props.edges.flatMap((edge) => {
    const source = nodeById.value.get(edge.source);
    const target = nodeById.value.get(edge.target);
    if (!source || !target) {
      return [];
    }
    const sourceSide =
      source.column === target.column ? (source.row < target.row ? "bottom" : "top") : source.column < target.column ? "end" : "start";
    const targetSide =
      source.column === target.column ? (source.row < target.row ? "top" : "bottom") : source.column < target.column ? "start" : "end";
    const sourcePoint = nodePoint(source, sourceSide);
    const targetPoint = nodePoint(target, targetSide);
    const horizontalDistance = Math.abs(targetPoint.x - sourcePoint.x);
    const verticalDistance = Math.abs(targetPoint.y - sourcePoint.y);
    const handle = Math.max(24, Math.min(54, (horizontalDistance || verticalDistance) / 2));
    const path =
      source.column === target.column
        ? `M ${sourcePoint.x} ${sourcePoint.y} C ${sourcePoint.x} ${sourcePoint.y + (sourcePoint.y < targetPoint.y ? handle : -handle)}, ${targetPoint.x} ${targetPoint.y + (sourcePoint.y < targetPoint.y ? -handle : handle)}, ${targetPoint.x} ${targetPoint.y}`
        : `M ${sourcePoint.x} ${sourcePoint.y} C ${sourcePoint.x + (sourcePoint.x < targetPoint.x ? handle : -handle)} ${sourcePoint.y}, ${targetPoint.x + (sourcePoint.x < targetPoint.x ? -handle : handle)} ${targetPoint.y}, ${targetPoint.x} ${targetPoint.y}`;
    return [
      {
        ...edge,
        path,
      },
    ];
  }),
);

function nodeStyle(node: SubgraphThumbnailNodeViewModel) {
  return {
    left: `${nodeLeft(node)}px`,
    top: `${nodeTop(node)}px`,
    width: `${NODE_WIDTH}px`,
    height: `${NODE_HEIGHT}px`,
  };
}

function nodePoint(node: SubgraphThumbnailNodeViewModel, side: "start" | "end" | "top" | "bottom") {
  return {
    x: nodeLeft(node) + (side === "end" ? NODE_WIDTH : side === "start" ? 0 : NODE_WIDTH / 2),
    y: nodeTop(node) + (side === "bottom" ? NODE_HEIGHT : side === "top" ? 0 : NODE_HEIGHT / 2),
  };
}

function nodeLeft(node: SubgraphThumbnailNodeViewModel) {
  return PADDING_X + Math.max(0, node.column - 1) * COLUMN_WIDTH;
}

function nodeTop(node: SubgraphThumbnailNodeViewModel) {
  return PADDING_Y + Math.max(0, node.row - 1) * ROW_HEIGHT;
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
  stroke: rgba(120, 113, 108, 0.34);
  stroke-width: 1.5;
  stroke-linecap: round;
}

.subgraph-mini-map__edges marker path {
  fill: rgba(120, 113, 108, 0.5);
}

.subgraph-mini-map__edge--active {
  stroke: rgba(37, 99, 235, 0.58);
  stroke-width: 2;
}

.subgraph-mini-map__edge--success {
  stroke: rgba(20, 120, 78, 0.44);
}

.subgraph-mini-map__edge--failed {
  stroke: rgba(220, 38, 38, 0.62);
}

.subgraph-mini-map__node {
  position: absolute;
  display: grid;
  grid-template-columns: 4px 8px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(120, 113, 108, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  color: #292524;
  box-shadow: 0 8px 18px rgba(60, 41, 20, 0.06);
  padding: 0 9px 0 0;
  font-size: 11px;
  font-weight: 650;
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
  width: 4px;
  height: 18px;
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
.subgraph-mini-map__node--running,
.subgraph-mini-map__node--paused {
  border-color: rgba(37, 99, 235, 0.62);
  box-shadow:
    0 0 0 3px rgba(37, 99, 235, 0.1),
    0 10px 22px rgba(37, 99, 235, 0.14);
}

.subgraph-mini-map__node--success {
  border-color: rgba(20, 120, 78, 0.44);
}

.subgraph-mini-map__node--failed {
  border-color: rgba(220, 38, 38, 0.68);
  box-shadow:
    0 0 0 3px rgba(220, 38, 38, 0.1),
    0 10px 22px rgba(127, 29, 29, 0.14);
}

.subgraph-mini-map__node--queued .subgraph-mini-map__node-status,
.subgraph-mini-map__node--running .subgraph-mini-map__node-status {
  background: #2563eb;
}

.subgraph-mini-map__node--paused .subgraph-mini-map__node-status {
  background: #d97706;
}

.subgraph-mini-map__node--success .subgraph-mini-map__node-status {
  background: #16a34a;
}

.subgraph-mini-map__node--failed .subgraph-mini-map__node-status {
  background: #dc2626;
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
</style>
