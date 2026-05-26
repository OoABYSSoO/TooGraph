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
            <h2>{{ buddyDisplayName }}</h2>
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
                :title="buddyModeError || buddyModeLabel"
                :disabled="buddyModeDisabled"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import {
  appendBuddyChatMessage,
  fetchBuddyIdentity,
} from "../api/buddy.ts";
import { fetchRun } from "../api/runs.ts";
import SandboxedHtmlFrame from "../components/SandboxedHtmlFrame.vue";
import { useBuddyContextStore } from "../stores/buddyContext.ts";
import {
  useBuddyMascotDebugStore,
} from "../stores/buddyMascotDebug.ts";
import { buildBuddyBubblePreviewLabel } from "./buddyBubblePreviewModel.ts";
import { resolveBuddyWindowDisplayName } from "./buddyDisplayName.ts";
import type { BuddyChatMessageRecord, BuddyIdentity } from "../types/buddy.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

import BuddyMascot from "./BuddyMascot.vue";
import BuddyComposer from "./BuddyComposer.vue";
import BuddyRunTrace from "./BuddyRunTrace.vue";
import BuddySessionHistory from "./BuddySessionHistory.vue";
import BuddyVirtualOperationBanner from "./BuddyVirtualOperationBanner.vue";
import { useBuddyBoundRunTemplate } from "./useBuddyBoundRunTemplate.ts";
import { useBuddyVisibleRunTemplateEffects } from "./useBuddyVisibleRunTemplateEffects.ts";
import { useBuddyChatSessions } from "./useBuddyChatSessions.ts";
import { useBuddyGraphEditPlaybackExecutor } from "./useBuddyGraphEditPlaybackExecutor.ts";
import { useBuddyMessages, type BuddyMessage, type BuddyQueuedTurn } from "./useBuddyMessages.ts";
import { useBuddyModelSelection } from "./useBuddyModelSelection.ts";
import { useBuddyPageOperationContext } from "./useBuddyPageOperationContext.ts";
import { useBuddyRunDisplayMessages } from "./useBuddyRunDisplayMessages.ts";
import { useBuddyRunEventStream } from "./useBuddyRunEventStream.ts";
import { useBuddyRunTraceDisplay } from "./useBuddyRunTraceDisplay.ts";
import { useBuddyMascotMotionController, type BuddyMood } from "./useBuddyMascotMotionController.ts";
import { useBuddyVirtualOperationExecutor } from "./useBuddyVirtualOperationExecutor.ts";
import {
  findAutoResumablePageOperationRequestId,
} from "./pageOperationResume.ts";
import {
  resolveBuddyVirtualOperationUserAction,
} from "./buddyVirtualOperationInteractionPolicy.ts";
import { useBuddyVirtualOperationLifecycle } from "./useBuddyVirtualOperationLifecycle.ts";
import {
  resolveBuddyComposerDecision,
  shouldHoldBuddyQueueDrain,
} from "./buddyPauseQueuePolicy.ts";
import {
  BUDDY_MODE_OPTIONS,
  resolveBuddyReplyText,
} from "./buddyChatGraph.ts";
import { useBuddyPermissionMode } from "./useBuddyPermissionMode.ts";
import {
  buildBuddyPublicOutputBindings,
} from "./buddyPublicOutput.ts";
import {
  buildBuddyOutputTracePlan,
  buildBuddyOutputTraceStateFromRunDetail,
} from "./buddyOutputTrace.ts";
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

type BuddyAutoResumedPageOperationFinishOptions = {
  runId: string;
  assistantMessageId: string;
  sessionId: string;
};
type BuddyFinishVisibleRunOptions = {
  includeOutputTrace?: boolean;
  sourceTurn?: BuddyQueuedTurn;
  sessionSummary?: string;
};

const DRAG_THRESHOLD_PX = 4;
const AVATAR_SINGLE_CLICK_DELAY_MS = 220;
const { t, locale } = useI18n();
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
const isPanelOpen = ref(false);
const buddyDisplayIdentity = ref<BuddyIdentity | null>(null);
const draft = ref("");
const isPanelFullscreen = ref(false);
const queuedTurns = ref<BuddyQueuedTurn[]>([]);
const errorMessage = ref("");
const mood = ref<BuddyMood>("idle");
const tapNonce = ref(0);
const activeRunId = ref<string | null>(null);
const pausedBuddyRun = ref<RunDetail | null>(null);
const pausedBuddyAssistantMessageId = ref<string | null>(null);
const pausedBuddyResumeBusy = ref(false);
const pointerDrag = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: BuddyPosition;
  moved: boolean;
} | null>(null);

let suppressNextClick = false;
let activeAbortController: AbortController | null = null;
let isDrainingBuddyQueue = false;
let avatarSingleClickTimerId: number | null = null;
let speakingIdleTimerId: number | null = null;
let buddyDisplayNameRequestId = 0;

const isDragging = computed(() => Boolean(pointerDrag.value?.moved));
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
const {
  buildPageOperationRuntimeContext,
  buildTriggeredForegroundRunFact,
} = useBuddyPageOperationContext({
  routePath: computed(() => route.fullPath),
  activeRunId,
  getEditorSnapshot: () => buddyContextStore.editorSnapshot,
});
const {
  activateVirtualCursor,
  avatarElement,
  avatarHopCycle,
  canBuddyRoam,
  cancelBuddyRoamUnlessVirtualCursorIdle,
  cancelBuddyRoamTimers,
  clearBuddyDebugActionTimer,
  deactivateVirtualCursor,
  disposeBuddyMascotMotionController,
  ensureVirtualCursorReadyForOperation,
  handleMascotLookPointerMove,
  handleVirtualCursorPointerDown,
  isMascotDragging,
  isVirtualCursorRendered,
  mascotFacing,
  mascotLook,
  mascotMotion,
  mascotMoveDurationMs,
  moveVirtualCursorToClientPoint,
  moveVirtualCursorToElement,
  replaceVirtualText,
  scheduleBuddyRoam,
  shouldFloatVirtualCursor,
  stopBuddyIdleAnimation,
  syncVirtualCursorAfterViewportResize,
  tailSwitchNonce,
  triggerMascotDebugAction,
  updateMascotLookFromVirtualCursor,
  virtualCursorAnimateElement,
  virtualCursorDetached,
  virtualCursorDragging,
  virtualCursorMorphAnimation,
  virtualCursorPath,
  virtualCursorPhase,
  virtualCursorStyle,
} = useBuddyMascotMotionController({
  activeRunId,
  activeVirtualOperationToken,
  clearSpeakingIdleTimer,
  isDragging,
  isPanelFullscreen,
  isPanelOpen,
  isVirtualOperationInterrupted,
  isVirtualOperationRunning,
  motionConfig: buddyMascotMotionConfig,
  mood,
  persistPosition,
  position,
  queuedTurns,
  setVirtualCursorEnabled: (enabled) => buddyMascotDebugStore.setVirtualCursorEnabled(enabled),
  tapNonce,
  viewport,
  virtualCursorEnabled,
  waitForVirtualOperation,
});
const { executeBuddyVirtualGraphEditOperation } = useBuddyGraphEditPlaybackExecutor({
  activeVirtualOperationToken,
  virtualCursorDragging,
  isVirtualOperationInterrupted,
  waitForVirtualOperation,
  recordVirtualOperationRetry,
  moveVirtualCursorToElement,
  moveVirtualCursorToClientPoint,
  replaceVirtualText,
});
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
  hydrateLoadedRunDisplays: hydrateLoadedBuddyRunDisplays,
});
const buddyModeLabel = computed(() => {
  const option = BUDDY_MODE_OPTIONS.find((candidate) => candidate.value === buddyMode.value);
  return option ? `${t(option.labelKey)} - ${t(option.descriptionKey)}` : t("buddy.modes.askFirst");
});
const {
  buddyMode,
  buddyModeDisabled,
  buddyModeError,
  hydrateBuddyPermissionMode,
} = useBuddyPermissionMode();
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
const buddyDisplayName = computed(() =>
  resolveBuddyWindowDisplayName(buddyDisplayIdentity.value, t("buddy.title"), String(locale.value)),
);

async function refreshBuddyDisplayName() {
  const requestId = ++buddyDisplayNameRequestId;
  try {
    const identity = await fetchBuddyIdentity();
    if (requestId !== buddyDisplayNameRequestId) {
      return;
    }
    buddyDisplayIdentity.value = identity;
  } catch {
    // Keep the last known identity name on transient request failures.
  }
}

onMounted(() => {
  hydratePosition();
  void refreshBuddyDisplayName();
  void startChatSessionInitialization();
  hydrateBuddyModel();
  void hydrateBuddyPermissionMode();
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
  queuedTurns.value = [];
  clearSessionDeleteConfirmTimeout();
  clearAvatarSingleClickTimer();
  clearSpeakingIdleTimer();
  disposeBuddyMascotMotionController();
  closeEventSource();
  activeAbortController?.abort();
  abortBuddyVisibleRunTemplateEffects();
});

watch(canBuddyRoam, (canRoam) => {
  if (canRoam) {
    scheduleBuddyRoam();
    return;
  }
  cancelBuddyRoamUnlessVirtualCursorIdle();
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

watch(
  () => buddyContextStore.dataRefreshNonce,
  () => {
    void refreshBuddyDisplayName();
  },
);

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
    const boundRun = await startBuddyBoundRunTemplate({
      userMessage: turn.userMessage,
      userMessageId: turn.userMessageId,
      history,
      sessionId: turn.sessionId,
    });
    showBuddyGraphPendingTrace(assistantMessage.id, boundRun.graph, boundRun.publicOutputBindings);
    setAssistantActivityText(assistantMessage.id, t("buddy.activity.starting"));
    activeRunId.value = boundRun.runId;
    startRunEventStream(boundRun.runId, assistantMessage.id, boundRun.graph, boundRun.publicOutputBindings);
    const runDetail = await pollRunUntilFinished(boundRun.runId, activeAbortController.signal);
    if (runDetail.status === "awaiting_human") {
      handleBuddyRunAwaitingHuman(runDetail, assistantMessage.id, { persist: true });
      return;
    }
    finishBuddyVisibleRun(runDetail, assistantMessage.id, turn.sessionId, boundRun.runId, {
      sourceTurn: turn,
      sessionSummary: boundRun.sessionSummary,
    });
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
  const { publicOutputMessages } = syncBuddyRunDisplayMessages(assistantMessageId, runId, outputTraceState, outputState);
  const includeReplyInContext = runDetail.status === "completed";
  const assistantMessage = messages.value.find((message) => message.id === assistantMessageId);
  if (assistantMessage) {
    assistantMessage.runId = runId;
    assistantMessage.activityText = "";
    assistantMessage.includeInContext = includeReplyInContext;
  }
  if (publicOutputMessages.length === 0) {
    updateAssistantMessage(assistantMessageId, t("buddy.emptyReply"), {
      includeInContext: false,
      runId,
      transcriptOnly: false,
    });
    void persistBuddyMessage(sessionId, messages.value.find((message) => message.id === assistantMessageId), {
      runId,
      includeInContext: false,
    });
  } else {
    updateAssistantMessage(assistantMessageId, resolvePersistentBuddyReplyContent(publicOutputMessages, runDetail), {
      includeInContext: includeReplyInContext,
      runId,
      transcriptOnly: true,
    });
    void persistBuddyMessage(sessionId, messages.value.find((message) => message.id === assistantMessageId), {
      runId,
      includeInContext: includeReplyInContext,
    });
  }
  void startBuddyVisibleRunTemplateEffects({
    runDetail,
    runId,
    sourceTurn: options.sourceTurn,
    sessionSummary: options.sessionSummary,
  });
  mood.value = runDetail.status === "failed" ? "error" : runDetail.status === "cancelled" ? "idle" : "speaking";
  if (runDetail.status === "completed") {
    buddyContextStore.notifyBuddyDataChanged();
  }
  if (runDetail.status === "failed") {
    errorMessage.value = runDetail.errors?.[0] ?? t("buddy.runFailed");
  }
}

async function hydrateLoadedBuddyRunDisplays(records: BuddyChatMessageRecord[]) {
  const assistantRunRecords = records.filter((record) => record.role === "assistant" && Boolean(record.run_id));
  for (const record of assistantRunRecords) {
    const runId = String(record.run_id ?? "").trim();
    if (!runId) {
      continue;
    }
    try {
      const runDetail = await fetchRun(runId);
      syncBuddyRunDetailDisplay(record.message_id, runDetail);
      const message = messages.value.find((entry) => entry.id === record.message_id);
      if (message) {
        message.runId = runId;
        message.includeInContext = record.include_in_context;
        message.transcriptOnly = true;
      }
    } catch (error) {
      updateAssistantMessage(record.message_id, t("common.failedToLoad", { error: formatErrorMessage(error) }), {
        includeInContext: false,
        runId,
        transcriptOnly: false,
      });
    }
  }
}

function resolvePersistentBuddyReplyContent(publicOutputMessages: BuddyMessage[], runDetail: RunDetail) {
  const primaryTextOutput = publicOutputMessages.find(
    (message) => message.publicOutput?.kind === "text" && message.content.trim().length > 0,
  );
  const anyOutput = primaryTextOutput ?? publicOutputMessages.find((message) => message.content.trim().length > 0);
  const content = anyOutput?.content.trim() || resolveBuddyReplyText(runDetail).trim();
  return content || t("buddy.emptyReply");
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
  syncVirtualCursorAfterViewportResize();
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
  syncBuddyRunDetailDisplay,
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
  executeVirtualOperationRequest,
  handleBuddyVirtualUiOperationEvent,
  interruptVirtualOperation,
} = useBuddyVirtualOperationExecutor({
  activeRunId,
  activeSessionId,
  activeVirtualOperationToken,
  buildPageOperationRuntimeContext,
  buildTriggeredForegroundRunFact,
  debugBridge: {
    beginVirtualOperationRunAttribution: (operationPlan) => buddyMascotDebugStore.beginVirtualOperationRunAttribution(operationPlan),
    recordVirtualOperationTriggeredRun: (triggeredRun) => buddyMascotDebugStore.recordVirtualOperationTriggeredRun(triggeredRun),
    requestVirtualOperation: (operationPlan) => buddyMascotDebugStore.requestVirtualOperation(operationPlan),
    resolveVirtualOperationTriggeredRun: (operationRequestId) => buddyMascotDebugStore.resolveVirtualOperationTriggeredRun(operationRequestId),
    setVirtualCursorEnabled: (enabled) => buddyMascotDebugStore.setVirtualCursorEnabled(enabled),
  },
  executeBuddyVirtualGraphEditOperation,
  finishAutoResumedPageOperationRun,
  finishVirtualOperation,
  beginBackgroundVirtualOperationLifecycle,
  beginVirtualOperationLifecycle,
  ensureVirtualCursorReadyForOperation,
  interruptVirtualOperationLifecycle,
  isVirtualOperationInterrupted,
  moveVirtualCursorToElement,
  promoteBackgroundTemplateRunResultToBuddyReply,
  recordVirtualOperationRetry,
  buildVirtualOperationRetryRecord,
  replaceVirtualText,
  resetPausedBuddyPause,
  resolveBuddyRunControllerMessageId,
  routePath: computed(() => route.fullPath),
  stopBuddyIdleAnimation,
  syncBackgroundTemplateRunDisplay,
  t,
  virtualCursorDragging,
  waitForFrontendObservation,
  waitForVirtualOperation,
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
  startBuddyBoundRunTemplate,
} = useBuddyBoundRunTemplate({
  buddyMode,
  buddyModelRef,
  buildPageOperationRuntimeContext,
});

const {
  startBuddyVisibleRunTemplateEffects,
  abortBuddyVisibleRunTemplateEffects,
} = useBuddyVisibleRunTemplateEffects({
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
