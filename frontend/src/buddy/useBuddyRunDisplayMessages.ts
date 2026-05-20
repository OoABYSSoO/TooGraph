import type { Ref } from "vue";

import { buildRunNodeTimingByNodeIdFromRun } from "../lib/runTelemetryProjection.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";
import type {
  BuddyPublicOutputBinding,
  BuddyPublicOutputMessage,
  BuddyPublicOutputRuntimeState,
} from "./buddyPublicOutput.ts";
import {
  buildBuddyPublicOutputBindings,
  createBuddyPublicOutputRuntimeState,
  isBuddyPublicOutputMessageVisible,
  resolveBuddyPublicOutputMessageKind,
} from "./buddyPublicOutput.ts";
import type { BuddyPublicOutputMetadata } from "./buddyMessageMetadata.ts";
import type { BuddyOutputTraceRuntimeState, BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";
import {
  buildBuddyOutputTracePlan,
  buildBuddyOutputTraceStateFromRunDetail,
  createBuddyPendingOutputTraceRuntimeState,
  listBuddyOutputTraceSegmentsForDisplay,
} from "./buddyOutputTrace.ts";
import { shouldShowGroupedBuddyMessageLabel } from "./buddyMessageGrouping.ts";
import type { BuddyVirtualOperationPlan } from "./virtualOperationProtocol.ts";

type BuddyRunDisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  clientOrder?: number | null;
  includeInContext?: boolean;
  runId?: string | null;
  activityText?: string;
  outputTrace?: BuddyOutputTraceSegment;
  publicOutput?: BuddyPublicOutputMetadata;
};

type BuddyRunDisplayMood = "idle" | "thinking" | "speaking" | "error";

type BuddyRunDisplayOptions<Message extends BuddyRunDisplayMessage> = {
  messages: Ref<Message[]>;
  mood: Ref<BuddyRunDisplayMood>;
  t: (key: string) => string;
  createMessage: (role: "user" | "assistant", content: string, id?: string, clientOrder?: number) => Message;
  allocateBuddyMessageClientOrder: () => number;
  scrollMessagesToBottom: () => Promise<void>;
  clearAutoResumingPageOperationPlaceholder: (assistantMessageId: string, runId: string) => void;
};

const BUDDY_CAPABILITY_PASSTHROUGH_OUTPUT_NODE_ID = "output_capability_passthrough";
const BUDDY_CAPABILITY_PASSTHROUGH_STATE_KEY = "capability_result.final_reply";

export function useBuddyRunDisplayMessages<Message extends BuddyRunDisplayMessage>({
  messages,
  mood,
  t,
  createMessage,
  allocateBuddyMessageClientOrder,
  scrollMessagesToBottom,
  clearAutoResumingPageOperationPlaceholder,
}: BuddyRunDisplayOptions<Message>) {
  function showBuddyImmediatePendingTrace(assistantMessageId: string) {
    const outputTrace: BuddyOutputTraceSegment = {
      segmentId: "__pending__",
      boundaryNodeId: "__pending__",
      boundaryLabel: t("buddy.activity.preparing"),
      outputNodeIds: [],
      status: "running",
      startedAtMs: nowPublicOutputMs(),
      completedAtMs: null,
      durationMs: null,
      records: [],
    };
    const existingMessages = new Map(messages.value.map((message) => [message.id, message]));
    removeBuddyRunDisplayMessages(assistantMessageId);
    messages.value.splice(resolveBuddyRunDisplayInsertionIndex(assistantMessageId), 0, buildOutputTraceMessage(assistantMessageId, "", outputTrace, existingMessages));
  }

  function showBuddyGraphPendingTrace(
    assistantMessageId: string,
    graph: GraphPayload,
    publicOutputBindings: BuddyPublicOutputBinding[],
  ) {
    const outputTracePlan = buildBuddyOutputTracePlan(graph, publicOutputBindings);
    const outputTraceState = createBuddyPendingOutputTraceRuntimeState(outputTracePlan, nowPublicOutputMs());
    if (listBuddyOutputTraceSegmentsForDisplay(outputTraceState).length === 0) {
      return;
    }
    syncStreamingBuddyRunDisplay(
      assistantMessageId,
      "",
      outputTraceState,
      createBuddyPublicOutputRuntimeState(),
    );
  }

  function hasVisibleBuddyRunDisplaySnapshot(snapshot: {
    outputTraceState: BuddyOutputTraceRuntimeState;
    publicOutputState: BuddyPublicOutputRuntimeState;
  }) {
    return (
      listBuddyOutputTraceSegmentsForDisplay(snapshot.outputTraceState).length > 0 ||
      snapshot.publicOutputState.order.length > 0
    );
  }

  function shouldRenderMessage(message: Message) {
    return (
      message.role === "user" ||
      Boolean(message.content.trim()) ||
      Boolean(message.outputTrace)
    );
  }

  function shouldShowMessageRoleLabel(messageIndex: number) {
    return shouldShowGroupedBuddyMessageLabel(messages.value, messageIndex, shouldRenderMessage);
  }

  function removeBuddyRunDisplayMessages(controllerMessageId: string) {
    const displayPrefix = `${controllerMessageId}:`;
    messages.value = messages.value.filter(
      (message) => !message.id.startsWith(`${displayPrefix}trace:`) && !message.id.startsWith(`${displayPrefix}output:`),
    );
  }

  function syncStreamingBuddyRunDisplay(
    assistantMessageId: string,
    runId: string,
    outputTraceState: BuddyOutputTraceRuntimeState,
    publicOutputState: BuddyPublicOutputRuntimeState,
  ) {
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
    return { publicOutputMessages, outputTraceMessages };
  }

  function syncBackgroundTemplateRunDisplay(
    operationPlan: BuddyVirtualOperationPlan,
    runDetail: RunDetail,
    graph: GraphPayload,
  ) {
    const parentControllerMessageId = resolveBuddyRunControllerMessageId(operationPlan.runId ?? "");
    if (parentControllerMessageId) {
      removeBuddyRunDisplayMessages(parentControllerMessageId);
    }
    const publicOutputBindings = buildBuddyPublicOutputBindings(graph);
    const outputTracePlan = buildBuddyOutputTracePlan(graph, publicOutputBindings);
    const outputTraceState = buildBuddyOutputTraceStateFromRunDetail(runDetail, outputTracePlan, graph);
    const outputState = buildPublicOutputRuntimeStateFromRunDetail(runDetail, publicOutputBindings, graph);
    syncBuddyRunDisplayMessages(
      buildBackgroundTemplateRunDisplayControllerId(operationPlan, runDetail.run_id),
      runDetail.run_id,
      outputTraceState,
      outputState,
    );
    void scrollMessagesToBottom();
  }

  function promoteBackgroundTemplateRunResultToBuddyReply(
    operationPlan: BuddyVirtualOperationPlan,
    runDetail: RunDetail,
    graph: GraphPayload,
  ) {
    if (runDetail.status !== "completed") {
      return;
    }
    const parentRunId = String(operationPlan.runId ?? "").trim();
    const assistantMessageId = resolveBuddyRunControllerMessageId(parentRunId);
    if (!parentRunId || !assistantMessageId) {
      return;
    }
    const outputBindings = buildBuddyPublicOutputBindings(graph);
    const outputState = buildPublicOutputRuntimeStateFromRunDetail(runDetail, outputBindings, graph);
    const primaryOutput = findPrimaryCompletedTextPublicOutput(outputState);
    if (!primaryOutput) {
      return;
    }

    removeBuddyRunDisplayMessages(buildBackgroundTemplateRunDisplayControllerId(operationPlan, runDetail.run_id));
    clearAutoResumingPageOperationPlaceholder(assistantMessageId, parentRunId);
    const promotedOutput = buildPromotedCapabilityPassthroughOutput(primaryOutput);
    const promotedOutputState = createBuddyPublicOutputRuntimeState();
    promotedOutputState.order.push(promotedOutput.outputNodeId);
    promotedOutputState.messagesByOutputNodeId[promotedOutput.outputNodeId] = promotedOutput;
    const { publicOutputMessages } = syncBuddyRunDisplayMessages(
      assistantMessageId,
      parentRunId,
      createEmptyBuddyOutputTraceRuntimeState(),
      promotedOutputState,
    );
    if (publicOutputMessages.length === 0) {
      return;
    }
    const controllerMessage = messages.value.find((message) => message.id === assistantMessageId);
    if (controllerMessage) {
      controllerMessage.activityText = "";
      controllerMessage.runId = parentRunId;
      controllerMessage.includeInContext = false;
    }
    mood.value = "speaking";
    void scrollMessagesToBottom();
  }

  function resolveBuddyRunControllerMessageId(runId: string) {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      return "";
    }
    return (
      messages.value.find(
        (message) =>
          message.role === "assistant" &&
          message.runId === normalizedRunId &&
          !message.outputTrace &&
          !message.publicOutput,
      )?.id ?? ""
    );
  }

  function buildBackgroundTemplateRunDisplayControllerId(operationPlan: BuddyVirtualOperationPlan, runId: string) {
    const parentControllerMessageId = resolveBuddyRunControllerMessageId(operationPlan.runId ?? "");
    const operationRequestId = String(operationPlan.operationRequestId ?? "").trim();
    const suffix = operationRequestId || runId;
    return parentControllerMessageId ? `${parentControllerMessageId}:target:${suffix}` : `buddy-target-run:${suffix}`;
  }

  function syncBuddyRunDisplayMessages(
    controllerMessageId: string,
    runId: string,
    outputTraceState: BuddyOutputTraceRuntimeState,
    outputState: BuddyPublicOutputRuntimeState,
  ) {
    const existingMessages = new Map(messages.value.map((message) => [message.id, message]));
    removeBuddyRunDisplayMessages(controllerMessageId);

    const outputTraceMessages: Message[] = [];
    const publicOutputMessages: Message[] = [];
    const displayMessages: Message[] = [];
    const handledOutputNodeIds = new Set<string>();
    const visibleOutputNodeIds = buildVisibleOutputNodeIdSet(outputState);

    for (const segment of listBuddyOutputTraceSegmentsForDisplay(outputTraceState, { visibleOutputNodeIds })) {
      const traceMessage = buildOutputTraceMessage(controllerMessageId, runId, segment, existingMessages);
      displayMessages.push(traceMessage);
      outputTraceMessages.push(traceMessage);
      for (const outputNodeId of segment.outputNodeIds) {
        const output = outputState.messagesByOutputNodeId[outputNodeId];
        handledOutputNodeIds.add(outputNodeId);
        if (!output || !isBuddyPublicOutputMessageVisible(output)) {
          continue;
        }
        const outputMessage = buildPublicOutputMessage(controllerMessageId, runId, output, existingMessages);
        displayMessages.push(outputMessage);
        publicOutputMessages.push(outputMessage);
      }
    }

    for (const outputNodeId of outputState.order) {
      if (handledOutputNodeIds.has(outputNodeId)) {
        continue;
      }
      const output = outputState.messagesByOutputNodeId[outputNodeId];
      if (!output || !isBuddyPublicOutputMessageVisible(output)) {
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
    existingMessages: Map<string, Message>,
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
    existingMessages: Map<string, Message>,
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

  function resolveBuddyRunDisplayInsertionIndex(controllerMessageId: string) {
    const controllerIndex = messages.value.findIndex((message) => message.id === controllerMessageId);
    if (controllerIndex >= 0) {
      return controllerIndex + 1;
    }
    const targetMarkerIndex = controllerMessageId.indexOf(":target:");
    if (targetMarkerIndex > 0) {
      const parentControllerMessageId = controllerMessageId.slice(0, targetMarkerIndex);
      const parentIndex = messages.value.findIndex((message) => message.id === parentControllerMessageId);
      if (parentIndex >= 0) {
        let insertionIndex = parentIndex + 1;
        while (messages.value[insertionIndex]?.id.startsWith(`${parentControllerMessageId}:`)) {
          insertionIndex += 1;
        }
        return insertionIndex;
      }
    }
    return messages.value.length;
  }

  return {
    showBuddyImmediatePendingTrace,
    showBuddyGraphPendingTrace,
    hasVisibleBuddyRunDisplaySnapshot,
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
    formatPublicOutputCardContent: (content: string) => formatPublicOutputCardContent(content, t("buddy.emptyReply")),
  };
}

function createEmptyBuddyOutputTraceRuntimeState(): BuddyOutputTraceRuntimeState {
  return {
    order: [],
    segmentsById: {},
    activeSegmentId: null,
    nextSegmentIndex: 0,
  };
}

function buildVisibleOutputNodeIdSet(outputState: BuddyPublicOutputRuntimeState) {
  const result = new Set<string>();
  for (const outputNodeId of outputState.order) {
    const output = outputState.messagesByOutputNodeId[outputNodeId];
    if (isBuddyPublicOutputMessageVisible(output)) {
      result.add(outputNodeId);
    }
  }
  return result;
}

function findPrimaryCompletedTextPublicOutput(
  outputState: BuddyPublicOutputRuntimeState,
): BuddyPublicOutputMessage | null {
  for (const outputNodeId of outputState.order) {
    const output = outputState.messagesByOutputNodeId[outputNodeId];
    if (output?.kind === "text" && output.status === "completed" && stringifyPublicOutputContent(output.content).trim()) {
      return output;
    }
  }
  return null;
}

function buildPromotedCapabilityPassthroughOutput(output: BuddyPublicOutputMessage): BuddyPublicOutputMessage {
  return {
    ...output,
    outputNodeId: BUDDY_CAPABILITY_PASSTHROUGH_OUTPUT_NODE_ID,
    outputNodeName: "能力结果",
    stateKey: BUDDY_CAPABILITY_PASSTHROUGH_STATE_KEY,
    stateName: "final_reply",
    stateType: "markdown",
    displayMode: "markdown",
    kind: "text",
  };
}

function buildOutputTraceMessageId(controllerMessageId: string, segmentId: string) {
  return `${controllerMessageId}:trace:${segmentId}`;
}

function buildPublicOutputMessageId(controllerMessageId: string, outputNodeId: string) {
  return `${controllerMessageId}:output:${outputNodeId}`;
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

function formatPublicOutputCardContent(content: string, emptyLabel = "") {
  return content.trim() || emptyLabel;
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
