<template>
  <section
    ref="canvasRef"
    class="editor-canvas"
    :class="{
      'editor-canvas--connecting': Boolean(pendingConnection),
      'editor-canvas--panning': viewport.isPanning.value,
    }"
    :style="canvasSurfaceStyle"
    tabindex="0"
    @dblclick="handleCanvasDoubleClick"
    @pointerdown="handleCanvasPointerDown"
    @pointermove="handleCanvasPointerMove"
    @pointerup="handleCanvasPointerUp"
    @pointercancel="handleCanvasPointerUp"
    @keydown.delete.prevent="handleSelectedEdgeDelete"
    @keydown.backspace.prevent="handleSelectedEdgeDelete"
    @keydown.escape.prevent="clearCanvasTransientState"
    @wheel.prevent="handleWheel"
    @dragover.prevent="handleCanvasDragOver"
    @drop.prevent="handleCanvasDrop"
  >
    <div class="editor-canvas__viewport" :style="viewportStyle">
      <div v-if="connectionHint" class="editor-canvas__connect-hint">
        {{ connectionHint }}
      </div>
      <div v-if="nodeEntries.length === 0" class="editor-canvas__empty-state">
        <div class="editor-canvas__empty-eyebrow">Empty Canvas</div>
        <div class="editor-canvas__empty-title">Double click to create your first node</div>
        <div class="editor-canvas__empty-copy">Drag from an output handle into empty space to get type-aware preset suggestions.</div>
      </div>
      <svg class="editor-canvas__edges" viewBox="0 0 4000 3000" preserveAspectRatio="none" aria-hidden="true">
        <defs>
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
          :class="{
            'editor-canvas__edge--flow': connectionPreview.kind === 'flow',
            'editor-canvas__edge--route': connectionPreview.kind === 'route',
            'editor-canvas__edge--data': connectionPreview.kind === 'data',
          }"
          :marker-end="connectionPreview.kind === 'route' ? 'url(#editor-canvas-arrow-preview)' : undefined"
        />
        <path
          v-for="edge in projectedEdges.filter((edge) => edge.kind === 'flow')"
          :key="`${edge.id}:highlight`"
          :d="edge.path"
          class="editor-canvas__edge-delete-highlight"
          :class="{ 'editor-canvas__edge-delete-highlight--active': isFlowEdgeDeleteConfirmOpen(edge.id) }"
        />
        <path
          v-for="edge in projectedEdges"
          :key="edge.id"
          :d="edge.path"
          class="editor-canvas__edge"
          :style="edgeStyle(edge)"
          :class="{
            'editor-canvas__edge--flow': edge.kind === 'flow',
            'editor-canvas__edge--route': edge.kind === 'route',
            'editor-canvas__edge--data': edge.kind === 'data',
            'editor-canvas__edge--selected': selectedEdgeId === edge.id,
            'editor-canvas__edge--active-run': resolveRunEdgePresentationForEdge(edge.id)?.edgeClass === 'editor-canvas__edge--active-run',
          }"
          :marker-end="
            edge.kind === 'route'
              ? selectedEdgeId === edge.id
                ? 'url(#editor-canvas-arrow-selected)'
                : 'url(#editor-canvas-arrow-route)'
              : undefined
          "
        />
        <path
          v-for="edge in projectedEdges"
          :key="`${edge.id}:hitarea`"
          :d="edge.path"
          class="editor-canvas__edge-hitarea"
          :class="{
            'editor-canvas__edge-hitarea--flow': edge.kind === 'flow',
            'editor-canvas__edge-hitarea--route': edge.kind === 'route',
            'editor-canvas__edge-hitarea--data': edge.kind === 'data',
          }"
          @pointerdown.stop="handleEdgePointerDown(edge, $event)"
        />
      </svg>
      <div
        v-if="activeFlowEdgeDeleteConfirm"
        class="editor-canvas__edge-delete-confirm"
        :style="flowEdgeDeleteConfirmStyle"
        aria-hidden="true"
      >
        <div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--remove">Delete edge?</div>
        <button
          type="button"
          class="editor-canvas__edge-delete-button"
          @pointerdown.stop
          @click.stop="confirmFlowEdgeDelete"
        >
          <ElIcon><Check /></ElIcon>
        </button>
      </div>
      <div
        v-if="activeDataEdgeStateConfirm"
        class="editor-canvas__edge-state-confirm"
        :style="dataEdgeStateConfirmStyle"
        aria-hidden="true"
        @pointerdown.stop
      >
        <div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--state">Edit state?</div>
        <button
          type="button"
          class="editor-canvas__edge-state-button"
          @pointerdown.stop
          @click.stop="openDataEdgeStateEditor"
        >
          <ElIcon><Check /></ElIcon>
        </button>
      </div>
      <div
        v-if="activeDataEdgeStateEditor && dataEdgeStateDraft"
        class="editor-canvas__edge-state-editor-shell"
        :style="dataEdgeStateEditorStyle"
        @pointerdown.stop
      >
        <StateEditorPopover
          :draft="dataEdgeStateDraft"
          :error="dataEdgeStateError"
          :type-options="stateTypeOptions"
          :color-options="dataEdgeStateColorOptions"
          @update:key="handleDataEdgeStateEditorKeyInput"
          @update:name="handleDataEdgeStateEditorNameInput"
          @update:type="handleDataEdgeStateEditorTypeValue"
          @update:color="handleDataEdgeStateEditorColorInput"
          @update:description="handleDataEdgeStateEditorDescriptionInput"
        />
        <div class="editor-canvas__edge-state-editor-actions">
          <button type="button" class="editor-canvas__edge-state-editor-action" @pointerdown.stop @click.stop="removeDataEdgeSourceBinding">
            <ElIcon><Delete /></ElIcon>
            <span>Remove source ref</span>
          </button>
          <button type="button" class="editor-canvas__edge-state-editor-action" @pointerdown.stop @click.stop="removeDataEdgeTargetBinding">
            <ElIcon><Delete /></ElIcon>
            <span>Remove target ref</span>
          </button>
        </div>
        <button
          type="button"
          class="editor-canvas__edge-state-editor-action editor-canvas__edge-state-editor-action--danger"
          @pointerdown.stop
          @click.stop="removeDataEdgeBindings"
        >
          <ElIcon><Delete /></ElIcon>
          <span>Remove both refs</span>
        </button>
      </div>
      <div
        v-for="[nodeId, node] in nodeEntries"
        :key="nodeId"
        :ref="(element) => registerNodeRef(nodeId, element)"
        class="editor-canvas__node"
        :class="[resolveRunNodeClassList(nodeId), { 'editor-canvas__node--selected': selection.selectedNodeId.value === nodeId }]"
        :style="nodeStyle(node.ui.position)"
        @pointerenter="setHoveredNode(nodeId)"
        @pointerleave="clearHoveredNode(nodeId)"
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
          @update-node-metadata="emit('update-node-metadata', $event)"
          @update-input-config="emit('update-input-config', $event)"
          @update-input-state="emit('update-input-state', $event)"
          @rename-state="emit('rename-state', $event)"
          @update-state="emit('update-state', $event)"
          @remove-port-state="emit('remove-port-state', $event)"
          @update-agent-config="emit('update-agent-config', $event)"
          @update-condition-config="emit('update-condition-config', $event)"
          @update-condition-branch="emit('update-condition-branch', $event)"
          @add-condition-branch="emit('add-condition-branch', $event)"
          @remove-condition-branch="emit('remove-condition-branch', $event)"
          @bind-port-state="emit('bind-port-state', $event)"
          @create-port-state="emit('create-port-state', $event)"
          @delete-node="emit('delete-node', $event)"
          @save-node-preset="emit('save-node-preset', $event)"
          @update-output-config="emit('update-output-config', $event)"
        />
      </div>
      <div class="editor-canvas__flow-hotspots" aria-hidden="true">
        <div
          v-for="anchor in flowAnchors"
          :key="`flow-${anchor.id}`"
          class="editor-canvas__flow-hotspot"
          :style="flowHotspotStyle(anchor)"
          :class="{
            'editor-canvas__flow-hotspot--outbound': anchor.kind === 'flow-out',
            'editor-canvas__flow-hotspot--inbound': anchor.kind === 'flow-in',
            'editor-canvas__flow-hotspot--visible': isFlowHotspotVisible(anchor),
            'editor-canvas__flow-hotspot--connect-source': activeConnectionSourceAnchorId === anchor.id,
            'editor-canvas__flow-hotspot--connect-target': eligibleTargetAnchorIds.has(anchor.id),
            'editor-canvas__flow-hotspot--top': anchor.side === 'top',
          }"
          @pointerenter="setHoveredFlowHandleNode(anchor.nodeId)"
          @pointerleave="clearHoveredFlowHandleNode(anchor.nodeId)"
          @pointerdown.prevent.stop="handleAnchorPointerDown(anchor)"
        />
      </div>
      <svg class="editor-canvas__anchors" viewBox="0 0 4000 3000" preserveAspectRatio="none" aria-hidden="true">
        <circle
          v-for="anchor in pointAnchors"
          :key="anchor.id"
          :cx="anchor.x"
          :cy="anchor.y"
          class="editor-canvas__anchor"
          :style="anchorStyle(anchor)"
          :class="{
            'editor-canvas__anchor--state': anchor.kind === 'state-in' || anchor.kind === 'state-out',
            'editor-canvas__anchor--route': anchor.kind === 'route-out',
            'editor-canvas__anchor--connect-source': activeConnectionSourceAnchorId === anchor.id,
            'editor-canvas__anchor--connect-target': eligibleTargetAnchorIds.has(anchor.id),
          }"
          r="5.5"
          @pointerdown.prevent.stop="handleAnchorPointerDown(anchor)"
        />
      </svg>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import { Check, Delete } from "@element-plus/icons-vue";

import { buildAnchorModel } from "@/editor/anchors/anchorModel";
import NodeCard from "@/editor/nodes/NodeCard.vue";
import StateEditorPopover from "@/editor/nodes/StateEditorPopover.vue";
import { type ProjectedCanvasAnchor, type ProjectedCanvasEdge } from "@/editor/canvas/edgeProjection";
import { buildPendingConnectionPreviewPath } from "@/editor/canvas/connectionPreviewPath";
import { resolveFlowAnchorOffset } from "@/editor/canvas/flowAnchorLayout";
import { resolveEdgeRunPresentation } from "@/editor/canvas/runEdgePresentation";
import { resolveNodeRunPresentation } from "@/editor/canvas/runNodePresentation";
import { resolveCanvasLayout, type MeasuredAnchorOffset } from "@/editor/canvas/resolvedCanvasLayout";
import { resolveCanvasSurfaceStyle } from "@/editor/canvas/canvasSurfaceStyle";
import {
  defaultValueForStateType,
  resolveStateColorOptions,
  STATE_FIELD_TYPE_OPTIONS,
  type StateFieldDraft,
  type StateFieldType,
} from "@/editor/workspace/statePanelFields";
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
  (event: "update-node-metadata", payload: { nodeId: string; patch: Partial<Pick<InputNode | AgentNode | ConditionNode | OutputNode, "name" | "description">> }): void;
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-input-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "rename-state", payload: { currentKey: string; nextKey: string }): void;
  (event: "update-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "remove-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "update-agent-config", payload: { nodeId: string; patch: Partial<AgentNode["config"]> }): void;
  (event: "update-condition-config", payload: { nodeId: string; patch: Partial<ConditionNode["config"]> }): void;
  (event: "update-condition-branch", payload: { nodeId: string; currentKey: string; nextKey: string; mappingKeys: string[] }): void;
  (event: "add-condition-branch", payload: { nodeId: string }): void;
  (event: "remove-condition-branch", payload: { nodeId: string; branchKey: string }): void;
  (event: "bind-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "create-port-state", payload: { nodeId: string; side: "input" | "output"; field: { key: string; definition: StateDefinition } }): void;
  (event: "delete-node", payload: { nodeId: string }): void;
  (event: "save-node-preset", payload: { nodeId: string }): void;
  (event: "update-output-config", payload: { nodeId: string; patch: Partial<OutputNode["config"]> }): void;
  (event: "connect-flow", payload: { sourceNodeId: string; targetNodeId: string }): void;
  (event: "connect-state", payload: { sourceNodeId: string; sourceStateKey: string; targetNodeId: string; targetStateKey: string }): void;
  (event: "connect-route", payload: { sourceNodeId: string; branchKey: string; targetNodeId: string }): void;
  (event: "reconnect-flow", payload: { sourceNodeId: string; currentTargetNodeId: string; nextTargetNodeId: string }): void;
  (event: "reconnect-route", payload: { sourceNodeId: string; branchKey: string; nextTargetNodeId: string }): void;
  (event: "remove-flow", payload: { sourceNodeId: string; targetNodeId: string }): void;
  (event: "remove-route", payload: { sourceNodeId: string; branchKey: string }): void;
  (event: "open-node-creation-menu", payload: { position: GraphPosition; sourceNodeId?: string; sourceAnchorKind?: "flow-out" | "route-out" | "state-out"; sourceBranchKey?: string; sourceStateKey?: string; sourceValueType?: string | null; clientX: number; clientY: number }): void;
  (event: "create-node-from-file", payload: { file: File; position: GraphPosition; clientX: number; clientY: number }): void;
}>();

const canvasRef = ref<HTMLElement | null>(null);
const nodeElementMap = new Map<string, HTMLElement>();
const nodeResizeObserverMap = new Map<string, ResizeObserver>();
const nodeMutationObserverMap = new Map<string, MutationObserver>();
const measuredAnchorOffsets = ref<Record<string, MeasuredAnchorOffset>>({});
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
const autoSnappedTargetAnchor = ref<ProjectedCanvasAnchor | null>(null);
const selectedEdgeId = ref<string | null>(null);
const activeFlowEdgeDeleteConfirm = ref<{
  id: string;
  source: string;
  target: string;
  x: number;
  y: number;
} | null>(null);
const flowEdgeDeleteConfirmTimeoutRef = ref<number | null>(null);
const activeDataEdgeStateConfirm = ref<{
  id: string;
  source: string;
  target: string;
  stateKey: string;
  x: number;
  y: number;
} | null>(null);
const dataEdgeStateConfirmTimeoutRef = ref<number | null>(null);
const activeDataEdgeStateEditor = ref<{
  source: string;
  target: string;
  stateKey: string;
  x: number;
  y: number;
} | null>(null);
const dataEdgeStateDraft = ref<StateFieldDraft | null>(null);
const dataEdgeStateError = ref<string | null>(null);
const hoveredNodeId = ref<string | null>(null);
const hoveredFlowHandleNodeId = ref<string | null>(null);
const pendingAnchorMeasurementNodeIds = new Set<string>();
let scheduledAnchorMeasurementFrame: number | null = null;

const nodeEntries = computed(() => Object.entries(props.document.nodes));
const conditionRouteTargetsByNodeId = computed(() =>
  Object.fromEntries(
    Object.entries(props.document.nodes)
      .filter(([, node]) => node.kind === "condition")
      .map(([nodeId]) => [nodeId, buildConditionRouteTargets(props.document, nodeId)]),
  ) as Record<string, Record<string, string | null>>,
);
const resolvedCanvasLayout = computed(() => resolveCanvasLayout(props.document, measuredAnchorOffsets.value));
const projectedEdges = computed(() => resolvedCanvasLayout.value.edges);
const projectedAnchors = computed(() => resolvedCanvasLayout.value.anchors);
const flowAnchors = computed(() =>
  projectedAnchors.value.filter((anchor) => anchor.kind === "flow-in" || anchor.kind === "flow-out"),
);
const pointAnchors = computed(() =>
  projectedAnchors.value.filter(
    (anchor) => anchor.kind === "state-in" || anchor.kind === "state-out" || anchor.kind === "route-out",
  ),
);
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
      (anchor.kind !== "route-out" || anchor.branch === activeConnection.value.branchKey) &&
      (anchor.kind !== "state-out" || anchor.stateKey === activeConnection.value.sourceStateKey),
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
          stateKey: anchor.stateKey,
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
    if (activeConnection.value.sourceKind === "state-out" && activeConnection.value.sourceStateKey) {
      return `Retargeting ${activeConnection.value.sourceStateKey} from ${currentTargetLabel}...`;
    }
    return `Retargeting ${sourceNode.name} -> ${currentTargetLabel}...`;
  }

  if (activeConnection.value.sourceKind === "route-out") {
    return `Connecting ${sourceNode.name} / ${activeConnection.value.branchKey} to a target node...`;
  }

  if (activeConnection.value.sourceKind === "state-out" && activeConnection.value.sourceStateKey) {
    return `Connecting ${activeConnection.value.sourceStateKey} to a target state...`;
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
    kind:
      activeConnection.value.sourceKind === "route-out"
        ? "route" as const
        : activeConnection.value.sourceKind === "state-out"
          ? "data" as const
          : "flow" as const,
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
const canvasSurfaceStyle = computed(() => resolveCanvasSurfaceStyle(viewport.viewport));
const viewportStyle = computed(() => ({
  transform: `translate(${viewport.viewport.x}px, ${viewport.viewport.y}px) scale(${viewport.viewport.scale})`,
}));
const stateTypeOptions = STATE_FIELD_TYPE_OPTIONS;
const flowEdgeDeleteConfirmStyle = computed(() => {
  if (!activeFlowEdgeDeleteConfirm.value) {
    return undefined;
  }

  return {
    left: `${activeFlowEdgeDeleteConfirm.value.x}px`,
    top: `${activeFlowEdgeDeleteConfirm.value.y}px`,
  };
});
const dataEdgeStateConfirmStyle = computed(() => {
  if (!activeDataEdgeStateConfirm.value) {
    return undefined;
  }

  return {
    left: `${activeDataEdgeStateConfirm.value.x}px`,
    top: `${activeDataEdgeStateConfirm.value.y}px`,
  };
});
const dataEdgeStateEditorStyle = computed(() => {
  if (!activeDataEdgeStateEditor.value) {
    return undefined;
  }

  return {
    left: `${activeDataEdgeStateEditor.value.x}px`,
    top: `${activeDataEdgeStateEditor.value.y}px`,
  };
});
const dataEdgeStateColorOptions = computed(() => resolveStateColorOptions(dataEdgeStateDraft.value?.definition.color ?? ""));

function isFlowEdgeDeleteConfirmOpen(edgeId: string) {
  return activeFlowEdgeDeleteConfirm.value?.id === edgeId;
}

function isActiveDataEdge(edge: Pick<ProjectedCanvasEdge, "kind" | "source" | "target" | "state">, dataState: {
  source: string;
  target: string;
  stateKey: string;
} | null) {
  if (!dataState) {
    return false;
  }

  return edge.kind === "data" && edge.source === dataState.source && edge.target === dataState.target && edge.state === dataState.stateKey;
}

watch(projectedEdges, (edges) => {
  if (selectedEdgeId.value && !edges.some((edge) => edge.id === selectedEdgeId.value)) {
    selectedEdgeId.value = null;
    if (!pendingConnection.value) {
      pendingConnectionPoint.value = null;
    }
  }

  if (activeFlowEdgeDeleteConfirm.value && !edges.some((edge) => edge.id === activeFlowEdgeDeleteConfirm.value?.id)) {
    clearFlowEdgeDeleteConfirmState();
  }

  if (activeDataEdgeStateConfirm.value && !edges.some((edge) => isActiveDataEdge(edge, activeDataEdgeStateConfirm.value))) {
    clearDataEdgeStateConfirmState();
  }

  if (activeDataEdgeStateEditor.value && !edges.some((edge) => isActiveDataEdge(edge, activeDataEdgeStateEditor.value))) {
    closeDataEdgeStateEditor();
  }
});

onMounted(() => {
  scheduleAnchorMeasurement();
});

onBeforeUnmount(() => {
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

  clearFlowEdgeDeleteConfirmState();
  clearDataEdgeStateInteraction();
});

function clearFlowEdgeDeleteConfirmTimeout() {
  if (flowEdgeDeleteConfirmTimeoutRef.value !== null) {
    window.clearTimeout(flowEdgeDeleteConfirmTimeoutRef.value);
    flowEdgeDeleteConfirmTimeoutRef.value = null;
  }
}

function clearFlowEdgeDeleteConfirmState() {
  clearFlowEdgeDeleteConfirmTimeout();
  activeFlowEdgeDeleteConfirm.value = null;
}

function clearDataEdgeStateConfirmTimeout() {
  if (dataEdgeStateConfirmTimeoutRef.value !== null) {
    window.clearTimeout(dataEdgeStateConfirmTimeoutRef.value);
    dataEdgeStateConfirmTimeoutRef.value = null;
  }
}

function clearDataEdgeStateConfirmState() {
  clearDataEdgeStateConfirmTimeout();
  activeDataEdgeStateConfirm.value = null;
}

function closeDataEdgeStateEditor() {
  activeDataEdgeStateEditor.value = null;
  dataEdgeStateDraft.value = null;
  dataEdgeStateError.value = null;
}

function clearDataEdgeStateInteraction() {
  clearDataEdgeStateConfirmState();
  closeDataEdgeStateEditor();
}

function clearCanvasTransientState() {
  clearFlowEdgeDeleteConfirmState();
  clearDataEdgeStateInteraction();
  autoSnappedTargetAnchor.value = null;
}

function startFlowEdgeDeleteConfirm(edge: ProjectedCanvasEdge, event: PointerEvent) {
  clearFlowEdgeDeleteConfirmTimeout();
  const point = resolveCanvasPoint(event);
  activeFlowEdgeDeleteConfirm.value = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    x: point.x,
    y: point.y,
  };
  flowEdgeDeleteConfirmTimeoutRef.value = window.setTimeout(() => {
    flowEdgeDeleteConfirmTimeoutRef.value = null;
    if (activeFlowEdgeDeleteConfirm.value?.id === edge.id) {
      activeFlowEdgeDeleteConfirm.value = null;
    }
  }, 2000);
}

function confirmFlowEdgeDelete() {
  if (!activeFlowEdgeDeleteConfirm.value) {
    return;
  }

  emit("remove-flow", {
    sourceNodeId: activeFlowEdgeDeleteConfirm.value.source,
    targetNodeId: activeFlowEdgeDeleteConfirm.value.target,
  });
  clearFlowEdgeDeleteConfirmState();
}

function startDataEdgeStateConfirm(edge: ProjectedCanvasEdge, event: PointerEvent) {
  if (edge.kind !== "data" || !edge.state) {
    return;
  }

  clearDataEdgeStateConfirmTimeout();
  const point = resolveCanvasPoint(event);
  activeDataEdgeStateConfirm.value = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    stateKey: edge.state,
    x: point.x,
    y: point.y,
  };
  dataEdgeStateConfirmTimeoutRef.value = window.setTimeout(() => {
    dataEdgeStateConfirmTimeoutRef.value = null;
    if (activeDataEdgeStateConfirm.value?.id === edge.id) {
      activeDataEdgeStateConfirm.value = null;
    }
  }, 2000);
}

function buildStateDraftFromSchema(stateKey: string): StateFieldDraft | null {
  const definition = props.document.state_schema[stateKey];
  if (!definition) {
    return null;
  }

  return {
    key: stateKey,
    definition: {
      name: definition.name,
      description: definition.description,
      type: definition.type,
      value: definition.value,
      color: definition.color,
    },
  };
}

function openDataEdgeStateEditor() {
  if (!activeDataEdgeStateConfirm.value) {
    return;
  }

  const nextDraft = buildStateDraftFromSchema(activeDataEdgeStateConfirm.value.stateKey);
  if (!nextDraft) {
    clearDataEdgeStateConfirmState();
    return;
  }

  activeDataEdgeStateEditor.value = {
    source: activeDataEdgeStateConfirm.value.source,
    target: activeDataEdgeStateConfirm.value.target,
    stateKey: activeDataEdgeStateConfirm.value.stateKey,
    x: activeDataEdgeStateConfirm.value.x,
    y: activeDataEdgeStateConfirm.value.y,
  };
  dataEdgeStateDraft.value = nextDraft;
  dataEdgeStateError.value = null;
  clearDataEdgeStateConfirmState();
}

function syncDataEdgeStateDraft(nextDraft: StateFieldDraft) {
  const currentEditor = activeDataEdgeStateEditor.value;
  if (!currentEditor || !dataEdgeStateDraft.value) {
    return;
  }

  dataEdgeStateDraft.value = nextDraft;

  const currentStateKey = currentEditor.stateKey;
  const nextKey = nextDraft.key.trim();
  if (!nextKey) {
    dataEdgeStateError.value = "State key cannot be empty.";
    return;
  }
  if (nextKey !== currentStateKey && props.document.state_schema[nextKey]) {
    dataEdgeStateError.value = `State key '${nextKey}' already exists.`;
    return;
  }

  dataEdgeStateError.value = null;

  if (nextKey !== currentStateKey) {
    emit("rename-state", { currentKey: currentStateKey, nextKey });
    activeDataEdgeStateEditor.value = {
      ...currentEditor,
      stateKey: nextKey,
    };
  }

  emit("update-state", {
    stateKey: nextKey,
    patch: {
      name: nextDraft.definition.name.trim() || nextKey,
      description: nextDraft.definition.description,
      type: nextDraft.definition.type,
      value: nextDraft.definition.value,
      color: nextDraft.definition.color,
    },
  });
}

function handleDataEdgeStateEditorKeyInput(value: string | number) {
  if (typeof value !== "string" || !dataEdgeStateDraft.value) {
    return;
  }
  syncDataEdgeStateDraft({
    ...dataEdgeStateDraft.value,
    key: value,
  });
}

function handleDataEdgeStateEditorNameInput(value: string | number) {
  if (typeof value !== "string" || !dataEdgeStateDraft.value) {
    return;
  }
  syncDataEdgeStateDraft({
    ...dataEdgeStateDraft.value,
    definition: {
      ...dataEdgeStateDraft.value.definition,
      name: value,
    },
  });
}

function handleDataEdgeStateEditorDescriptionInput(value: string | number) {
  if (typeof value !== "string" || !dataEdgeStateDraft.value) {
    return;
  }
  syncDataEdgeStateDraft({
    ...dataEdgeStateDraft.value,
    definition: {
      ...dataEdgeStateDraft.value.definition,
      description: value,
    },
  });
}

function handleDataEdgeStateEditorColorInput(value: string | number) {
  if (typeof value !== "string" || !dataEdgeStateDraft.value) {
    return;
  }
  syncDataEdgeStateDraft({
    ...dataEdgeStateDraft.value,
    definition: {
      ...dataEdgeStateDraft.value.definition,
      color: value,
    },
  });
}

function handleDataEdgeStateEditorTypeValue(value: string | number | boolean | undefined) {
  if (typeof value !== "string" || !dataEdgeStateDraft.value) {
    return;
  }
  syncDataEdgeStateDraft({
    ...dataEdgeStateDraft.value,
    definition: {
      ...dataEdgeStateDraft.value.definition,
      type: value,
      value: defaultValueForStateType(value as StateFieldType),
    },
  });
}

function removeDataEdgeSourceBinding() {
  if (!activeDataEdgeStateEditor.value) {
    return;
  }
  emit("remove-port-state", {
    nodeId: activeDataEdgeStateEditor.value.source,
    side: "output",
    stateKey: activeDataEdgeStateEditor.value.stateKey,
  });
  clearDataEdgeStateInteraction();
}

function removeDataEdgeTargetBinding() {
  if (!activeDataEdgeStateEditor.value) {
    return;
  }
  emit("remove-port-state", {
    nodeId: activeDataEdgeStateEditor.value.target,
    side: "input",
    stateKey: activeDataEdgeStateEditor.value.stateKey,
  });
  clearDataEdgeStateInteraction();
}

function removeDataEdgeBindings() {
  if (!activeDataEdgeStateEditor.value) {
    return;
  }

  emit("remove-port-state", {
    nodeId: activeDataEdgeStateEditor.value.source,
    side: "output",
    stateKey: activeDataEdgeStateEditor.value.stateKey,
  });
  emit("remove-port-state", {
    nodeId: activeDataEdgeStateEditor.value.target,
    side: "input",
    stateKey: activeDataEdgeStateEditor.value.stateKey,
  });
  clearDataEdgeStateInteraction();
}

function nodeStyle(position: GraphPosition) {
  return {
    transform: `translate(${position.x}px, ${position.y}px)`,
  };
}

function edgeStyle(edge: ProjectedCanvasEdge) {
  if (!edge.color) {
    return undefined;
  }
  return {
    "--editor-edge-stroke": edge.color,
  };
}

function flowHotspotStyle(anchor: ProjectedCanvasAnchor) {
  const isVertical = anchor.side === "left" || anchor.side === "right";
  let left = anchor.x;
  let top = anchor.y;
  let width = isVertical ? 22 : 86;
  let height = isVertical ? 86 : 22;

  if (anchor.kind === "flow-out" && anchor.side === "right") {
    left += 26;
    width = 60;
    height = 94;
  } else if (anchor.kind === "flow-in" && anchor.side === "left") {
    left -= 18;
    width = 42;
    height = 82;
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
}

function anchorStyle(anchor: ProjectedCanvasAnchor) {
  if (!anchor.color) {
    return undefined;
  }
  return {
    "--editor-anchor-fill": anchor.color,
  };
}

function registerNodeRef(nodeId: string, element: unknown) {
  if (element instanceof HTMLElement) {
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
  const measuredNodeIds = new Set(nodeIds ?? nodeElementMap.keys());
  let didChange = false;

  for (const nodeId of measuredNodeIds) {
    for (const anchorId of Object.keys(nextAnchorOffsets)) {
      if (!anchorId.startsWith(`${nodeId}:`)) {
        continue;
      }
      delete nextAnchorOffsets[anchorId];
      didChange = true;
    }

    const nodeElement = nodeElementMap.get(nodeId);
    const node = props.document.nodes[nodeId];
    if (!nodeElement) {
      continue;
    }

    const nodeRect = nodeElement.getBoundingClientRect();
    const scale = viewport.viewport.scale || 1;

    for (const slotElement of nodeElement.querySelectorAll("[data-anchor-slot-id]")) {
      if (!(slotElement instanceof HTMLElement)) {
        continue;
      }

      const anchorId = slotElement.dataset.anchorSlotId;
      if (!anchorId) {
        continue;
      }

      const slotRect = slotElement.getBoundingClientRect();
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
}

function roundMeasuredOffset(value: number) {
  return Math.round(value * 1000) / 1000;
}

function handleCanvasPointerDown(event: PointerEvent) {
  canvasRef.value?.focus();
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  canvasRef.value?.setPointerCapture(event.pointerId);
  clearCanvasTransientState();
  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  selectedEdgeId.value = null;
  selection.clearSelection();
  viewport.beginPan(event);
}

function handleCanvasPointerMove(event: PointerEvent) {
  if (activeConnection.value) {
    autoSnappedTargetAnchor.value = resolveAutoSnappedTargetAnchor(event);
    pendingConnectionPoint.value = autoSnappedTargetAnchor.value
      ? { x: autoSnappedTargetAnchor.value.x, y: autoSnappedTargetAnchor.value.y }
      : resolveCanvasPoint(event);
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
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId);
  }
  if (activeConnection.value) {
    if (autoSnappedTargetAnchor.value) {
      completePendingConnection(autoSnappedTargetAnchor.value);
      return;
    }
    openCreationMenuFromPendingConnection(event);
  }
  if (nodeDrag.value && nodeDrag.value.pointerId === event.pointerId) {
    nodeDrag.value = null;
  }
  viewport.endPan(event);
}

function handleCanvasDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (
    target?.closest(
      ".editor-canvas__node, .node-card, button, input, textarea, select, .el-input, .el-select, .el-switch",
    )
  ) {
    return;
  }

  const position = resolveCanvasPoint(event);
  emit("open-node-creation-menu", {
    position,
    clientX: event.clientX,
    clientY: event.clientY,
  });
}

function resolveAutoSnappedTargetAnchor(event: PointerEvent) {
  if (!activeConnection.value || activeConnection.value.sourceKind === "state-out") {
    return null;
  }

  for (const anchor of flowAnchors.value) {
    if (isPointerWithinFlowHotspot(anchor, event) && eligibleTargetAnchorIds.value.has(anchor.id)) {
      return anchor;
    }
  }

  for (const [nodeId, nodeElement] of nodeElementMap.entries()) {
    const rect = nodeElement.getBoundingClientRect();
    if (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ) {
      const snappedAnchor = resolveEligibleTargetAnchorForNodeBody(nodeId);
      if (snappedAnchor) {
        return snappedAnchor;
      }
    }
  }

  return null;
}

function isPointerWithinFlowHotspot(anchor: ProjectedCanvasAnchor, event: PointerEvent) {
  const hotspot = flowHotspotStyle(anchor);
  const left = parseFloat(hotspot.left);
  const top = parseFloat(hotspot.top);
  const width = parseFloat(hotspot.width);
  const height = parseFloat(hotspot.height);
  const point = resolveCanvasPoint(event);

  return (
    point.x >= left - width / 2 &&
    point.x <= left + width / 2 &&
    point.y >= top - height / 2 &&
    point.y <= top + height / 2
  );
}

function resolveEligibleTargetAnchorForNodeBody(nodeId: string) {
  const candidateAnchor = projectedAnchors.value.find((anchor) => anchor.nodeId === nodeId && anchor.kind === "flow-in");
  if (!candidateAnchor || !eligibleTargetAnchorIds.value.has(candidateAnchor.id)) {
    return null;
  }
  return candidateAnchor;
}

function handleCanvasDragOver(event: DragEvent) {
  event.dataTransfer!.dropEffect = event.dataTransfer?.files?.length ? "copy" : "none";
}

function handleCanvasDrop(event: DragEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".editor-canvas__node, .node-card")) {
    return;
  }

  const file = event.dataTransfer?.files?.[0] ?? null;
  if (!file) {
    return;
  }

  emit("create-node-from-file", {
    file,
    position: resolveCanvasPoint(event),
    clientX: event.clientX,
    clientY: event.clientY,
  });
}

function handleNodePointerDown(nodeId: string, event: PointerEvent) {
  const node = props.document.nodes[nodeId];
  if (!node) {
    return;
  }
  if (activeConnection.value) {
    const snappedAnchor = resolveEligibleTargetAnchorForNodeBody(nodeId);
    if (snappedAnchor) {
      canvasRef.value?.focus();
      completePendingConnection(snappedAnchor);
      return;
    }
  }
  canvasRef.value?.focus();
  clearCanvasTransientState();
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

function setHoveredNode(nodeId: string) {
  hoveredNodeId.value = nodeId;
}

function clearHoveredNode(nodeId: string) {
  if (hoveredNodeId.value === nodeId) {
    hoveredNodeId.value = null;
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

function isFlowHotspotVisible(anchor: ProjectedCanvasAnchor) {
  if (anchor.kind === "flow-out") {
    return (
      selection.selectedNodeId.value === anchor.nodeId ||
      hoveredNodeId.value === anchor.nodeId ||
      hoveredFlowHandleNodeId.value === anchor.nodeId ||
      activeConnectionSourceAnchorId.value === anchor.id
    );
  }

  return eligibleTargetAnchorIds.value.has(anchor.id);
}

function handleWheel(event: WheelEvent) {
  viewport.zoomBy(event.deltaY);
}

function handleEdgePointerDown(edge: ProjectedCanvasEdge, event: PointerEvent) {
  canvasRef.value?.focus();
  clearCanvasTransientState();
  pendingConnection.value = null;
  if (edge.kind === "flow") {
    pendingConnectionPoint.value = null;
    selectedEdgeId.value = null;
    selection.clearSelection();
    startFlowEdgeDeleteConfirm(edge, event);
    return;
  }
  if (edge.kind === "data") {
    pendingConnectionPoint.value = null;
    selectedEdgeId.value = null;
    selection.clearSelection();
    startDataEdgeStateConfirm(edge, event);
    return;
  }
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
  clearCanvasTransientState();
  selection.selectNode(anchor.nodeId);

  if (
    canCompleteGraphConnection(props.document, activeConnection.value, {
      nodeId: anchor.nodeId,
      kind: anchor.kind,
      stateKey: anchor.stateKey,
    })
  ) {
    completePendingConnection(anchor);
    return;
  }

  if (!canStartGraphConnection(anchor.kind)) {
    return;
  }

  window.getSelection()?.removeAllRanges();
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

function openCreationMenuFromPendingConnection(event: PointerEvent) {
  if (!activeConnection.value) {
    return;
  }
  clearCanvasTransientState();
  const isStateCreationSource = activeConnection.value.sourceKind === "state-out";
  const isFlowCreationSource = activeConnection.value.sourceKind === "flow-out";
  const isRouteCreationSource = activeConnection.value.sourceKind === "route-out";
  if (!isStateCreationSource && !isFlowCreationSource && !isRouteCreationSource) {
    return;
  }

  emit("open-node-creation-menu", {
    position: resolveCanvasPoint(event),
    sourceNodeId: activeConnection.value.sourceNodeId,
    sourceAnchorKind: activeConnection.value.sourceKind,
    sourceBranchKey: activeConnection.value.branchKey,
    sourceStateKey: activeConnection.value.sourceStateKey,
    sourceValueType: activeConnection.value.sourceStateKey
      ? props.document.state_schema[activeConnection.value.sourceStateKey]?.type ?? null
      : null,
    clientX: event.clientX,
    clientY: event.clientY,
  });

  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  autoSnappedTargetAnchor.value = null;
  selectedEdgeId.value = null;
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

  if (anchor.kind === "state-out" && anchor.stateKey) {
    return {
      sourceNodeId: anchor.nodeId,
      sourceKind: "state-out",
      sourceStateKey: anchor.stateKey,
    };
  }

  return null;
}

function isSamePendingConnection(left: PendingGraphConnection | null, right: PendingGraphConnection | null) {
  return (
    left?.sourceNodeId === right?.sourceNodeId &&
    left?.sourceKind === right?.sourceKind &&
    left?.sourceStateKey === right?.sourceStateKey &&
    left?.branchKey === right?.branchKey
  );
}

function completePendingConnection(targetAnchor: ProjectedCanvasAnchor) {
  const connection = activeConnection.value;
  if (!connection) {
    return;
  }

  if (connection.mode === "reconnect") {
    if (connection.sourceKind === "route-out" && connection.branchKey) {
      emit("reconnect-route", {
        sourceNodeId: connection.sourceNodeId,
        branchKey: connection.branchKey,
        nextTargetNodeId: targetAnchor.nodeId,
      });
    } else if (connection.currentTargetNodeId) {
      emit("reconnect-flow", {
        sourceNodeId: connection.sourceNodeId,
        currentTargetNodeId: connection.currentTargetNodeId,
        nextTargetNodeId: targetAnchor.nodeId,
      });
    }
  } else if (connection.sourceKind === "route-out" && connection.branchKey) {
    emit("connect-route", {
      sourceNodeId: connection.sourceNodeId,
      branchKey: connection.branchKey,
      targetNodeId: targetAnchor.nodeId,
    });
  } else if (connection.sourceKind === "state-out" && connection.sourceStateKey && targetAnchor.stateKey) {
    emit("connect-state", {
      sourceNodeId: connection.sourceNodeId,
      sourceStateKey: connection.sourceStateKey,
      targetNodeId: targetAnchor.nodeId,
      targetStateKey: targetAnchor.stateKey,
    });
  } else {
    emit("connect-flow", {
      sourceNodeId: connection.sourceNodeId,
      targetNodeId: targetAnchor.nodeId,
    });
  }

  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  autoSnappedTargetAnchor.value = null;
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

function resolveCanvasPoint(event: { clientX: number; clientY: number }) {
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
  const targetAnchor =
    edge.kind === "data" && edge.state
      ? projectedAnchors.value.find(
          (anchor) => anchor.nodeId === edge.target && anchor.kind === "state-in" && anchor.stateKey === edge.state,
        )
      : projectedAnchors.value.find((anchor) => anchor.nodeId === edge.target && anchor.kind === "flow-in");
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

.editor-canvas--connecting,
.editor-canvas--connecting * {
  user-select: none;
  -webkit-user-select: none;
}

.editor-canvas--panning,
.editor-canvas--panning * {
  user-select: none;
  -webkit-user-select: none;
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

.editor-canvas__empty-state {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.editor-canvas__empty-state > * {
  pointer-events: none;
}

.editor-canvas__empty-eyebrow,
.editor-canvas__empty-title,
.editor-canvas__empty-copy {
  text-align: center;
}

.editor-canvas__empty-eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.editor-canvas__empty-title {
  margin-top: 12px;
  font-size: 2rem;
  font-weight: 600;
  color: rgba(35, 25, 18, 0.94);
}

.editor-canvas__empty-copy {
  margin-top: 8px;
  max-width: 34rem;
  color: rgba(60, 41, 20, 0.74);
}

.editor-canvas__edges {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 4000px;
  height: 3000px;
  overflow: visible;
  pointer-events: none;
}

.editor-canvas__edge-delete-confirm {
  position: absolute;
  z-index: 12;
  pointer-events: none;
}

.editor-canvas__edge-state-confirm {
  position: absolute;
  z-index: 12;
  pointer-events: none;
}

.editor-canvas__confirm-hint {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: max-content;
  padding: 5px 10px;
  border: 1px solid rgba(185, 28, 28, 0.12);
  border-radius: 999px;
  background: rgba(255, 248, 248, 0.98);
  box-shadow: 0 10px 24px rgba(120, 53, 15, 0.12);
  color: rgba(127, 29, 29, 0.9);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  transform: translateX(-50%);
}

.editor-canvas__confirm-hint--remove {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  color: rgba(127, 29, 29, 0.9);
}

.editor-canvas__confirm-hint--state {
  border-color: rgba(37, 99, 235, 0.16);
  background: rgba(245, 249, 255, 0.98);
  color: rgba(29, 78, 216, 0.92);
}

.editor-canvas__edge-delete-button {
  position: absolute;
  left: 50%;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(185, 28, 28, 0.2);
  border-radius: 999px;
  background: rgb(185, 28, 28);
  color: #fff;
  box-shadow: 0 10px 24px rgba(120, 53, 15, 0.16);
  transform: translate(-50%, -50%);
  pointer-events: auto;
}

.editor-canvas__edge-delete-button :deep(.el-icon) {
  font-size: 1rem;
}

.editor-canvas__edge-state-button {
  position: absolute;
  left: 50%;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgb(37, 99, 235);
  color: #fff;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.18);
  transform: translate(-50%, -50%);
  pointer-events: auto;
}

.editor-canvas__edge-state-button :deep(.el-icon) {
  font-size: 1rem;
}

.editor-canvas__edge-state-editor-shell {
  position: absolute;
  z-index: 12;
  width: 320px;
  display: grid;
  gap: 10px;
  transform: translate(-50%, calc(-100% - 18px));
  pointer-events: auto;
}

.editor-canvas__edge-state-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.editor-canvas__edge-state-editor-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(185, 28, 28, 0.14);
  border-radius: 999px;
  background: rgba(255, 248, 248, 0.96);
  color: rgba(127, 29, 29, 0.92);
  font-size: 0.76rem;
  font-weight: 600;
  box-shadow: 0 10px 20px rgba(120, 53, 15, 0.08);
}

.editor-canvas__edge-state-editor-action:hover {
  border-color: rgba(185, 28, 28, 0.22);
  background: rgba(255, 242, 242, 0.98);
}

.editor-canvas__edge-state-editor-action--danger {
  width: 100%;
  justify-content: center;
  min-height: 38px;
  margin-top: 2px;
  border-color: rgba(185, 28, 28, 0.18);
  background: rgba(255, 241, 241, 0.98);
  color: rgba(127, 29, 29, 0.94);
  font-size: 0.8rem;
}

.editor-canvas__edge-state-editor-action--danger:hover {
  border-color: rgba(185, 28, 28, 0.28);
  background: rgba(254, 226, 226, 0.98);
}

.editor-canvas__anchors {
  position: absolute;
  inset: 0;
  z-index: 10;
  width: 4000px;
  height: 3000px;
  overflow: visible;
  pointer-events: none;
}

.editor-canvas__flow-hotspots {
  position: absolute;
  inset: 0;
  z-index: 11;
  width: 4000px;
  height: 3000px;
  overflow: visible;
  pointer-events: none;
}

.editor-canvas__edge {
  fill: none;
  stroke: var(--editor-edge-stroke, rgba(217, 119, 6, 0.88));
  stroke-width: 4.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  transition:
    stroke 120ms ease,
    stroke-width 120ms ease,
    opacity 120ms ease;
}

.editor-canvas__edge-hitarea {
  fill: none;
  stroke: transparent;
  stroke-width: 18px;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: stroke;
  cursor: pointer;
}

.editor-canvas__edge-delete-highlight {
  fill: none;
  stroke: rgba(201, 107, 31, 0.16);
  stroke-width: 7px;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  transition:
    stroke 120ms ease,
    stroke-width 120ms ease,
    opacity 120ms ease;
}

.editor-canvas__edge-delete-highlight--active {
  stroke: rgba(220, 38, 38, 0.34);
  stroke-width: 12px;
}

.editor-canvas__edge--flow {
  stroke: rgba(201, 107, 31, 0.9);
  stroke-width: 4.4;
  stroke-dasharray: 18 22;
  animation: editor-canvas-flow-line 1.8s linear infinite;
  opacity: 0.94;
}

.editor-canvas__edge--route {
  stroke: rgba(124, 58, 237, 0.88);
  stroke-dasharray: 10 8;
  stroke-width: 4.2;
}

.editor-canvas__edge--data {
  stroke: var(--editor-edge-stroke, rgba(37, 99, 235, 0.78));
  stroke-width: 2.7;
  stroke-dasharray: 10 10;
  animation: editor-canvas-ant-line 1.2s linear infinite;
  opacity: 0.94;
}

.editor-canvas__edge--preview {
  stroke: rgba(37, 99, 235, 0.72);
  stroke-width: 2.8;
  stroke-dasharray: 8 6;
  pointer-events: none;
}

.editor-canvas__edge--preview.editor-canvas__edge--flow {
  stroke: rgba(201, 107, 31, 0.76);
  stroke-width: 3.8;
  stroke-dasharray: 16 18;
  animation: editor-canvas-flow-line 1.8s linear infinite;
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

@keyframes editor-canvas-ant-line {
  from {
    stroke-dashoffset: 0;
  }

  to {
    stroke-dashoffset: -20;
  }
}

@keyframes editor-canvas-flow-line {
  from {
    stroke-dashoffset: 0;
  }

  to {
    stroke-dashoffset: -40;
  }
}

.editor-canvas__flow-hotspot {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: crosshair;
}

.editor-canvas__flow-hotspot::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: rgba(190, 141, 72, 0);
  box-shadow:
    inset 0 0 0 1px rgba(190, 141, 72, 0),
    0 10px 20px rgba(120, 53, 15, 0);
  opacity: 0;
  transition:
    background 120ms ease,
    box-shadow 120ms ease,
    opacity 120ms ease;
}

.editor-canvas__flow-hotspot::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition:
    color 120ms ease,
    opacity 120ms ease,
    transform 120ms ease;
}

.editor-canvas__flow-hotspot--outbound::before {
  width: 38px;
  height: 56px;
  border-radius: 999px;
}

.editor-canvas__flow-hotspot--outbound::after {
  content: "+";
  color: rgba(201, 107, 31, 0.92);
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.editor-canvas__flow-hotspot--inbound::before {
  width: 22px;
  height: 52px;
  border-radius: 999px;
}

.editor-canvas__flow-hotspot--visible::before {
  background: rgba(255, 250, 241, 0.98);
  box-shadow:
    inset 0 0 0 1px rgba(201, 107, 31, 0.24),
    0 12px 24px rgba(120, 53, 15, 0.14);
  opacity: 1;
}

.editor-canvas__flow-hotspot--visible::after {
  opacity: 1;
}

.editor-canvas__flow-hotspot:hover::before {
  background: rgba(255, 248, 242, 1);
  box-shadow:
    inset 0 0 0 1px rgba(201, 107, 31, 0.32),
    0 14px 28px rgba(120, 53, 15, 0.18);
}

.editor-canvas__flow-hotspot--connect-source::before {
  background: rgba(239, 246, 255, 0.98);
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.34),
    0 14px 28px rgba(37, 99, 235, 0.14);
  opacity: 1;
}

.editor-canvas__flow-hotspot--connect-source::after {
  color: rgba(37, 99, 235, 0.96);
  opacity: 1;
}

.editor-canvas__flow-hotspot--connect-target::before {
  background: rgba(240, 253, 244, 0.98);
  box-shadow:
    inset 0 0 0 1px rgba(34, 197, 94, 0.34),
    0 14px 28px rgba(34, 197, 94, 0.16);
  opacity: 1;
}

.editor-canvas__flow-hotspot--connect-target::after {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.86);
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
  opacity: 1;
}

.editor-canvas__flow-hotspot--top {
  border-radius: 999px;
}

.editor-canvas__anchor {
  fill: var(--editor-anchor-fill, rgba(154, 52, 18, 0.92));
  stroke: rgba(255, 250, 241, 0.96);
  stroke-width: 2;
  cursor: crosshair;
  pointer-events: auto;
  filter: drop-shadow(0 4px 8px rgba(120, 53, 15, 0.18));
  transition:
    transform 120ms ease,
    fill 120ms ease,
    stroke 120ms ease,
    r 120ms ease;
}

.editor-canvas__anchor--state {
  stroke-width: 2.2;
}

.editor-canvas__anchor--route {
  --editor-anchor-fill: rgba(124, 58, 237, 0.92);
}

.editor-canvas__anchor--connect-source {
  --editor-anchor-fill: rgba(37, 99, 235, 0.96);
  stroke: rgba(219, 234, 254, 0.98);
}

.editor-canvas__anchor--connect-target {
  --editor-anchor-fill: rgba(34, 197, 94, 0.92);
  stroke: rgba(220, 252, 231, 0.98);
}

.editor-canvas__node {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  isolation: isolate;
  transition: filter 180ms ease;
}

.editor-canvas__node:hover,
.editor-canvas__node:focus-within,
.editor-canvas__node--selected {
  z-index: 8;
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
