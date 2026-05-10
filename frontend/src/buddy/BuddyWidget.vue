<template>
  <div class="buddy-widget" aria-live="polite">
    <aside
      v-if="shouldShowMascotDebugPanel"
      class="buddy-widget__debug-panel"
      aria-label="Mascot action debug panel"
    >
      <div class="buddy-widget__debug-title">动作调试</div>
      <div v-for="group in BUDDY_DEBUG_ACTION_GROUPS" :key="group.label" class="buddy-widget__debug-group">
        <span class="buddy-widget__debug-label">{{ group.label }}</span>
        <div class="buddy-widget__debug-actions">
          <button
            v-for="action in group.actions"
            :key="action.action"
            type="button"
            class="buddy-widget__debug-button"
            @click="triggerMascotDebugAction(action.action)"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
    </aside>
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
                class="buddy-widget__model-select graphite-select"
                popper-class="graphite-select-popper buddy-widget__select-popper"
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
                class="buddy-widget__mode-select graphite-select"
                popper-class="graphite-select-popper buddy-widget__select-popper"
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
            <section
              v-if="shouldShowRunTraceForMessage(message)"
              class="buddy-widget__run-trace"
              :class="{
                'buddy-widget__run-trace--expanded': isRunTraceExpanded,
                'buddy-widget__run-trace--finished': runTraceFinishedAtMs !== null,
              }"
            >
              <button
                type="button"
                class="buddy-widget__run-trace-toggle"
                :title="isRunTraceExpanded ? t('buddy.runTraceCollapse') : t('buddy.runTraceExpand')"
                :aria-expanded="isRunTraceExpanded"
                @click="isRunTraceExpanded = !isRunTraceExpanded"
              >
                <span>{{ runTraceHeaderText }}</span>
                <ElIcon><ArrowDown /></ElIcon>
              </button>
              <div v-if="shouldShowRunTraceBody" class="buddy-widget__run-trace-body">
                <div
                  v-for="entry in visibleRunTraceEntries"
                  :key="entry.replaceKey"
                  class="buddy-widget__run-trace-entry"
                  :class="`buddy-widget__run-trace-entry--${entry.tone}`"
                >
                  <span class="buddy-widget__run-trace-dot" aria-hidden="true" />
                  <p>
                    <strong>
                      <span class="buddy-widget__run-trace-label">{{ t(entry.labelKey, entry.params) }}</span>
                      <span v-if="entry.durationMs !== undefined" class="buddy-widget__run-trace-duration">
                        {{ formatRunTraceDuration(entry.durationMs) }}
                      </span>
                    </strong>
                    <span v-if="entry.preview" class="buddy-widget__run-trace-preview">{{ entry.preview }}</span>
                  </p>
                </div>
              </div>
            </section>
            <section v-if="shouldShowPausedRunCard(message)" class="buddy-widget__pause-card">
              <div class="buddy-widget__pause-header">
                <div>
                  <strong>{{ t("buddy.pause.title") }}</strong>
                  <small v-if="pausedBuddyScopeText">{{ pausedBuddyScopeText }}</small>
                </div>
                <span>{{ t("status.awaitingHuman") }}</span>
              </div>
              <p class="buddy-widget__pause-summary">
                {{ pausedBuddyReviewModel?.summaryText || t("buddy.pause.body") }}
              </p>
              <div v-if="pausedBuddyRequiredRows.length > 0" class="buddy-widget__pause-section">
                <strong>{{ t("buddy.pause.requiredTitle") }}</strong>
                <label
                  v-for="row in pausedBuddyRequiredRows"
                  :key="row.key"
                  class="buddy-widget__pause-row buddy-widget__pause-row--editable"
                >
                  <span>{{ row.label }}</span>
                  <small v-if="row.description">{{ row.description }}</small>
                  <ElInput
                    :model-value="resolvePausedBuddyDraft(row)"
                    class="buddy-widget__pause-input"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 5 }"
                    @update:model-value="setPausedBuddyDraft(row.key, $event)"
                  />
                </label>
              </div>
              <div v-if="pausedBuddyProducedRows.length > 0" class="buddy-widget__pause-section">
                <strong>{{ t("buddy.pause.producedTitle") }}</strong>
                <div v-for="row in pausedBuddyProducedRows" :key="row.key" class="buddy-widget__pause-row">
                  <span>{{ row.label }}</span>
                  <small v-if="row.description">{{ row.description }}</small>
                  <pre>{{ row.draft || t("buddy.pause.emptyValue") }}</pre>
                </div>
              </div>
              <p
                v-if="pausedBuddyRequiredRows.length === 0 && pausedBuddyProducedRows.length === 0"
                class="buddy-widget__pause-summary"
              >
                {{ t("buddy.pause.empty") }}
              </p>
              <div class="buddy-widget__pause-actions">
                <ElButton
                  size="small"
                  type="primary"
                  :loading="pausedBuddyResumeBusy"
                  :disabled="isPausedBuddyResumeBlocked"
                  @click="resumePausedBuddyRun()"
                >
                  {{ t("buddy.pause.continue") }}
                </ElButton>
              </div>
            </section>
            <template v-else>
              <div
                v-if="message.role === 'assistant' && message.content"
                class="buddy-widget__message-bubble buddy-widget__message-markdown"
                v-html="renderBuddyMarkdown(message.content)"
              />
              <p
                v-else-if="shouldShowAssistantActivityBubble(message)"
                class="buddy-widget__message-bubble"
                :class="{ 'buddy-widget__message-activity': !message.content && message.activityText }"
              >
                {{ message.activityText || t("buddy.streaming") }}
              </p>
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
            :placeholder="t('buddy.placeholder')"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            type="submit"
            class="buddy-widget__send"
            :disabled="!draft.trim()"
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
import { ArrowDown, Check, Clock, Close, Delete, FullScreen, Plus, Promotion, SemiSelect } from "@element-plus/icons-vue";
import { ElButton, ElInput } from "element-plus";
import { ElIcon, ElOption, ElPopover, ElSelect } from "element-plus";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import {
  appendBuddyChatMessage,
  createBuddyChatSession,
  deleteBuddyChatSession,
  fetchBuddyChatMessages,
  fetchBuddyChatSessions,
} from "../api/buddy.ts";
import { fetchTemplate, runGraph } from "../api/graphs.ts";
import { fetchRun, resumeRun } from "../api/runs.ts";
import { fetchSettings } from "../api/settings.ts";
import { fetchSkillCatalog } from "../api/skills.ts";
import { resolveOutputPreviewContent } from "../editor/nodes/outputPreviewContentModel.ts";
import {
  buildHumanReviewPanelModel,
  buildHumanReviewResumePayload,
  type HumanReviewPanelModel,
  type HumanReviewRow,
} from "../editor/workspace/humanReviewPanelModel.ts";
import { formatRunDuration } from "../lib/run-display-name.ts";
import { buildRuntimeModelOptions } from "../lib/runtimeModelCatalog.ts";
import { buildRunEventStreamUrl, parseRunEventPayload, shouldPollRunStatus } from "../lib/run-event-stream.ts";
import { useBuddyContextStore } from "../stores/buddyContext.ts";
import type { BuddyChatMessageRecord, BuddyChatSession } from "../types/buddy.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type { SettingsPayload } from "../types/settings.ts";

import BuddyMascot from "./BuddyMascot.vue";
import { buildBuddyPageContext } from "./buddyPageContext.ts";
import {
  BUDDY_REVIEW_TEMPLATE_ID,
  BUDDY_TEMPLATE_ID,
  BUDDY_MODE_OPTIONS,
  DEFAULT_BUDDY_MODE,
  buildBuddyChatGraph,
  buildBuddyReviewGraph,
  resolveBuddyMode,
  resolveBuddyRunActivityFromRunEvent,
  resolveBuddyRunTraceFromRunEvent,
  resolveBuddyReplyFromRunEvent,
  resolveBuddyReplyText,
  type BuddyChatMessage,
  type BuddyMode,
  type BuddyRunTraceEntry,
} from "./buddyChatGraph.ts";
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
};

type BuddyMessagePatch = Partial<Pick<BuddyMessage, "content" | "includeInContext" | "activityText">>;

type BuddyQueuedTurn = {
  userMessageId: string;
  assistantMessageId: string;
  userMessage: string;
  sessionId: string;
  history: BuddyChatMessage[];
};

type BuddyMood = "idle" | "thinking" | "speaking" | "error";
type BuddyMascotMotion = "idle" | "roam" | "hop";
type BuddyMascotFacing = "front" | "left" | "right";
type BuddyMascotDebugAction = "idle" | "thinking" | "speaking" | "error" | "tap" | "dragging" | "hop" | "roam" | "face-left" | "face-front" | "face-right";
type BuddyMascotDebugActionGroup = {
  label: string;
  actions: Array<{
    label: string;
    action: BuddyMascotDebugAction;
  }>;
};
type BuddyModelOption = {
  value: string;
  label: string;
};

const BUDDY_HISTORY_STORAGE_KEY = "graphiteui:buddy-history";
const BUDDY_ACTIVE_SESSION_STORAGE_KEY = "graphiteui:buddy-active-session";
const BUDDY_MODEL_STORAGE_KEY = "graphiteui:buddy-model";
const DRAG_THRESHOLD_PX = 4;
const AVATAR_SINGLE_CLICK_DELAY_MS = 220;
const RUN_POLL_INTERVAL_MS = 700;
const RUN_POLL_TIMEOUT_MS = 240000;
const RUN_TRACE_MAX_ENTRIES = 24;
const BUDDY_ROAM_MIN_DELAY_MS = 8000;
const BUDDY_ROAM_MAX_DELAY_MS = 18000;
const BUDDY_ROAM_MOVE_DURATION_MS = 980;
const BUDDY_ROAM_STEP_PAUSE_MS = 120;
const BUDDY_ROAM_STEP_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width;
const BUDDY_ROAM_TARGET_MIN_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width;
const BUDDY_ROAM_TARGET_MAX_DISTANCE_PX = DEFAULT_BUDDY_SIZE.width * 3;
const BUDDY_ROAM_TARGET_REACHED_DISTANCE_PX = 1;
const BUDDY_DEBUG_ACTION_GROUPS: BuddyMascotDebugActionGroup[] = [
  {
    label: "状态",
    actions: [
      { label: "Idle", action: "idle" },
      { label: "Thinking", action: "thinking" },
      { label: "Speaking", action: "speaking" },
      { label: "Error", action: "error" },
    ],
  },
  {
    label: "动作",
    actions: [
      { label: "Tap", action: "tap" },
      { label: "Drag", action: "dragging" },
      { label: "Hop", action: "hop" },
      { label: "Roam", action: "roam" },
    ],
  },
  {
    label: "朝向",
    actions: [
      { label: "Left", action: "face-left" },
      { label: "Front", action: "face-front" },
      { label: "Right", action: "face-right" },
    ],
  },
];

const { t } = useI18n();
const route = useRoute();
const buddyContextStore = useBuddyContextStore();

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
const runTraceEntries = ref<BuddyRunTraceEntry[]>([]);
const errorMessage = ref("");
const mood = ref<BuddyMood>("idle");
const tapNonce = ref(0);
const activeRunId = ref<string | null>(null);
const activeTraceMessageId = ref<string | null>(null);
const isRunTraceExpanded = ref(false);
const runTraceStartedAtMs = ref<number | null>(null);
const runTraceFinishedAtMs = ref<number | null>(null);
const pausedBuddyRun = ref<RunDetail | null>(null);
const pausedBuddyAssistantMessageId = ref<string | null>(null);
const pausedBuddyDraftsByKey = ref<Record<string, string>>({});
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
const backgroundReviewAbortControllers = new Set<AbortController>();
const runTraceStartedAtByKey = new Map<string, number>();
let nextBuddyMessageClientOrder = 0;

const isDragging = computed(() => Boolean(pointerDrag.value?.moved));
const isMascotDragging = computed(() => isDragging.value || debugDragging.value);
const shouldShowMascotDebugPanel = computed(() => route.path === "/buddy");
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
    activeRunId.value !== null ||
    (activeTraceMessageId.value !== null && runTraceFinishedAtMs.value === null),
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
const shouldShowRunTraceBody = computed(() => runTraceFinishedAtMs.value === null || isRunTraceExpanded.value);
const visibleRunTraceEntries = computed(() => {
  if (isRunTraceExpanded.value || runTraceEntries.value.length <= 1) {
    return runTraceEntries.value;
  }
  return runTraceEntries.value.slice(-1);
});
const runTraceHeaderText = computed(() => {
  const startedAt = runTraceStartedAtMs.value;
  const finishedAt = runTraceFinishedAtMs.value;
  if (startedAt !== null && finishedAt !== null) {
    return t("buddy.runTraceElapsed", {
      duration: formatRunTraceDuration(Math.max(1, Math.round(finishedAt - startedAt))),
    });
  }
  return t("buddy.runTraceLabel");
});
const pausedBuddyReviewModel = computed<HumanReviewPanelModel | null>(() => {
  const run = pausedBuddyRun.value;
  if (!run) {
    return null;
  }
  return buildHumanReviewPanelModel(run, run.graph_snapshot as unknown as GraphPayload);
});
const pausedBuddyRequiredRows = computed(() => pausedBuddyReviewModel.value?.requiredNow ?? []);
const pausedBuddyProducedRows = computed(() => pausedBuddyReviewModel.value?.producedRows ?? []);
const pausedBuddyScopeText = computed(() => pausedBuddyReviewModel.value?.scopePath.join(" / ") ?? "");
const isPausedBuddyResumeBlocked = computed(() =>
  pausedBuddyRequiredRows.value.some((row) => !resolvePausedBuddyDraft(row).trim()),
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
  const userMessage = draft.value.trim();
  if (!userMessage) {
    return;
  }

  cancelBuddyRoamTimers();
  clearBuddyDebugActionTimer();
  errorMessage.value = "";
  isPanelOpen.value = true;
  await waitForChatSessionInitialization();
  const sessionId = await ensureActiveChatSession();
  if (!sessionId) {
    return;
  }
  if (pausedBuddyRun.value && pausedBuddyResumeBusy.value) {
    return;
  }
  draft.value = "";

  if (pausedBuddyRun.value) {
    const userEntry = createMessage("user", userMessage, undefined, allocateBuddyMessageClientOrder());
    messages.value.push(userEntry);
    movePausedBuddyAssistantAfterMessage(userEntry.id);
    void persistBuddyMessage(sessionId, userEntry);
    await resumePausedBuddyRun(userMessage);
    await scrollMessagesToBottom();
    return;
  }

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
      if (pausedBuddyRun.value) {
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
  resetRunTraceForMessage(assistantMessage.id);
  mood.value = "thinking";
  setAssistantActivityText(assistantMessage.id, t("buddy.activity.preparing"));
  appendLocalRunTraceStart("local:preparing", "buddy.activity.preparing");
  await scrollMessagesToBottom();

  try {
    activeAbortController = new AbortController();
    const [template, skillCatalog] = await Promise.all([
      fetchTemplate(BUDDY_TEMPLATE_ID),
      fetchSkillCatalog({ includeDisabled: true }),
    ]);
    const graph = buildBuddyChatGraph(template, {
      userMessage: turn.userMessage,
      history,
      pageContext: buildPageContext(),
      buddyMode: buddyMode.value,
      buddyModel: buddyModelRef.value,
      skillCatalog,
    });
    completeLocalRunTrace("local:preparing", "buddy.activity.prepared");
    setAssistantActivityText(assistantMessage.id, t("buddy.activity.starting"));
    appendLocalRunTraceStart("local:starting", "buddy.activity.starting");
    const run = await runGraph(graph);
    completeLocalRunTrace("local:starting", "buddy.activity.started");
    activeRunId.value = run.run_id;
    startRunEventStream(run.run_id, assistantMessage.id, graph);
    const runDetail = await pollRunUntilFinished(run.run_id, activeAbortController.signal);
    if (runDetail.status === "awaiting_human") {
      keepRunPaused = true;
      handleBuddyRunAwaitingHuman(runDetail, assistantMessage.id);
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
    appendRunTraceEntry("node.failed", {
      labelKey: "buddy.activity.failed",
      params: { node: t("buddy.name") },
      preview: message,
      tone: "error",
      replaceKey: "local:error",
    });
    updateAssistantMessage(assistantMessage.id, t("buddy.errorReply", { error: message }), { includeInContext: false });
    void persistBuddyMessage(turn.sessionId, messages.value.find((entry) => entry.id === assistantMessage.id), {
      includeInContext: false,
    });
  } finally {
    closeEventSource();
    if (!keepRunPaused) {
      markRunTraceFinished();
      activeRunId.value = null;
    }
    activeAbortController = null;
    scheduleBuddySpeakingIdleIfNeeded();
    await scrollMessagesToBottom();
  }
}

async function resumePausedBuddyRun(text?: string) {
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
  appendRunTraceEntry("node.started", {
    labelKey: "buddy.activity.resuming",
    params: {},
    preview: "",
    tone: "info",
    replaceKey: "local:resuming",
    timingKey: "local:resuming",
  });
  setAssistantActivityText(assistantMessageId, t("buddy.activity.resuming"));

  try {
    const resumePayload = text?.trim()
      ? buildBuddyResumePayloadFromText(text)
      : buildBuddyResumePayloadFromDrafts();
    activeAbortController = new AbortController();
    const response = await resumeRun(run.run_id, resumePayload);
    activeRunId.value = response.run_id;
    appendRunTraceEntry("node.completed", {
      labelKey: "buddy.activity.resumed",
      params: {},
      preview: "",
      tone: "success",
      replaceKey: "local:resuming",
      timingKey: "local:resuming",
    });
    pausedBuddyRun.value = null;
    pausedBuddyAssistantMessageId.value = null;
    pausedBuddyDraftsByKey.value = {};
    startRunEventStream(response.run_id, assistantMessageId, run.graph_snapshot as unknown as GraphPayload);
    const resumedRunDetail = await pollRunUntilFinished(response.run_id, activeAbortController.signal);
    if (resumedRunDetail.status === "awaiting_human") {
      handleBuddyRunAwaitingHuman(resumedRunDetail, assistantMessageId);
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
    appendRunTraceEntry("node.failed", {
      labelKey: "buddy.activity.failed",
      params: { node: t("buddy.name") },
      preview: message,
      tone: "error",
      replaceKey: "local:resuming",
      timingKey: "local:resuming",
    });
  } finally {
    pausedBuddyResumeBusy.value = false;
    closeEventSource();
    if (!pausedBuddyRun.value) {
      markRunTraceFinished();
      activeRunId.value = null;
    }
    activeAbortController = null;
    scheduleBuddySpeakingIdleIfNeeded();
    await scrollMessagesToBottom();
  }
}

function handleBuddyRunAwaitingHuman(run: RunDetail, assistantMessageId: string) {
  pausedBuddyRun.value = run;
  pausedBuddyAssistantMessageId.value = assistantMessageId;
  pausedBuddyDraftsByKey.value = buildPausedBuddyDraftsByKey(run);
  activeRunId.value = run.run_id;
  mood.value = "thinking";
  setAssistantActivityText(assistantMessageId, t("buddy.pause.activity"));
  appendRunTraceEntry("node.completed", {
    labelKey: "buddy.activity.awaitingApproval",
    params: {},
    preview: "",
    tone: "info",
    replaceKey: "local:awaiting-human",
    timingKey: "local:awaiting-human",
  });
}

function finishBuddyVisibleRun(runDetail: RunDetail, assistantMessageId: string, sessionId: string, runId: string) {
  const finalReply = resolveBuddyReplyText(runDetail);
  const includeReplyInContext = runDetail.status !== "failed";
  updateAssistantMessage(assistantMessageId, finalReply || t("buddy.emptyReply"), {
    includeInContext: includeReplyInContext,
  });
  void persistBuddyMessage(sessionId, messages.value.find((message) => message.id === assistantMessageId), {
    runId,
    includeInContext: includeReplyInContext,
  });
  void startBuddySelfReviewRun(runDetail);
  mood.value = runDetail.status === "failed" ? "error" : "speaking";
  if (runDetail.status === "completed") {
    buddyContextStore.notifyBuddyDataChanged();
  }
  if (runDetail.status === "failed") {
    errorMessage.value = runDetail.errors?.[0] ?? t("buddy.runFailed");
  }
}

async function startBuddySelfReviewRun(mainRun: RunDetail) {
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
    void pollBuddySelfReviewRun(reviewRun.run_id);
  } catch (error) {
    console.warn("[Buddy] Background self-review failed to start.", error);
  }
}

async function pollBuddySelfReviewRun(runId: string) {
  const controller = new AbortController();
  backgroundReviewAbortControllers.add(controller);
  try {
    const run = await pollRunUntilFinished(runId, controller.signal);
    if (run.status === "completed") {
      buddyContextStore.notifyBuddyDataChanged();
    } else if (run.status === "failed") {
      console.warn("[Buddy] Background self-review failed.", run.errors);
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.warn("[Buddy] Background self-review polling failed.", error);
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

function appendLocalRunTraceStart(replaceKey: string, labelKey: string) {
  appendRunTraceEntry("node.started", {
    labelKey,
    params: {},
    preview: "",
    tone: "info",
    replaceKey,
    timingKey: replaceKey,
  });
}

function completeLocalRunTrace(replaceKey: string, labelKey: string) {
  appendRunTraceEntry("node.completed", {
    labelKey,
    params: {},
    preview: "",
    tone: "success",
    replaceKey,
    timingKey: replaceKey,
  });
}

async function clearMessages() {
  queuedTurns.value = [];
  runTraceEntries.value = [];
  activeTraceMessageId.value = null;
  isRunTraceExpanded.value = false;
  runTraceStartedAtMs.value = null;
  runTraceFinishedAtMs.value = null;
  runTraceStartedAtByKey.clear();
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
  isSessionLoading.value = true;
  errorMessage.value = "";
  try {
    const records = await fetchBuddyChatMessages(sessionId);
    activeSessionId.value = sessionId;
    window.localStorage.setItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY, sessionId);
    messages.value = records.map(messageRecordToBuddyMessage);
    resetNextBuddyMessageClientOrder();
    resetVisibleRunTrace();
    await scrollMessagesToBottom();
  } catch (error) {
    errorMessage.value = t("buddy.historyLoadFailed", { error: formatErrorMessage(error) });
  } finally {
    isSessionLoading.value = false;
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
        resetVisibleRunTrace();
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
      run_id: options.runId ?? null,
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

function resetVisibleRunTrace() {
  runTraceEntries.value = [];
  activeTraceMessageId.value = null;
  isRunTraceExpanded.value = false;
  runTraceStartedAtMs.value = null;
  runTraceFinishedAtMs.value = null;
  runTraceStartedAtByKey.clear();
  resetPausedBuddyPause();
}

function resetPausedBuddyPause() {
  pausedBuddyRun.value = null;
  pausedBuddyAssistantMessageId.value = null;
  pausedBuddyDraftsByKey.value = {};
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

function startRunEventStream(runId: string, assistantMessageId: string, graph: GraphPayload) {
  closeEventSource();
  const streamUrl = buildRunEventStreamUrl(runId);
  if (!streamUrl || typeof EventSource === "undefined") {
    return;
  }

  eventSource = new EventSource(streamUrl);
  const handleStreamingEvent = (eventType: string, event: Event) => {
    const payload = parseRunEventPayload(event);
    if (!payload) {
      return;
    }
    const traceEntry = resolveBuddyRunTraceFromRunEvent(eventType, payload, graph);
    if (traceEntry) {
      appendRunTraceEntry(eventType, traceEntry);
    }
    const nextText = resolveBuddyReplyFromRunEvent(payload, graph);
    if (!nextText) {
      setAssistantActivityFromRunEvent(assistantMessageId, eventType, payload, graph);
      if (traceEntry) {
        void scrollMessagesToBottom();
      }
      return;
    }
    mood.value = "speaking";
    if (!hasAssistantMessageContent(assistantMessageId)) {
      markRunTraceFinished();
    }
    updateAssistantMessage(assistantMessageId, nextText);
    void scrollMessagesToBottom();
  };
  eventSource.addEventListener("node.started", (event) => handleStreamingEvent("node.started", event));
  eventSource.addEventListener("node.output.delta", (event) => handleStreamingEvent("node.output.delta", event));
  eventSource.addEventListener("node.output.completed", (event) => handleStreamingEvent("node.output.completed", event));
  eventSource.addEventListener("state.updated", (event) => handleStreamingEvent("state.updated", event));
  eventSource.addEventListener("node.completed", (event) => handleStreamingEvent("node.completed", event));
  eventSource.addEventListener("node.failed", (event) => handleStreamingEvent("node.failed", event));
  eventSource.addEventListener("run.completed", closeEventSource);
  eventSource.addEventListener("run.failed", closeEventSource);
  eventSource.onerror = closeEventSource;
}

async function pollRunUntilFinished(runId: string, signal: AbortSignal): Promise<RunDetail> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < RUN_POLL_TIMEOUT_MS) {
    const run = await fetchRun(runId, { signal });
    if (!shouldPollRunStatus(run.status)) {
      return run;
    }
    await delay(RUN_POLL_INTERVAL_MS, signal);
  }
  throw new Error(t("buddy.runTimeout"));
}

function closeEventSource() {
  eventSource?.close();
  eventSource = null;
}

function resetRunTraceForMessage(messageId: string) {
  activeTraceMessageId.value = messageId;
  runTraceEntries.value = [];
  isRunTraceExpanded.value = false;
  runTraceStartedAtMs.value = nowRunTraceMs();
  runTraceFinishedAtMs.value = null;
  runTraceStartedAtByKey.clear();
}

function markRunTraceFinished() {
  if (!activeTraceMessageId.value || runTraceFinishedAtMs.value !== null) {
    return;
  }
  runTraceFinishedAtMs.value = nowRunTraceMs();
  isRunTraceExpanded.value = false;
}

function shouldShowRunTraceForMessage(message: BuddyMessage) {
  return message.id === activeTraceMessageId.value && runTraceEntries.value.length > 0;
}

function shouldRenderMessage(message: BuddyMessage) {
  return (
    message.role === "user" ||
    Boolean(message.content.trim()) ||
    Boolean(message.activityText?.trim()) ||
    shouldShowRunTraceForMessage(message) ||
    shouldShowPausedRunCard(message)
  );
}

function shouldShowAssistantActivityBubble(message: BuddyMessage) {
  return (
    message.role === "assistant" &&
    !message.content.trim() &&
    Boolean(message.activityText?.trim()) &&
    !shouldShowRunTraceForMessage(message) &&
    !shouldShowPausedRunCard(message)
  );
}

function shouldShowPausedRunCard(message: BuddyMessage) {
  return (
    message.role === "assistant" &&
    pausedBuddyRun.value?.status === "awaiting_human" &&
    pausedBuddyAssistantMessageId.value === message.id
  );
}

function appendRunTraceEntry(eventType: string, traceEntry: BuddyRunTraceEntry) {
  const timedTraceEntry = applyRunTraceTiming(eventType, traceEntry);
  const existingIndex = runTraceEntries.value.findIndex((entry) => entry.replaceKey === timedTraceEntry.replaceKey);
  if (existingIndex >= 0) {
    runTraceEntries.value.splice(existingIndex, 1, mergeRunTraceEntry(runTraceEntries.value[existingIndex], timedTraceEntry));
  } else {
    runTraceEntries.value.push(timedTraceEntry);
  }
  if (runTraceEntries.value.length > RUN_TRACE_MAX_ENTRIES) {
    runTraceEntries.value.splice(0, runTraceEntries.value.length - RUN_TRACE_MAX_ENTRIES);
  }
}

function mergeRunTraceEntry(existingEntry: BuddyRunTraceEntry, nextEntry: BuddyRunTraceEntry): BuddyRunTraceEntry {
  if (nextEntry.preview || !existingEntry.preview) {
    return nextEntry;
  }
  return {
    ...nextEntry,
    preview: existingEntry.preview,
  };
}

function applyRunTraceTiming(eventType: string, traceEntry: BuddyRunTraceEntry): BuddyRunTraceEntry {
  if (eventType === "node.started" && traceEntry.timingKey) {
    runTraceStartedAtByKey.set(traceEntry.timingKey, nowRunTraceMs());
    return traceEntry;
  }
  if (
    traceEntry.timingKey &&
    traceEntry.durationMs === undefined &&
    (eventType === "node.completed" || eventType === "node.failed" || eventType === "node.output.completed")
  ) {
    const startedAt = runTraceStartedAtByKey.get(traceEntry.timingKey);
    if (startedAt !== undefined) {
      runTraceStartedAtByKey.delete(traceEntry.timingKey);
      return {
        ...traceEntry,
        durationMs: Math.max(1, Math.round(nowRunTraceMs() - startedAt)),
      };
    }
  }
  return traceEntry;
}

function nowRunTraceMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function formatRunTraceDuration(durationMs: number | undefined) {
  return formatRunDuration(durationMs);
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

function hasAssistantMessageContent(messageId: string) {
  return Boolean(messages.value.find((message) => message.id === messageId)?.content.trim());
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

function movePausedBuddyAssistantAfterMessage(messageId: string) {
  const assistantMessageId = pausedBuddyAssistantMessageId.value;
  if (!assistantMessageId) {
    return;
  }
  const assistantIndex = messages.value.findIndex((message) => message.id === assistantMessageId);
  if (assistantIndex < 0) {
    return;
  }
  const [assistantMessage] = messages.value.splice(assistantIndex, 1);
  const anchorIndex = messages.value.findIndex((message) => message.id === messageId);
  assistantMessage.clientOrder = allocateBuddyMessageClientOrder();
  messages.value.splice(anchorIndex >= 0 ? anchorIndex + 1 : messages.value.length, 0, assistantMessage);
}

function buildPausedBuddyDraftsByKey(run: RunDetail) {
  const model = buildHumanReviewPanelModel(run, run.graph_snapshot as unknown as GraphPayload);
  return Object.fromEntries(model.allRows.map((row) => [row.key, row.draft]));
}

function resolvePausedBuddyDraft(row: HumanReviewRow) {
  return pausedBuddyDraftsByKey.value[row.key] ?? row.draft;
}

function setPausedBuddyDraft(key: string, value: string | number) {
  pausedBuddyDraftsByKey.value = {
    ...pausedBuddyDraftsByKey.value,
    [key]: String(value ?? ""),
  };
}

function buildBuddyResumePayloadFromDrafts() {
  const model = pausedBuddyReviewModel.value;
  if (!model) {
    return {};
  }
  return buildHumanReviewResumePayload(model.allRows, pausedBuddyDraftsByKey.value);
}

function buildBuddyResumePayloadFromText(text: string) {
  const model = pausedBuddyReviewModel.value;
  if (!model) {
    return {};
  }
  const targetRow = chooseBuddyResumeTextRow(model);
  if (!targetRow) {
    return buildBuddyResumePayloadFromDrafts();
  }
  const draftsByKey = {
    ...pausedBuddyDraftsByKey.value,
    [targetRow.key]: text.trim(),
  };
  return buildHumanReviewResumePayload(model.allRows, draftsByKey);
}

function chooseBuddyResumeTextRow(model: HumanReviewPanelModel): HumanReviewRow | null {
  const emptyRequired = model.requiredNow.find((row) => !resolvePausedBuddyDraft(row).trim());
  if (emptyRequired) {
    return emptyRequired;
  }
  const firstRequired = model.requiredNow[0];
  if (firstRequired) {
    return firstRequired;
  }
  return (
    model.allRows.find((row) => {
      const normalizedName = `${row.key} ${row.label}`.toLowerCase();
      return normalizedName.includes("approval") || normalizedName.includes("decision") || normalizedName.includes("answer");
    }) ?? null
  );
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
  font-family: var(--graphite-font-ui);
}

.buddy-widget__debug-panel {
  position: fixed;
  left: 18px;
  bottom: 18px;
  z-index: 4520;
  width: min(320px, calc(100vw - 36px));
  display: grid;
  gap: 9px;
  padding: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 8px;
  background:
    var(--graphite-glass-specular),
    var(--graphite-glass-lens),
    rgba(255, 252, 247, 0.86);
  box-shadow: 0 18px 42px rgba(69, 42, 20, 0.12);
  backdrop-filter: blur(22px) saturate(1.25);
  pointer-events: auto;
}

.buddy-widget__debug-title {
  color: rgba(90, 59, 36, 0.96);
  font-size: 12px;
  font-weight: 850;
}

.buddy-widget__debug-group {
  display: grid;
  gap: 5px;
}

.buddy-widget__debug-label {
  color: rgba(108, 82, 62, 0.72);
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}

.buddy-widget__debug-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.buddy-widget__debug-button {
  appearance: none;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: rgba(77, 51, 32, 0.92);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 140ms ease,
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.buddy-widget__debug-button:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(239, 246, 255, 0.86);
  color: #1d4ed8;
}

.buddy-widget__debug-button:active {
  transform: translateY(0);
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
.buddy-widget__run-trace-toggle:focus-visible,
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
  border: 1px solid var(--graphite-glass-border);
  border-radius: 8px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), rgba(255, 252, 247, 0.88);
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
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
  color: var(--graphite-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}

.buddy-widget__heading h2 {
  margin: 3px 0 0;
  color: var(--graphite-text-strong);
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
  color: var(--graphite-text-muted);
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
  color: var(--graphite-text-muted);
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
  color: var(--graphite-accent-strong);
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
  border: 1px solid var(--graphite-glass-border);
  border-radius: 8px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), rgba(255, 252, 247, 0.94);
  box-shadow: var(--graphite-glass-highlight), 0 16px 38px rgba(61, 43, 24, 0.16);
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
  color: var(--graphite-text-strong);
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
  color: var(--graphite-text-strong);
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
  color: var(--graphite-text-muted);
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
  color: var(--graphite-text-muted);
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
  color: var(--graphite-text-muted);
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
  color: var(--graphite-text);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.buddy-widget__pause-card {
  display: grid;
  gap: 10px;
  width: min(100%, 360px);
  padding: 12px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  background: rgba(255, 251, 235, 0.82);
  color: var(--graphite-text);
  box-shadow: 0 12px 28px rgba(154, 52, 18, 0.09);
}

.buddy-widget__pause-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.buddy-widget__pause-header div,
.buddy-widget__pause-section,
.buddy-widget__pause-row {
  display: grid;
  gap: 4px;
}

.buddy-widget__pause-header strong,
.buddy-widget__pause-section > strong,
.buddy-widget__pause-row > span {
  color: var(--graphite-text-strong);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.25;
}

.buddy-widget__pause-header small,
.buddy-widget__pause-row small {
  color: rgba(108, 82, 62, 0.72);
  font-size: 11px;
  line-height: 1.35;
}

.buddy-widget__pause-header > span {
  flex: 0 0 auto;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  color: rgb(146, 64, 14);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
}

.buddy-widget__pause-summary {
  margin: 0;
  color: rgba(70, 53, 38, 0.82);
  font-size: 12px;
  line-height: 1.45;
}

.buddy-widget__pause-section {
  padding-top: 2px;
}

.buddy-widget__pause-row {
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);
}

.buddy-widget__pause-row pre {
  max-height: 112px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: rgba(70, 53, 38, 0.82);
  font-family: var(--graphite-font-mono);
  font-size: 11px;
  line-height: 1.45;
}

.buddy-widget__pause-actions {
  display: flex;
  justify-content: flex-end;
}

.buddy-widget__pause-input :deep(.el-textarea__inner) {
  min-height: 56px !important;
  border-color: rgba(154, 52, 18, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--graphite-text);
  font-size: 12px;
  line-height: 1.45;
  box-shadow: none;
}

.buddy-widget__pause-input :deep(.el-textarea__inner:focus) {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
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
  font-family: var(--graphite-font-mono);
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

.buddy-widget__message-activity {
  color: rgba(108, 82, 62, 0.76);
  font-size: 12px;
}

.buddy-widget__message--user {
  justify-items: end;
}

.buddy-widget__message--user .buddy-widget__message-bubble {
  background: rgba(154, 52, 18, 0.08);
  color: var(--graphite-text-strong);
}

.buddy-widget__run-trace {
  width: min(100%, 320px);
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.72);
  overflow: hidden;
}

.buddy-widget__run-trace-toggle {
  appearance: none;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 9px;
  border: 0;
  border-bottom: 1px solid rgba(154, 52, 18, 0.08);
  background: rgba(255, 248, 240, 0.6);
  color: rgba(108, 82, 62, 0.9);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.buddy-widget__run-trace-toggle .el-icon {
  transform: rotate(-90deg);
  transition: transform 160ms ease;
}

.buddy-widget__run-trace--expanded .buddy-widget__run-trace-toggle .el-icon {
  transform: rotate(0deg);
}

.buddy-widget__run-trace--finished:not(.buddy-widget__run-trace--expanded) .buddy-widget__run-trace-toggle {
  border-bottom: 0;
}

.buddy-widget__run-trace-body {
  max-height: calc(1 * 1.45em + 14px);
  overflow: hidden;
  padding: 7px 8px;
}

.buddy-widget__run-trace--expanded .buddy-widget__run-trace-body {
  max-height: 180px;
  overflow: auto;
}

.buddy-widget__run-trace-entry {
  display: grid;
  grid-template-columns: 7px minmax(0, 1fr);
  gap: 7px;
  align-items: start;
  color: rgba(70, 53, 38, 0.78);
  font-size: 11px;
  line-height: 1.45;
}

.buddy-widget__run-trace-entry + .buddy-widget__run-trace-entry {
  margin-top: 5px;
}

.buddy-widget__run-trace-dot {
  --buddy-run-trace-pulse-color: rgba(154, 52, 18, 0.24);
  --buddy-run-trace-ring-color: rgba(154, 52, 18, 0.22);
  position: relative;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.28);
}

.buddy-widget__run-trace-entry--info .buddy-widget__run-trace-dot,
.buddy-widget__run-trace-entry--stream .buddy-widget__run-trace-dot {
  --buddy-run-trace-pulse-color: rgba(22, 163, 74, 0.24);
  --buddy-run-trace-ring-color: rgba(22, 163, 74, 0.34);
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.1);
  animation: buddy-widget-run-trace-dot-pulse 1.08s ease-in-out infinite;
}

.buddy-widget__run-trace-entry--info .buddy-widget__run-trace-dot::after,
.buddy-widget__run-trace-entry--stream .buddy-widget__run-trace-dot::after {
  content: "";
  position: absolute;
  inset: -4px;
  border: 1px solid var(--buddy-run-trace-ring-color);
  border-radius: inherit;
  transform: scale(0.72);
  opacity: 0.82;
  animation: buddy-widget-run-trace-ring-pulse 1.08s ease-out infinite;
}

.buddy-widget__run-trace-entry--success .buddy-widget__run-trace-dot {
  background: #16a34a;
}

.buddy-widget__run-trace-entry--error .buddy-widget__run-trace-dot {
  background: #dc2626;
}

.buddy-widget__run-trace-entry p {
  margin: 0;
  overflow-wrap: anywhere;
}

.buddy-widget__run-trace-entry strong {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: rgba(45, 32, 21, 0.88);
  font-weight: 800;
}

.buddy-widget__run-trace-duration {
  flex: 0 0 auto;
  color: rgba(108, 82, 62, 0.62);
  font-family: var(--graphite-font-mono);
  font-size: 10px;
  font-weight: 800;
}

.buddy-widget__run-trace-preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: pre-wrap;
}

@keyframes buddy-widget-run-trace-dot-pulse {
  0%,
  100% {
    opacity: 0.62;
    transform: scale(0.82);
    box-shadow: 0 0 0 0 var(--buddy-run-trace-pulse-color);
  }
  50% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 5px rgba(22, 163, 74, 0);
  }
}

@keyframes buddy-widget-run-trace-ring-pulse {
  0% {
    opacity: 0.82;
    transform: scale(0.72);
  }
  100% {
    opacity: 0;
    transform: scale(1.65);
  }
}

.buddy-widget__run-trace--expanded .buddy-widget__run-trace-preview {
  display: block;
  overflow: visible;
  -webkit-line-clamp: initial;
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
  color: var(--graphite-text-strong);
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
  color: var(--graphite-text);
  box-shadow: var(--graphite-glass-highlight), 0 14px 34px rgba(61, 43, 24, 0.12);
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
