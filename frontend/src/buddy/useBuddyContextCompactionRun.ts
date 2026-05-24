import type { Ref } from "vue";

import { fetchTemplate, runGraph } from "../api/graphs.ts";
import type { RunDetail } from "../types/run.ts";
import {
  BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID,
  buildBuddyContextBudgetReport,
  buildBuddyContextCompactionGraph,
  shouldRunBuddyContextCompaction,
  type BuddyContextCompactionTrigger,
  type BuddyContextHistoryMessage,
} from "./buddyContextCompaction.ts";
import { resolveBuddyReplyText } from "./buddyChatGraph.ts";

type BuddyContextCompactionRunOptions = {
  currentSessionId: Ref<string | null>;
  buddyModelRef: Ref<string>;
  pollRunUntilFinished: (runId: string, signal: AbortSignal) => Promise<RunDetail>;
  notifyBuddyDataChanged: () => void;
};

type BuddyContextCompactionRunRequest = {
  trigger: BuddyContextCompactionTrigger;
  history: BuddyContextHistoryMessage[];
  userMessage: string;
  sessionSummary: string;
  sourceRun?: RunDetail | null;
  sourceRunId?: string;
  capabilityResult?: unknown;
  publicResponse?: string;
};

export function useBuddyContextCompactionRun({
  currentSessionId,
  buddyModelRef,
  pollRunUntilFinished,
  notifyBuddyDataChanged,
}: BuddyContextCompactionRunOptions) {
  const contextCompactionAbortControllers = new Set<AbortController>();

  async function startBuddyContextCompactionRun(request: BuddyContextCompactionRunRequest) {
    try {
      await runContextCompactionIfNeeded(request, { wait: false });
    } catch (error) {
      console.warn("[Buddy] Context compaction failed to start.", error);
    }
  }

  async function runContextCompactionIfNeeded(
    request: BuddyContextCompactionRunRequest,
    options: { wait: boolean },
  ): Promise<RunDetail | null> {
    const enrichedRequest = enrichContextCompactionRequest(request);
    const report = buildBuddyContextBudgetReport({
      trigger: enrichedRequest.trigger,
      history: enrichedRequest.history,
      userMessage: enrichedRequest.userMessage,
      sessionSummary: enrichedRequest.sessionSummary,
      sourceRun: enrichedRequest.sourceRun,
      capabilityResult: enrichedRequest.capabilityResult,
      publicResponse: enrichedRequest.publicResponse,
    });
    const decision = shouldRunBuddyContextCompaction(report);
    if (!decision.shouldCompact) {
      return null;
    }
    const template = await fetchTemplate(BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID);
    const graph = buildBuddyContextCompactionGraph(template, {
      ...enrichedRequest,
      currentSessionId: currentSessionId.value ?? "",
      buddyModel: buddyModelRef.value,
    });
    const compactionRun = await runGraph(graph);
    if (!options.wait) {
      void pollBuddyContextCompactionRun(compactionRun.run_id);
      return null;
    }
    return await pollBuddyContextCompactionRun(compactionRun.run_id);
  }

  async function pollBuddyContextCompactionRun(runId: string) {
    const controller = new AbortController();
    contextCompactionAbortControllers.add(controller);
    try {
      const run = await pollRunUntilFinished(runId, controller.signal);
      if (run.status === "completed") {
        notifyBuddyDataChanged();
      } else if (run.status === "failed") {
        console.warn("[Buddy] Context compaction failed.", run.errors);
      }
      return run;
    } finally {
      contextCompactionAbortControllers.delete(controller);
    }
  }

  function abortContextCompactionRuns() {
    for (const controller of contextCompactionAbortControllers) {
      controller.abort();
    }
    contextCompactionAbortControllers.clear();
  }

  return {
    startBuddyContextCompactionRun,
    abortContextCompactionRuns,
  };
}

function enrichContextCompactionRequest(request: BuddyContextCompactionRunRequest): BuddyContextCompactionRunRequest {
  const sourceRun = request.sourceRun ?? null;
  if (!sourceRun) {
    return request;
  }
  return {
    ...request,
    sourceRun,
    sourceRunId: request.sourceRunId || sourceRun.run_id,
    userMessage: request.userMessage || normalizeRunStateValue(sourceRun, "user_message", ""),
    capabilityResult: request.capabilityResult ?? resolveRunStateValueByName(sourceRun, "capability_result", {}),
    publicResponse: request.publicResponse || normalizeRunStateValue(sourceRun, "public_response", resolveBuddyReplyText(sourceRun)),
  };
}

function normalizeRunStateValue(run: RunDetail, stateName: string, fallback: string): string {
  const value = resolveRunStateValueByName(run, stateName, fallback);
  return typeof value === "string" ? value : fallback;
}

function resolveRunStateValueByName(run: RunDetail, stateName: string, fallback: unknown) {
  const stateKey = findRunStateKeyByName(run, stateName) ?? stateName;
  if (stateKey in run.state_snapshot.values) {
    return run.state_snapshot.values[stateKey];
  }
  if (run.artifacts?.state_values && stateKey in run.artifacts.state_values) {
    return run.artifacts.state_values[stateKey];
  }
  return fallback;
}

function findRunStateKeyByName(run: RunDetail, stateName: string) {
  const stateSchema = isRecord(run.graph_snapshot?.state_schema) ? run.graph_snapshot.state_schema : null;
  if (!stateSchema) {
    return null;
  }
  return (
    Object.entries(stateSchema).find(
      ([, definition]) => isRecord(definition) && String(definition.name ?? "").trim() === stateName,
    )?.[0] ?? null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
