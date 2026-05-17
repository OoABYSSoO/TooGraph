import test from "node:test";
import assert from "node:assert/strict";
import { buildBuddyBubblePreviewLabel } from "./buddyBubblePreviewModel.ts";

test("buildBuddyBubblePreviewLabel shows four visible characters plus ellipsis for long content", () => {
  assert.equal(buildBuddyBubblePreviewLabel("我已明确您想了解更多内容"), "我已明确...");
  assert.equal(buildBuddyBubblePreviewLabel("  当前状态：运行中  "), "当前状态...");
});

test("buildBuddyBubblePreviewLabel preserves short content without adding noise", () => {
  assert.equal(buildBuddyBubblePreviewLabel("准备好了"), "准备好了");
  assert.equal(buildBuddyBubblePreviewLabel(""), "");
  assert.equal(buildBuddyBubblePreviewLabel("   "), "");
});
