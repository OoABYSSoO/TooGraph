export type BuddyPausedRunRecoveryMessage = {
  id: string;
  role: "user" | "assistant";
  runId?: string | null;
};

export type BuddyPausedRunRecoveryCandidate = {
  messageId: string;
  runId: string;
};

export function findLatestRecoverablePausedRunMessage(
  messages: readonly BuddyPausedRunRecoveryMessage[],
): BuddyPausedRunRecoveryCandidate | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") {
      continue;
    }
    const runId = message.runId?.trim();
    if (runId) {
      return { messageId: message.id, runId };
    }
  }
  return null;
}

export function isRecoverablePausedRunStatus(status: string | null | undefined) {
  return status === "awaiting_human";
}
