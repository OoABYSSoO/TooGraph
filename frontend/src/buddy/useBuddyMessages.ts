import { nextTick, ref } from "vue";

import { resolveOutputPreviewContent } from "../editor/nodes/outputPreviewContentModel.ts";
import type { BuddyChatMessageRecord } from "../types/buddy.ts";
import type { GraphPayload } from "../types/node-system.ts";
import { resolveBuddyRunActivityFromRunEvent, type BuddyChatMessage } from "./buddyChatGraph.ts";
import {
  buildOutputTraceBuddyMessageMetadata,
  buildPublicOutputBuddyMessageMetadata,
  resolveOutputTraceBuddyMessageMetadata,
  resolvePublicOutputBuddyMessageMetadata,
  type BuddyPublicOutputMetadata,
} from "./buddyMessageMetadata.ts";
import type { BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";

export type BuddyMessage = BuddyChatMessage & {
  id: string;
  clientOrder?: number | null;
  activityText?: string;
  runId?: string | null;
  publicOutput?: BuddyPublicOutputMetadata;
  outputTrace?: BuddyOutputTraceSegment;
};

export type BuddyMessagePatch = Partial<
  Pick<BuddyMessage, "content" | "includeInContext" | "activityText" | "runId" | "publicOutput" | "outputTrace">
>;

export type BuddyQueuedTurn = {
  userMessageId: string;
  assistantMessageId: string;
  userMessage: string;
  sessionId: string;
  history: BuddyChatMessage[];
};

type BuddyMessagesOptions = {
  t: (key: string, params?: Record<string, unknown>) => string;
};

export function useBuddyMessages({ t }: BuddyMessagesOptions) {
  const messages = ref<BuddyMessage[]>([]);
  const messageListElement = ref<HTMLElement | null>(null);
  let nextBuddyMessageClientOrder = 0;

  function renderBuddyMarkdown(content: string) {
    return resolveOutputPreviewContent(content, "markdown").html;
  }

  function resolveBuddyRenderedContent(message: BuddyMessage) {
    return resolveOutputPreviewContent(message.content, resolveBuddyDisplayMode(message));
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

  async function scrollMessagesToBottom() {
    await nextTick();
    const element = messageListElement.value;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
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
      publicOutput: resolvePublicOutputBuddyMessageMetadata(record.metadata) ?? undefined,
    };
  }

  function buildBuddyMessageMetadata(message: BuddyMessage) {
    if (message.outputTrace) {
      return buildOutputTraceBuddyMessageMetadata(message.outputTrace);
    }
    if (message.publicOutput) {
      return buildPublicOutputBuddyMessageMetadata(message.publicOutput);
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

  return {
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
  };
}

function resolveBuddyDisplayMode(message: BuddyMessage) {
  const displayMode = message.publicOutput?.displayMode.trim().toLowerCase() ?? "";
  const stateType = message.publicOutput?.stateType.trim().toLowerCase() ?? "";
  if (displayMode === "html" || stateType === "html" || looksLikeHtmlDocument(message.content)) {
    return "html";
  }
  return "markdown";
}

function looksLikeHtmlDocument(content: string) {
  const trimmed = content.trim().toLowerCase();
  return /^<!doctype\s+html\b/.test(trimmed) || /^<html(?:\s|>)/.test(trimmed);
}

function isContextMessage(message: BuddyMessage): boolean {
  return message.includeInContext !== false;
}
