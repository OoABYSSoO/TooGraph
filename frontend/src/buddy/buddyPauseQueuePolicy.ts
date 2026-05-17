export type BuddyPauseActionMode = "execute" | "supplement";

export type BuddyComposerDecision =
  | { kind: "ignore_empty"; userMessage: "" }
  | { kind: "ignore_resume_busy"; userMessage: string }
  | { kind: "resume_paused_run"; userMessage: string }
  | { kind: "enqueue_new_turn"; userMessage: string };

export function resolveBuddyComposerDecision(input: {
  draftText: string;
  hasPausedRun: boolean;
  isResumeBusy: boolean;
}): BuddyComposerDecision {
  const userMessage = input.draftText.trim();
  if (!userMessage) {
    return { kind: "ignore_empty", userMessage: "" };
  }
  if (input.hasPausedRun && input.isResumeBusy) {
    return { kind: "ignore_resume_busy", userMessage };
  }
  if (input.hasPausedRun) {
    return { kind: "resume_paused_run", userMessage };
  }
  return { kind: "enqueue_new_turn", userMessage };
}

export function resolveInitialBuddyPauseActionMode(requiredInputCount: number): BuddyPauseActionMode {
  return requiredInputCount > 0 ? "supplement" : "execute";
}

export function shouldHoldBuddyQueueDrain(input: { hasPausedRun: boolean }) {
  return input.hasPausedRun;
}
