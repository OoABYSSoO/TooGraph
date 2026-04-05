import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "BuddyWidget.vue"), "utf8");

function extractCssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = componentSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

test("BuddyWidget renders the mascot without a circular avatar frame and keeps a contour shadow", () => {
  const avatarBlock = extractCssBlock(".buddy-widget__avatar");

  assert.match(avatarBlock, /border:\s*0;/);
  assert.match(avatarBlock, /background:\s*transparent;/);
  assert.match(avatarBlock, /box-shadow:\s*none;/);
  assert.doesNotMatch(avatarBlock, /border-radius:\s*999px/);
  assert.doesNotMatch(componentSource, /\.buddy-widget__avatar::before/);
  assert.match(componentSource, /\.buddy-widget__avatar > \.buddy-mascot\s*\{[\s\S]*z-index:\s*1;[\s\S]*filter:\s*drop-shadow\(0 8px 12px rgba\(255,\s*255,\s*255,\s*0\.86\)\)[\s\S]*drop-shadow\(0 2px 5px rgba\(255,\s*255,\s*255,\s*0\.72\)\)[\s\S]*drop-shadow\(0 0 3px rgba\(255,\s*255,\s*255,\s*0\.94\)\);/);
  assert.match(componentSource, /\.buddy-widget__avatar:hover > \.buddy-mascot\s*\{[\s\S]*drop-shadow\(0 9px 14px rgba\(255,\s*255,\s*255,\s*0\.9\)\)/);
});

test("BuddyWidget does not render a status dot on top of the mascot", () => {
  assert.doesNotMatch(componentSource, /buddy-widget__status-dot/);
});

test("BuddyWidget renders the animated inline mascot component", () => {
  assert.match(componentSource, /import BuddyMascot from "\.\/BuddyMascot\.vue";/);
  assert.match(componentSource, /<BuddyMascot/);
  assert.match(componentSource, /:mood="mood"/);
  assert.match(componentSource, /:dragging="isDragging"/);
  assert.match(componentSource, /:tap-nonce="tapNonce"/);
  assert.doesNotMatch(componentSource, /<img src="\/mascot\.svg"/);
});

test("BuddyWidget tracks dragging and click pulses for mascot animation", () => {
  assert.match(componentSource, /const isDragging = computed\(\(\) => Boolean\(pointerDrag\.value\?\.moved\)\);/);
  assert.match(componentSource, /const tapNonce = ref\(0\);/);
  assert.match(componentSource, /tapNonce\.value \+= 1;/);
});

test("BuddyWidget keeps buddy transitions enabled even when reduced motion is enabled", () => {
  assert.doesNotMatch(componentSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(componentSource, /animation:\s*none/);
  assert.doesNotMatch(componentSource, /transition:\s*none/);
});

test("BuddyWidget exposes advisory and approval permission tiers", () => {
  assert.match(componentSource, /<ElSelect[\s\S]*v-model="buddyMode"/);
  assert.match(componentSource, /v-for="option in BUDDY_MODE_OPTIONS"/);
  assert.match(componentSource, /:disabled="option\.disabled"/);
  assert.match(componentSource, /buddyModeLabel/);
  assert.doesNotMatch(componentSource, /buddyMode\s*=\s*"unrestricted"/);
});

test("BuddyWidget lets the buddy runtime choose its own model", () => {
  assert.match(componentSource, /import \{ fetchSettings \} from "\.\.\/api\/settings\.ts";/);
  assert.match(componentSource, /import \{ buildRuntimeModelOptions \} from "\.\.\/lib\/runtimeModelCatalog\.ts";/);
  assert.match(componentSource, /const buddyModelRef = ref\("/);
  assert.match(componentSource, /BUDDY_MODEL_STORAGE_KEY/);
  assert.match(componentSource, /v-model="buddyModelRef"/);
  assert.match(componentSource, /@visible-change="handleBuddyModelSelectVisibleChange"/);
  assert.match(componentSource, /popper-class="graphite-select-popper buddy-widget__select-popper"/);
  assert.match(componentSource, /:global\(\.buddy-widget__select-popper\.el-popper\)[\s\S]*z-index:\s*46\d\d\s*!important;/);
  assert.match(componentSource, /buddyModelOptions/);
  assert.match(componentSource, /return buildRuntimeModelOptions\(settings\);/);
  assert.match(componentSource, /buddyModel:\s*buddyModelRef\.value/);
});

test("BuddyWidget builds advisory page context from the shared editor snapshot", () => {
  assert.match(componentSource, /import \{ buildBuddyPageContext \} from "\.\/buddyPageContext\.ts";/);
  assert.match(componentSource, /import \{ useBuddyContextStore \} from "\.\.\/stores\/buddyContext\.ts";/);
  assert.match(componentSource, /const buddyContextStore = useBuddyContextStore\(\);/);
  assert.match(componentSource, /return buildBuddyPageContext\(\{[\s\S]*routePath: route\.fullPath,[\s\S]*editor: buddyContextStore\.editorSnapshot,[\s\S]*activeBuddyRunId: activeRunId\.value,[\s\S]*\}\);/);
});

test("BuddyWidget notifies buddy pages to refresh after a completed chat graph run", () => {
  assert.match(componentSource, /if \(runDetail\.status === "completed"\) \{[\s\S]*buddyContextStore\.notifyBuddyDataChanged\(\);[\s\S]*\}/);
});

test("BuddyWidget returns speaking replies to idle so the next message can be typed", () => {
  assert.match(
    componentSource,
    /if \(mood\.value === "speaking" && queuedTurns\.value\.length === 0\) \{[\s\S]*scheduleSpeakingIdle\(\);[\s\S]*\}/,
  );
  assert.match(componentSource, /speakingIdleTimerId = window\.setTimeout\(\(\) => \{[\s\S]*mood\.value = "idle";[\s\S]*\}, 1400\);/);
  assert.match(componentSource, /clearSpeakingIdleTimer\(\);/);
  assert.doesNotMatch(componentSource, /if \(!isBusy\.value\) \{[\s\S]*mood\.value = "idle";/);
});

test("BuddyWidget keeps the composer enabled and queues sends while a reply is running", () => {
  assert.doesNotMatch(componentSource, /class="buddy-widget__input"[\s\S]*:disabled="isBusy"/);
  assert.match(componentSource, /class="buddy-widget__send"[\s\S]*:disabled="!draft\.trim\(\)"/);
  assert.doesNotMatch(componentSource, /if \(!userMessage \|\| isBusy\.value\)/);
  assert.match(componentSource, /const queuedTurns = ref<BuddyQueuedTurn\[\]>\(\[\]\);/);
  assert.match(componentSource, /queuedTurns\.value\.push\(\{[\s\S]*userMessageId:[\s\S]*userMessage:/);
  assert.match(componentSource, /void drainBuddyQueue\(\);/);
  assert.match(componentSource, /while \(queuedTurns\.value\.length > 0\)/);
});

test("BuddyWidget keeps runtime error replies out of model context and persisted history", () => {
  assert.match(componentSource, /const history = buildHistoryBeforeMessage\(turn\.userMessageId\);/);
  assert.match(componentSource, /return previousMessages\.filter\(isContextMessage\)\.map\(\(\{ role, content \}\) => \(\{ role, content \}\)\);/);
  assert.match(componentSource, /nextMessages[\s\S]*\.filter\(isPersistableMessageForStorage\)[\s\S]*\.slice\(-24\)[\s\S]*\.map\(\(\{ role, content, includeInContext \}\) => \(\{ role, content, includeInContext \}\)\)/);
  assert.match(componentSource, /updateAssistantMessage\(assistantMessage\.id, t\("buddy\.errorReply", \{ error: message \}\), \{ includeInContext: false \}\);/);
});

test("BuddyWidget leaves buddy self config loading and memory curation to the chat graph template", () => {
  assert.doesNotMatch(componentSource, new RegExp("fetch" + "BuddyContext"));
  assert.doesNotMatch(componentSource, new RegExp("curate" + "BuddyMemoryTurn"));
  assert.doesNotMatch(componentSource, new RegExp("fetch" + "SelfConfigContext"));
  assert.doesNotMatch(componentSource, new RegExp("curate" + "CompletedTurnMemory"));
  assert.doesNotMatch(componentSource, /selfConfigContext,/);
  assert.doesNotMatch(componentSource, /function formatProfileForPrompt/);
  assert.doesNotMatch(componentSource, /function formatPolicyForPrompt/);
  assert.doesNotMatch(componentSource, /function formatMemoriesForPrompt/);
});
