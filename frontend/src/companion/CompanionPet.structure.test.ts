import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "CompanionPet.vue"), "utf8");

function extractCssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = componentSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

test("CompanionPet renders the mascot without a circular avatar frame and keeps a contour shadow", () => {
  const avatarBlock = extractCssBlock(".companion-pet__avatar");

  assert.match(avatarBlock, /border:\s*0;/);
  assert.match(avatarBlock, /background:\s*transparent;/);
  assert.match(avatarBlock, /box-shadow:\s*none;/);
  assert.doesNotMatch(avatarBlock, /border-radius:\s*999px/);
  assert.doesNotMatch(componentSource, /\.companion-pet__avatar::before/);
  assert.match(componentSource, /\.companion-pet__avatar > \.companion-mascot\s*\{[\s\S]*z-index:\s*1;[\s\S]*filter:\s*drop-shadow\(0 8px 12px rgba\(255,\s*255,\s*255,\s*0\.86\)\)[\s\S]*drop-shadow\(0 2px 5px rgba\(255,\s*255,\s*255,\s*0\.72\)\)[\s\S]*drop-shadow\(0 0 3px rgba\(255,\s*255,\s*255,\s*0\.94\)\);/);
  assert.match(componentSource, /\.companion-pet__avatar:hover > \.companion-mascot\s*\{[\s\S]*drop-shadow\(0 9px 14px rgba\(255,\s*255,\s*255,\s*0\.9\)\)/);
});

test("CompanionPet does not render a status dot on top of the mascot", () => {
  assert.doesNotMatch(componentSource, /companion-pet__status-dot/);
});

test("CompanionPet renders the animated inline mascot component", () => {
  assert.match(componentSource, /import CompanionMascot from "\.\/CompanionMascot\.vue";/);
  assert.match(componentSource, /<CompanionMascot/);
  assert.match(componentSource, /:mood="mood"/);
  assert.match(componentSource, /:dragging="isDragging"/);
  assert.match(componentSource, /:tap-nonce="tapNonce"/);
  assert.doesNotMatch(componentSource, /<img src="\/mascot\.svg"/);
});

test("CompanionPet tracks dragging and click pulses for mascot animation", () => {
  assert.match(componentSource, /const isDragging = computed\(\(\) => Boolean\(pointerDrag\.value\?\.moved\)\);/);
  assert.match(componentSource, /const tapNonce = ref\(0\);/);
  assert.match(componentSource, /tapNonce\.value \+= 1;/);
});

test("CompanionPet exposes permission tiers with only advisory mode enabled", () => {
  assert.match(componentSource, /<ElSelect[\s\S]*v-model="companionMode"/);
  assert.match(componentSource, /v-for="option in COMPANION_MODE_OPTIONS"/);
  assert.match(componentSource, /:disabled="option\.disabled"/);
  assert.match(componentSource, /companionModeLabel/);
  assert.doesNotMatch(componentSource, /companionMode\s*=\s*"approval"/);
  assert.doesNotMatch(componentSource, /companionMode\s*=\s*"unrestricted"/);
});

test("CompanionPet builds advisory page context from the shared editor snapshot", () => {
  assert.match(componentSource, /import \{ buildCompanionPageContext \} from "\.\/companionPageContext\.ts";/);
  assert.match(componentSource, /import \{ useCompanionContextStore \} from "\.\.\/stores\/companionContext\.ts";/);
  assert.match(componentSource, /const companionContextStore = useCompanionContextStore\(\);/);
  assert.match(componentSource, /return buildCompanionPageContext\(\{[\s\S]*routePath: route\.fullPath,[\s\S]*editor: companionContextStore\.editorSnapshot,[\s\S]*activeCompanionRunId: activeRunId\.value,[\s\S]*\}\);/);
});

test("CompanionPet returns speaking replies to idle so the next message can be typed", () => {
  assert.match(
    componentSource,
    /if \(mood\.value === "speaking" && queuedTurns\.value\.length === 0\) \{[\s\S]*scheduleSpeakingIdle\(\);[\s\S]*\}/,
  );
  assert.match(componentSource, /speakingIdleTimerId = window\.setTimeout\(\(\) => \{[\s\S]*mood\.value = "idle";[\s\S]*\}, 1400\);/);
  assert.match(componentSource, /clearSpeakingIdleTimer\(\);/);
  assert.doesNotMatch(componentSource, /if \(!isBusy\.value\) \{[\s\S]*mood\.value = "idle";/);
});

test("CompanionPet keeps the composer enabled and queues sends while a reply is running", () => {
  assert.doesNotMatch(componentSource, /class="companion-pet__input"[\s\S]*:disabled="isBusy"/);
  assert.match(componentSource, /class="companion-pet__send"[\s\S]*:disabled="!draft\.trim\(\)"/);
  assert.doesNotMatch(componentSource, /if \(!userMessage \|\| isBusy\.value\)/);
  assert.match(componentSource, /const queuedTurns = ref<CompanionQueuedTurn\[\]>\(\[\]\);/);
  assert.match(componentSource, /queuedTurns\.value\.push\(\{[\s\S]*userMessageId:[\s\S]*userMessage:/);
  assert.match(componentSource, /void drainCompanionQueue\(\);/);
  assert.match(componentSource, /while \(queuedTurns\.value\.length > 0\)/);
});

test("CompanionPet keeps runtime error replies out of model context and persisted history", () => {
  assert.match(componentSource, /const history = buildHistoryBeforeMessage\(turn\.userMessageId\);/);
  assert.match(componentSource, /return previousMessages\.filter\(isContextMessage\)\.map\(\(\{ role, content \}\) => \(\{ role, content \}\)\);/);
  assert.match(componentSource, /nextMessages[\s\S]*\.filter\(isPersistableMessageForStorage\)[\s\S]*\.slice\(-24\)[\s\S]*\.map\(\(\{ role, content, includeInContext \}\) => \(\{ role, content, includeInContext \}\)\)/);
  assert.match(componentSource, /updateAssistantMessage\(assistantMessage\.id, t\("companion\.errorReply", \{ error: message \}\), \{ includeInContext: false \}\);/);
});

test("CompanionPet leaves companion self config loading and memory curation to the chat graph template", () => {
  assert.doesNotMatch(componentSource, new RegExp("fetch" + "CompanionContext"));
  assert.doesNotMatch(componentSource, new RegExp("curate" + "CompanionMemoryTurn"));
  assert.doesNotMatch(componentSource, new RegExp("fetch" + "SelfConfigContext"));
  assert.doesNotMatch(componentSource, new RegExp("curate" + "CompletedTurnMemory"));
  assert.doesNotMatch(componentSource, /selfConfigContext,/);
  assert.doesNotMatch(componentSource, /function formatProfileForPrompt/);
  assert.doesNotMatch(componentSource, /function formatPolicyForPrompt/);
  assert.doesNotMatch(componentSource, /function formatMemoriesForPrompt/);
});
