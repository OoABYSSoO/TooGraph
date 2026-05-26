import type { BuddyIdentity } from "../types/buddy.ts";

const DEFAULT_CHINESE_BUDDY_NAME = "图图";
const DEFAULT_NON_CHINESE_BUDDY_NAME = "TooGraph Buddy";
const LEGACY_DEFAULT_BUDDY_NAME = "TooGraph Buddy";
const LEGACY_DEFAULT_BUDDY_DISPLAY_NAME = "Buddy";

function readTrimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isChineseLocale(locale: unknown): boolean {
  return String(locale ?? "").trim().toLowerCase().startsWith("zh");
}

function resolveDefaultBuddyNameForLocale(locale: unknown): string {
  return isChineseLocale(locale) ? DEFAULT_CHINESE_BUDDY_NAME : DEFAULT_NON_CHINESE_BUDDY_NAME;
}

function isDefaultBuddyName(value: string): boolean {
  return value === DEFAULT_CHINESE_BUDDY_NAME || value === LEGACY_DEFAULT_BUDDY_NAME;
}

function isDefaultBuddyDisplayName(value: string): boolean {
  return value === DEFAULT_NON_CHINESE_BUDDY_NAME || value === LEGACY_DEFAULT_BUDDY_DISPLAY_NAME;
}

export function resolveBuddyWindowDisplayName(
  identity: BuddyIdentity | null | undefined,
  fallback: string,
  locale: unknown = "zh-CN",
): string {
  const name = readTrimmedText(identity?.name);
  const displayName = readTrimmedText(identity?.display_preferences?.display_name);
  if (isDefaultBuddyName(name) && (!displayName || isDefaultBuddyDisplayName(displayName))) {
    return resolveDefaultBuddyNameForLocale(locale);
  }
  if (name) {
    return name;
  }
  if (isDefaultBuddyDisplayName(displayName)) {
    return resolveDefaultBuddyNameForLocale(locale);
  }
  return displayName || fallback;
}
