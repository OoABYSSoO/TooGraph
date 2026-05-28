import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "BuddyPage.vue"), "utf8");
const messagesSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../i18n/messages.ts"), "utf8");

function extractSourceBetween(startText: string, endText: string) {
  const startIndex = source.indexOf(startText);
  const endIndex = source.indexOf(endText, startIndex + startText.length);
  if (startIndex === -1 || endIndex === -1) {
    return "";
  }
  return source.slice(startIndex, endIndex);
}

test("BuddyPage manages identity, USER.md, MEMORY.md, summary, and revisions", () => {
  assert.match(source, /fetchBuddyIdentity/);
  assert.match(source, /updateBuddyIdentity/);
  assert.match(source, /fetchBuddyUserContextDocument/);
  assert.match(source, /updateBuddyUserContextDocument/);
  assert.match(source, /fetchBuddyMemoryDocument/);
  assert.match(source, /updateBuddyMemoryDocument/);
  assert.match(source, /fetchBuddyHomeFiles/);
  assert.match(source, /fetchBuddySessionSummary/);
  assert.match(source, /fetchBuddyRevisions/);
  assert.match(source, /fetchBuddyRunTemplateBinding/);
  assert.match(source, /fetchBuddyMemoryReviewTemplateBinding/);
  assert.match(source, /fetchBuddyCommands/);
  assert.match(source, /restoreBuddyRevision/);
  assert.match(source, /updateBuddyRunTemplateBinding/);
  assert.match(source, /updateBuddyMemoryReviewTemplateBinding/);
  assert.match(source, /fetchTemplates/);
  assert.match(source, /fetchTemplate/);
  assert.match(source, /<ElTabs/);
  assert.match(source, /name="identity"/);
  assert.match(source, /name="userContext"/);
  assert.match(source, /name="memory"/);
  assert.doesNotMatch(source, /name="agents"/);
  assert.doesNotMatch(source, /name="files"/);
  assert.match(source, /name="summary"/);
  assert.match(source, /name="binding"/);
  assert.match(source, /name="confirmation"/);
  assert.match(source, /name="history"/);
  assert.match(source, /name="mascot-debug"/);
  assert.match(source, /buildBuddyRunTemplateInputRows/);
  assert.match(source, /validateBuddyRunTemplateBinding/);
  assert.match(source, /buildBuddyMemoryReviewTemplateInputRows/);
  assert.match(source, /validateBuddyMemoryReviewTemplateBinding/);
  assert.match(source, /memoryDocumentDraft/);
  assert.match(source, /userContextDraft/);
  assert.match(source, /homeFiles/);
  assert.doesNotMatch(source, /agentsHomeFile/);
  assert.doesNotMatch(source, /file\.path === "AGENTS\.md"/);
  assert.doesNotMatch(source, /selectedHomeFile/);
  assert.doesNotMatch(source, /buddy-page__file-browser/);
  assert.match(source, /saveMemoryDocument/);
  assert.match(source, /saveUserContextDocument/);
  assert.doesNotMatch(source, /fetchPlatformMemories/);
  assert.doesNotMatch(source, /platformMemoryCandidates/);
  assert.doesNotMatch(source, /createBuddyMemory/);
});

test("BuddyPage labels identity and USER.md surfaces clearly in Chinese", () => {
  assert.match(messagesSource, /identity:\s*"伙伴身份"/);
  assert.match(messagesSource, /userContext:\s*"USER\.md"/);
  assert.match(messagesSource, /title:\s*"伙伴身份设定"/);
  assert.match(messagesSource, /saveIdentity:\s*"保存伙伴身份"/);
  assert.match(messagesSource, /saveDocument:\s*"保存 USER\.md"/);
});

test("BuddyPage notifies open Buddy widgets after durable context changes", () => {
  const saveIdentityBlock = extractSourceBetween("async function saveIdentity()", "async function saveUserContextDocument()");
  const saveUserContextBlock = extractSourceBetween("async function saveUserContextDocument()", "async function saveMemoryDocument()");
  const restoreRevisionBlock = extractSourceBetween("async function restoreRevision(revisionId: string)", "watch(");

  assert.match(saveIdentityBlock, /buddyContextStore\.notifyBuddyDataChanged\(\);/);
  assert.match(saveUserContextBlock, /buddyContextStore\.notifyBuddyDataChanged\(\);/);
  assert.match(restoreRevisionBlock, /buddyContextStore\.notifyBuddyDataChanged\(\);/);
});

test("BuddyPage keeps template binding before mascot debug and renders it as Buddy input rows", () => {
  const bindingIndex = source.indexOf('name="binding"');
  const identityIndex = source.indexOf('name="identity"');
  const mascotDebugIndex = source.indexOf('name="mascot-debug"');
  assert.ok(bindingIndex > -1);
  assert.ok(identityIndex > -1);
  assert.ok(mascotDebugIndex > -1);
  assert.ok(identityIndex < bindingIndex);
  assert.ok(bindingIndex < mascotDebugIndex);
  assert.match(source, /const activeTab = ref\("identity"\);/);
  assert.match(source, /buildBuddyRunTemplateSourceRows/);
  assert.match(source, /buildBuddyRunInputNodeOptions/);
  assert.match(source, /setBuddyRunTemplateSourceBinding/);
  assert.match(source, /v-for="row in bindingSourceRows"/);
  assert.match(source, /class="buddy-page__binding-card"/);
  assert.match(source, /class="buddy-page__template-select toograph-select"/);
  assert.match(source, /:disabled="option\.disabled"/);
  assert.match(source, /templateBreakpointBlocked/);
  assert.match(source, /popper-class="toograph-select-popper buddy-page__binding-select-popper"/);
  assert.match(source, /:fit-input-width="true"/);
  assert.match(
    source,
    /const buddyBindingSelectFallbackPlacements: \("bottom-start" \| "top-start"\)\[] = \["bottom-start", "top-start"\];/,
  );
  const bindingSelectBlocks =
    source.match(/<ElSelect[\s\S]*?class="buddy-page__(?:template-select|binding-select) toograph-select"[\s\S]*?>/g) ?? [];
  assert.equal(bindingSelectBlocks.length, 4);
  for (const block of bindingSelectBlocks) {
    assert.match(block, /:teleported="true"/);
    assert.match(block, /placement="bottom-start"/);
    assert.match(block, /:fallback-placements="buddyBindingSelectFallbackPlacements"/);
  }
  assert.match(source, /class="buddy-page__binding-select toograph-select"/);
  assert.match(source, /class="buddy-page__binding-option"/);
  assert.match(source, /bindingOptionDisabledReason\(option\)/);
  assert.match(source, /class="buddy-page__binding-action buddy-page__binding-action--primary"/);
  assert.match(source, /class="buddy-page__binding-action buddy-page__binding-action--secondary"/);
  assert.match(source, /:model-value="row\.selectedNodeId"/);
  assert.match(source, /@change="setBindingInputNode\(row\.source, \$event\)"/);
  assert.match(source, /function closeBindingSelect/);
  assert.match(source, /bindingTemplateSelectRef/);
  assert.match(source, /setBindingInputSelectRef/);
  assert.match(source, /closeBindingSelect\(source\);/);
  assert.match(source, /v-for="row in memoryReviewBindingSourceRows"/);
  assert.match(source, /buildBuddyMemoryReviewInputNodeOptions/);
  assert.match(source, /setBuddyMemoryReviewTemplateSourceBinding/);
  assert.match(source, /@change="setMemoryReviewBindingInputNode\(row\.source, \$event\)"/);
  assert.match(source, /fetchBuddyMemoryReviewTemplateBinding\(\)/);
  assert.match(source, /updateBuddyMemoryReviewTemplateBinding/);
  assert.match(source, /memoryReviewTemplateRoleBlocked/);
  assert.match(source, /saveMemoryReviewBinding/);
  assert.doesNotMatch(source, /:model-value="bindingDraft\.input_bindings\[row\.nodeId\]/);
  assert.doesNotMatch(source, /function setBindingSource\(nodeId: string, value: unknown\)/);
  assert.doesNotMatch(source, /<ElTable :data="bindingSourceRows"/);
});

test("BuddyPage no longer exposes policy json as a Buddy Home editor surface", () => {
  assert.doesNotMatch(source, /name="policy"/);
  assert.doesNotMatch(source, /fetchBuddyPolicy/);
  assert.doesNotMatch(source, /updateBuddyPolicy/);
  assert.doesNotMatch(source, /policyDraft/);
  assert.doesNotMatch(source, /graph_permission_mode/);
});

test("BuddyPage reloads buddy data when the widget reports external updates", () => {
  assert.match(source, /import \{ computed, nextTick, onMounted, ref, watch \} from "vue";/);
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

test("BuddyPage repairs stale run template binding through the command flow", () => {
  assert.match(source, /const repairedRunBinding = await repairRunTemplateBindingIfNeeded\(runBinding\);/);
  assert.match(source, /bindingDraft\.value = normalizeBindingDraft\(repairedRunBinding\);/);
  assert.match(source, /async function repairRunTemplateBindingIfNeeded\(binding: BuddyRunTemplateBinding\)/);
  assert.match(source, /if \(!binding\.repair_recommended\) \{/);
  assert.match(source, /await updateBuddyRunTemplateBinding\(\s*normalized,\s*t\("buddyPage\.changeReasons\.bindingRepair"\),\s*\)/);
  assert.match(source, /await refreshAuditTrail\(\);/);
});

test("BuddyPage hosts the mascot action debug panel as a tab", () => {
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
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.virtualCursorFlightSpeedPxPerS/);
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.virtualCursorRotationSpeedDegPerS/);
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.mascotLookRangeX/);
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.mascotLookRangeY/);
  assert.match(source, /buddyMascotDebugStore\.motionConfig\.virtualCursorFollowMaxDistancePx/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ moveDurationMs: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ stepPauseMs: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ virtualCursorFlightSpeedPxPerS: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ virtualCursorRotationSpeedDegPerS: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ mascotLookRangeX: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ mascotLookRangeY: Number\(value\) \}\)/);
  assert.match(source, /buddyMascotDebugStore\.setMotionConfig\(\{ virtualCursorFollowMaxDistancePx: Number\(value\) \}\)/);
  assert.match(source, /virtualCursorFollowMaxDistancePx"[\s\S]*:min="32"/);
  assert.match(source, /buddyMascotDebugStore\.resetMotionConfig\(\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.moveDuration"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.stepPause"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.virtualCursorSpeed"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.virtualCursorRotationSpeed"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.mascotLookRangeX"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.mascotLookRangeY"\)/);
  assert.match(source, /t\("buddyPage\.mascotDebug\.motion\.virtualCursorFollowRange"\)/);
  assert.match(source, /buddy-page__debug-motion-grid/);
});

test("BuddyPage places mascot debug immediately after template binding", () => {
  const bindingIndex = source.indexOf('name="binding"');
  const confirmationIndex = source.indexOf('name="confirmation"');
  const historyIndex = source.indexOf('name="history"');
  const mascotDebugIndex = source.indexOf('name="mascot-debug"');
  assert.ok(bindingIndex > -1);
  assert.ok(confirmationIndex > -1);
  assert.ok(historyIndex > -1);
  assert.ok(mascotDebugIndex > -1);
  assert.ok(confirmationIndex < bindingIndex);
  assert.ok(historyIndex < bindingIndex);
  assert.ok(bindingIndex < mascotDebugIndex);
});
