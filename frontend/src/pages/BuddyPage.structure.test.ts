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
  assert.match(source, /fetchBuddyCommands/);
  assert.match(source, /restoreBuddyRevision/);
  assert.match(source, /<ElTabs/);
  assert.match(source, /name="profile"/);
  assert.match(source, /name="policy"/);
  assert.match(source, /name="memory"/);
  assert.match(source, /name="summary"/);
  assert.match(source, /name="confirmation"/);
  assert.match(source, /name="history"/);
  assert.match(source, /name="mascot-debug"/);
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

test("BuddyPage links revision history to command audit records", () => {
  assert.match(source, /import \{[\s\S]*BUDDY_REVISION_HISTORY_TARGET_FILTERS,[\s\S]*buildBuddyRevisionHistoryRows,[\s\S]*filterBuddyRevisionHistoryRows,[\s\S]*\} from "\.\/buddyRevisionHistoryModel\.ts";/);
  assert.match(source, /const commands = ref<BuddyCommandRecord\[\]>\(\[\]\);/);
  assert.match(source, /const historyTargetFilter = ref<BuddyRevisionHistoryTargetFilter>\("all"\);/);
  assert.match(source, /const orderedRevisionRows = computed\(\(\) => buildBuddyRevisionHistoryRows\(revisions\.value, commands\.value\)\);/);
  assert.match(source, /const filteredRevisionRows = computed\(\(\) => filterBuddyRevisionHistoryRows\(orderedRevisionRows\.value, historyTargetFilter\.value\)\);/);
  assert.match(source, /const historyTargetOptions = computed\(\(\) =>\s*BUDDY_REVISION_HISTORY_TARGET_FILTERS\.map/);
  assert.match(source, /<ElSegmented[\s\S]*v-model="historyTargetFilter"[\s\S]*:options="historyTargetOptions"/);
  assert.match(source, /<ElTable :data="filteredRevisionRows"/);
  assert.match(source, /row\.sourceLabel/);
  assert.match(source, /row\.previousValueText/);
  assert.match(source, /row\.nextValueText/);
  assert.match(source, /filteredRevisionRows\.length === 0/);
});

test("BuddyPage hosts the mascot action debug panel as a tab after History", () => {
  assert.match(source, /import \{ BUDDY_DEBUG_ACTION_GROUPS \} from "@\/buddy\/buddyMascotDebug";/);
  assert.match(source, /import \{ useBuddyMascotDebugStore \} from "@\/stores\/buddyMascotDebug";/);
  assert.match(source, /<ElTabPane :label="t\('buddyPage\.tabs\.mascotDebug'\)" name="mascot-debug">/);
  assert.match(source, /v-for="group in BUDDY_DEBUG_ACTION_GROUPS"/);
  assert.match(source, /v-for="action in group\.actions"/);
  assert.match(source, /@click="buddyMascotDebugStore\.trigger\(action\.action\)"/);
});
