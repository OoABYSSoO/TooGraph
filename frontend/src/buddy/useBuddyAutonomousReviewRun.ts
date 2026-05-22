import type { Ref } from "vue";

import { fetchBuddyMemoryReviewTemplateBinding } from "../api/buddy.ts";
import { fetchTemplate, runGraph } from "../api/graphs.ts";
import type { RunDetail } from "../types/run.ts";
import { buildBuddyReviewGraph } from "./buddyChatGraph.ts";

type BuddyAutonomousReviewRunOptions = {
  currentSessionId: Ref<string | null>;
  buddyModelRef: Ref<string>;
  pollRunUntilFinished: (runId: string, signal: AbortSignal) => Promise<RunDetail>;
  notifyBuddyDataChanged: () => void;
};

export function useBuddyAutonomousReviewRun({
  currentSessionId,
  buddyModelRef,
  pollRunUntilFinished,
  notifyBuddyDataChanged,
}: BuddyAutonomousReviewRunOptions) {
  const backgroundReviewAbortControllers = new Set<AbortController>();

  async function startBuddyAutonomousReviewRun(mainRun: RunDetail) {
    if (mainRun.status !== "completed") {
      return;
    }
    try {
      const binding = await fetchBuddyMemoryReviewTemplateBinding();
      const template = await fetchTemplate(binding.template_id);
      const graph = buildBuddyReviewGraph(template, {
        mainRun,
        binding,
        currentSessionId: currentSessionId.value ?? "",
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
        notifyBuddyDataChanged();
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

  return {
    startBuddyAutonomousReviewRun,
    abortBackgroundReviewRuns,
  };
}
