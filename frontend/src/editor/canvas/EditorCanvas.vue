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
            'editor-canvas__edge--data': edge.kind === 'data',
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
        :ref="(element) => registerNodeRef(nodeId, element)"
        class="editor-canvas__node"
        :style="nodeStyle(node.ui.position)"
        @pointerdown.stop="handleNodePointerDown(nodeId, $event)"
      >
        <NodeCard
          :node-id="nodeId"
          :node="node"
          :state-schema="document.state_schema"
          :condition-route-targets="conditionRouteTargetsByNodeId[nodeId] ?? undefined"
          :selected="selection.selectedNodeId.value === nodeId"
          @update-input-config="emit('update-input-config', $event)"
          @update-agent-config="emit('update-agent-config', $event)"
          @update-condition-config="emit('update-condition-config', $event)"
          @update-condition-branch="emit('update-condition-branch', $event)"
          @add-condition-branch="emit('add-condition-branch', $event)"
          @remove-condition-branch="emit('remove-condition-branch', $event)"
          @update-output-config="emit('update-output-config', $event)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from "vue";

import NodeCard from "@/editor/nodes/NodeCard.vue";
import { projectCanvasAnchors, projectCanvasEdges } from "@/editor/canvas/edgeProjection";
import { resolveFocusedViewport } from "@/editor/canvas/focusNodeViewport";
import { useSelection } from "./useSelection";
import { useViewport } from "./useViewport";
import type { AgentNode, ConditionNode, GraphDocument, GraphPayload, GraphPosition, InputNode, OutputNode } from "@/types/node-system";

const props = defineProps<{
  document: GraphPayload | GraphDocument;
  focusedNodeId?: string | null;
}>();

const emit = defineEmits<{
  (event: "update:node-position", payload: { nodeId: string; position: GraphPosition }): void;
  (event: "select-node", nodeId: string | null): void;
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-agent-config", payload: { nodeId: string; patch: Partial<AgentNode["config"]> }): void;
  (event: "update-condition-config", payload: { nodeId: string; patch: Partial<ConditionNode["config"]> }): void;
  (event: "update-condition-branch", payload: { nodeId: string; currentKey: string; nextKey: string; mappingKeys: string[] }): void;
  (event: "add-condition-branch", payload: { nodeId: string }): void;
  (event: "remove-condition-branch", payload: { nodeId: string; branchKey: string }): void;
  (event: "update-output-config", payload: { nodeId: string; patch: Partial<OutputNode["config"]> }): void;
}>();

const canvasRef = ref<HTMLElement | null>(null);
const nodeElementMap = new Map<string, HTMLElement>();
const viewport = useViewport();
const selection = useSelection({
  externalSelectedNodeId: toRef(props, "focusedNodeId"),
  onSelectedNodeIdChange(nodeId) {
    emit("select-node", nodeId);
  },
});
const nodeDrag = ref<{
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
} | null>(null);

const nodeEntries = computed(() => Object.entries(props.document.nodes));
const conditionRouteTargetsByNodeId = computed(() =>
  Object.fromEntries(
    Object.entries(props.document.nodes)
      .filter(([, node]) => node.kind === "condition")
      .map(([nodeId]) => [nodeId, buildConditionRouteTargets(props.document, nodeId)]),
  ) as Record<string, Record<string, string | null>>,
);
const projectedEdges = computed(() => projectCanvasEdges(props.document));
const projectedAnchors = computed(() => projectCanvasAnchors(props.document));
const viewportStyle = computed(() => ({
  transform: `translate(${viewport.viewport.x}px, ${viewport.viewport.y}px) scale(${viewport.viewport.scale})`,
}));

watch(
  () => props.focusedNodeId ?? null,
  async (nodeId) => {
    if (!nodeId) {
      return;
    }
    await nextTick();
    focusNode(nodeId);
  },
);

function nodeStyle(position: GraphPosition) {
  return {
    transform: `translate(${position.x}px, ${position.y}px)`,
  };
}

function registerNodeRef(nodeId: string, element: unknown) {
  if (element instanceof HTMLElement) {
    nodeElementMap.set(nodeId, element);
    return;
  }
  nodeElementMap.delete(nodeId);
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
  focusNode(nodeId);
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

function focusNode(nodeId: string) {
  const node = props.document.nodes[nodeId];
  const canvas = canvasRef.value;
  const element = nodeElementMap.get(nodeId);
  if (!node || !canvas || !element) {
    return;
  }

  selection.selectNode(nodeId);
  const canvasRect = canvas.getBoundingClientRect();
  viewport.setViewport(
    resolveFocusedViewport({
      currentScale: viewport.viewport.scale,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
      nodeX: node.ui.position.x,
      nodeY: node.ui.position.y,
      nodeWidth: element.offsetWidth,
      nodeHeight: element.offsetHeight,
    }),
  );
}

function buildConditionRouteTargets(document: GraphPayload | GraphDocument, nodeId: string) {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return {};
  }

  const routeBranches = document.conditional_edges.find((edge) => edge.source === nodeId)?.branches ?? {};
  return Object.fromEntries(
    node.config.branches.map((branchKey) => {
      const targetNodeId = routeBranches[branchKey];
      const targetNode = targetNodeId ? document.nodes[targetNodeId] : null;
      return [branchKey, targetNode?.name ?? targetNodeId ?? null];
    }),
  );
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

.editor-canvas__edge--data {
  stroke: rgba(217, 119, 6, 0.44);
  stroke-width: 1.7;
  stroke-dasharray: 4 8;
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
