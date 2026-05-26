import type { Ref } from "vue";

import type { RunDetail } from "../types/run.ts";
import { resolveBuddyReplyText, type BuddyChatMessage } from "./buddyChatGraph.ts";
import { useBuddyAutonomousReviewRun } from "./useBuddyAutonomousReviewRun.ts";
import { useBuddyContextCompactionRun } from "./useBuddyContextCompactionRun.ts";

type BuddyVisibleRunTemplateEffectsOptions = {
  currentSessionId: Ref<string | null>;
  buddyModelRef: Ref<string>;
  pollRunUntilFinished: (runId: string, signal: AbortSignal) => Promise<RunDetail>;
  notifyBuddyDataChanged: () => void;
};

type BuddyVisibleRunTemplateEffectsRequest = {
  runDetail: RunDetail;
  runId: string;
  sourceTurn?: {
    history: BuddyChatMessage[];
    userMessage: string;
  };
  sessionSummary?: string;
};

export function useBuddyVisibleRunTemplateEffects({
  currentSessionId,
  buddyModelRef,
  pollRunUntilFinished,
  notifyBuddyDataChanged,
}: BuddyVisibleRunTemplateEffectsOptions) {
  const {
    startBuddyAutonomousReviewRun,
    abortBackgroundReviewRuns,
  } = useBuddyAutonomousReviewRun({
    buddyModelRef,
    pollRunUntilFinished,
    notifyBuddyDataChanged,
  });
  const {
    startBuddyContextCompactionRun,
    abortContextCompactionRuns,
  } = useBuddyContextCompactionRun({
    currentSessionId,
    buddyModelRef,
    pollRunUntilFinished,
    notifyBuddyDataChanged,
  });

  function startBuddyVisibleRunTemplateEffects(request: BuddyVisibleRunTemplateEffectsRequest) {
    void startBuddyAutonomousReviewRun(request.runDetail);
    void startBuddyContextCompactionRun({
      trigger: "background",
      sourceRun: request.runDetail,
      sourceRunId: request.runId,
      history: request.sourceTurn?.history ?? [],
      userMessage: request.sourceTurn?.userMessage ?? "",
      sessionSummary: request.sessionSummary ?? "",
      publicResponse: resolveBuddyReplyText(request.runDetail),
    });
  }

  function abortBuddyVisibleRunTemplateEffects() {
    abortBackgroundReviewRuns();
    abortContextCompactionRuns();
  }

  return {
    startBuddyVisibleRunTemplateEffects,
    abortBuddyVisibleRunTemplateEffects,
  };
}
