import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "BuddyPauseCard.vue"), "utf8");

test("BuddyPauseCard owns the shared paused-run review controls", () => {
  assert.match(source, /defineProps<\{[\s\S]*run: RunDetail \| null;[\s\S]*busy\?: boolean;/);
  assert.match(source, /defineEmits<\{[\s\S]*resume: \[payload: Record<string, unknown>\];[\s\S]*cancel: \[\];/);
  assert.match(source, /buildHumanReviewPanelModel/);
  assert.match(source, /buildHumanReviewResumePayload/);
  assert.match(source, /resolveInitialBuddyPauseActionMode/);
  assert.match(source, /class="buddy-widget__pause-card"/);
  assert.match(source, /pausedBuddyActionMode === 'supplement'/);
  assert.match(source, /permission_approval:\s*\{[\s\S]*decision:\s*"denied"/);
  assert.match(source, /emit\(['"]resume['"],\s*buildBuddyPauseResumePayload\(\)\)/);
  assert.match(source, /emit\(['"]cancel['"]\)/);
});
