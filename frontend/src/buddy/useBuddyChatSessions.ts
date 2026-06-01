import { computed, ref, type Ref } from "vue";

import {
  createBuddyChatSession,
  deleteBuddyChatSession,
  fetchBuddyChatMessages,
  fetchBuddyChatSessions,
} from "../api/buddy.ts";
import type { BuddyChatMessageRecord, BuddyChatSession } from "../types/buddy.ts";

type BuddySessionMessage = {
  id?: string;
  content: string;
  clientOrder?: number | null;
};

type BuddyChatSessionsOptions<Message extends BuddySessionMessage> = {
  messages: Ref<Message[]>;
  queuedTurns: Ref<unknown[]>;
  activeRunId: Ref<string | null>;
  errorMessage: Ref<string>;
  t: (key: string, params?: Record<string, unknown>) => string;
  messageRecordToBuddyMessage: (record: BuddyChatMessageRecord) => Message;
  resetNextBuddyMessageClientOrder: () => void;
  resetVisibleBuddyRunState: () => void;
  scrollMessagesToBottom: () => Promise<void>;
  formatErrorMessage: (error: unknown) => string;
  hydrateLoadedRunDisplays?: (records: BuddyChatMessageRecord[]) => Promise<void>;
  shouldHydrateLoadedRunDisplays?: () => boolean;
};

const BUDDY_ACTIVE_SESSION_STORAGE_KEY = "toograph:buddy-active-session";

export function formatBuddySessionSourceLabel(source: string | null | undefined) {
  const normalized = (source ?? "buddy").trim();
  if (normalized === "telegram") {
    return "Telegram";
  }
  if (normalized === "feishu") {
    return "Feishu/Lark";
  }
  if (!normalized || normalized === "buddy") {
    return "";
  }
  return normalized;
}

function buildChatMessageRecordsSignature(records: BuddyChatMessageRecord[]) {
  return records
    .map((record) => [
      record.message_id,
      record.role,
      record.run_id ?? "",
      record.updated_at,
    ].join(":"))
    .join("|");
}

function getBuddySessionMessageId(message: BuddySessionMessage) {
  return typeof message.id === "string" ? message.id.trim() : "";
}

function resolveBuddySessionMessageClientOrder(message: BuddySessionMessage, fallbackIndex: number) {
  const clientOrder = message.clientOrder;
  if (typeof clientOrder === "number" && Number.isFinite(clientOrder)) {
    return clientOrder;
  }
  return Number.MAX_SAFE_INTEGER + fallbackIndex;
}

function sortBuddySessionMessagesByClientOrder<Message extends BuddySessionMessage>(messages: Message[]) {
  return messages
    .map((message, index) => ({
      message,
      index,
      clientOrder: resolveBuddySessionMessageClientOrder(message, index),
    }))
    .sort((left, right) => {
      const orderDelta = left.clientOrder - right.clientOrder;
      return orderDelta === 0 ? left.index - right.index : orderDelta;
    })
    .map((entry) => entry.message);
}

export function useBuddyChatSessions<Message extends BuddySessionMessage>({
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
  hydrateLoadedRunDisplays,
  shouldHydrateLoadedRunDisplays,
}: BuddyChatSessionsOptions<Message>) {
  const chatSessions = ref<BuddyChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);
  const currentSessionId = computed(() => activeSessionId.value ?? "");
  const isSessionPanelOpen = ref(false);
  const isSessionLoading = ref(false);
  const activeSessionDeleteId = ref<string | null>(null);
  const sessionDeleteConfirmTimeoutRef = ref<number | null>(null);
  let chatSessionInitializationPromise: Promise<void> | null = null;
  let activeSessionMessageSignature = "";
  let activeSessionRecords: BuddyChatMessageRecord[] = [];
  let hydratedRunDisplaySignature = "";

  const isSessionSwitchLocked = computed(
    () =>
      queuedTurns.value.length > 0 ||
      activeRunId.value !== null,
  );
  const hasCurrentSessionContent = computed(() => messages.value.some((message) => message.content.trim()));
  const canCreateNewSession = computed(() => !isSessionSwitchLocked.value && hasCurrentSessionContent.value);

  function startChatSessionInitialization() {
    chatSessionInitializationPromise = initializeBuddyChatSessions().finally(() => {
      chatSessionInitializationPromise = null;
    });
    return chatSessionInitializationPromise;
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
      messages.value = [];
      resetNextBuddyMessageClientOrder();
    } catch (error) {
      errorMessage.value = t("buddy.historyLoadFailed", { error: formatErrorMessage(error) });
      messages.value = [];
      resetNextBuddyMessageClientOrder();
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
      await applyLoadedChatMessages(records);
      await scrollMessagesToBottom();
    } catch (error) {
      errorMessage.value = t("buddy.historyLoadFailed", { error: formatErrorMessage(error) });
    } finally {
      isSessionLoading.value = false;
    }
  }

  async function refreshActiveChatSession() {
    const sessionId = activeSessionId.value;
    if (!sessionId || isSessionSwitchLocked.value) {
      return false;
    }
    try {
      const records = await fetchBuddyChatMessages(sessionId);
      if (sessionId !== activeSessionId.value || isSessionSwitchLocked.value) {
        return false;
      }
      const nextSignature = buildChatMessageRecordsSignature(records);
      if (nextSignature === activeSessionMessageSignature) {
        return false;
      }
      await applyLoadedChatMessages(records, { mergeExisting: true });
      await scrollMessagesToBottom();
      return true;
    } catch (error) {
      errorMessage.value = t("buddy.historyLoadFailed", { error: formatErrorMessage(error) });
      return false;
    }
  }

  async function applyLoadedChatMessages(
    records: BuddyChatMessageRecord[],
    options: { mergeExisting?: boolean } = {},
  ) {
    activeSessionMessageSignature = buildChatMessageRecordsSignature(records);
    activeSessionRecords = records;
    if (options.mergeExisting) {
      mergeLoadedChatMessages(records);
    } else {
      messages.value = records.map(messageRecordToBuddyMessage);
      resetVisibleBuddyRunState();
    }
    resetNextBuddyMessageClientOrder();
    await hydrateRunDisplaysForRecords(records);
  }

  async function hydrateActiveSessionRunDisplays() {
    return hydrateRunDisplaysForRecords(activeSessionRecords);
  }

  async function hydrateRunDisplaysForRecords(records: BuddyChatMessageRecord[]) {
    if (!hydrateLoadedRunDisplays || (shouldHydrateLoadedRunDisplays && !shouldHydrateLoadedRunDisplays())) {
      return false;
    }
    const signature = buildChatMessageRecordsSignature(records);
    if (signature === hydratedRunDisplaySignature) {
      return false;
    }
    await hydrateLoadedRunDisplays(records);
    hydratedRunDisplaySignature = signature;
    return true;
  }

  function mergeLoadedChatMessages(records: BuddyChatMessageRecord[]) {
    const loadedMessages = records.map(messageRecordToBuddyMessage);
    const loadedMessageIds = new Set(
      loadedMessages.map(getBuddySessionMessageId).filter((messageId) => messageId.length > 0),
    );
    const existingMessagesById = new Map<string, Message>();
    for (const message of messages.value) {
      const messageId = getBuddySessionMessageId(message);
      if (messageId) {
        existingMessagesById.set(messageId, message);
      }
    }

    const mergedMessages: Message[] = [];
    for (const loadedMessage of loadedMessages) {
      const messageId = getBuddySessionMessageId(loadedMessage);
      const existingMessage = messageId ? existingMessagesById.get(messageId) : null;
      if (existingMessage) {
        Object.assign(existingMessage, loadedMessage);
        mergedMessages.push(existingMessage);
      } else {
        mergedMessages.push(loadedMessage);
      }
    }
    for (const message of messages.value) {
      const messageId = getBuddySessionMessageId(message);
      if (messageId && loadedMessageIds.has(messageId)) {
        continue;
      }
      mergedMessages.push(message);
    }

    messages.value = sortBuddySessionMessagesByClientOrder(mergedMessages);
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
          activeSessionMessageSignature = "";
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

  function toggleSessionPanel() {
    isSessionPanelOpen.value = !isSessionPanelOpen.value;
    clearSessionDeleteConfirmState();
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

  async function waitForChatSessionInitialization() {
    if (chatSessionInitializationPromise) {
      await chatSessionInitializationPromise;
    }
  }

  return {
    chatSessions,
    activeSessionId,
    currentSessionId,
    isSessionPanelOpen,
    isSessionLoading,
    activeSessionDeleteId,
    isSessionSwitchLocked,
    hasCurrentSessionContent,
    canCreateNewSession,
    startChatSessionInitialization,
    loadChatSessions,
    ensureActiveChatSession,
    createNewSession,
    selectChatSession,
    refreshActiveChatSession,
    toggleSessionPanel,
    clearSessionDeleteConfirmTimeout,
    clearSessionDeleteConfirmState,
    handleSessionDeleteActionClick,
    hydrateActiveSessionRunDisplays,
    waitForChatSessionInitialization,
  };
}
