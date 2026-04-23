<template>
  <section
    ref="canvasRef"
    class="editor-canvas"
    :class="{
      'editor-canvas--connecting': Boolean(pendingConnection),
      'editor-canvas--panning': viewport.isPanning.value,
      'editor-canvas--locked': interactionLocked,
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
    <div
      class="editor-canvas__edge-view-toolbar"
      role="toolbar"
      aria-label="线条显示模式"
      @pointerdown.stop
      @pointerup.stop
      @dblclick.stop
      @click.stop
      @wheel.stop
    >
      <button
        v-for="option in EDGE_VISIBILITY_MODE_OPTIONS"
        :key="option.mode"
        type="button"
        class="editor-canvas__edge-view-button"
        :class="{ 'editor-canvas__edge-view-button--active': edgeVisibilityMode === option.mode }"
        :title="option.title"
        :aria-pressed="edgeVisibilityMode === option.mode"
        @click.stop="setEdgeVisibilityMode(option.mode)"
      >
        {{ option.label }}
      </button>
    </div>
    <div v-if="interactionLocked" class="editor-canvas__lock-banner" aria-live="polite">
      Run paused · Graph locked
    </div>
    <div class="editor-canvas__viewport" :style="viewportStyle">
      <div v-if="nodeEntries.length === 0" class="editor-canvas__empty-state">
        <div class="editor-canvas__empty-card">
          <div class="editor-canvas__empty-eyebrow">Empty Canvas</div>
          <div class="editor-canvas__empty-title">Double click to create your first node</div>
          <div class="editor-canvas__empty-copy">Drag from an output handle into empty space to get type-aware preset suggestions.</div>
        </div>
      </div>
      <svg class="editor-canvas__edges" viewBox="0 0 4000 3000" preserveAspectRatio="none" aria-hidden="true">
        <path
          v-if="connectionPreview"
          :d="connectionPreview.path"
          class="editor-canvas__edge editor-canvas__edge--preview"
          :style="connectionPreviewStyle"
          :class="{
            'editor-canvas__edge--flow': connectionPreview.kind === 'flow',
            'editor-canvas__edge--route': connectionPreview.kind === 'route',
            'editor-canvas__edge--data': connectionPreview.kind === 'data',
          }"
        />
        <path
          v-for="edge in projectedEdges.filter((edge) => edge.kind === 'flow' || edge.kind === 'route')"
          :key="`${edge.id}:highlight`"
          v-show="isProjectedEdgeVisible(edge)"
          :d="edge.path"
          class="editor-canvas__edge-delete-highlight"
          :style="edgeStyle(edge)"
          :class="{ 'editor-canvas__edge-delete-highlight--active': isFlowEdgeDeleteConfirmOpen(edge.id) }"
        />
        <path
          v-for="edge in projectedEdges.filter((edge) => edge.kind === 'data')"
          :key="`${edge.id}:data-highlight`"
          v-show="isProjectedEdgeVisible(edge)"
          :d="edge.path"
          class="editor-canvas__edge-data-highlight"
          :style="edgeStyle(edge)"
          :class="{ 'editor-canvas__edge-data-highlight--active': isDataEdgeStateInteractionOpen(edge) }"
        />
        <path
          v-for="edge in projectedEdges"
          :key="edge.id"
          v-show="isProjectedEdgeVisible(edge)"
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
        />
        <path
          v-for="edge in projectedEdges"
          :key="`${edge.id}:hitarea`"
          v-show="isProjectedEdgeVisible(edge)"
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
      </div>
      <div
        v-for="[nodeId, node] in nodeEntries"
        :key="nodeId"
        :ref="(element) => registerNodeRef(nodeId, element)"
        class="editor-canvas__node"
        :class="{ 'editor-canvas__node--selected': isNodeVisuallySelected(nodeId) }"
        :style="nodeStyle(node.ui.position)"
        @pointerenter="setHoveredNode(nodeId)"
        @pointerleave="clearHoveredNode(nodeId)"
        @pointerdown.capture="handleLockedNodePointerCapture(nodeId, $event)"
        @pointerdown.stop="handleNodePointerDown(nodeId, $event)"
        @click.capture="handleNodeClickCapture(nodeId, $event)"
      >
        <div
          v-if="resolveRunNodePresentationForNode(nodeId)?.haloClass"
          class="editor-canvas__node-halo"
          :class="resolveRunNodePresentationForNode(nodeId)?.haloClass"
        />
        <NodeCard
          :class="resolveRunNodeClassList(nodeId)"
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
          :agent-breakpoint-enabled="isAgentBreakpointEnabledInDocument(document, nodeId)"
          :agent-breakpoint-timing="resolveAgentBreakpointTimingInDocument(document, nodeId)"
          :condition-route-targets="conditionRouteTargetsByNodeId[nodeId] ?? undefined"
          :latest-run-status="latestRunStatus ?? null"
          :run-output-preview-text="runOutputPreviewByNodeId?.[nodeId]?.text ?? null"
          :run-output-display-mode="runOutputPreviewByNodeId?.[nodeId]?.displayMode ?? null"
          :run-failure-message="runFailureMessageByNodeId?.[nodeId] ?? null"
          :pending-state-input-source="pendingAgentInputSourceByNodeId[nodeId] ?? null"
          :human-review-pending="isHumanReviewNode(nodeId)"
          :selected="isNodeVisuallySelected(nodeId)"
          @update-node-metadata="emit('update-node-metadata', $event)"
          @update-input-config="emit('update-input-config', $event)"
          @update-input-state="emit('update-input-state', $event)"
          @rename-state="emit('rename-state', $event)"
          @update-state="emit('update-state', $event)"
          @remove-port-state="emit('remove-port-state', $event)"
          @update-agent-config="emit('update-agent-config', $event)"
          @toggle-agent-breakpoint="emit('toggle-agent-breakpoint', $event)"
          @update-agent-breakpoint-timing="emit('update-agent-breakpoint-timing', $event)"
          @update-condition-config="emit('update-condition-config', $event)"
          @update-condition-branch="emit('update-condition-branch', $event)"
          @add-condition-branch="emit('add-condition-branch', $event)"
          @remove-condition-branch="emit('remove-condition-branch', $event)"
          @bind-port-state="emit('bind-port-state', $event)"
          @create-port-state="emit('create-port-state', $event)"
          @delete-node="emit('delete-node', $event)"
          @save-node-preset="emit('save-node-preset', $event)"
          @open-human-review="emit('open-human-review', $event)"
          @update-output-config="emit('update-output-config', $event)"
        />
      </div>
      <div class="editor-canvas__flow-hotspots" aria-hidden="true">
        <div
          v-for="anchor in flowAnchors"
          :key="`flow-${anchor.id}`"
          class="editor-canvas__flow-hotspot"
          :style="[flowHotspotStyle(anchor), flowHotspotConnectStyle(anchor)]"
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
      <div class="editor-canvas__route-handles" aria-hidden="true">
        <div
          v-for="anchor in routeHandles"
          :key="`route-${anchor.id}`"
          class="editor-canvas__flow-hotspot editor-canvas__flow-hotspot--outbound editor-canvas__route-handle"
          :class="{
            'editor-canvas__flow-hotspot--visible': isFlowHotspotVisible(anchor),
            'editor-canvas__route-handle--success': resolveRouteHandleTone(anchor.branch) === 'success',
            'editor-canvas__route-handle--danger': resolveRouteHandleTone(anchor.branch) === 'danger',
            'editor-canvas__route-handle--warning': resolveRouteHandleTone(anchor.branch) === 'warning',
            'editor-canvas__route-handle--neutral': resolveRouteHandleTone(anchor.branch) === 'neutral',
            'editor-canvas__flow-hotspot--connect-source': activeConnectionSourceAnchorId === anchor.id,
            'editor-canvas__route-handle--connect-source': activeConnectionSourceAnchorId === anchor.id,
          }"
          :style="[routeHandleStyle(anchor), flowHotspotConnectStyle(anchor)]"
          @pointerenter="setHoveredFlowHandleNode(anchor.nodeId)"
          @pointerleave="clearHoveredFlowHandleNode(anchor.nodeId)"
          @pointerdown.prevent.stop="handleAnchorPointerDown(anchor)"
        >
          <span class="editor-canvas__route-handle-label">{{ anchor.branch }}</span>
        </div>
      </div>
      <svg class="editor-canvas__anchors" viewBox="0 0 4000 3000" preserveAspectRatio="none" aria-hidden="true">
        <circle
          v-for="anchor in pointAnchors"
          :key="anchor.id"
          :cx="anchor.x"
          :cy="anchor.y"
          class="editor-canvas__anchor"
          :style="[anchorStyle(anchor), anchorConnectStyle(anchor)]"
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
    <EditorMinimap
      class="editor-canvas__minimap"
      :nodes="minimapNodes"
      :edges="minimapEdges"
      :viewport="viewport.viewport"
      :canvas-size="canvasSize"
      @center-view="handleMinimapCenterView"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import { Check } from "@element-plus/icons-vue";

import { buildAnchorModel } from "@/editor/anchors/anchorModel";
import EditorMinimap from "./EditorMinimap.vue";
import NodeCard from "@/editor/nodes/NodeCard.vue";
import StateEditorPopover from "@/editor/nodes/StateEditorPopover.vue";
import { type ProjectedCanvasAnchor, type ProjectedCanvasEdge } from "@/editor/canvas/edgeProjection";
import { buildPendingConnectionPreviewPath } from "@/editor/canvas/connectionPreviewPath";
import { resolveFlowAnchorOffset } from "@/editor/canvas/flowAnchorLayout";
import { FLOW_OUT_HOTSPOT_GEOMETRY } from "@/editor/flowHandleGeometry";
import { resolveEdgeRunPresentation } from "@/editor/canvas/runEdgePresentation";
import { resolveNodeRunPresentation } from "@/editor/canvas/runNodePresentation";
import { resolveCanvasLayout, type MeasuredAnchorOffset } from "@/editor/canvas/resolvedCanvasLayout";
import { resolveCanvasSurfaceStyle } from "@/editor/canvas/canvasSurfaceStyle";
import {
  EDGE_VISIBILITY_MODE_OPTIONS,
  filterProjectedEdgesForVisibilityMode,
  type EdgeVisibilityMode,
} from "./edgeVisibilityModel";
import {
  defaultValueForStateType,
  resolveStateColorOptions,
  STATE_FIELD_TYPE_OPTIONS,
  type StateFieldDraft,
  type StateFieldType,
} from "@/editor/workspace/statePanelFields";
import { canCompleteGraphConnection, canStartGraphConnection, type PendingGraphConnection } from "@/lib/graph-connections";
import { CREATE_AGENT_INPUT_STATE_KEY } from "@/lib/virtual-any-input";
import { resolveFocusedViewport } from "@/editor/canvas/focusNodeViewport";
import { resolveViewportForMinimapCenter } from "./minimapModel";
import { useNodeSelectionFocus, type NodeFocusRequest } from "./useNodeSelectionFocus";
import { useViewport } from "./useViewport";
import { isAgentBreakpointEnabledInDocument, resolveAgentBreakpointTimingInDocument } from "@/lib/graph-document";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { SkillDefinition } from "@/types/skills";
import type { AgentNode, ConditionNode, GraphDocument, GraphNode, GraphPayload, GraphPosition, InputNode, OutputNode, StateDefinition } from "@/types/node-system";

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
  interactionLocked?: boolean;
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
  (event: "toggle-agent-breakpoint", payload: { nodeId: string; enabled: boolean }): void;
  (event: "update-agent-breakpoint-timing", payload: { nodeId: string; timing: "before" | "after" }): void;
  (event: "update-condition-config", payload: { nodeId: string; patch: Partial<ConditionNode["config"]> }): void;
  (event: "update-condition-branch", payload: { nodeId: string; currentKey: string; nextKey: string; mappingKeys: string[] }): void;
  (event: "add-condition-branch", payload: { nodeId: string }): void;
  (event: "remove-condition-branch", payload: { nodeId: string; branchKey: string }): void;
  (event: "bind-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "create-port-state", payload: { nodeId: string; side: "input" | "output"; field: { key: string; definition: StateDefinition } }): void;
  (event: "delete-node", payload: { nodeId: string }): void;
  (event: "save-node-preset", payload: { nodeId: string }): void;
  (event: "open-human-review", payload: { nodeId: string }): void;
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
type MeasuredNodeSize = {
  width: number;
  height: number;
};
type PendingStateInputSource = {
  stateKey: string;
  label: string;
  stateColor: string;
};
const STATE_INPUT_HIT_PADDING = 8;
const measuredNodeSizes = ref<Record<string, MeasuredNodeSize>>({});
const canvasSize = ref({ width: 0, height: 0 });
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
  captureElement: HTMLElement | null;
  moved: boolean;
} | null>(null);
const activeCanvasPointers = new Map<number, { clientX: number; clientY: number; pointerType: string }>();
const pinchZoom = ref<{
  pointerIds: [number, number];
  startDistance: number;
  startScale: number;
  centerClientX: number;
  centerClientY: number;
} | null>(null);
const suppressedNodeClickId = ref<string | null>(null);
const suppressedNodeClickTimeoutRef = ref<number | null>(null);
const pendingConnection = ref<PendingGraphConnection | null>(null);
const pendingConnectionPoint = ref<{ x: number; y: number } | null>(null);
const autoSnappedTargetAnchor = ref<ProjectedCanvasAnchor | null>(null);
const selectedEdgeId = ref<string | null>(null);
const edgeVisibilityMode = ref<EdgeVisibilityMode>("smart");
const activeFlowEdgeDeleteConfirm = ref<{
  id: string;
  kind: "flow" | "route";
  source: string;
  target: string;
  branch?: string;
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
  id: string;
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
let scheduledDragFrame: number | null = null;
let pendingDragFrameCallback: (() => void) | null = null;
let canvasResizeObserver: ResizeObserver | null = null;

const nodeEntries = computed(() => Object.entries(props.document.nodes));
const minimapNodes = computed(() =>
  nodeEntries.value.map(([nodeId, node]) => {
    const measuredSize = measuredNodeSizes.value[nodeId];
    const fallbackSize = resolveFallbackNodeSize(node);
    return {
      id: nodeId,
      kind: node.kind,
      x: node.ui.position.x,
      y: node.ui.position.y,
      width: measuredSize?.width ?? fallbackSize.width,
      height: measuredSize?.height ?? fallbackSize.height,
      selected: selection.selectedNodeId.value === nodeId,
      runState: resolveMinimapRunState(props.runNodeStatusByNodeId?.[nodeId]),
    };
  }),
);
const minimapEdges = computed(() =>
  projectedEdges.value.map((edge) => ({
    id: edge.id,
    kind: edge.kind,
    path: edge.path,
    color: edge.kind === "route" ? resolveRouteHandlePalette(edge.branch).accent : edge.color,
  })),
);
const conditionRouteTargetsByNodeId = computed(() =>
  Object.fromEntries(
    Object.entries(props.document.nodes)
      .filter(([, node]) => node.kind === "condition")
      .map(([nodeId]) => [nodeId, buildConditionRouteTargets(props.document, nodeId)]),
  ) as Record<string, Record<string, string | null>>,
);
const resolvedCanvasLayout = computed(() => resolveCanvasLayout(props.document, measuredAnchorOffsets.value));
const projectedEdges = computed(() => resolvedCanvasLayout.value.edges);
const edgeVisibilityRelatedNodeIds = computed(() => {
  const nodeIds = new Set<string>();
  if (selection.selectedNodeId.value) {
    nodeIds.add(selection.selectedNodeId.value);
  }
  if (hoveredNodeId.value) {
    nodeIds.add(hoveredNodeId.value);
  }
  return nodeIds;
});
const forceVisibleProjectedEdgeIds = computed(() => {
  const edgeIds = new Set<string>();
  if (selectedEdgeId.value) {
    edgeIds.add(selectedEdgeId.value);
  }
  if (activeDataEdgeStateConfirm.value?.id) {
    edgeIds.add(activeDataEdgeStateConfirm.value.id);
  }
  if (activeDataEdgeStateEditor.value?.id) {
    edgeIds.add(activeDataEdgeStateEditor.value.id);
  }
  if (activeFlowEdgeDeleteConfirm.value?.id) {
    edgeIds.add(activeFlowEdgeDeleteConfirm.value.id);
  }
  return edgeIds;
});
const visibleProjectedEdgeIds = computed(
  () =>
    new Set(
      filterProjectedEdgesForVisibilityMode(projectedEdges.value, {
        mode: edgeVisibilityMode.value,
        relatedNodeIds: edgeVisibilityRelatedNodeIds.value,
        forceVisibleEdgeIds: forceVisibleProjectedEdgeIds.value,
      }).map((edge) => edge.id),
    ),
);
const pendingAgentInputSourceByNodeId = computed<Record<string, PendingStateInputSource>>(() => {
  const connection = pendingConnection.value;
  if (connection?.sourceKind !== "state-out" || !connection.sourceStateKey) {
    return {};
  }

  const sourceStateKey = connection.sourceStateKey;
  const sourceState = props.document.state_schema[sourceStateKey];
  const pendingSource = {
    stateKey: sourceStateKey,
    label: sourceState?.name?.trim() || sourceStateKey,
    stateColor: sourceState?.color?.trim() || "#d97706",
  };

  return Object.fromEntries(
    Object.entries(props.document.nodes)
      .filter(([, node]) => node.kind === "agent")
      .filter(([nodeId]) =>
        canCompleteGraphConnection(props.document, connection, {
          nodeId,
          kind: "state-in",
          stateKey: CREATE_AGENT_INPUT_STATE_KEY,
        }),
      )
      .map(([nodeId]) => [nodeId, pendingSource]),
  );
});
const baseProjectedAnchors = computed(() => resolvedCanvasLayout.value.anchors);
const transientAgentInputAnchors = computed<ProjectedCanvasAnchor[]>(() =>
  Object.entries(pendingAgentInputSourceByNodeId.value).flatMap(([nodeId, source]) => {
    const node = props.document.nodes[nodeId];
    const anchorId = `${nodeId}:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`;
    const measuredOffset = measuredAnchorOffsets.value[anchorId];
    if (!node || !measuredOffset) {
      return [];
    }

    return [
      {
        id: anchorId,
        nodeId,
        kind: "state-in" as const,
        x: node.ui.position.x + measuredOffset.offsetX,
        y: node.ui.position.y + measuredOffset.offsetY,
        side: "left" as const,
        color: source.stateColor,
        stateKey: CREATE_AGENT_INPUT_STATE_KEY,
      },
    ];
  }),
);
const projectedAnchors = computed(() => [...baseProjectedAnchors.value, ...transientAgentInputAnchors.value]);
const flowAnchors = computed(() =>
  projectedAnchors.value.filter((anchor) => anchor.kind === "flow-in" || anchor.kind === "flow-out"),
);
const routeHandles = computed(() => projectedAnchors.value.filter((anchor) => anchor.kind === "route-out"));
const pointAnchors = computed(() =>
  projectedAnchors.value.filter((anchor) => anchor.kind === "state-in" || anchor.kind === "state-out"),
);
const selectedReconnectConnection = computed<PendingGraphConnection | null>(() => {
  if (activeFlowEdgeDeleteConfirm.value?.id === selectedEdgeId.value) {
    return null;
  }

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
const activeConnectionAccentColor = computed(() => {
  if (activeConnection.value?.sourceKind === "state-out" && activeConnection.value.sourceStateKey) {
    return props.document.state_schema[activeConnection.value.sourceStateKey]?.color?.trim() || "#2563eb";
  }
  if (activeConnection.value?.sourceKind === "route-out" && activeConnection.value.branchKey) {
    return resolveRouteHandlePalette(activeConnection.value.branchKey).accent;
  }
  return "#c96b1f";
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
    }),
  };
});
const connectionPreviewStyle = computed(() => {
  const accent = activeConnectionAccentColor.value;
  if (!connectionPreview.value) {
    return undefined;
  }

  if (connectionPreview.value.kind === "data") {
    return {
      "--editor-connection-preview-stroke": withAlpha(accent, 0.82),
    };
  }

  if (connectionPreview.value.kind === "route") {
    return {
      "--editor-connection-preview-stroke": withAlpha(accent, 0.78),
    };
  }

  return {
    "--editor-connection-preview-stroke": withAlpha(accent, 0.76),
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

function isDataEdgeStateInteractionOpen(edge: Pick<ProjectedCanvasEdge, "kind" | "source" | "target" | "state">) {
  return isActiveDataEdge(edge, activeDataEdgeStateConfirm.value) || isActiveDataEdge(edge, activeDataEdgeStateEditor.value);
}

function isProjectedEdgeVisible(edge: ProjectedCanvasEdge) {
  return visibleProjectedEdgeIds.value.has(edge.id);
}

function setEdgeVisibilityMode(mode: EdgeVisibilityMode) {
  if (edgeVisibilityMode.value === mode) {
    return;
  }

  edgeVisibilityMode.value = mode;
  selectedEdgeId.value = null;
  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  clearCanvasTransientState();
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

watch(pendingAgentInputSourceByNodeId, () => {
  void nextTick().then(() => {
    scheduleAnchorMeasurement();
  });
});

onMounted(() => {
  updateCanvasSize();
  attachCanvasResizeObserver();
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
  cancelScheduledDragFrame();

  canvasResizeObserver?.disconnect();
  canvasResizeObserver = null;

  clearFlowEdgeDeleteConfirmState();
  clearDataEdgeStateInteraction();
});

function updateCanvasSize() {
  const element = canvasRef.value;
  if (!element) {
    return;
  }

  const nextSize = {
    width: element.clientWidth,
    height: element.clientHeight,
  };
  if (canvasSize.value.width !== nextSize.width || canvasSize.value.height !== nextSize.height) {
    canvasSize.value = nextSize;
  }
}

function attachCanvasResizeObserver() {
  if (typeof ResizeObserver === "undefined" || !canvasRef.value) {
    return;
  }

  canvasResizeObserver?.disconnect();
  canvasResizeObserver = new ResizeObserver(() => {
    updateCanvasSize();
  });
  canvasResizeObserver.observe(canvasRef.value);
}

function clearFlowEdgeDeleteConfirmTimeout() {
  if (flowEdgeDeleteConfirmTimeoutRef.value !== null) {
    window.clearTimeout(flowEdgeDeleteConfirmTimeoutRef.value);
    flowEdgeDeleteConfirmTimeoutRef.value = null;
  }
}

function clearFlowEdgeDeleteConfirmState() {
  clearFlowEdgeDeleteConfirmTimeout();
  const confirmEdgeId = activeFlowEdgeDeleteConfirm.value?.id ?? null;
  activeFlowEdgeDeleteConfirm.value = null;
  if (confirmEdgeId && selectedEdgeId.value === confirmEdgeId) {
    selectedEdgeId.value = null;
  }
}

function clearDataEdgeStateConfirmTimeout() {
  if (dataEdgeStateConfirmTimeoutRef.value !== null) {
    window.clearTimeout(dataEdgeStateConfirmTimeoutRef.value);
    dataEdgeStateConfirmTimeoutRef.value = null;
  }
}

function clearDataEdgeStateConfirmState() {
  clearDataEdgeStateConfirmTimeout();
  const confirmEdgeId = activeDataEdgeStateConfirm.value?.id ?? null;
  activeDataEdgeStateConfirm.value = null;
  if (confirmEdgeId && activeDataEdgeStateEditor.value?.id !== confirmEdgeId && selectedEdgeId.value === confirmEdgeId) {
    selectedEdgeId.value = null;
  }
}

function closeDataEdgeStateEditor() {
  const editorEdgeId = activeDataEdgeStateEditor.value?.id ?? null;
  activeDataEdgeStateEditor.value = null;
  dataEdgeStateDraft.value = null;
  dataEdgeStateError.value = null;
  if (editorEdgeId && selectedEdgeId.value === editorEdgeId) {
    selectedEdgeId.value = null;
  }
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
    kind: edge.kind === "route" ? "route" : "flow",
    source: edge.source,
    target: edge.target,
    ...(edge.kind === "route" && edge.branch ? { branch: edge.branch } : {}),
    x: point.x,
    y: point.y,
  };
  selectedEdgeId.value = edge.id;
  flowEdgeDeleteConfirmTimeoutRef.value = window.setTimeout(() => {
    flowEdgeDeleteConfirmTimeoutRef.value = null;
    if (activeFlowEdgeDeleteConfirm.value?.id === edge.id) {
      clearFlowEdgeDeleteConfirmState();
    }
  }, 2000);
}

function confirmFlowEdgeDelete() {
  if (!activeFlowEdgeDeleteConfirm.value) {
    return;
  }

  if (activeFlowEdgeDeleteConfirm.value.kind === "route" && activeFlowEdgeDeleteConfirm.value.branch) {
    emit("remove-route", {
      sourceNodeId: activeFlowEdgeDeleteConfirm.value.source,
      branchKey: activeFlowEdgeDeleteConfirm.value.branch,
    });
    clearFlowEdgeDeleteConfirmState();
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
  selectedEdgeId.value = edge.id;
  dataEdgeStateConfirmTimeoutRef.value = window.setTimeout(() => {
    dataEdgeStateConfirmTimeoutRef.value = null;
    if (activeDataEdgeStateConfirm.value?.id === edge.id) {
      clearDataEdgeStateConfirmState();
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
    id: activeDataEdgeStateConfirm.value.id,
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

function nodeStyle(position: GraphPosition) {
  return {
    transform: `translate(${position.x}px, ${position.y}px)`,
  };
}

function resolveFallbackNodeSize(node: GraphNode): MeasuredNodeSize {
  if (node.kind === "condition") {
    return { width: 560, height: 280 };
  }
  if (node.kind === "output") {
    return { width: 460, height: 340 };
  }
  if (node.kind === "input") {
    return { width: 460, height: 320 };
  }
  return { width: 460, height: 360 };
}

function resolveMinimapRunState(status: string | undefined) {
  if (status === "running" || status === "resuming") {
    return "running";
  }
  if (status === "success" || status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "failed";
  }
  return null;
}

function handleMinimapCenterView(point: { worldX: number; worldY: number }) {
  updateCanvasSize();
  if (canvasSize.value.width <= 0 || canvasSize.value.height <= 0) {
    return;
  }

  viewport.setViewport(
    resolveViewportForMinimapCenter({
      worldX: point.worldX,
      worldY: point.worldY,
      viewportScale: viewport.viewport.scale,
      canvasWidth: canvasSize.value.width,
      canvasHeight: canvasSize.value.height,
    }),
  );
  canvasRef.value?.focus();
}

function edgeStyle(edge: ProjectedCanvasEdge) {
  if (edge.kind === "route" && edge.branch) {
    const accent = resolveRouteHandlePalette(edge.branch).accent;
    return {
      "--editor-edge-stroke": withAlpha(accent, 0.88),
      "--editor-edge-outline": withAlpha(accent, 0.16),
    };
  }
  if (!edge.color) {
    return undefined;
  }
  return {
    "--editor-edge-stroke": edge.color,
    "--editor-edge-outline": withAlpha(edge.color, 0.18),
    "--editor-edge-outline-active": withAlpha(edge.color, 0.32),
  };
}

function withAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(37, 99, 235, ${alpha})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function resolveRouteHandleTone(branch: string | undefined) {
  const normalizedBranch = branch?.trim().toLowerCase() ?? "";
  if (normalizedBranch === "true") {
    return "success" as const;
  }
  if (normalizedBranch === "false") {
    return "danger" as const;
  }
  if (normalizedBranch === "exhausted" || normalizedBranch === "exausted") {
    return "neutral" as const;
  }
  return "warning" as const;
}

function resolveRouteHandlePalette(branch: string | undefined) {
  const tone = resolveRouteHandleTone(branch);
  if (tone === "success") {
    return {
      fill: "rgba(240, 253, 244, 0.98)",
      border: "rgba(34, 197, 94, 0.28)",
      accent: "#16a34a",
      glow: "rgba(34, 197, 94, 0.18)",
      text: "rgba(21, 128, 61, 0.92)",
    };
  }
  if (tone === "danger") {
    return {
      fill: "rgba(254, 242, 242, 0.98)",
      border: "rgba(239, 68, 68, 0.24)",
      accent: "#dc2626",
      glow: "rgba(239, 68, 68, 0.18)",
      text: "rgba(185, 28, 28, 0.92)",
    };
  }
  if (tone === "neutral") {
    return {
      fill: "rgba(245, 241, 234, 0.98)",
      border: "rgba(120, 113, 108, 0.24)",
      accent: "#78716c",
      glow: "rgba(120, 113, 108, 0.18)",
      text: "rgba(87, 83, 78, 0.92)",
    };
  }
  return {
    fill: "rgba(255, 251, 235, 0.98)",
    border: "rgba(245, 158, 11, 0.26)",
    accent: "#d97706",
    glow: "rgba(245, 158, 11, 0.18)",
    text: "rgba(161, 98, 7, 0.92)",
  };
}

function routeHandleStyle(anchor: ProjectedCanvasAnchor) {
  const palette = resolveRouteHandlePalette(anchor.branch);
  return {
    ...resolveFlowOutHotspotStyle(anchor),
    "--editor-flow-handle-fill": palette.fill,
    "--editor-flow-handle-border": palette.border,
    "--editor-flow-handle-accent": palette.accent,
    "--editor-flow-handle-glow": palette.glow,
  };
}

function resolveFlowOutHotspotStyle(anchor: ProjectedCanvasAnchor) {
  return {
    left: `${anchor.x + FLOW_OUT_HOTSPOT_GEOMETRY.offsetX}px`,
    top: `${anchor.y}px`,
    width: `${FLOW_OUT_HOTSPOT_GEOMETRY.width}px`,
    height: `${FLOW_OUT_HOTSPOT_GEOMETRY.height}px`,
  };
}

function flowHotspotStyle(anchor: ProjectedCanvasAnchor) {
  const isVertical = anchor.side === "left" || anchor.side === "right";
  let left = anchor.x;
  let top = anchor.y;
  let width = isVertical ? 22 : 86;
  let height = isVertical ? 86 : 22;

  if (anchor.kind === "flow-out" && anchor.side === "right") {
    return resolveFlowOutHotspotStyle(anchor);
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

function flowHotspotConnectStyle(anchor: ProjectedCanvasAnchor) {
  const isSource = activeConnectionSourceAnchorId.value === anchor.id;
  const isTarget = eligibleTargetAnchorIds.value.has(anchor.id);
  if (!isSource && !isTarget) {
    return undefined;
  }

  const accent = activeConnectionAccentColor.value;
  if (activeConnection.value?.sourceKind === "state-out") {
    return {
      "--editor-connection-source-fill": withAlpha(accent, 0.16),
      "--editor-connection-source-border": withAlpha(accent, 0.34),
      "--editor-connection-source-glow": withAlpha(accent, 0.14),
      "--editor-connection-source-symbol": withAlpha(accent, 0.96),
      "--editor-connection-target-fill": withAlpha(accent, 0.12),
      "--editor-connection-target-border": withAlpha(accent, 0.28),
      "--editor-connection-target-glow": withAlpha(accent, 0.16),
      "--editor-connection-target-anchor": withAlpha(accent, 0.92),
    };
  }

  return undefined;
}

function anchorStyle(anchor: ProjectedCanvasAnchor) {
  if (!anchor.color) {
    return undefined;
  }
  return {
    "--editor-anchor-fill": anchor.color,
  };
}

function anchorConnectStyle(anchor: ProjectedCanvasAnchor) {
  const isSource = activeConnectionSourceAnchorId.value === anchor.id;
  const isTarget = eligibleTargetAnchorIds.value.has(anchor.id);
  if (!isSource && !isTarget) {
    return undefined;
  }

  const accent = activeConnectionAccentColor.value;
  if (activeConnection.value?.sourceKind === "state-out") {
    return {
      "--editor-connection-source-anchor": withAlpha(accent, 0.96),
      "--editor-connection-source-stroke": withAlpha(accent, 0.24),
      "--editor-connection-target-anchor": withAlpha(accent, 0.92),
      "--editor-connection-target-stroke": withAlpha(accent, 0.18),
    };
  }

  return undefined;
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

function scheduleDragFrame(callback: () => void) {
  pendingDragFrameCallback = callback;

  if (scheduledDragFrame !== null) {
    return;
  }

  scheduledDragFrame = window.requestAnimationFrame(() => {
    scheduledDragFrame = null;
    const pendingCallback = pendingDragFrameCallback;
    pendingDragFrameCallback = null;
    pendingCallback?.();
  });
}

function flushScheduledDragFrame() {
  if (scheduledDragFrame === null) {
    return;
  }

  window.cancelAnimationFrame(scheduledDragFrame);
  scheduledDragFrame = null;
  const pendingCallback = pendingDragFrameCallback;
  pendingDragFrameCallback = null;
  pendingCallback?.();
}

function cancelScheduledDragFrame() {
  if (scheduledDragFrame !== null) {
    window.cancelAnimationFrame(scheduledDragFrame);
    scheduledDragFrame = null;
  }
  pendingDragFrameCallback = null;
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
    const node = props.document.nodes[nodeId];
    if (!nodeElement) {
      continue;
    }

    const nodeRect = nodeElement.getBoundingClientRect();
    const scale = viewport.viewport.scale || 1;
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
  if (didNodeSizeChange || Object.keys(nextNodeSizes).length !== Object.keys(measuredNodeSizes.value).length) {
    measuredNodeSizes.value = nextNodeSizes;
  }
}

function roundMeasuredOffset(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clearPinchZoom() {
  pinchZoom.value = null;
  activeCanvasPointers.clear();
}

function resolvePointerDistance(left: { clientX: number; clientY: number }, right: { clientX: number; clientY: number }) {
  return Math.hypot(right.clientX - left.clientX, right.clientY - left.clientY);
}

function resolvePointerCenter(left: { clientX: number; clientY: number }, right: { clientX: number; clientY: number }) {
  return {
    clientX: (left.clientX + right.clientX) / 2,
    clientY: (left.clientY + right.clientY) / 2,
  };
}

function beginPinchZoomIfReady() {
  const touchPointers = Array.from(activeCanvasPointers.entries()).filter(([, pointer]) => pointer.pointerType === "touch");
  if (touchPointers.length < 2) {
    return false;
  }

  const [leftEntry, rightEntry] = touchPointers;
  if (!leftEntry || !rightEntry) {
    return false;
  }

  const [, leftPointer] = leftEntry;
  const [, rightPointer] = rightEntry;
  const startDistance = resolvePointerDistance(leftPointer, rightPointer);
  if (startDistance <= 0) {
    return false;
  }

  const center = resolvePointerCenter(leftPointer, rightPointer);
  viewport.endPan();
  pinchZoom.value = {
    pointerIds: [leftEntry[0], rightEntry[0]],
    startDistance,
    startScale: viewport.viewport.scale,
    centerClientX: center.clientX,
    centerClientY: center.clientY,
  };
  return true;
}

function updatePinchZoom() {
  const pinch = pinchZoom.value;
  if (!pinch) {
    return;
  }

  const leftPointer = activeCanvasPointers.get(pinch.pointerIds[0]);
  const rightPointer = activeCanvasPointers.get(pinch.pointerIds[1]);
  const canvas = canvasRef.value;
  if (!leftPointer || !rightPointer || !canvas) {
    clearPinchZoom();
    return;
  }

  const nextDistance = resolvePointerDistance(leftPointer, rightPointer);
  if (nextDistance <= 0) {
    return;
  }

  const center = resolvePointerCenter(leftPointer, rightPointer);
  const rect = canvas.getBoundingClientRect();
  viewport.zoomAt({
    clientX: center.clientX,
    clientY: center.clientY,
    canvasLeft: rect.left,
    canvasTop: rect.top,
    nextScale: pinch.startScale * (nextDistance / pinch.startDistance),
  });
}

function handleCanvasPointerDown(event: PointerEvent) {
  if (event.pointerType === "touch") {
    activeCanvasPointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
    });
    if (beginPinchZoomIfReady()) {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      clearCanvasTransientState();
      pendingConnection.value = null;
      pendingConnectionPoint.value = null;
      selectedEdgeId.value = null;
      selection.clearSelection();
      return;
    }
  }
  canvasRef.value?.focus();
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  canvasRef.value?.setPointerCapture(event.pointerId);
  cancelScheduledDragFrame();
  clearCanvasTransientState();
  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  selectedEdgeId.value = null;
  selection.clearSelection();
  viewport.beginPan(event);
}

function handleCanvasPointerMove(event: PointerEvent) {
  if (event.pointerType === "touch" && activeCanvasPointers.has(event.pointerId)) {
    activeCanvasPointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
    });
    if (pinchZoom.value) {
      event.preventDefault();
      scheduleDragFrame(() => {
        updatePinchZoom();
      });
      return;
    }
  }
  if (activeConnection.value) {
    scheduleDragFrame(() => {
      autoSnappedTargetAnchor.value = resolveAutoSnappedTargetAnchor(event);
      pendingConnectionPoint.value = autoSnappedTargetAnchor.value
        ? { x: autoSnappedTargetAnchor.value.x, y: autoSnappedTargetAnchor.value.y }
        : resolveCanvasPoint(event);
    });
    return;
  }
  if (nodeDrag.value && nodeDrag.value.pointerId === event.pointerId) {
    const pointerDeltaX = event.clientX - nodeDrag.value.startClientX;
    const pointerDeltaY = event.clientY - nodeDrag.value.startClientY;
    if (!nodeDrag.value.moved) {
      if (Math.abs(pointerDeltaX) <= 3 && Math.abs(pointerDeltaY) <= 3) {
        return;
      }
      nodeDrag.value.moved = true;
      if (nodeDrag.value.captureElement && !nodeDrag.value.captureElement.hasPointerCapture(event.pointerId)) {
        nodeDrag.value.captureElement.setPointerCapture(event.pointerId);
      }
    }
    const deltaX = pointerDeltaX / viewport.viewport.scale;
    const deltaY = pointerDeltaY / viewport.viewport.scale;
    const nextPosition = {
      x: Math.round(nodeDrag.value.originX + deltaX),
      y: Math.round(nodeDrag.value.originY + deltaY),
    };
    const nodeId = nodeDrag.value.nodeId;
    scheduleDragFrame(() => {
      emit("update:node-position", {
        nodeId,
        position: nextPosition,
      });
    });
    return;
  }
  if (viewport.isPanning.value) {
    scheduleDragFrame(() => {
      viewport.movePan(event);
    });
  }
}

function handleCanvasPointerUp(event: PointerEvent) {
  flushScheduledDragFrame();
  activeCanvasPointers.delete(event.pointerId);
  if (pinchZoom.value?.pointerIds.includes(event.pointerId)) {
    clearPinchZoom();
    viewport.endPan();
    return;
  }
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId);
  }
  if (nodeDrag.value?.captureElement?.hasPointerCapture(event.pointerId)) {
    nodeDrag.value.captureElement.releasePointerCapture(event.pointerId);
  }
  if (activeConnection.value) {
    if (isGraphEditingLocked()) {
      pendingConnection.value = null;
      pendingConnectionPoint.value = null;
      autoSnappedTargetAnchor.value = null;
      return;
    }
    if (autoSnappedTargetAnchor.value) {
      completePendingConnection(autoSnappedTargetAnchor.value);
      return;
    }
    openCreationMenuFromPendingConnection(event);
  }
  if (nodeDrag.value && nodeDrag.value.pointerId === event.pointerId) {
    if (nodeDrag.value.moved) {
      startSuppressedNodeClickWindow(nodeDrag.value.nodeId);
    }
    nodeDrag.value = null;
  }
  viewport.endPan(event);
}

function clearSuppressedNodeClickWindow() {
  if (suppressedNodeClickTimeoutRef.value !== null) {
    window.clearTimeout(suppressedNodeClickTimeoutRef.value);
    suppressedNodeClickTimeoutRef.value = null;
  }
  suppressedNodeClickId.value = null;
}

function startSuppressedNodeClickWindow(nodeId: string) {
  clearSuppressedNodeClickWindow();
  suppressedNodeClickId.value = nodeId;
  suppressedNodeClickTimeoutRef.value = window.setTimeout(() => {
    suppressedNodeClickTimeoutRef.value = null;
    if (suppressedNodeClickId.value === nodeId) {
      suppressedNodeClickId.value = null;
    }
  }, 80);
}

function handleNodeClickCapture(nodeId: string, event: MouseEvent) {
  if (suppressedNodeClickId.value !== nodeId) {
    return;
  }
  clearSuppressedNodeClickWindow();
  event.preventDefault();
  event.stopPropagation();
}

function handleCanvasDoubleClick(event: MouseEvent) {
  if (isGraphEditingLocked()) {
    return;
  }
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
  if (!activeConnection.value) {
    return null;
  }

  if (activeConnection.value.sourceKind === "state-out") {
    return resolveAutoSnappedStateTargetAnchor(event);
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

function resolveAutoSnappedStateTargetAnchor(event: PointerEvent) {
  for (const anchor of pointAnchors.value) {
    if (anchor.kind !== "state-in" || !eligibleTargetAnchorIds.value.has(anchor.id)) {
      continue;
    }
    if (isPointerWithinAnchorHitElement(anchor, event)) {
      return anchor;
    }
  }

  return null;
}

function isPointerWithinAnchorHitElement(anchor: ProjectedCanvasAnchor, event: PointerEvent) {
  const nodeElement = nodeElementMap.get(anchor.nodeId);
  if (!nodeElement) {
    return false;
  }

  for (const slotElement of nodeElement.querySelectorAll("[data-anchor-slot-id]")) {
    if (!(slotElement instanceof HTMLElement) || slotElement.dataset.anchorSlotId !== anchor.id) {
      continue;
    }

    const hitElement = slotElement.closest("[data-anchor-hitarea='true']");
    const element = hitElement instanceof HTMLElement ? hitElement : slotElement;
    const rect = element.getBoundingClientRect();
    return (
      event.clientX >= rect.left - STATE_INPUT_HIT_PADDING &&
      event.clientX <= rect.right + STATE_INPUT_HIT_PADDING &&
      event.clientY >= rect.top - STATE_INPUT_HIT_PADDING &&
      event.clientY <= rect.bottom + STATE_INPUT_HIT_PADDING
    );
  }

  return false;
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
  if (isGraphEditingLocked()) {
    event.dataTransfer!.dropEffect = "none";
    return;
  }
  event.dataTransfer!.dropEffect = event.dataTransfer?.files?.length ? "copy" : "none";
}

function handleCanvasDrop(event: DragEvent) {
  if (isGraphEditingLocked()) {
    return;
  }
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
  if (isGraphEditingLocked()) {
    event.preventDefault();
    canvasRef.value?.focus();
    clearCanvasTransientState();
    selection.selectNode(nodeId);
    return;
  }
  const target = event.target;
  const preserveInlineEditorFocus =
    target instanceof HTMLElement && Boolean(target.closest("[data-text-editor-trigger='true']"));
  if (activeConnection.value) {
    const snappedAnchor = resolveEligibleTargetAnchorForNodeBody(nodeId);
    if (snappedAnchor) {
      event.preventDefault();
      if (!preserveInlineEditorFocus) {
        canvasRef.value?.focus();
      }
      completePendingConnection(snappedAnchor);
      return;
    }
  }
  if (!preserveInlineEditorFocus) {
    canvasRef.value?.focus();
    event.preventDefault();
  }
  let captureElement: HTMLElement | null = null;
  if (event.currentTarget instanceof HTMLElement) {
    captureElement = event.currentTarget;
    if (!preserveInlineEditorFocus) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  clearCanvasTransientState();
  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  cancelScheduledDragFrame();
  selectedEdgeId.value = null;
  selection.selectNode(nodeId);
  nodeDrag.value = {
    nodeId,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originX: node.ui.position.x,
    originY: node.ui.position.y,
    captureElement,
    moved: false,
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
  if (anchor.kind === "flow-out" || anchor.kind === "route-out") {
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
  if (isGraphEditingLocked()) {
    event.preventDefault();
    return;
  }
  canvasRef.value?.focus();
  clearCanvasTransientState();
  pendingConnection.value = null;
  if (edge.kind === "flow" || edge.kind === "route") {
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
  if (isGraphEditingLocked()) {
    return;
  }
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
  if (isGraphEditingLocked()) {
    return;
  }
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
  if (isGraphEditingLocked()) {
    return;
  }
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
  if (isGraphEditingLocked()) {
    return;
  }
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

function resolveRunNodePresentationForNode(nodeId: string) {
  const status = isHumanReviewNode(nodeId) ? "paused" : props.runNodeStatusByNodeId?.[nodeId];
  return resolveNodeRunPresentation(status, props.currentRunNodeId === nodeId);
}

function resolveRunNodeClassList(nodeId: string) {
  const presentation = resolveRunNodePresentationForNode(nodeId);
  return presentation?.shellClass ? [presentation.shellClass] : [];
}

function isHumanReviewNode(nodeId: string) {
  return props.latestRunStatus === "awaiting_human" && props.currentRunNodeId === nodeId;
}

function isNodeVisuallySelected(nodeId: string) {
  return selection.selectedNodeId.value === nodeId || isHumanReviewNode(nodeId);
}

function isGraphEditingLocked() {
  return Boolean(props.interactionLocked);
}

function handleLockedNodePointerCapture(nodeId: string, event: PointerEvent) {
  if (!isGraphEditingLocked()) {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("[data-human-review-action='true']")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  canvasRef.value?.focus();
  clearCanvasTransientState();
  pendingConnection.value = null;
  pendingConnectionPoint.value = null;
  autoSnappedTargetAnchor.value = null;
  selectedEdgeId.value = null;
  selection.selectNode(nodeId);
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
  overscroll-behavior: none;
  touch-action: none;
  -webkit-touch-callout: none;
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

.editor-canvas--locked {
  cursor: grab;
}

.editor-canvas__lock-banner {
  position: absolute;
  top: 18px;
  left: 50%;
  z-index: 25;
  transform: translateX(-50%);
  padding: 7px 14px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.92);
  color: #9a3412;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  box-shadow: 0 12px 28px rgba(120, 53, 15, 0.1);
  backdrop-filter: blur(14px);
  pointer-events: none;
}

.editor-canvas__edge-view-toolbar {
  position: absolute;
  left: 18px;
  top: 18px;
  z-index: 24;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.88);
  box-shadow: 0 12px 26px rgba(120, 53, 15, 0.1);
  backdrop-filter: blur(14px);
  cursor: default;
  pointer-events: auto;
}

.editor-canvas__edge-view-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(73, 52, 34, 0.72);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  cursor: pointer;
  transition:
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.editor-canvas__edge-view-button:hover {
  background: rgba(154, 52, 18, 0.08);
  color: rgba(75, 42, 18, 0.92);
}

.editor-canvas__edge-view-button--active {
  background: rgba(154, 52, 18, 0.9);
  color: rgba(255, 250, 242, 0.98);
}

.editor-canvas__edge-view-button--active:hover {
  background: rgba(154, 52, 18, 0.9);
  color: rgba(255, 250, 242, 0.98);
}

.editor-canvas__viewport {
  position: absolute;
  inset: 0;
  transform-origin: top left;
}

.editor-canvas__empty-state {
  position: absolute;
  inset: 0;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-inline: clamp(16px, 6vw, 56px);
  pointer-events: none;
}

.editor-canvas__empty-state > * {
  pointer-events: none;
}

.editor-canvas__empty-card {
  box-sizing: border-box;
  width: min(100%, 34rem);
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 28px;
  padding: clamp(22px, 5vw, 34px);
  background: rgba(255, 250, 242, 0.72);
  box-shadow: 0 18px 44px rgba(60, 41, 20, 0.08);
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
  font-size: clamp(1.35rem, 5vw, 2rem);
  font-weight: 600;
  line-height: 1.22;
  overflow-wrap: anywhere;
  color: rgba(35, 25, 18, 0.94);
}

.editor-canvas__empty-copy {
  margin-top: 8px;
  color: rgba(60, 41, 20, 0.74);
}

@media (max-width: 640px) {
  .editor-canvas__empty-card {
    max-width: min(100%, 18rem);
  }
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

.editor-canvas__route-handles {
  position: absolute;
  inset: 0;
  z-index: 12;
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
  stroke: var(--editor-edge-outline, rgba(201, 107, 31, 0.16));
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

.editor-canvas__edge-data-highlight {
  fill: none;
  stroke: var(--editor-edge-outline, rgba(37, 99, 235, 0.18));
  stroke-width: 6px;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  transition:
    stroke 120ms ease,
    stroke-width 120ms ease,
    opacity 120ms ease;
}

.editor-canvas__edge-data-highlight--active {
  stroke: var(--editor-edge-outline-active, rgba(37, 99, 235, 0.32));
  stroke-width: 10px;
}

.editor-canvas__edge--flow {
  stroke: rgba(201, 107, 31, 0.9);
  stroke-width: 4.4;
  stroke-dasharray: 18 22;
  animation: editor-canvas-flow-line 1.8s linear infinite;
  opacity: 0.94;
}

.editor-canvas__edge--route {
  stroke: var(--editor-edge-stroke, rgba(201, 107, 31, 0.88));
  stroke-width: 4.4;
  stroke-dasharray: 18 22;
  animation: editor-canvas-flow-line 1.8s linear infinite;
  opacity: 0.94;
}

.editor-canvas__edge--data {
  stroke: var(--editor-edge-stroke, rgba(37, 99, 235, 0.78));
  stroke-width: 2.7;
  stroke-dasharray: 10 10;
  animation: editor-canvas-ant-line 1.2s linear infinite;
  opacity: 0.94;
}

.editor-canvas__edge--preview {
  stroke: var(--editor-connection-preview-stroke, rgba(37, 99, 235, 0.72));
  stroke-width: 2.8;
  stroke-dasharray: 8 6;
  pointer-events: none;
}

.editor-canvas__edge--preview.editor-canvas__edge--flow,
.editor-canvas__edge--preview.editor-canvas__edge--route {
  stroke: var(--editor-connection-preview-stroke, rgba(201, 107, 31, 0.76));
  stroke-width: 3.8;
  stroke-dasharray: 16 18;
  animation: editor-canvas-flow-line 1.8s linear infinite;
}

.editor-canvas__edge--active-run {
  stroke-width: 3px;
  opacity: 1;
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
  touch-action: none;
}

.editor-canvas__route-handle {
  --editor-flow-handle-fill: rgba(255, 250, 241, 0.98);
  --editor-flow-handle-border: rgba(201, 107, 31, 0.24);
  --editor-flow-handle-accent: rgba(201, 107, 31, 0.92);
  --editor-flow-handle-glow: rgba(120, 53, 15, 0.14);
}

.editor-canvas__route-handle--connect-source {
  --editor-flow-handle-border: var(--editor-flow-handle-accent, rgba(201, 107, 31, 0.32));
}

.editor-canvas__route-handle--success {
  --editor-flow-handle-fill: rgba(240, 253, 244, 0.98);
  --editor-flow-handle-border: rgba(34, 197, 94, 0.28);
  --editor-flow-handle-accent: #16a34a;
  --editor-flow-handle-glow: rgba(34, 197, 94, 0.18);
}

.editor-canvas__route-handle--danger {
  --editor-flow-handle-fill: rgba(254, 242, 242, 0.98);
  --editor-flow-handle-border: rgba(239, 68, 68, 0.24);
  --editor-flow-handle-accent: #dc2626;
  --editor-flow-handle-glow: rgba(239, 68, 68, 0.18);
}

.editor-canvas__route-handle--warning {
  --editor-flow-handle-fill: rgba(255, 251, 235, 0.98);
  --editor-flow-handle-border: rgba(245, 158, 11, 0.26);
  --editor-flow-handle-accent: #d97706;
  --editor-flow-handle-glow: rgba(245, 158, 11, 0.18);
}

.editor-canvas__route-handle--neutral {
  --editor-flow-handle-fill: rgba(245, 241, 234, 0.98);
  --editor-flow-handle-border: rgba(120, 113, 108, 0.24);
  --editor-flow-handle-accent: #78716c;
  --editor-flow-handle-glow: rgba(120, 113, 108, 0.18);
}

.editor-canvas__route-handle-label {
  position: absolute;
  left: calc(50% + 30px);
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid var(--editor-flow-handle-border, rgba(201, 107, 31, 0.22));
  border-radius: 999px;
  padding: 5px 10px;
  background: rgba(255, 250, 241, 0.96);
  color: var(--editor-flow-handle-accent, rgba(201, 107, 31, 0.92));
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0;
  pointer-events: auto;
  transition: opacity 120ms ease;
}

.editor-canvas__flow-hotspot--visible .editor-canvas__route-handle-label {
  opacity: 1;
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
  color: var(--editor-flow-handle-accent, rgba(201, 107, 31, 0.92));
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
  background: var(--editor-flow-handle-fill, rgba(255, 250, 241, 0.98));
  box-shadow:
    inset 0 0 0 1px var(--editor-flow-handle-border, rgba(201, 107, 31, 0.24)),
    0 12px 24px var(--editor-flow-handle-glow, rgba(120, 53, 15, 0.14));
  opacity: 1;
}

.editor-canvas__flow-hotspot--visible::after {
  opacity: 1;
}

.editor-canvas__flow-hotspot:hover::before {
  background: var(--editor-flow-handle-hover-fill, var(--editor-flow-handle-fill, rgba(255, 248, 242, 1)));
  box-shadow:
    inset 0 0 0 1px var(--editor-flow-handle-border, rgba(201, 107, 31, 0.32)),
    0 14px 28px var(--editor-flow-handle-glow, rgba(120, 53, 15, 0.18));
}

.editor-canvas__flow-hotspot--connect-source::before {
  background: var(--editor-connection-source-fill, rgba(239, 246, 255, 0.98));
  box-shadow:
    inset 0 0 0 1px var(--editor-connection-source-border, rgba(37, 99, 235, 0.34)),
    0 14px 28px var(--editor-connection-source-glow, rgba(37, 99, 235, 0.14));
  opacity: 1;
}

.editor-canvas__flow-hotspot--connect-source::after {
  color: var(--editor-connection-source-symbol, rgba(37, 99, 235, 0.96));
  opacity: 1;
}

.editor-canvas__route-handle.editor-canvas__flow-hotspot--connect-source::before {
  background: var(--editor-flow-handle-fill, rgba(255, 250, 241, 0.98));
  box-shadow:
    inset 0 0 0 1px var(--editor-flow-handle-border, rgba(201, 107, 31, 0.32)),
    0 14px 28px var(--editor-flow-handle-glow, rgba(120, 53, 15, 0.18));
}

.editor-canvas__route-handle.editor-canvas__flow-hotspot--connect-source::after {
  color: var(--editor-flow-handle-accent, rgba(201, 107, 31, 0.92));
}

.editor-canvas__flow-hotspot--connect-target::before {
  background: var(--editor-connection-target-fill, rgba(240, 253, 244, 0.98));
  box-shadow:
    inset 0 0 0 1px var(--editor-connection-target-border, rgba(34, 197, 94, 0.34)),
    0 14px 28px var(--editor-connection-target-glow, rgba(34, 197, 94, 0.16));
  opacity: 1;
}

.editor-canvas__flow-hotspot--connect-target::after {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--editor-connection-target-anchor, rgba(34, 197, 94, 0.86));
  box-shadow: 0 0 0 4px var(--editor-connection-target-glow, rgba(34, 197, 94, 0.12));
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
  touch-action: none;
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
  --editor-anchor-fill: var(--editor-connection-source-anchor, rgba(37, 99, 235, 0.96));
  stroke: var(--editor-connection-source-stroke, rgba(219, 234, 254, 0.98));
}

.editor-canvas__anchor--connect-target {
  --editor-anchor-fill: var(--editor-connection-target-anchor, rgba(34, 197, 94, 0.92));
  stroke: var(--editor-connection-target-stroke, rgba(220, 252, 231, 0.98));
}

.editor-canvas__node {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  isolation: isolate;
  transition: filter 180ms ease;
  touch-action: none;
  -webkit-touch-callout: none;
}

.editor-canvas__node:hover,
.editor-canvas__node:focus-within,
.editor-canvas__node--selected {
  z-index: 8;
}

@keyframes editor-canvas-node-execution-glow-pulse {
  0%,
  100% {
    opacity: 0.82;
    transform: scale(0.992);
  }

  50% {
    opacity: 1;
    transform: scale(1.004);
  }
}

.editor-canvas__node-halo {
  position: absolute;
  inset: -6px;
  z-index: -1;
  border-radius: 24px;
  pointer-events: none;
}

.editor-canvas__node-halo--running,
.editor-canvas__node-halo--running-current,
.editor-canvas__node-halo--paused,
.editor-canvas__node-halo--paused-current {
  opacity: 1;
  filter: blur(10px);
  transition: opacity 180ms ease, transform 180ms ease;
}

.editor-canvas__node-halo--running {
  background:
    radial-gradient(
      circle at 50% 20%,
      rgba(52, 211, 153, 0.52) 0%,
      rgba(16, 185, 129, 0.28) 34%,
      rgba(16, 185, 129, 0) 64%
    );
  animation: editor-canvas-node-execution-glow-pulse 1.2s ease-in-out infinite;
}

.editor-canvas__node-halo--running-current {
  background:
    radial-gradient(
      circle at 50% 20%,
      rgba(110, 231, 183, 0.72) 0%,
      rgba(16, 185, 129, 0.38) 36%,
      rgba(16, 185, 129, 0) 66%
    );
  animation: editor-canvas-node-execution-glow-pulse 0.95s ease-in-out infinite;
}

.editor-canvas__node-halo--paused {
  background:
    radial-gradient(
      circle at 50% 20%,
      rgba(245, 158, 11, 0.5) 0%,
      rgba(217, 119, 6, 0.25) 34%,
      rgba(217, 119, 6, 0) 64%
    );
  animation: editor-canvas-node-execution-glow-pulse 1.35s ease-in-out infinite;
}

.editor-canvas__node-halo--paused-current {
  background:
    radial-gradient(
      circle at 50% 20%,
      rgba(251, 191, 36, 0.7) 0%,
      rgba(245, 158, 11, 0.34) 36%,
      rgba(245, 158, 11, 0) 66%
    );
  animation: editor-canvas-node-execution-glow-pulse 1.05s ease-in-out infinite;
}

.editor-canvas__node--running {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(16, 185, 129, 0.62),
    0 0 14px rgba(16, 185, 129, 0.22);
}

.editor-canvas__node--running-current {
  box-shadow:
    0 20px 40px rgba(60, 41, 20, 0.12),
    0 0 0 1.5px rgba(16, 185, 129, 0.86),
    0 0 18px rgba(16, 185, 129, 0.32);
}

.editor-canvas__node--paused {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(245, 158, 11, 0.62),
    0 0 14px rgba(245, 158, 11, 0.2);
}

.editor-canvas__node--paused-current {
  box-shadow:
    0 20px 40px rgba(60, 41, 20, 0.12),
    0 0 0 1.5px rgba(245, 158, 11, 0.86),
    0 0 18px rgba(245, 158, 11, 0.3);
}

.editor-canvas__node--success {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(180, 83, 9, 0.34);
}

.editor-canvas__node--failed {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(239, 68, 68, 0.56);
}
</style>
