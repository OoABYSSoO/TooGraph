import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "BuddyPage.vue"), "utf8");

test("BuddyPage manages profile, policy, memories, summary, and revisions", () => {
  assert.match(source, /fetchBuddyProfile/);
  assert.match(source, /updateBuddyProfile/);
  assert.match(source, /fetchBuddyPolicy/);
  assert.match(source, /updateBuddyPolicy/);
  assert.match(source, /fetchBuddyMemories/);
  assert.match(source, /createBuddyMemory/);
  assert.match(source, /updateBuddyMemory/);
  assert.match(source, /deleteBuddyMemory/);
  assert.match(source, /fetchBuddySessionSummary/);
  assert.match(source, /fetchBuddyRevisions/);
  assert.match(source, /restoreBuddyRevision/);
  assert.match(source, /<ElTabs/);
  assert.match(source, /name="profile"/);
  assert.match(source, /name="policy"/);
  assert.match(source, /name="memory"/);
  assert.match(source, /name="summary"/);
  assert.match(source, /name="confirmation"/);
  assert.match(source, /name="history"/);
});

test("BuddyPage exposes the unified buddy permission mode", () => {
  assert.match(source, /<ElSegmented[\s\S]*v-model="policyDraft\.graph_permission_mode"[\s\S]*:options="permissionModeOptions"/);
  assert.match(source, /permissionModeOptions/);
  assert.match(source, /value: "ask_first"/);
  assert.match(source, /value: "full_access"/);
  assert.doesNotMatch(source, /graph_permission_mode:\s*"advisory"/);
});

test("BuddyPage reloads buddy data when the widget reports external updates", () => {
  assert.match(source, /import \{ computed, onMounted, ref, watch \} from "vue";/);
  assert.match(source, /import \{ useBuddyContextStore \} from "@\/stores\/buddyContext";/);
  assert.match(source, /const buddyContextStore = useBuddyContextStore\(\);/);
  assert.match(source, /function hasActiveBuddyPageWrite\(\)/);
  assert.match(source, /watch\(\s*\(\) => buddyContextStore\.dataRefreshNonce,/);
  assert.match(source, /if \(!hasLoaded\.value \|\| hasActiveBuddyPageWrite\(\)\) \{/);
  assert.match(source, /void loadAll\(\{ silent: true \}\);/);
});

test("BuddyPage reuses the standard paused-run card for confirmations", () => {
  assert.match(source, /import BuddyPauseCard from "@\/buddy\/BuddyPauseCard\.vue";/);
  assert.match(source, /import \{ cancelRun, fetchRun, fetchRuns, resumeRun \} from "@\/api\/runs";/);
  assert.match(source, /fetchRuns\(\{ status: "awaiting_human" \}\)/);
  assert.match(source, /<BuddyPauseCard[\s\S]*:run="selectedPausedRunDetail"[\s\S]*@resume="resumeSelectedPausedRun"[\s\S]*@cancel="cancelSelectedPausedRun"/);
  assert.match(source, /async function resumeSelectedPausedRun\(payload: Record<string, unknown>\)/);
  assert.match(source, /await resumeRun\(selectedPausedRunDetail\.value\.run_id,\s*payload\)/);
  assert.match(source, /async function cancelSelectedPausedRun\(\)/);
  assert.match(source, /await cancelRun\(selectedPausedRunDetail\.value\.run_id,\s*t\("buddy\.pause\.cancelReason"\)\)/);
  assert.doesNotMatch(source, /buildHumanReviewResumePayload/);
  assert.doesNotMatch(source, /permission_approval:\s*\{/);
});
