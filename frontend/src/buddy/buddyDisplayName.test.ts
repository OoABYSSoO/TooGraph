import test from "node:test";
import assert from "node:assert/strict";

import type { BuddyProfile } from "../types/buddy.ts";

import { resolveBuddyWindowDisplayName } from "./buddyDisplayName.ts";

function createProfile(overrides: Partial<BuddyProfile> = {}): BuddyProfile {
  return {
    name: "TooGraph Buddy",
    persona: "",
    tone: "",
    response_style: "",
    display_preferences: {},
    ...overrides,
  };
}

test("resolveBuddyWindowDisplayName switches the generated default name by UI language", () => {
  const profile = createProfile({
    name: "图图",
    display_preferences: {
      display_name: "TooGraph Buddy",
    },
  });

  assert.equal(resolveBuddyWindowDisplayName(profile, "TooGraph 伙伴", "zh-CN"), "图图");
  assert.equal(resolveBuddyWindowDisplayName(profile, "TooGraph Buddy", "zh-TW"), "图图");
  assert.equal(resolveBuddyWindowDisplayName(profile, "TooGraph Buddy", "en-US"), "TooGraph Buddy");
  assert.equal(resolveBuddyWindowDisplayName(profile, "TooGraph Buddy", "ja-JP"), "TooGraph Buddy");
});

test("resolveBuddyWindowDisplayName respects a custom SOUL.md name in every UI language", () => {
  const profile = createProfile({
    name: "  灵魂伙伴  ",
    display_preferences: {
      display_name: "TooGraph Buddy",
    },
  });

  assert.equal(resolveBuddyWindowDisplayName(profile, "TooGraph 伙伴", "zh-CN"), "灵魂伙伴");
  assert.equal(resolveBuddyWindowDisplayName(profile, "TooGraph Buddy", "en-US"), "灵魂伙伴");
});

test("resolveBuddyWindowDisplayName falls back to display name then the UI fallback", () => {
  assert.equal(
    resolveBuddyWindowDisplayName(
      createProfile({ name: "   ", display_preferences: { display_name: "  短名伙伴  " } }),
      "TooGraph 伙伴",
      "zh-CN",
    ),
    "短名伙伴",
  );
  assert.equal(
    resolveBuddyWindowDisplayName(
      createProfile({ name: "   ", display_preferences: { display_name: "  " } }),
      "TooGraph 伙伴",
      "zh-CN",
    ),
    "TooGraph 伙伴",
  );
});
