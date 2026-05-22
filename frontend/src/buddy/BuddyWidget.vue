<template>
  <div class="buddy-widget" aria-live="polite">
    <button
      v-if="isVirtualCursorRendered"
      type="button"
      class="buddy-widget__virtual-cursor"
      :class="{
        'buddy-widget__virtual-cursor--docked': virtualCursorPhase !== 'active',
        'buddy-widget__virtual-cursor--launching': virtualCursorPhase === 'launching',
        'buddy-widget__virtual-cursor--returning': virtualCursorPhase === 'returning',
        'buddy-widget__virtual-cursor--floating': shouldFloatVirtualCursor,
        'buddy-widget__virtual-cursor--operation-active': isVirtualOperationRunning,
      }"
      :style="virtualCursorStyle"
      :title="t('buddy.virtualCursor')"
      :aria-label="t('buddy.virtualCursor')"
      @pointerdown="handleVirtualCursorPointerDown"
    >
      <svg
        class="buddy-widget__virtual-cursor-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-80 -80 160 160"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="buddyWidgetVirtualCursorGold" cx="0" cy="-24" r="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#f2c968" />
            <stop offset="62%" stop-color="#dfad50" />
            <stop offset="100%" stop-color="#c89136" />
          </radialGradient>
        </defs>
        <path
          class="buddy-widget__virtual-cursor-shape"
          fill="url(#buddyWidgetVirtualCursorGold)"
          :d="virtualCursorPath"
        >
          <animate
            ref="virtualCursorAnimateElement"
            v-if="virtualCursorMorphAnimation"
            :key="virtualCursorMorphAnimation.key"
            attributeName="d"
            begin="indefinite"
            :dur="`${virtualCursorMorphAnimation.durationMs}ms`"
            fill="freeze"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.2 0.8 0.2 1"
            :values="virtualCursorMorphAnimation.values"
          />
        </path>
      </svg>
    </button>
    <BuddyVirtualOperationBanner
      v-if="virtualOperationStatus"
      :status="virtualOperationStatus"
      @interrupt="interruptVirtualOperation"
    />
    <div
      class="buddy-widget__anchor"
      :class="[
        `buddy-widget__anchor--${panelPlacement}`,
        {
          'buddy-widget__anchor--fullscreen': isPanelFullscreen,
          'buddy-widget__anchor--roaming': mascotMotion === 'roam',
        },
      ]"
      :style="anchorStyle"
    >
      <div
        v-if="isPanelOpen && isPanelFullscreen"
        class="buddy-widget__backdrop"
        aria-hidden="true"
        @click="isPanelFullscreen = false"
      />
      <section
        v-if="isPanelOpen"
        class="buddy-widget__panel"
        :class="{ 'buddy-widget__panel--fullscreen': isPanelFullscreen }"
        :aria-label="t('buddy.panelLabel')"
      >
        <header class="buddy-widget__header">
          <div class="buddy-widget__heading">
            <span class="buddy-widget__eyebrow">{{ t("buddy.eyebrow") }}</span>
            <h2>{{ t("buddy.title") }}</h2>
          </div>
          <div class="buddy-widget__header-actions">
            <BuddySessionHistory
              :open="isSessionPanelOpen"
              :sessions="chatSessions"
              :active-session-id="activeSessionId"
              :loading="isSessionLoading"
              :switch-locked="isSessionSwitchLocked"
              :delete-confirm-session-id="activeSessionDeleteId"
              @toggle="toggleSessionPanel"
              @select="selectChatSession"
              @delete-action="handleSessionDeleteActionClick"
            />
            <button
              type="button"
              class="buddy-widget__icon-button"
              :title="t('buddy.newSession')"
              :aria-label="t('buddy.newSession')"
              :disabled="!canCreateNewSession"
              @click="createNewSession"
            >
              <ElIcon><Plus /></ElIcon>
            </button>
            <button
              type="button"
              class="buddy-widget__icon-button"
              :title="isPanelFullscreen ? t('buddy.exitFullscreen') : t('buddy.fullscreen')"
              :aria-label="isPanelFullscreen ? t('buddy.exitFullscreen') : t('buddy.fullscreen')"
              @click="togglePanelFullscreen"
            >
              <ElIcon>
                <SemiSelect v-if="isPanelFullscreen" />
                <FullScreen v-else />
              </ElIcon>
            </button>
            <button
              type="button"
              class="buddy-widget__icon-button"
              :title="t('common.close')"
              :aria-label="t('common.close')"
              @click="closePanel"
            >
              <ElIcon><Close /></ElIcon>
            </button>
          </div>
          <div class="buddy-widget__runtime-controls">
            <div class="buddy-widget__model" :title="buddyModelLabel">
              <span class="buddy-widget__control-label">{{ t("buddy.modelLabel") }}</span>
              <ElSelect
                v-model="buddyModelRef"
                class="buddy-widget__model-select toograph-select"
                popper-class="toograph-select-popper buddy-widget__select-popper"
                size="small"
                filterable
                :placeholder="buddyModelPlaceholder"
                :aria-label="t('buddy.modelLabel')"
                :title="buddyModelLabel"
                :disabled="buddyModelOptions.length === 0"
                @visible-change="handleBuddyModelSelectVisibleChange"
              >
                <ElOption
                  v-for="option in buddyModelOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
            </div>
            <div class="buddy-widget__mode" :title="buddyModeLabel">
              <span class="buddy-widget__control-label">{{ t("buddy.modeLabel") }}</span>
              <ElSelect
                v-model="buddyMode"
                class="buddy-widget__mode-select toograph-select"
                popper-class="toograph-select-popper buddy-widget__select-popper"
                size="small"
                :aria-label="t('buddy.modeLabel')"
                :title="buddyModeLabel"
              >
                <ElOption
                  v-for="option in BUDDY_MODE_OPTIONS"
                  :key="option.value"
                  :label="t(option.labelKey)"
                  :value="option.value"
                  :disabled="option.disabled"
                >
                  <span class="buddy-widget__mode-option">
                    <span>{{ t(option.labelKey) }}</span>
                    <small>{{ t(option.descriptionKey) }}</small>
                  </span>
                </ElOption>
              </ElSelect>
            </div>
          </div>
        </header>

        <div ref="messageListElement" class="buddy-widget__messages">
          <p v-if="messages.length === 0" class="buddy-widget__empty">
            {{ t("buddy.empty") }}
          </p>
          <template v-for="(message, messageIndex) in messages" :key="message.id">
            <article
              v-if="shouldRenderMessage(message)"
              class="buddy-widget__message"
              :class="[
                `buddy-widget__message--${message.role}`,
                { 'buddy-widget__message--grouped': !shouldShowMessageRoleLabel(messageIndex) },
              ]"
            >
              <span v-if="shouldShowMessageRoleLabel(messageIndex)" class="buddy-widget__message-label">
                {{ message.role === "user" ? t("buddy.user") : t("buddy.name") }}
              </span>
              <BuddyRunTrace
                v-if="message.role === 'assistant' && message.outputTrace"
                :segment="message.outputTrace"
                :expanded="isTraceMessageExpanded(message.id)"
                :summary="resolveTraceSegmentSummary(message.outputTrace)"
                :duration-label="formatTraceSegmentDurationForMessage(message.id, message.outputTrace)"
                :rows="buildTraceTreeRows(message.outputTrace, message.runId)"
                :loading="isTraceRunTreeLoading(message.runId)"
                :loading-label="t('common.loading')"
                :error-label="traceRunTreeError(message.runId) ? t('common.failedToLoad', { error: traceRunTreeError(message.runId) }) : ''"
                :collapse-label="t('buddy.runTraceCollapse')"
                :expand-label="t('buddy.runTraceExpand')"
                :open-evidence-label="t('buddy.openEvidenceRun')"
                :restore-revision-label="t('graphLibrary.restoreRevisionAction')"
                :open-playback-label="t('buddy.attachRun')"
                :total-label="t('buddy.runTraceLabel')"
                :total-duration-label="formatTraceSegmentDurationForMessage(message.id, message.outputTrace)"
                :restoring-row-id="restoringTraceGraphRevisionRowId"
                :can-open-playback="Boolean(message.runId)"
                :format-row-duration="(row) => formatTraceTreeRowDurationForMessage(message.id, row)"
                @toggle="toggleTraceMessage(message.id, message.runId)"
                @open-playback="(row) => openTraceTreeRowPlayback(message.runId, row)"
                @open-evidence-run="openTraceEvidenceRun"
                @restore-revision="restoreTraceGraphRevision"
              />
              <section
                v-if="message.role === 'assistant' && message.publicOutput?.kind === 'card'"
                class="buddy-widget__public-output-card"
                :class="`buddy-widget__public-output-card--${message.publicOutput.status}`"
              >
                <header class="buddy-widget__public-output-card-header">
                  <strong>{{ message.publicOutput.stateName }}</strong>
                  <span>{{ t("buddy.outputCard") }}</span>
                </header>
                <pre>{{ formatPublicOutputCardContent(message.content) }}</pre>
              </section>
              <SandboxedHtmlFrame
                v-else-if="message.role === 'assistant' && message.content && resolveBuddyRenderedContent(message).kind === 'html'"
                class="buddy-widget__message-html-frame"
                :source="resolveBuddyRenderedContent(message).html"
                title="Buddy HTML reply"
              />
              <div
                v-else-if="message.role === 'assistant' && message.content"
                class="buddy-widget__message-bubble buddy-widget__message-markdown"
                v-html="renderBuddyMarkdown(message.content)"
              />
              <p v-else-if="message.role === 'user'" class="buddy-widget__message-bubble">
                {{ message.content }}
              </p>
            </article>
          </template>
          <p v-if="errorMessage" class="buddy-widget__error">{{ errorMessage }}</p>
          <p v-if="queuedTurns.length > 0" class="buddy-widget__queue">
            {{ t("buddy.queueStatus", { count: queuedTurns.length }) }}
          </p>
        </div>

        <BuddyComposer
          v-model="draft"
          :placeholder="t('buddy.placeholder')"
          :send-label="t('buddy.send')"
          @submit="sendMessage"
        />
      </section>

      <button
        v-if="bubblePreviewLabel && !isPanelOpen"
        type="button"
        class="buddy-widget__bubble"
        :title="bubbleText"
        :aria-label="t('buddy.open')"
        @click="openBubblePreviewPanel"
      >
        {{ bubblePreviewLabel }}
      </button>

      <button
        ref="avatarElement"
        type="button"
        class="buddy-widget__avatar"
        :class="{
          'buddy-widget__avatar--roaming': mascotMotion === 'roam',
          'buddy-widget__avatar--hopping': mascotMotion === 'hop',
          'buddy-widget__avatar--hop-cycle-a': avatarHopCycle % 2 === 0,
          'buddy-widget__avatar--hop-cycle-b': avatarHopCycle % 2 === 1,
        }"
        :style="avatarStyle"
        :title="t('buddy.dragHint')"
        :aria-label="t('buddy.open')"
        @pointerdown="handlePointerDown"
        @click="handleAvatarClick"
        @dblclick.stop="handleAvatarDoubleClick"
      >
        <BuddyMascot
          :mood="mood"
          :motion="mascotMotion"
          :facing="mascotFacing"
          :dragging="isMascotDragging"
          :tap-nonce="tapNonce"
          :tail-switch-nonce="tailSwitchNonce"
          :look-x="mascotLook.x"
          :look-y="mascotLook.y"
          :look-range-x="buddyMascotMotionConfig.mascotLookRangeX"
          :look-range-y="buddyMascotMotionConfig.mascotLookRangeY"
          :virtual-cursor="virtualCursorEnabled && !virtualCursorDetached"
          :hide-sparkle="isVirtualCursorRendered"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close, FullScreen, Plus, SemiSelect } from "@element-plus/icons-vue";
import { ElIcon, ElOption, ElSelect } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import {
  appendBuddyChatMessage,
  fetchBuddyRunTemplateBinding,
} from "../api/buddy.ts";
import { fetchTemplate, fetchTemplates, runGraph } from "../api/graphs.ts";
import { fetchRun, resumeRun } from "../api/runs.ts";
import SandboxedHtmlFrame from "../components/SandboxedHtmlFrame.vue";
import { shouldPollRunStatus } from "../lib/run-event-stream.ts";
import type { GraphEditPlaybackStep } from "../editor/workspace/graphEditPlaybackModel.ts";
import { useBuddyContextStore } from "../stores/buddyContext.ts";
import {
  useBuddyMascotDebugStore,
  type BuddyVirtualOperation,
  type BuddyVirtualOperationRequest,
  type BuddyVirtualOperationTriggeredRun,
} from "../stores/buddyMascotDebug.ts";
import { buildBuddyBubblePreviewLabel } from "./buddyBubblePreviewModel.ts";
import type { GraphPayload, TemplateRecord } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

import BuddyMascot from "./BuddyMascot.vue";
import BuddyComposer from "./BuddyComposer.vue";
import BuddyRunTrace from "./BuddyRunTrace.vue";
import BuddySessionHistory from "./BuddySessionHistory.vue";
import BuddyVirtualOperationBanner from "./BuddyVirtualOperationBanner.vue";
import { useBuddyAutonomousReviewRun } from "./useBuddyAutonomousReviewRun.ts";
import { useBuddyChatSessions } from "./useBuddyChatSessions.ts";
import { useBuddyMessages, type BuddyMessage, type BuddyQueuedTurn } from "./useBuddyMessages.ts";
import { useBuddyModelSelection } from "./useBuddyModelSelection.ts";
import { useBuddyPageOperationContext } from "./useBuddyPageOperationContext.ts";
import { useBuddyRunDisplayMessages } from "./useBuddyRunDisplayMessages.ts";
import { useBuddyRunEventStream } from "./useBuddyRunEventStream.ts";
import { useBuddyRunTraceDisplay } from "./useBuddyRunTraceDisplay.ts";
import type { BuddyMascotDebugAction } from "./buddyMascotDebug.ts";
import {
  BUDDY_GRAPH_EDIT_PLAYBACK_VIEWPORT_SETTLE_MS,
  BUDDY_GRAPH_EDIT_PLAYBACK_VISIBLE_MARGIN_PX,
  createGraphEditPlaybackUiState,
  dispatchGraphEditPlaybackApplyCommand,
  requestGraphEditPlaybackEnsureVisible,
  requestGraphEditPlaybackPlan,
  requestGraphEditPlaybackSave,
  resolveAliasedGraphEditPlaybackStep,
  resolveAliasedGraphEditPlaybackTarget,
  setGraphEditPlaybackRunning,
  type GraphEditPlaybackUiState,
} from "./buddyGraphEditPlaybackBridge.ts";
import {
  resolveGraphEditPlaybackStepElementWithRetry,
  shouldSkipGraphEditPlaybackConnectionStep,
} from "./buddyGraphEditPlaybackTargets.ts";
import {
  buildVirtualDragPoints,
  isGraphEditPlaybackDragStep,
  listGraphEditPlaybackNodeAffordanceIds,
  listGraphEditPlaybackPortStateKeys,
  normalizeVirtualText,
  resolveGraphEditPlaybackAnchorNodeId,
  resolveGraphEditPlaybackPositionClientPoint,
  resolveGraphEditPlaybackStepDelayMs,
  shouldForceGraphEditPlaybackEmptyCanvasDrop,
} from "./buddyGraphEditPlaybackUi.ts";
import {
  hasVirtualOperationAffordanceElement,
  resolveVirtualOperationAffordance,
  resolveVirtualOperationTextInput,
} from "./buddyVirtualOperationTargets.ts";
import {
  dispatchVirtualClick,
  dispatchVirtualDoubleClick,
  dispatchVirtualInputEvents,
  dispatchVirtualPointerEvent,
  dispatchVirtualPointerTap,
} from "./buddyVirtualPointerEvents.ts";
import {
  normalizeTemplateRunMatchText,
  resolveTemplateRunInputTextInput,
  resolveTemplateRunTargetAffordance,
  routeMatchesVirtualOperationTargetPath,
} from "./buddyVirtualTemplateRunTargets.ts";
import {
  buildGraphEditPlaybackAuditSummary,
  type GraphEditPlaybackAuditApplyResult,
  type GraphEditPlaybackAuditSummary,
} from "./graphEditPlaybackAudit.ts";
import {
  BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS,
  BUDDY_VIRTUAL_CURSOR_MAX_ROTATE_TRANSITION_MS,
  BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG,
  BUDDY_VIRTUAL_CURSOR_SIZE,
  clampVirtualCursorFramePosition,
  interpolateBuddyPosition,
  resolveBoxCenter,
  resolveContinuousVirtualCursorAngle,
  resolveDefaultVirtualCursorPosition,
  resolveElementCenterPoint,
  resolveSmoothedVirtualCursorAngle,
  resolveVirtualCursorFlightAngle,
  resolveVirtualCursorFollowTargetDistancePx,
  resolveVirtualCursorLaunchPosition,
  resolveVirtualCursorMoveDurationMs,
  resolveVirtualCursorPositionForClientPoint,
  resolveVirtualCursorRotateDurationMs,
  resolveVirtualCursorVectorAngle,
} from "./buddyVirtualCursorGeometry.ts";
import { attachPageOperationRuntimeContext } from "./pageOperationAffordances.ts";
import {
  buildPageOperationArtifactRefs,
  buildPageOperationResult,
  buildPageOperationResumePayload,
  buildPageOperationTargetRunValidation,
  canAutoResumePageOperationRun,
  findAutoResumablePageOperationRequestId,
  type PageOperationResult,
  type PageOperationResultStatus,
  type PageOperationRetryRecord,
} from "./pageOperationResume.ts";
import { resolveBuddyVirtualOperationPlanFromActivityEvent } from "./virtualOperationProtocol.ts";
import type { BuddyVirtualOperationPlan } from "./virtualOperationProtocol.ts";
import {
  resolveBuddyVirtualOperationUserAction,
  shouldHandleVirtualCursorPointerDown,
} from "./buddyVirtualOperationInteractionPolicy.ts";
import { useBuddyVirtualOperationLifecycle, type BuddyVirtualOperationToken } from "./useBuddyVirtualOperationLifecycle.ts";
import {
  resolveBuddyComposerDecision,
  shouldHoldBuddyQueueDrain,
} from "./buddyPauseQueuePolicy.ts";
import {
  BUDDY_MODE_OPTIONS,
  DEFAULT_BUDDY_MODE,
  buildBuddyChatGraph,
  resolveBuddyMode,
  type BuddyMode,
} from "./buddyChatGraph.ts";
import {
  buildBuddyPublicOutputBindings,
} from "./buddyPublicOutput.ts";
import {
  buildBuddyOutputTracePlan,
  buildBuddyOutputTraceStateFromRunDetail,
} from "./buddyOutputTrace.ts";
import { buildBuddyTemplateRunGraph } from "./buddyTemplateRunGraph.ts";
import {
  BUDDY_POSITION_STORAGE_KEY,
  DEFAULT_BUDDY_MARGIN,
  DEFAULT_BUDDY_SIZE,
  clampBuddyPosition,
  parseStoredBuddyPosition,
  resolveDefaultBuddyPosition,
  serializeBuddyPosition,
  type BuddyPosition,
} from "./buddyPosition.ts";

type BuddyPauseHandlingOptions = {
  persist?: boolean;
};

type BuddyMood = "idle" | "thinking" | "speaking" | "error";
type BuddyMascotMotion = "idle" | "roam" | "hop";
type BuddyMascotFacing = "front" | "left" | "right";
type VirtualCursorPhase = "hidden" | "launching" | "active" | "returning";
type BuddyIdleAnimationAction = "tail-switch" | "random-move" | "virtual-cursor-orbit" | "virtual-cursor-chase";
type BuddyIdleRunOptions = { force?: boolean };
type VirtualCursorIdleActionMode = "none" | "orbit" | "chase";
type BuddyVirtualOperationCommandResult = {
  status: PageOperationResultStatus;
  graphEditSummary: Record<string, unknown> | null;
  retryChain: PageOperationRetryRecord[];
};
type BuddyBackgroundTemplateRunExecution = {
  triggeredRun: BuddyVirtualOperationTriggeredRun;
  graph: GraphPayload;
};
type BuddyAutoResumedPageOperationFinishOptions = {
  runId: string;
  assistantMessageId: string;
  sessionId: string;
};
type BuddyFinishVisibleRunOptions = {
  includeOutputTrace?: boolean;
};

const DRAG_THRESHOLD_PX = 4;
const AVATAR_SINGLE_CLICK_DELAY_MS = 220;
const RUN_POLL_INTERVAL_MS = 700;
const BUDDY_IDLE_ANIMATION_MIN_DELAY_MS = 5000;
const BUDDY_IDLE_ANIMATION_MAX_DELAY_MS = 10000;
const BUDDY_IDLE_ANIMATION_ACTIONS: BuddyIdleAnimationAction[] = ["tail-switch", "random-move", "virtual-cursor-orbit", "virtual-cursor-chase"];
const BUDDY_IDLE_TAIL_SWITCH_DURATION_MS = 1000;
const BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_LAP_DURATION_MS = 1200;
const BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_RADIUS_PX = DEFAULT_BUDDY_SIZE.width * 0.68;
const BUDDY_ROAM_STEP_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width;
const BUDDY_ROAM_TARGET_MIN_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width;
const BUDDY_ROAM_TARGET_MAX_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width * 3;
const BUDDY_ROAM_TARGET_REACHED_DISTANCE_PX = 1;
const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_PERIOD_MS = 1600;
const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX = BUDDY_VIRTUAL_CURSOR_SIZE.width * 0.86;
const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX = BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX * 0.62;
const BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG = 0;
const BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS = 360;
const BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS = 80;
const BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS = 180;
const BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS = 120;
const BUDDY_VIRTUAL_CURSOR_FLIGHT_SETTLE_MS = 80;
const BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE = 0.72;
const BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE = 1;
const BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_REACHED_DISTANCE_PX = 12;
const BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS = 80;
const BUDDY_VIRTUAL_OPERATION_TYPE_CHARACTER_DELAY_MS = 18;
const BUDDY_VIRTUAL_OPERATION_TRIGGERED_RUN_WAIT_MS = 4000;
const BUDDY_VIRTUAL_OPERATION_TRIGGERED_RUN_POLL_MS = 80;
const BUDDY_VIRTUAL_OPERATION_TARGET_WAIT_MS = 4000;
const BUDDY_VIRTUAL_OPERATION_TARGET_RETRY_MS = 80;
const BUDDY_VIRTUAL_TEMPLATE_SEARCH_SETTLE_MS = 180;
const BUDDY_PAGE_OPERATION_TRIGGERED_RUN_MAX_WAIT_MS = 120000;
const VIRTUAL_CURSOR_STAR_PATH =
  "M0-72 C5-46 18-33 44-28 C18-23 5-10 0 16 C-5-10 -18-23 -44-28 C-18-33 -5-46 0-72Z";
const VIRTUAL_CURSOR_SHAPE_PATH =
  "M0-72 C14-35 33 5 52 34 C27 35 13 46 0 64 C-13 46 -27 35 -52 34 C-33 5 -14-35 0-72Z";
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const buddyContextStore = useBuddyContextStore();
const buddyMascotDebugStore = useBuddyMascotDebugStore();
const {
  latestRequest: mascotDebugRequest,
  latestVirtualOperationRequest,
  motionConfig: buddyMascotMotionConfig,
  virtualCursorEnabled,
} = storeToRefs(buddyMascotDebugStore);

const viewport = ref(resolveViewport());
const position = ref(resolveDefaultBuddyPosition(viewport.value));
const virtualCursorPosition = ref(resolveDefaultVirtualCursorPosition(viewport.value, position.value));
const virtualCursorPhase = ref<VirtualCursorPhase>("hidden");
const virtualCursorPath = ref(VIRTUAL_CURSOR_STAR_PATH);
const virtualCursorMorphAnimation = ref<{ key: number; values: string; durationMs: number } | null>(null);
const virtualCursorAngleDeg = ref(BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG);
const virtualCursorScale = ref(BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE);
const virtualCursorMoveDurationMs = ref(BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS);
const virtualCursorRotateDurationMs = ref(BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS);
const virtualCursorDetached = ref(false);
const virtualCursorDragging = ref(false);
const virtualCursorIdleActionMode = ref<VirtualCursorIdleActionMode>("none");
const {
  activeVirtualOperationToken,
  beginBackgroundVirtualOperation: beginBackgroundVirtualOperationLifecycle,
  beginVirtualOperation: beginVirtualOperationLifecycle,
  buildVirtualOperationRetryRecord,
  finishVirtualOperation,
  interruptVirtualOperation: interruptVirtualOperationLifecycle,
  isVirtualOperationInterrupted,
  isVirtualOperationRunning,
  recordVirtualOperationRetry,
  virtualOperationStatus,
  waitForVirtualOperation,
} = useBuddyVirtualOperationLifecycle();
const isPanelOpen = ref(false);
const draft = ref("");
const avatarHopCycle = ref(0);
const buddyMode = ref<BuddyMode>(DEFAULT_BUDDY_MODE);
const {
  messages,
  messageListElement,
  renderBuddyMarkdown,
  resolveBuddyRenderedContent,
  updateAssistantMessage,
  setAssistantActivityText,
  setAssistantActivityFromRunEvent,
  buildHistoryBeforeMessage,
  ensureAssistantMessageForTurn,
  scrollMessagesToBottom,
  createMessage,
  messageRecordToBuddyMessage,
  buildBuddyMessageMetadata,
  allocateBuddyMessageClientOrder,
  resetNextBuddyMessageClientOrder,
} = useBuddyMessages({ t });
const isPanelFullscreen = ref(false);
const queuedTurns = ref<BuddyQueuedTurn[]>([]);
const errorMessage = ref("");
const mood = ref<BuddyMood>("idle");
const tapNonce = ref(0);
const tailSwitchNonce = ref(0);
const activeRunId = ref<string | null>(null);
const {
  buildPageOperationRuntimeContext,
  buildTriggeredForegroundRunFact,
} = useBuddyPageOperationContext({
  routePath: computed(() => route.fullPath),
  activeRunId,
  getEditorSnapshot: () => buddyContextStore.editorSnapshot,
});
const pausedBuddyRun = ref<RunDetail | null>(null);
const pausedBuddyAssistantMessageId = ref<string | null>(null);
const pausedBuddyResumeBusy = ref(false);
const avatarElement = ref<HTMLElement | null>(null);
const virtualCursorAnimateElement = ref<SVGAnimationElement | null>(null);
const mascotLook = ref({ x: 0, y: 0 });
const mascotMotion = ref<BuddyMascotMotion>("idle");
const mascotFacing = ref<BuddyMascotFacing>("front");
const mascotMoveDurationMs = ref(buddyMascotMotionConfig.value.moveDurationMs);
const debugDragging = ref(false);
const pointerDrag = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: BuddyPosition;
  moved: boolean;
} | null>(null);

let virtualCursorDrag: {
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: BuddyPosition;
} | null = null;
let suppressNextClick = false;
let activeAbortController: AbortController | null = null;
let isDrainingBuddyQueue = false;
let avatarSingleClickTimerId: number | null = null;
let speakingIdleTimerId: number | null = null;
let mascotLookFrameId: number | null = null;
let buddyRoamTimerId: number | null = null;
let buddyRoamMotionTimerId: number | null = null;
let buddyRoamStepTimerId: number | null = null;
let buddyRoamTargetPosition: BuddyPosition | null = null;
let buddyRoamSequenceId = 0;
let buddyVirtualCursorFollowMotionTimerId: number | null = null;
let buddyVirtualCursorFollowStepTimerId: number | null = null;
let buddyVirtualCursorFollowTargetPosition: BuddyPosition | null = null;
let buddyVirtualCursorFollowSequenceId = 0;
let buddyVirtualCursorIdleFrameId: number | null = null;
let virtualCursorTransitionTimerId: number | null = null;
let virtualCursorTransitionFrameId: number | null = null;
let virtualCursorFlightFrameId: number | null = null;
let virtualCursorFlightTrackingFrameId: number | null = null;
let virtualCursorFlightTracking: { fromPosition: BuddyPosition; toPosition: BuddyPosition; startedAtMs: number; durationMs: number } | null = null;
let virtualCursorTrackingPosition: BuddyPosition | null = null;
let virtualCursorAngleFrameTimestampMs: number | null = null;
let virtualCursorMorphAnimationKey = 0;
let virtualCursorPickupPending = false;
let buddyDebugActionTimerId: number | null = null;
let pendingMascotLookPointer: { x: number; y: number } | null = null;

const isDragging = computed(() => Boolean(pointerDrag.value?.moved));
const isMascotDragging = computed(() => isDragging.value || debugDragging.value);
const shouldBuddyFollowVirtualCursor = computed(() => virtualCursorEnabled.value && virtualCursorIdleActionMode.value !== "orbit");
const canBuddyRoam = computed(() =>
  !isPanelOpen.value &&
  !virtualCursorEnabled.value &&
  virtualCursorIdleActionMode.value === "none" &&
  virtualCursorPhase.value === "hidden" &&
  mood.value === "idle" &&
  !isMascotDragging.value &&
  queuedTurns.value.length === 0 &&
  activeRunId.value === null,
);
const {
  chatSessions,
  activeSessionId,
  currentSessionId,
  isSessionPanelOpen,
  isSessionLoading,
  activeSessionDeleteId,
  isSessionSwitchLocked,
  canCreateNewSession,
  startChatSessionInitialization,
  loadChatSessions,
  ensureActiveChatSession,
  createNewSession,
  selectChatSession,
  toggleSessionPanel,
  clearSessionDeleteConfirmTimeout,
  clearSessionDeleteConfirmState,
  handleSessionDeleteActionClick,
  waitForChatSessionInitialization,
} = useBuddyChatSessions({
  messages,
  queuedTurns,
  activeRunId,
  errorMessage,
  t,
  messageRecordToBuddyMessage,
  resetNextBuddyMessageClientOrder,
  resetVisibleBuddyRunState,
  scrollMessagesToBottom,
  formatErrorMessage,
});
const buddyModeLabel = computed(() => {
  const option = BUDDY_MODE_OPTIONS.find((candidate) => candidate.value === buddyMode.value);
  return option ? `${t(option.labelKey)} - ${t(option.descriptionKey)}` : t("buddy.modes.askFirst");
});
const {
  buddyModelRef,
  buddyModelOptions,
  buddyModelLabel,
  buddyModelPlaceholder,
  hydrateBuddyModel,
  loadBuddyModelOptions,
  handleBuddyModelSelectVisibleChange,
} = useBuddyModelSelection({ t });
const anchorStyle = computed(() => ({
  "--buddy-widget-roam-duration-ms": `${mascotMoveDurationMs.value}ms`,
  "--buddy-widget-hop-duration-ms": `${mascotMoveDurationMs.value}ms`,
  transform: isPanelFullscreen.value ? "none" : `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
}));
const virtualCursorStyle = computed(() => ({
  "--buddy-widget-virtual-cursor-morph-duration-ms": `${BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS}ms`,
  "--buddy-widget-virtual-cursor-move-duration-ms": `${virtualCursorMoveDurationMs.value}ms`,
  "--buddy-widget-virtual-cursor-rotate-duration-ms": `${virtualCursorRotateDurationMs.value}ms`,
  "--buddy-widget-virtual-cursor-angle": `${virtualCursorAngleDeg.value}deg`,
  "--buddy-widget-virtual-cursor-scale": virtualCursorScale.value,
  translate: `${virtualCursorPosition.value.x}px ${virtualCursorPosition.value.y}px`,
  rotate: "var(--buddy-widget-virtual-cursor-angle)",
}));
const isVirtualCursorRendered = computed(() => virtualCursorPhase.value !== "hidden");
const shouldFloatVirtualCursor = computed(() =>
  virtualCursorPhase.value === "active" && !virtualCursorDragging.value && virtualCursorIdleActionMode.value === "none",
);
const avatarStyle = computed(() => {
  if (!isPanelFullscreen.value) {
    return {};
  }
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  };
});
const panelPlacement = computed(() => (position.value.x > viewport.value.width / 2 ? "left" : "right"));
const latestActivityText = computed(() => {
  const latestPendingMessage = [...messages.value]
    .reverse()
    .find((message) => message.role === "assistant" && !message.content.trim() && message.activityText?.trim());
  return latestPendingMessage?.activityText?.trim() ?? "";
});
const latestBuddyMessageForBubble = computed(() =>
  [...messages.value].reverse().find((message) => message.role === "assistant" && message.content.trim()) ?? null,
);
const bubbleText = computed(() => {
  if (mood.value === "thinking" && latestActivityText.value) {
    return latestActivityText.value;
  }
  if (mood.value === "thinking") {
    return t("buddy.thinking");
  }
  if (mood.value === "error") {
    return t("buddy.errorBubble");
  }
  return latestBuddyMessageForBubble.value?.content.trim() || t("buddy.readyBubble");
});
const bubblePreviewLabel = computed(() => buildBuddyBubblePreviewLabel(bubbleText.value));

onMounted(() => {
  hydratePosition();
  void startChatSessionInitialization();
  hydrateBuddyModel();
  void loadBuddyModelOptions();
  window.addEventListener("resize", handleResize);
  window.addEventListener("pointermove", handleMascotLookPointerMove, { passive: true });
  scheduleBuddyRoam();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("pointermove", handleMascotLookPointerMove);
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
  clearVirtualCursorDrag();
  queuedTurns.value = [];
  clearSessionDeleteConfirmTimeout();
  clearAvatarSingleClickTimer();
  clearSpeakingIdleTimer();
  clearBuddyDebugActionTimer();
  cancelBuddyRoamTimers();
  cancelBuddyVirtualCursorFollowTimers();
  cancelBuddyVirtualCursorIdleFrame();
  clearVirtualCursorTransition();
  cancelMascotLookFrame();
  closeEventSource();
  activeAbortController?.abort();
  abortBackgroundReviewRuns();
});

watch(buddyMode, (nextMode) => {
  const safeMode = resolveBuddyMode(nextMode);
  if (safeMode !== nextMode) {
    buddyMode.value = safeMode;
  }
});

watch(canBuddyRoam, (canRoam) => {
  if (canRoam) {
    scheduleBuddyRoam();
    return;
  }
  if (virtualCursorIdleActionMode.value !== "none") {
    return;
  }
  cancelBuddyRoamTimers();
});

watch(virtualCursorEnabled, (enabled) => {
  if (enabled) {
    activateVirtualCursor();
    return;
  }
  deactivateVirtualCursor();
});

watch(mascotDebugRequest, (request) => {
  if (!request) {
    return;
  }
  triggerMascotDebugAction(request.action);
});

watch(latestVirtualOperationRequest, (request) => {
  void executeVirtualOperationRequest(request);
});

function handleAvatarClick() {
  const action = resolveBuddyVirtualOperationUserAction({
    isOperationRunning: isVirtualOperationRunning.value,
    source: "avatar_click",
  });
  if (!action.allowDefaultAction) {
    return;
  }
  stopBuddyIdleAnimation({ closeVirtualCursor: true });
  if (mood.value === "error") {
    mood.value = "idle";
    mascotMotion.value = "idle";
    mascotFacing.value = "front";
  }
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  clearAvatarSingleClickTimer();
  avatarSingleClickTimerId = window.setTimeout(() => {
    avatarSingleClickTimerId = null;
    performAvatarSingleClick();
  }, AVATAR_SINGLE_CLICK_DELAY_MS);
}

function stopBuddyIdleAnimation(options: { closeVirtualCursor?: boolean } = {}) {
  cancelBuddyRoamTimers();
  cancelBuddyVirtualCursorFollowTimers();
  clearBuddyDebugActionTimer();
  virtualCursorIdleActionMode.value = "none";
  virtualCursorPickupPending = false;
  if (options.closeVirtualCursor) {
    const wasVirtualCursorEnabled = virtualCursorEnabled.value;
    buddyMascotDebugStore.setVirtualCursorEnabled(false);
    if (!wasVirtualCursorEnabled && virtualCursorPhase.value !== "hidden") {
      startVirtualCursorReturn();
    }
  }
}

function handleAvatarDoubleClick() {
  clearAvatarSingleClickTimer();
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  tapNonce.value += 1;
  isPanelOpen.value = true;
  isPanelFullscreen.value = true;
  isSessionPanelOpen.value = false;
  clearSessionDeleteConfirmState();
  void scrollMessagesToBottom();
}

function performAvatarSingleClick() {
  tapNonce.value += 1;
  isPanelOpen.value = !isPanelOpen.value;
  if (!isPanelOpen.value) {
    isSessionPanelOpen.value = false;
    isPanelFullscreen.value = false;
  }
  if (isPanelOpen.value) {
    void scrollMessagesToBottom();
  }
}

function closePanel() {
  isPanelOpen.value = false;
  isSessionPanelOpen.value = false;
  isPanelFullscreen.value = false;
  clearSessionDeleteConfirmState();
}

function openBubblePreviewPanel() {
  tapNonce.value += 1;
  isPanelOpen.value = true;
  isSessionPanelOpen.value = false;
  clearSessionDeleteConfirmState();
  void scrollMessagesToBottom();
}

function togglePanelFullscreen() {
  isPanelFullscreen.value = !isPanelFullscreen.value;
  isSessionPanelOpen.value = false;
  clearSessionDeleteConfirmState();
}

function handlePointerDown(event: PointerEvent) {
  cancelBuddyRoamTimers();
  clearBuddyDebugActionTimer();
  pointerDrag.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startPosition: { ...position.value },
    moved: false,
  };
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
}

function handlePointerMove(event: PointerEvent) {
  const drag = pointerDrag.value;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  if (Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD_PX) {
    drag.moved = true;
  }
  position.value = clampBuddyPosition(
    {
      x: drag.startPosition.x + deltaX,
      y: drag.startPosition.y + deltaY,
    },
    viewport.value,
    DEFAULT_BUDDY_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
  if (virtualCursorEnabled.value) {
    updateMascotLookFromVirtualCursor();
  }
}

function handlePointerUp(event: PointerEvent) {
  const drag = pointerDrag.value;
  if (drag?.pointerId === event.pointerId) {
    suppressNextClick = drag.moved;
    persistPosition();
  }
  pointerDrag.value = null;
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
}

function activateVirtualCursor() {
  if (virtualCursorIdleActionMode.value === "none") {
    cancelBuddyRoamTimers();
    clearBuddyDebugActionTimer();
  }
  cancelMascotLookFrame();
  pendingMascotLookPointer = null;
  virtualCursorDragging.value = false;
  startVirtualCursorLaunch();
  updateMascotLookFromVirtualCursor();
}

function deactivateVirtualCursor() {
  virtualCursorPickupPending = false;
  clearVirtualCursorDrag();
  cancelBuddyVirtualCursorFollowTimers();
  startVirtualCursorReturn();
}

function handleVirtualCursorPointerDown(event: PointerEvent) {
  if (
    !shouldHandleVirtualCursorPointerDown({
      isOperationRunning: isVirtualOperationRunning.value,
      phase: virtualCursorPhase.value,
    })
  ) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  cancelBuddyRoamTimers();
  clearBuddyDebugActionTimer();
  clearVirtualCursorDrag();
  virtualCursorDetached.value = true;
  virtualCursorDragging.value = true;
  virtualCursorDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startPosition: { ...virtualCursorPosition.value },
  };
  window.addEventListener("pointermove", handleVirtualCursorPointerMove);
  window.addEventListener("pointerup", handleVirtualCursorPointerUp);
}

function handleVirtualCursorPointerMove(event: PointerEvent) {
  if (!virtualCursorDrag || virtualCursorDrag.pointerId !== event.pointerId) {
    return;
  }
  event.preventDefault();
  const deltaX = event.clientX - virtualCursorDrag.startX;
  const deltaY = event.clientY - virtualCursorDrag.startY;
  moveVirtualCursorTo(
    clampBuddyPosition(
      {
        x: virtualCursorDrag.startPosition.x + deltaX,
        y: virtualCursorDrag.startPosition.y + deltaY,
      },
      viewport.value,
      BUDDY_VIRTUAL_CURSOR_SIZE,
      DEFAULT_BUDDY_MARGIN,
    ),
    { durationMs: 0, rotateDurationMs: 0 },
  );
  updateMascotLookFromVirtualCursor();
  requestBuddyFollowVirtualCursor();
}

function handleVirtualCursorPointerUp(event: PointerEvent) {
  if (!virtualCursorDrag || virtualCursorDrag.pointerId !== event.pointerId) {
    return;
  }
  event.preventDefault();
  requestBuddyFollowVirtualCursor();
  settleVirtualCursorRotation();
  clearVirtualCursorDrag();
}

function clearVirtualCursorDrag() {
  virtualCursorDrag = null;
  virtualCursorDragging.value = false;
  window.removeEventListener("pointermove", handleVirtualCursorPointerMove);
  window.removeEventListener("pointerup", handleVirtualCursorPointerUp);
}

function handleMascotLookPointerMove(event: PointerEvent) {
  if (virtualCursorEnabled.value) {
    return;
  }
  pendingMascotLookPointer = { x: event.clientX, y: event.clientY };
  if (mascotLookFrameId !== null) {
    return;
  }
  mascotLookFrameId = window.requestAnimationFrame(() => {
    mascotLookFrameId = null;
    updateMascotLookFromPointer();
  });
}

function updateMascotLookFromPointer() {
  const pointer = pendingMascotLookPointer;
  const element = avatarElement.value;
  if (!pointer || !element) {
    return;
  }

  const bounds = element.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const deltaX = pointer.x - centerX;
  const deltaY = pointer.y - centerY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 1) {
    mascotLook.value = { x: 0, y: 0 };
    return;
  }
  mascotLook.value = { x: deltaX / distance, y: deltaY / distance };
}

function updateMascotLookFromVirtualCursor() {
  const buddyCenter = resolveBoxCenter(position.value, DEFAULT_BUDDY_SIZE);
  const cursorCenter = resolveBoxCenter(resolveCurrentVirtualCursorTrackingPosition(), BUDDY_VIRTUAL_CURSOR_SIZE);
  const deltaX = cursorCenter.x - buddyCenter.x;
  const deltaY = cursorCenter.y - buddyCenter.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 1) {
    mascotLook.value = { x: 0, y: 0 };
    return;
  }
  mascotLook.value = { x: deltaX / distance, y: deltaY / distance };
}

function cancelMascotLookFrame() {
  if (mascotLookFrameId === null) {
    return;
  }
  window.cancelAnimationFrame(mascotLookFrameId);
  mascotLookFrameId = null;
}

function scheduleBuddyRoam() {
  if (!canBuddyRoam.value || buddyRoamTimerId !== null || buddyRoamTargetPosition !== null || mascotMotion.value !== "idle") {
    return;
  }
  buddyRoamTimerId = window.setTimeout(
    runBuddyIdleAnimation,
    randomBetween(BUDDY_IDLE_ANIMATION_MIN_DELAY_MS, BUDDY_IDLE_ANIMATION_MAX_DELAY_MS),
  );
}

function runBuddyIdleAnimation() {
  buddyRoamTimerId = null;
  if (!canBuddyRoam.value) {
    return;
  }
  buddyRoamSequenceId += 1;
  const action = chooseBuddyIdleAnimationAction();
  switch (action) {
    case "tail-switch":
      runBuddyIdleTailSwitch(buddyRoamSequenceId);
      break;
    case "random-move":
      runBuddyIdleRoam(buddyRoamSequenceId);
      break;
    case "virtual-cursor-orbit":
      runBuddyIdleVirtualCursorOrbit(buddyRoamSequenceId);
      break;
    case "virtual-cursor-chase":
      runBuddyIdleVirtualCursorChase(buddyRoamSequenceId);
      break;
  }
}

function runBuddyIdleTailSwitch(sequenceId: number) {
  tailSwitchNonce.value += 1;
  buddyRoamMotionTimerId = window.setTimeout(() => {
    buddyRoamMotionTimerId = null;
    finishBuddyIdleAnimation(sequenceId);
  }, BUDDY_IDLE_TAIL_SWITCH_DURATION_MS);
}

function finishBuddyIdleAnimation(sequenceId: number) {
  if (sequenceId !== buddyRoamSequenceId) {
    return;
  }
  scheduleBuddyRoam();
}

function runBuddyIdleRoam(sequenceId: number, options: BuddyIdleRunOptions = {}) {
  if (sequenceId !== buddyRoamSequenceId) {
    return;
  }
  buddyRoamTargetPosition = resolveBuddyRoamTargetPosition();
  runBuddyRoamStep(sequenceId, options);
}

function runBuddyRoamStep(sequenceId: number, options: BuddyIdleRunOptions = {}) {
  if (sequenceId !== buddyRoamSequenceId) {
    return;
  }
  const targetPosition = buddyRoamTargetPosition;
  if (!canRunBuddyIdleAnimation(options) || targetPosition === null) {
    finishBuddyRoamSequence(false);
    return;
  }

  const nextPosition = resolveBuddyRoamStepPosition(position.value, targetPosition);
  const motionDurationMs = resolveMascotMoveDurationMs("random");
  mascotMoveDurationMs.value = motionDurationMs;
  restartAvatarHopAnimation();
  mascotFacing.value = resolveBuddyRoamFacing(nextPosition.x - position.value.x);
  mascotMotion.value = "roam";
  position.value = nextPosition;
  buddyRoamMotionTimerId = window.setTimeout(() => {
    if (sequenceId !== buddyRoamSequenceId) {
      return;
    }
    buddyRoamMotionTimerId = null;
    mascotMotion.value = "idle";
    if (!canRunBuddyIdleAnimation(options)) {
      finishBuddyRoamSequence(false);
      return;
    }
    if (isBuddyRoamTargetReached(position.value, targetPosition)) {
      finishBuddyRoamSequence(true);
      return;
    }
    buddyRoamStepTimerId = window.setTimeout(() => {
      buddyRoamStepTimerId = null;
      runBuddyRoamStep(sequenceId, options);
    }, buddyMascotMotionConfig.value.stepPauseMs);
  }, motionDurationMs);
}

function runBuddyIdleVirtualCursorOrbit(sequenceId: number, options: BuddyIdleRunOptions = {}) {
  if (sequenceId !== buddyRoamSequenceId || !canRunBuddyIdleAnimation(options)) {
    return;
  }
  cancelBuddyVirtualCursorIdleFrame();
  virtualCursorIdleActionMode.value = "orbit";
  virtualCursorPickupPending = true;
  buddyMascotDebugStore.setVirtualCursorEnabled(true);
  scheduleVirtualCursorIdleActionStart(sequenceId, () => {
    runBuddyIdleVirtualCursorOrbitFrame(sequenceId, performance.now(), resolveVirtualCursorOrbitAngle(virtualCursorPosition.value));
  });
}

function runBuddyIdleVirtualCursorOrbitFrame(sequenceId: number, startedAtMs: number, startAngle: number) {
  if (sequenceId !== buddyRoamSequenceId || virtualCursorIdleActionMode.value !== "orbit") {
    cancelBuddyVirtualCursorIdleFrame();
    return;
  }
  const elapsedMs = performance.now() - startedAtMs;
  const progress = Math.min(1, elapsedMs / BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_LAP_DURATION_MS);
  const angle = startAngle + progress * Math.PI * 2;
  moveVirtualCursorTo(resolveVirtualCursorOrbitPosition(angle), {
    angleDeg: resolveVirtualCursorOrbitTangentAngle(angle),
    durationMs: 0,
    rotateDurationMs: 0,
  });
  updateMascotLookFromVirtualCursor();
  if (progress >= 1) {
    buddyVirtualCursorIdleFrameId = null;
    setVirtualCursorMoveTransitionDuration(BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS);
    if (Math.random() < 0.5) {
      settleVirtualCursorRotation();
      finishBuddyIdleVirtualCursorAction(sequenceId);
      return;
    }
    runBuddyIdleVirtualCursorOrbitFrame(sequenceId, performance.now(), startAngle);
    return;
  }
  buddyVirtualCursorIdleFrameId = window.requestAnimationFrame(() => runBuddyIdleVirtualCursorOrbitFrame(sequenceId, startedAtMs, startAngle));
}

function runBuddyIdleVirtualCursorChase(sequenceId: number, options: BuddyIdleRunOptions = {}) {
  if (sequenceId !== buddyRoamSequenceId || !canRunBuddyIdleAnimation(options)) {
    return;
  }
  virtualCursorIdleActionMode.value = "chase";
  virtualCursorPickupPending = true;
  buddyMascotDebugStore.setVirtualCursorEnabled(true);
  scheduleVirtualCursorIdleActionStart(sequenceId, () => {
    moveBuddyIdleVirtualCursorChaseTarget(sequenceId);
  });
}

function scheduleVirtualCursorIdleActionStart(sequenceId: number, callback: () => void) {
  const delayMs = virtualCursorPhase.value === "active"
    ? BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS
    : BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS + BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS;
  buddyRoamMotionTimerId = window.setTimeout(() => {
    buddyRoamMotionTimerId = null;
    if (sequenceId !== buddyRoamSequenceId || virtualCursorIdleActionMode.value === "none") {
      return;
    }
    if (virtualCursorPhase.value !== "active") {
      if (virtualCursorEnabled.value && virtualCursorPhase.value === "launching") {
        scheduleVirtualCursorIdleActionStart(sequenceId, callback);
      }
      return;
    }
    callback();
  }, delayMs);
}

function moveBuddyIdleVirtualCursorChaseTarget(sequenceId: number) {
  if (sequenceId !== buddyRoamSequenceId || virtualCursorIdleActionMode.value !== "chase") {
    return;
  }
  cancelBuddyVirtualCursorIdleFrame();
  const targetPosition = resolveRandomVirtualCursorChasePosition();
  const flightDurationMs = resolveVirtualCursorMoveDurationMs(
    virtualCursorPosition.value,
    targetPosition,
    buddyMascotMotionConfig.value.virtualCursorFlightSpeedPxPerS,
  );
  const flightWaitMs = moveVirtualCursorToWithArmedTransition(targetPosition, { durationMs: flightDurationMs });
  buddyRoamMotionTimerId = window.setTimeout(() => {
    buddyRoamMotionTimerId = null;
    if (sequenceId !== buddyRoamSequenceId || virtualCursorIdleActionMode.value !== "chase") {
      return;
    }
    clearVirtualCursorFlightTracking();
    runBuddyIdleVirtualCursorChaseLoop(sequenceId, targetPosition, performance.now());
  }, flightWaitMs);
}

function runBuddyIdleVirtualCursorChaseLoop(sequenceId: number, centerPosition: BuddyPosition, startedAtMs: number) {
  if (sequenceId !== buddyRoamSequenceId || virtualCursorIdleActionMode.value !== "chase") {
    cancelBuddyVirtualCursorIdleFrame();
    return;
  }
  const elapsedMs = performance.now() - startedAtMs;
  const progress = (elapsedMs % BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_PERIOD_MS) / BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_PERIOD_MS;
  const angle = progress * Math.PI * 2;
  moveVirtualCursorTo(
    clampVirtualCursorFramePosition(
      {
        x: centerPosition.x + Math.sin(angle) * BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX,
        y: centerPosition.y + Math.sin(angle * 2) * BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX,
      },
      viewport.value,
    ),
    {
      angleDeg: resolveVirtualCursorChaseLoopTangentAngle(angle),
      durationMs: 0,
      rotateDurationMs: 0,
    },
  );
  updateMascotLookFromVirtualCursor();
  requestBuddyFollowVirtualCursor();
  buddyVirtualCursorIdleFrameId = window.requestAnimationFrame(() => runBuddyIdleVirtualCursorChaseLoop(sequenceId, centerPosition, startedAtMs));
}

function finishBuddyIdleVirtualCursorAction(sequenceId: number) {
  if (sequenceId !== buddyRoamSequenceId) {
    return;
  }
  pickupVirtualCursor({ sequenceId, finishIdleAnimation: true });
}

function pickupVirtualCursor(options: { sequenceId?: number; finishIdleAnimation?: boolean } = {}) {
  const sequenceId = options.sequenceId ?? buddyRoamSequenceId;
  cancelBuddyVirtualCursorIdleFrame();
  virtualCursorIdleActionMode.value = "none";
  virtualCursorPickupPending = false;
  buddyMascotDebugStore.setVirtualCursorEnabled(false);
  if (!options.finishIdleAnimation) {
    return;
  }
  if (buddyRoamMotionTimerId !== null) {
    window.clearTimeout(buddyRoamMotionTimerId);
  }
  buddyRoamMotionTimerId = window.setTimeout(() => {
    buddyRoamMotionTimerId = null;
    finishBuddyIdleAnimation(sequenceId);
  }, BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS + 80);
}

function resolveVirtualCursorOrbitPosition(angle: number): BuddyPosition {
  const buddyCenter = resolveBoxCenter(position.value, DEFAULT_BUDDY_SIZE);
  return clampVirtualCursorFramePosition(
    {
      x: buddyCenter.x + Math.cos(angle) * BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_RADIUS_PX - BUDDY_VIRTUAL_CURSOR_SIZE.width / 2,
      y: buddyCenter.y + Math.sin(angle) * BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_RADIUS_PX - BUDDY_VIRTUAL_CURSOR_SIZE.height / 2,
    },
    viewport.value,
  );
}

function resolveVirtualCursorOrbitAngle(cursorPosition: BuddyPosition) {
  const buddyCenter = resolveBoxCenter(position.value, DEFAULT_BUDDY_SIZE);
  const cursorCenter = resolveBoxCenter(cursorPosition, BUDDY_VIRTUAL_CURSOR_SIZE);
  return Math.atan2(cursorCenter.y - buddyCenter.y, cursorCenter.x - buddyCenter.x);
}

function resolveVirtualCursorOrbitTangentAngle(angle: number) {
  return resolveVirtualCursorVectorAngle(-Math.sin(angle), Math.cos(angle));
}

function resolveVirtualCursorChaseLoopTangentAngle(angle: number) {
  return resolveVirtualCursorVectorAngle(
    Math.cos(angle) * BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX,
    Math.cos(angle * 2) * BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX * 2,
  );
}

function resolveRandomVirtualCursorChasePosition(): BuddyPosition {
  const buddyCenter = resolveBoxCenter(position.value, DEFAULT_BUDDY_SIZE);
  const followMaxDistancePx = resolveVirtualCursorFollowMaxDistancePx();
  const chaseLoopHorizontalMarginPx = DEFAULT_BUDDY_MARGIN + BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX;
  const chaseLoopVerticalMarginPx = DEFAULT_BUDDY_MARGIN + BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX;
  const chaseLoopSafeMarginPx = Math.max(chaseLoopHorizontalMarginPx, chaseLoopVerticalMarginPx);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = clampBuddyPosition(
      {
        x: randomBetween(chaseLoopHorizontalMarginPx, Math.max(chaseLoopHorizontalMarginPx, viewport.value.width - BUDDY_VIRTUAL_CURSOR_SIZE.width - chaseLoopHorizontalMarginPx)),
        y: randomBetween(chaseLoopVerticalMarginPx, Math.max(chaseLoopVerticalMarginPx, viewport.value.height - BUDDY_VIRTUAL_CURSOR_SIZE.height - chaseLoopVerticalMarginPx)),
      },
      viewport.value,
      BUDDY_VIRTUAL_CURSOR_SIZE,
      chaseLoopSafeMarginPx,
    );
    const candidateCenter = resolveBoxCenter(candidate, BUDDY_VIRTUAL_CURSOR_SIZE);
    if (Math.hypot(candidateCenter.x - buddyCenter.x, candidateCenter.y - buddyCenter.y) > followMaxDistancePx * 1.15) {
      return candidate;
    }
  }
  const horizontalDirection = buddyCenter.x > viewport.value.width / 2 ? -1 : 1;
  const verticalDirection = buddyCenter.y > viewport.value.height / 2 ? -1 : 1;
  return clampBuddyPosition(
    {
      x: buddyCenter.x + horizontalDirection * followMaxDistancePx * 1.3 - BUDDY_VIRTUAL_CURSOR_SIZE.width / 2,
      y: buddyCenter.y + verticalDirection * followMaxDistancePx * 0.9 - BUDDY_VIRTUAL_CURSOR_SIZE.height / 2,
    },
    viewport.value,
    BUDDY_VIRTUAL_CURSOR_SIZE,
    chaseLoopSafeMarginPx,
  );
}

function resolveBuddyRoamTargetPosition(): BuddyPosition {
  const currentPosition = position.value;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const distance = randomBetween(BUDDY_ROAM_TARGET_MIN_DISTANCE_PX, BUDDY_ROAM_TARGET_MAX_DISTANCE_PX);
    const angle = randomBetween(0, Math.PI * 2);
    const candidate = clampBuddyPosition(
      {
        x: currentPosition.x + Math.cos(angle) * distance,
        y: currentPosition.y + Math.sin(angle) * distance,
      },
      viewport.value,
      DEFAULT_BUDDY_SIZE,
      DEFAULT_BUDDY_MARGIN,
    );
    if (Math.hypot(candidate.x - currentPosition.x, candidate.y - currentPosition.y) >= BUDDY_ROAM_TARGET_MIN_DISTANCE_PX) {
      return candidate;
    }
  }

  const horizontalDirection = currentPosition.x > viewport.value.width / 2 ? -1 : 1;
  const verticalDirection = currentPosition.y > viewport.value.height / 2 ? -0.35 : 0.35;
  return clampBuddyPosition(
    {
      x: currentPosition.x + horizontalDirection * BUDDY_ROAM_TARGET_MIN_DISTANCE_PX,
      y: currentPosition.y + verticalDirection * BUDDY_ROAM_TARGET_MIN_DISTANCE_PX,
    },
    viewport.value,
    DEFAULT_BUDDY_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

function resolveBuddyRoamStepPosition(currentPosition: BuddyPosition, targetPosition: BuddyPosition): BuddyPosition {
  const deltaX = targetPosition.x - currentPosition.x;
  const deltaY = targetPosition.y - currentPosition.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= BUDDY_ROAM_STEP_DISTANCE_PX) {
    return targetPosition;
  }
  return clampBuddyPosition(
    {
      x: currentPosition.x + (deltaX / distance) * BUDDY_ROAM_STEP_DISTANCE_PX,
      y: currentPosition.y + (deltaY / distance) * BUDDY_ROAM_STEP_DISTANCE_PX,
    },
    viewport.value,
    DEFAULT_BUDDY_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

function resolveBuddyRoamFacing(deltaX: number): BuddyMascotFacing {
  if (Math.abs(deltaX) < 2) {
    return "front";
  }
  return deltaX < 0 ? "left" : "right";
}

function isBuddyRoamTargetReached(currentPosition: BuddyPosition, targetPosition: BuddyPosition) {
  return Math.hypot(targetPosition.x - currentPosition.x, targetPosition.y - currentPosition.y) <= BUDDY_ROAM_TARGET_REACHED_DISTANCE_PX;
}

function isBuddyVirtualCursorFollowTargetReached(currentPosition: BuddyPosition, targetPosition: BuddyPosition) {
  return Math.hypot(targetPosition.x - currentPosition.x, targetPosition.y - currentPosition.y) <= BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_REACHED_DISTANCE_PX;
}

function finishBuddyRoamSequence(shouldPersistPosition: boolean) {
  buddyRoamTargetPosition = null;
  mascotMotion.value = "idle";
  mascotFacing.value = "front";
  if (shouldPersistPosition) {
    persistPosition();
  }
  scheduleBuddyRoam();
}

function cancelBuddyRoamTimers() {
  buddyRoamSequenceId += 1;
  cancelBuddyVirtualCursorIdleFrame();
  if (buddyRoamTimerId !== null) {
    window.clearTimeout(buddyRoamTimerId);
    buddyRoamTimerId = null;
  }
  if (buddyRoamMotionTimerId !== null) {
    window.clearTimeout(buddyRoamMotionTimerId);
    buddyRoamMotionTimerId = null;
  }
  if (buddyRoamStepTimerId !== null) {
    window.clearTimeout(buddyRoamStepTimerId);
    buddyRoamStepTimerId = null;
  }
  buddyRoamTargetPosition = null;
  virtualCursorIdleActionMode.value = "none";
  mascotMotion.value = "idle";
  mascotFacing.value = "front";
}

function cancelBuddyVirtualCursorIdleFrame() {
  if (buddyVirtualCursorIdleFrameId !== null) {
    window.cancelAnimationFrame(buddyVirtualCursorIdleFrameId);
    buddyVirtualCursorIdleFrameId = null;
  }
  clearVirtualCursorFlightFrame();
  virtualCursorAngleFrameTimestampMs = null;
  setVirtualCursorMoveTransitionDuration(BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS);
  setVirtualCursorRotateTransitionDuration(BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS);
}

function clearVirtualCursorFlightFrame() {
  if (virtualCursorFlightFrameId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(virtualCursorFlightFrameId);
  }
  virtualCursorFlightFrameId = null;
  clearVirtualCursorFlightTracking();
}

function clearVirtualCursorFlightTracking() {
  if (virtualCursorFlightTrackingFrameId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(virtualCursorFlightTrackingFrameId);
  }
  virtualCursorFlightTrackingFrameId = null;
  virtualCursorFlightTracking = null;
  virtualCursorTrackingPosition = null;
}

function requestBuddyFollowVirtualCursor() {
  if (!shouldBuddyFollowVirtualCursor.value || virtualCursorPhase.value !== "active" || isPanelFullscreen.value) {
    return;
  }
  const targetPosition = resolveBuddyVirtualCursorFollowTargetPosition();
  const isFollowingMotionActive = buddyVirtualCursorFollowMotionTimerId !== null;
  if (isBuddyVirtualCursorFollowTargetReached(position.value, targetPosition)) {
    if (isFollowingMotionActive) {
      buddyVirtualCursorFollowTargetPosition = targetPosition;
      return;
    }
    if (
      buddyVirtualCursorFollowTargetPosition !== null ||
      buddyVirtualCursorFollowStepTimerId !== null
    ) {
      finishBuddyVirtualCursorFollowSequence(true);
    }
    return;
  }

  const wasFollowing =
    buddyVirtualCursorFollowTargetPosition !== null ||
    buddyVirtualCursorFollowMotionTimerId !== null ||
    buddyVirtualCursorFollowStepTimerId !== null;
  if (!wasFollowing && virtualCursorIdleActionMode.value === "none") {
    cancelBuddyRoamTimers();
  }
  buddyVirtualCursorFollowTargetPosition = targetPosition;
  if (wasFollowing) {
    return;
  }

  buddyVirtualCursorFollowSequenceId += 1;
  runBuddyVirtualCursorFollowStep(buddyVirtualCursorFollowSequenceId);
}

function runBuddyVirtualCursorFollowStep(sequenceId: number) {
  if (sequenceId !== buddyVirtualCursorFollowSequenceId) {
    return;
  }
  const targetPosition = buddyVirtualCursorFollowTargetPosition;
  if (!shouldBuddyFollowVirtualCursor.value || isPanelFullscreen.value || targetPosition === null) {
    finishBuddyVirtualCursorFollowSequence(false);
    return;
  }
  if (isBuddyVirtualCursorFollowTargetReached(position.value, targetPosition)) {
    finishBuddyVirtualCursorFollowSequence(true);
    return;
  }

  const nextPosition = resolveBuddyRoamStepPosition(position.value, targetPosition);
  const motionDurationMs = resolveMascotMoveDurationMs("fixed");
  mascotMoveDurationMs.value = motionDurationMs;
  restartAvatarHopAnimation();
  mascotFacing.value = resolveBuddyRoamFacing(nextPosition.x - position.value.x);
  mascotMotion.value = "roam";
  position.value = nextPosition;
  updateMascotLookFromVirtualCursor();
  buddyVirtualCursorFollowMotionTimerId = window.setTimeout(() => {
    if (sequenceId !== buddyVirtualCursorFollowSequenceId) {
      return;
    }
    buddyVirtualCursorFollowMotionTimerId = null;
    mascotMotion.value = "idle";
    const latestTargetPosition = buddyVirtualCursorFollowTargetPosition;
    if (!shouldBuddyFollowVirtualCursor.value || isPanelFullscreen.value || latestTargetPosition === null) {
      finishBuddyVirtualCursorFollowSequence(false);
      return;
    }
    if (isBuddyVirtualCursorFollowTargetReached(position.value, latestTargetPosition)) {
      finishBuddyVirtualCursorFollowSequence(true);
      return;
    }
    buddyVirtualCursorFollowStepTimerId = window.setTimeout(() => {
      buddyVirtualCursorFollowStepTimerId = null;
      runBuddyVirtualCursorFollowStep(sequenceId);
    }, buddyMascotMotionConfig.value.stepPauseMs);
  }, motionDurationMs);
}

function resolveBuddyVirtualCursorFollowTargetPosition(): BuddyPosition {
  const buddyCenter = resolveBoxCenter(position.value, DEFAULT_BUDDY_SIZE);
  const cursorCenter = resolveBoxCenter(resolveCurrentVirtualCursorTrackingPosition(), BUDDY_VIRTUAL_CURSOR_SIZE);
  const deltaX = buddyCenter.x - cursorCenter.x;
  const deltaY = buddyCenter.y - cursorCenter.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= resolveVirtualCursorFollowMaxDistancePx()) {
    return position.value;
  }

  const unitX = distance < 1 ? -0.82 : deltaX / distance;
  const unitY = distance < 1 ? 0.58 : deltaY / distance;
  const followTargetDistancePx = resolveVirtualCursorFollowTargetDistancePx(resolveVirtualCursorFollowMaxDistancePx());
  return clampBuddyPosition(
    {
      x: cursorCenter.x + unitX * followTargetDistancePx - DEFAULT_BUDDY_SIZE.width / 2,
      y: cursorCenter.y + unitY * followTargetDistancePx - DEFAULT_BUDDY_SIZE.height / 2,
    },
    viewport.value,
    DEFAULT_BUDDY_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

function finishBuddyVirtualCursorFollowSequence(shouldPersistPosition: boolean) {
  cancelBuddyVirtualCursorFollowTimers();
  cancelBuddyVirtualCursorIdleFrame();
  mascotMotion.value = "idle";
  mascotFacing.value = "front";
  if (shouldPersistPosition) {
    persistPosition();
  }
  if (virtualCursorPickupPending && virtualCursorIdleActionMode.value === "none" && virtualCursorEnabled.value) {
    pickupVirtualCursor({ finishIdleAnimation: true });
    return;
  }
  if (virtualCursorIdleActionMode.value === "chase") {
    if (Math.random() < 0.5) {
      pickupVirtualCursor({ sequenceId: buddyRoamSequenceId, finishIdleAnimation: true });
      return;
    }
    moveBuddyIdleVirtualCursorChaseTarget(buddyRoamSequenceId);
  }
}

function cancelBuddyVirtualCursorFollowTimers() {
  buddyVirtualCursorFollowSequenceId += 1;
  if (buddyVirtualCursorFollowMotionTimerId !== null) {
    window.clearTimeout(buddyVirtualCursorFollowMotionTimerId);
    buddyVirtualCursorFollowMotionTimerId = null;
  }
  if (buddyVirtualCursorFollowStepTimerId !== null) {
    window.clearTimeout(buddyVirtualCursorFollowStepTimerId);
    buddyVirtualCursorFollowStepTimerId = null;
  }
  buddyVirtualCursorFollowTargetPosition = null;
  mascotMotion.value = "idle";
  mascotFacing.value = "front";
}

function clearBuddyDebugActionTimer() {
  if (buddyDebugActionTimerId !== null) {
    window.clearTimeout(buddyDebugActionTimerId);
    buddyDebugActionTimerId = null;
  }
  debugDragging.value = false;
}

function restartAvatarHopAnimation() {
  avatarHopCycle.value += 1;
}

function playMascotDebugMotion(motion: BuddyMascotMotion, durationMs: number, facing: BuddyMascotFacing) {
  mood.value = "idle";
  mascotFacing.value = facing;
  mascotMoveDurationMs.value = durationMs;
  restartAvatarHopAnimation();
  mascotMotion.value = motion;
  buddyDebugActionTimerId = window.setTimeout(() => {
    mascotMotion.value = "idle";
    mascotFacing.value = "front";
    buddyDebugActionTimerId = null;
  }, durationMs);
}

function triggerMascotDebugAction(action: BuddyMascotDebugAction) {
  cancelBuddyRoamTimers();
  clearSpeakingIdleTimer();
  clearBuddyDebugActionTimer();
  switch (action) {
    case "idle":
      mood.value = "idle";
      mascotMotion.value = "idle";
      mascotFacing.value = "front";
      break;
    case "thinking":
      mood.value = "thinking";
      mascotMotion.value = "idle";
      mascotFacing.value = "front";
      break;
    case "speaking":
      mood.value = "speaking";
      mascotMotion.value = "idle";
      mascotFacing.value = "front";
      break;
    case "error":
      mood.value = "error";
      mascotMotion.value = "idle";
      mascotFacing.value = "front";
      break;
    case "tap":
      mood.value = "idle";
      tapNonce.value += 1;
      break;
    case "dragging":
      mood.value = "idle";
      debugDragging.value = true;
      buddyDebugActionTimerId = window.setTimeout(() => {
        debugDragging.value = false;
        buddyDebugActionTimerId = null;
      }, 1100);
      break;
    case "hop":
      playMascotDebugMotion("hop", resolveMascotMoveDurationMs("random"), "front");
      break;
    case "roam":
      playMascotDebugMotion("roam", resolveMascotMoveDurationMs("random"), "right");
      break;
    case "idle-tail-switch":
      runBuddyIdleTailSwitch(++buddyRoamSequenceId);
      break;
    case "idle-random-move":
      mood.value = "idle";
      runBuddyIdleRoam(++buddyRoamSequenceId, { force: true });
      break;
    case "idle-virtual-cursor-orbit":
      mood.value = "idle";
      runBuddyIdleVirtualCursorOrbit(++buddyRoamSequenceId, { force: true });
      break;
    case "idle-virtual-cursor-chase":
      mood.value = "idle";
      runBuddyIdleVirtualCursorChase(++buddyRoamSequenceId, { force: true });
      break;
    case "face-left":
      mood.value = "idle";
      mascotMotion.value = "idle";
      mascotFacing.value = "left";
      break;
    case "face-front":
      mood.value = "idle";
      mascotMotion.value = "idle";
      mascotFacing.value = "front";
      break;
    case "face-right":
      mood.value = "idle";
      mascotMotion.value = "idle";
      mascotFacing.value = "right";
      break;
  }
}

function randomBetween(min: number, max: number) {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

function resolveMascotMoveDurationMs(mode: "fixed" | "random") {
  const baseDurationMs = buddyMascotMotionConfig.value.moveDurationMs;
  if (mode === "fixed") {
    return baseDurationMs;
  }
  return Math.round(randomBetween(baseDurationMs, baseDurationMs * 2));
}

function chooseBuddyIdleAnimationAction(): BuddyIdleAnimationAction {
  return BUDDY_IDLE_ANIMATION_ACTIONS[Math.floor(Math.random() * BUDDY_IDLE_ANIMATION_ACTIONS.length)] ?? "tail-switch";
}

function canRunBuddyIdleAnimation(options: BuddyIdleRunOptions = {}) {
  return options.force || canBuddyRoam.value;
}

function startVirtualCursorLaunch() {
  clearVirtualCursorTransition();
  virtualCursorPhase.value = "launching";
  virtualCursorDetached.value = true;
  virtualCursorDragging.value = false;
  virtualCursorPosition.value = resolveDefaultVirtualCursorPosition(viewport.value, position.value);
  virtualCursorPath.value = VIRTUAL_CURSOR_STAR_PATH;
  virtualCursorAngleDeg.value = BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG;
  virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE;
  startVirtualCursorMorph(VIRTUAL_CURSOR_STAR_PATH, VIRTUAL_CURSOR_SHAPE_PATH);

  const targetPosition = resolveVirtualCursorLaunchPosition(viewport.value, position.value);
  if (typeof window === "undefined") {
    virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE;
    moveVirtualCursorTo(targetPosition);
    finishVirtualCursorLaunch();
    return;
  }

  virtualCursorTransitionFrameId = window.requestAnimationFrame(() => {
    virtualCursorTransitionFrameId = null;
    virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE;
    moveVirtualCursorTo(targetPosition);
  });
  virtualCursorTransitionTimerId = window.setTimeout(finishVirtualCursorLaunch, BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS);
}

function finishVirtualCursorLaunch() {
  virtualCursorTransitionTimerId = null;
  virtualCursorPath.value = VIRTUAL_CURSOR_SHAPE_PATH;
  virtualCursorMorphAnimation.value = null;
  setVirtualCursorMoveTransitionDuration(BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS);
  setVirtualCursorRotateTransitionDuration(BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS);
  if (!virtualCursorEnabled.value) {
    startVirtualCursorReturn();
    return;
  }
  virtualCursorPhase.value = "active";
  virtualCursorDetached.value = true;
  virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE;
  settleVirtualCursorRotation();
  updateMascotLookFromVirtualCursor();
  requestBuddyFollowVirtualCursor();
}

function startVirtualCursorReturn() {
  clearVirtualCursorTransition();
  if (virtualCursorPhase.value === "hidden") {
    virtualCursorDetached.value = false;
    virtualCursorDragging.value = false;
    return;
  }

  virtualCursorPhase.value = "returning";
  virtualCursorDetached.value = true;
  virtualCursorDragging.value = false;
  virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE;
  virtualCursorPath.value = VIRTUAL_CURSOR_SHAPE_PATH;
  startVirtualCursorMorph(VIRTUAL_CURSOR_SHAPE_PATH, VIRTUAL_CURSOR_STAR_PATH);

  const dockedPosition = resolveDefaultVirtualCursorPosition(viewport.value, position.value);
  if (typeof window === "undefined") {
    virtualCursorAngleDeg.value = BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG;
    virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE;
    moveVirtualCursorTo(dockedPosition, { updateAngle: false });
    finishVirtualCursorReturn();
    return;
  }

  virtualCursorTransitionFrameId = window.requestAnimationFrame(() => {
    virtualCursorTransitionFrameId = null;
    virtualCursorAngleDeg.value = BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG;
    virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE;
    moveVirtualCursorTo(dockedPosition, { updateAngle: false });
  });
  virtualCursorTransitionTimerId = window.setTimeout(finishVirtualCursorReturn, BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS);
}

function finishVirtualCursorReturn() {
  virtualCursorTransitionTimerId = null;
  const dockedPosition = resolveDefaultVirtualCursorPosition(viewport.value, position.value);
  clearVirtualCursorFlightTracking();
  setVirtualCursorMoveTransitionDuration(BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS);
  setVirtualCursorRotateTransitionDuration(BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS);
  virtualCursorPosition.value = dockedPosition;
  virtualCursorPath.value = VIRTUAL_CURSOR_STAR_PATH;
  virtualCursorMorphAnimation.value = null;
  virtualCursorPhase.value = "hidden";
  virtualCursorDetached.value = false;
  virtualCursorDragging.value = false;
  virtualCursorAngleDeg.value = BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG;
  virtualCursorScale.value = BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE;
  mascotLook.value = { x: 0, y: 0 };
}

function startVirtualCursorMorph(fromPath: string, toPath: string) {
  virtualCursorMorphAnimationKey += 1;
  virtualCursorMorphAnimation.value = {
    key: virtualCursorMorphAnimationKey,
    values: `${fromPath};${toPath}`,
    durationMs: BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS,
  };
  void nextTick(() => {
    virtualCursorAnimateElement.value?.beginElement();
  });
}

function clearVirtualCursorTransition() {
  clearVirtualCursorFlightFrame();
  if (virtualCursorTransitionFrameId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(virtualCursorTransitionFrameId);
  }
  if (virtualCursorTransitionTimerId !== null && typeof window !== "undefined") {
    window.clearTimeout(virtualCursorTransitionTimerId);
  }
  virtualCursorTransitionFrameId = null;
  virtualCursorTransitionTimerId = null;
  virtualCursorMorphAnimation.value = null;
}

function moveVirtualCursorTo(
  nextPosition: BuddyPosition,
  options: { updateAngle?: boolean; durationMs?: number; rotateDurationMs?: number; angleDeg?: number; smoothAngle?: boolean } = {},
) {
  clearVirtualCursorFlightFrame();
  const currentPosition = virtualCursorPosition.value;
  const targetAngleDeg = options.angleDeg ?? resolveVirtualCursorFlightAngle(currentPosition, nextPosition);
  setVirtualCursorMoveTransitionDuration(
    options.durationMs ??
      resolveVirtualCursorMoveDurationMs(
        currentPosition,
        nextPosition,
        buddyMascotMotionConfig.value.virtualCursorFlightSpeedPxPerS,
      ),
  );
  setVirtualCursorRotateTransitionDuration(
    options.rotateDurationMs ??
      resolveVirtualCursorRotateDurationMs(
        virtualCursorAngleDeg.value,
        targetAngleDeg,
        buddyMascotMotionConfig.value.virtualCursorRotationSpeedDegPerS,
      ),
  );
  if (options.updateAngle !== false) {
    virtualCursorAngleDeg.value = options.smoothAngle
      ? resolveSmoothedVirtualCursorAngleForFrame(targetAngleDeg)
      : resolveContinuousVirtualCursorAngle(virtualCursorAngleDeg.value, targetAngleDeg);
  } else {
    virtualCursorAngleFrameTimestampMs = null;
  }
  virtualCursorPosition.value = nextPosition;
}

function moveVirtualCursorToWithArmedTransition(
  nextPosition: BuddyPosition,
  options: { updateAngle?: boolean; durationMs?: number; rotateDurationMs?: number; angleDeg?: number; smoothAngle?: boolean } = {},
) {
  const currentPosition = virtualCursorPosition.value;
  const targetAngleDeg = options.angleDeg ?? resolveVirtualCursorFlightAngle(currentPosition, nextPosition);
  const durationMs = options.durationMs ??
    resolveVirtualCursorMoveDurationMs(
      currentPosition,
      nextPosition,
      buddyMascotMotionConfig.value.virtualCursorFlightSpeedPxPerS,
    );
  const rotateDurationMs = options.rotateDurationMs ??
    resolveVirtualCursorRotateDurationMs(
      virtualCursorAngleDeg.value,
      targetAngleDeg,
      buddyMascotMotionConfig.value.virtualCursorRotationSpeedDegPerS,
    );
  clearVirtualCursorFlightFrame();
  setVirtualCursorMoveTransitionDuration(durationMs);
  setVirtualCursorRotateTransitionDuration(rotateDurationMs);

  const moveOptions = {
    ...options,
    durationMs,
    rotateDurationMs,
  };
  if (typeof window === "undefined") {
    moveVirtualCursorTo(nextPosition, moveOptions);
    startVirtualCursorFlightTracking(currentPosition, nextPosition, durationMs);
    return virtualCursorMoveDurationMs.value;
  }

  virtualCursorFlightFrameId = window.requestAnimationFrame(() => {
    virtualCursorFlightFrameId = null;
    moveVirtualCursorTo(nextPosition, moveOptions);
    startVirtualCursorFlightTracking(currentPosition, nextPosition, durationMs);
  });
  return virtualCursorMoveDurationMs.value + BUDDY_VIRTUAL_CURSOR_FLIGHT_SETTLE_MS;
}

function startVirtualCursorFlightTracking(fromPosition: BuddyPosition, toPosition: BuddyPosition, durationMs: number) {
  clearVirtualCursorFlightTracking();
  if (durationMs <= 0) {
    virtualCursorTrackingPosition = toPosition;
    updateMascotLookFromVirtualCursor();
    requestBuddyFollowVirtualCursor();
    virtualCursorTrackingPosition = null;
    return;
  }
  virtualCursorFlightTracking = {
    fromPosition,
    toPosition,
    startedAtMs: typeof performance === "undefined" ? Date.now() : performance.now(),
    durationMs,
  };
  runVirtualCursorFlightTrackingFrame();
}

function runVirtualCursorFlightTrackingFrame() {
  const tracking = virtualCursorFlightTracking;
  if (!tracking) {
    return;
  }
  const nowMs = typeof performance === "undefined" ? Date.now() : performance.now();
  const progress = Math.min(1, Math.max(0, (nowMs - tracking.startedAtMs) / tracking.durationMs));
  virtualCursorTrackingPosition = interpolateBuddyPosition(tracking.fromPosition, tracking.toPosition, progress);
  updateMascotLookFromVirtualCursor();
  requestBuddyFollowVirtualCursor();
  if (virtualCursorFlightTracking !== tracking) {
    virtualCursorFlightTrackingFrameId = null;
    return;
  }
  if (progress >= 1) {
    virtualCursorFlightTrackingFrameId = null;
    virtualCursorFlightTracking = null;
    virtualCursorTrackingPosition = null;
    return;
  }
  if (typeof window !== "undefined") {
    virtualCursorFlightTrackingFrameId = window.requestAnimationFrame(runVirtualCursorFlightTrackingFrame);
  }
}

function resolveCurrentVirtualCursorTrackingPosition() {
  return virtualCursorTrackingPosition ?? virtualCursorPosition.value;
}

function resolveVirtualCursorFollowMaxDistancePx() {
  return buddyMascotMotionConfig.value.virtualCursorFollowMaxDistancePx;
}

function setVirtualCursorMoveTransitionDuration(durationMs: number) {
  virtualCursorMoveDurationMs.value = Math.round(clampNumber(durationMs, 0, BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS));
}

function setVirtualCursorRotateTransitionDuration(durationMs: number) {
  virtualCursorRotateDurationMs.value = Math.round(clampNumber(durationMs, 0, BUDDY_VIRTUAL_CURSOR_MAX_ROTATE_TRANSITION_MS));
}

function settleVirtualCursorRotation() {
  setVirtualCursorRotateTransitionDuration(BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS);
  virtualCursorAngleFrameTimestampMs = null;
  virtualCursorAngleDeg.value = BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG;
}

function resolveSmoothedVirtualCursorAngleForFrame(targetAngleDeg: number) {
  const nowMs = typeof performance === "undefined" ? Date.now() : performance.now();
  const elapsedMs = virtualCursorAngleFrameTimestampMs === null ? 16 : Math.max(0, nowMs - virtualCursorAngleFrameTimestampMs);
  virtualCursorAngleFrameTimestampMs = nowMs;
  return resolveSmoothedVirtualCursorAngle(
    virtualCursorAngleDeg.value,
    targetAngleDeg,
    elapsedMs,
    buddyMascotMotionConfig.value.virtualCursorRotationSpeedDegPerS,
  );
}

function handleBuddyVirtualUiOperationEvent(payload: Record<string, unknown>) {
  const operationPlan = resolveBuddyVirtualOperationPlanFromActivityEvent(payload);
  if (!operationPlan) {
    return;
  }
  buddyMascotDebugStore.requestVirtualOperation(operationPlan);
}

async function executeVirtualOperationRequest(request: BuddyVirtualOperationRequest | null) {
  if (!request) {
    return;
  }
  const operationPlan = request.request;
  const pageOperationContextBefore = buildPageOperationRuntimeContext();
  const routeBefore = route.fullPath;
  let status: PageOperationResultStatus = "succeeded";
  let error: string | null = null;
  let triggeredRun: BuddyVirtualOperationTriggeredRun | null = null;
  let triggeredRunDetail: RunDetail | null = null;
  let graphEditSummary: Record<string, unknown> | null = null;
  let retryChain: PageOperationRetryRecord[] = [];
  try {
    const backgroundTemplateOperation = resolveBackgroundTemplateRunOperation(operationPlan);
    if (backgroundTemplateOperation) {
      const token = beginBackgroundVirtualOperation();
      try {
        const execution = await executeBuddyBackgroundRunTemplateOperation(
          operationPlan,
          backgroundTemplateOperation,
          pageOperationContextBefore,
        );
        triggeredRun = execution.triggeredRun;
        const completedTriggeredRunDetail = await waitForTriggeredRunCompletion(triggeredRun, {
          onSnapshot: (runDetail) => syncBackgroundTemplateRunDisplay(operationPlan, runDetail, execution.graph),
        });
        triggeredRunDetail = completedTriggeredRunDetail;
        if (completedTriggeredRunDetail) {
          promoteBackgroundTemplateRunResultToBuddyReply(operationPlan, completedTriggeredRunDetail, execution.graph);
        }
        status = completedTriggeredRunDetail?.status === "failed" ? "failed" : "succeeded";
      } finally {
        if (finishVirtualOperation(token)) {
          virtualCursorDragging.value = false;
        }
      }
    } else {
      buddyMascotDebugStore.beginVirtualOperationRunAttribution(operationPlan);
      const commandResult = await executeVirtualOperationCommands(operationPlan);
      status = commandResult.status;
      graphEditSummary = commandResult.graphEditSummary;
      retryChain = commandResult.retryChain;
      triggeredRun = await waitForVirtualOperationTriggeredRun(operationPlan);
      triggeredRunDetail = triggeredRun ? await waitForTriggeredRunCompletion(triggeredRun) : null;
      if (status !== "failed" && triggeredRunDetail && !shouldPollRunStatus(triggeredRunDetail.status)) {
        status = triggeredRunDetail.status === "failed" ? "failed" : "succeeded";
      }
    }
  } catch (caughtError) {
    status = "failed";
    error = caughtError instanceof Error ? caughtError.message : String(caughtError);
  }
  await nextTick();
  const latestForegroundRun = buildTriggeredForegroundRunFact(triggeredRun, triggeredRunDetail);
  const pageOperationContextAfterBase = buildPageOperationRuntimeContext({ latestForegroundRun });
  const operationResult = buildPageOperationResult({
    operationPlan,
    status,
    routeBefore,
    routeAfter: route.fullPath,
    pageOperationContextBefore: pageOperationContextBefore.actionRuntimeContext,
    pageOperationContextAfter: pageOperationContextAfterBase.actionRuntimeContext,
    triggeredRunId: triggeredRun?.runId ?? null,
    triggeredGraphId: triggeredRun?.graphId ?? null,
    triggeredRunInitialStatus: triggeredRun?.initialStatus ?? null,
    triggeredRunStatus: triggeredRunDetail?.status ?? triggeredRun?.initialStatus ?? null,
    triggeredRunFinalResult: triggeredRunDetail?.final_result ?? null,
    artifactRefs: buildPageOperationArtifactRefs(triggeredRunDetail),
    targetRunValidation: buildPageOperationTargetRunValidation(triggeredRunDetail),
    retryChain,
    graphEditSummary,
    error,
  });
  const pageOperationContextAfter = buildPageOperationRuntimeContext({
    latestOperationReport: operationResult.operation_report,
    latestForegroundRun,
  });
  await maybeAutoResumePageOperationRun(operationPlan, operationResult, pageOperationContextAfter);
}

async function executeVirtualOperationCommands(operationPlan: BuddyVirtualOperationPlan): Promise<BuddyVirtualOperationCommandResult> {
  stopBuddyIdleAnimation();
  const token = beginVirtualOperation();
  let graphEditSummary: Record<string, unknown> | null = null;
  try {
    await ensureVirtualCursorReadyForOperation();
    for (const operation of operationPlan.operations) {
      if (isVirtualOperationInterrupted(token)) {
        break;
      }
      const commandResult = await executeBuddyVirtualOperationCommand(operationPlan, operation);
      if (commandResult?.graphEditSummary) {
        graphEditSummary = commandResult.graphEditSummary;
      }
    }
    if (!isVirtualOperationInterrupted(token) && (operationPlan.cursorLifecycle === "return_after_step" || operationPlan.cursorLifecycle === "return_at_end")) {
      await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS, activeVirtualOperationToken.value);
      if (!isVirtualOperationInterrupted(token)) {
        buddyMascotDebugStore.setVirtualCursorEnabled(false);
      }
    }
    if (isVirtualOperationInterrupted(token)) {
      buddyMascotDebugStore.setVirtualCursorEnabled(false);
    }
    return {
      status: resolveVirtualOperationCommandStatus(token, graphEditSummary),
      graphEditSummary,
      retryChain: [...token.retryChain],
    };
  } finally {
    if (finishVirtualOperation(token)) {
      virtualCursorDragging.value = false;
    }
  }
}

function resolveVirtualOperationCommandStatus(
  token: BuddyVirtualOperationToken,
  graphEditSummary: Record<string, unknown> | null,
): PageOperationResultStatus {
  if (isVirtualOperationInterrupted(token)) {
    return "interrupted";
  }
  if (graphEditSummary?.status === "failed") {
    return "failed";
  }
  return "succeeded";
}

async function maybeAutoResumePageOperationRun(
  operationPlan: BuddyVirtualOperationPlan,
  operationResult: PageOperationResult,
  pageOperationContextAfter: ReturnType<typeof buildPageOperationRuntimeContext>,
) {
  if (!operationPlan.runId || !operationPlan.operationRequestId || !operationPlan.expectedContinuation) {
    return;
  }
  const runDetail = await fetchRun(operationPlan.runId);
  if (!canAutoResumePageOperationRun(runDetail, operationPlan.operationRequestId)) {
    return;
  }
  const assistantMessageId = resolveBuddyRunControllerMessageId(operationPlan.runId);
  const sessionId = activeSessionId.value;
  const response = await resumeRun(
    operationPlan.runId,
    buildPageOperationResumePayload({
      operationResult,
      pageContext: pageOperationContextAfter.pageContext,
      pageOperationContext: pageOperationContextAfter.actionRuntimeContext,
    }),
  );
  activeRunId.value = response.run_id;
  resetPausedBuddyPause();
  if (!assistantMessageId || !sessionId) {
    activeRunId.value = null;
    return;
  }
  await finishAutoResumedPageOperationRun({
    runId: response.run_id,
    assistantMessageId,
    sessionId,
  });
}

function resolveBackgroundTemplateRunOperation(
  operationPlan: BuddyVirtualOperationPlan,
): Extract<BuddyVirtualOperation, { kind: "run_template" }> | null {
  if (operationPlan.operations.length !== 1) {
    return null;
  }
  const operation = operationPlan.operations[0];
  return operation?.kind === "run_template" ? operation : null;
}

async function executeBuddyBackgroundRunTemplateOperation(
  operationPlan: BuddyVirtualOperationPlan,
  operation: Extract<BuddyVirtualOperation, { kind: "run_template" }>,
  pageOperationContext: ReturnType<typeof buildPageOperationRuntimeContext>,
): Promise<BuddyBackgroundTemplateRunExecution> {
  const operationRequestId = String(operationPlan.operationRequestId ?? "").trim();
  if (!operationRequestId) {
    throw new Error("缺少页面操作请求 ID。");
  }
  const template = await fetchBuddyVirtualRunTemplate(operation);
  const { graph } = buildBuddyTemplateRunGraph(template, {
    inputText: operation.inputText,
    operationRequestId,
    templateId: operation.templateId || template.template_id,
    templateName: operation.templateName || template.label || template.default_graph_name,
  });
  const response = await runGraph(attachPageOperationRuntimeContext(graph, pageOperationContext.actionRuntimeContext));
  const triggeredRun: BuddyVirtualOperationTriggeredRun = {
    operationRequestId,
    targetId: operation.runTargetId || "editor.action.runActiveGraph",
    tabId: "background",
    runId: response.run_id,
    graphId: graph.graph_id ?? null,
    initialStatus: response.status,
  };
  buddyMascotDebugStore.recordVirtualOperationTriggeredRun(triggeredRun);
  return { triggeredRun, graph };
}

async function fetchBuddyVirtualRunTemplate(operation: Extract<BuddyVirtualOperation, { kind: "run_template" }>) {
  if (operation.templateId) {
    try {
      return await fetchTemplate(operation.templateId);
    } catch {
      // Fall back to visible-search semantics below when the template id is stale or unavailable.
    }
  }
  const templates = await fetchTemplates();
  const expectedTexts = [operation.templateId, operation.templateName, operation.searchText]
    .map(normalizeTemplateRunMatchText)
    .filter(Boolean);
  const matchedTemplate = templates.find((template) => templateMatchesVirtualRunTarget(template, expectedTexts));
  if (!matchedTemplate) {
    throw new Error(`找不到目标图模板：${operation.templateName || operation.templateId || operation.searchText}`);
  }
  return matchedTemplate;
}

function templateMatchesVirtualRunTarget(template: TemplateRecord, expectedTexts: string[]) {
  if (expectedTexts.length === 0) {
    return false;
  }
  const haystack = normalizeTemplateRunMatchText(
    `${template.template_id} ${template.label} ${template.default_graph_name} ${template.description}`,
  );
  return expectedTexts.some((text) => haystack.includes(text));
}

function beginVirtualOperation(): BuddyVirtualOperationToken {
  return beginVirtualOperationLifecycle(t("buddy.virtualOperation.running"));
}

function beginBackgroundVirtualOperation(): BuddyVirtualOperationToken {
  stopBuddyIdleAnimation();
  return beginBackgroundVirtualOperationLifecycle(t("buddy.virtualOperation.backgroundRunning"));
}

function interruptVirtualOperation() {
  const action = resolveBuddyVirtualOperationUserAction({
    isOperationRunning: isVirtualOperationRunning.value,
    source: "stop_button",
  });
  if (!action.interruptOperation) {
    return;
  }
  if (interruptVirtualOperationLifecycle(t("buddy.virtualOperation.stopping"))) {
    virtualCursorDragging.value = false;
  }
}

async function waitForVirtualOperationTriggeredRun(
  operationPlan: BuddyVirtualOperationPlan,
): Promise<BuddyVirtualOperationTriggeredRun | null> {
  const operationRequestId = String(operationPlan.operationRequestId ?? "").trim();
  if (!operationRequestId || !hasRunActiveGraphOperation(operationPlan)) {
    return null;
  }
  const deadline = Date.now() + BUDDY_VIRTUAL_OPERATION_TRIGGERED_RUN_WAIT_MS;
  while (Date.now() <= deadline) {
    const triggeredRun = buddyMascotDebugStore.resolveVirtualOperationTriggeredRun(operationRequestId);
    if (triggeredRun) {
      return triggeredRun;
    }
    await waitForFrontendObservation(BUDDY_VIRTUAL_OPERATION_TRIGGERED_RUN_POLL_MS);
  }
  return buddyMascotDebugStore.resolveVirtualOperationTriggeredRun(operationRequestId);
}

async function waitForTriggeredRunCompletion(
  triggeredRun: BuddyVirtualOperationTriggeredRun,
  options: {
    token?: BuddyVirtualOperationToken | null;
    onSnapshot?: (runDetail: RunDetail) => void;
  } = {},
): Promise<RunDetail | null> {
  const deadline = Date.now() + BUDDY_PAGE_OPERATION_TRIGGERED_RUN_MAX_WAIT_MS;
  let latestRun: RunDetail | null = null;
  while (!(options.token && isVirtualOperationInterrupted(options.token)) && Date.now() <= deadline) {
    try {
      latestRun = await fetchRun(triggeredRun.runId);
      options.onSnapshot?.(latestRun);
      if (!shouldPollRunStatus(latestRun.status)) {
        return latestRun;
      }
    } catch {
      return latestRun;
    }
    if (options.token) {
      await waitForVirtualOperation(RUN_POLL_INTERVAL_MS, options.token);
    } else {
      await waitForFrontendObservation(RUN_POLL_INTERVAL_MS);
    }
  }
  return latestRun;
}

function hasRunActiveGraphOperation(operationPlan: BuddyVirtualOperationPlan) {
  return operationPlan.operations.some(
    (operation) => operation.kind === "run_template" || ("targetId" in operation && operation.targetId === "editor.action.runActiveGraph"),
  );
}

async function executeBuddyVirtualOperationCommand(
  operationPlan: BuddyVirtualOperationPlan,
  operation: BuddyVirtualOperation,
): Promise<{ graphEditSummary: GraphEditPlaybackAuditSummary } | null> {
  switch (operation.kind) {
    case "click":
      await executeBuddyVirtualClickOperation(operation);
      return null;
    case "focus":
      await executeBuddyVirtualFocusOperation(operation);
      return null;
    case "clear":
      await executeBuddyVirtualClearOperation(operation);
      return null;
    case "type":
      await executeBuddyVirtualTypeOperation(operation);
      return null;
    case "press":
      await executeBuddyVirtualPressOperation(operation);
      return null;
    case "wait":
      await executeBuddyVirtualWaitOperation(operation);
      return null;
    case "graph_edit":
      return { graphEditSummary: await executeBuddyVirtualGraphEditOperation(operationPlan, operation) };
    case "run_template":
      await executeBuddyVirtualRunTemplateOperation(operation);
      return null;
  }
}

async function executeBuddyVirtualClickOperation(operation: BuddyVirtualOperation) {
  if (!("targetId" in operation)) {
    return;
  }
  const token = activeVirtualOperationToken.value;
  await clickVirtualOperationTargetWithRetry(operation.targetId, token);
}

async function executeBuddyVirtualFocusOperation(operation: BuddyVirtualOperation) {
  if (!("targetId" in operation)) {
    return;
  }
  const token = activeVirtualOperationToken.value;
  const affordance = await waitForVirtualOperationAffordance(operation.targetId, token);
  if (!affordance) {
    throw new Error(`找不到可见页面目标：${operation.targetId}`);
  }
  await moveVirtualCursorToElement(affordance.element);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  affordance.element.focus();
}

async function executeBuddyVirtualClearOperation(operation: BuddyVirtualOperation) {
  if (!("targetId" in operation)) {
    return;
  }
  await executeBuddyVirtualFocusOperation(operation);
  const input = await waitForVirtualOperationTextInput(operation.targetId, activeVirtualOperationToken.value);
  if (!input) {
    throw new Error(`找不到可编辑页面目标：${operation.targetId}`);
  }
  input.value = "";
  dispatchVirtualInputEvents(input, "deleteContentBackward", "");
}

async function executeBuddyVirtualTypeOperation(operation: BuddyVirtualOperation) {
  if (!("targetId" in operation) || operation.kind !== "type" || !operation.text) {
    return;
  }
  const token = activeVirtualOperationToken.value;
  await executeBuddyVirtualFocusOperation(operation);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  const input = await waitForVirtualOperationTextInput(operation.targetId, token);
  if (!input) {
    throw new Error(`找不到可编辑页面目标：${operation.targetId}`);
  }
  await typeVirtualText(input, operation.text);
}

async function executeBuddyVirtualPressOperation(operation: BuddyVirtualOperation) {
  if (!("targetId" in operation) || operation.kind !== "press" || !operation.key) {
    return;
  }
  const token = activeVirtualOperationToken.value;
  const affordance = await waitForVirtualOperationAffordance(operation.targetId, token);
  if (!affordance) {
    throw new Error(`找不到可见页面目标：${operation.targetId}`);
  }
  await moveVirtualCursorToElement(affordance.element);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  affordance.element.focus();
  affordance.element.dispatchEvent(new KeyboardEvent("keydown", { key: operation.key, bubbles: true }));
  affordance.element.dispatchEvent(new KeyboardEvent("keyup", { key: operation.key, bubbles: true }));
}

async function executeBuddyVirtualWaitOperation(operation: BuddyVirtualOperation) {
  if (operation.kind !== "wait") {
    return;
  }
  await waitForVirtualOperation(operation.option === "short" ? 300 : 120);
}

async function executeBuddyVirtualRunTemplateOperation(operation: BuddyVirtualOperation) {
  if (operation.kind !== "run_template") {
    return;
  }
  const token = activeVirtualOperationToken.value;
  await clickVirtualOperationTargetWithRetry("app.nav.library", token);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  if (!(await waitForRoutePath("/library", token))) {
    throw new Error("页面没有进入目标路径：/library");
  }
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  const searchInput = await waitForVirtualOperationTextInput("library.search.query", token);
  if (!searchInput) {
    throw new Error("找不到图与模板搜索栏。");
  }
  await moveVirtualCursorToElement(searchInput);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  searchInput.focus();
  await replaceVirtualText(searchInput, operation.searchText);
  await waitForVirtualOperation(BUDDY_VIRTUAL_TEMPLATE_SEARCH_SETTLE_MS, token);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  const templateAffordance = await waitForTemplateRunTargetAffordance(operation, token);
  if (!templateAffordance) {
    throw new Error(`找不到目标图模板：${operation.templateName || operation.templateId || operation.searchText}`);
  }
  await moveVirtualCursorToElement(templateAffordance.element);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  dispatchVirtualClick(templateAffordance.element);
  if (!(await waitForRoutePath("/editor", token))) {
    throw new Error("页面没有进入目标路径：/editor");
  }
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  await fillTemplateRunInputNode(operation, token);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  await clickVirtualOperationTargetWithRetry(operation.runTargetId, token);
}

async function executeBuddyVirtualGraphEditOperation(
  operationPlan: BuddyVirtualOperationPlan,
  operation: BuddyVirtualOperation,
): Promise<GraphEditPlaybackAuditSummary> {
  if (operation.kind !== "graph_edit") {
    return buildGraphEditPlaybackAuditSummary({
      requestId: "",
      planOk: false,
      planIssues: ["Operation is not a graph_edit request."],
      commandCount: 0,
      playbackStepCount: 0,
      interrupted: false,
      applyResults: [],
    });
  }
  const token = activeVirtualOperationToken.value;
  const affordance = resolveVirtualOperationAffordance(operation.targetId);
  if (affordance) {
    await moveVirtualCursorToElement(affordance.element);
    if (isVirtualOperationInterrupted(token)) {
      return buildGraphEditPlaybackAuditSummary({
        requestId: "",
        planOk: true,
        planIssues: [],
        commandCount: 0,
        playbackStepCount: 0,
        interrupted: true,
        applyResults: [],
      });
    }
  }
  const requestId = `graph-edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const response = requestGraphEditPlaybackPlan({
    requestId,
    graphEditIntents: operation.graphEditIntents,
  });
  if (!response?.ok) {
    return buildGraphEditPlaybackAuditSummary({
      requestId,
      planOk: false,
      planIssues: response?.issues.length ? response.issues : ["Graph edit playback plan request failed."],
      commandCount: response?.graphCommands.length ?? 0,
      playbackStepCount: response?.playbackSteps.length ?? 0,
      interrupted: false,
      applyResults: [],
    });
  }
  setGraphEditPlaybackRunning(true);
  const playbackState = createGraphEditPlaybackUiState();
  const applyResults: GraphEditPlaybackAuditApplyResult[] = [];
  try {
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
    if (isVirtualOperationInterrupted(token)) {
      return buildGraphEditPlaybackAuditSummary({
        requestId,
        planOk: true,
        planIssues: response.issues,
        commandCount: response.graphCommands.length,
        playbackStepCount: response.playbackSteps.length,
        interrupted: true,
        applyResults,
      });
    }
    for (let stepIndex = 0; stepIndex < response.playbackSteps.length; stepIndex += 1) {
      if (isVirtualOperationInterrupted(token)) {
        break;
      }
      const step = response.playbackSteps[stepIndex]!;
      await ensureGraphEditPlaybackStepVisible(step, playbackState);
      const targetElement = await resolveGraphEditPlaybackStepElementWithRetry({
        step,
        playbackState,
        token,
        resolveAffordance: resolveVirtualOperationAffordance,
        isInterrupted: isVirtualOperationInterrupted,
        waitForRetry: (timeoutMs) => waitForVirtualOperation(timeoutMs),
        recordRetry: recordVirtualOperationRetry,
      });
      if (isVirtualOperationInterrupted(token)) {
        break;
      }
      if (shouldSkipGraphEditPlaybackTextStep(step, response.playbackSteps, stepIndex, playbackState, targetElement)) {
        continue;
      }
      if (shouldSkipGraphEditPlaybackConnectionStep(step, playbackState, hasVirtualOperationAffordanceElement)) {
        continue;
      }
      if (isGraphEditPlaybackDragStep(step)) {
        await executeGraphEditPlaybackDragStep(step, targetElement, playbackState);
      } else if (targetElement) {
        await moveVirtualCursorToGraphEditStep(step, targetElement);
      }
      if (isVirtualOperationInterrupted(token)) {
        break;
      }
      if (step.kind === "open_node_creation_menu") {
        if (!step.sourceAnchorKind && targetElement) {
          dispatchVirtualDoubleClick(targetElement, resolveGraphEditPlaybackPositionClientPoint(
            step,
            resolveVirtualOperationAffordance("editor.canvas.surface")?.element ?? null,
          ));
        }
      } else if (step.kind === "choose_node_type" && targetElement) {
        const beforeNodeIds = listGraphEditPlaybackNodeAffordanceIds();
        dispatchVirtualClick(targetElement);
        await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
        rememberCreatedNodeAlias(step, beforeNodeIds, playbackState);
      } else if (step.kind === "open_state_panel" && targetElement) {
        dispatchVirtualClick(targetElement);
      } else if (step.kind === "focus_node_field" && targetElement) {
        await focusGraphEditPlaybackField(step, targetElement, playbackState);
      } else if (step.kind === "type_node_field" || step.kind === "type_state_field") {
        await typeGraphEditPlaybackField(step, playbackState);
      } else if (step.kind === "commit_state_field" && targetElement) {
        const beforeStateKeys = listGraphEditPlaybackPortStateKeys(step, playbackState);
        dispatchVirtualClick(targetElement);
        await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
        rememberCreatedStateAlias(step, beforeStateKeys, playbackState);
      } else if (step.kind === "apply_graph_command") {
        const applyResponse = dispatchGraphEditPlaybackApplyCommand(step, response.graphCommands, playbackState);
        applyResults.push({
          commandId: step.commandId ?? "",
          ok: applyResponse?.ok === true,
          applied: applyResponse?.applied === true,
          issues: applyResponse?.issues.length ? applyResponse.issues : applyResponse ? [] : ["Graph edit command did not return a response."],
          diff: applyResponse?.diff ?? [],
        });
      }
      await waitForVirtualOperation(resolveGraphEditPlaybackStepDelayMs(step));
    }
  } finally {
    setGraphEditPlaybackRunning(false);
  }
  virtualCursorDragging.value = false;
  const revision = await requestGraphEditPlaybackSave({
    requestId,
    runId: operationPlan.runId ?? "",
    nodeId: operationPlan.nodeId ?? operationPlan.subgraphNodeId ?? "",
    reason: operationPlan.reason,
  });
  return buildGraphEditPlaybackAuditSummary({
    requestId,
    planOk: true,
    planIssues: response.issues,
    commandCount: response.graphCommands.length,
    playbackStepCount: response.playbackSteps.length,
    interrupted: isVirtualOperationInterrupted(token),
    applyResults,
    revision,
  });
}

async function ensureGraphEditPlaybackStepVisible(
  step: GraphEditPlaybackStep,
  playbackState: GraphEditPlaybackUiState,
) {
  const resolvedStep = resolveAliasedGraphEditPlaybackStep(step, playbackState);
  const response = requestGraphEditPlaybackEnsureVisible({
    position: resolvedStep.position,
    targetId: resolvedStep.target,
    nodeId: resolvedStep.nodeId,
    margin: BUDDY_GRAPH_EDIT_PLAYBACK_VISIBLE_MARGIN_PX,
  });
  if (response?.moved) {
    await waitForVirtualOperation(BUDDY_GRAPH_EDIT_PLAYBACK_VIEWPORT_SETTLE_MS);
  }
}

async function executeGraphEditPlaybackDragStep(
  step: GraphEditPlaybackStep,
  targetElement: HTMLElement | null,
  playbackState: GraphEditPlaybackUiState,
) {
  if (!targetElement) {
    return;
  }
  const resolvedStep = resolveAliasedGraphEditPlaybackStep(step, playbackState);
  await moveVirtualCursorToGraphEditStep(resolvedStep, targetElement);
  virtualCursorDragging.value = true;
  await dispatchVirtualGraphDragPointerEvents(resolvedStep, targetElement);
  virtualCursorDragging.value = false;
}

async function dispatchVirtualGraphDragPointerEvents(step: GraphEditPlaybackStep, targetElement: HTMLElement) {
  const token = activeVirtualOperationToken.value;
  const pointerSurface = resolveVirtualOperationAffordance("editor.canvas.surface")?.element ?? targetElement;
  const startPoint = resolveElementCenterPoint(targetElement);
  const endPoint = resolveGraphEditPlaybackDragEndPoint(step) ?? startPoint;
  const forceEmptyCanvasDrop = shouldForceGraphEditPlaybackEmptyCanvasDrop(step);
  dispatchVirtualPointerEvent(targetElement, "pointerdown", startPoint.x, startPoint.y);
  const dragPoints = buildVirtualDragPoints(startPoint, endPoint);
  for (const point of dragPoints) {
    if (isVirtualOperationInterrupted(token)) {
      break;
    }
    dispatchVirtualPointerEvent(pointerSurface, "pointermove", point.x, point.y, { forceEmptyCanvasDrop });
    await waitForVirtualOperation(moveVirtualCursorToClientPoint(point, { durationMs: 80 }));
  }
  dispatchVirtualPointerEvent(pointerSurface, "pointerup", endPoint.x, endPoint.y, { forceEmptyCanvasDrop });
}

function resolveGraphEditPlaybackDragEndPoint(step: GraphEditPlaybackStep): BuddyPosition | null {
  const endTarget = typeof step.endTarget === "string" ? step.endTarget : "";
  const positionPoint = resolveGraphEditPlaybackPositionClientPoint(
    step,
    resolveVirtualOperationAffordance("editor.canvas.surface")?.element ?? null,
  );
  if (positionPoint && (!endTarget || endTarget === "editor.canvas.surface" || endTarget === "editor.canvas.empty.createFirstNode")) {
    return positionPoint;
  }
  if (endTarget) {
    const endAffordance = resolveVirtualOperationAffordance(endTarget);
    if (endAffordance) {
      return resolveElementCenterPoint(endAffordance.element);
    }
    const anchorFallbackPoint = resolveGraphEditPlaybackAnchorNodeFallbackPoint(endTarget);
    if (anchorFallbackPoint) {
      return anchorFallbackPoint;
    }
  }
  const surface = resolveVirtualOperationAffordance("editor.canvas.surface");
  return surface ? resolveElementCenterPoint(surface.element) : null;
}

function resolveGraphEditPlaybackAnchorNodeFallbackPoint(targetId: string) {
  const nodeId = resolveGraphEditPlaybackAnchorNodeId(targetId);
  if (!nodeId) {
    return null;
  }
  const nodeAffordance = resolveVirtualOperationAffordance(`editor.canvas.node.${nodeId}`);
  return nodeAffordance ? resolveElementCenterPoint(nodeAffordance.element) : null;
}

function shouldSkipGraphEditPlaybackTextStep(
  step: GraphEditPlaybackStep,
  steps: GraphEditPlaybackStep[],
  stepIndex: number,
  playbackState: GraphEditPlaybackUiState,
  targetElement: HTMLElement | null,
) {
  if (step.kind === "focus_node_field") {
    const nextStep = steps[stepIndex + 1];
    return Boolean(
      nextStep?.kind === "type_node_field" &&
        nextStep.target === step.target &&
        isGraphEditPlaybackTextAlreadyCurrent(nextStep, playbackState, targetElement),
    );
  }
  if (step.kind === "type_node_field") {
    return isGraphEditPlaybackTextAlreadyCurrent(step, playbackState, targetElement);
  }
  return false;
}

function isGraphEditPlaybackTextAlreadyCurrent(
  step: GraphEditPlaybackStep,
  playbackState: GraphEditPlaybackUiState,
  targetElement: HTMLElement | null,
) {
  const expectedText = normalizeVirtualText(step.value ?? "");
  const targetId = resolveAliasedGraphEditPlaybackTarget(step.target, playbackState);
  const input = resolveVirtualOperationTextInput(targetId);
  if (input) {
    return normalizeVirtualText(input.value) === expectedText;
  }
  return normalizeVirtualText(targetElement?.textContent ?? "") === expectedText;
}

async function focusGraphEditPlaybackField(
  step: GraphEditPlaybackStep,
  targetElement: HTMLElement,
  playbackState: GraphEditPlaybackUiState,
) {
  const targetId = resolveAliasedGraphEditPlaybackTarget(step.target, playbackState);
  if (targetId.endsWith(".title") || targetId.endsWith(".description")) {
    dispatchVirtualPointerTap(targetElement);
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
    dispatchVirtualPointerTap(targetElement);
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
  } else {
    dispatchVirtualClick(targetElement);
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
  }
  resolveVirtualOperationTextInput(targetId)?.focus();
}

async function typeGraphEditPlaybackField(step: GraphEditPlaybackStep, playbackState: GraphEditPlaybackUiState) {
  const targetId = resolveAliasedGraphEditPlaybackTarget(step.target, playbackState);
  const input = resolveVirtualOperationTextInput(targetId);
  if (!input) {
    return;
  }
  await moveVirtualCursorToElement(input);
  input.focus();
  await replaceVirtualText(input, step.value ?? "");
  if (targetId.endsWith(".title") || targetId.endsWith(".description")) {
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
    dispatchGraphEditPlaybackTextCommit(input, targetId);
  }
}

function dispatchGraphEditPlaybackTextCommit(element: HTMLElement, targetId: string) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    key: "Enter",
    code: "Enter",
    ctrlKey: targetId.endsWith(".description"),
    metaKey: false,
  };
  element.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  element.dispatchEvent(new KeyboardEvent("keyup", eventInit));
}

function rememberCreatedNodeAlias(step: GraphEditPlaybackStep, beforeNodeIds: Set<string>, playbackState: GraphEditPlaybackUiState) {
  const plannedNodeId = step.nodeId ?? "";
  if (!plannedNodeId || playbackState.nodeIdAliases.has(plannedNodeId)) {
    return;
  }
  const createdNodeIds = [...listGraphEditPlaybackNodeAffordanceIds()].filter((nodeId) => !beforeNodeIds.has(nodeId));
  if (createdNodeIds.length === 1) {
    playbackState.nodeIdAliases.set(plannedNodeId, createdNodeIds[0]!);
  }
}

function rememberCreatedStateAlias(step: GraphEditPlaybackStep, beforeStateKeys: Set<string>, playbackState: GraphEditPlaybackUiState) {
  const plannedStateKey = step.stateKey ?? "";
  if (!plannedStateKey || playbackState.stateKeyAliases.has(plannedStateKey)) {
    return;
  }
  const createdStateKeys = [...listGraphEditPlaybackPortStateKeys(step, playbackState)].filter((stateKey) => !beforeStateKeys.has(stateKey));
  if (createdStateKeys.length === 1) {
    playbackState.stateKeyAliases.set(plannedStateKey, createdStateKeys[0]!);
  }
}

async function clickVirtualOperationTargetWithRetry(targetId: string, token: BuddyVirtualOperationToken | null) {
  const affordance = await waitForVirtualOperationAffordance(targetId, token);
  if (!affordance) {
    throw new Error(`找不到可见页面目标：${targetId}`);
  }
  await moveVirtualCursorToElement(affordance.element);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  dispatchVirtualClick(affordance.element);
  await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS, token);
}

async function waitForVirtualOperationAffordance(targetId: string, token: BuddyVirtualOperationToken | null) {
  const startedAt = Date.now();
  const deadline = Date.now() + BUDDY_VIRTUAL_OPERATION_TARGET_WAIT_MS;
  let attempts = 0;
  while (!isVirtualOperationInterrupted(token) && Date.now() <= deadline) {
    attempts += 1;
    const affordance = resolveVirtualOperationAffordance(targetId);
    if (affordance) {
      recordVirtualOperationRetry(token, buildVirtualOperationRetryRecord("affordance", targetId, attempts, "resolved", startedAt));
      return affordance;
    }
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_TARGET_RETRY_MS, token);
    await nextTick();
  }
  const affordance = resolveVirtualOperationAffordance(targetId);
  recordVirtualOperationRetry(
    token,
    buildVirtualOperationRetryRecord(
      "affordance",
      targetId,
      attempts,
      isVirtualOperationInterrupted(token) ? "interrupted" : affordance ? "resolved" : "missing",
      startedAt,
    ),
  );
  return affordance;
}

async function waitForVirtualOperationTextInput(targetId: string, token: BuddyVirtualOperationToken | null) {
  const startedAt = Date.now();
  const deadline = Date.now() + BUDDY_VIRTUAL_OPERATION_TARGET_WAIT_MS;
  let attempts = 0;
  while (!isVirtualOperationInterrupted(token) && Date.now() <= deadline) {
    attempts += 1;
    const input = resolveVirtualOperationTextInput(targetId);
    if (input) {
      recordVirtualOperationRetry(token, buildVirtualOperationRetryRecord("text_input", targetId, attempts, "resolved", startedAt));
      return input;
    }
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_TARGET_RETRY_MS, token);
    await nextTick();
  }
  const input = resolveVirtualOperationTextInput(targetId);
  recordVirtualOperationRetry(
    token,
    buildVirtualOperationRetryRecord(
      "text_input",
      targetId,
      attempts,
      isVirtualOperationInterrupted(token) ? "interrupted" : input ? "resolved" : "missing",
      startedAt,
    ),
  );
  return input;
}

async function waitForTemplateRunTargetAffordance(operation: BuddyVirtualOperation, token: BuddyVirtualOperationToken | null) {
  if (operation.kind !== "run_template") {
    return null;
  }
  const targetId = operation.targetId || operation.templateId || operation.templateName || operation.searchText || "template";
  const startedAt = Date.now();
  const deadline = Date.now() + BUDDY_VIRTUAL_OPERATION_TARGET_WAIT_MS;
  let attempts = 0;
  while (!isVirtualOperationInterrupted(token) && Date.now() <= deadline) {
    attempts += 1;
    const affordance = resolveTemplateRunTargetAffordance(operation);
    if (affordance) {
      recordVirtualOperationRetry(token, buildVirtualOperationRetryRecord("template_target", targetId, attempts, "resolved", startedAt));
      return affordance;
    }
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_TARGET_RETRY_MS, token);
    await nextTick();
  }
  const affordance = resolveTemplateRunTargetAffordance(operation);
  recordVirtualOperationRetry(
    token,
    buildVirtualOperationRetryRecord(
      "template_target",
      targetId,
      attempts,
      isVirtualOperationInterrupted(token) ? "interrupted" : affordance ? "resolved" : "missing",
      startedAt,
    ),
  );
  return affordance;
}

async function fillTemplateRunInputNode(
  operation: Extract<BuddyVirtualOperation, { kind: "run_template" }>,
  token: BuddyVirtualOperationToken | null,
) {
  const input = await waitForTemplateRunInputTextInput(token);
  if (!input) {
    throw new Error("找不到可编辑的图模板 input 节点。");
  }
  await moveVirtualCursorToElement(input);
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  dispatchVirtualClick(input);
  input.focus();
  await replaceVirtualText(input, operation.inputText);
  await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS, token);
}

async function waitForTemplateRunInputTextInput(token: BuddyVirtualOperationToken | null) {
  const startedAt = Date.now();
  const deadline = Date.now() + BUDDY_VIRTUAL_OPERATION_TARGET_WAIT_MS;
  let attempts = 0;
  while (!isVirtualOperationInterrupted(token) && Date.now() <= deadline) {
    attempts += 1;
    const input = resolveTemplateRunInputTextInput();
    if (input) {
      recordVirtualOperationRetry(token, buildVirtualOperationRetryRecord("template_input", "editor.template.input", attempts, "resolved", startedAt));
      return input;
    }
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_TARGET_RETRY_MS, token);
    await nextTick();
  }
  const input = resolveTemplateRunInputTextInput();
  recordVirtualOperationRetry(
    token,
    buildVirtualOperationRetryRecord(
      "template_input",
      "editor.template.input",
      attempts,
      isVirtualOperationInterrupted(token) ? "interrupted" : input ? "resolved" : "missing",
      startedAt,
    ),
  );
  return input;
}

async function waitForRoutePath(expectedPath: string, token: BuddyVirtualOperationToken | null) {
  const startedAt = Date.now();
  const deadline = Date.now() + BUDDY_VIRTUAL_OPERATION_TARGET_WAIT_MS;
  let attempts = 0;
  while (!isVirtualOperationInterrupted(token) && Date.now() <= deadline) {
    attempts += 1;
    await nextTick();
    if (routeMatchesVirtualOperationTargetPath(route.fullPath, expectedPath)) {
      recordVirtualOperationRetry(token, buildVirtualOperationRetryRecord("route", expectedPath, attempts, "resolved", startedAt));
      return true;
    }
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_TARGET_RETRY_MS, token);
  }
  const matched = routeMatchesVirtualOperationTargetPath(route.fullPath, expectedPath);
  recordVirtualOperationRetry(
    token,
    buildVirtualOperationRetryRecord(
      "route",
      expectedPath,
      attempts,
      isVirtualOperationInterrupted(token) ? "interrupted" : matched ? "resolved" : "missing",
      startedAt,
    ),
  );
  return matched;
}

async function moveVirtualCursorToElement(element: HTMLElement) {
  const cursorPosition = resolveVirtualCursorPositionForElement(element);
  const flightWaitMs = moveVirtualCursorToWithArmedTransition(cursorPosition);
  await waitForVirtualOperation(flightWaitMs);
}

function moveVirtualCursorToClientPoint(point: BuddyPosition, options: { durationMs?: number } = {}) {
  return moveVirtualCursorToWithArmedTransition(resolveVirtualCursorPositionForClientPoint(point, viewport.value), options);
}

async function moveVirtualCursorToGraphEditStep(step: GraphEditPlaybackStep, element: HTMLElement) {
  const positionPoint = resolveGraphEditPlaybackPositionClientPoint(
    step,
    resolveVirtualOperationAffordance("editor.canvas.surface")?.element ?? null,
  );
  if (positionPoint && (step.kind === "move_virtual_cursor" || step.kind === "open_node_creation_menu")) {
    await waitForVirtualOperation(moveVirtualCursorToClientPoint(positionPoint));
    return;
  }
  await moveVirtualCursorToElement(element);
}

async function ensureVirtualCursorReadyForOperation() {
  if (!virtualCursorEnabled.value) {
    buddyMascotDebugStore.setVirtualCursorEnabled(true);
  }
  if (virtualCursorPhase.value !== "active") {
    await waitForVirtualOperation(BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS + BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS);
  }
}

function resolveVirtualCursorPositionForElement(element: HTMLElement): BuddyPosition {
  return resolveVirtualCursorPositionForClientPoint(resolveElementCenterPoint(element), viewport.value);
}

async function replaceVirtualText(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const token = activeVirtualOperationToken.value;
  if (element.value) {
    while (element.value && !isVirtualOperationInterrupted(token)) {
      element.value = element.value.slice(0, -1);
      dispatchVirtualInputEvents(element, "deleteContentBackward", "");
      await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_TYPE_CHARACTER_DELAY_MS);
    }
  }
  if (isVirtualOperationInterrupted(token)) {
    return;
  }
  await typeVirtualText(element, text);
}

async function typeVirtualText(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const token = activeVirtualOperationToken.value;
  for (const character of text) {
    if (isVirtualOperationInterrupted(token)) {
      break;
    }
    element.value = `${element.value}${character}`;
    dispatchVirtualInputEvents(element, "insertText", character);
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_TYPE_CHARACTER_DELAY_MS);
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function sendMessage() {
  const composerDecision = resolveBuddyComposerDecision({
    draftText: draft.value,
    hasPausedRun: Boolean(pausedBuddyRun.value),
    isResumeBusy: pausedBuddyResumeBusy.value,
  });
  if (composerDecision.kind === "ignore_empty") {
    return;
  }
  const userMessage = composerDecision.userMessage;

  cancelBuddyRoamTimers();
  clearBuddyDebugActionTimer();
  errorMessage.value = "";
  isPanelOpen.value = true;
  await waitForChatSessionInitialization();
  const sessionId = await ensureActiveChatSession();
  if (!sessionId) {
    return;
  }
  draft.value = "";

  const userEntry = createMessage("user", userMessage, undefined, allocateBuddyMessageClientOrder());
  const assistantEntry = createMessage("assistant", "", undefined, allocateBuddyMessageClientOrder());
  messages.value.push(userEntry, assistantEntry);
  showBuddyImmediatePendingTrace(assistantEntry.id);
  const history = buildHistoryBeforeMessage(userEntry.id);
  void persistBuddyMessage(sessionId, userEntry);
  queuedTurns.value.push({
    userMessageId: userEntry.id,
    assistantMessageId: assistantEntry.id,
    userMessage,
    sessionId,
    history,
  });
  void drainBuddyQueue();
  await scrollMessagesToBottom();
}

async function drainBuddyQueue() {
  if (isDrainingBuddyQueue) {
    return;
  }

  isDrainingBuddyQueue = true;
  try {
    while (queuedTurns.value.length > 0) {
      const nextTurn = queuedTurns.value.shift();
      if (!nextTurn) {
        continue;
      }
      await processQueuedTurn(nextTurn);
      if (shouldHoldBuddyQueueDrain({ hasPausedRun: Boolean(pausedBuddyRun.value) })) {
        break;
      }
    }
  } finally {
    isDrainingBuddyQueue = false;
    if (queuedTurns.value.length > 0) {
      void drainBuddyQueue();
    }
  }
}

async function processQueuedTurn(turn: BuddyQueuedTurn) {
  clearSpeakingIdleTimer();
  const history = turn.history;
  const assistantMessage = ensureAssistantMessageForTurn(turn);
  mood.value = "thinking";
  setAssistantActivityText(assistantMessage.id, t("buddy.activity.preparing"));
  await scrollMessagesToBottom();

  try {
    activeAbortController = new AbortController();
    const binding = await fetchBuddyRunTemplateBinding();
    const template = await fetchTemplate(binding.template_id);
    const pageOperationContext = buildPageOperationRuntimeContext();
    const graph = buildBuddyChatGraph(
      template,
      {
        userMessage: turn.userMessage,
        history,
        pageContext: pageOperationContext.pageContext,
        pageOperationContext: pageOperationContext.actionRuntimeContext,
        buddyMode: buddyMode.value,
        buddyModel: buddyModelRef.value,
      },
      binding,
    );
    const publicOutputBindings = buildBuddyPublicOutputBindings(graph);
    showBuddyGraphPendingTrace(assistantMessage.id, graph, publicOutputBindings);
    setAssistantActivityText(assistantMessage.id, t("buddy.activity.starting"));
    const run = await runGraph(graph);
    activeRunId.value = run.run_id;
    startRunEventStream(run.run_id, assistantMessage.id, graph, publicOutputBindings);
    const runDetail = await pollRunUntilFinished(run.run_id, activeAbortController.signal);
    if (runDetail.status === "awaiting_human") {
      handleBuddyRunAwaitingHuman(runDetail, assistantMessage.id, { persist: true });
      return;
    }
    finishBuddyVisibleRun(runDetail, assistantMessage.id, turn.sessionId, run.run_id);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    mood.value = "error";
    const message = error instanceof Error ? error.message : t("buddy.runFailed");
    errorMessage.value = message;
    removeBuddyRunDisplayMessages(assistantMessage.id);
    updateAssistantMessage(assistantMessage.id, t("buddy.errorReply", { error: message }), { includeInContext: false });
    void persistBuddyMessage(turn.sessionId, messages.value.find((entry) => entry.id === assistantMessage.id), {
      includeInContext: false,
    });
  } finally {
    closeEventSource();
    activeRunId.value = null;
    activeAbortController = null;
    scheduleBuddySpeakingIdleIfNeeded();
    await scrollMessagesToBottom();
  }
}

async function finishAutoResumedPageOperationRun({
  runId,
  assistantMessageId,
  sessionId,
}: BuddyAutoResumedPageOperationFinishOptions) {
  clearSpeakingIdleTimer();
  errorMessage.value = "";
  mood.value = "thinking";
  setAssistantActivityText(assistantMessageId, t("buddy.activity.resuming"));
  const controller = new AbortController();
  activeAbortController = controller;

  try {
    const resumedRunDetail = await pollRunUntilFinished(runId, controller.signal);
    if (resumedRunDetail.status === "awaiting_human") {
      handleBuddyRunAwaitingHuman(resumedRunDetail, assistantMessageId, { persist: true });
      return;
    }
    clearAutoResumingPageOperationPlaceholder(assistantMessageId, runId);
    finishBuddyVisibleRun(resumedRunDetail, assistantMessageId, sessionId, runId, { includeOutputTrace: false });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    mood.value = "error";
    const message = error instanceof Error ? error.message : t("buddy.runFailed");
    errorMessage.value = message;
    removeBuddyRunDisplayMessages(assistantMessageId);
    updateAssistantMessage(assistantMessageId, t("buddy.errorReply", { error: formatErrorMessage(error) }), {
      includeInContext: false,
      runId,
    });
    void persistBuddyMessage(sessionId, messages.value.find((entry) => entry.id === assistantMessageId), {
      runId,
      includeInContext: false,
    });
  } finally {
    closeEventSource();
    if (!pausedBuddyRun.value) {
      activeRunId.value = null;
    }
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
    scheduleBuddySpeakingIdleIfNeeded();
    await scrollMessagesToBottom();
  }
}

function clearAutoResumingPageOperationPlaceholder(assistantMessageId: string, runId: string) {
  const message = messages.value.find((entry) => entry.id === assistantMessageId);
  if (!message || message.content.trim() !== t("buddy.pause.autoResumingPageOperation")) {
    return;
  }
  updateAssistantMessage(assistantMessageId, "", {
    includeInContext: false,
    runId,
  });
}

function handleBuddyRunAwaitingHuman(
  run: RunDetail,
  assistantMessageId: string,
  options: BuddyPauseHandlingOptions = {},
) {
  pausedBuddyRun.value = run;
  pausedBuddyAssistantMessageId.value = assistantMessageId;
  activeRunId.value = run.run_id;
  mood.value = "thinking";
  setAssistantActivityText(assistantMessageId, t("buddy.pause.activity"));
  const isAutoResumablePageOperationPause = Boolean(findAutoResumablePageOperationRequestId(run));
  if (isAutoResumablePageOperationPause) {
    updateAssistantMessage(assistantMessageId, "", {
      includeInContext: false,
      runId: run.run_id,
    });
    return;
  }
  updateAssistantMessage(assistantMessageId, t("buddy.pause.backgroundRequired"), {
    includeInContext: false,
    runId: run.run_id,
  });
  if (options.persist && activeSessionId.value) {
    void persistBuddyMessage(activeSessionId.value, messages.value.find((message) => message.id === assistantMessageId), {
      runId: run.run_id,
      includeInContext: false,
    });
  }
}

function finishBuddyVisibleRun(
  runDetail: RunDetail,
  assistantMessageId: string,
  sessionId: string,
  runId: string,
  options: BuddyFinishVisibleRunOptions = {},
) {
  const graph = runDetail.graph_snapshot as unknown as GraphPayload;
  const publicOutputBindings = buildBuddyPublicOutputBindings(graph);
  const outputTracePlan = buildBuddyOutputTracePlan(graph, publicOutputBindings);
  const outputTraceState = options.includeOutputTrace === false
    ? createEmptyBuddyOutputTraceRuntimeState()
    : buildBuddyOutputTraceStateFromRunDetail(runDetail, outputTracePlan, graph);
  const outputState = buildPublicOutputRuntimeStateFromRunDetail(runDetail, publicOutputBindings, graph);
  const { publicOutputMessages, outputTraceMessages } = syncBuddyRunDisplayMessages(assistantMessageId, runId, outputTraceState, outputState);
  const includeReplyInContext = runDetail.status === "completed";
  const assistantMessage = messages.value.find((message) => message.id === assistantMessageId);
  if (assistantMessage) {
    assistantMessage.runId = runId;
    assistantMessage.activityText = "";
    assistantMessage.includeInContext = false;
  }
  for (const message of outputTraceMessages) {
    void persistBuddyMessage(sessionId, message, {
      runId,
      includeInContext: false,
    });
  }
  if (publicOutputMessages.length === 0) {
    updateAssistantMessage(assistantMessageId, t("buddy.emptyReply"), {
      includeInContext: false,
      runId,
    });
    void persistBuddyMessage(sessionId, messages.value.find((message) => message.id === assistantMessageId), {
      runId,
      includeInContext: false,
    });
  } else {
    for (const message of publicOutputMessages) {
      void persistBuddyMessage(sessionId, message, {
        runId,
        includeInContext: message.publicOutput?.kind === "text" && includeReplyInContext,
      });
    }
  }
  void startBuddyAutonomousReviewRun(runDetail);
  mood.value = runDetail.status === "failed" ? "error" : runDetail.status === "cancelled" ? "idle" : "speaking";
  if (runDetail.status === "completed") {
    buddyContextStore.notifyBuddyDataChanged();
  }
  if (runDetail.status === "failed") {
    errorMessage.value = runDetail.errors?.[0] ?? t("buddy.runFailed");
  }
}

async function persistBuddyMessage(
  sessionId: string,
  message: BuddyMessage | undefined,
  options: { runId?: string | null; includeInContext?: boolean } = {},
) {
  if (!message) {
    return;
  }
  const metadata = buildBuddyMessageMetadata(message);
  if (!message.content.trim() && !metadata) {
    return;
  }
  try {
    await appendBuddyChatMessage(sessionId, {
      message_id: message.id,
      role: message.role,
      content: message.content,
      client_order: message.clientOrder ?? null,
      include_in_context: options.includeInContext ?? message.includeInContext !== false,
      run_id: options.runId ?? message.runId ?? null,
      ...(metadata ? { metadata } : {}),
    });
    await loadChatSessions();
  } catch (error) {
    errorMessage.value = t("buddy.historySaveFailed", { error: formatErrorMessage(error) });
  }
}

function resetVisibleBuddyRunState() {
  resetPausedBuddyPause();
}

function resetPausedBuddyPause() {
  pausedBuddyRun.value = null;
  pausedBuddyAssistantMessageId.value = null;
  pausedBuddyResumeBusy.value = false;
}

function hydratePosition() {
  const stored = parseStoredBuddyPosition(window.localStorage.getItem(BUDDY_POSITION_STORAGE_KEY));
  position.value = clampBuddyPosition(
    stored ?? resolveDefaultBuddyPosition(viewport.value),
    viewport.value,
    DEFAULT_BUDDY_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

function handleResize() {
  viewport.value = resolveViewport();
  position.value = clampBuddyPosition(position.value, viewport.value, DEFAULT_BUDDY_SIZE, DEFAULT_BUDDY_MARGIN);
  virtualCursorPosition.value = clampBuddyPosition(
    virtualCursorPosition.value,
    viewport.value,
    BUDDY_VIRTUAL_CURSOR_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
  if (isVirtualCursorRendered.value) {
    updateMascotLookFromVirtualCursor();
    requestBuddyFollowVirtualCursor();
  }
  persistPosition();
}

function persistPosition() {
  window.localStorage.setItem(BUDDY_POSITION_STORAGE_KEY, serializeBuddyPosition(position.value));
}

const {
  showBuddyImmediatePendingTrace,
  showBuddyGraphPendingTrace,
  shouldRenderMessage,
  shouldShowMessageRoleLabel,
  removeBuddyRunDisplayMessages,
  syncStreamingBuddyRunDisplay,
  syncBackgroundTemplateRunDisplay,
  promoteBackgroundTemplateRunResultToBuddyReply,
  createEmptyBuddyOutputTraceRuntimeState,
  resolveBuddyRunControllerMessageId,
  syncBuddyRunDisplayMessages,
  buildPublicOutputRuntimeStateFromRunDetail,
  nowPublicOutputMs,
  formatPublicOutputCardContent,
} = useBuddyRunDisplayMessages<BuddyMessage>({
  messages,
  mood,
  t,
  createMessage,
  allocateBuddyMessageClientOrder,
  scrollMessagesToBottom,
  clearAutoResumingPageOperationPlaceholder,
});

const {
  startRunEventStream,
  closeEventSource,
  pollRunUntilFinished,
} = useBuddyRunEventStream({
  handleActivityEvent: handleBuddyVirtualUiOperationEvent,
  setAssistantActivityFromRunEvent,
  syncStreamingBuddyRunDisplay,
  buildPublicOutputRuntimeStateFromRunDetail,
  nowPublicOutputMs,
});

const {
  startBuddyAutonomousReviewRun,
  abortBackgroundReviewRuns,
} = useBuddyAutonomousReviewRun({
  currentSessionId,
  buddyModelRef,
  pollRunUntilFinished,
  notifyBuddyDataChanged: buddyContextStore.notifyBuddyDataChanged,
});

const {
  restoringTraceGraphRevisionRowId,
  isTraceMessageExpanded,
  toggleTraceMessage,
  buildTraceTreeRows,
  isTraceRunTreeLoading,
  traceRunTreeError,
  openTraceTreeRowPlayback,
  openTraceEvidenceRun,
  restoreTraceGraphRevision,
  resolveTraceSegmentSummary,
  formatTraceSegmentDurationForMessage,
  formatTraceTreeRowDurationForMessage,
} = useBuddyRunTraceDisplay({
  messages,
  router,
  t,
  shouldRenderMessage,
});

function scheduleBuddySpeakingIdleIfNeeded() {
  if (mood.value === "speaking" && queuedTurns.value.length === 0) {
    scheduleSpeakingIdle();
  }
}

function scheduleSpeakingIdle() {
  clearSpeakingIdleTimer();
  speakingIdleTimerId = window.setTimeout(() => {
    speakingIdleTimerId = null;
    if (mood.value === "speaking" && queuedTurns.value.length === 0 && !isDrainingBuddyQueue) {
      mood.value = "idle";
      scheduleBuddyRoam();
    }
  }, 1400);
}

function clearSpeakingIdleTimer() {
  if (speakingIdleTimerId === null) {
    return;
  }
  window.clearTimeout(speakingIdleTimerId);
  speakingIdleTimerId = null;
}

function clearAvatarSingleClickTimer() {
  if (avatarSingleClickTimerId === null) {
    return;
  }
  window.clearTimeout(avatarSingleClickTimerId);
  avatarSingleClickTimerId = null;
}

function resolveViewport() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function waitForFrontendObservation(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const setTimer = typeof window === "undefined" ? globalThis.setTimeout : window.setTimeout;
    setTimer(resolve, Math.max(0, Math.round(timeoutMs)));
  });
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>

<style scoped src="./BuddyWidget.css"></style>
