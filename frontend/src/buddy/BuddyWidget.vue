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
              <BuddyPauseCard
                v-if="shouldShowPausedRunCard(message)"
                :run="pausedBuddyRun"
                :busy="pausedBuddyResumeBusy"
                @resume="resumePausedBuddyRun"
                @cancel="cancelPausedBuddyRun"
              />
              <template v-else>
                <section
                  v-if="message.role === 'assistant' && message.outputTrace"
                  class="buddy-widget__run-trace"
                  :class="`buddy-widget__run-trace--${message.outputTrace.status}`"
                >
                  <button
                    type="button"
                    class="buddy-widget__run-trace-summary"
                    :aria-expanded="isTraceMessageExpanded(message.id)"
                    :aria-label="isTraceMessageExpanded(message.id) ? t('buddy.runTraceCollapse') : t('buddy.runTraceExpand')"
                    @click="toggleTraceMessage(message.id)"
                  >
                    <span
                      class="buddy-widget__run-trace-dot"
                      :class="`buddy-widget__run-trace-dot--${message.outputTrace.status}`"
                      aria-hidden="true"
                    />
                    <span class="buddy-widget__run-trace-title">
                      {{ resolveTraceSegmentSummary(message.outputTrace) }}
                    </span>
                    <span class="buddy-widget__run-trace-duration">
                      {{ formatTraceDuration(buildTraceSegmentDurationKey(message.id), resolveTraceSegmentDurationMs(message.outputTrace)) }}
                    </span>
                    <span
                      class="buddy-widget__run-trace-chevron"
                      :class="{ 'buddy-widget__run-trace-chevron--expanded': isTraceMessageExpanded(message.id) }"
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    v-if="isTraceMessageExpanded(message.id)"
                    class="buddy-widget__run-trace-detail"
                  >
                    <ol class="buddy-widget__run-trace-list">
                      <li
                        v-for="record in message.outputTrace.records"
                        :key="record.recordId"
                        class="buddy-widget__run-trace-row"
                      >
                        <span
                          class="buddy-widget__run-trace-dot buddy-widget__run-trace-dot--small"
                          :class="`buddy-widget__run-trace-dot--${record.status}`"
                          aria-hidden="true"
                        />
                        <span class="buddy-widget__run-trace-row-label">{{ record.label }}</span>
                        <span class="buddy-widget__run-trace-row-duration">
                          {{ formatTraceDuration(buildTraceRecordDurationKey(message.id, record.recordId), resolveTraceRecordDurationMs(record)) }}
                        </span>
                      </li>
                    </ol>
                    <div class="buddy-widget__run-trace-total">
                      <span>{{ t("buddy.runTraceLabel") }}</span>
                      <strong>{{ formatTraceDuration(buildTraceSegmentDurationKey(message.id), resolveTraceSegmentDurationMs(message.outputTrace)) }}</strong>
                    </div>
                  </div>
                </section>
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
          :virtual-cursor="virtualCursorEnabled && !virtualCursorDetached"
          :hide-sparkle="isVirtualCursorRendered"
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
import {
  advanceSmoothNumberDisplay,
  isSmoothNumberDisplaySettled,
  type SmoothNumberDisplayState,
} from "../lib/smoothNumberDisplay.ts";
import { useBuddyContextStore } from "../stores/buddyContext.ts";
import { useBuddyMascotDebugStore } from "../stores/buddyMascotDebug.ts";
import type { BuddyChatMessageRecord, BuddyChatSession } from "../types/buddy.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type { SettingsPayload } from "../types/settings.ts";

import BuddyMascot from "./BuddyMascot.vue";
import BuddyPauseCard from "./BuddyPauseCard.vue";
import type { BuddyMascotDebugAction } from "./buddyMascotDebug.ts";
import {
  buildOutputTraceBuddyMessageMetadata,
  resolveOutputTraceBuddyMessageMetadata,
} from "./buddyMessageMetadata.ts";
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
  buildBuddyOutputTracePlan,
  buildBuddyOutputTraceStateFromRunDetail,
  createBuddyOutputTraceRuntimeState,
  listBuddyOutputTraceSegmentsForDisplay,
  reduceBuddyOutputTraceEvent,
  type BuddyOutputTraceRecord,
  type BuddyOutputTraceRuntimeState,
  type BuddyOutputTraceSegment,
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
import { shouldShowGroupedBuddyMessageLabel } from "./buddyMessageGrouping.ts";

type BuddyMessage = BuddyChatMessage & {
  id: string;
  clientOrder?: number | null;
  activityText?: string;
  runId?: string | null;
  publicOutput?: BuddyPublicOutputMetadata;
  outputTrace?: BuddyOutputTraceSegment;
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
  Pick<BuddyMessage, "content" | "includeInContext" | "activityText" | "runId" | "publicOutput" | "outputTrace">
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

type TraceDurationTarget = {
  durationMs: number;
  animateInitial: boolean;
};

type BuddyMood = "idle" | "thinking" | "speaking" | "error";
type BuddyMascotMotion = "idle" | "roam" | "hop";
type BuddyMascotFacing = "front" | "left" | "right";
type VirtualCursorPhase = "hidden" | "launching" | "active" | "returning";
type BuddyIdleAnimationAction = "tail-switch" | "random-move" | "virtual-cursor-orbit" | "virtual-cursor-chase";
type BuddyIdleRunOptions = { force?: boolean };
type VirtualCursorIdleActionMode = "none" | "orbit" | "chase";
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
const BUDDY_VIRTUAL_CURSOR_SIZE = { width: 42, height: 42 };
const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_PERIOD_MS = 1600;
const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX = BUDDY_VIRTUAL_CURSOR_SIZE.width * 0.86;
const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX = BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX * 0.62;
const BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG = 0;
const BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG = -36;
const BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS = 360;
const BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS = 80;
const BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS = 180;
const BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS = 120;
const BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS = 140;
const BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS = 6000;
const BUDDY_VIRTUAL_CURSOR_MAX_ROTATE_TRANSITION_MS = 900;
const BUDDY_VIRTUAL_CURSOR_FLIGHT_SETTLE_MS = 80;
const BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE = 0.72;
const BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE = 1;
const BUDDY_VIRTUAL_CURSOR_FOLLOW_MAX_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width * 2.15;
const BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width * 1.25;
const VIRTUAL_CURSOR_STAR_PATH =
  "M0-72 C5-46 18-33 44-28 C18-23 5-10 0 16 C-5-10 -18-23 -44-28 C-18-33 -5-46 0-72Z";
const VIRTUAL_CURSOR_SHAPE_PATH =
  "M0-72 C14-35 33 5 52 34 C27 35 13 46 0 64 C-13 46 -27 35 -52 34 C-33 5 -14-35 0-72Z";
const TRACE_DURATION_SMOOTH_OPTIONS = {
  timeConstantMs: 180,
  snapEpsilon: 8,
} as const;
const { t } = useI18n();
const route = useRoute();
const buddyContextStore = useBuddyContextStore();
const buddyMascotDebugStore = useBuddyMascotDebugStore();
const {
  latestRequest: mascotDebugRequest,
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
const isPanelOpen = ref(false);
const draft = ref("");
const avatarHopCycle = ref(0);
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
const tailSwitchNonce = ref(0);
const activeRunId = ref<string | null>(null);
const pausedBuddyRun = ref<RunDetail | null>(null);
const pausedBuddyAssistantMessageId = ref<string | null>(null);
const pausedBuddyResumeBusy = ref(false);
const avatarElement = ref<HTMLElement | null>(null);
const virtualCursorAnimateElement = ref<SVGAnimationElement | null>(null);
const mascotLook = ref({ x: 0, y: 0 });
const mascotMotion = ref<BuddyMascotMotion>("idle");
const mascotFacing = ref<BuddyMascotFacing>("front");
const mascotMoveDurationMs = ref(buddyMascotMotionConfig.value.moveDurationMs);
const messageListElement = ref<HTMLElement | null>(null);
const debugDragging = ref(false);
const traceClockNowMs = ref(Date.now());
const traceDurationDisplayByKey = ref<Record<string, SmoothNumberDisplayState>>({});
const expandedTraceMessageIds = ref<Set<string>>(new Set());
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
let buddyVirtualCursorFollowMotionTimerId: number | null = null;
let buddyVirtualCursorFollowStepTimerId: number | null = null;
let buddyVirtualCursorFollowTargetPosition: BuddyPosition | null = null;
let buddyVirtualCursorFollowSequenceId = 0;
let buddyVirtualCursorIdleFrameId: number | null = null;
let virtualCursorTransitionTimerId: number | null = null;
let virtualCursorTransitionFrameId: number | null = null;
let virtualCursorFlightFrameId: number | null = null;
let virtualCursorAngleFrameTimestampMs: number | null = null;
let virtualCursorMorphAnimationKey = 0;
let buddyDebugActionTimerId: number | null = null;
let traceClockTimerId: number | null = null;
let pendingMascotLookPointer: { x: number; y: number } | null = null;
let chatSessionInitializationPromise: Promise<void> | null = null;
let chatSessionActivationGeneration = 0;
const backgroundReviewAbortControllers = new Set<AbortController>();
let nextBuddyMessageClientOrder = 0;

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
const isSessionSwitchLocked = computed(
  () =>
    queuedTurns.value.length > 0 ||
    activeRunId.value !== null,
);
const hasRunningTraceSegment = computed(() =>
  messages.value.some((message) => message.outputTrace?.status === "running"),
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
  clearVirtualCursorDrag();
  queuedTurns.value = [];
  clearSessionDeleteConfirmTimeout();
  clearAvatarSingleClickTimer();
  clearSpeakingIdleTimer();
  clearBuddyDebugActionTimer();
  clearTraceClockTimer();
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

watch(hasRunningTraceSegment, refreshTraceClockTimer);

watch(mascotDebugRequest, (request) => {
  if (!request) {
    return;
  }
  triggerMascotDebugAction(request.action);
});

function handleAvatarClick() {
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
  clearVirtualCursorDrag();
  cancelBuddyVirtualCursorFollowTimers();
  startVirtualCursorReturn();
}

function handleVirtualCursorPointerDown(event: PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (virtualCursorPhase.value !== "active") {
    return;
  }
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
  const cursorCenter = resolveBoxCenter(virtualCursorPosition.value, BUDDY_VIRTUAL_CURSOR_SIZE);
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
    smoothAngle: true,
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
  const flightDurationMs = resolveVirtualCursorMoveDurationMs(virtualCursorPosition.value, targetPosition);
  const flightWaitMs = moveVirtualCursorToWithArmedTransition(targetPosition, { durationMs: flightDurationMs });
  buddyRoamMotionTimerId = window.setTimeout(() => {
    buddyRoamMotionTimerId = null;
    if (sequenceId !== buddyRoamSequenceId || virtualCursorIdleActionMode.value !== "chase") {
      return;
    }
    updateMascotLookFromVirtualCursor();
    requestBuddyFollowVirtualCursor();
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
    ),
    {
      angleDeg: resolveVirtualCursorChaseLoopTangentAngle(angle),
      smoothAngle: true,
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
  cancelBuddyVirtualCursorIdleFrame();
  virtualCursorIdleActionMode.value = "none";
  buddyMascotDebugStore.setVirtualCursorEnabled(false);
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
    if (Math.hypot(candidateCenter.x - buddyCenter.x, candidateCenter.y - buddyCenter.y) > BUDDY_VIRTUAL_CURSOR_FOLLOW_MAX_DISTANCE_PX * 1.15) {
      return candidate;
    }
  }
  const horizontalDirection = buddyCenter.x > viewport.value.width / 2 ? -1 : 1;
  const verticalDirection = buddyCenter.y > viewport.value.height / 2 ? -1 : 1;
  return clampBuddyPosition(
    {
      x: buddyCenter.x + horizontalDirection * BUDDY_VIRTUAL_CURSOR_FOLLOW_MAX_DISTANCE_PX * 1.3 - BUDDY_VIRTUAL_CURSOR_SIZE.width / 2,
      y: buddyCenter.y + verticalDirection * BUDDY_VIRTUAL_CURSOR_FOLLOW_MAX_DISTANCE_PX * 0.9 - BUDDY_VIRTUAL_CURSOR_SIZE.height / 2,
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
}

function requestBuddyFollowVirtualCursor() {
  if (!shouldBuddyFollowVirtualCursor.value || virtualCursorPhase.value !== "active" || isPanelFullscreen.value) {
    return;
  }
  const targetPosition = resolveBuddyVirtualCursorFollowTargetPosition();
  const isFollowingMotionActive = buddyVirtualCursorFollowMotionTimerId !== null;
  if (isBuddyRoamTargetReached(position.value, targetPosition)) {
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
  if (isBuddyRoamTargetReached(position.value, targetPosition)) {
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
    if (isBuddyRoamTargetReached(position.value, latestTargetPosition)) {
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
  const cursorCenter = resolveBoxCenter(virtualCursorPosition.value, BUDDY_VIRTUAL_CURSOR_SIZE);
  const deltaX = buddyCenter.x - cursorCenter.x;
  const deltaY = buddyCenter.y - cursorCenter.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= BUDDY_VIRTUAL_CURSOR_FOLLOW_MAX_DISTANCE_PX) {
    return position.value;
  }

  const unitX = distance < 1 ? -0.82 : deltaX / distance;
  const unitY = distance < 1 ? 0.58 : deltaY / distance;
  return clampBuddyPosition(
    {
      x: cursorCenter.x + unitX * BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_DISTANCE_PX - DEFAULT_BUDDY_SIZE.width / 2,
      y: cursorCenter.y + unitY * BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_DISTANCE_PX - DEFAULT_BUDDY_SIZE.height / 2,
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
  if (virtualCursorIdleActionMode.value === "chase") {
    if (Math.random() < 0.5) {
      finishBuddyIdleVirtualCursorAction(buddyRoamSequenceId);
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

function refreshTraceClockTimer() {
  updateTraceDurationDisplays(Date.now());
  if (hasRunningTraceSegment.value || hasUnsettledTraceDurationDisplay()) {
    startTraceClockTimer();
    return;
  }
  clearTraceClockTimer();
}

function startTraceClockTimer() {
  if (traceClockTimerId !== null || typeof window === "undefined") {
    return;
  }
  const tick = () => {
    updateTraceDurationDisplays(Date.now());
    if (hasRunningTraceSegment.value || hasUnsettledTraceDurationDisplay()) {
      traceClockTimerId = window.requestAnimationFrame(tick);
      return;
    }
    traceClockTimerId = null;
  };
  traceClockTimerId = window.requestAnimationFrame(tick);
}

function clearTraceClockTimer() {
  if (traceClockTimerId === null || typeof window === "undefined") {
    traceClockTimerId = null;
    return;
  }
  window.cancelAnimationFrame(traceClockTimerId);
  traceClockTimerId = null;
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

function resolveDefaultVirtualCursorPosition(currentViewport: { width: number; height: number }, buddyPosition: BuddyPosition): BuddyPosition {
  return clampBuddyPosition(
    {
      x: buddyPosition.x + DEFAULT_BUDDY_SIZE.width * 0.28,
      y: buddyPosition.y - BUDDY_VIRTUAL_CURSOR_SIZE.height * 0.22,
    },
    currentViewport,
    BUDDY_VIRTUAL_CURSOR_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

function resolveVirtualCursorLaunchPosition(currentViewport: { width: number; height: number }, buddyPosition: BuddyPosition): BuddyPosition {
  const buddyCenter = resolveBoxCenter(buddyPosition, DEFAULT_BUDDY_SIZE);
  const horizontalDirection = resolveBoxCenter(buddyPosition, DEFAULT_BUDDY_SIZE).x > currentViewport.width / 2 ? -1 : 1;
  return clampBuddyPosition(
    {
      x: buddyCenter.x + horizontalDirection * DEFAULT_BUDDY_SIZE.width * 0.52 - BUDDY_VIRTUAL_CURSOR_SIZE.width / 2,
      y: buddyPosition.y - BUDDY_VIRTUAL_CURSOR_SIZE.height * 0.38,
    },
    currentViewport,
    BUDDY_VIRTUAL_CURSOR_SIZE,
    DEFAULT_BUDDY_MARGIN,
  );
}

function moveVirtualCursorTo(
  nextPosition: BuddyPosition,
  options: { updateAngle?: boolean; durationMs?: number; rotateDurationMs?: number; angleDeg?: number; smoothAngle?: boolean } = {},
) {
  clearVirtualCursorFlightFrame();
  const currentPosition = virtualCursorPosition.value;
  const targetAngleDeg = options.angleDeg ?? resolveVirtualCursorFlightAngle(currentPosition, nextPosition);
  setVirtualCursorMoveTransitionDuration(options.durationMs ?? resolveVirtualCursorMoveDurationMs(currentPosition, nextPosition));
  setVirtualCursorRotateTransitionDuration(options.rotateDurationMs ?? resolveVirtualCursorRotateDurationMs(targetAngleDeg));
  if (options.updateAngle !== false) {
    virtualCursorAngleDeg.value = options.smoothAngle
      ? resolveSmoothedVirtualCursorAngle(targetAngleDeg)
      : resolveContinuousVirtualCursorAngle(targetAngleDeg);
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
  const durationMs = options.durationMs ?? resolveVirtualCursorMoveDurationMs(currentPosition, nextPosition);
  const rotateDurationMs = options.rotateDurationMs ?? resolveVirtualCursorRotateDurationMs(targetAngleDeg);
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
    return virtualCursorMoveDurationMs.value;
  }

  virtualCursorFlightFrameId = window.requestAnimationFrame(() => {
    virtualCursorFlightFrameId = null;
    moveVirtualCursorTo(nextPosition, moveOptions);
  });
  return virtualCursorMoveDurationMs.value + BUDDY_VIRTUAL_CURSOR_FLIGHT_SETTLE_MS;
}

function setVirtualCursorMoveTransitionDuration(durationMs: number) {
  virtualCursorMoveDurationMs.value = Math.round(clampNumber(durationMs, 0, BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS));
}

function setVirtualCursorRotateTransitionDuration(durationMs: number) {
  virtualCursorRotateDurationMs.value = Math.round(clampNumber(durationMs, 0, BUDDY_VIRTUAL_CURSOR_MAX_ROTATE_TRANSITION_MS));
}

function resolveVirtualCursorMoveDurationMs(fromPosition: BuddyPosition, toPosition: BuddyPosition) {
  const distance = Math.hypot(toPosition.x - fromPosition.x, toPosition.y - fromPosition.y);
  if (distance < 1) {
    return 0;
  }
  return clampNumber(
    distance * 1000 / buddyMascotMotionConfig.value.virtualCursorFlightSpeedPxPerS,
    BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS,
    BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS,
  );
}

function resolveVirtualCursorRotateDurationMs(targetAngleDeg: number) {
  const nextAngleDeg = resolveContinuousVirtualCursorAngle(targetAngleDeg);
  const deltaDeg = Math.abs(nextAngleDeg - virtualCursorAngleDeg.value);
  if (deltaDeg < 1) {
    return 0;
  }
  return clampNumber(
    deltaDeg * 1000 / buddyMascotMotionConfig.value.virtualCursorRotationSpeedDegPerS,
    0,
    BUDDY_VIRTUAL_CURSOR_MAX_ROTATE_TRANSITION_MS,
  );
}

function settleVirtualCursorRotation() {
  setVirtualCursorRotateTransitionDuration(BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS);
  virtualCursorAngleFrameTimestampMs = null;
  virtualCursorAngleDeg.value = BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG;
}

function resolveContinuousVirtualCursorAngle(targetAngleDeg: number) {
  const currentAngleDeg = virtualCursorAngleDeg.value;
  const deltaDeg = ((((targetAngleDeg - currentAngleDeg + 180) % 360) + 360) % 360) - 180;
  return currentAngleDeg + deltaDeg;
}

function resolveSmoothedVirtualCursorAngle(targetAngleDeg: number) {
  const nowMs = typeof performance === "undefined" ? Date.now() : performance.now();
  const elapsedMs = virtualCursorAngleFrameTimestampMs === null ? 16 : Math.max(0, nowMs - virtualCursorAngleFrameTimestampMs);
  virtualCursorAngleFrameTimestampMs = nowMs;
  const nextAngleDeg = resolveContinuousVirtualCursorAngle(targetAngleDeg);
  const deltaDeg = nextAngleDeg - virtualCursorAngleDeg.value;
  const maxDeltaDeg = buddyMascotMotionConfig.value.virtualCursorRotationSpeedDegPerS * elapsedMs / 1000;
  return virtualCursorAngleDeg.value + clampNumber(deltaDeg, -maxDeltaDeg, maxDeltaDeg);
}

function resolveVirtualCursorFlightAngle(fromPosition: BuddyPosition, toPosition: BuddyPosition): number {
  const deltaX = toPosition.x - fromPosition.x;
  const deltaY = toPosition.y - fromPosition.y;
  if (Math.hypot(deltaX, deltaY) < 1) {
    return BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG;
  }
  return resolveVirtualCursorVectorAngle(deltaX, deltaY);
}

function resolveVirtualCursorVectorAngle(deltaX: number, deltaY: number) {
  if (Math.hypot(deltaX, deltaY) < 0.001) {
    return virtualCursorAngleDeg.value;
  }
  return Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
}

function resolveBoxCenter(positionValue: BuddyPosition, size: { width: number; height: number }) {
  return {
    x: positionValue.x + size.width / 2,
    y: positionValue.y + size.height / 2,
  };
}

function clampVirtualCursorFramePosition(positionValue: BuddyPosition): BuddyPosition {
  const minX = DEFAULT_BUDDY_MARGIN;
  const minY = DEFAULT_BUDDY_MARGIN;
  const maxX = Math.max(minX, viewport.value.width - BUDDY_VIRTUAL_CURSOR_SIZE.width - DEFAULT_BUDDY_MARGIN);
  const maxY = Math.max(minY, viewport.value.height - BUDDY_VIRTUAL_CURSOR_SIZE.height - DEFAULT_BUDDY_MARGIN);
  return {
    x: clampNumber(positionValue.x, minX, maxX),
    y: clampNumber(positionValue.y, minY, maxY),
  };
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
  const outputTracePlan = buildBuddyOutputTracePlan(graph, publicOutputBindings);
  const outputTraceState = buildBuddyOutputTraceStateFromRunDetail(runDetail, outputTracePlan, graph);
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
  const outputTracePlan = buildBuddyOutputTracePlan(graph, publicOutputBindings);
  let outputTraceState = createBuddyOutputTraceRuntimeState(outputTracePlan);
  eventSource = new EventSource(streamUrl);
  const handleStreamingEvent = (eventType: string, event: Event) => {
    const payload = parseRunEventPayload(event);
    if (!payload) {
      return;
    }
    outputTraceState = reduceBuddyOutputTraceEvent(
      outputTraceState,
      outputTracePlan,
      graph,
      eventType,
      payload,
      nowPublicOutputMs(),
    );
    publicOutputState = reduceBuddyPublicOutputEvent(
      publicOutputState,
      publicOutputBindings,
      eventType,
      payload,
      nowPublicOutputMs(),
    );
    const { publicOutputMessages, outputTraceMessages } = syncBuddyRunDisplayMessages(
      assistantMessageId,
      runId,
      outputTraceState,
      publicOutputState,
    );
    if (publicOutputMessages.length > 0) {
      mood.value = "speaking";
    }
    if (publicOutputMessages.length > 0 || outputTraceMessages.length > 0) {
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
    Boolean(message.outputTrace) ||
    shouldShowPausedRunCard(message)
  );
}

function shouldShowMessageRoleLabel(messageIndex: number) {
  return shouldShowGroupedBuddyMessageLabel(messages.value, messageIndex, shouldRenderMessage);
}

function shouldShowPausedRunCard(message: BuddyMessage) {
  return (
    message.role === "assistant" &&
    pausedBuddyRun.value?.status === "awaiting_human" &&
    pausedBuddyAssistantMessageId.value === message.id
  );
}

function syncBuddyRunDisplayMessages(
  controllerMessageId: string,
  runId: string,
  outputTraceState: BuddyOutputTraceRuntimeState,
  outputState: BuddyPublicOutputRuntimeState,
) {
  const existingMessages = new Map(messages.value.map((message) => [message.id, message]));
  const displayPrefix = `${controllerMessageId}:`;
  messages.value = messages.value.filter(
    (message) => !message.id.startsWith(`${displayPrefix}trace:`) && !message.id.startsWith(`${displayPrefix}output:`),
  );

  const outputTraceMessages: BuddyMessage[] = [];
  const publicOutputMessages: BuddyMessage[] = [];
  const displayMessages: BuddyMessage[] = [];
  const handledOutputNodeIds = new Set<string>();

  for (const segment of listBuddyOutputTraceSegmentsForDisplay(outputTraceState)) {
    const traceMessage = buildOutputTraceMessage(controllerMessageId, runId, segment, existingMessages);
    displayMessages.push(traceMessage);
    outputTraceMessages.push(traceMessage);
    for (const outputNodeId of segment.outputNodeIds) {
      const output = outputState.messagesByOutputNodeId[outputNodeId];
      if (!output) {
        continue;
      }
      const outputMessage = buildPublicOutputMessage(controllerMessageId, runId, output, existingMessages);
      displayMessages.push(outputMessage);
      publicOutputMessages.push(outputMessage);
      handledOutputNodeIds.add(outputNodeId);
    }
  }

  for (const outputNodeId of outputState.order) {
    if (handledOutputNodeIds.has(outputNodeId)) {
      continue;
    }
    const output = outputState.messagesByOutputNodeId[outputNodeId];
    if (!output) {
      continue;
    }
    const outputMessage = buildPublicOutputMessage(controllerMessageId, runId, output, existingMessages);
    displayMessages.push(outputMessage);
    publicOutputMessages.push(outputMessage);
  }

  if (displayMessages.length > 0) {
    messages.value.splice(resolveBuddyRunDisplayInsertionIndex(controllerMessageId), 0, ...displayMessages);
  }
  return { publicOutputMessages, outputTraceMessages };
}

function buildOutputTraceMessage(
  controllerMessageId: string,
  runId: string,
  outputTrace: BuddyOutputTraceSegment,
  existingMessages: Map<string, BuddyMessage>,
) {
  const messageId = buildOutputTraceMessageId(controllerMessageId, outputTrace.segmentId);
  const existing = existingMessages.get(messageId);
  const message =
    existing ?? createMessage("assistant", "", messageId, allocateBuddyMessageClientOrder());
  message.content = "";
  message.outputTrace = outputTrace;
  message.publicOutput = undefined;
  message.runId = runId;
  message.includeInContext = false;
  return message;
}

function buildPublicOutputMessage(
  controllerMessageId: string,
  runId: string,
  output: BuddyPublicOutputMessage,
  existingMessages: Map<string, BuddyMessage>,
) {
  const messageId = buildPublicOutputMessageId(controllerMessageId, output.outputNodeId);
  const publicOutput = toBuddyPublicOutputMetadata(output);
  const message =
    existingMessages.get(messageId)
    ?? createMessage("assistant", renderPublicOutputContentForStorage(output), messageId, allocateBuddyMessageClientOrder());
  message.content = renderPublicOutputContentForStorage(output);
  message.publicOutput = publicOutput;
  message.outputTrace = undefined;
  message.runId = runId;
  message.includeInContext = publicOutput.kind === "text" && publicOutput.status === "completed";
  return message;
}

function buildOutputTraceMessageId(controllerMessageId: string, segmentId: string) {
  return `${controllerMessageId}:trace:${segmentId}`;
}

function buildPublicOutputMessageId(controllerMessageId: string, outputNodeId: string) {
  return `${controllerMessageId}:output:${outputNodeId}`;
}

function resolveBuddyRunDisplayInsertionIndex(controllerMessageId: string) {
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

function formatPublicOutputCardContent(content: string) {
  return content.trim() || t("buddy.emptyReply");
}

function isTraceMessageExpanded(messageId: string) {
  return expandedTraceMessageIds.value.has(messageId);
}

function toggleTraceMessage(messageId: string) {
  const next = new Set(expandedTraceMessageIds.value);
  if (next.has(messageId)) {
    next.delete(messageId);
  } else {
    next.add(messageId);
  }
  expandedTraceMessageIds.value = next;
}

function resolveTraceSegmentSummary(segment: BuddyOutputTraceSegment) {
  if (segment.status === "running") {
    return findCurrentTraceRecord(segment)?.label ?? segment.boundaryLabel;
  }
  if (segment.status === "failed") {
    return t("buddy.runTraceFailed", { count: segment.records.length });
  }
  return t("buddy.runTraceCompleted", { count: segment.records.length });
}

function findCurrentTraceRecord(segment: BuddyOutputTraceSegment) {
  return [...segment.records].reverse().find((record) => record.status === "running") ?? segment.records.at(-1) ?? null;
}

function resolveTraceSegmentDurationMs(segment: BuddyOutputTraceSegment) {
  return resolveTraceSegmentDurationMsAt(segment, traceClockNowMs.value);
}

function resolveTraceRecordDurationMs(record: BuddyOutputTraceRecord) {
  return resolveTraceRecordDurationMsAt(record, traceClockNowMs.value);
}

function resolveTraceSegmentDurationMsAt(segment: BuddyOutputTraceSegment, nowMs: number) {
  if (segment.durationMs !== null) {
    return segment.durationMs;
  }
  if (segment.status === "running" && segment.startedAtMs !== null) {
    return Math.max(0, nowMs - segment.startedAtMs);
  }
  return null;
}

function resolveTraceRecordDurationMsAt(record: BuddyOutputTraceRecord, nowMs: number) {
  if (record.durationMs !== null) {
    return record.durationMs;
  }
  if (record.status === "running" && record.startedAtMs !== null) {
    return Math.max(0, nowMs - record.startedAtMs);
  }
  return null;
}

function buildTraceSegmentDurationKey(messageId: string) {
  return `segment:${messageId}`;
}

function buildTraceRecordDurationKey(messageId: string, recordId: string) {
  return `record:${messageId}:${recordId}`;
}

function collectTraceDurationTargets(nowMs: number) {
  const targets: Record<string, TraceDurationTarget> = {};
  for (const message of messages.value) {
    if (!shouldRenderMessage(message) || !message.outputTrace) {
      continue;
    }
    const segmentDurationMs = resolveTraceSegmentDurationMsAt(message.outputTrace, nowMs);
    if (segmentDurationMs !== null) {
      targets[buildTraceSegmentDurationKey(message.id)] = {
        durationMs: segmentDurationMs,
        animateInitial: message.outputTrace.status === "running",
      };
    }
    for (const record of message.outputTrace.records) {
      const recordDurationMs = resolveTraceRecordDurationMsAt(record, nowMs);
      if (recordDurationMs !== null) {
        targets[buildTraceRecordDurationKey(message.id, record.recordId)] = {
          durationMs: recordDurationMs,
          animateInitial: record.status === "running",
        };
      }
    }
  }
  return targets;
}

function updateTraceDurationDisplays(nowMs: number) {
  traceClockNowMs.value = nowMs;
  const previousDisplays = traceDurationDisplayByKey.value;
  const targets = collectTraceDurationTargets(nowMs);
  const nextDisplays: Record<string, SmoothNumberDisplayState> = {};
  for (const [key, target] of Object.entries(targets)) {
    nextDisplays[key] = advanceSmoothNumberDisplay(previousDisplays[key], target.durationMs, nowMs, {
      ...TRACE_DURATION_SMOOTH_OPTIONS,
      initialValue: target.animateInitial ? 0 : target.durationMs,
    });
  }
  traceDurationDisplayByKey.value = nextDisplays;
}

function hasUnsettledTraceDurationDisplay() {
  return Object.values(traceDurationDisplayByKey.value).some(
    (display) => !isSmoothNumberDisplaySettled(display, TRACE_DURATION_SMOOTH_OPTIONS),
  );
}

function formatTraceDuration(displayKey: string, durationMs: number | null | undefined) {
  const display = traceDurationDisplayByKey.value[displayKey];
  return formatRunDuration(display?.value ?? durationMs ?? undefined, { secondsFractionDigits: 2 });
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
    outputTrace: resolveOutputTraceBuddyMessageMetadata(record.metadata) ?? undefined,
  };
}

function buildBuddyMessageMetadata(message: BuddyMessage) {
  if (message.outputTrace) {
    return buildOutputTraceBuddyMessageMetadata(message.outputTrace);
  }
  return null;
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
  transition: transform var(--buddy-widget-roam-duration-ms, 360ms) cubic-bezier(0.2, 1.05, 0.32, 1);
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

.buddy-widget__virtual-cursor {
  appearance: none;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 4524;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  transform-origin: 50% 58%;
  will-change: translate, rotate;
  filter:
    drop-shadow(0 5px 9px rgba(40, 32, 20, 0.22))
    drop-shadow(0 0 8px rgba(242, 201, 104, 0.32))
    drop-shadow(0 0 2px rgba(255, 251, 235, 0.82));
  transition:
    translate var(--buddy-widget-virtual-cursor-move-duration-ms, 180ms) linear,
    rotate var(--buddy-widget-virtual-cursor-rotate-duration-ms, 120ms) ease,
    filter 140ms ease;
}

.buddy-widget__virtual-cursor--launching {
  transition:
    translate var(--buddy-widget-virtual-cursor-morph-duration-ms, 360ms) cubic-bezier(0.2, 0.9, 0.22, 1),
    rotate 120ms ease,
    filter 140ms ease;
}

.buddy-widget__virtual-cursor--returning {
  transition:
    translate var(--buddy-widget-virtual-cursor-morph-duration-ms, 360ms) cubic-bezier(0.2, 0.9, 0.22, 1),
    filter 140ms ease;
}

.buddy-widget__virtual-cursor-svg {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
  scale: var(--buddy-widget-virtual-cursor-scale);
  transition: scale 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.buddy-widget__virtual-cursor-shape {
  stroke: #171818;
  stroke-width: 8;
  stroke-linecap: round;
  stroke-linejoin: round;
  paint-order: stroke fill;
}

.buddy-widget__virtual-cursor--returning .buddy-widget__virtual-cursor-shape {
  stroke-width: 0;
}

.buddy-widget__virtual-cursor--floating .buddy-widget__virtual-cursor-svg {
  animation: buddy-widget-virtual-cursor-float 1.8s ease-in-out infinite;
}

.buddy-widget__virtual-cursor--launching .buddy-widget__virtual-cursor-svg,
.buddy-widget__virtual-cursor--returning .buddy-widget__virtual-cursor-svg {
  transition: scale var(--buddy-widget-virtual-cursor-morph-duration-ms, 360ms) cubic-bezier(0.2, 0.9, 0.22, 1);
}

.buddy-widget__virtual-cursor:active {
  cursor: grabbing;
  filter:
    drop-shadow(0 4px 7px rgba(40, 32, 20, 0.26))
    drop-shadow(0 0 8px rgba(242, 201, 104, 0.36))
    drop-shadow(0 0 2px rgba(255, 251, 235, 0.9));
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

.buddy-widget__avatar--roaming.buddy-widget__avatar--hop-cycle-a {
  animation: buddy-widget-avatar-hop-path-a var(--buddy-widget-roam-duration-ms, 360ms) cubic-bezier(0.2, 1.05, 0.32, 1) both;
}

.buddy-widget__avatar--roaming.buddy-widget__avatar--hop-cycle-b {
  animation: buddy-widget-avatar-hop-path-b var(--buddy-widget-roam-duration-ms, 360ms) cubic-bezier(0.2, 1.05, 0.32, 1) both;
}

.buddy-widget__avatar--hopping.buddy-widget__avatar--hop-cycle-a {
  animation: buddy-widget-avatar-hop-path-a var(--buddy-widget-hop-duration-ms, 360ms) cubic-bezier(0.2, 1.05, 0.32, 1) both;
}

.buddy-widget__avatar--hopping.buddy-widget__avatar--hop-cycle-b {
  animation: buddy-widget-avatar-hop-path-b var(--buddy-widget-hop-duration-ms, 360ms) cubic-bezier(0.2, 1.05, 0.32, 1) both;
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
.buddy-widget__virtual-cursor:focus-visible,
.buddy-widget__icon-button:focus-visible,
.buddy-widget__send:focus-visible,
.buddy-widget__input:focus-visible,
.buddy-widget__session-item:focus-visible,
.buddy-widget__session-delete:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}

@keyframes buddy-widget-avatar-hop-path-a {
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

@keyframes buddy-widget-avatar-hop-path-b {
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

@keyframes buddy-widget-virtual-cursor-float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-2px) rotate(-1deg);
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

.buddy-widget__message--grouped {
  margin-top: -5px;
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

.buddy-widget__run-trace {
  width: min(100%, 330px);
  display: grid;
  gap: 7px;
}

.buddy-widget__run-trace-summary {
  min-height: 34px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  padding: 6px 9px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 999px;
  background: rgba(247, 255, 250, 0.88);
  color: rgba(45, 32, 21, 0.86);
  box-shadow: 0 10px 26px rgba(24, 105, 70, 0.1);
  cursor: pointer;
}

.buddy-widget__run-trace-summary:hover {
  border-color: rgba(16, 185, 129, 0.34);
  background: rgba(244, 255, 248, 0.98);
}

.buddy-widget__run-trace-title {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__run-trace-duration,
.buddy-widget__run-trace-row-duration {
  color: rgba(70, 53, 38, 0.66);
  font-family: var(--toograph-font-mono);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.buddy-widget__run-trace-chevron {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid rgba(70, 53, 38, 0.58);
  border-bottom: 1.5px solid rgba(70, 53, 38, 0.58);
  transform: rotate(45deg) translateY(-1px);
  transition: transform 140ms ease;
}

.buddy-widget__run-trace-chevron--expanded {
  transform: rotate(225deg) translateY(-1px);
}

.buddy-widget__run-trace-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}

.buddy-widget__run-trace-dot--small {
  width: 7px;
  height: 7px;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
}

.buddy-widget__run-trace-dot--running {
  animation: buddy-run-trace-pulse 1.25s ease-in-out infinite;
}

.buddy-widget__run-trace-dot--failed {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}

.buddy-widget__run-trace-detail {
  display: grid;
  gap: 8px;
  max-width: 100%;
  padding: 10px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.78);
  box-shadow: 0 14px 34px rgba(60, 41, 20, 0.08);
}

.buddy-widget__run-trace-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.buddy-widget__run-trace-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: rgba(45, 32, 21, 0.82);
}

.buddy-widget__run-trace-row-label {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__run-trace-total {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 7px;
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  color: rgba(108, 82, 62, 0.72);
  font-size: 11px;
  font-weight: 700;
}

.buddy-widget__run-trace-total strong {
  color: rgba(45, 32, 21, 0.82);
  font-family: var(--toograph-font-mono);
  font-size: 11px;
}

@keyframes buddy-run-trace-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.02);
    transform: scale(1.12);
  }
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
