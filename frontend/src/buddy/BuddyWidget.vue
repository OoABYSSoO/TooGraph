<template>
  <div class="buddy-widget" aria-live="polite">
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
            <div class="buddy-widget__history-control">
              <button
                type="button"
                class="buddy-widget__icon-button"
                :class="{ 'buddy-widget__icon-button--active': isSessionPanelOpen }"
                :title="t('buddy.history')"
                :aria-label="t('buddy.history')"
                @click="toggleSessionPanel"
              >
                <ElIcon><Clock /></ElIcon>
              </button>
              <aside
                v-if="isSessionPanelOpen"
                class="buddy-widget__sessions-panel"
                :aria-label="t('buddy.history')"
              >
                <div class="buddy-widget__sessions-header">
                  <strong>{{ t("buddy.history") }}</strong>
                </div>
                <p v-if="isSessionLoading" class="buddy-widget__sessions-status">
                  {{ t("buddy.historyLoading") }}
                </p>
                <p v-else-if="chatSessions.length === 0" class="buddy-widget__sessions-status">
                  {{ t("buddy.historyEmpty") }}
                </p>
                <div v-else class="buddy-widget__session-list">
                  <div
                    v-for="session in chatSessions"
                    :key="session.session_id"
                    class="buddy-widget__session-row"
                    :class="{ 'buddy-widget__session-row--active': session.session_id === activeSessionId }"
                  >
                    <button
                      type="button"
                      class="buddy-widget__session-item"
                      :disabled="isSessionSwitchLocked && session.session_id !== activeSessionId"
                      @click="selectChatSession(session.session_id)"
                    >
                      <span>{{ session.title || t("buddy.untitledSession") }}</span>
                      <small>{{ session.last_message_preview || t("buddy.emptySession") }}</small>
                    </button>
                    <ElPopover
                      :visible="isSessionDeleteConfirmOpen(session.session_id)"
                      placement="left"
                      :show-arrow="false"
                      popper-class="buddy-widget__confirm-popover buddy-widget__confirm-popover--delete"
                    >
                      <template #reference>
                        <button
                          type="button"
                          data-session-delete-surface="true"
                          class="buddy-widget__session-delete"
                          :class="{ 'buddy-widget__session-delete--confirm': isSessionDeleteConfirmOpen(session.session_id) }"
                          :disabled="isSessionSwitchLocked"
                          :title="isSessionDeleteConfirmOpen(session.session_id) ? t('buddy.confirmDeleteSession') : t('buddy.deleteSession')"
                          :aria-label="isSessionDeleteConfirmOpen(session.session_id) ? t('buddy.confirmDeleteSession') : t('buddy.deleteSession')"
                          @pointerdown.stop
                          @click.stop="handleSessionDeleteActionClick(session.session_id)"
                        >
                          <ElIcon v-if="isSessionDeleteConfirmOpen(session.session_id)" aria-hidden="true"><Check /></ElIcon>
                          <ElIcon v-else aria-hidden="true"><Delete /></ElIcon>
                        </button>
                      </template>
                      <div class="buddy-widget__confirm-hint buddy-widget__confirm-hint--delete">
                        {{ t("buddy.deleteSessionQuestion") }}
                      </div>
                    </ElPopover>
                  </div>
                </div>
              </aside>
            </div>
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
          <template v-for="message in messages" :key="message.id">
          <article
            v-if="shouldRenderMessage(message)"
            class="buddy-widget__message"
            :class="`buddy-widget__message--${message.role}`"
          >
            <span class="buddy-widget__message-label">
              {{ message.role === "user" ? t("buddy.user") : t("buddy.name") }}
            </span>
            <BuddyPauseCard
              v-if="shouldShowPausedRunCard(message)"
              :run="pausedBuddyRun"
              :busy="pausedBuddyResumeBusy"
              @resume="resumePausedBuddyRun"
              @cancel="cancelPausedBuddyRun"
            />
            <template v-else>
              <div v-if="message.publicOutput" class="buddy-widget__public-output-meta">
                <span
                  v-if="message.publicOutput.durationMs !== null"
                  class="buddy-widget__public-output-duration"
                >
                  {{ formatPublicOutputDuration(message.publicOutput.durationMs) }}
                </span>
                <span
                  v-else-if="message.publicOutput.status === 'streaming'"
                  class="buddy-widget__public-output-duration buddy-widget__public-output-duration--streaming"
                >
                  {{ t("buddy.outputStreaming") }}
                </span>
              </div>
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
              <div
                v-else-if="message.role === 'assistant' && message.content"
                class="buddy-widget__message-bubble buddy-widget__message-markdown"
                v-html="renderBuddyMarkdown(message.content)"
              />
              <p v-else-if="message.role === 'user'" class="buddy-widget__message-bubble">
                {{ message.content }}
              </p>
            </template>
          </article>
          </template>
          <p v-if="errorMessage" class="buddy-widget__error">{{ errorMessage }}</p>
          <p v-if="queuedTurns.length > 0" class="buddy-widget__queue">
            {{ t("buddy.queueStatus", { count: queuedTurns.length }) }}
          </p>
        </div>

        <form class="buddy-widget__form" @submit.prevent="sendMessage">
          <textarea
            v-model="draft"
            class="buddy-widget__input"
            rows="2"
            :placeholder="pausedBuddyRun ? t('buddy.pause.composerLocked') : t('buddy.placeholder')"
            :disabled="Boolean(pausedBuddyRun)"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            type="submit"
            class="buddy-widget__send"
            :disabled="Boolean(pausedBuddyRun) || !draft.trim()"
            :title="t('buddy.send')"
            :aria-label="t('buddy.send')"
          >
            <ElIcon><Promotion /></ElIcon>
          </button>
        </form>
      </section>

      <div v-if="bubbleText && !isPanelOpen" class="buddy-widget__bubble">
        {{ bubbleText }}
      </div>

      <button
        ref="avatarElement"
        type="button"
        class="buddy-widget__avatar"
        :class="{
          'buddy-widget__avatar--roaming': mascotMotion === 'roam',
          'buddy-widget__avatar--hopping': mascotMotion === 'hop',
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
          :look-x="mascotLook.x"
          :look-y="mascotLook.y"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check, Clock, Close, Delete, FullScreen, Plus, Promotion, SemiSelect } from "@element-plus/icons-vue";
import { ElButton, ElInput } from "element-plus";
import { ElIcon, ElOption, ElPopover, ElSelect } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import {
  appendBuddyChatMessage,
  createBuddyChatSession,
  deleteBuddyChatSession,
  fetchBuddyChatMessages,
  fetchBuddyChatSessions,
  fetchBuddyRunTemplateBinding,
} from "../api/buddy.ts";
import { fetchTemplate, runGraph } from "../api/graphs.ts";
import { cancelRun, fetchRun, resumeRun } from "../api/runs.ts";
import { fetchSettings } from "../api/settings.ts";
import { resolveOutputPreviewContent } from "../editor/nodes/outputPreviewContentModel.ts";
import { formatRunDuration } from "../lib/run-display-name.ts";
import { buildRuntimeModelOptions } from "../lib/runtimeModelCatalog.ts";
import { buildRunEventStreamUrl, parseRunEventPayload, shouldPollRunStatus } from "../lib/run-event-stream.ts";
import { buildRunNodeTimingByNodeIdFromRun } from "../lib/runTelemetryProjection.ts";
import { useBuddyContextStore } from "../stores/buddyContext.ts";
import { useBuddyMascotDebugStore } from "../stores/buddyMascotDebug.ts";
import type { BuddyChatMessageRecord, BuddyChatSession } from "../types/buddy.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type { SettingsPayload } from "../types/settings.ts";

import BuddyMascot from "./BuddyMascot.vue";
import BuddyPauseCard from "./BuddyPauseCard.vue";
import type { BuddyMascotDebugAction } from "./buddyMascotDebug.ts";
import { buildBuddyPageContext } from "./buddyPageContext.ts";
import { findLatestRecoverablePausedRunMessage, isRecoverablePausedRunStatus } from "./buddyPausedRunRecovery.ts";
import {
  resolveBuddyComposerDecision,
  shouldHoldBuddyQueueDrain,
} from "./buddyPauseQueuePolicy.ts";
import {
  BUDDY_REVIEW_TEMPLATE_ID,
  BUDDY_MODE_OPTIONS,
  DEFAULT_BUDDY_MODE,
  buildBuddyChatGraph,
  buildBuddyReviewGraph,
  resolveBuddyMode,
  resolveBuddyRunActivityFromRunEvent,
  type BuddyChatMessage,
  type BuddyMode,
} from "./buddyChatGraph.ts";
import {
  buildBuddyPublicOutputBindings,
  createBuddyPublicOutputRuntimeState,
  reduceBuddyPublicOutputEvent,
  resolveBuddyPublicOutputMessageKind,
  type BuddyPublicOutputBinding,
  type BuddyPublicOutputMessage,
  type BuddyPublicOutputRuntimeState,
} from "./buddyPublicOutput.ts";
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

type BuddyMessage = BuddyChatMessage & {
  id: string;
  clientOrder?: number | null;
  activityText?: string;
  runId?: string | null;
  publicOutput?: BuddyPublicOutputMetadata;
};

type BuddyPublicOutputMetadata = {
  outputNodeId: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  displayMode: string;
  kind: "text" | "card";
  durationMs: number | null;
  status: "streaming" | "completed" | "failed";
};

type BuddyMessagePatch = Partial<
  Pick<BuddyMessage, "content" | "includeInContext" | "activityText" | "runId" | "publicOutput">
>;

type BuddyQueuedTurn = {
  userMessageId: string;
  assistantMessageId: string;
  userMessage: string;
  sessionId: string;
  history: BuddyChatMessage[];
};

type BuddyPauseHandlingOptions = {
  persist?: boolean;
};

type BuddyMood = "idle" | "thinking" | "speaking" | "error";
type BuddyMascotMotion = "idle" | "roam" | "hop";
type BuddyMascotFacing = "front" | "left" | "right";
type BuddyModelOption = {
  value: string;
  label: string;
};

const BUDDY_HISTORY_STORAGE_KEY = "toograph:buddy-history";
const BUDDY_ACTIVE_SESSION_STORAGE_KEY = "toograph:buddy-active-session";
const BUDDY_MODEL_STORAGE_KEY = "toograph:buddy-model";
const DRAG_THRESHOLD_PX = 4;
const AVATAR_SINGLE_CLICK_DELAY_MS = 220;
const RUN_POLL_INTERVAL_MS = 700;
const BUDDY_ROAM_MIN_DELAY_MS = 8000;
const BUDDY_ROAM_MAX_DELAY_MS = 18000;
const BUDDY_ROAM_MOVE_DURATION_MS = 980;
const BUDDY_ROAM_STEP_PAUSE_MS = 120;
const BUDDY_ROAM_STEP_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width;
const BUDDY_ROAM_TARGET_MIN_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width;
const BUDDY_ROAM_TARGET_MAX_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width * 3;
const BUDDY_ROAM_TARGET_REACHED_DISTANCE_PX = 1;
const { t } = useI18n();
const route = useRoute();
const buddyContextStore = useBuddyContextStore();
const buddyMascotDebugStore = useBuddyMascotDebugStore();
const { latestRequest: mascotDebugRequest } = storeToRefs(buddyMascotDebugStore);

const viewport = ref(resolveViewport());
const position = ref(resolveDefaultBuddyPosition(viewport.value));
const isPanelOpen = ref(false);
const draft = ref("");
const buddyMode = ref<BuddyMode>(DEFAULT_BUDDY_MODE);
const buddyModelRef = ref("");
const buddyModelOptions = ref<BuddyModelOption[]>([]);
const buddyModelLoadError = ref("");
const messages = ref<BuddyMessage[]>([]);
const chatSessions = ref<BuddyChatSession[]>([]);
const activeSessionId = ref<string | null>(null);
const isSessionPanelOpen = ref(false);
const isSessionLoading = ref(false);
const activeSessionDeleteId = ref<string | null>(null);
const sessionDeleteConfirmTimeoutRef = ref<number | null>(null);
const isPanelFullscreen = ref(false);
const queuedTurns = ref<BuddyQueuedTurn[]>([]);
const errorMessage = ref("");
const mood = ref<BuddyMood>("idle");
const tapNonce = ref(0);
const activeRunId = ref<string | null>(null);
const pausedBuddyRun = ref<RunDetail | null>(null);
const pausedBuddyAssistantMessageId = ref<string | null>(null);
const pausedBuddyResumeBusy = ref(false);
const avatarElement = ref<HTMLElement | null>(null);
const mascotLook = ref({ x: 0, y: 0 });
const mascotMotion = ref<BuddyMascotMotion>("idle");
const mascotFacing = ref<BuddyMascotFacing>("front");
const messageListElement = ref<HTMLElement | null>(null);
const debugDragging = ref(false);
const pointerDrag = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: BuddyPosition;
  moved: boolean;
} | null>(null);

let suppressNextClick = false;
let eventSource: EventSource | null = null;
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
let buddyDebugActionTimerId: number | null = null;
let pendingMascotLookPointer: { x: number; y: number } | null = null;
let chatSessionInitializationPromise: Promise<void> | null = null;
let chatSessionActivationGeneration = 0;
const backgroundReviewAbortControllers = new Set<AbortController>();
let nextBuddyMessageClientOrder = 0;

const isDragging = computed(() => Boolean(pointerDrag.value?.moved));
const isMascotDragging = computed(() => isDragging.value || debugDragging.value);
const canBuddyRoam = computed(() =>
  !isPanelOpen.value &&
  mood.value === "idle" &&
  !isMascotDragging.value &&
  queuedTurns.value.length === 0 &&
  activeRunId.value === null,
);
const isSessionSwitchLocked = computed(
  () =>
    queuedTurns.value.length > 0 ||
    activeRunId.value !== null,
);
const hasCurrentSessionContent = computed(() => messages.value.some((message) => message.content.trim()));
const canCreateNewSession = computed(() => !isSessionSwitchLocked.value && hasCurrentSessionContent.value);
const buddyModeLabel = computed(() => {
  const option = BUDDY_MODE_OPTIONS.find((candidate) => candidate.value === buddyMode.value);
  return option ? `${t(option.labelKey)} - ${t(option.descriptionKey)}` : t("buddy.modes.askFirst");
});
const buddyModelLabel = computed(() => {
  const option = buddyModelOptions.value.find((candidate) => candidate.value === buddyModelRef.value);
  if (option) {
    return `${t("buddy.modelLabel")} - ${option.label}`;
  }
  return buddyModelLoadError.value || t("buddy.modelUnavailable");
});
const buddyModelPlaceholder = computed(() =>
  buddyModelLoadError.value ? t("buddy.modelLoadFailed") : t("buddy.modelLoading"),
);
const anchorStyle = computed(() => ({
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
  const latestBuddyMessage = [...messages.value].reverse().find((message) => message.role === "assistant" && message.content.trim());
  return latestBuddyMessage?.content.trim().slice(0, 84) || t("buddy.readyBubble");
});

onMounted(() => {
  hydratePosition();
  chatSessionInitializationPromise = initializeBuddyChatSessions().finally(() => {
    chatSessionInitializationPromise = null;
  });
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
  queuedTurns.value = [];
  clearSessionDeleteConfirmTimeout();
  clearAvatarSingleClickTimer();
  clearSpeakingIdleTimer();
  clearBuddyDebugActionTimer();
  cancelBuddyRoamTimers();
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

watch(buddyModelRef, (nextModel) => {
  const normalized = nextModel.trim();
  if (normalized) {
    window.localStorage.setItem(BUDDY_MODEL_STORAGE_KEY, normalized);
    return;
  }
  window.localStorage.removeItem(BUDDY_MODEL_STORAGE_KEY);
});

watch(canBuddyRoam, (canRoam) => {
  if (canRoam) {
    scheduleBuddyRoam();
    return;
  }
  cancelBuddyRoamTimers();
});

watch(mascotDebugRequest, (request) => {
  if (!request) {
    return;
  }
  triggerMascotDebugAction(request.action);
});

function handleAvatarClick() {
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

function togglePanelFullscreen() {
  isPanelFullscreen.value = !isPanelFullscreen.value;
  isSessionPanelOpen.value = false;
  clearSessionDeleteConfirmState();
}

function toggleSessionPanel() {
  isSessionPanelOpen.value = !isSessionPanelOpen.value;
  clearSessionDeleteConfirmState();
}

function handleBuddyModelSelectVisibleChange(visible: boolean) {
  if (visible) {
    void loadBuddyModelOptions();
  }
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

function handleMascotLookPointerMove(event: PointerEvent) {
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
    runBuddyIdleRoam,
    randomBetween(BUDDY_ROAM_MIN_DELAY_MS, BUDDY_ROAM_MAX_DELAY_MS),
  );
}

function runBuddyIdleRoam() {
  buddyRoamTimerId = null;
  if (!canBuddyRoam.value) {
    return;
  }
  buddyRoamSequenceId += 1;
  buddyRoamTargetPosition = resolveBuddyRoamTargetPosition();
  runBuddyRoamStep(buddyRoamSequenceId);
}

function runBuddyRoamStep(sequenceId: number) {
  if (sequenceId !== buddyRoamSequenceId) {
    return;
  }
  const targetPosition = buddyRoamTargetPosition;
  if (!canBuddyRoam.value || targetPosition === null) {
    finishBuddyRoamSequence(false);
    return;
  }

  const nextPosition = resolveBuddyRoamStepPosition(position.value, targetPosition);
  mascotFacing.value = resolveBuddyRoamFacing(nextPosition.x - position.value.x);
  mascotMotion.value = "roam";
  position.value = nextPosition;
  buddyRoamMotionTimerId = window.setTimeout(() => {
    if (sequenceId !== buddyRoamSequenceId) {
      return;
    }
    buddyRoamMotionTimerId = null;
    mascotMotion.value = "idle";
    if (!canBuddyRoam.value) {
      finishBuddyRoamSequence(false);
      return;
    }
    if (isBuddyRoamTargetReached(position.value, targetPosition)) {
      finishBuddyRoamSequence(true);
      return;
    }
    buddyRoamStepTimerId = window.setTimeout(() => {
      buddyRoamStepTimerId = null;
      runBuddyRoamStep(sequenceId);
    }, BUDDY_ROAM_STEP_PAUSE_MS);
  }, BUDDY_ROAM_MOVE_DURATION_MS);
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

function playMascotDebugMotion(motion: BuddyMascotMotion, durationMs: number, facing: BuddyMascotFacing) {
  mood.value = "idle";
  mascotFacing.value = facing;
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
      playMascotDebugMotion("hop", 760, "front");
      break;
    case "roam":
      playMascotDebugMotion("roam", BUDDY_ROAM_MOVE_DURATION_MS, "right");
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

async function sendMessage() {
  const composerDecision = resolveBuddyComposerDecision({
    draftText: draft.value,
    hasPausedRun: Boolean(pausedBuddyRun.value),
    isResumeBusy: pausedBuddyResumeBusy.value,
  });
  if (composerDecision.kind === "ignore_empty" || composerDecision.kind === "ignore_resume_busy") {
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
  if (composerDecision.kind === "route_to_pause_card") {
    errorMessage.value = t("buddy.pause.useCard");
    await scrollPausedBuddyCardIntoView();
    return;
  }

  draft.value = "";

  const userEntry = createMessage("user", userMessage, undefined, allocateBuddyMessageClientOrder());
  const assistantEntry = createMessage("assistant", "", undefined, allocateBuddyMessageClientOrder());
  messages.value.push(userEntry, assistantEntry);
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
  let keepRunPaused = false;
  mood.value = "thinking";
  setAssistantActivityText(assistantMessage.id, t("buddy.activity.preparing"));
  await scrollMessagesToBottom();

  try {
    activeAbortController = new AbortController();
    const binding = await fetchBuddyRunTemplateBinding();
    const template = await fetchTemplate(binding.template_id);
    const graph = buildBuddyChatGraph(
      template,
      {
        userMessage: turn.userMessage,
        history,
        pageContext: buildPageContext(),
        buddyMode: buddyMode.value,
        buddyModel: buddyModelRef.value,
      },
      binding,
    );
    setAssistantActivityText(assistantMessage.id, t("buddy.activity.starting"));
    const run = await runGraph(graph);
    activeRunId.value = run.run_id;
    const publicOutputBindings = buildBuddyPublicOutputBindings(graph);
    startRunEventStream(run.run_id, assistantMessage.id, graph, publicOutputBindings);
    const runDetail = await pollRunUntilFinished(run.run_id, activeAbortController.signal);
    if (runDetail.status === "awaiting_human") {
      keepRunPaused = true;
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
    updateAssistantMessage(assistantMessage.id, t("buddy.errorReply", { error: message }), { includeInContext: false });
    void persistBuddyMessage(turn.sessionId, messages.value.find((entry) => entry.id === assistantMessage.id), {
      includeInContext: false,
    });
  } finally {
    closeEventSource();
    if (!keepRunPaused) {
      activeRunId.value = null;
    }
    activeAbortController = null;
    scheduleBuddySpeakingIdleIfNeeded();
    if (keepRunPaused) {
      await scrollPausedBuddyCardIntoView();
    } else {
      await scrollMessagesToBottom();
    }
  }
}

async function resumePausedBuddyRun(resumePayloadOverride: Record<string, unknown> | null = null) {
  const run = pausedBuddyRun.value;
  const assistantMessageId = pausedBuddyAssistantMessageId.value;
  const sessionId = activeSessionId.value;
  if (!run || !assistantMessageId || !sessionId || pausedBuddyResumeBusy.value) {
    return;
  }

  clearSpeakingIdleTimer();
  errorMessage.value = "";
  mood.value = "thinking";
  pausedBuddyResumeBusy.value = true;
  setAssistantActivityText(assistantMessageId, t("buddy.activity.resuming"));

  try {
    const resumePayload = resumePayloadOverride ?? {};
    activeAbortController = new AbortController();
    const response = await resumeRun(run.run_id, resumePayload);
    activeRunId.value = response.run_id;
    resetPausedBuddyPause();
    const graph = run.graph_snapshot as unknown as GraphPayload;
    startRunEventStream(response.run_id, assistantMessageId, graph, buildBuddyPublicOutputBindings(graph));
    const resumedRunDetail = await pollRunUntilFinished(response.run_id, activeAbortController.signal);
    if (resumedRunDetail.status === "awaiting_human") {
      handleBuddyRunAwaitingHuman(resumedRunDetail, assistantMessageId, { persist: true });
      return;
    }
    finishBuddyVisibleRun(resumedRunDetail, assistantMessageId, sessionId, response.run_id);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    mood.value = "error";
    const message = error instanceof Error ? error.message : t("buddy.runFailed");
    errorMessage.value = message;
  } finally {
    pausedBuddyResumeBusy.value = false;
    closeEventSource();
    if (!pausedBuddyRun.value) {
      activeRunId.value = null;
    }
    activeAbortController = null;
    scheduleBuddySpeakingIdleIfNeeded();
    if (pausedBuddyRun.value) {
      await scrollPausedBuddyCardIntoView();
    } else {
      await scrollMessagesToBottom();
    }
  }
}

async function cancelPausedBuddyRun() {
  const run = pausedBuddyRun.value;
  const assistantMessageId = pausedBuddyAssistantMessageId.value;
  const sessionId = activeSessionId.value;
  if (!run || !assistantMessageId || !sessionId || pausedBuddyResumeBusy.value) {
    return;
  }

  clearSpeakingIdleTimer();
  errorMessage.value = "";
  mood.value = "thinking";
  pausedBuddyResumeBusy.value = true;
  setAssistantActivityText(assistantMessageId, t("buddy.activity.cancelling"));

  try {
    await cancelRun(run.run_id, t("buddy.pause.cancelReason"));
    updateAssistantMessage(assistantMessageId, t("buddy.pause.cancelledReply"), {
      includeInContext: false,
      runId: run.run_id,
    });
    void persistBuddyMessage(sessionId, messages.value.find((message) => message.id === assistantMessageId), {
      runId: run.run_id,
      includeInContext: false,
    });
    resetPausedBuddyPause();
    closeEventSource();
    activeRunId.value = null;
    mood.value = "idle";
  } catch (error) {
    mood.value = "error";
    const message = error instanceof Error ? error.message : t("buddy.runFailed");
    errorMessage.value = message;
  } finally {
    pausedBuddyResumeBusy.value = false;
    activeAbortController = null;
    scheduleBuddySpeakingIdleIfNeeded();
    if (pausedBuddyRun.value) {
      await scrollPausedBuddyCardIntoView();
    } else {
      await scrollMessagesToBottom();
    }
  }
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
  updateAssistantMessage(assistantMessageId, t("buddy.pause.persistedReply"), {
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

function finishBuddyVisibleRun(runDetail: RunDetail, assistantMessageId: string, sessionId: string, runId: string) {
  const graph = runDetail.graph_snapshot as unknown as GraphPayload;
  const publicOutputBindings = buildBuddyPublicOutputBindings(graph);
  const outputState = buildPublicOutputRuntimeStateFromRunDetail(runDetail, publicOutputBindings, graph);
  const publicOutputMessages = upsertPublicOutputMessages(assistantMessageId, runId, outputState);
  const includeReplyInContext = runDetail.status === "completed";
  const assistantMessage = messages.value.find((message) => message.id === assistantMessageId);
  if (assistantMessage) {
    assistantMessage.runId = runId;
    assistantMessage.activityText = "";
    assistantMessage.includeInContext = false;
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

async function startBuddyAutonomousReviewRun(mainRun: RunDetail) {
  if (mainRun.status !== "completed") {
    return;
  }
  try {
    const template = await fetchTemplate(BUDDY_REVIEW_TEMPLATE_ID);
    const graph = buildBuddyReviewGraph(template, {
      mainRun,
      buddyModel: buddyModelRef.value,
    });
    const reviewRun = await runGraph(graph);
    void pollBuddyAutonomousReviewRun(reviewRun.run_id);
  } catch (error) {
    console.warn("[Buddy] Background autonomous review failed to start.", error);
  }
}

async function pollBuddyAutonomousReviewRun(runId: string) {
  const controller = new AbortController();
  backgroundReviewAbortControllers.add(controller);
  try {
    const run = await pollRunUntilFinished(runId, controller.signal);
    if (run.status === "completed") {
      buddyContextStore.notifyBuddyDataChanged();
    } else if (run.status === "failed") {
      console.warn("[Buddy] Background autonomous review failed.", run.errors);
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.warn("[Buddy] Background autonomous review polling failed.", error);
    }
  } finally {
    backgroundReviewAbortControllers.delete(controller);
  }
}

function abortBackgroundReviewRuns() {
  for (const controller of backgroundReviewAbortControllers) {
    controller.abort();
  }
  backgroundReviewAbortControllers.clear();
}

async function clearMessages() {
  queuedTurns.value = [];
  clearSpeakingIdleTimer();
  closeEventSource();
  activeAbortController?.abort();
  activeAbortController = null;
  activeRunId.value = null;
  resetPausedBuddyPause();
  const sessionId = activeSessionId.value;
  messages.value = [];
  nextBuddyMessageClientOrder = 0;
  errorMessage.value = "";
  mood.value = "idle";
  window.localStorage.removeItem(BUDDY_HISTORY_STORAGE_KEY);
  if (!sessionId) {
    window.localStorage.removeItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY);
    return;
  }
  try {
    await deleteBuddyChatSession(sessionId);
    chatSessions.value = chatSessions.value.filter((session) => session.session_id !== sessionId);
    const nextSession = chatSessions.value[0];
    if (nextSession) {
      await activateChatSession(nextSession.session_id);
    } else {
      activeSessionId.value = null;
      window.localStorage.removeItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY);
    }
    await loadChatSessions();
  } catch (error) {
    errorMessage.value = t("buddy.historyDeleteFailed", { error: formatErrorMessage(error) });
  }
}

async function initializeBuddyChatSessions() {
  isSessionLoading.value = true;
  try {
    await loadChatSessions();
    const storedSessionId = window.localStorage.getItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY)?.trim();
    const targetSession =
      chatSessions.value.find((session) => session.session_id === storedSessionId) ?? chatSessions.value[0] ?? null;
    if (targetSession) {
      await activateChatSession(targetSession.session_id, { skipInitializationWait: true });
      return;
    }
    await migrateLegacyBuddyHistory();
  } catch (error) {
    errorMessage.value = t("buddy.historyLoadFailed", { error: formatErrorMessage(error) });
    messages.value = readLegacyBuddyMessages();
  } finally {
    isSessionLoading.value = false;
  }
}

async function loadChatSessions() {
  chatSessions.value = await fetchBuddyChatSessions();
}

async function ensureActiveChatSession(): Promise<string | null> {
  if (activeSessionId.value) {
    return activeSessionId.value;
  }
  try {
    const session = await createBuddyChatSession();
    chatSessions.value = [session, ...chatSessions.value.filter((item) => item.session_id !== session.session_id)];
    activeSessionId.value = session.session_id;
    window.localStorage.setItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY, session.session_id);
    return session.session_id;
  } catch (error) {
    errorMessage.value = t("buddy.historyCreateFailed", { error: formatErrorMessage(error) });
    return null;
  }
}

async function createNewSession() {
  if (!canCreateNewSession.value) {
    return;
  }
  await waitForChatSessionInitialization();
  errorMessage.value = "";
  try {
    const session = await createBuddyChatSession();
    chatSessions.value = [session, ...chatSessions.value.filter((item) => item.session_id !== session.session_id)];
    await activateChatSession(session.session_id);
    isSessionPanelOpen.value = false;
    clearSessionDeleteConfirmState();
  } catch (error) {
    errorMessage.value = t("buddy.historyCreateFailed", { error: formatErrorMessage(error) });
  }
}

async function selectChatSession(sessionId: string) {
  await activateChatSession(sessionId);
  isSessionPanelOpen.value = false;
  clearSessionDeleteConfirmState();
}

async function activateChatSession(sessionId: string, options: { skipInitializationWait?: boolean } = {}) {
  if (isSessionSwitchLocked.value && sessionId !== activeSessionId.value) {
    return;
  }
  if (!options.skipInitializationWait) {
    await waitForChatSessionInitialization();
  }
  const activationGeneration = ++chatSessionActivationGeneration;
  isSessionLoading.value = true;
  errorMessage.value = "";
  try {
    const records = await fetchBuddyChatMessages(sessionId);
    activeSessionId.value = sessionId;
    window.localStorage.setItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY, sessionId);
    messages.value = records.map(messageRecordToBuddyMessage);
    resetNextBuddyMessageClientOrder();
    resetVisibleBuddyRunState();
    await recoverPausedBuddyRunFromLoadedMessages(sessionId, activationGeneration);
    await scrollMessagesToBottom();
  } catch (error) {
    errorMessage.value = t("buddy.historyLoadFailed", { error: formatErrorMessage(error) });
  } finally {
    isSessionLoading.value = false;
  }
}

function isCurrentChatSessionActivation(sessionId: string, activationGeneration: number) {
  return activeSessionId.value === sessionId && chatSessionActivationGeneration === activationGeneration;
}

async function recoverPausedBuddyRunFromLoadedMessages(sessionId: string, activationGeneration: number) {
  const candidate = findLatestRecoverablePausedRunMessage(messages.value);
  if (!candidate) {
    return;
  }

  try {
    const run = await fetchRun(candidate.runId);
    if (!isCurrentChatSessionActivation(sessionId, activationGeneration)) {
      return;
    }
    if (!isRecoverablePausedRunStatus(run.status)) {
      return;
    }
    handleBuddyRunAwaitingHuman(run, candidate.messageId);
    await scrollPausedBuddyCardIntoView();
  } catch (error) {
    if (isCurrentChatSessionActivation(sessionId, activationGeneration)) {
      errorMessage.value = t("buddy.pause.recoveryFailed", { error: formatErrorMessage(error) });
    }
  }
}

async function deleteSession(sessionId: string) {
  if (isSessionSwitchLocked.value) {
    return;
  }
  clearSessionDeleteConfirmState();
  await waitForChatSessionInitialization();
  errorMessage.value = "";
  try {
    await deleteBuddyChatSession(sessionId);
    chatSessions.value = chatSessions.value.filter((session) => session.session_id !== sessionId);
    if (sessionId === activeSessionId.value) {
      const nextSession = chatSessions.value[0];
      if (nextSession) {
        await activateChatSession(nextSession.session_id);
      } else {
        activeSessionId.value = null;
        messages.value = [];
        resetVisibleBuddyRunState();
        window.localStorage.removeItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY);
      }
    }
    await loadChatSessions();
  } catch (error) {
    errorMessage.value = t("buddy.historyDeleteFailed", { error: formatErrorMessage(error) });
  }
}

function isSessionDeleteConfirmOpen(sessionId: string) {
  return activeSessionDeleteId.value === sessionId;
}

function clearSessionDeleteConfirmTimeout() {
  if (sessionDeleteConfirmTimeoutRef.value !== null) {
    window.clearTimeout(sessionDeleteConfirmTimeoutRef.value);
    sessionDeleteConfirmTimeoutRef.value = null;
  }
}

function clearSessionDeleteConfirmState() {
  clearSessionDeleteConfirmTimeout();
  activeSessionDeleteId.value = null;
}

function startSessionDeleteConfirmWindow(sessionId: string) {
  clearSessionDeleteConfirmTimeout();
  activeSessionDeleteId.value = sessionId;
  sessionDeleteConfirmTimeoutRef.value = window.setTimeout(() => {
    sessionDeleteConfirmTimeoutRef.value = null;
    if (activeSessionDeleteId.value === sessionId) {
      activeSessionDeleteId.value = null;
    }
  }, 2000);
}

function handleSessionDeleteActionClick(sessionId: string) {
  if (isSessionSwitchLocked.value) {
    return;
  }
  if (activeSessionDeleteId.value === sessionId) {
    void deleteSession(sessionId);
    return;
  }
  startSessionDeleteConfirmWindow(sessionId);
}

async function persistBuddyMessage(
  sessionId: string,
  message: BuddyMessage | undefined,
  options: { runId?: string | null; includeInContext?: boolean } = {},
) {
  if (!message || !message.content.trim()) {
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
    });
    await loadChatSessions();
  } catch (error) {
    errorMessage.value = t("buddy.historySaveFailed", { error: formatErrorMessage(error) });
  }
}

async function migrateLegacyBuddyHistory() {
  const legacyMessages = readLegacyBuddyMessages();
  if (legacyMessages.length === 0) {
    messages.value = [];
    nextBuddyMessageClientOrder = 0;
    return;
  }
  const firstUserMessage = legacyMessages.find((message) => message.role === "user" && message.content.trim());
  const session = await createBuddyChatSession({ title: firstUserMessage?.content.trim() || undefined });
  activeSessionId.value = session.session_id;
  messages.value = legacyMessages;
  resetNextBuddyMessageClientOrder();
  window.localStorage.setItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY, session.session_id);
  for (const message of legacyMessages) {
    await appendBuddyChatMessage(session.session_id, {
      message_id: message.id,
      role: message.role,
      content: message.content,
      client_order: message.clientOrder ?? null,
      include_in_context: message.includeInContext !== false,
    });
  }
  window.localStorage.removeItem(BUDDY_HISTORY_STORAGE_KEY);
  await loadChatSessions();
}

function resetVisibleBuddyRunState() {
  resetPausedBuddyPause();
}

function resetPausedBuddyPause() {
  pausedBuddyRun.value = null;
  pausedBuddyAssistantMessageId.value = null;
  pausedBuddyResumeBusy.value = false;
}

async function waitForChatSessionInitialization() {
  if (chatSessionInitializationPromise) {
    await chatSessionInitializationPromise;
  }
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

function readLegacyBuddyMessages(): BuddyMessage[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BUDDY_HISTORY_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isPersistedMessage)
      .slice(-24)
      .map((message, index) => ({
        ...createMessage(message.role, message.content, undefined, index),
        includeInContext: message.includeInContext,
      }));
  } catch {
    return [];
  }
}

function hydrateBuddyModel() {
  buddyModelRef.value = window.localStorage.getItem(BUDDY_MODEL_STORAGE_KEY)?.trim() ?? "";
}

async function loadBuddyModelOptions() {
  buddyModelLoadError.value = "";
  try {
    const settings = await fetchSettings();
    const options = buildBuddyModelOptions(settings);
    buddyModelOptions.value = options;
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.value === buddyModelRef.value)) {
      buddyModelRef.value = options[0].value;
    }
  } catch (error) {
    buddyModelLoadError.value = error instanceof Error ? error.message : t("buddy.modelLoadFailed");
  }
}

function handleResize() {
  viewport.value = resolveViewport();
  position.value = clampBuddyPosition(position.value, viewport.value, DEFAULT_BUDDY_SIZE, DEFAULT_BUDDY_MARGIN);
  persistPosition();
}

function persistPosition() {
  window.localStorage.setItem(BUDDY_POSITION_STORAGE_KEY, serializeBuddyPosition(position.value));
}

function startRunEventStream(
  runId: string,
  assistantMessageId: string,
  graph: GraphPayload,
  publicOutputBindings: BuddyPublicOutputBinding[],
) {
  closeEventSource();
  const streamUrl = buildRunEventStreamUrl(runId);
  if (!streamUrl || typeof EventSource === "undefined") {
    return;
  }

  let publicOutputState = createBuddyPublicOutputRuntimeState();
  eventSource = new EventSource(streamUrl);
  const handleStreamingEvent = (eventType: string, event: Event) => {
    const payload = parseRunEventPayload(event);
    if (!payload) {
      return;
    }
    publicOutputState = reduceBuddyPublicOutputEvent(
      publicOutputState,
      publicOutputBindings,
      eventType,
      payload,
      nowPublicOutputMs(),
    );
    const publicOutputMessages = upsertPublicOutputMessages(assistantMessageId, runId, publicOutputState);
    if (publicOutputMessages.length > 0) {
      mood.value = "speaking";
      const controllerMessage = messages.value.find((message) => message.id === assistantMessageId);
      if (controllerMessage) {
        controllerMessage.activityText = "";
        controllerMessage.runId = runId;
        controllerMessage.includeInContext = false;
      }
      void scrollMessagesToBottom();
    }
    setAssistantActivityFromRunEvent(assistantMessageId, eventType, payload, graph);
  };
  eventSource.addEventListener("node.started", (event) => handleStreamingEvent("node.started", event));
  eventSource.addEventListener("node.output.delta", (event) => handleStreamingEvent("node.output.delta", event));
  eventSource.addEventListener("node.output.completed", (event) => handleStreamingEvent("node.output.completed", event));
  eventSource.addEventListener("state.updated", (event) => handleStreamingEvent("state.updated", event));
  eventSource.addEventListener("activity.event", (event) => handleStreamingEvent("activity.event", event));
  eventSource.addEventListener("node.completed", (event) => handleStreamingEvent("node.completed", event));
  eventSource.addEventListener("node.failed", (event) => handleStreamingEvent("node.failed", event));
  eventSource.addEventListener("run.completed", closeEventSource);
  eventSource.addEventListener("run.failed", closeEventSource);
  eventSource.addEventListener("run.cancelled", closeEventSource);
  eventSource.onerror = closeEventSource;
}

async function pollRunUntilFinished(runId: string, signal: AbortSignal): Promise<RunDetail> {
  while (true) {
    const run = await fetchRun(runId, { signal });
    if (!shouldPollRunStatus(run.status)) {
      return run;
    }
    await delay(RUN_POLL_INTERVAL_MS, signal);
  }
}

function closeEventSource() {
  eventSource?.close();
  eventSource = null;
}

function shouldRenderMessage(message: BuddyMessage) {
  return (
    message.role === "user" ||
    Boolean(message.content.trim()) ||
    shouldShowPausedRunCard(message)
  );
}

function shouldShowPausedRunCard(message: BuddyMessage) {
  return (
    message.role === "assistant" &&
    pausedBuddyRun.value?.status === "awaiting_human" &&
    pausedBuddyAssistantMessageId.value === message.id
  );
}

function upsertPublicOutputMessages(
  controllerMessageId: string,
  runId: string,
  outputState: BuddyPublicOutputRuntimeState,
) {
  const upsertedMessages: BuddyMessage[] = [];
  for (const outputNodeId of outputState.order) {
    const output = outputState.messagesByOutputNodeId[outputNodeId];
    if (!output) {
      continue;
    }
    const messageId = buildPublicOutputMessageId(controllerMessageId, outputNodeId);
    const content = renderPublicOutputContentForStorage(output);
    const publicOutput = toBuddyPublicOutputMetadata(output);
    const existing = messages.value.find((message) => message.id === messageId);
    if (existing) {
      existing.content = content;
      existing.publicOutput = publicOutput;
      existing.runId = runId;
      existing.includeInContext = publicOutput.kind === "text" && publicOutput.status === "completed";
      upsertedMessages.push(existing);
      continue;
    }
    const nextMessage = {
      ...createMessage("assistant", content, messageId, allocateBuddyMessageClientOrder()),
      includeInContext: publicOutput.kind === "text" && publicOutput.status === "completed",
      runId,
      publicOutput,
    };
    messages.value.splice(resolvePublicOutputInsertionIndex(controllerMessageId), 0, nextMessage);
    upsertedMessages.push(nextMessage);
  }
  return upsertedMessages;
}

function buildPublicOutputMessageId(controllerMessageId: string, outputNodeId: string) {
  return `${controllerMessageId}:output:${outputNodeId}`;
}

function resolvePublicOutputInsertionIndex(controllerMessageId: string) {
  const outputPrefix = `${controllerMessageId}:output:`;
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    if (messages.value[index]?.id.startsWith(outputPrefix)) {
      return index + 1;
    }
  }
  const controllerIndex = messages.value.findIndex((message) => message.id === controllerMessageId);
  return controllerIndex >= 0 ? controllerIndex + 1 : messages.value.length;
}

function toBuddyPublicOutputMetadata(output: BuddyPublicOutputMessage): BuddyPublicOutputMetadata {
  return {
    outputNodeId: output.outputNodeId,
    stateKey: output.stateKey,
    stateName: output.stateName,
    stateType: output.stateType,
    displayMode: output.displayMode,
    kind: output.kind,
    durationMs: output.durationMs,
    status: output.status,
  };
}

function renderPublicOutputContentForStorage(output: BuddyPublicOutputMessage) {
  if (output.kind === "text") {
    return stringifyPublicOutputContent(output.content);
  }
  return stringifyPublicOutputContent(output.content);
}

function buildPublicOutputRuntimeStateFromRunDetail(
  runDetail: RunDetail,
  bindings: BuddyPublicOutputBinding[],
  graph: GraphPayload,
): BuddyPublicOutputRuntimeState {
  const outputState = createBuddyPublicOutputRuntimeState();
  const seenOutputNodeIds = new Set<string>();
  const outputTimingByNodeId = buildRunNodeTimingByNodeIdFromRun(
    {
      node_executions: runDetail.node_executions,
      artifacts: { state_events: runDetail.artifacts?.state_events ?? [] },
    },
    graph,
  );
  for (const preview of listRunDetailOutputPreviews(runDetail)) {
    const binding = findPublicOutputBindingForPreview(bindings, preview.node_id, preview.source_key);
    if (!binding || seenOutputNodeIds.has(binding.outputNodeId)) {
      continue;
    }
    seenOutputNodeIds.add(binding.outputNodeId);
    const timing = outputTimingByNodeId[binding.outputNodeId] ?? null;
    outputState.order.push(binding.outputNodeId);
    outputState.messagesByOutputNodeId[binding.outputNodeId] = {
      outputNodeId: binding.outputNodeId,
      outputNodeName: binding.outputNodeName,
      stateKey: binding.stateKey,
      stateName: binding.stateName,
      stateType: binding.stateType,
      displayMode: binding.displayMode,
      kind: resolveBuddyPublicOutputMessageKind(binding),
      content: preview.value,
      startedAtMs: timing?.startedAtEpochMs ?? null,
      durationMs: timing?.durationMs ?? null,
      status: runDetail.status === "failed" ? "failed" : "completed",
    };
  }
  return outputState;
}

function listRunDetailOutputPreviews(runDetail: RunDetail) {
  return [...(runDetail.output_previews ?? []), ...(runDetail.artifacts?.output_previews ?? [])];
}

function findPublicOutputBindingForPreview(
  bindings: BuddyPublicOutputBinding[],
  nodeId: string | null | undefined,
  sourceKey: string | null | undefined,
) {
  const normalizedNodeId = typeof nodeId === "string" ? nodeId.trim() : "";
  const normalizedSourceKey = typeof sourceKey === "string" ? sourceKey.trim() : "";
  return bindings.find(
    (binding) =>
      (normalizedNodeId && binding.outputNodeId === normalizedNodeId) ||
      (normalizedSourceKey && binding.stateKey === normalizedSourceKey),
  );
}

function nowPublicOutputMs() {
  return Date.now();
}

function formatPublicOutputDuration(durationMs: number | null | undefined) {
  return t("buddy.outputDuration", { duration: formatRunDuration(durationMs ?? undefined, { secondsFractionDigits: 2 }) });
}

function formatPublicOutputCardContent(content: string) {
  return content.trim() || t("buddy.emptyReply");
}

function stringifyPublicOutputContent(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderBuddyMarkdown(content: string) {
  return resolveOutputPreviewContent(content, "markdown").html;
}

function updateAssistantMessage(messageId: string, content: string, patch: BuddyMessagePatch = {}) {
  const target = messages.value.find((message) => message.id === messageId);
  if (!target) {
    return;
  }
  target.content = content;
  if (content.trim()) {
    target.activityText = "";
  }
  Object.assign(target, patch);
}

function setAssistantActivityText(messageId: string, activityText: string) {
  const target = messages.value.find((message) => message.id === messageId);
  if (!target || target.content.trim()) {
    return;
  }
  target.activityText = activityText;
  void scrollMessagesToBottom();
}

function setAssistantActivityFromRunEvent(
  assistantMessageId: string,
  eventType: string,
  payload: Record<string, unknown>,
  graph: GraphPayload,
) {
  const activity = resolveBuddyRunActivityFromRunEvent(eventType, payload, graph);
  if (!activity) {
    return;
  }
  setAssistantActivityText(assistantMessageId, t(activity.labelKey, activity.params));
}

function buildHistoryBeforeMessage(messageId: string): BuddyChatMessage[] {
  const messageIndex = messages.value.findIndex((message) => message.id === messageId);
  const previousMessages = messageIndex >= 0 ? messages.value.slice(0, messageIndex) : messages.value;
  return previousMessages.filter(isContextMessage).map(({ role, content }) => ({ role, content }));
}

function ensureAssistantMessageForTurn(turn: BuddyQueuedTurn): BuddyMessage {
  const existingMessage = messages.value.find(
    (message) => message.id === turn.assistantMessageId && message.role === "assistant",
  );
  if (existingMessage) {
    return existingMessage;
  }
  const assistantMessage = createMessage(
    "assistant",
    "",
    turn.assistantMessageId,
    allocateBuddyMessageClientOrder(),
  );
  const userMessageIndex = messages.value.findIndex((message) => message.id === turn.userMessageId);
  if (userMessageIndex >= 0 && userMessageIndex < messages.value.length - 1) {
    messages.value.splice(userMessageIndex + 1, 0, assistantMessage);
    return assistantMessage;
  }
  messages.value.push(assistantMessage);
  return assistantMessage;
}

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

async function scrollMessagesToBottom() {
  await nextTick();
  const element = messageListElement.value;
  if (!element) {
    return;
  }
  element.scrollTop = element.scrollHeight;
}

async function scrollPausedBuddyCardIntoView() {
  await nextTick();
  const listElement = messageListElement.value;
  const pauseCardElement = listElement?.querySelector<HTMLElement>(".buddy-widget__pause-card");
  if (!listElement || !pauseCardElement) {
    return;
  }
  const listRect = listElement.getBoundingClientRect();
  const cardRect = pauseCardElement.getBoundingClientRect();
  listElement.scrollTop = Math.max(0, listElement.scrollTop + cardRect.top - listRect.top - 12);
}

function buildPageContext() {
  return buildBuddyPageContext({
    routePath: route.fullPath,
    editor: buddyContextStore.editorSnapshot,
    activeBuddyRunId: activeRunId.value,
  });
}

function createMessage(
  role: BuddyChatMessage["role"],
  content: string,
  id?: string,
  clientOrder: number | null = null,
): BuddyMessage {
  return {
    id: id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    clientOrder,
    activityText: "",
  };
}

function messageRecordToBuddyMessage(record: BuddyChatMessageRecord): BuddyMessage {
  return {
    id: record.message_id,
    role: record.role,
    content: record.content,
    clientOrder: record.client_order,
    includeInContext: record.include_in_context,
    runId: record.run_id,
    activityText: "",
  };
}

function allocateBuddyMessageClientOrder() {
  const clientOrder = nextBuddyMessageClientOrder;
  nextBuddyMessageClientOrder += 1;
  return clientOrder;
}

function resetNextBuddyMessageClientOrder() {
  const maxClientOrder = messages.value.reduce((maxOrder, message, index) => {
    const order =
      typeof message.clientOrder === "number" && Number.isFinite(message.clientOrder) ? message.clientOrder : index;
    return Math.max(maxOrder, order);
  }, -1);
  nextBuddyMessageClientOrder = Math.floor(maxClientOrder) + 1;
}

function buildBuddyModelOptions(settings: SettingsPayload): BuddyModelOption[] {
  return buildRuntimeModelOptions(settings);
}

function isContextMessage(message: BuddyMessage): boolean {
  return message.includeInContext !== false;
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

function delay(timeoutMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timerId = window.setTimeout(resolve, timeoutMs);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timerId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function isPersistedMessage(value: unknown): value is BuddyChatMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ((value as BuddyChatMessage).role === "user" || (value as BuddyChatMessage).role === "assistant") &&
    typeof (value as BuddyChatMessage).content === "string" &&
    ((value as BuddyChatMessage).includeInContext === undefined ||
      typeof (value as BuddyChatMessage).includeInContext === "boolean")
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>

<style scoped>
.buddy-widget {
  position: fixed;
  inset: 0;
  z-index: 4500;
  pointer-events: none;
  font-family: var(--toograph-font-ui);
}

.buddy-widget__anchor {
  position: fixed;
  top: 0;
  left: 0;
  width: 96px;
  height: 96px;
  pointer-events: none;
  transition: transform 120ms ease;
}

.buddy-widget__anchor--roaming {
  transition: transform 980ms cubic-bezier(0.2, 1.05, 0.32, 1);
}

.buddy-widget__anchor--fullscreen {
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 4510;
}

.buddy-widget__backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: auto;
  background:
    radial-gradient(circle at 20% 16%, rgba(255, 255, 255, 0.42), transparent 34%),
    linear-gradient(135deg, rgba(45, 32, 21, 0.16), rgba(154, 52, 18, 0.08));
  backdrop-filter: blur(18px) saturate(1.22);
}

.buddy-widget__avatar {
  appearance: none;
  position: relative;
  z-index: 4;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  cursor: grab;
  isolation: isolate;
  overflow: visible;
  pointer-events: auto;
  touch-action: none;
  transition: transform 160ms ease;
}

.buddy-widget__avatar > .buddy-mascot {
  position: relative;
  z-index: 1;
  filter:
    drop-shadow(0 8px 12px rgba(255, 255, 255, 0.86))
    drop-shadow(0 2px 5px rgba(255, 255, 255, 0.72))
    drop-shadow(0 0 3px rgba(255, 255, 255, 0.94));
  transition: filter 160ms ease;
}

.buddy-widget__avatar:hover {
  transform: translateY(-2px);
}

.buddy-widget__avatar:hover > .buddy-mascot {
  filter:
    drop-shadow(0 9px 14px rgba(255, 255, 255, 0.9))
    drop-shadow(0 3px 6px rgba(255, 255, 255, 0.76))
    drop-shadow(0 0 4px rgba(255, 255, 255, 0.98));
}

.buddy-widget__avatar--roaming {
  animation: buddy-widget-avatar-hop-path 980ms cubic-bezier(0.2, 1.05, 0.32, 1) both;
}

.buddy-widget__avatar--hopping {
  animation: buddy-widget-avatar-hop-path 760ms cubic-bezier(0.2, 1.05, 0.32, 1) both;
}

.buddy-widget__avatar:active {
  cursor: grabbing;
  transform: translateY(0) scale(0.98);
}

.buddy-widget__avatar:active > .buddy-mascot {
  filter:
    drop-shadow(0 7px 10px rgba(255, 255, 255, 0.82))
    drop-shadow(0 2px 4px rgba(255, 255, 255, 0.68))
    drop-shadow(0 0 3px rgba(255, 255, 255, 0.9));
}

.buddy-widget__avatar:focus-visible,
.buddy-widget__icon-button:focus-visible,
.buddy-widget__send:focus-visible,
.buddy-widget__input:focus-visible,
.buddy-widget__session-item:focus-visible,
.buddy-widget__session-delete:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}

@keyframes buddy-widget-avatar-hop-path {
  0%,
  100% {
    transform: translateY(0);
  }
  34% {
    transform: translateY(-18px);
  }
  66% {
    transform: translateY(-6px);
  }
}

.buddy-widget__panel,
.buddy-widget__bubble {
  position: absolute;
  pointer-events: auto;
}

.buddy-widget__panel {
  bottom: calc(100% + 12px);
  z-index: 1;
  width: min(420px, calc(100vw - 32px));
  max-height: min(640px, calc(100vh - 132px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: visible;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 8px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), rgba(255, 252, 247, 0.88);
  box-shadow: var(--toograph-glass-shadow), var(--toograph-glass-highlight), var(--toograph-glass-rim);
  backdrop-filter: blur(28px) saturate(1.55) contrast(1.02);
}

.buddy-widget__panel--fullscreen {
  position: fixed;
  top: 50%;
  left: 50%;
  right: auto;
  bottom: auto;
  width: min(1440px, calc(100vw - 96px));
  height: min(920px, calc(100vh - 80px));
  max-height: calc(100vh - 80px);
  transform: translate(-50%, -50%);
  z-index: 1;
}

.buddy-widget__anchor--fullscreen .buddy-widget__avatar {
  position: fixed;
  right: auto;
  bottom: auto;
  z-index: 4;
}

.buddy-widget__anchor--left .buddy-widget__panel {
  right: 0;
}

.buddy-widget__anchor--right .buddy-widget__panel {
  left: 0;
}

.buddy-widget__anchor--fullscreen .buddy-widget__panel {
  top: 50%;
  left: 50%;
  right: auto;
  bottom: auto;
}

.buddy-widget__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(154, 52, 18, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 248, 240, 0.5));
}

.buddy-widget__heading {
  flex: 1 1 auto;
  min-width: 0;
}

.buddy-widget__eyebrow {
  display: block;
  color: var(--toograph-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}

.buddy-widget__heading h2 {
  margin: 3px 0 0;
  color: var(--toograph-text-strong);
  font-size: 16px;
  line-height: 1.2;
}

.buddy-widget__header-actions {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 6px;
}

.buddy-widget__runtime-controls {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(116px, 136px);
  gap: 8px;
}

.buddy-widget__model,
.buddy-widget__mode {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.buddy-widget__control-label {
  color: var(--toograph-text-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.buddy-widget__model-select,
.buddy-widget__mode-select {
  width: 100%;
}

.buddy-widget__model-select :deep(.el-select__wrapper),
.buddy-widget__mode-select :deep(.el-select__wrapper) {
  min-height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 0 0 1px rgba(154, 52, 18, 0.14) inset;
}

.buddy-widget__model-select :deep(.el-select__wrapper.is-focused),
.buddy-widget__mode-select :deep(.el-select__wrapper.is-focused) {
  box-shadow:
    0 0 0 1px rgba(154, 52, 18, 0.22) inset,
    0 0 0 3px rgba(210, 162, 117, 0.22);
}

:global(.buddy-widget__select-popper.el-popper) {
  z-index: 4600 !important;
}

.buddy-widget__mode-option {
  display: grid;
  gap: 2px;
  min-width: 0;
  line-height: 1.2;
}

.buddy-widget__mode-option small {
  color: var(--toograph-text-muted);
  font-size: 11px;
}

.buddy-widget__icon-button,
.buddy-widget__send {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 255, 255, 0.62);
  color: var(--toograph-accent-strong);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.buddy-widget__icon-button {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.buddy-widget__icon-button:hover,
.buddy-widget__send:hover {
  border-color: rgba(154, 52, 18, 0.24);
  background: rgba(255, 248, 240, 0.92);
  transform: translateY(-1px);
}

.buddy-widget__icon-button--active {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.buddy-widget__icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.54;
  transform: none;
}

.buddy-widget__history-control {
  position: relative;
}

.buddy-widget__sessions-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 3;
  width: min(330px, calc(100vw - 56px));
  max-height: min(520px, calc(100vh - 132px));
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 8px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), rgba(255, 252, 247, 0.94);
  box-shadow: var(--toograph-glass-highlight), 0 16px 38px rgba(61, 43, 24, 0.16);
  backdrop-filter: blur(24px) saturate(1.45) contrast(1.02);
}

.buddy-widget__anchor--left .buddy-widget__sessions-panel {
  right: 0;
}

.buddy-widget__anchor--right .buddy-widget__sessions-panel {
  right: 0;
}

.buddy-widget__sessions-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.buddy-widget__sessions-header strong {
  color: var(--toograph-text-strong);
  font-size: 12px;
  line-height: 1.2;
}

.buddy-widget__session-delete,
.buddy-widget__session-item {
  appearance: none;
  border: 0;
  font: inherit;
}

.buddy-widget__session-list {
  display: grid;
  gap: 6px;
  max-height: none;
  overflow: visible;
}

.buddy-widget__session-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: 5px;
  align-items: stretch;
}

.buddy-widget__session-item {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--toograph-text-strong);
  text-align: left;
  cursor: pointer;
}

.buddy-widget__session-item span,
.buddy-widget__session-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__session-item span {
  font-size: 12px;
  font-weight: 800;
}

.buddy-widget__session-item small,
.buddy-widget__sessions-status {
  color: var(--toograph-text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.buddy-widget__session-row--active .buddy-widget__session-item {
  border-color: rgba(37, 99, 235, 0.2);
  background: rgba(37, 99, 235, 0.08);
}

.buddy-widget__session-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.62);
  color: rgba(154, 52, 18, 0.76);
  cursor: pointer;
}

.buddy-widget__session-delete--confirm,
.buddy-widget__session-delete--confirm:hover,
.buddy-widget__session-delete--confirm:focus-visible {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgb(185, 28, 28);
  color: #fff;
}

.buddy-widget__session-item:disabled,
.buddy-widget__session-delete:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.buddy-widget__sessions-status {
  margin: 0;
}

.buddy-widget__confirm-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 6px 12px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: 0 14px 32px rgba(60, 41, 20, 0.14);
}

.buddy-widget__confirm-hint--delete {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  color: rgb(153, 27, 27);
}

:deep(.buddy-widget__confirm-popover.el-popper) {
  border: none;
  border-radius: 999px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.buddy-widget__messages {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 240px;
  max-height: 430px;
  overflow: auto;
  padding: 14px;
}

.buddy-widget__panel--fullscreen .buddy-widget__messages {
  max-height: none;
}

.buddy-widget__empty,
.buddy-widget__error,
.buddy-widget__queue {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.buddy-widget__empty {
  color: var(--toograph-text-muted);
}

.buddy-widget__error {
  padding: 10px 12px;
  border: 1px solid rgba(220, 38, 38, 0.16);
  border-radius: 8px;
  background: rgba(254, 242, 242, 0.92);
  color: rgb(185, 28, 28);
}

.buddy-widget__queue {
  color: rgba(108, 82, 62, 0.72);
  font-size: 12px;
}

.buddy-widget__message {
  display: grid;
  gap: 4px;
}

.buddy-widget__message-label {
  color: var(--toograph-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.buddy-widget__message-bubble {
  width: fit-content;
  max-width: 100%;
  margin: 0;
  padding: 9px 11px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.64);
  color: var(--toograph-text);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.buddy-widget__message-markdown {
  white-space: normal;
}

.buddy-widget__message-markdown :deep(p),
.buddy-widget__message-markdown :deep(ul),
.buddy-widget__message-markdown :deep(ol),
.buddy-widget__message-markdown :deep(blockquote),
.buddy-widget__message-markdown :deep(pre) {
  margin: 0 0 8px;
}

.buddy-widget__message-markdown :deep(p:last-child),
.buddy-widget__message-markdown :deep(ul:last-child),
.buddy-widget__message-markdown :deep(ol:last-child),
.buddy-widget__message-markdown :deep(blockquote:last-child),
.buddy-widget__message-markdown :deep(pre:last-child) {
  margin-bottom: 0;
}

.buddy-widget__message-markdown :deep(ul),
.buddy-widget__message-markdown :deep(ol) {
  padding-left: 18px;
}

.buddy-widget__message-markdown :deep(a) {
  color: #2563eb;
  font-weight: 650;
  text-decoration: none;
}

.buddy-widget__message-markdown :deep(a:hover) {
  text-decoration: underline;
}

.buddy-widget__message-markdown :deep(code) {
  padding: 1px 4px;
  border-radius: 5px;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  font-family: var(--toograph-font-mono);
  font-size: 0.92em;
}

.buddy-widget__message-markdown :deep(pre) {
  max-width: 100%;
  overflow: auto;
  padding: 9px 10px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.92);
}

.buddy-widget__message-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
  color: #1f2937;
}

.buddy-widget__message-markdown :deep(blockquote) {
  padding: 6px 10px;
  border-left: 3px solid rgba(154, 52, 18, 0.22);
  color: rgba(70, 53, 38, 0.88);
  background: rgba(255, 248, 240, 0.58);
}

.buddy-widget__message--user {
  justify-items: end;
}

.buddy-widget__message--user .buddy-widget__message-bubble {
  background: rgba(154, 52, 18, 0.08);
  color: var(--toograph-text-strong);
}

.buddy-widget__public-output-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.buddy-widget__public-output-duration {
  width: fit-content;
  padding: 3px 7px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  background: rgba(255, 248, 240, 0.68);
  color: rgba(108, 82, 62, 0.76);
  font-family: var(--toograph-font-mono);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
}

.buddy-widget__public-output-duration--streaming {
  font-family: var(--toograph-font-ui);
}

.buddy-widget__public-output-card {
  width: min(100%, 320px);
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.72);
  overflow-wrap: anywhere;
}

.buddy-widget__public-output-card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: rgba(45, 32, 21, 0.84);
  font-size: 12px;
}

.buddy-widget__public-output-card-header span {
  color: rgba(108, 82, 62, 0.62);
  font-size: 11px;
  font-weight: 700;
}

.buddy-widget__public-output-card pre {
  max-width: 100%;
  max-height: 260px;
  margin: 0;
  overflow: auto;
  padding: 9px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.66);
  color: rgba(45, 32, 21, 0.86);
  font-family: var(--toograph-font-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.buddy-widget__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  background: rgba(255, 248, 240, 0.56);
}

.buddy-widget__input {
  width: 100%;
  min-height: 42px;
  max-height: 96px;
  resize: vertical;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.74);
  color: var(--toograph-text-strong);
  padding: 9px 10px;
  font-size: 13px;
  line-height: 1.45;
}

.buddy-widget__input:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.buddy-widget__send {
  width: 38px;
  height: 42px;
  border-radius: 8px;
  background: rgba(154, 52, 18, 0.1);
}

.buddy-widget__send:disabled {
  cursor: not-allowed;
  opacity: 0.54;
  transform: none;
}

.buddy-widget__bubble {
  bottom: calc(100% + 10px);
  max-width: min(260px, calc(100vw - 32px));
  padding: 9px 11px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.94);
  color: var(--toograph-text);
  box-shadow: var(--toograph-glass-highlight), 0 14px 34px rgba(61, 43, 24, 0.12);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  backdrop-filter: blur(14px) saturate(1.18);
}

.buddy-widget__anchor--left .buddy-widget__bubble {
  right: 0;
}

.buddy-widget__anchor--right .buddy-widget__bubble {
  left: 0;
}

@media (max-width: 560px) {
  .buddy-widget__panel {
    width: calc(100vw - 32px);
    max-height: min(600px, calc(100vh - 120px));
  }

  .buddy-widget__panel--fullscreen {
    width: calc(100vw - 18px);
    height: calc(100vh - 18px);
    max-height: calc(100vh - 18px);
  }

  .buddy-widget__messages {
    max-height: 390px;
  }

  .buddy-widget__panel--fullscreen .buddy-widget__messages {
    max-height: none;
  }
}

</style>
