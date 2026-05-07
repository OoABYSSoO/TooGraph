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
    @keydown.delete="handleSelectedEdgeDelete"
    @keydown.backspace="handleSelectedEdgeDelete"
    @keydown.escape.prevent="clearCanvasTransientState"
    @wheel.prevent="handleWheel"
    @dragover.prevent="handleCanvasDragOver"
    @drop.prevent="handleCanvasDrop"
  >
    <div
      class="editor-canvas__top-left-tools"
      @pointerdown.stop
      @pointerup.stop
      @dblclick.stop
      @click.stop
      @wheel.stop
    >
      <div
        class="editor-canvas__edge-view-toolbar"
        role="toolbar"
        :aria-label="t('edgeMode.toolbar')"
      >
        <button
          v-for="option in edgeVisibilityModeOptions"
          :key="option.mode"
          type="button"
          class="editor-canvas__edge-view-button"
          :class="{ 'editor-canvas__edge-view-button--active': edgeVisibilityMode === option.mode }"
          :title="option.title"
          :aria-pressed="edgeVisibilityMode === option.mode"
          @click.stop="handleEdgeVisibilityModeClick(option.mode)"
        >
          {{ option.label }}
        </button>
      </div>
      <div v-if="sourceContextLabel" class="editor-canvas__source-context-pill">
        {{ sourceContextLabel }}
      </div>
    </div>
    <button
      v-if="interactionLocked"
      type="button"
      class="editor-canvas__lock-banner"
      aria-live="polite"
      @pointerdown.stop
      @click.stop="handleLockBannerClick"
      @keydown.enter.prevent="handleLockBannerClick"
      @keydown.space.prevent="handleLockBannerClick"
    >
      {{ t("editor.lockBanner") }}
    </button>
    <div class="editor-canvas__viewport" :style="viewportStyle">
      <div v-if="isCanvasEmpty" class="editor-canvas__empty-state">
        <div
          ref="emptyCanvasPromptRef"
          class="editor-canvas__empty-card"
          tabindex="-1"
          @pointerdown.stop="focusEmptyCanvasPrompt"
        >
          <div class="editor-canvas__empty-eyebrow">{{ t("editor.emptyCanvas") }}</div>
          <div class="editor-canvas__empty-title">{{ t("editor.createFirstNode") }}</div>
          <div class="editor-canvas__empty-copy">{{ t("editor.emptyCanvasHint") }}</div>
        </div>
      </div>
      <svg class="editor-canvas__edges" viewBox="0 0 4000 3000" preserveAspectRatio="none" aria-hidden="true">
        <path
          v-if="connectionPreview"
          :d="connectionPreview.path"
          class="editor-canvas__edge editor-canvas__edge--preview"
          :style="connectionPreviewStyle"
          :class="connectionPreviewClassState(connectionPreview.kind)"
        />
        <path
          v-for="edge in flowRouteEdges"
          :key="`${edge.id}:highlight`"
          v-show="isProjectedCanvasEdgeVisible(edge, visibleProjectedEdgeIds)"
          :d="edge.path"
          class="editor-canvas__edge-delete-highlight"
          :style="edgeStyle(edge)"
          :class="{ 'editor-canvas__edge-delete-highlight--active': isFlowEdgeDeleteConfirmOpen(edge.id) }"
        />
        <path
          v-for="edge in dataEdges"
          :key="`${edge.id}:data-highlight`"
          v-show="isProjectedCanvasEdgeVisible(edge, visibleProjectedEdgeIds)"
          :d="edge.path"
          class="editor-canvas__edge-data-highlight"
          :style="edgeStyle(edge)"
          :class="{ 'editor-canvas__edge-data-highlight--active': isDataEdgeStateInteractionOpen(edge) }"
        />
        <path
          v-for="edge in projectedEdges"
          :key="edge.id"
          v-show="isProjectedCanvasEdgeVisible(edge, visibleProjectedEdgeIds)"
          :d="edge.path"
          class="editor-canvas__edge"
          :style="edgeStyle(edge)"
          :class="edgeClassState(edge)"
        />
        <path
          v-for="edge in projectedEdges"
          :key="`${edge.id}:hitarea`"
          v-show="isProjectedCanvasEdgeVisible(edge, visibleProjectedEdgeIds)"
          :d="edge.path"
          class="editor-canvas__edge-hitarea"
          :class="edgeHitareaClassState(edge)"
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
        <div class="editor-canvas__confirm-hint editor-canvas__confirm-hint--state">{{ t("nodeCard.editStateQuestion") }}</div>
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
          @update:name="handleDataEdgeStateEditorNameInput"
          @update:type="handleDataEdgeStateEditorTypeValue"
          @update:color="handleDataEdgeStateEditorColorInput"
          @update:description="handleDataEdgeStateEditorDescriptionInput"
        />
        <div v-if="isCreatedDataEdgeStateEditorOpen()" class="editor-canvas__edge-state-confirm-actions">
          <button type="button" class="editor-canvas__edge-state-confirm-button" @click.stop="confirmCreatedDataEdgeStateEditor">
            <ElIcon aria-hidden="true"><Check /></ElIcon>
            <span>{{ t("common.confirm") }}</span>
          </button>
        </div>
        <div v-else class="editor-canvas__edge-state-disconnect">
          <div class="editor-canvas__edge-state-disconnect-title">{{ t("edgeState.disconnectTitle") }}</div>
          <p class="editor-canvas__edge-state-disconnect-copy">
            {{
              shouldOfferDataEdgeFlowDisconnect()
                ? t("edgeState.disconnectMultiStateHint")
                : t("edgeState.disconnectSingleStateHint")
            }}
          </p>
          <div class="editor-canvas__edge-state-disconnect-actions">
            <button type="button" class="editor-canvas__edge-state-disconnect-button" @click.stop="disconnectActiveDataEdgeStateReference">
              {{
                shouldOfferDataEdgeFlowDisconnect()
                  ? t("edgeState.removeStateReference")
                  : t("edgeState.disconnectState")
              }}
            </button>
            <button
              v-if="shouldOfferDataEdgeFlowDisconnect()"
              type="button"
              class="editor-canvas__edge-state-disconnect-button editor-canvas__edge-state-disconnect-button--flow"
              @click.stop="disconnectActiveDataEdgeFlow"
            >
              {{ t("edgeState.disconnectFlow") }}
            </button>
          </div>
        </div>
      </div>
      <div
        v-for="[nodeId, node] in nodeEntries"
        :key="nodeId"
        :ref="(element) => registerNodeRef(nodeId, element)"
        class="editor-canvas__node"
        :class="{
          'editor-canvas__node--selected': isNodeVisuallySelected(nodeId),
          'editor-canvas__node--resizing': nodeResizeDrag?.nodeId === nodeId,
        }"
        :style="nodeStyle(node.ui.position)"
        @pointerenter="setHoveredNode(nodeId)"
        @pointerleave="clearHoveredNode(nodeId)"
        @pointerdown.capture="handleLockedNodePointerCapture(nodeId, $event)"
        @pointerdown.stop="handleNodePointerDown(nodeId, $event)"
        @click.capture="handleNodeClickCapture(nodeId, $event)"
        @dblclick.stop="handleNodeDoubleClick(nodeId, $event)"
      >
        <div
          v-if="resolveRunNodePresentationForNode(nodeId)?.haloClass"
          class="editor-canvas__node-halo"
          :class="resolveRunNodePresentationForNode(nodeId)?.haloClass"
        />
        <NodeCard
          :class="resolveRunNodeClassList(nodeId)"
          :style="nodeCardSizeStyle(node)"
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
          :subgraph-run-status-by-inner-node-id="subgraphRunStatusByNodeId?.[nodeId] ?? undefined"
          :pending-state-input-source="pendingAgentInputSourceByNodeId[nodeId] ?? null"
          :pending-state-input-target="pendingStateInputSourceTargetByNodeId[nodeId] ?? null"
          :pending-state-output-target="pendingStateOutputTargetByNodeId[nodeId] ?? null"
          :human-review-pending="isHumanReviewNode(nodeId)"
          :selected="isNodeVisuallySelected(nodeId)"
          :hovered="hoveredNodeId === nodeId || activeConnectionHoverNodeId === nodeId || hoveredPointAnchorNodeId === nodeId"
          :interaction-locked="isGraphEditingLocked()"
          @update-node-metadata="emit('update-node-metadata', $event)"
          @update-input-config="emit('update-input-config', $event)"
          @update-input-state="emit('update-input-state', $event)"
          @update-state="emit('update-state', $event)"
          @remove-port-state="emit('remove-port-state', $event)"
          @reorder-port-state="emit('reorder-port-state', $event)"
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
          @locked-edit-attempt="emit('locked-edit-attempt')"
          @refresh-agent-models="emit('refresh-agent-models')"
          @update-output-config="emit('update-output-config', $event)"
        />
        <div v-if="isNodeResizeHotzoneEnabled()" class="editor-canvas__resize-hotzones">
          <div
            v-for="handle in NODE_RESIZE_HANDLES"
            :key="handle"
            data-node-resize-hotzone="true"
            class="editor-canvas__resize-hotzone"
            :class="`editor-canvas__resize-hotzone--${handle}`"
            aria-hidden="true"
            @pointerdown.stop.prevent="handleNodeResizePointerDown(nodeId, handle, $event)"
          ></div>
        </div>
      </div>
      <div class="editor-canvas__flow-hotspots" aria-hidden="true">
        <div
          v-for="anchor in flowAnchors"
          :key="`flow-${anchor.id}`"
          class="editor-canvas__flow-hotspot"
          :style="[flowHotspotStyle(anchor), flowHotspotConnectStyle(anchor)]"
          :class="flowHotspotClassState(anchor)"
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
          :class="routeHandleClassState(anchor)"
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
            'editor-canvas__anchor--connect-source': isCanvasConnectionSourceAnchor(anchor, canvasInteractionStyleContext),
            'editor-canvas__anchor--connect-target': isCanvasConnectionTargetAnchor(anchor, canvasInteractionStyleContext),
          }"
          r="5.5"
          @pointerenter="setHoveredPointAnchorNode(anchor.nodeId)"
          @pointerleave="clearHoveredPointAnchorNode(anchor.nodeId)"
          @pointerdown.prevent.stop="handleAnchorPointerDown(anchor)"
        />
      </svg>
    </div>
    <div v-if="!isCanvasEmpty" class="editor-canvas__navigation-stack">
      <div
        class="editor-canvas__zoom-toolbar"
        role="toolbar"
        :aria-label="t('canvasZoom.toolbar')"
        @pointerdown.stop
        @pointerup.stop
        @dblclick.stop
        @click.stop
        @wheel.stop
      >
        <button type="button" class="editor-canvas__zoom-button" :aria-label="t('canvasZoom.zoomOut')" :title="t('canvasZoom.zoomOut')" @click.stop="handleZoomOut">
          <ElIcon aria-hidden="true"><Minus /></ElIcon>
        </button>
        <span class="editor-canvas__zoom-label" aria-live="polite">{{ zoomPercentLabel }}</span>
        <button type="button" class="editor-canvas__zoom-button" :aria-label="t('canvasZoom.zoomIn')" :title="t('canvasZoom.zoomIn')" @click.stop="handleZoomIn">
          <ElIcon aria-hidden="true"><Plus /></ElIcon>
        </button>
        <button type="button" class="editor-canvas__zoom-button" :aria-label="t('canvasZoom.reset')" :title="t('canvasZoom.reset')" @click.stop="handleZoomReset">
          <ElIcon aria-hidden="true"><RefreshLeft /></ElIcon>
        </button>
      </div>
      <EditorMinimap
        class="editor-canvas__minimap"
        :nodes="minimapNodes"
        :edges="minimapEdges"
        :viewport="viewport.viewport"
        :canvas-size="canvasSize"
        @center-view="handleMinimapCenterView"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import { Check, Minus, Plus, RefreshLeft } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import EditorMinimap from "./EditorMinimap.vue";
import NodeCard from "@/editor/nodes/NodeCard.vue";
import StateEditorPopover from "@/editor/nodes/StateEditorPopover.vue";
import { groupProjectedCanvasAnchors, groupProjectedCanvasEdges, type ProjectedCanvasAnchor, type ProjectedCanvasEdge } from "@/editor/canvas/edgeProjection";
import { resolveEdgeRunPresentation } from "@/editor/canvas/runEdgePresentation";
import { resolveCanvasLayout } from "@/editor/canvas/resolvedCanvasLayout";
import { resolveCanvasSurfaceStyle } from "@/editor/canvas/canvasSurfaceStyle";
import { isEditableKeyboardEventTarget } from "@/editor/canvas/canvasKeyboard";
import { DEFAULT_CANVAS_VIEWPORT as EMPTY_CANVAS_VIEWPORT, type CanvasViewport } from "@/editor/canvas/canvasViewport";
import {
  NODE_RESIZE_HANDLES,
  type NodeResizeHandle,
} from "./nodeResize.ts";
import { useCanvasNodeDragResize } from "./useCanvasNodeDragResize.ts";
import {
  resolveNodePointerDownAction,
  resolveNodeResizePointerDownAction,
  type CanvasNodePointerDownAction,
  type CanvasNodeResizePointerDownAction,
} from "./canvasNodeDragResizeModel.ts";
import {
  buildEdgeVisibilityModeOptions,
  buildForceVisibleProjectedEdgeIds,
  filterProjectedEdgesForVisibilityMode,
  isCanvasFlowHotspotVisible,
  isProjectedCanvasEdgeVisible,
  resolveEdgeVisibilityModeClickAction,
  type EdgeVisibilityMode,
} from "./edgeVisibilityModel";
import {
  buildRouteHandleStyle,
  resolveRouteHandleTone,
} from "./routeHandleModel";
import {
  buildConnectionPreviewClassState,
  buildConnectionPreviewStyle,
  buildFlowHotspotStyle,
  buildFlowHotspotConnectStyle,
  buildFlowHotspotClassState,
  buildPointAnchorStyle,
  buildPointAnchorConnectStyle,
  buildProjectedEdgeClassState,
  buildProjectedEdgeHitareaClassState,
  buildProjectedEdgeStyle,
  buildRouteHandleClassState,
  isCanvasConnectionSourceAnchor,
  isCanvasConnectionTargetAnchor,
} from "./canvasInteractionStyleModel";
import {
  buildConnectionPreviewModel,
  resolveConnectionAccentColor,
  resolveConnectionPreviewStateKey,
  resolveConnectionSourceAnchorId,
  resolveSelectedReconnectConnection,
} from "./canvasConnectionModel";
import { buildMinimapEdgeModels } from "./canvasMinimapEdgeModel";
import { buildConditionRouteTargetsByNodeId } from "./conditionRouteTargetsModel";
import {
  buildPendingAgentInputSourceByNodeId,
  buildPendingStateInputSourceTargetByNodeId,
  buildPendingStateOutputTargetByNodeId,
  type PendingStateInputSource,
  type PendingStatePortPreview,
} from "./canvasPendingStatePortModel";
import {
  buildTransientAgentCreateInputAnchors,
  buildTransientAgentInputAnchors,
  buildTransientAgentOutputAnchors,
  filterBaseProjectedAnchorsForVirtualCreatePorts,
  isAgentCreateInputAnchorVisible as resolveAgentCreateInputAnchorVisible,
  isAgentCreateOutputAnchorVisible as resolveAgentCreateOutputAnchorVisible,
} from "./canvasVirtualCreatePortModel";
import {
  isCanvasNodeVisuallySelected,
  isHumanReviewRunNode,
  resolveLockBannerClickAction,
  resolveRunNodeClassListForCanvasNode,
  resolveRunNodePresentationForCanvasNode,
} from "./canvasRunPresentationModel";
import {
  resolveLockedCanvasInteractionGuardAction,
  resolveLockedNodePointerCaptureAction,
} from "./canvasLockedInteractionModel";
import { resolveCanvasEdgePointerDownAction, resolveCanvasEdgeTargetPoint } from "./canvasEdgePointerInteractionModel";
import { resolveSelectedEdgeKeyboardDeleteAction } from "./flowEdgeDeleteModel";
import {
  buildMinimapNodeModel,
  buildNodeCardSizeStyle,
  buildNodeTransformStyle,
  resolveNodeRenderedSize,
} from "./canvasNodePresentationModel";
import { useCanvasEdgeInteractions } from "./useCanvasEdgeInteractions";
import { useCanvasConnectionInteraction } from "./useCanvasConnectionInteraction";
import { useCanvasNodeMeasurements } from "./useCanvasNodeMeasurements";
import { useCanvasAnimationFrameScheduler } from "./useCanvasAnimationFrameScheduler";
import { useCanvasHoverState } from "./useCanvasHoverState";
import { useCanvasPinchZoomState } from "./useCanvasPinchZoomState";
import { resolveCanvasPointerDownAction } from "./canvasPinchZoomModel";
import type { CanvasPointerDownAction } from "./canvasPinchZoomModel";
import { buildCanvasViewportStyle, buildZoomPercentLabel } from "./canvasViewportDisplayModel";
import {
  resolveCanvasPanPointerMoveAction,
  resolveCanvasSizeUpdateAction,
  resolveCanvasWheelZoomRequest,
  resolveCanvasWorldPoint,
  resolveCanvasZoomButtonAction,
  type CanvasZoomButtonControl,
} from "./canvasViewportInteractionModel";
import {
  canCompleteCanvasAnchorConnection,
  resolveCanvasAutoSnappedTargetAnchor as resolveCanvasAutoSnappedTargetAnchorModel,
  resolveCanvasEligibleTargetAnchorForNodeBody,
  resolveCanvasAnchorPointerDownAction,
  resolveCanvasConnectionPointerMoveRequest,
  resolveCanvasConnectionPointerUpAction,
  resolveCanvasDoubleClickCreationAction,
  resolveCanvasDragOverDropEffect,
  resolveCanvasDropCreationAction,
  resolveCanvasNodePointerDownConnectionAction,
  resolveCanvasPendingConnectionCreationMenuAction,
  type CanvasAnchorPointerDownAction,
  type CanvasNodeCreationMenuPayload,
} from "./canvasConnectionInteractionModel";
import {
  resolveCanvasConnectionCompletionExecutionAction,
  type CanvasConnectionCompletionAction,
} from "./canvasConnectionCompletionModel";
import { STATE_FIELD_TYPE_OPTIONS } from "@/editor/workspace/statePanelFields";
import {
  canCompleteGraphConnection,
  canDisconnectSequenceEdgeForDataConnection,
  canStartGraphConnection,
  type PendingGraphConnection,
} from "@/lib/graph-connections";
import {
  CREATE_AGENT_INPUT_STATE_KEY,
} from "@/lib/virtual-any-input";
import { resolveFocusedNodeViewportAction } from "@/editor/canvas/focusNodeViewport";
import { resolveMinimapCenterViewAction } from "./minimapModel";
import { useNodeSelectionFocus, type NodeFocusRequest } from "./useNodeSelectionFocus";
import { useViewport } from "./useViewport";
import { isAgentBreakpointEnabledInDocument, resolveAgentBreakpointTimingInDocument } from "@/lib/graph-document";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { SkillDefinition } from "@/types/skills";
import type { AgentNode, ConditionNode, GraphDocument, GraphNode, GraphNodeSize, GraphPayload, GraphPosition, InputNode, OutputNode, StateDefinition } from "@/types/node-system";

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
  subgraphRunStatusByNodeId?: Record<string, Record<string, string>>;
  activeRunEdgeIds?: string[];
  interactionLocked?: boolean;
  initialViewport?: CanvasViewport | null;
  stateEditorRequest?: { requestId: string; sourceNodeId: string; targetNodeId: string; stateKey: string; position: GraphPosition } | null;
  sourceContextLabel?: string | null;
}>();

const { t, locale } = useI18n();
const edgeVisibilityModeOptions = computed(() => {
  locale.value;
  return buildEdgeVisibilityModeOptions();
});

const emit = defineEmits<{
  (event: "update:node-position", payload: { nodeId: string; position: GraphPosition }): void;
  (event: "update:node-size", payload: { nodeId: string; position: GraphPosition; size: GraphNodeSize }): void;
  (event: "select-node", nodeId: string | null): void;
  (event: "update-node-metadata", payload: { nodeId: string; patch: Partial<Pick<GraphNode, "name" | "description">> }): void;
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-input-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "update-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "remove-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "reorder-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string; targetIndex: number }): void;
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
  (event: "locked-edit-attempt"): void;
  (event: "refresh-agent-models"): void;
  (event: "connect-flow", payload: { sourceNodeId: string; targetNodeId: string }): void;
  (event: "connect-state", payload: { sourceNodeId: string; sourceStateKey: string; targetNodeId: string; targetStateKey: string; position: GraphPosition; sourceValueType?: string | null }): void;
  (event: "connect-state-input-source", payload: { sourceNodeId: string; targetNodeId: string; targetStateKey: string; targetValueType?: string | null }): void;
  (event: "connect-route", payload: { sourceNodeId: string; branchKey: string; targetNodeId: string }): void;
  (event: "reconnect-flow", payload: { sourceNodeId: string; currentTargetNodeId: string; nextTargetNodeId: string }): void;
  (event: "reconnect-route", payload: { sourceNodeId: string; branchKey: string; nextTargetNodeId: string }): void;
  (event: "remove-flow", payload: { sourceNodeId: string; targetNodeId: string }): void;
  (event: "disconnect-data-edge", payload: { sourceNodeId: string; targetNodeId: string; stateKey: string; mode: "state" | "flow" }): void;
  (event: "remove-route", payload: { sourceNodeId: string; branchKey: string }): void;
  (event: "open-node-creation-menu", payload: CanvasNodeCreationMenuPayload): void;
  (event: "open-subgraph-editor", payload: { nodeId: string }): void;
  (event: "create-node-from-file", payload: { file: File; position: GraphPosition; clientX: number; clientY: number }): void;
  (event: "update:viewport", payload: CanvasViewport): void;
}>();

const canvasRef = ref<HTMLElement | null>(null);
const emptyCanvasPromptRef = ref<HTMLElement | null>(null);
const canvasSize = ref({ width: 0, height: 0 });
const viewport = useViewport(props.initialViewport ?? undefined);
const {
  cancelScheduledDragFrame,
  flushScheduledDragFrame,
  scheduleDragFrame,
} = useCanvasAnimationFrameScheduler();
const pinchZoomState = useCanvasPinchZoomState({
  currentScale: () => viewport.viewport.scale,
  getCanvasRect: () => canvasRef.value?.getBoundingClientRect() ?? null,
  scheduleDragFrame,
  endPan: () => viewport.endPan(),
  zoomAt: (request) => viewport.zoomAt(request),
});
const {
  clearPinchZoom,
  handleTouchPointerMove,
  releaseCanvasPointer,
  trackTouchPointerDown,
} = pinchZoomState;
const nodeMeasurements = useCanvasNodeMeasurements({
  document: () => props.document,
  viewportScale: () => viewport.viewport.scale,
});
const {
  measuredAnchorOffsets,
  measuredNodeSizes,
  nodeElementMap,
  registerNodeRef,
  scheduleAnchorMeasurement,
  teardownNodeMeasurements,
} = nodeMeasurements;
const {
  clearHoveredFlowHandleNode,
  clearHoveredNode,
  clearHoveredPointAnchorNode,
  clearScheduledHoveredNodeRelease,
  hoveredFlowHandleNodeId,
  hoveredNodeId,
  hoveredPointAnchorNodeId,
  setHoveredFlowHandleNode,
  setHoveredNode,
  setHoveredPointAnchorNode,
} = useCanvasHoverState({
  scheduleAnchorMeasurement,
});
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
const nodeDragResize = useCanvasNodeDragResize({
  viewportScale: () => viewport.viewport.scale,
  scheduleDragFrame,
  emitNodePosition: (payload) => emit("update:node-position", payload),
  emitNodeSize: (payload) => emit("update:node-size", payload),
  timeoutScheduler:
    typeof window === "undefined"
      ? undefined
      : {
          setTimeout: (callback, delay) => window.setTimeout(callback, delay),
          clearTimeout: (timeoutId) => window.clearTimeout(timeoutId),
        },
});
const {
  nodeResizeDrag,
  startNodeDrag,
  startNodeResizeDrag,
  handleNodeDragResizePointerMove,
  releaseNodeDragResizePointerCapture,
  finishNodeDragResizePointer,
  handleNodeClickCapture,
  teardownNodeDragResize,
} = nodeDragResize;
const connectionInteraction = useCanvasConnectionInteraction({
  onActiveConnectionHoverNodeChange: ({ previousNodeId, nextNodeId }) => {
    if (previousNodeId) {
      scheduleAnchorMeasurement(previousNodeId);
    }
    if (nextNodeId) {
      void nextTick().then(() => {
        scheduleAnchorMeasurement(nextNodeId);
      });
    }
  },
});
const {
  pendingConnection,
  pendingConnectionPoint,
  autoSnappedTargetAnchor,
  activeConnectionHoverNodeId,
  clearPendingConnection,
  clearConnectionPreviewState,
  clearConnectionInteractionState,
  startOrTogglePendingConnectionFromAnchor,
  updatePendingConnectionTarget,
  setPendingConnectionPoint,
  setActiveConnectionHoverNode,
} = connectionInteraction;
const selectedEdgeId = ref<string | null>(null);
const edgeVisibilityMode = ref<EdgeVisibilityMode>("smart");
let canvasResizeObserver: ResizeObserver | null = null;

const edgeInteractions = useCanvasEdgeInteractions({
  stateSchema: () => props.document.state_schema,
  stateEditorRequest: () => props.stateEditorRequest,
  isLocked: isGraphEditingLocked,
  guardLockedInteraction: guardLockedCanvasInteraction,
  getSelectedEdgeId: () => selectedEdgeId.value,
  setSelectedEdgeId: (edgeId) => {
    selectedEdgeId.value = edgeId;
  },
  canDisconnectFlow: (sourceNodeId, targetNodeId) =>
    canDisconnectSequenceEdgeForDataConnection(props.document, sourceNodeId, targetNodeId),
  emitRemoveFlow: (payload) => emit("remove-flow", payload),
  emitRemoveRoute: (payload) => emit("remove-route", payload),
  emitDisconnectDataEdge: (payload) => emit("disconnect-data-edge", payload),
  emitUpdateState: (payload) => emit("update-state", payload),
});
const {
  activeFlowEdgeDeleteConfirm,
  activeDataEdgeStateConfirm,
  activeDataEdgeStateEditor,
  dataEdgeStateDraft,
  dataEdgeStateError,
  flowEdgeDeleteConfirmStyle,
  dataEdgeStateConfirmStyle,
  dataEdgeStateEditorStyle,
  dataEdgeStateColorOptions,
  clearFlowEdgeDeleteConfirmState,
  clearDataEdgeStateInteraction,
  confirmFlowEdgeDelete,
  openDataEdgeStateEditor,
  confirmCreatedDataEdgeStateEditor,
  isCreatedDataEdgeStateEditorOpen,
  shouldOfferDataEdgeFlowDisconnect,
  disconnectActiveDataEdgeStateReference,
  disconnectActiveDataEdgeFlow,
  handleDataEdgeStateEditorNameInput,
  handleDataEdgeStateEditorDescriptionInput,
  handleDataEdgeStateEditorColorInput,
  handleDataEdgeStateEditorTypeValue,
  isFlowEdgeDeleteConfirmOpen,
  isDataEdgeStateInteractionOpen,
} = edgeInteractions;

const nodeEntries = computed(() => Object.entries(props.document.nodes));
const isCanvasEmpty = computed(() => nodeEntries.value.length === 0);
const minimapNodes = computed(() =>
  nodeEntries.value.map(([nodeId, node]) =>
    buildMinimapNodeModel({
      nodeId,
      node,
      measuredNodeSizes: measuredNodeSizes.value,
      isSelected: selection.selectedNodeId.value === nodeId,
      runStatus: props.runNodeStatusByNodeId?.[nodeId],
    }),
  ),
);
const minimapEdges = computed(() =>
  buildMinimapEdgeModels({
    edges: projectedEdges.value,
    visibleEdgeIds: visibleProjectedEdgeIds.value,
  }),
);
const conditionRouteTargetsByNodeId = computed(() => buildConditionRouteTargetsByNodeId(props.document));
const resolvedCanvasLayout = computed(() => resolveCanvasLayout(props.document, measuredAnchorOffsets.value));
const projectedEdges = computed(() => resolvedCanvasLayout.value.edges);
const projectedEdgeGroups = computed(() => groupProjectedCanvasEdges(projectedEdges.value));
const flowRouteEdges = computed(() => projectedEdgeGroups.value.flowRouteEdges);
const dataEdges = computed(() => projectedEdgeGroups.value.dataEdges);
const forceVisibleProjectedEdgeIds = computed(() => buildForceVisibleProjectedEdgeIds({
  selectedEdgeId: selectedEdgeId.value,
  dataEdgeStateConfirmId: activeDataEdgeStateConfirm.value?.id,
  dataEdgeStateEditorId: activeDataEdgeStateEditor.value?.id,
  flowEdgeDeleteConfirmId: activeFlowEdgeDeleteConfirm.value?.id,
}));
const visibleProjectedEdgeIds = computed(
  () =>
    new Set(
      filterProjectedEdgesForVisibilityMode(projectedEdges.value, {
        mode: edgeVisibilityMode.value,
        forceVisibleEdgeIds: forceVisibleProjectedEdgeIds.value,
      }).map((edge) => edge.id),
    ),
);
const pendingAgentInputSourceByNodeId = computed<Record<string, PendingStateInputSource>>(() =>
  buildPendingAgentInputSourceByNodeId({
    document: props.document,
    connection: pendingConnection.value,
    canCompleteAgentInput: (nodeId) =>
      canCompleteGraphConnection(props.document, pendingConnection.value, {
        nodeId,
        kind: "state-in",
        stateKey: CREATE_AGENT_INPUT_STATE_KEY,
      }),
  }),
);
const pendingStateInputSourceTargetByNodeId = computed<Record<string, PendingStatePortPreview>>(() =>
  buildPendingStateInputSourceTargetByNodeId({
    connection: pendingConnection.value,
    stateSchema: props.document.state_schema,
    autoSnappedTargetStateKey: autoSnappedTargetAnchor.value?.stateKey,
  }),
);
const pendingStateOutputTargetByNodeId = computed<Record<string, PendingStatePortPreview>>(() =>
  buildPendingStateOutputTargetByNodeId({
    connection: pendingConnection.value,
    stateSchema: props.document.state_schema,
    autoSnappedTargetNodeId: autoSnappedTargetAnchor.value?.nodeId,
    autoSnappedTargetStateKey: autoSnappedTargetAnchor.value?.stateKey,
  }),
);
const baseProjectedAnchors = computed(() => resolvedCanvasLayout.value.anchors);

function isAgentCreateInputAnchorVisible(nodeId: string) {
  return resolveAgentCreateInputAnchorVisible({
    nodeId,
    node: props.document.nodes[nodeId],
    selectedNodeId: selection.selectedNodeId.value,
    hoveredNodeId: hoveredNodeId.value,
    hoveredPointAnchorNodeId: hoveredPointAnchorNodeId.value,
    activeConnectionHoverNodeId: activeConnectionHoverNodeId.value,
    pendingConnection: pendingConnection.value,
  });
}

function isAgentCreateOutputAnchorVisible(nodeId: string) {
  return resolveAgentCreateOutputAnchorVisible({
    nodeId,
    node: props.document.nodes[nodeId],
    selectedNodeId: selection.selectedNodeId.value,
    hoveredNodeId: hoveredNodeId.value,
    hoveredPointAnchorNodeId: hoveredPointAnchorNodeId.value,
    activeConnectionHoverNodeId: activeConnectionHoverNodeId.value,
    pendingConnection: pendingConnection.value,
  });
}

const baseProjectedAnchorsWithoutVirtualCreatePorts = computed(() =>
  filterBaseProjectedAnchorsForVirtualCreatePorts({
    anchors: baseProjectedAnchors.value,
    pendingAgentInputSourceByNodeId: pendingAgentInputSourceByNodeId.value,
    isAgentCreateOutputAnchorVisible,
  }),
);
const transientAgentCreateInputAnchors = computed<ProjectedCanvasAnchor[]>(() =>
  buildTransientAgentCreateInputAnchors({
    document: props.document,
    measuredAnchorOffsets: measuredAnchorOffsets.value,
    pendingAgentInputSourceByNodeId: pendingAgentInputSourceByNodeId.value,
    isAgentCreateInputAnchorVisible,
  }),
);
const transientAgentInputAnchors = computed<ProjectedCanvasAnchor[]>(() =>
  buildTransientAgentInputAnchors({
    document: props.document,
    measuredAnchorOffsets: measuredAnchorOffsets.value,
    pendingAgentInputSourceByNodeId: pendingAgentInputSourceByNodeId.value,
  }),
);
const transientAgentOutputAnchors = computed<ProjectedCanvasAnchor[]>(() =>
  buildTransientAgentOutputAnchors({
    document: props.document,
    measuredAnchorOffsets: measuredAnchorOffsets.value,
    isAgentCreateOutputAnchorVisible,
  }),
);
const projectedAnchors = computed(() => [...baseProjectedAnchorsWithoutVirtualCreatePorts.value, ...transientAgentCreateInputAnchors.value, ...transientAgentInputAnchors.value, ...transientAgentOutputAnchors.value]);
const projectedAnchorGroups = computed(() => groupProjectedCanvasAnchors(projectedAnchors.value));
const flowAnchors = computed(() => projectedAnchorGroups.value.flowAnchors);
const routeHandles = computed(() => projectedAnchorGroups.value.routeHandles);
const pointAnchors = computed(() => projectedAnchorGroups.value.pointAnchors);
const selectedReconnectConnection = computed<PendingGraphConnection | null>(() =>
  resolveSelectedReconnectConnection({
    selectedEdgeId: selectedEdgeId.value,
    activeFlowEdgeDeleteConfirmId: activeFlowEdgeDeleteConfirm.value?.id,
    edges: projectedEdges.value,
  }),
);
const activeConnection = computed(() => pendingConnection.value ?? selectedReconnectConnection.value);
const activeConnectionSourceAnchorId = computed(() =>
  resolveConnectionSourceAnchorId(activeConnection.value, projectedAnchors.value),
);
const eligibleTargetAnchorIds = computed(() =>
  new Set(
    projectedAnchors.value
      .filter((anchor) => canCompleteCanvasConnection(anchor))
      .map((anchor) => anchor.id),
  ),
);
const connectionPreviewStateKey = computed(() =>
  resolveConnectionPreviewStateKey({
    connection: activeConnection.value,
    autoSnappedTargetStateKey: autoSnappedTargetAnchor.value?.stateKey,
  }),
);
const activeConnectionAccentColor = computed(() =>
  resolveConnectionAccentColor({
    connection: activeConnection.value,
    previewStateKey: connectionPreviewStateKey.value,
    stateSchema: props.document.state_schema,
  }),
);
const connectionPreview = computed(() =>
  buildConnectionPreviewModel({
    connection: activeConnection.value,
    pendingPoint: pendingConnectionPoint.value,
    sourceAnchor: projectedAnchors.value.find((anchor) => anchor.id === activeConnectionSourceAnchorId.value) ?? null,
  }),
);
const connectionPreviewStyle = computed(() =>
  buildConnectionPreviewStyle(connectionPreview.value?.kind ?? null, activeConnectionAccentColor.value),
);
const connectionPreviewClassState = buildConnectionPreviewClassState;
const canvasSurfaceStyle = computed(() => resolveCanvasSurfaceStyle(viewport.viewport));
const viewportStyle = computed(() => buildCanvasViewportStyle(viewport.viewport));
const zoomPercentLabel = computed(() => buildZoomPercentLabel(viewport.viewport.scale));
const stateTypeOptions = STATE_FIELD_TYPE_OPTIONS;
const nodeStyle = buildNodeTransformStyle;
const nodeCardSizeStyle = buildNodeCardSizeStyle;

watch(
  () => ({
    x: viewport.viewport.x,
    y: viewport.viewport.y,
    scale: viewport.viewport.scale,
  }),
  (nextViewport) => {
    emit("update:viewport", nextViewport);
  },
  { immediate: true },
);

watch(
  () => nodeEntries.value.length,
  (nextCount) => {
    if (nextCount !== 0) {
      return;
    }
    clearCanvasTransientState();
    selection.clearSelection();
    selectedEdgeId.value = null;
    viewport.setViewport(EMPTY_CANVAS_VIEWPORT);
    void nextTick().then(() => {
      focusEmptyCanvasPrompt();
    });
  },
  { immediate: true },
);

function focusEmptyCanvasPrompt() {
  emptyCanvasPromptRef.value?.focus({ preventScroll: true });
}

function handleEdgeVisibilityModeClick(mode: EdgeVisibilityMode) {
  const edgeVisibilityModeClickAction = resolveEdgeVisibilityModeClickAction({
    interactionLocked: isGraphEditingLocked(),
    currentMode: edgeVisibilityMode.value,
    requestedMode: mode,
  });
  switch (edgeVisibilityModeClickAction.type) {
    case "locked-edit-attempt":
      guardLockedCanvasInteraction();
      return;
    case "ignore-same-mode":
      return;
    case "change-mode":
      edgeVisibilityMode.value = edgeVisibilityModeClickAction.mode;
      if (edgeVisibilityModeClickAction.clearSelectedEdge) {
        selectedEdgeId.value = null;
      }
      if (edgeVisibilityModeClickAction.clearPendingConnection) {
        clearPendingConnection();
      }
      if (edgeVisibilityModeClickAction.clearCanvasTransientState) {
        clearCanvasTransientState();
      }
  }
}

watch(projectedEdges, (edges) => {
  if (selectedEdgeId.value && !edges.some((edge) => edge.id === selectedEdgeId.value)) {
    selectedEdgeId.value = null;
    if (!pendingConnection.value) {
      setPendingConnectionPoint(null);
    }
  }

  edgeInteractions.clearMissingProjectedEdges(edges);
});

watch(
  () => props.interactionLocked,
  (locked) => {
    if (locked) {
      clearCanvasTransientState();
      clearPendingConnection();
      selectedEdgeId.value = null;
    }
  },
);

watch([pendingAgentInputSourceByNodeId, pendingStateInputSourceTargetByNodeId], () => {
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
  teardownNodeMeasurements();
  cancelScheduledDragFrame();

  canvasResizeObserver?.disconnect();
  canvasResizeObserver = null;

  clearFlowEdgeDeleteConfirmState();
  clearDataEdgeStateInteraction();
  teardownNodeDragResize();
  clearScheduledHoveredNodeRelease();
});

function updateCanvasSize() {
  const element = canvasRef.value;
  const canvasSizeUpdateAction = resolveCanvasSizeUpdateAction({
    currentSize: canvasSize.value,
    nextSize: element
      ? {
          width: element.clientWidth,
          height: element.clientHeight,
        }
      : null,
  });

  switch (canvasSizeUpdateAction.type) {
    case "ignore-missing-element":
    case "ignore-unchanged-size":
      return;
    case "update-size":
      canvasSize.value = canvasSizeUpdateAction.size;
      return;
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

function clearCanvasTransientState() {
  clearFlowEdgeDeleteConfirmState();
  clearDataEdgeStateInteraction();
  clearConnectionPreviewState();
  hoveredPointAnchorNodeId.value = null;
}

function startFlowEdgeDeleteConfirm(edge: ProjectedCanvasEdge, event: PointerEvent) {
  edgeInteractions.startFlowEdgeDeleteConfirm(edge, resolveCanvasPoint(event));
}

function startDataEdgeStateConfirm(edge: ProjectedCanvasEdge, event: PointerEvent) {
  edgeInteractions.startDataEdgeStateConfirm(edge, resolveCanvasPoint(event));
}

function handleMinimapCenterView(point: { worldX: number; worldY: number }) {
  if (isCanvasEmpty.value) {
    return;
  }
  updateCanvasSize();
  const minimapCenterViewAction = resolveMinimapCenterViewAction({
    worldX: point.worldX,
    worldY: point.worldY,
    viewportScale: viewport.viewport.scale,
    canvasSize: canvasSize.value,
  });
  switch (minimapCenterViewAction.type) {
    case "ignore-empty-canvas-size":
      return;
    case "set-viewport":
      viewport.setViewport(minimapCenterViewAction.viewport);
      break;
  }
  canvasRef.value?.focus();
}

const canvasInteractionStyleContext = computed(() => ({
  activeConnectionSourceAnchorId: activeConnectionSourceAnchorId.value,
  eligibleTargetAnchorIds: eligibleTargetAnchorIds.value,
  activeConnectionSourceKind: activeConnection.value?.sourceKind ?? null,
  activeConnectionAccentColor: activeConnectionAccentColor.value,
}));
const edgeStyle = buildProjectedEdgeStyle;
const edgeClassState = (edge: ProjectedCanvasEdge) =>
  buildProjectedEdgeClassState({
    edge,
    selectedEdgeId: selectedEdgeId.value,
    activeRunEdgeClass: resolveRunEdgePresentationForEdge(edge.id)?.edgeClass,
  });
const edgeHitareaClassState = buildProjectedEdgeHitareaClassState;
const flowHotspotStyle = buildFlowHotspotStyle;
const routeHandleStyle = buildRouteHandleStyle;
const anchorStyle = buildPointAnchorStyle;

const flowHotspotConnectStyle = (anchor: ProjectedCanvasAnchor) =>
  buildFlowHotspotConnectStyle(anchor, canvasInteractionStyleContext.value);
const flowHotspotClassState = (anchor: ProjectedCanvasAnchor) =>
  buildFlowHotspotClassState({
    anchor,
    isVisible: isFlowHotspotVisible(anchor),
    context: canvasInteractionStyleContext.value,
  });
const routeHandleClassState = (anchor: ProjectedCanvasAnchor) =>
  buildRouteHandleClassState({
    anchor,
    isVisible: isFlowHotspotVisible(anchor),
    tone: resolveRouteHandleTone(anchor.branch),
    context: canvasInteractionStyleContext.value,
  });
const anchorConnectStyle = (anchor: ProjectedCanvasAnchor) =>
  buildPointAnchorConnectStyle(anchor, canvasInteractionStyleContext.value);

function handleCanvasPointerDown(event: PointerEvent) {
  const startedPinchZoom = trackTouchPointerDown(event);
  const canvasPointerDownAction = resolveCanvasPointerDownAction({
    startedPinchZoom,
    isCanvasEmpty: isCanvasEmpty.value,
  });
  applyCanvasPointerDownSetup(canvasPointerDownAction, event);
}

function applyCanvasPointerDownSetup(
  action: CanvasPointerDownAction,
  event: PointerEvent,
) {
  if (action.focusCanvas) {
    canvasRef.value?.focus();
  }
  if (action.focusEmptyCanvasPrompt) {
    focusEmptyCanvasPrompt();
  }
  if (action.preventDefault) {
    event.preventDefault();
  }
  if (action.removeWindowSelection) {
    window.getSelection()?.removeAllRanges();
  }
  if (action.setPointerCapture) {
    canvasRef.value?.setPointerCapture(event.pointerId);
  }
  if (action.cancelScheduledDragFrame) {
    cancelScheduledDragFrame();
  }
  if (action.clearCanvasTransientState) {
    clearCanvasTransientState();
  }
  if (action.clearPendingConnection) {
    clearPendingConnection();
  }
  if (action.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
  if (action.clearSelection) {
    selection.clearSelection();
  }
  if (action.beginPan) {
    viewport.beginPan(event);
  }
}

function handleCanvasPointerMove(event: PointerEvent) {
  if (
    handleTouchPointerMove(event, () => {
      event.preventDefault();
    })
  ) {
    return;
  }
  if (activeConnection.value) {
    const connectionPointerMoveRequest = resolveCanvasConnectionPointerMoveRequest({
      connection: activeConnection.value,
      hoverNodeId: resolveNodeIdAtPointer(event),
      targetAnchor: resolveAutoSnappedTargetAnchor(event),
      fallbackPoint: resolveCanvasPoint(event),
    });
    if (connectionPointerMoveRequest) {
      setActiveConnectionHoverNode(connectionPointerMoveRequest.hoverNodeId);
      scheduleDragFrame(() => {
        updatePendingConnectionTarget({
          targetAnchor: connectionPointerMoveRequest.targetAnchor,
          fallbackPoint: connectionPointerMoveRequest.fallbackPoint,
        });
      });
    }
    return;
  }
  if (handleNodeDragResizePointerMove(event)) {
    return;
  }
  const panPointerMoveAction = resolveCanvasPanPointerMoveAction({
    isPanning: viewport.isPanning.value,
    isCanvasEmpty: isCanvasEmpty.value,
  });
  switch (panPointerMoveAction.type) {
    case "continue-pointer-move":
      return;
    case "schedule-pan-move":
      scheduleDragFrame(() => {
        viewport.movePan(event);
      });
      return;
  }
}

function handleCanvasPointerUp(event: PointerEvent) {
  flushScheduledDragFrame();
  const pinchPointerReleaseAction = releaseCanvasPointer(event.pointerId);
  switch (pinchPointerReleaseAction.type) {
    case "end-pinch-zoom":
      clearPinchZoom();
      viewport.endPan();
      return;
    case "continue-pointer-up":
      break;
  }
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId);
  }
  releaseNodeDragResizePointerCapture(event.pointerId);
  if (activeConnection.value) {
    const connectionPointerUpAction = resolveCanvasConnectionPointerUpAction({
      connection: activeConnection.value,
      interactionLocked: isGraphEditingLocked(),
      autoSnappedTargetAnchor: autoSnappedTargetAnchor.value,
    });
    switch (connectionPointerUpAction?.type) {
      case "clear-connection-interaction":
        clearConnectionInteractionState();
        return;
      case "complete-connection":
        completePendingConnection(connectionPointerUpAction.targetAnchor);
        return;
      case "open-creation-menu":
        openCreationMenuFromPendingConnection(event);
        break;
    }
  }
  finishNodeDragResizePointer(event.pointerId);
  viewport.endPan(event);
}

function handleCanvasDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const doubleClickCreationAction = resolveCanvasDoubleClickCreationAction({
    interactionLocked: isGraphEditingLocked(),
    isIgnoredTarget: isIgnoredCanvasDoubleClickTarget(target),
    position: resolveCanvasPoint(event),
    clientX: event.clientX,
    clientY: event.clientY,
  });
  switch (doubleClickCreationAction.type) {
    case "locked-edit-attempt":
      emit("locked-edit-attempt");
      return;
    case "ignore-target":
      return;
    case "open-creation-menu":
      emit("open-node-creation-menu", doubleClickCreationAction.payload);
  }
}

function handleNodeDoubleClick(nodeId: string, event: MouseEvent) {
  const node = props.document.nodes[nodeId];
  if (node?.kind !== "subgraph") {
    return;
  }
  event.preventDefault();
  if (isGraphEditingLocked()) {
    emit("locked-edit-attempt");
    return;
  }
  emit("open-subgraph-editor", { nodeId });
}

function isIgnoredCanvasDoubleClickTarget(target: HTMLElement | null) {
  return Boolean(
    target?.closest(
      ".editor-canvas__node, .node-card, button, input, textarea, select, .el-input, .el-select, .el-switch",
    ),
  );
}

function resolveNodeIdAtPointer(event: PointerEvent) {
  for (const [nodeId, nodeElement] of Array.from(nodeElementMap.entries()).reverse()) {
    if (isPointerWithinNodeElement(nodeElement, event)) {
      return nodeId;
    }
  }
  return null;
}

function resolveAutoSnappedTargetAnchor(event: PointerEvent) {
  return resolveCanvasAutoSnappedTargetAnchorModel({
    connection: activeConnection.value,
    nodeIdAtPointer: resolveNodeIdAtPointer(event),
    canvasPoint: resolveCanvasPoint(event),
    flowAnchors: flowAnchors.value,
    projectedAnchors: projectedAnchors.value,
    baseProjectedAnchors: baseProjectedAnchors.value,
    nodes: props.document.nodes,
    measuredAnchorOffsets: measuredAnchorOffsets.value,
    measuredNodeSizes: measuredNodeSizes.value,
    eligibleTargetAnchorIds: eligibleTargetAnchorIds.value,
    pendingAgentInputSourceByNodeId: pendingAgentInputSourceByNodeId.value,
    canComplete: canCompleteCanvasConnection,
  });
}

function isPointerWithinNodeElement(nodeElement: HTMLElement, event: PointerEvent) {
  const rect = nodeElement.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function resolveEligibleTargetAnchorForNodeBody(nodeId: string) {
  return resolveCanvasEligibleTargetAnchorForNodeBody({
    connection: activeConnection.value,
    nodeId,
    node: props.document.nodes[nodeId],
    projectedAnchors: projectedAnchors.value,
    baseProjectedAnchors: baseProjectedAnchors.value,
    measuredAnchorOffsets: measuredAnchorOffsets.value,
    measuredNodeSize: measuredNodeSizes.value[nodeId],
    eligibleTargetAnchorIds: eligibleTargetAnchorIds.value,
    pendingAgentInputSource: pendingAgentInputSourceByNodeId.value[nodeId] ?? null,
    canComplete: canCompleteCanvasConnection,
  });
}

function canCompleteCanvasConnection(anchor: ProjectedCanvasAnchor) {
  return canCompleteCanvasAnchorConnection({
    connection: activeConnection.value,
    anchor,
    canCompleteGraphConnection: (targetAnchor) =>
      canCompleteGraphConnection(props.document, activeConnection.value, targetAnchor),
  });
}

function handleCanvasDragOver(event: DragEvent) {
  event.dataTransfer!.dropEffect = resolveCanvasDragOverDropEffect({
    interactionLocked: isGraphEditingLocked(),
    hasDraggedFiles: Boolean(event.dataTransfer?.files?.length),
  });
}

function handleCanvasDrop(event: DragEvent) {
  const target = event.target as HTMLElement | null;
  const dropCreationAction = resolveCanvasDropCreationAction({
    interactionLocked: isGraphEditingLocked(),
    isIgnoredTarget: isIgnoredCanvasDropTarget(target),
    file: event.dataTransfer?.files?.[0] ?? null,
    position: resolveCanvasPoint(event),
    clientX: event.clientX,
    clientY: event.clientY,
  });
  switch (dropCreationAction.type) {
    case "locked-edit-attempt":
      emit("locked-edit-attempt");
      return;
    case "ignore-target":
    case "ignore-missing-file":
      return;
    case "create-from-file":
      emit("create-node-from-file", dropCreationAction.payload);
  }
}

function isIgnoredCanvasDropTarget(target: HTMLElement | null) {
  return Boolean(target?.closest(".editor-canvas__node, .node-card"));
}

function handleNodePointerDown(nodeId: string, event: PointerEvent) {
  const node = props.document.nodes[nodeId];
  const target = event.target;
  const preserveInlineEditorFocus =
    target instanceof HTMLElement && Boolean(target.closest("[data-text-editor-trigger='true']"));
  const nodePointerDownAction = resolveNodePointerDownAction({
    nodeId,
    nodeExists: Boolean(node),
    interactionLocked: isGraphEditingLocked(),
    preserveInlineEditorFocus,
  });
  switch (nodePointerDownAction.type) {
    case "ignore-missing-node":
      return;
    case "locked-edit-attempt":
      if (nodePointerDownAction.preventDefault) {
        event.preventDefault();
      }
      if (nodePointerDownAction.focusCanvas) {
        canvasRef.value?.focus();
      }
      if (nodePointerDownAction.clearCanvasTransientState) {
        clearCanvasTransientState();
      }
      selection.selectNode(nodePointerDownAction.selectNodeId);
      return;
    case "start-drag":
      break;
  }
  if (activeConnection.value) {
    const connectionNodePointerDownAction = resolveCanvasNodePointerDownConnectionAction({
      connection: activeConnection.value,
      targetAnchor: resolveEligibleTargetAnchorForNodeBody(nodeId),
      preserveInlineEditorFocus,
    });
    switch (connectionNodePointerDownAction?.type) {
      case "complete-connection":
        if (connectionNodePointerDownAction.preventDefault) {
          event.preventDefault();
        }
        if (connectionNodePointerDownAction.focusCanvas) {
          canvasRef.value?.focus();
        }
        completePendingConnection(connectionNodePointerDownAction.targetAnchor);
        return;
      case "continue-node-pointer-down":
        break;
    }
  }
  if (!node) {
    return;
  }
  const captureElement = applyNodePointerDownDragSetup(nodePointerDownAction, event);
  startNodeDrag({
    nodeId,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originX: node.ui.position.x,
    originY: node.ui.position.y,
    captureElement,
    moved: false,
  });
}

function applyNodePointerDownDragSetup(
  action: Extract<CanvasNodePointerDownAction, { type: "start-drag" }>,
  event: PointerEvent,
) {
  if (action.focusCanvas) {
    canvasRef.value?.focus();
  }
  if (action.preventDefault) {
    event.preventDefault();
  }
  let captureElement: HTMLElement | null = null;
  if (action.setPointerCapture && event.currentTarget instanceof HTMLElement) {
    captureElement = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  if (action.clearCanvasTransientState) {
    clearCanvasTransientState();
  }
  if (action.clearPendingConnection) {
    clearPendingConnection();
  }
  if (action.cancelScheduledDragFrame) {
    cancelScheduledDragFrame();
  }
  if (action.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
  selection.selectNode(action.selectNodeId);
  return captureElement;
}

function handleNodeResizePointerDown(nodeId: string, handle: NodeResizeHandle, event: PointerEvent) {
  const node = props.document.nodes[nodeId];
  const nodeResizePointerDownAction = resolveNodeResizePointerDownAction({
    nodeId,
    nodeExists: Boolean(node),
    interactionLocked: isGraphEditingLocked(),
    hasActiveConnection: Boolean(activeConnection.value),
  });
  switch (nodeResizePointerDownAction.type) {
    case "ignore-missing-node":
      return;
    case "locked-edit-attempt":
      if (nodeResizePointerDownAction.preventDefault) {
        event.preventDefault();
      }
      emit("locked-edit-attempt");
      return;
    case "ignore-active-connection":
      return;
    case "start-resize": {
      if (!node) {
        return;
      }
      const captureElement = applyNodeResizePointerDownSetup(nodeResizePointerDownAction, event);
      startNodeResizeDrag({
        nodeId,
        pointerId: event.pointerId,
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originPosition: { ...node.ui.position },
        originSize: resolveNodeRenderedSize({
          nodeId,
          node,
          measuredNodeSizes: measuredNodeSizes.value,
        }),
        captureElement,
        moved: false,
      });
      return;
    }
  }
}

function applyNodeResizePointerDownSetup(
  action: Extract<CanvasNodeResizePointerDownAction, { type: "start-resize" }>,
  event: PointerEvent,
) {
  if (action.focusCanvas) {
    canvasRef.value?.focus();
  }
  let captureElement: HTMLElement | null = null;
  if (action.setPointerCapture && event.currentTarget instanceof HTMLElement) {
    captureElement = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  if (action.clearCanvasTransientState) {
    clearCanvasTransientState();
  }
  if (action.clearPendingConnection) {
    clearPendingConnection();
  }
  if (action.cancelScheduledDragFrame) {
    cancelScheduledDragFrame();
  }
  if (action.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
  selection.selectNode(action.selectNodeId);
  return captureElement;
}

function isNodeResizeHotzoneEnabled() {
  return !isGraphEditingLocked() && !activeConnection.value;
}

function isFlowHotspotVisible(anchor: ProjectedCanvasAnchor) {
  return isCanvasFlowHotspotVisible({
    mode: edgeVisibilityMode.value,
    anchor,
    selectedNodeId: selection.selectedNodeId.value,
    hoveredNodeId: hoveredNodeId.value,
    hoveredFlowHandleNodeId: hoveredFlowHandleNodeId.value,
    activeConnectionSourceAnchorId: activeConnectionSourceAnchorId.value,
    eligibleTargetAnchorIds: eligibleTargetAnchorIds.value,
  });
}

function zoomViewportAroundCanvasCenter(nextScale: number) {
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) {
    viewport.setViewport({
      ...viewport.viewport,
      scale: nextScale,
    });
    return;
  }

  viewport.zoomAt({
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    canvasLeft: rect.left,
    canvasTop: rect.top,
    nextScale,
  });
}

function handleZoomButton(control: CanvasZoomButtonControl) {
  if (isCanvasEmpty.value) {
    return;
  }
  const zoomButtonAction = resolveCanvasZoomButtonAction({
    control,
    currentScale: viewport.viewport.scale,
  });
  switch (zoomButtonAction.type) {
    case "zoom-around-center":
      zoomViewportAroundCanvasCenter(zoomButtonAction.nextScale);
      return;
    case "reset-viewport":
      viewport.setViewport(zoomButtonAction.viewport);
      return;
  }
}

function handleZoomOut() {
  handleZoomButton("zoom-out");
}

function handleZoomIn() {
  handleZoomButton("zoom-in");
}

function handleZoomReset() {
  handleZoomButton("reset");
}

function handleWheel(event: WheelEvent) {
  const wheelZoomRequest = resolveCanvasWheelZoomRequest({
    deltaY: event.deltaY,
    currentScale: viewport.viewport.scale,
    clientX: event.clientX,
    clientY: event.clientY,
    canvasRect: canvasRef.value?.getBoundingClientRect() ?? null,
    isCanvasEmpty: isCanvasEmpty.value,
  });
  switch (wheelZoomRequest.type) {
    case "ignore":
      return;
    case "set-scale":
      viewport.setViewport({
        ...viewport.viewport,
        scale: wheelZoomRequest.nextScale,
      });
      return;
    case "zoom-at":
      viewport.zoomAt({
        clientX: wheelZoomRequest.clientX,
        clientY: wheelZoomRequest.clientY,
        canvasLeft: wheelZoomRequest.canvasLeft,
        canvasTop: wheelZoomRequest.canvasTop,
        nextScale: wheelZoomRequest.nextScale,
      });
  }
}

function handleEdgePointerDown(edge: ProjectedCanvasEdge, event: PointerEvent) {
  const edgePointerDownAction = resolveCanvasEdgePointerDownAction({
    interactionLocked: isGraphEditingLocked(),
    edge,
    selectedEdgeId: selectedEdgeId.value,
  });
  switch (edgePointerDownAction.type) {
    case "locked-edit-attempt":
      if (edgePointerDownAction.preventDefault) {
        event.preventDefault();
      }
      emit("locked-edit-attempt");
      return;
    case "start-flow-edge-delete-confirm":
      applyEdgePointerDownBaseAction(edgePointerDownAction);
      if (edgePointerDownAction.clearSelectedEdge) {
        selectedEdgeId.value = null;
      }
      if (edgePointerDownAction.clearSelection) {
        selection.clearSelection();
      }
      startFlowEdgeDeleteConfirm(edge, event);
      return;
    case "start-data-edge-state-confirm":
      applyEdgePointerDownBaseAction(edgePointerDownAction);
      if (edgePointerDownAction.clearSelectedEdge) {
        selectedEdgeId.value = null;
      }
      if (edgePointerDownAction.clearSelection) {
        selection.clearSelection();
      }
      startDataEdgeStateConfirm(edge, event);
      return;
    case "clear-selected-edge":
      applyEdgePointerDownBaseAction(edgePointerDownAction);
      if (edgePointerDownAction.clearSelectedEdge) {
        selectedEdgeId.value = null;
      }
      if (edgePointerDownAction.clearPendingConnectionPoint) {
        setPendingConnectionPoint(null);
      }
      if (edgePointerDownAction.clearSelection) {
        selection.clearSelection();
      }
      return;
    case "select-edge":
      applyEdgePointerDownBaseAction(edgePointerDownAction);
      selectedEdgeId.value = edgePointerDownAction.selectEdgeId;
      if (edgePointerDownAction.updatePendingConnectionPoint) {
        setPendingConnectionPoint(
          resolveCanvasEdgeTargetPoint({
            edge,
            anchors: projectedAnchors.value,
          }),
        );
      }
      if (edgePointerDownAction.clearSelection) {
        selection.clearSelection();
      }
      return;
  }
}

function applyEdgePointerDownBaseAction(action: {
  focusCanvas?: true;
  clearCanvasTransientState?: true;
  clearPendingConnection?: true;
}) {
  if (action.focusCanvas) {
    canvasRef.value?.focus();
  }
  if (action.clearCanvasTransientState) {
    clearCanvasTransientState();
  }
  if (action.clearPendingConnection) {
    clearPendingConnection();
  }
}

function handleAnchorPointerDown(anchor: ProjectedCanvasAnchor) {
  const anchorPointerDownAction = resolveCanvasAnchorPointerDownAction({
    interactionLocked: isGraphEditingLocked(),
    anchor,
    canComplete: canCompleteCanvasConnection(anchor),
    canStart: canStartGraphConnection(anchor.kind),
  });
  switch (anchorPointerDownAction.type) {
    case "locked-edit-attempt":
      emit("locked-edit-attempt");
      return;
    case "complete-connection":
      applyAnchorPointerDownSetup(anchorPointerDownAction);
      completePendingConnection(anchorPointerDownAction.targetAnchor);
      return;
    case "ignore-anchor":
      applyAnchorPointerDownSetup(anchorPointerDownAction);
      return;
    case "start-or-toggle-connection": {
      applyAnchorPointerDownSetup(anchorPointerDownAction);
      if (anchorPointerDownAction.clearWindowSelection) {
        window.getSelection()?.removeAllRanges();
      }
      const pendingConnectionResult = startOrTogglePendingConnectionFromAnchor(anchor);
      if (pendingConnectionResult.status !== "ignored") {
        selectedEdgeId.value = null;
      }
      return;
    }
  }
}

function applyAnchorPointerDownSetup(
  action: Exclude<CanvasAnchorPointerDownAction, { type: "locked-edit-attempt" }>,
) {
  if (action.focusCanvas) {
    canvasRef.value?.focus();
  }
  if (action.clearCanvasTransientState) {
    clearCanvasTransientState();
  }
  selection.selectNode(action.selectNodeId);
}

function openCreationMenuFromPendingConnection(event: PointerEvent) {
  const creationMenuAction = resolveCanvasPendingConnectionCreationMenuAction({
    interactionLocked: isGraphEditingLocked(),
    connection: activeConnection.value,
    position: resolveCanvasPoint(event),
    clientX: event.clientX,
    clientY: event.clientY,
    stateSchema: props.document.state_schema,
    nodes: props.document.nodes,
  });
  switch (creationMenuAction.type) {
    case "ignore-locked":
    case "ignore-missing-connection":
      return;
    case "ignore-empty-request":
      if (creationMenuAction.clearCanvasTransientState) {
        clearCanvasTransientState();
      }
      return;
    case "open-creation-menu":
      break;
  }
  if (creationMenuAction.clearCanvasTransientState) {
    clearCanvasTransientState();
  }

  emit("open-node-creation-menu", creationMenuAction.payload);

  if (creationMenuAction.clearConnectionInteraction) {
    clearConnectionInteractionState();
  }
  if (creationMenuAction.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
}

function focusNode(nodeId: string) {
  const node = props.document.nodes[nodeId];
  const canvas = canvasRef.value;
  const element = nodeElementMap.get(nodeId);
  const canvasRect = canvas?.getBoundingClientRect() ?? null;
  const focusedNodeViewportAction = resolveFocusedNodeViewportAction({
    currentScale: viewport.viewport.scale,
    canvasSize: canvasRect ? { width: canvasRect.width, height: canvasRect.height } : null,
    nodePosition: node?.ui.position ?? null,
    nodeSize: element ? { width: element.offsetWidth, height: element.offsetHeight } : null,
  });
  switch (focusedNodeViewportAction.type) {
    case "ignore-missing-target":
      return;
    case "set-viewport":
      selection.selectNode(nodeId);
      viewport.setViewport(focusedNodeViewportAction.viewport);
      return;
  }
}

function completePendingConnection(targetAnchor: ProjectedCanvasAnchor) {
  const completionAction = resolveCanvasConnectionCompletionExecutionAction({
    interactionLocked: isGraphEditingLocked(),
    connection: activeConnection.value,
    targetAnchor,
    stateSchema: props.document.state_schema,
    nodes: props.document.nodes,
  });

  switch (completionAction.type) {
    case "ignore-locked":
    case "ignore-missing-connection":
      return;
    case "complete-connection":
      break;
  }

  emitCanvasConnectionCompletionAction(completionAction.action);

  if (completionAction.clearConnectionInteraction) {
    clearConnectionInteractionState();
  }
  if (completionAction.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
}

function emitCanvasConnectionCompletionAction(action: CanvasConnectionCompletionAction | null) {
  if (!action) {
    return;
  }
  switch (action.type) {
    case "connect-flow":
      emit("connect-flow", action.payload);
      break;
    case "connect-state":
      emit("connect-state", action.payload);
      break;
    case "connect-state-input-source":
      emit("connect-state-input-source", action.payload);
      break;
    case "connect-route":
      emit("connect-route", action.payload);
      break;
    case "reconnect-flow":
      emit("reconnect-flow", action.payload);
      break;
    case "reconnect-route":
      emit("reconnect-route", action.payload);
      break;
  }
}

function handleSelectedEdgeDelete(event: KeyboardEvent) {
  const selectedEdgeKeyboardDeleteAction = resolveSelectedEdgeKeyboardDeleteAction({
    isEditableTarget: isEditableKeyboardEventTarget(event.target),
    interactionLocked: isGraphEditingLocked(),
    selectedEdgeId: selectedEdgeId.value,
    edges: projectedEdges.value,
  });
  switch (selectedEdgeKeyboardDeleteAction.type) {
    case "ignore-editable-target":
    case "ignore-missing-edge":
    case "ignore-non-deletable-edge":
      return;
    case "locked-edit-attempt":
      guardLockedCanvasInteraction();
      event.preventDefault();
      return;
    case "delete-edge":
      event.preventDefault();
      break;
  }

  const action = selectedEdgeKeyboardDeleteAction.action;
  if (action.kind === "route") {
    emit("remove-route", {
      sourceNodeId: action.sourceNodeId,
      branchKey: action.branchKey,
    });
  } else {
    emit("remove-flow", {
      sourceNodeId: action.sourceNodeId,
      targetNodeId: action.targetNodeId,
    });
  }

  if (selectedEdgeKeyboardDeleteAction.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
  if (selectedEdgeKeyboardDeleteAction.clearPendingConnectionPoint) {
    setPendingConnectionPoint(null);
  }
}

function resolveCanvasPoint(event: { clientX: number; clientY: number }) {
  const canvasRect = canvasRef.value?.getBoundingClientRect() ?? null;
  return resolveCanvasWorldPoint({
    clientX: event.clientX,
    clientY: event.clientY,
    canvasRect,
    viewport: viewport.viewport,
    fallbackPoint: pendingConnectionPoint.value,
  });
}

function resolveRunNodePresentationForNode(nodeId: string) {
  return resolveRunNodePresentationForCanvasNode({
    nodeId,
    currentRunNodeId: props.currentRunNodeId,
    latestRunStatus: props.latestRunStatus,
    runNodeStatusByNodeId: props.runNodeStatusByNodeId,
  });
}

function resolveRunNodeClassList(nodeId: string) {
  return resolveRunNodeClassListForCanvasNode({
    nodeId,
    currentRunNodeId: props.currentRunNodeId,
    latestRunStatus: props.latestRunStatus,
    runNodeStatusByNodeId: props.runNodeStatusByNodeId,
  });
}

function isHumanReviewNode(nodeId: string) {
  return isHumanReviewRunNode({
    nodeId,
    currentRunNodeId: props.currentRunNodeId,
    latestRunStatus: props.latestRunStatus,
  });
}

function isNodeVisuallySelected(nodeId: string) {
  return isCanvasNodeVisuallySelected({
    nodeId,
    selectedNodeId: selection.selectedNodeId.value,
    currentRunNodeId: props.currentRunNodeId,
    latestRunStatus: props.latestRunStatus,
  });
}

function isGraphEditingLocked() {
  return Boolean(props.interactionLocked);
}

function handleLockBannerClick() {
  const lockBannerClickAction = resolveLockBannerClickAction({
    currentRunNodeId: props.currentRunNodeId,
  });
  switch (lockBannerClickAction.type) {
    case "locked-edit-attempt":
      emit("locked-edit-attempt");
      return;
    case "open-human-review":
      emit("open-human-review", { nodeId: lockBannerClickAction.nodeId });
  }
}

function guardLockedCanvasInteraction() {
  const lockedCanvasInteractionGuardAction = resolveLockedCanvasInteractionGuardAction({
    interactionLocked: isGraphEditingLocked(),
  });
  switch (lockedCanvasInteractionGuardAction.type) {
    case "allow-interaction":
      return false;
    case "block-locked-interaction":
      break;
  }
  if (lockedCanvasInteractionGuardAction.clearCanvasTransientState) {
    clearCanvasTransientState();
  }
  if (lockedCanvasInteractionGuardAction.clearPendingConnection) {
    clearPendingConnection();
  }
  if (lockedCanvasInteractionGuardAction.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
  if (lockedCanvasInteractionGuardAction.emitLockedEditAttempt) {
    emit("locked-edit-attempt");
  }
  return true;
}

function isLockedNodeEditTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "button",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[data-top-action-surface='true']",
        "[data-state-editor-trigger='true']",
        "[data-text-editor-trigger='true']",
        "[data-node-popup-surface='true']",
        ".node-card__port-pill-remove",
        ".node-card__state-editor",
        ".node-card__state-editor-popper",
        ".el-switch",
        ".el-select",
        ".el-input",
      ].join(", "),
    ),
  );
}

function handleLockedNodePointerCapture(nodeId: string, event: PointerEvent) {
  const target = event.target;
  const shouldNotifyLockedAttempt = Boolean(
    (target instanceof HTMLElement && target.closest("[data-human-review-action='true']")) ||
      isLockedNodeEditTarget(target),
  );
  const lockedNodePointerCaptureAction = resolveLockedNodePointerCaptureAction({
    interactionLocked: isGraphEditingLocked(),
    nodeId,
    shouldNotifyLockedAttempt,
  });
  switch (lockedNodePointerCaptureAction.type) {
    case "ignore-unlocked":
      return;
    case "capture-locked-node":
      break;
  }
  if (lockedNodePointerCaptureAction.emitLockedEditAttempt) {
    emit("locked-edit-attempt");
  }
  if (lockedNodePointerCaptureAction.preventDefault) {
    event.preventDefault();
  }
  if (lockedNodePointerCaptureAction.stopPropagation) {
    event.stopPropagation();
  }
  if (lockedNodePointerCaptureAction.focusCanvas) {
    canvasRef.value?.focus();
  }
  if (lockedNodePointerCaptureAction.clearCanvasTransientState) {
    clearCanvasTransientState();
  }
  if (lockedNodePointerCaptureAction.clearPendingConnection) {
    clearPendingConnection();
  }
  if (lockedNodePointerCaptureAction.clearSelectedEdge) {
    selectedEdgeId.value = null;
  }
  selection.selectNode(lockedNodePointerCaptureAction.selectNodeId);
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
  background: var(--graphite-canvas-bg);
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
  top: calc(var(--editor-canvas-floating-top-clearance, 18px) + 64px);
  left: 50%;
  z-index: 33;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: min(420px, calc(100vw - 56px));
  appearance: none;
  transform: translateX(-50%);
  padding: 14px 28px;
  border: 1px solid rgba(255, 247, 237, 0.34);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(154, 52, 18, 0.96), rgba(131, 43, 13, 0.94));
  color: #fff7ed;
  font-size: 0.92rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow:
    0 0 0 1px rgba(255, 247, 237, 0.16) inset,
    0 18px 42px rgba(124, 45, 18, 0.24),
    0 0 34px rgba(217, 119, 6, 0.24);
  backdrop-filter: blur(28px) saturate(1.4) contrast(1.08);
  animation: editor-canvas-lock-banner-breathe 2.4s ease-in-out infinite;
  cursor: pointer;
  pointer-events: auto;
}

.editor-canvas__lock-banner:hover,
.editor-canvas__lock-banner:focus-visible {
  border-color: rgba(255, 247, 237, 0.54);
  outline: none;
  box-shadow:
    0 0 0 1px rgba(255, 247, 237, 0.22) inset,
    0 20px 46px rgba(124, 45, 18, 0.3),
    0 0 42px rgba(234, 88, 12, 0.34);
}

.editor-canvas__top-left-tools {
  position: absolute;
  left: 18px;
  top: calc(var(--editor-canvas-floating-top-clearance, 18px) + 18px);
  z-index: 24;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 36px);
  pointer-events: none;
}

.editor-canvas__top-left-tools > * {
  pointer-events: auto;
}

.editor-canvas__edge-view-toolbar {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  padding: 5px;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 999px;
  background: var(--graphite-glass-bg);
  box-shadow:
    0 8px 20px rgba(31, 28, 24, 0.045),
    var(--graphite-glass-highlight),
    var(--graphite-glass-rim);
  backdrop-filter: blur(20px) saturate(1.45) contrast(1.01);
  cursor: default;
  pointer-events: auto;
}

.editor-canvas__source-context-pill {
  overflow: hidden;
  max-width: clamp(180px, calc(100vw - 520px), 520px);
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.9);
  padding: 9px 14px;
  color: rgba(30, 64, 175, 0.92);
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow:
    0 8px 20px rgba(31, 28, 24, 0.045),
    var(--graphite-glass-highlight),
    var(--graphite-glass-rim);
  backdrop-filter: blur(18px) saturate(1.35);
}

.editor-canvas__edge-view-toolbar::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens);
  mix-blend-mode: screen;
  opacity: 0.36;
}

.editor-canvas__edge-view-button {
  position: relative;
  z-index: 1;
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

.editor-canvas__navigation-stack {
  --editor-canvas-navigation-width: 224px;
  position: absolute;
  right: calc(22px + var(--editor-canvas-minimap-right-clearance, 0px));
  bottom: 22px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: var(--editor-canvas-navigation-width);
  pointer-events: none;
  transition: right 180ms ease;
}

.editor-canvas__zoom-toolbar {
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  overflow: hidden;
  padding: 5px;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 999px;
  background: var(--graphite-glass-bg);
  box-shadow:
    0 8px 20px rgba(31, 28, 24, 0.045),
    var(--graphite-glass-highlight),
    var(--graphite-glass-rim);
  backdrop-filter: blur(20px) saturate(1.45) contrast(1.01);
  cursor: default;
  pointer-events: auto;
}

.editor-canvas__zoom-toolbar::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens);
  mix-blend-mode: screen;
  opacity: 0.36;
}

.editor-canvas__zoom-button,
.editor-canvas__zoom-label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  border-radius: 999px;
  color: rgba(73, 52, 34, 0.72);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1;
}

.editor-canvas__zoom-button {
  width: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  transition:
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.editor-canvas__zoom-button:hover {
  background: rgba(154, 52, 18, 0.08);
  color: rgba(75, 42, 18, 0.92);
}

.editor-canvas__zoom-label {
  min-width: 48px;
  padding: 0 8px;
  background: rgba(255, 250, 242, 0.42);
  font-variant-numeric: tabular-nums;
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
  pointer-events: auto;
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

.editor-canvas__empty-card:focus-visible {
  outline: 3px solid rgba(201, 107, 31, 0.42);
  outline-offset: 4px;
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

.editor-canvas__edge-state-disconnect {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(220, 38, 38, 0.16);
  border-radius: 8px;
  background: rgba(255, 247, 237, 0.94);
  box-shadow: 0 14px 28px rgba(127, 29, 29, 0.12);
  backdrop-filter: blur(18px);
}

.editor-canvas__edge-state-disconnect-title {
  font-size: 0.78rem;
  font-weight: 760;
  color: rgba(127, 29, 29, 0.9);
}

.editor-canvas__edge-state-disconnect-copy {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.45;
  color: rgba(120, 53, 15, 0.76);
}

.editor-canvas__edge-state-disconnect-actions {
  display: grid;
  gap: 6px;
}

.editor-canvas__edge-state-disconnect-button {
  width: 100%;
  min-height: 34px;
  border: 1px solid rgba(185, 28, 28, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  color: rgba(127, 29, 29, 0.9);
  font: inherit;
  font-size: 0.76rem;
  font-weight: 720;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.editor-canvas__edge-state-disconnect-button:hover {
  border-color: rgba(185, 28, 28, 0.34);
  background: rgba(254, 242, 242, 0.96);
  color: rgb(127, 29, 29);
  transform: translateY(-1px);
}

.editor-canvas__edge-state-disconnect-button--flow {
  border-color: rgba(217, 119, 6, 0.24);
  color: rgba(146, 64, 14, 0.92);
}

.editor-canvas__edge-state-disconnect-button--flow:hover {
  border-color: rgba(217, 119, 6, 0.4);
  background: rgba(255, 251, 235, 0.96);
  color: rgb(146, 64, 14);
}

.editor-canvas__edge-state-confirm-actions {
  display: grid;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.editor-canvas__edge-state-confirm-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 36px;
  border: 1px solid rgba(37, 99, 235, 0.22);
  border-radius: 8px;
  background: rgb(37, 99, 235);
  color: #fff;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 760;
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.editor-canvas__edge-state-confirm-button:hover {
  border-color: rgba(29, 78, 216, 0.34);
  background: rgb(29, 78, 216);
  transform: translateY(-1px);
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
  filter: drop-shadow(0 0 10px var(--editor-edge-stroke, rgba(16, 185, 129, 0.38)));
}

.editor-canvas__edge--flow.editor-canvas__edge--active-run,
.editor-canvas__edge--route.editor-canvas__edge--active-run {
  animation: editor-canvas-flow-line 1.8s linear infinite, editor-canvas-active-run-edge-breathe 2.2s ease-in-out infinite;
}

.editor-canvas__edge--data.editor-canvas__edge--active-run {
  animation: editor-canvas-ant-line 1.2s linear infinite, editor-canvas-active-run-edge-breathe 2.2s ease-in-out infinite;
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
  pointer-events: none;
  cursor: crosshair;
  touch-action: none;
}

.editor-canvas__flow-hotspot--visible,
.editor-canvas__flow-hotspot--connect-source,
.editor-canvas__flow-hotspot--connect-target {
  pointer-events: auto;
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
  --node-card-radius: 28px;
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

.editor-canvas__node--resizing {
  z-index: 9;
}

.editor-canvas__resize-hotzones {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 10;
}

.editor-canvas__resize-hotzone {
  position: absolute;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  touch-action: none;
}

.editor-canvas__resize-hotzone--nw {
  top: -6px;
  left: -6px;
}

.editor-canvas__resize-hotzone--ne {
  top: -6px;
  right: -6px;
}

.editor-canvas__resize-hotzone--sw {
  bottom: -6px;
  left: -6px;
}

.editor-canvas__resize-hotzone--se {
  right: -6px;
  bottom: -6px;
}

.editor-canvas__resize-hotzone--nw,
.editor-canvas__resize-hotzone--se {
  cursor: nwse-resize;
}

.editor-canvas__resize-hotzone--ne,
.editor-canvas__resize-hotzone--sw {
  cursor: nesw-resize;
}

@keyframes editor-canvas-lock-banner-breathe {
  0%,
  100% {
    transform: translateX(-50%) scale(1);
    box-shadow:
      0 0 0 1px rgba(255, 247, 237, 0.16) inset,
      0 18px 42px rgba(124, 45, 18, 0.24),
      0 0 28px rgba(217, 119, 6, 0.22);
  }

  48% {
    transform: translateX(-50%) scale(1.018);
    box-shadow:
      0 0 0 1px rgba(255, 247, 237, 0.26) inset,
      0 22px 50px rgba(124, 45, 18, 0.32),
      0 0 42px rgba(234, 88, 12, 0.34);
  }

  58% {
    transform: translateX(-50%) scale(1.006);
    box-shadow:
      0 0 0 1px rgba(255, 247, 237, 0.2) inset,
      0 18px 42px rgba(124, 45, 18, 0.26),
      0 0 32px rgba(217, 119, 6, 0.26);
  }
}

@keyframes editor-canvas-active-run-edge-breathe {
  0%,
  100% {
    opacity: 0.78;
    filter: drop-shadow(0 0 6px var(--editor-edge-stroke, rgba(16, 185, 129, 0.28)));
  }

  44% {
    opacity: 1;
    filter: drop-shadow(0 0 14px var(--editor-edge-stroke, rgba(16, 185, 129, 0.5)));
  }

  56% {
    opacity: 0.86;
    filter: drop-shadow(0 0 9px var(--editor-edge-stroke, rgba(16, 185, 129, 0.36)));
  }

  66% {
    opacity: 0.97;
    filter: drop-shadow(0 0 12px var(--editor-edge-stroke, rgba(16, 185, 129, 0.46)));
  }
}

@keyframes editor-canvas-running-halo-breathe {
  0%,
  100% {
    opacity: var(--editor-canvas-node-halo-opacity-rest, 0.48);
    filter: blur(var(--editor-canvas-node-halo-blur-rest, 8px));
    transform: scale(var(--editor-canvas-node-halo-scale-rest, 0.985));
    background: var(--editor-canvas-node-halo-background-rest);
  }

  42% {
    opacity: var(--editor-canvas-node-halo-opacity-peak, 0.9);
    filter: blur(var(--editor-canvas-node-halo-blur-peak, 11px));
    transform: scale(var(--editor-canvas-node-halo-scale-peak, 1.035));
    background: var(--editor-canvas-node-halo-background-peak);
  }

  56% {
    opacity: var(--editor-canvas-node-halo-opacity-flicker, 0.62);
    filter: blur(var(--editor-canvas-node-halo-blur-flicker, 8px));
    transform: scale(var(--editor-canvas-node-halo-scale-flicker, 1.004));
    background: var(--editor-canvas-node-halo-background-flicker);
  }

  66% {
    opacity: var(--editor-canvas-node-halo-opacity-afterglow, 0.82);
    filter: blur(var(--editor-canvas-node-halo-blur-peak, 11px));
    transform: scale(var(--editor-canvas-node-halo-scale-afterglow, 1.026));
    background: var(--editor-canvas-node-halo-background-peak);
  }
}

@keyframes editor-canvas-paused-halo-breathe {
  0%,
  100% {
    opacity: var(--editor-canvas-node-halo-opacity-rest, 0.48);
    filter: blur(var(--editor-canvas-node-halo-blur-rest, 8px));
    transform: scale(var(--editor-canvas-node-halo-scale-rest, 0.985));
    background: var(--editor-canvas-node-halo-background-rest);
  }

  46% {
    opacity: var(--editor-canvas-node-halo-opacity-peak, 0.88);
    filter: blur(var(--editor-canvas-node-halo-blur-peak, 11px));
    transform: scale(var(--editor-canvas-node-halo-scale-peak, 1.035));
    background: var(--editor-canvas-node-halo-background-peak);
  }

  58% {
    opacity: var(--editor-canvas-node-halo-opacity-flicker, 0.62);
    filter: blur(var(--editor-canvas-node-halo-blur-flicker, 10px));
    transform: scale(var(--editor-canvas-node-halo-scale-flicker, 1.004));
    background: var(--editor-canvas-node-halo-background-flicker);
  }

  70% {
    opacity: var(--editor-canvas-node-halo-opacity-afterglow, 0.82);
    filter: blur(var(--editor-canvas-node-halo-blur-peak, 11px));
    transform: scale(var(--editor-canvas-node-halo-scale-afterglow, 1.026));
    background: var(--editor-canvas-node-halo-background-peak);
  }
}

@keyframes editor-canvas-running-halo-breathe-reduced {
  0%,
  100% {
    opacity: var(--editor-canvas-node-halo-opacity-rest, 0.48);
    filter: blur(var(--editor-canvas-node-halo-blur-rest, 8px));
    transform: scale(1);
    background: var(--editor-canvas-node-halo-background-rest);
  }

  50% {
    opacity: var(--editor-canvas-node-halo-opacity-peak, 0.9);
    filter: blur(var(--editor-canvas-node-halo-blur-peak, 11px));
    transform: scale(1);
    background: var(--editor-canvas-node-halo-background-peak);
  }
}

@keyframes editor-canvas-paused-halo-breathe-reduced {
  0%,
  100% {
    opacity: var(--editor-canvas-node-halo-opacity-rest, 0.48);
    filter: blur(var(--editor-canvas-node-halo-blur-rest, 8px));
    transform: scale(1);
    background: var(--editor-canvas-node-halo-background-rest);
  }

  50% {
    opacity: var(--editor-canvas-node-halo-opacity-peak, 0.88);
    filter: blur(var(--editor-canvas-node-halo-blur-peak, 11px));
    transform: scale(1);
    background: var(--editor-canvas-node-halo-background-peak);
  }
}

.editor-canvas__node-halo {
  --editor-canvas-node-halo-outset: 5px;
  position: absolute;
  inset: calc(-1 * var(--editor-canvas-node-halo-outset, 5px));
  z-index: 0;
  border-radius: calc(var(--node-card-radius, 28px) + var(--editor-canvas-node-halo-outset, 5px));
  box-sizing: border-box;
  border: 0;
  background: var(--editor-canvas-node-halo-background-rest);
  box-shadow: none;
  pointer-events: none;
  opacity: var(--editor-canvas-node-halo-opacity-rest, 0.48);
  filter: blur(var(--editor-canvas-node-halo-blur-rest, 8px));
  transform: scale(var(--editor-canvas-node-halo-scale-rest, 0.985));
  transform-origin: center;
  transition: opacity 160ms ease, filter 160ms ease, transform 160ms ease, background 160ms ease;
  will-change: opacity, filter, transform, background;
}

.editor-canvas__node > :global(.node-card) {
  position: relative;
  z-index: 1;
}

.editor-canvas__node-halo--running {
  --editor-canvas-node-halo-opacity-rest: 0.5;
  --editor-canvas-node-halo-opacity-peak: 0.9;
  --editor-canvas-node-halo-opacity-flicker: 0.62;
  --editor-canvas-node-halo-opacity-afterglow: 0.82;
  --editor-canvas-node-halo-blur-rest: 7px;
  --editor-canvas-node-halo-blur-peak: 11px;
  --editor-canvas-node-halo-blur-flicker: 8px;
  --editor-canvas-node-halo-scale-rest: 0.985;
  --editor-canvas-node-halo-scale-peak: 1.035;
  --editor-canvas-node-halo-scale-flicker: 1.004;
  --editor-canvas-node-halo-scale-afterglow: 1.026;
  --editor-canvas-node-halo-background-rest: rgba(16, 185, 129, 0.18);
  --editor-canvas-node-halo-background-peak: rgba(16, 185, 129, 0.32);
  --editor-canvas-node-halo-background-flicker: rgba(16, 185, 129, 0.22);
  animation: editor-canvas-running-halo-breathe 1.35s ease-in-out infinite;
}

.editor-canvas__node-halo--paused {
  --editor-canvas-node-halo-opacity-rest: 0.5;
  --editor-canvas-node-halo-opacity-peak: 0.88;
  --editor-canvas-node-halo-opacity-flicker: 0.62;
  --editor-canvas-node-halo-opacity-afterglow: 0.8;
  --editor-canvas-node-halo-blur-rest: 7px;
  --editor-canvas-node-halo-blur-peak: 11px;
  --editor-canvas-node-halo-blur-flicker: 8px;
  --editor-canvas-node-halo-scale-rest: 0.985;
  --editor-canvas-node-halo-scale-peak: 1.035;
  --editor-canvas-node-halo-scale-flicker: 1.004;
  --editor-canvas-node-halo-scale-afterglow: 1.026;
  --editor-canvas-node-halo-background-rest: rgba(245, 158, 11, 0.18);
  --editor-canvas-node-halo-background-peak: rgba(245, 158, 11, 0.32);
  --editor-canvas-node-halo-background-flicker: rgba(245, 158, 11, 0.22);
  animation: editor-canvas-paused-halo-breathe 1.55s ease-in-out infinite;
}

:global(.node-card.editor-canvas__node--running) {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(16, 185, 129, 0.52);
}

:global(.node-card.editor-canvas__node--paused) {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(245, 158, 11, 0.52);
}

@media (prefers-reduced-motion: reduce) {
  .editor-canvas__lock-banner,
  :global(.node-card.editor-canvas__node--running),
  :global(.node-card.editor-canvas__node--paused),
  .editor-canvas__edge--active-run,
  .editor-canvas__edge--flow.editor-canvas__edge--active-run,
  .editor-canvas__edge--route.editor-canvas__edge--active-run,
  .editor-canvas__edge--data.editor-canvas__edge--active-run {
    animation: none;
  }

  .editor-canvas__node-halo--running {
    animation: editor-canvas-running-halo-breathe-reduced 2.4s ease-in-out infinite;
  }

  .editor-canvas__node-halo--paused {
    animation: editor-canvas-paused-halo-breathe-reduced 2.6s ease-in-out infinite;
  }
}

:global(.node-card.editor-canvas__node--success) {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(16, 185, 129, 0.5);
}

:global(.node-card.editor-canvas__node--failed) {
  box-shadow:
    0 18px 36px rgba(60, 41, 20, 0.1),
    0 0 0 1.5px rgba(239, 68, 68, 0.56);
}
</style>
