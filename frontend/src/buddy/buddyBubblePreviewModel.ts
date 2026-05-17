const BUDDY_BUBBLE_PREVIEW_CHARACTER_COUNT = 4;

export function buildBuddyBubblePreviewLabel(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    return "";
  }
  const characters = Array.from(normalized);
  if (characters.length <= BUDDY_BUBBLE_PREVIEW_CHARACTER_COUNT) {
    return normalized;
  }
  return `${characters.slice(0, BUDDY_BUBBLE_PREVIEW_CHARACTER_COUNT).join("")}...`;
}
