<template>
  <div class="companion-pet" aria-live="polite">
    <div
      class="companion-pet__anchor"
      :class="`companion-pet__anchor--${panelPlacement}`"
      :style="anchorStyle"
    >
      <section
        v-if="isPanelOpen"
        class="companion-pet__panel"
        :aria-label="t('companion.panelLabel')"
      >
        <header class="companion-pet__header">
          <div class="companion-pet__heading">
            <span class="companion-pet__eyebrow">{{ t("companion.eyebrow") }}</span>
            <h2>{{ t("companion.title") }}</h2>
          </div>
          <div class="companion-pet__header-actions">
            <div class="companion-pet__mode" :title="companionModeLabel">
              <span class="companion-pet__mode-label">{{ t("companion.modeLabel") }}</span>
              <ElSelect
                v-model="companionMode"
                class="companion-pet__mode-select"
                size="small"
                :aria-label="t('companion.modeLabel')"
                :title="companionModeLabel"
              >
                <ElOption
                  v-for="option in COMPANION_MODE_OPTIONS"
                  :key="option.value"
                  :label="t(option.labelKey)"
                  :value="option.value"
                  :disabled="option.disabled"
                >
                  <span class="companion-pet__mode-option">
                    <span>{{ t(option.labelKey) }}</span>
                    <small>{{ t(option.descriptionKey) }}</small>
                  </span>
                </ElOption>
              </ElSelect>
            </div>
            <button
              type="button"
              class="companion-pet__icon-button"
              :title="t('companion.clear')"
              :aria-label="t('companion.clear')"
              @click="clearMessages"
            >
              <ElIcon><Delete /></ElIcon>
            </button>
            <button
              type="button"
              class="companion-pet__icon-button"
              :title="t('common.close')"
              :aria-label="t('common.close')"
              @click="isPanelOpen = false"
            >
              <ElIcon><Close /></ElIcon>
            </button>
          </div>
        </header>

        <div ref="messageListElement" class="companion-pet__messages">
          <p v-if="messages.length === 0" class="companion-pet__empty">
            {{ t("companion.empty") }}
          </p>
          <article
            v-for="message in messages"
            :key="message.id"
            class="companion-pet__message"
            :class="`companion-pet__message--${message.role}`"
          >
            <span class="companion-pet__message-label">
              {{ message.role === "user" ? t("companion.user") : t("companion.pet") }}
            </span>
            <p>{{ message.content || t("companion.streaming") }}</p>
          </article>
          <p v-if="errorMessage" class="companion-pet__error">{{ errorMessage }}</p>
          <p v-if="queuedTurns.length > 0" class="companion-pet__queue">
            {{ t("companion.queueStatus", { count: queuedTurns.length }) }}
          </p>
        </div>

        <form class="companion-pet__form" @submit.prevent="sendMessage">
          <textarea
            v-model="draft"
            class="companion-pet__input"
            rows="2"
            :placeholder="t('companion.placeholder')"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            type="submit"
            class="companion-pet__send"
            :disabled="!draft.trim()"
            :title="t('companion.send')"
            :aria-label="t('companion.send')"
          >
            <ElIcon><Promotion /></ElIcon>
          </button>
        </form>
      </section>

      <div v-if="bubbleText && !isPanelOpen" class="companion-pet__bubble">
        {{ bubbleText }}
      </div>

      <button
        type="button"
        class="companion-pet__avatar"
        :title="t('companion.dragHint')"
        :aria-label="t('companion.open')"
        @pointerdown="handlePointerDown"
        @click="handleAvatarClick"
      >
        <CompanionMascot :mood="mood" :dragging="isDragging" :tap-nonce="tapNonce" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close, Delete, Promotion } from "@element-plus/icons-vue";
import { ElIcon, ElOption, ElSelect } from "element-plus";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import { fetchTemplate, runGraph } from "../api/graphs.ts";
import { fetchRun } from "../api/runs.ts";
import { buildRunEventStreamUrl, parseRunEventPayload, shouldPollRunStatus } from "../lib/run-event-stream.ts";
import { useCompanionContextStore } from "../stores/companionContext.ts";
import type { RunDetail } from "../types/run.ts";

import CompanionMascot from "./CompanionMascot.vue";
import { buildCompanionPageContext } from "./companionPageContext.ts";
import {
  COMPANION_TEMPLATE_ID,
  COMPANION_MODE_OPTIONS,
  DEFAULT_COMPANION_MODE,
  buildCompanionChatGraph,
  resolveCompanionMode,
  resolveCompanionReplyFromRunEvent,
  resolveCompanionReplyText,
  type CompanionChatMessage,
  type CompanionMode,
} from "./companionChatGraph.ts";
import {
  COMPANION_POSITION_STORAGE_KEY,
  DEFAULT_COMPANION_MARGIN,
  DEFAULT_COMPANION_SIZE,
  clampCompanionPosition,
  parseStoredCompanionPosition,
  resolveDefaultCompanionPosition,
  serializeCompanionPosition,
  type CompanionPosition,
} from "./companionPosition.ts";

type CompanionMessage = CompanionChatMessage & {
  id: string;
};

type CompanionMessagePatch = Partial<Pick<CompanionMessage, "content" | "includeInContext">>;

type CompanionQueuedTurn = {
  userMessageId: string;
  userMessage: string;
};

type CompanionMood = "idle" | "thinking" | "speaking" | "error";

const COMPANION_HISTORY_STORAGE_KEY = "graphiteui:companion-history";
const DRAG_THRESHOLD_PX = 4;
const RUN_POLL_INTERVAL_MS = 700;
const RUN_POLL_TIMEOUT_MS = 240000;

const { t } = useI18n();
const route = useRoute();
const companionContextStore = useCompanionContextStore();

const viewport = ref(resolveViewport());
const position = ref(resolveDefaultCompanionPosition(viewport.value));
const isPanelOpen = ref(false);
const draft = ref("");
const companionMode = ref<CompanionMode>(DEFAULT_COMPANION_MODE);
const messages = ref<CompanionMessage[]>([]);
const queuedTurns = ref<CompanionQueuedTurn[]>([]);
const errorMessage = ref("");
const mood = ref<CompanionMood>("idle");
const tapNonce = ref(0);
const activeRunId = ref<string | null>(null);
const messageListElement = ref<HTMLElement | null>(null);
const pointerDrag = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: CompanionPosition;
  moved: boolean;
} | null>(null);

let suppressNextClick = false;
let eventSource: EventSource | null = null;
let activeAbortController: AbortController | null = null;
let isDrainingCompanionQueue = false;
let speakingIdleTimerId: number | null = null;

const isDragging = computed(() => Boolean(pointerDrag.value?.moved));
const companionModeLabel = computed(() => {
  const option = COMPANION_MODE_OPTIONS.find((candidate) => candidate.value === companionMode.value);
  return option ? `${t(option.labelKey)} - ${t(option.descriptionKey)}` : t("companion.modes.advisory");
});
const anchorStyle = computed(() => ({
  transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0)`,
}));
const panelPlacement = computed(() => (position.value.x > viewport.value.width / 2 ? "left" : "right"));
const bubbleText = computed(() => {
  if (mood.value === "thinking") {
    return t("companion.thinking");
  }
  if (mood.value === "error") {
    return t("companion.errorBubble");
  }
  const latestPetMessage = [...messages.value].reverse().find((message) => message.role === "assistant" && message.content.trim());
  return latestPetMessage?.content.trim().slice(0, 84) || t("companion.readyBubble");
});

onMounted(() => {
  hydratePosition();
  hydrateMessages();
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
  queuedTurns.value = [];
  clearSpeakingIdleTimer();
  closeEventSource();
  activeAbortController?.abort();
});

watch(
  messages,
  (nextMessages) => {
    window.localStorage.setItem(
      COMPANION_HISTORY_STORAGE_KEY,
      JSON.stringify(
        nextMessages
          .filter(isPersistableMessageForStorage)
          .slice(-24)
          .map(({ role, content, includeInContext }) => ({ role, content, includeInContext })),
      ),
    );
  },
  { deep: true },
);

watch(companionMode, (nextMode) => {
  const safeMode = resolveCompanionMode(nextMode);
  if (safeMode !== nextMode) {
    companionMode.value = safeMode;
  }
});

function handleAvatarClick() {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  tapNonce.value += 1;
  isPanelOpen.value = !isPanelOpen.value;
  if (isPanelOpen.value) {
    void scrollMessagesToBottom();
  }
}

function handlePointerDown(event: PointerEvent) {
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
  position.value = clampCompanionPosition(
    {
      x: drag.startPosition.x + deltaX,
      y: drag.startPosition.y + deltaY,
    },
    viewport.value,
    DEFAULT_COMPANION_SIZE,
    DEFAULT_COMPANION_MARGIN,
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

async function sendMessage() {
  const userMessage = draft.value.trim();
  if (!userMessage) {
    return;
  }

  errorMessage.value = "";
  isPanelOpen.value = true;
  draft.value = "";

  const userEntry = createMessage("user", userMessage);
  messages.value.push(userEntry);
  queuedTurns.value.push({
    userMessageId: userEntry.id,
    userMessage,
  });
  void drainCompanionQueue();
  await scrollMessagesToBottom();
}

async function drainCompanionQueue() {
  if (isDrainingCompanionQueue) {
    return;
  }

  isDrainingCompanionQueue = true;
  try {
    while (queuedTurns.value.length > 0) {
      const nextTurn = queuedTurns.value.shift();
      if (!nextTurn) {
        continue;
      }
      await processQueuedTurn(nextTurn);
    }
  } finally {
    isDrainingCompanionQueue = false;
    if (queuedTurns.value.length > 0) {
      void drainCompanionQueue();
    }
  }
}

async function processQueuedTurn(turn: CompanionQueuedTurn) {
  clearSpeakingIdleTimer();
  const history = buildHistoryBeforeMessage(turn.userMessageId);
  const assistantMessage = appendAssistantMessageForTurn(turn.userMessageId);
  mood.value = "thinking";
  await scrollMessagesToBottom();

  try {
    activeAbortController = new AbortController();
    const template = await fetchTemplate(COMPANION_TEMPLATE_ID);
    const graph = buildCompanionChatGraph(template, {
      userMessage: turn.userMessage,
      history,
      pageContext: buildPageContext(),
      companionMode: companionMode.value,
    });
    const run = await runGraph(graph);
    activeRunId.value = run.run_id;
    startRunEventStream(run.run_id, assistantMessage.id);
    const runDetail = await pollRunUntilFinished(run.run_id, activeAbortController.signal);
    const finalReply = resolveCompanionReplyText(runDetail);
    updateAssistantMessage(assistantMessage.id, finalReply || t("companion.emptyReply"));
    mood.value = runDetail.status === "failed" ? "error" : "speaking";
    if (runDetail.status === "failed") {
      errorMessage.value = runDetail.errors?.[0] ?? t("companion.runFailed");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    mood.value = "error";
    const message = error instanceof Error ? error.message : t("companion.runFailed");
    errorMessage.value = message;
    updateAssistantMessage(assistantMessage.id, t("companion.errorReply", { error: message }), { includeInContext: false });
  } finally {
    closeEventSource();
    activeRunId.value = null;
    activeAbortController = null;
    if (mood.value === "speaking" && queuedTurns.value.length === 0) {
      scheduleSpeakingIdle();
    }
    await scrollMessagesToBottom();
  }
}

function clearMessages() {
  queuedTurns.value = [];
  clearSpeakingIdleTimer();
  closeEventSource();
  activeAbortController?.abort();
  activeAbortController = null;
  activeRunId.value = null;
  messages.value = [];
  errorMessage.value = "";
  mood.value = "idle";
  window.localStorage.removeItem(COMPANION_HISTORY_STORAGE_KEY);
}

function hydratePosition() {
  const stored = parseStoredCompanionPosition(window.localStorage.getItem(COMPANION_POSITION_STORAGE_KEY));
  position.value = clampCompanionPosition(
    stored ?? resolveDefaultCompanionPosition(viewport.value),
    viewport.value,
    DEFAULT_COMPANION_SIZE,
    DEFAULT_COMPANION_MARGIN,
  );
}

function hydrateMessages() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMPANION_HISTORY_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return;
    }
    messages.value = parsed
      .filter(isPersistedMessage)
      .slice(-24)
      .map((message) => createMessage(message.role, message.content));
  } catch {
    messages.value = [];
  }
}

function handleResize() {
  viewport.value = resolveViewport();
  position.value = clampCompanionPosition(position.value, viewport.value, DEFAULT_COMPANION_SIZE, DEFAULT_COMPANION_MARGIN);
  persistPosition();
}

function persistPosition() {
  window.localStorage.setItem(COMPANION_POSITION_STORAGE_KEY, serializeCompanionPosition(position.value));
}

function startRunEventStream(runId: string, assistantMessageId: string) {
  closeEventSource();
  const streamUrl = buildRunEventStreamUrl(runId);
  if (!streamUrl || typeof EventSource === "undefined") {
    return;
  }

  eventSource = new EventSource(streamUrl);
  const handleStreamingEvent = (event: Event) => {
    const payload = parseRunEventPayload(event);
    if (!payload) {
      return;
    }
    const nextText = resolveCompanionReplyFromRunEvent(payload);
    if (!nextText) {
      return;
    }
    mood.value = "speaking";
    updateAssistantMessage(assistantMessageId, nextText);
    void scrollMessagesToBottom();
  };
  eventSource.addEventListener("node.output.delta", handleStreamingEvent);
  eventSource.addEventListener("node.output.completed", handleStreamingEvent);
  eventSource.addEventListener("state.updated", handleStreamingEvent);
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
  throw new Error(t("companion.runTimeout"));
}

function closeEventSource() {
  eventSource?.close();
  eventSource = null;
}

function updateAssistantMessage(messageId: string, content: string, patch: CompanionMessagePatch = {}) {
  const target = messages.value.find((message) => message.id === messageId);
  if (!target) {
    return;
  }
  target.content = content;
  Object.assign(target, patch);
}

function buildHistoryBeforeMessage(messageId: string): CompanionChatMessage[] {
  const messageIndex = messages.value.findIndex((message) => message.id === messageId);
  const previousMessages = messageIndex >= 0 ? messages.value.slice(0, messageIndex) : messages.value;
  return previousMessages.filter(isContextMessage).map(({ role, content }) => ({ role, content }));
}

function appendAssistantMessageForTurn(userMessageId: string): CompanionMessage {
  const assistantMessage = createMessage("assistant", "");
  const userMessageIndex = messages.value.findIndex((message) => message.id === userMessageId);
  if (userMessageIndex >= 0 && userMessageIndex < messages.value.length - 1) {
    messages.value.splice(userMessageIndex + 1, 0, assistantMessage);
    return assistantMessage;
  }
  messages.value.push(assistantMessage);
  return assistantMessage;
}

function scheduleSpeakingIdle() {
  clearSpeakingIdleTimer();
  speakingIdleTimerId = window.setTimeout(() => {
    speakingIdleTimerId = null;
    if (mood.value === "speaking" && queuedTurns.value.length === 0 && !isDrainingCompanionQueue) {
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

async function scrollMessagesToBottom() {
  await nextTick();
  const element = messageListElement.value;
  if (!element) {
    return;
  }
  element.scrollTop = element.scrollHeight;
}

function buildPageContext() {
  return buildCompanionPageContext({
    routePath: route.fullPath,
    editor: companionContextStore.editorSnapshot,
    activeCompanionRunId: activeRunId.value,
  });
}

function createMessage(role: CompanionChatMessage["role"], content: string): CompanionMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

function isContextMessage(message: CompanionMessage): boolean {
  return message.includeInContext !== false;
}

function isPersistableMessageForStorage(message: CompanionMessage): boolean {
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

function isPersistedMessage(value: unknown): value is CompanionChatMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ((value as CompanionChatMessage).role === "user" || (value as CompanionChatMessage).role === "assistant") &&
    typeof (value as CompanionChatMessage).content === "string" &&
    ((value as CompanionChatMessage).includeInContext === undefined ||
      typeof (value as CompanionChatMessage).includeInContext === "boolean")
  );
}
</script>

<style scoped>
.companion-pet {
  position: fixed;
  inset: 0;
  z-index: 4500;
  pointer-events: none;
  font-family: var(--graphite-font-ui);
}

.companion-pet__anchor {
  position: fixed;
  top: 0;
  left: 0;
  width: 96px;
  height: 96px;
  pointer-events: none;
  transition: transform 120ms ease;
}

.companion-pet__avatar {
  appearance: none;
  position: relative;
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

.companion-pet__avatar > .companion-mascot {
  position: relative;
  z-index: 1;
  filter:
    drop-shadow(0 8px 12px rgba(255, 255, 255, 0.86))
    drop-shadow(0 2px 5px rgba(255, 255, 255, 0.72))
    drop-shadow(0 0 3px rgba(255, 255, 255, 0.94));
  transition: filter 160ms ease;
}

.companion-pet__avatar:hover {
  transform: translateY(-2px);
}

.companion-pet__avatar:hover > .companion-mascot {
  filter:
    drop-shadow(0 9px 14px rgba(255, 255, 255, 0.9))
    drop-shadow(0 3px 6px rgba(255, 255, 255, 0.76))
    drop-shadow(0 0 4px rgba(255, 255, 255, 0.98));
}

.companion-pet__avatar:active {
  cursor: grabbing;
  transform: translateY(0) scale(0.98);
}

.companion-pet__avatar:active > .companion-mascot {
  filter:
    drop-shadow(0 7px 10px rgba(255, 255, 255, 0.82))
    drop-shadow(0 2px 4px rgba(255, 255, 255, 0.68))
    drop-shadow(0 0 3px rgba(255, 255, 255, 0.9));
}

.companion-pet__avatar:focus-visible,
.companion-pet__icon-button:focus-visible,
.companion-pet__send:focus-visible,
.companion-pet__input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}

.companion-pet__panel,
.companion-pet__bubble {
  position: absolute;
  pointer-events: auto;
}

.companion-pet__panel {
  bottom: calc(100% + 12px);
  width: min(360px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 132px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.94);
  box-shadow: var(--graphite-glass-highlight), 0 24px 64px rgba(61, 43, 24, 0.18);
  backdrop-filter: blur(18px) saturate(1.2);
}

.companion-pet__anchor--left .companion-pet__panel {
  right: 0;
}

.companion-pet__anchor--right .companion-pet__panel {
  left: 0;
}

.companion-pet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(154, 52, 18, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 248, 240, 0.5));
}

.companion-pet__heading {
  flex: 1 1 auto;
  min-width: 0;
}

.companion-pet__eyebrow {
  display: block;
  color: var(--graphite-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
}

.companion-pet__heading h2 {
  margin: 3px 0 0;
  color: var(--graphite-text-strong);
  font-size: 16px;
  line-height: 1.2;
}

.companion-pet__header-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.companion-pet__mode {
  display: grid;
  gap: 4px;
  width: 136px;
  min-width: 0;
}

.companion-pet__mode-label {
  color: var(--graphite-text-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.companion-pet__mode-select {
  width: 100%;
}

.companion-pet__mode-select :deep(.el-select__wrapper) {
  min-height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 0 0 1px rgba(154, 52, 18, 0.14) inset;
}

.companion-pet__mode-select :deep(.el-select__wrapper.is-focused) {
  box-shadow:
    0 0 0 1px rgba(154, 52, 18, 0.22) inset,
    0 0 0 3px rgba(210, 162, 117, 0.22);
}

.companion-pet__mode-option {
  display: grid;
  gap: 2px;
  min-width: 0;
  line-height: 1.2;
}

.companion-pet__mode-option small {
  color: var(--graphite-text-muted);
  font-size: 11px;
}

.companion-pet__icon-button,
.companion-pet__send {
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

.companion-pet__icon-button {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.companion-pet__icon-button:hover,
.companion-pet__send:hover {
  border-color: rgba(154, 52, 18, 0.24);
  background: rgba(255, 248, 240, 0.92);
  transform: translateY(-1px);
}

.companion-pet__messages {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 190px;
  max-height: 360px;
  overflow: auto;
  padding: 14px;
}

.companion-pet__empty,
.companion-pet__error,
.companion-pet__queue {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.companion-pet__empty {
  color: var(--graphite-text-muted);
}

.companion-pet__error {
  padding: 10px 12px;
  border: 1px solid rgba(220, 38, 38, 0.16);
  border-radius: 8px;
  background: rgba(254, 242, 242, 0.92);
  color: rgb(185, 28, 28);
}

.companion-pet__queue {
  color: rgba(108, 82, 62, 0.72);
  font-size: 12px;
}

.companion-pet__message {
  display: grid;
  gap: 4px;
}

.companion-pet__message-label {
  color: var(--graphite-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.companion-pet__message p {
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

.companion-pet__message--user {
  justify-items: end;
}

.companion-pet__message--user p {
  background: rgba(154, 52, 18, 0.08);
  color: var(--graphite-text-strong);
}

.companion-pet__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  background: rgba(255, 248, 240, 0.56);
}

.companion-pet__input {
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

.companion-pet__input:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.companion-pet__send {
  width: 38px;
  height: 42px;
  border-radius: 8px;
  background: rgba(154, 52, 18, 0.1);
}

.companion-pet__send:disabled {
  cursor: not-allowed;
  opacity: 0.54;
  transform: none;
}

.companion-pet__bubble {
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

.companion-pet__anchor--left .companion-pet__bubble {
  right: 0;
}

.companion-pet__anchor--right .companion-pet__bubble {
  left: 0;
}

@media (max-width: 560px) {
  .companion-pet__panel {
    width: calc(100vw - 32px);
    max-height: min(520px, calc(100vh - 120px));
  }

  .companion-pet__messages {
    max-height: 320px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .companion-pet__anchor,
  .companion-pet__avatar,
  .companion-pet__icon-button,
  .companion-pet__send {
    animation: none;
    transition: none;
  }
}
</style>
