import type { Ref } from "vue";

import {
  fetchBuddyRunTemplateBinding,
  fetchBuddySessionSummary,
} from "../api/buddy.ts";
import { fetchTemplate, runGraph } from "../api/graphs.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { BuddyPublicOutputBinding } from "./buddyPublicOutput.ts";
import { buildBuddyPublicOutputBindings } from "./buddyPublicOutput.ts";
import {
  buildBuddyChatGraph,
  type BuddyChatMessage,
  type BuddyMode,
  type BuildBuddyChatGraphInput,
} from "./buddyChatGraph.ts";

type BuddyBoundRunTemplateOptions = {
  buddyMode: Ref<BuddyMode>;
  buddyModelRef: Ref<string>;
  buildPageOperationRuntimeContext: () => {
    actionRuntimeContext: BuildBuddyChatGraphInput["pageOperationContext"];
  };
};

export type BuddyBoundRunTemplateRequest = {
  userMessage: string;
  userMessageId?: string;
  history: BuddyChatMessage[];
  sessionId: string;
};

export type BuddyBoundRunTemplateResult = {
  runId: string;
  graph: GraphPayload;
  publicOutputBindings: BuddyPublicOutputBinding[];
  sessionSummary: string;
};

export function useBuddyBoundRunTemplate({
  buddyMode,
  buddyModelRef,
  buildPageOperationRuntimeContext,
}: BuddyBoundRunTemplateOptions) {
  async function startBuddyBoundRunTemplate(
    request: BuddyBoundRunTemplateRequest,
  ): Promise<BuddyBoundRunTemplateResult> {
    const binding = await fetchBuddyRunTemplateBinding();
    const template = await fetchTemplate(binding.template_id);
    const pageOperationContext = buildPageOperationRuntimeContext();
    const sessionSummary = await fetchBuddySessionSummary();
    const graph = buildBuddyChatGraph(
      template,
      {
        userMessage: request.userMessage,
        history: request.history,
        sessionSummary: sessionSummary.content,
        currentSessionId: request.sessionId,
        currentMessageId: request.userMessageId,
        pageOperationContext: pageOperationContext.actionRuntimeContext,
        buddyMode: buddyMode.value,
        buddyModel: buddyModelRef.value,
      },
      binding,
    );
    const publicOutputBindings = buildBuddyPublicOutputBindings(graph);
    const run = await runGraph(graph);
    return {
      runId: run.run_id,
      graph,
      publicOutputBindings,
      sessionSummary: sessionSummary.content,
    };
  }

  return {
    startBuddyBoundRunTemplate,
  };
}
