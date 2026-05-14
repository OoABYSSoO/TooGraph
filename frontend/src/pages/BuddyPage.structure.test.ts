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
  assert.match(source, /fetchBuddyRunTemplateBinding/);
  assert.match(source, /fetchBuddyCommands/);
  assert.match(source, /restoreBuddyRevision/);
  assert.match(source, /updateBuddyRunTemplateBinding/);
  assert.match(source, /fetchTemplates/);
  assert.match(source, /fetchTemplate/);
  assert.match(source, /<ElTabs/);
  assert.match(source, /name="profile"/);
  assert.match(source, /name="policy"/);
  assert.match(source, /name="memory"/);
  assert.match(source, /name="summary"/);
  assert.match(source, /name="binding"/);
  assert.match(source, /name="confirmation"/);
  assert.match(source, /name="history"/);
  assert.match(source, /name="mascot-debug"/);
  assert.match(source, /buildBuddyRunTemplateInputRows/);
  assert.match(source, /validateBuddyRunTemplateBinding/);
});

test("BuddyPage opens template binding first and renders it as Buddy input rows", () => {
  const bindingIndex = source.indexOf('name="binding"');
  const profileIndex = source.indexOf('name="profile"');
  assert.ok(bindingIndex > -1);
  assert.ok(profileIndex > -1);
  assert.ok(bindingIndex < profileIndex);
  assert.match(source, /const activeTab = ref\("binding"\);/);
  assert.match(source, /buildBuddyRunTemplateSourceRows/);
  assert.match(source, /buildBuddyRunInputNodeOptions/);
  assert.match(source, /setBuddyRunTemplateSourceBinding/);
  assert.match(source, /v-for="row in bindingSourceRows"/);
  assert.match(source, /class="buddy-page__binding-card"/);
  assert.match(source, /class="buddy-page__template-select toograph-select"/);
  assert.match(source, /popper-class="toograph-select-popper buddy-page__binding-select-popper"/);
  assert.match(source, /class="buddy-page__binding-select toograph-select"/);
  assert.match(source, /class="buddy-page__binding-option"/);
  assert.match(source, /bindingOptionDisabledReason\(option\)/);
  assert.match(source, /class="buddy-page__binding-action buddy-page__binding-action--primary"/);
  assert.match(source, /class="buddy-page__binding-action buddy-page__binding-action--secondary"/);
  assert.match(source, /:model-value="row\.selectedNodeId"/);
  assert.match(source, /@update:model-value="setBindingInputNode\(row\.source, \$event\)"/);
  assert.doesNotMatch(source, /:model-value="bindingDraft\.input_bindings\[row\.nodeId\]/);
  assert.doesNotMatch(source, /function setBindingSource\(nodeId: string, value: unknown\)/);
  assert.doesNotMatch(source, /<ElTable :data="bindingSourceRows"/);
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
  assert.match(source, /v-for="entry in row\.diffEntries"/);
  assert.match(source, /historyDiffTagType\(entry\.changeKind\)/);
  assert.match(source, /<details class="buddy-page__history-raw-diff">/);
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

test("BuddyPage debug tab can enable and disable the virtual cursor", () => {
  assert.match(source, /buddyMascotDebugStore\.virtualCursorEnabled/);
  assert.match(source, /buddyMascotDebugStore\.setVirtualCursorEnabled\(!buddyMascotDebugStore\.virtualCursorEnabled\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.virtualCursor\.(enable|disable)"\)/);
  assert.match(source, /buddy-page__debug-button--cursor/);
});

test("BuddyPage debug tab exposes live mascot motion timing controls", () => {
  assert.match(source, /ElInputNumber/);
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.moveDurationMs/);
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.stepPauseMs/);
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.virtualCursorFlightSpeedPxPerMs/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ moveDurationMs: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ stepPauseMs: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ virtualCursorFlightSpeedPxPerMs: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.resetMotionConfig\(\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.moveDuration"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.stepPause"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.virtualCursorSpeed"\)/);
  assert.match(source, /buddy-page__debug-motion-grid/);
});

test("BuddyPage places template binding before confirmations", () => {
  const bindingIndex = source.indexOf('name="binding"');
  const confirmationIndex = source.indexOf('name="confirmation"');
  assert.ok(bindingIndex > -1);
  assert.ok(confirmationIndex > -1);
  assert.ok(bindingIndex < confirmationIndex);
});
