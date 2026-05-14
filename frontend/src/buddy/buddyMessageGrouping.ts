export type BuddyMessageGroupingCandidate = {
  role: string;
};

export function shouldShowGroupedBuddyMessageLabel<T extends BuddyMessageGroupingCandidate>(
  messages: T[],
  messageIndex: number,
  isMessageVisible: (message: T) => boolean,
) {
  const current = messages[messageIndex];
  if (!current || !isMessageVisible(current)) {
    return false;
  }
  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const previous = messages[index];
    if (!previous || !isMessageVisible(previous)) {
      continue;
    }
    return previous.role !== current.role;
  }
  return true;
}
