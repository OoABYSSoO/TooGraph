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

test("BuddyWidget opens fullscreen chat from a mascot double click without firing the single-click toggle", () => {
  assert.match(componentSource, /@dblclick\.stop="handleAvatarDoubleClick"/);
  assert.match(componentSource, /const AVATAR_SINGLE_CLICK_DELAY_MS = 220;/);
  assert.match(componentSource, /let avatarSingleClickTimerId: number \| null = null;/);
  assert.match(
    componentSource,
    /function handleAvatarClick\(\)[\s\S]*clearAvatarSingleClickTimer\(\);[\s\S]*avatarSingleClickTimerId = window\.setTimeout\(\(\) => \{[\s\S]*performAvatarSingleClick\(\);[\s\S]*\}, AVATAR_SINGLE_CLICK_DELAY_MS\);/,
  );
  assert.match(
    componentSource,
    /function handleAvatarDoubleClick\(\)[\s\S]*clearAvatarSingleClickTimer\(\);[\s\S]*isPanelOpen\.value = true;[\s\S]*isPanelFullscreen\.value = true;[\s\S]*void scrollMessagesToBottom\(\);/,
  );
  assert.match(componentSource, /onBeforeUnmount\(\(\) => \{[\s\S]*clearAvatarSingleClickTimer\(\);/);
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
  assert.match(componentSource, /const assistantEntry = createMessage\("assistant", "", undefined, allocateBuddyMessageClientOrder\(\)\);/);
  assert.match(componentSource, /messages\.value\.push\(userEntry, assistantEntry\);/);
  assert.match(componentSource, /queuedTurns\.value\.push\(\{[\s\S]*userMessageId:[\s\S]*assistantMessageId:[\s\S]*userMessage:/);
  assert.match(componentSource, /client_order: message\.clientOrder \?\? null/);
  assert.match(componentSource, /function resetNextBuddyMessageClientOrder\(\)/);
  assert.match(componentSource, /void drainBuddyQueue\(\);/);
  assert.match(componentSource, /while \(queuedTurns\.value\.length > 0\)/);
  assert.match(componentSource, /const assistantMessage = ensureAssistantMessageForTurn\(turn\);/);
  assert.match(componentSource, /function ensureAssistantMessageForTurn\(turn: BuddyQueuedTurn\): BuddyMessage/);
  assert.match(componentSource, /function shouldRenderMessage\(message: BuddyMessage\)/);
  assert.match(componentSource, /message\.role === "assistant"[\s\S]*!message\.content\.trim\(\)[\s\S]*Boolean\(message\.activityText\?\.trim\(\)\)/);
});

test("BuddyWidget keeps runtime error replies out of model context and persisted history", () => {
  assert.match(componentSource, /const history = buildHistoryBeforeMessage\(userEntry\.id\);/);
  assert.match(componentSource, /const history = turn\.history;/);
  assert.match(componentSource, /return previousMessages\.filter\(isContextMessage\)\.map\(\(\{ role, content \}\) => \(\{ role, content \}\)\);/);
  assert.match(componentSource, /appendBuddyChatMessage\(sessionId,[\s\S]*include_in_context: options\.includeInContext \?\? message\.includeInContext !== false,[\s\S]*\)/);
  assert.match(componentSource, /updateAssistantMessage\(assistantMessage\.id, t\("buddy\.errorReply", \{ error: message \}\), \{ includeInContext: false \}\);/);
  assert.match(componentSource, /persistBuddyMessage\(turn\.sessionId,[\s\S]*includeInContext: false,[\s\S]*\);/);
});

test("BuddyWidget shows live run activity while the assistant reply is still empty", () => {
  assert.match(componentSource, /resolveBuddyRunActivityFromRunEvent/);
  assert.match(componentSource, /activityText/);
  assert.match(componentSource, /shouldShowAssistantActivityBubble\(message\)/);
  assert.match(componentSource, /message\.activityText \|\| t\("buddy\.streaming"\)/);
  assert.match(componentSource, /setAssistantActivityText\(assistantMessage\.id, t\("buddy\.activity\.preparing"\)\);/);
  assert.match(componentSource, /setAssistantActivityFromRunEvent\(assistantMessageId, eventType, payload, graph\);/);
  assert.match(componentSource, /if \(mood\.value === "thinking" && latestActivityText\.value\) \{/);
});

test("BuddyWidget renders assistant replies as safe markdown and keeps a compact run trace panel", () => {
  assert.match(componentSource, /import \{ resolveOutputPreviewContent \} from "\.\.\/editor\/nodes\/outputPreviewContentModel\.ts";/);
  assert.match(componentSource, /v-html="renderBuddyMarkdown\(message\.content\)"/);
  assert.match(componentSource, /class="buddy-widget__run-trace"/);
  assert.match(componentSource, /const runTraceEntries = ref<BuddyRunTraceEntry\[\]>\(\[\]\);/);
  assert.match(componentSource, /resolveBuddyRunTraceFromRunEvent/);
  assert.match(componentSource, /appendRunTraceEntry\(eventType, traceEntry\);/);
  assert.match(componentSource, /\.buddy-widget__run-trace-body[\s\S]*max-height:\s*calc\(3 \* 1\.45em \+ 18px\);/);
});

test("BuddyWidget records and displays per-stage run trace durations", () => {
  assert.match(componentSource, /import \{ formatRunDuration \} from "\.\.\/lib\/run-display-name\.ts";/);
  assert.match(componentSource, /const runTraceStartedAtByKey = new Map<string, number>\(\);/);
  assert.match(componentSource, /function appendRunTraceEntry\(eventType: string, traceEntry: BuddyRunTraceEntry\)/);
  assert.match(componentSource, /mergeRunTraceEntry\(runTraceEntries\.value\[existingIndex\], timedTraceEntry\)/);
  assert.match(componentSource, /runTraceStartedAtByKey\.set\(traceEntry\.timingKey, nowRunTraceMs\(\)\);/);
  assert.match(componentSource, /durationMs: Math\.max\(1, Math\.round\(nowRunTraceMs\(\) - startedAt\)\),/);
  assert.match(componentSource, /class="buddy-widget__run-trace-duration"/);
  assert.match(componentSource, /formatRunTraceDuration\(entry\.durationMs\)/);
});

test("BuddyWidget keeps the run trace above the formal reply and collapses to elapsed summary", () => {
  assert.match(componentSource, /const runTraceStartedAtMs = ref<number \| null>\(null\);/);
  assert.match(componentSource, /const runTraceFinishedAtMs = ref<number \| null>\(null\);/);
  assert.match(componentSource, /const runTraceHeaderText = computed/);
  assert.match(componentSource, /markRunTraceFinished\(\);/);
  assert.match(componentSource, /if \(!hasAssistantMessageContent\(assistantMessageId\)\) \{[\s\S]*markRunTraceFinished\(\);[\s\S]*\}/);
  assert.match(componentSource, /v-if="shouldShowRunTraceForMessage\(message\)"/);
  assert.match(componentSource, /v-if="shouldShowRunTraceBody"/);
  assert.match(componentSource, /v-if="message\.role === 'assistant' && message\.content"/);
  assert.match(componentSource, /shouldShowAssistantActivityBubble\(message\)/);
  assert.doesNotMatch(componentSource, /message\.content \|\| message\.activityText \|\| t\("buddy\.streaming"\)/);
});

test("BuddyWidget stores buddy chat in backend sessions and exposes a compact history dropdown", () => {
  assert.match(componentSource, /import \{[\s\S]*appendBuddyChatMessage,[\s\S]*fetchBuddyChatMessages,[\s\S]*fetchBuddyChatSessions,[\s\S]*\} from "\.\.\/api\/buddy\.ts";/);
  assert.match(componentSource, /import \{ ArrowDown, Check, Clock, Close, Delete, FullScreen, Plus, Promotion, SemiSelect \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import \{ ElIcon, ElOption, ElPopover, ElSelect \} from "element-plus";/);
  assert.match(componentSource, /const BUDDY_ACTIVE_SESSION_STORAGE_KEY = "graphiteui:buddy-active-session";/);
  assert.match(componentSource, /const chatSessions = ref<BuddyChatSession\[\]>\(\[\]\);/);
  assert.match(componentSource, /const activeSessionId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const activeSessionDeleteId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const sessionDeleteConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /class="buddy-widget__history-control"/);
  assert.match(componentSource, /class="buddy-widget__sessions-panel"/);
  assert.match(componentSource, /v-for="session in chatSessions"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__session-new"/);
  assert.match(componentSource, /@click="selectChatSession\(session\.session_id\)"/);
  assert.match(componentSource, /@click\.stop="handleSessionDeleteActionClick\(session\.session_id\)"/);
  assert.match(componentSource, /:visible="isSessionDeleteConfirmOpen\(session\.session_id\)"/);
  assert.match(componentSource, /<ElIcon v-if="isSessionDeleteConfirmOpen\(session\.session_id\)" aria-hidden="true"><Check \/><\/ElIcon>/);
  assert.match(componentSource, /function startSessionDeleteConfirmWindow\(sessionId: string\)/);
  assert.match(componentSource, /function handleSessionDeleteActionClick\(sessionId: string\)/);
  assert.match(componentSource, /chatSessionInitializationPromise = initializeBuddyChatSessions\(\)\.finally/);
  assert.match(componentSource, /async function migrateLegacyBuddyHistory\(\)/);
  assert.match(componentSource, /\.buddy-widget__panel\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(componentSource, /\.buddy-widget__avatar\s*\{[\s\S]*z-index:\s*4;/);
  assert.match(componentSource, /\.buddy-widget__sessions-panel\s*\{[\s\S]*position:\s*absolute;[\s\S]*z-index:\s*3;[\s\S]*width:\s*min\(330px,[\s\S]*max-height:\s*min\(520px,[\s\S]*overflow-y:\s*auto;/);
  assert.match(componentSource, /\.buddy-widget__session-list\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow:\s*visible;/);
  assert.doesNotMatch(componentSource, /watch\(\s*messages,/);
});

test("BuddyWidget uses the top toolbar for new chat and fullscreen expansion", () => {
  assert.match(componentSource, /import \{ ArrowDown, Check, Clock, Close, Delete, FullScreen, Plus, Promotion, SemiSelect \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /const isPanelFullscreen = ref\(false\);/);
  assert.match(componentSource, /const avatarStyle = computed\(\(\) => \{[\s\S]*left:\s*`\$\{position\.value\.x\}px`,[\s\S]*top:\s*`\$\{position\.value\.y\}px`,/);
  assert.match(componentSource, /const hasCurrentSessionContent = computed\(\(\) => messages\.value\.some\(\(message\) => message\.content\.trim\(\)\)\);/);
  assert.match(componentSource, /const canCreateNewSession = computed\(\(\) => !isSessionSwitchLocked\.value && hasCurrentSessionContent\.value\);/);
  assert.match(componentSource, /:title="t\('buddy\.newSession'\)"[\s\S]*:disabled="!canCreateNewSession"[\s\S]*@click="createNewSession"[\s\S]*<ElIcon><Plus \/><\/ElIcon>/);
  assert.match(componentSource, /async function createNewSession\(\) \{[\s\S]*if \(!canCreateNewSession\.value\) \{/);
  assert.match(componentSource, /:title="isPanelFullscreen \? t\('buddy\.exitFullscreen'\) : t\('buddy\.fullscreen'\)"/);
  assert.match(componentSource, /@click="togglePanelFullscreen"/);
  assert.match(componentSource, /<SemiSelect v-if="isPanelFullscreen" \/>/);
  assert.match(componentSource, /<FullScreen v-else \/>/);
  assert.match(componentSource, /@click="closePanel"/);
  assert.match(componentSource, /class="buddy-widget__backdrop"/);
  assert.match(componentSource, /\.buddy-widget__panel--fullscreen\s*\{[\s\S]*width:\s*min\(1440px,/);
  assert.match(componentSource, /\.buddy-widget__anchor--fullscreen \.buddy-widget__avatar\s*\{[\s\S]*position:\s*fixed;[\s\S]*right:\s*auto;[\s\S]*z-index:\s*4;/);
  assert.doesNotMatch(componentSource, /\.buddy-widget__anchor--fullscreen \.buddy-widget__avatar\s*\{[\s\S]*display:\s*none;/);
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

test("BuddyWidget starts self-review as a separate background run after the visible reply", () => {
  assert.match(componentSource, /BUDDY_REVIEW_TEMPLATE_ID/);
  assert.match(componentSource, /buildBuddyReviewGraph/);
  assert.match(componentSource, /void startBuddySelfReviewRun\(runDetail\);/);
  assert.match(componentSource, /async function startBuddySelfReviewRun\(mainRun: RunDetail\)/);
  assert.match(componentSource, /fetchTemplate\(BUDDY_REVIEW_TEMPLATE_ID\)/);
  assert.match(componentSource, /const graph = buildBuddyReviewGraph\(template,\s*\{[\s\S]*mainRun,[\s\S]*buddyModel: buddyModelRef\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /const reviewRun = await runGraph\(graph\);/);
  assert.match(componentSource, /void pollBuddySelfReviewRun\(reviewRun\.run_id\);/);
  assert.match(componentSource, /const backgroundReviewAbortControllers = new Set<AbortController>\(\);/);
  assert.match(componentSource, /abortBackgroundReviewRuns\(\);/);
  assert.doesNotMatch(componentSource, /activeRunId\.value = reviewRun\.run_id/);
});
