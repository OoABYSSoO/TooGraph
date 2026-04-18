<template>
  <section
    ref="canvasRef"
    class="editor-canvas"
    tabindex="0"
    @pointerdown="handleCanvasPointerDown"
    @pointermove="handleCanvasPointerMove"
    @pointerup="handleCanvasPointerUp"
    @pointerleave="handleCanvasPointerUp"
    @keydown.delete.prevent="handleSelectedEdgeDelete"
    @keydown.backspace.prevent="handleSelectedEdgeDelete"
    @wheel.prevent="handleWheel"
  >
    <div class="editor-canvas__viewport" :style="viewportStyle">
      <div v-if="connectionHint" class="editor-canvas__connect-hint">
        {{ connectionHint }}
      </div>
      <svg class="editor-canvas__edges" viewBox="0 0 4000 3000" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="editor-canvas-arrow-flow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
            <path d="M 1 1 L 12 7 L 1 13 Z" fill="rgba(217, 119, 6, 0.88)" />
          </marker>
          <marker id="editor-canvas-arrow-route" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
            <path d="M 1 1 L 12 7 L 1 13 Z" fill="rgba(124, 58, 237, 0.88)" />
          </marker>
          <marker id="editor-canvas-arrow-selected" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
            <path d="M 1 1 L 12 7 L 1 13 Z" fill="rgba(37, 99, 235, 0.96)" />
          </marker>
          <marker id="editor-canvas-arrow-preview" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
            <path d="M 1 1 L 12 7 L 1 13 Z" fill="rgba(37, 99, 235, 0.72)" />
          </marker>
        </defs>
        <path
          v-if="connectionPreview"
          :d="connectionPreview.path"
          class="editor-canvas__edge editor-canvas__edge--preview"
          :class="{ 'editor-canvas__edge--route': connectionPreview.kind === 'route' }"
          marker-end="url(#editor-canvas-arrow-preview)"
        />
        <path
          v-for="edge in projectedEdges"
          :key="edge.id"
          :d="edge.path"
          class="editor-canvas__edge"
          :class="{
            'editor-canvas__edge--route': edge.kind === 'route',
            'editor-canvas__edge--data': edge.kind === 'data',
            'editor-canvas__edge--selected': selectedEdgeId === edge.id,
            'editor-canvas__edge--active-run': resolveRunEdgePresentationForEdge(edge.id)?.edgeClass === 'editor-canvas__edge--active-run',
          }"
          :marker-end="
            edge.kind === 'data'
              ? undefined
              : selectedEdgeId === edge.id
                ? 'url(#editor-canvas-arrow-selected)'
                : edge.kind === 'route'
                  ? 'url(#editor-canvas-arrow-route)'
                  : 'url(#editor-canvas-arrow-flow)'
          "
          @pointerdown.stop="handleEdgePointerDown(edge)"
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
            'editor-canvas__anchor--connect-source': activeConnectionSourceAnchorId === anchor.id,
            'editor-canvas__anchor--connect-target': eligibleTargetAnchorIds.has(anchor.id),
          }"
          r="5.5"
          @pointerdown.stop="handleAnchorPointerDown(anchor)"
        />
      </svg>
      <div
        v-for="[nodeId, node] in nodeEntries"
        :key="nodeId"
        :ref="(element) => registerNodeRef(nodeId, element)"
        class="editor-canvas__node"
        :class="resolveRunNodeClassList(nodeId)"
        :style="nodeStyle(node.ui.position)"
        @pointerdown.stop="handleNodePointerDown(nodeId, $event)"
      >
        <div
          v-if="resolveRunNodePresentationForNode(nodeId)?.haloClass"
          class="editor-canvas__node-halo"
          :class="resolveRunNodePresentationForNode(nodeId)?.haloClass"
        />
        <NodeCard
          :node-id="nodeId"
          :node="node"
          :state-schema="document.state_schema"
          :knowledge-bases="knowledgeBases"
          :skill-definitions="skillDefinitions"
          :skill-definitions-loading="skillDefinitionsLoading"
          :skill-definitions-error="skillDefinitionsError"
          :available-agent-model-refs="availableAgentModelRefs"
          :agent-model-display-lookup="agentModelDisplayLookup"
          :global-text-model-ref="globalTextModelRef"
          :condition-route-targets="conditionRouteTargetsByNodeId[nodeId] ?? undefined"
          :latest-run-status="latestRunStatus ?? null"
          :run-output-preview-text="runOutputPreviewByNodeId?.[nodeId]?.text ?? null"
          :run-output-display-mode="runOutputPreviewByNodeId?.[nodeId]?.displayMode ?? null"
          :run-failure-message="runFailureMessageByNodeId?.[nodeId] ?? null"
          :selected="selection.selectedNodeId.value === nodeId"
          @update-input-config="emit('update-input-config', $event)"
          @update-input-state="emit('update-input-state', $event)"
          @update-agent-config="emit('update-agent-config', $event)"
          @update-condition-config="emit('update-condition-config', $event)"
          @update-condition-branch="emit('update-condition-branch', $event)"
          @add-condition-branch="emit('add-condition-branch', $event)"
          @remove-condition-branch="emit('remove-condition-branch', $event)"
          @bind-port-state="emit('bind-port-state', $event)"
          @create-port-state="emit('create-port-state', $event)"
          @update-output-config="emit('update-output-config', $event)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from "vue";

import NodeCard from "@/editor/nodes/NodeCard.vue";
import { projectCanvasAnchors, projectCanvasEdges, type ProjectedCanvasAnchor, type ProjectedCanvasEdge } from "@/editor/canvas/edgeProjection";
import { buildPendingConnectionPreviewPath } from "@/editor/canvas/connectionPreviewPath";
import { resolveEdgeRunPresentation } from "@/editor/canvas/runEdgePresentation";
import { resolveNodeRunPresentation } from "@/editor/canvas/runNodePresentation";
import { canCompleteGraphConnection, canStartGraphConnection, type PendingGraphConnection } from "@/lib/graph-connections";
import { resolveFocusedViewport } from "@/editor/canvas/focusNodeViewport";
import { useNodeSelectionFocus, type NodeFocusRequest } from "./useNodeSelectionFocus";
import { useViewport } from "./useViewport";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { SkillDefinition } from "@/types/skills";
import type { AgentNode, ConditionNode, GraphDocument, GraphPayload, GraphPosition, InputNode, OutputNode, StateDefinition } from "@/types/node-system";

const props = defineProps<{
  document: GraphPayload | GraphDocument;
  knowledgeBases: KnowledgeBaseRecord[];
  skillDefinitions: SkillDefinition[];
  skillDefinitionsLoading: boolean;
  skillDefinitionsError: string | null;
  availableAgentModelRefs: string[];
  agentModelDisplayLookup: Record<string, string>;
  globalTextModelRef: string;
  selectedNodeId?: string | null;
  focusRequest?: NodeFocusRequest | null;
  runNodeStatusByNodeId?: Record<string, string>;
  currentRunNodeId?: string | null;
  latestRunStatus?: string | null;
  runOutputPreviewByNodeId?: Record<string, { text: string; displayMode: string | null }>;
  runFailureMessageByNodeId?: Record<string, string>;
  activeRunEdgeIds?: string[];
}>();

const emit = defineEmits<{
  (event: "update:node-position", payload: { nodeId: string; position: GraphPosition }): void;
  (event: "select-node", nodeId: string | null): void;
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-input-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "update-agent-config", payload: { nodeId: string; patch: Partial<AgentNode["config"]> }): void;
  (event: "update-condition-config", payload: { nodeId: string; patch: Partial<ConditionNode["config"]> }): void;
  (event: "update-condition-branch", payload: { nodeId: string; currentKey: string; nextKey: string; mappingKeys: string[] }): void;
  (event: "add-condition-branch", payload: { nodeId: string }): void;
  (event: "remove-condition-branch", payload: { nodeId: string; branchKey: string }): void;
  (event: "bind-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "create-port-state", payload: { nodeId: string; side: "input" | "output"; field: { key: string; definition: StateDefinition } }): void;
  (event: "update-output-config", payload: { nodeId: string; patch: Partial<OutputNode["config"]> }): void;
  (event: "connect-flow", payload: { sourceNodeId: string; targetNodeId: string }): void;
  (event: "connect-route", payload: { sourceNodeId: string; branchKey: string; targetNodeId: string }): void;
  (event: "reconnect-flow", payload: { sourceNodeId: string; currentTargetNodeId: string; nextTargetNodeId: string }): void;
  (event: "reconnect-route", payload: { sourceNodeId: string; branchKey: string; nextTargetNodeId: string }): void;
  (event: "remove-flow", payload: { sourceNodeId: string; targetNodeId: string }): void;
  (event: "remove-route", payload: { sourceNodeId: string; branchKey: string }): void;
}>();

const canvasRef = ref<HTMLElement | null>(null);
const nodeElementMap = new Map<string, HTMLElement>();
const viewport = useViewport();
const selection = useNodeSelectionFocus({
  externalSelectedNodeId: toRef(props, "selectedNodeId"),
  externalFocusRequest: toRef(props, "focusRequest"),
  onSelectedNodeIdChange(nodeId) {
    emit("select-node", nodeId);
  },
  onFocusNode(nodeId) {
    void nextTick().then(() => {
      focusNode(nodeId);
    });
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
const pendingConnection = ref<PendingGraphConnection | null>(null);
const pendingConnectionPoint = ref<{ x: number; y: number } | null>(null);
const selectedEdgeId = ref<string | null>(null);

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
const selectedReconnectConnection = computed<PendingGraphConnection | null>(() => {
  const edge = selectedEdgeId.value ? projectedEdges.value.find((candidate) => candidate.id === selectedEdgeId.value) : null;
  if (!edge || edge.kind === "data") {
    return null;
  }

  if (edge.kind === "route" && edge.branch) {
    return {
      sourceNodeId: edge.source,
      sourceKind: "route-out",
      branchKey: edge.branch,
      mode: "reconnect",
      currentTargetNodeId: edge.target,
    };
  }

  return {
    sourceNodeId: edge.source,
    sourceKind: "flow-out",
    mode: "reconnect",
    currentTargetNodeId: edge.target,
  };
});
const activeConnection = computed(() => pendingConnection.value ?? selectedReconnectConnection.value);
const activeConnectionSourceAnchorId = computed(() => {
  if (!activeConnection.value) {
    return null;
  }

  const sourceAnchor = projectedAnchors.value.find(
    (anchor) =>
      anchor.nodeId === activeConnection.value?.sourceNodeId &&
      anchor.kind === activeConnection.value.sourceKind &&
      (anchor.kind !== "route-out" || anchor.branch === activeConnection.value.branchKey),
  );
  return sourceAnchor?.id ?? null;
});
const eligibleTargetAnchorIds = computed(() =>
  new Set(
    projectedAnchors.value
      .filter((anchor) =>
        canCompleteGraphConnection(props.document, activeConnection.value, {
          nodeId: anchor.nodeId,
          kind: anchor.kind,
        }),
      )
      .map((anchor) => anchor.id),
  ),
);
const connectionHint = computed(() => {
  if (!activeConnection.value) {
    return null;
  }

  const sourceNode = props.document.nodes[activeConnection.value.sourceNodeId];
  if (!sourceNode) {
    return "Select a target node anchor to connect.";
  }

  if (activeConnection.value.mode === "reconnect" && activeConnection.value.currentTargetNodeId) {
    const currentTargetNode = props.document.nodes[activeConnection.value.currentTargetNodeId];
    const currentTargetLabel = currentTargetNode?.name ?? activeConnection.value.currentTargetNodeId;
    if (activeConnection.value.sourceKind === "route-out") {
      return `Retargeting ${sourceNode.name} / ${activeConnection.value.branchKey} from ${currentTargetLabel}...`;
    }
    return `Retargeting ${sourceNode.name} -> ${currentTargetLabel}...`;
  }

  if (activeConnection.value.sourceKind === "route-out") {
    return `Connecting ${sourceNode.name} / ${activeConnection.value.branchKey} to a target node...`;
  }

  return `Connecting ${sourceNode.name} to a target node...`;
});
const connectionPreview = computed(() => {
  if (!activeConnection.value || !pendingConnectionPoint.value || !activeConnectionSourceAnchorId.value) {
    return null;
  }

  const sourceAnchor = projectedAnchors.value.find((anchor) => anchor.id === activeConnectionSourceAnchorId.value);
  if (!sourceAnchor) {
    return null;
  }

  return {
    kind: activeConnection.value.sourceKind === "route-out" ? "route" as const : "flow" as const,
    path: buildPendingConnectionPreviewPath({
      kind: activeConnection.value.sourceKind,
      sourceX: sourceAnchor.x,
      sourceY: sourceAnchor.y,
      targetX: pendingConnectionPoint.value.x,
      targetY: pendingConnectionPoint.value.y,
      routeSourceIndex:
        activeConnection.value.sourceKind === "route-out" && activeConnection.value.branchKey
          ? resolveRouteBranchIndex(props.document, activeConnection.value.sourceNodeId, activeConnection.value.branchKey)
          : undefined,
    }),
  };
});
const viewportStyle = computed(() => ({
  transform: `translate(${viewport.viewport.x}px, ${viewport.viewport.y}px) scale(${viewport.viewport.scale})`,
}));

watch(projectedEdges, (edges) => {
  if (selectedEdgeId.value && !edges.some((edge) => edge.id === selectedEdgeId.value)) {
    selectedEdgeId.value = null;
    if (!pendingConnection.value) {
      pendingConnectionPoint.value = null;
    }
  }
});

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
  canvasRef.value?.focus();
  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  selectedEdgeId.value = null;
  selection.clearSelection();
  viewport.beginPan(event);
}

function handleCanvasPointerMove(event: PointerEvent) {
  if (activeConnection.value) {
    pendingConnectionPoint.value = resolveCanvasPoint(event);
  }
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
  canvasRef.value?.focus();
  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  selectedEdgeId.value = null;
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

function handleEdgePointerDown(edge: ProjectedCanvasEdge) {
  canvasRef.value?.focus();
  pendingConnection.value = null;
  if (selectedEdgeId.value === edge.id) {
    selectedEdgeId.value = null;
    pendingConnectionPoint.value = null;
  } else {
    selectedEdgeId.value = edge.id;
    pendingConnectionPoint.value = resolveEdgeTargetPoint(edge);
  }
  selection.clearSelection();
}

function handleAnchorPointerDown(anchor: ProjectedCanvasAnchor) {
  canvasRef.value?.focus();
  selection.selectNode(anchor.nodeId);

  if (
    canCompleteGraphConnection(props.document, activeConnection.value, {
      nodeId: anchor.nodeId,
      kind: anchor.kind,
    })
  ) {
    completePendingConnection(anchor.nodeId);
    return;
  }

  if (!canStartGraphConnection(anchor.kind)) {
    return;
  }

  const nextPendingConnection = createPendingConnection(anchor);
  if (!nextPendingConnection) {
    return;
  }

  selectedEdgeId.value = null;
  if (isSamePendingConnection(pendingConnection.value, nextPendingConnection)) {
    pendingConnection.value = null;
    pendingConnectionPoint.value = null;
    return;
  }

  pendingConnection.value = nextPendingConnection;
  pendingConnectionPoint.value = { x: anchor.x, y: anchor.y };
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

function createPendingConnection(anchor: ProjectedCanvasAnchor): PendingGraphConnection | null {
  if (anchor.kind === "flow-out") {
    return {
      sourceNodeId: anchor.nodeId,
      sourceKind: "flow-out",
    };
  }

  if (anchor.kind === "route-out" && anchor.branch) {
    return {
      sourceNodeId: anchor.nodeId,
      sourceKind: "route-out",
      branchKey: anchor.branch,
    };
  }

  return null;
}

function isSamePendingConnection(left: PendingGraphConnection | null, right: PendingGraphConnection | null) {
  return (
    left?.sourceNodeId === right?.sourceNodeId &&
    left?.sourceKind === right?.sourceKind &&
    left?.branchKey === right?.branchKey
  );
}

function completePendingConnection(targetNodeId: string) {
  const connection = activeConnection.value;
  if (!connection) {
    return;
  }

  if (connection.mode === "reconnect") {
    if (connection.sourceKind === "route-out" && connection.branchKey) {
      emit("reconnect-route", {
        sourceNodeId: connection.sourceNodeId,
        branchKey: connection.branchKey,
        nextTargetNodeId: targetNodeId,
      });
    } else if (connection.currentTargetNodeId) {
      emit("reconnect-flow", {
        sourceNodeId: connection.sourceNodeId,
        currentTargetNodeId: connection.currentTargetNodeId,
        nextTargetNodeId: targetNodeId,
      });
    }
  } else if (connection.sourceKind === "route-out" && connection.branchKey) {
    emit("connect-route", {
      sourceNodeId: connection.sourceNodeId,
      branchKey: connection.branchKey,
      targetNodeId,
    });
  } else {
    emit("connect-flow", {
      sourceNodeId: connection.sourceNodeId,
      targetNodeId,
    });
  }

  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  selectedEdgeId.value = null;
}

function handleSelectedEdgeDelete() {
  const edge = selectedEdgeId.value ? projectedEdges.value.find((candidate) => candidate.id === selectedEdgeId.value) : null;
  if (!edge) {
    return;
  }

  if (edge.kind === "flow") {
    emit("remove-flow", {
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
    });
  } else if (edge.kind === "route" && edge.branch) {
    emit("remove-route", {
      sourceNodeId: edge.source,
      branchKey: edge.branch,
    });
  } else {
    return;
  }

  selectedEdgeId.value = null;
  pendingConnectionPoint.value = null;
}

function resolveCanvasPoint(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) {
    return pendingConnectionPoint.value ?? { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - viewport.viewport.x) / viewport.viewport.scale,
    y: (event.clientY - rect.top - viewport.viewport.y) / viewport.viewport.scale,
  };
}

function resolveEdgeTargetPoint(edge: ProjectedCanvasEdge) {
  const targetAnchor = projectedAnchors.value.find((anchor) => anchor.nodeId === edge.target && anchor.kind === "flow-in");
  return targetAnchor ? { x: targetAnchor.x, y: targetAnchor.y } : null;
}

function resolveRouteBranchIndex(document: GraphPayload | GraphDocument, nodeId: string, branchKey: string) {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== "condition") {
    return 0;
  }
  const index = node.config.branches.indexOf(branchKey);
  return index >= 0 ? index : 0;
}

function resolveRunNodePresentationForNode(nodeId: string) {
  return resolveNodeRunPresentation(props.runNodeStatusByNodeId?.[nodeId], props.currentRunNodeId === nodeId);
}

function resolveRunNodeClassList(nodeId: string) {
  const presentation = resolveRunNodePresentationForNode(nodeId);
  return presentation?.shellClass ? [presentation.shellClass] : [];
}

function resolveRunEdgePresentationForEdge(edgeId: string) {
  return resolveEdgeRunPresentation(edgeId, props.activeRunEdgeIds ?? []);
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
  outline: none;
}

.editor-canvas__viewport {
  position: absolute;
  inset: 0;
  transform-origin: top left;
}

.editor-canvas__connect-hint {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 1;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.94);
  color: rgba(154, 52, 18, 0.96);
  padding: 8px 14px;
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 12px 28px rgba(120, 53, 15, 0.12);
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
  pointer-events: stroke;
  cursor: pointer;
  transition:
    stroke 120ms ease,
    stroke-width 120ms ease,
    opacity 120ms ease;
}

.editor-canvas__edge--route {
  stroke: rgba(124, 58, 237, 0.88);
  stroke-dasharray: 10 8;
}

.editor-canvas__edge--data {
  stroke: rgba(217, 119, 6, 0.44);
  stroke-width: 1.7;
  stroke-dasharray: 4 8;
}

.editor-canvas__edge--preview {
  stroke: rgba(37, 99, 235, 0.72);
  stroke-width: 2.8;
  stroke-dasharray: 8 6;
  pointer-events: none;
}

.editor-canvas__edge--selected {
  stroke: rgba(37, 99, 235, 0.96);
  stroke-width: 3.4;
  opacity: 1;
}

.editor-canvas__edge--active-run {
  stroke: rgba(249, 115, 22, 0.96);
  stroke-width: 3.2;
  opacity: 1;
  filter: drop-shadow(0 0 12px rgba(249, 115, 22, 0.34));
}

.editor-canvas__anchor {
  fill: rgba(154, 52, 18, 0.92);
  stroke: rgba(255, 250, 241, 0.96);
  stroke-width: 2;
  cursor: crosshair;
  transition:
    transform 120ms ease,
    fill 120ms ease,
    stroke 120ms ease,
    r 120ms ease;
}

.editor-canvas__anchor--state {
  fill: rgba(217, 119, 6, 0.92);
}

.editor-canvas__anchor--route {
  fill: rgba(124, 58, 237, 0.92);
}

.editor-canvas__anchor--connect-source {
  fill: rgba(37, 99, 235, 0.96);
  stroke: rgba(219, 234, 254, 0.98);
}

.editor-canvas__anchor--connect-target {
  fill: rgba(34, 197, 94, 0.92);
  stroke: rgba(220, 252, 231, 0.98);
}

.editor-canvas__node {
  position: absolute;
  top: 0;
  left: 0;
  isolation: isolate;
  transition:
    filter 180ms ease,
    transform 180ms ease;
}

.editor-canvas__node-halo {
  position: absolute;
  inset: -10px;
  z-index: -1;
  border-radius: 32px;
  pointer-events: none;
}

.editor-canvas__node-halo--running {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.22) 0%, rgba(59, 130, 246, 0.08) 58%, transparent 76%);
}

.editor-canvas__node-halo--running-current {
  background: radial-gradient(circle, rgba(37, 99, 235, 0.28) 0%, rgba(96, 165, 250, 0.14) 56%, transparent 76%);
}

.editor-canvas__node--running {
  filter: drop-shadow(0 0 0.7rem rgba(59, 130, 246, 0.2));
}

.editor-canvas__node--running-current {
  filter: drop-shadow(0 0 1rem rgba(37, 99, 235, 0.34));
}

.editor-canvas__node--success {
  filter: drop-shadow(0 0 0.7rem rgba(34, 197, 94, 0.2));
}

.editor-canvas__node--failed {
  filter: drop-shadow(0 0 0.8rem rgba(239, 68, 68, 0.24));
}
</style>
