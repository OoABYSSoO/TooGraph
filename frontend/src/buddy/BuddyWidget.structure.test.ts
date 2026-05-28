import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentVueSource = readFileSync(resolve(currentDirectory, "BuddyWidget.vue"), "utf8");
const componentStyleSource = readFileSync(resolve(currentDirectory, "BuddyWidget.css"), "utf8");
const componentSource = `${componentVueSource}\n${componentStyleSource}`;
const composerSource = readFileSync(resolve(currentDirectory, "BuddyComposer.vue"), "utf8");
const runTraceSource = readFileSync(resolve(currentDirectory, "BuddyRunTrace.vue"), "utf8");
const runTraceDisplaySource = readFileSync(resolve(currentDirectory, "useBuddyRunTraceDisplay.ts"), "utf8");
const runDisplayMessagesSource = readFileSync(resolve(currentDirectory, "useBuddyRunDisplayMessages.ts"), "utf8");
const runEventStreamSource = readFileSync(resolve(currentDirectory, "useBuddyRunEventStream.ts"), "utf8");
const boundRunTemplateSourcePath = resolve(currentDirectory, "useBuddyBoundRunTemplate.ts");
const boundRunTemplateSource = existsSync(boundRunTemplateSourcePath)
  ? readFileSync(boundRunTemplateSourcePath, "utf8")
  : "";
const visibleRunTemplateEffectsSourcePath = resolve(currentDirectory, "useBuddyVisibleRunTemplateEffects.ts");
const visibleRunTemplateEffectsSource = existsSync(visibleRunTemplateEffectsSourcePath)
  ? readFileSync(visibleRunTemplateEffectsSourcePath, "utf8")
  : "";
const autonomousReviewRunSource = readFileSync(resolve(currentDirectory, "useBuddyAutonomousReviewRun.ts"), "utf8");
const contextCompactionRunPath = resolve(currentDirectory, "useBuddyContextCompactionRun.ts");
const contextCompactionRunSource = existsSync(contextCompactionRunPath)
  ? readFileSync(contextCompactionRunPath, "utf8")
  : "";
const messagesSource = readFileSync(resolve(currentDirectory, "useBuddyMessages.ts"), "utf8");
const pageOperationContextSource = readFileSync(resolve(currentDirectory, "useBuddyPageOperationContext.ts"), "utf8");
const graphEditPlaybackBridgeSource = readFileSync(resolve(currentDirectory, "buddyGraphEditPlaybackBridge.ts"), "utf8");
const graphEditPlaybackTargetsSource = readFileSync(resolve(currentDirectory, "buddyGraphEditPlaybackTargets.ts"), "utf8");
const graphEditPlaybackUiSource = readFileSync(resolve(currentDirectory, "buddyGraphEditPlaybackUi.ts"), "utf8");
const graphEditPlaybackExecutorPath = resolve(currentDirectory, "useBuddyGraphEditPlaybackExecutor.ts");
const graphEditPlaybackExecutorSource = existsSync(graphEditPlaybackExecutorPath)
  ? readFileSync(graphEditPlaybackExecutorPath, "utf8")
  : "";
const virtualOperationExecutorPath = resolve(currentDirectory, "useBuddyVirtualOperationExecutor.ts");
const virtualOperationExecutorSource = existsSync(virtualOperationExecutorPath)
  ? readFileSync(virtualOperationExecutorPath, "utf8")
  : "";
const mascotMotionModelPath = resolve(currentDirectory, "buddyMascotMotionModel.ts");
const mascotMotionModelSource = existsSync(mascotMotionModelPath)
  ? readFileSync(mascotMotionModelPath, "utf8")
  : "";
const mascotMotionControllerPath = resolve(currentDirectory, "useBuddyMascotMotionController.ts");
const mascotMotionControllerSource = existsSync(mascotMotionControllerPath)
  ? readFileSync(mascotMotionControllerPath, "utf8")
  : "";
const virtualOperationTargetsSource = readFileSync(resolve(currentDirectory, "buddyVirtualOperationTargets.ts"), "utf8");
const virtualPointerEventsSource = readFileSync(resolve(currentDirectory, "buddyVirtualPointerEvents.ts"), "utf8");
const virtualTemplateRunTargetsSource = readFileSync(resolve(currentDirectory, "buddyVirtualTemplateRunTargets.ts"), "utf8");
const virtualOperationLifecycleSource = readFileSync(resolve(currentDirectory, "useBuddyVirtualOperationLifecycle.ts"), "utf8");
const virtualCursorGeometrySource = readFileSync(resolve(currentDirectory, "buddyVirtualCursorGeometry.ts"), "utf8");
const chatSessionsSource = readFileSync(resolve(currentDirectory, "useBuddyChatSessions.ts"), "utf8");
const modelSelectionSource = readFileSync(resolve(currentDirectory, "useBuddyModelSelection.ts"), "utf8");
const permissionModeSource = readFileSync(resolve(currentDirectory, "useBuddyPermissionMode.ts"), "utf8");
const sessionHistorySource = readFileSync(resolve(currentDirectory, "BuddySessionHistory.vue"), "utf8");
const virtualOperationBannerSource = readFileSync(resolve(currentDirectory, "BuddyVirtualOperationBanner.vue"), "utf8");
const pauseCardSource = readFileSync(resolve(currentDirectory, "BuddyPauseCard.vue"), "utf8");

function extractCssBlock(selector: string, source = componentSource) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

function extractFunctionBlock(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = componentSource.match(new RegExp(`function ${escapedName}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

function extractSourceBetween(startText: string, endText: string, source = componentSource) {
  const startIndex = source.indexOf(startText);
  const endIndex = source.indexOf(endText, startIndex + startText.length);
  if (startIndex === -1 || endIndex === -1) {
    return "";
  }
  return source.slice(startIndex, endIndex);
}

test("BuddyWidget renders the mascot without a circular avatar frame and keeps a contour shadow", () => {
  const avatarBlock = extractCssBlock(".buddy-widget__avatar");

  assert.match(componentVueSource, /<style scoped src="\.\/BuddyWidget\.css"><\/style>/);
  assert.doesNotMatch(componentVueSource, /<style scoped>\s*\.buddy-widget/);
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
  assert.match(componentSource, /:motion="mascotMotion"/);
  assert.match(componentSource, /:facing="mascotFacing"/);
  assert.match(componentSource, /:dragging="isMascotDragging"/);
  assert.match(componentSource, /:tap-nonce="tapNonce"/);
  assert.match(componentSource, /:look-x="mascotLook\.x"/);
  assert.match(componentSource, /:look-y="mascotLook\.y"/);
  assert.match(componentSource, /:look-range-x="buddyMascotMotionConfig\.mascotLookRangeX"/);
  assert.match(componentSource, /:look-range-y="buddyMascotMotionConfig\.mascotLookRangeY"/);
  assert.match(componentSource, /:tail-switch-nonce="tailSwitchNonce"/);
  assert.match(componentSource, /:virtual-cursor="virtualCursorEnabled && !virtualCursorDetached"/);
  assert.match(componentSource, /:hide-sparkle="isVirtualCursorRendered"/);
  assert.doesNotMatch(componentSource, /<img src="\/mascot\.svg"/);
});

test("BuddyWidget delegates mascot and virtual cursor state to a focused composable", () => {
  assert.notEqual(mascotMotionControllerSource, "");
  assert.match(componentSource, /import \{ useBuddyMascotMotionController, type BuddyMood \} from "\.\/useBuddyMascotMotionController\.ts";/);
  assert.match(componentSource, /useBuddyMascotMotionController\(\{[\s\S]*motionConfig: buddyMascotMotionConfig,[\s\S]*setVirtualCursorEnabled: \(enabled\) => buddyMascotDebugStore\.setVirtualCursorEnabled\(enabled\),[\s\S]*waitForVirtualOperation,[\s\S]*\}\);/);
  assert.match(componentSource, /disposeBuddyMascotMotionController\(\);/);
  assert.match(componentSource, /watch\(canBuddyRoam/);
  assert.match(componentSource, /cancelBuddyRoamUnlessVirtualCursorIdle\(\);/);
  assert.match(componentSource, /watch\(virtualCursorEnabled, \(enabled\) => \{[\s\S]*activateVirtualCursor\(\);[\s\S]*deactivateVirtualCursor\(\);/);
  assert.match(componentSource, /watch\(mascotDebugRequest,[\s\S]*triggerMascotDebugAction\(request\.action\);/);
  assert.match(componentSource, /function handleAvatarClick\(\)[\s\S]*stopBuddyIdleAnimation\(\{ closeVirtualCursor: true \}\);/);
  assert.match(componentSource, /function handleResize\(\)[\s\S]*syncVirtualCursorAfterViewportResize\(\);/);
  assert.match(componentSource, /"--buddy-widget-roam-duration-ms": `\$\{mascotMoveDurationMs\.value\}ms`/);
  assert.match(componentSource, /"--buddy-widget-hop-duration-ms": `\$\{mascotMoveDurationMs\.value\}ms`/);
  assert.doesNotMatch(componentSource, /function runBuddyIdleAnimation\(/);
  assert.doesNotMatch(componentSource, /function startVirtualCursorLaunch\(/);
  assert.doesNotMatch(componentSource, /function triggerMascotDebugAction\(/);
  assert.doesNotMatch(componentSource, /let buddyRoamTimerId: number \| null = null;/);
  assert.doesNotMatch(componentSource, /let buddyDebugActionTimerId: number \| null = null;/);
  assert.doesNotMatch(componentSource, /const virtualCursorPosition = ref/);

  assert.match(mascotMotionControllerSource, /export type BuddyMood = "idle" \| "thinking" \| "speaking" \| "error";/);
  assert.match(mascotMotionControllerSource, /export type BuddyMascotMotion = "idle" \| "roam" \| "hop";/);
  assert.match(mascotMotionControllerSource, /export type VirtualCursorPhase = "hidden" \| "launching" \| "active" \| "returning";/);
  assert.match(mascotMotionControllerSource, /type BuddyIdleRunOptions = \{ force\?: boolean \};/);
  assert.match(mascotMotionControllerSource, /const canBuddyRoam = computed\(\(\) =>[\s\S]*!isPanelOpen\.value[\s\S]*mood\.value === "idle"[\s\S]*!isMascotDragging\.value/);
  assert.match(mascotMotionControllerSource, /function runBuddyIdleAnimation\(\)[\s\S]*const action = chooseBuddyIdleAnimationAction\(\);/);
  assert.match(mascotMotionControllerSource, /case "tail-switch":[\s\S]*runBuddyIdleTailSwitch\(buddyRoamSequenceId\);/);
  assert.match(mascotMotionControllerSource, /case "random-move":[\s\S]*runBuddyIdleRoam\(buddyRoamSequenceId\);/);
  assert.match(mascotMotionControllerSource, /case "virtual-cursor-orbit":[\s\S]*runBuddyIdleVirtualCursorOrbit\(buddyRoamSequenceId\);/);
  assert.match(mascotMotionControllerSource, /case "virtual-cursor-chase":[\s\S]*runBuddyIdleVirtualCursorChase\(buddyRoamSequenceId\);/);
  assert.match(mascotMotionControllerSource, /let buddyRoamTimerId: number \| null = null;/);
  assert.match(mascotMotionControllerSource, /let buddyDebugActionTimerId: number \| null = null;/);
  assert.match(mascotMotionControllerSource, /function disposeBuddyMascotMotionController\(\)[\s\S]*clearVirtualCursorDrag\(\);[\s\S]*cancelBuddyRoamTimers\(\);/);
  assert.match(mascotMotionControllerSource, /function triggerMascotDebugAction\(action: BuddyMascotDebugAction\)/);
  assert.match(mascotMotionControllerSource, /case "thinking":[\s\S]*mood\.value = "thinking";/);
  assert.match(mascotMotionControllerSource, /case "speaking":[\s\S]*mood\.value = "speaking";/);
  assert.match(mascotMotionControllerSource, /case "error":[\s\S]*mood\.value = "error";/);
  assert.match(mascotMotionControllerSource, /case "tap":[\s\S]*tapNonce\.value \+= 1;/);
  assert.match(mascotMotionControllerSource, /case "dragging":[\s\S]*debugDragging\.value = true;/);
  assert.match(mascotMotionControllerSource, /function playMascotDebugMotion\(motion: BuddyMascotMotion, durationMs: number, facing: BuddyMascotFacing\)[\s\S]*restartAvatarHopAnimation\(\);/);
  assert.doesNotMatch(mascotMotionControllerSource, /playMascotDebugMotion\("spin"/);
  assert.doesNotMatch(mascotMotionControllerSource, /runGraph\(/);
});

test("BuddyWidget keeps mascot motion math in a pure model behind the controller", () => {
  assert.notEqual(mascotMotionModelSource, "");
  assert.match(mascotMotionControllerSource, /from "\.\/buddyMascotMotionModel\.ts";/);
  assert.doesNotMatch(componentSource, /from "\.\/buddyMascotMotionModel\.ts";/);
  assert.match(mascotMotionModelSource, /export type BuddyMascotFacing = "front" \| "left" \| "right";/);
  assert.match(mascotMotionModelSource, /export type BuddyIdleAnimationAction = "tail-switch" \| "random-move" \| "virtual-cursor-orbit" \| "virtual-cursor-chase";/);
  assert.match(mascotMotionModelSource, /export const BUDDY_IDLE_ANIMATION_MIN_DELAY_MS = 5000;/);
  assert.match(mascotMotionModelSource, /export const BUDDY_IDLE_ANIMATION_MAX_DELAY_MS = 10000;/);
  assert.match(mascotMotionModelSource, /export const BUDDY_ROAM_STEP_DISTANCE_PX = DEFAULT_BUDDY_SIZE\.width;/);
  assert.match(mascotMotionModelSource, /export function resolveMascotMoveDurationMs\(/);
  assert.match(mascotMotionModelSource, /return Math\.round\(randomBetween\(baseDurationMs, baseDurationMs \* 2, random\)\);/);
  assert.match(mascotMotionModelSource, /export function chooseBuddyIdleAnimationAction\(random = Math\.random\): BuddyIdleAnimationAction/);
  assert.match(mascotMotionModelSource, /export function resolveBuddyRoamTargetPosition\(/);
  assert.match(mascotMotionModelSource, /export function resolveBuddyRoamStepPosition\(/);
  assert.match(mascotMotionModelSource, /export function resolveBuddyVirtualCursorFollowTargetPosition\(/);
  assert.match(mascotMotionModelSource, /export function resolveRandomVirtualCursorChasePosition\(/);
  assert.match(mascotMotionModelSource, /export function resolveVirtualCursorChaseLoopPosition\(/);
  assert.match(mascotMotionModelSource, /export function resolveVirtualCursorOrbitPosition\(/);
  assert.doesNotMatch(componentSource, /function resolveBuddyRoamTargetPosition\(/);
  assert.doesNotMatch(componentSource, /function resolveBuddyRoamStepPosition\(/);
  assert.doesNotMatch(componentSource, /function resolveRandomVirtualCursorChasePosition\(/);
  assert.doesNotMatch(componentSource, /function randomBetween\(/);
});

test("BuddyWidget renders virtual cursor state from the mascot motion controller", () => {
  assert.match(componentSource, /v-if="isVirtualCursorRendered"/);
  assert.match(componentSource, /class="buddy-widget__virtual-cursor"/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--docked': virtualCursorPhase !== 'active'/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--launching': virtualCursorPhase === 'launching'/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--returning': virtualCursorPhase === 'returning'/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--floating': shouldFloatVirtualCursor/);
  assert.match(componentSource, /class="buddy-widget__virtual-cursor-svg"/);
  assert.match(componentSource, /viewBox="-80 -80 160 160"/);
  assert.match(componentSource, /class="buddy-widget__virtual-cursor-shape"/);
  assert.match(componentSource, /:d="virtualCursorPath"/);
  assert.match(componentSource, /ref="virtualCursorAnimateElement"/);
  assert.match(componentSource, /:values="virtualCursorMorphAnimation\.values"/);
  assert.match(componentSource, /:style="virtualCursorStyle"/);
  assert.match(componentSource, /@pointerdown="handleVirtualCursorPointerDown"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__virtual-cursor-follow-range"/);
  assert.doesNotMatch(componentSource, /virtualCursorFollowRangeStyle/);
  assert.match(mascotMotionControllerSource, /const BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS = 360;/);
  assert.match(mascotMotionControllerSource, /const BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS = 180;/);
  assert.match(mascotMotionControllerSource, /const BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS = 120;/);
  assert.match(mascotMotionControllerSource, /const BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE = 0\.72;/);
  assert.match(mascotMotionControllerSource, /const BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE = 1;/);
  assert.match(mascotMotionControllerSource, /const VIRTUAL_CURSOR_STAR_PATH =/);
  assert.match(mascotMotionControllerSource, /const VIRTUAL_CURSOR_SHAPE_PATH =/);
  assert.match(mascotMotionControllerSource, /const virtualCursorPosition = ref/);
  assert.match(mascotMotionControllerSource, /const virtualCursorPhase = ref<VirtualCursorPhase>\("hidden"\);/);
  assert.match(mascotMotionControllerSource, /const virtualCursorStyle = computed\(\(\) => \(\{/);
  assert.match(mascotMotionControllerSource, /function startVirtualCursorLaunch\(\)[\s\S]*virtualCursorPhase\.value = "launching";/);
  assert.match(mascotMotionControllerSource, /function startVirtualCursorReturn\(\)[\s\S]*virtualCursorPhase\.value = "returning";/);
  assert.match(mascotMotionControllerSource, /function handleVirtualCursorPointerDown\(event: PointerEvent\)[\s\S]*shouldHandleVirtualCursorPointerDown\(\{/);
  assert.match(mascotMotionControllerSource, /function ensureVirtualCursorReadyForOperation\(\)[\s\S]*setVirtualCursorEnabled\(true\);/);
  assert.match(mascotMotionControllerSource, /async function replaceVirtualText\(element: HTMLInputElement \| HTMLTextAreaElement, text: string\)/);
  assert.match(mascotMotionControllerSource, /async function typeVirtualText\(element: HTMLInputElement \| HTMLTextAreaElement, text: string\)/);
  assert.match(mascotMotionControllerSource, /dispatchVirtualInputEvents\(element, "insertText", character\);/);
  assert.match(virtualCursorGeometrySource, /export const BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS = 140;/);
  assert.match(virtualCursorGeometrySource, /export const BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS = 6000;/);
  assert.match(virtualCursorGeometrySource, /export const BUDDY_VIRTUAL_CURSOR_SIZE(?:: BuddySize)? = \{ width: 42, height: 42 \};/);
  assert.doesNotMatch(componentSource, /const BUDDY_VIRTUAL_CURSOR_SIZE = \{ width: 42, height: 42 \};/);
  assert.doesNotMatch(componentSource, /function resolveDefaultVirtualCursorPosition/);
  assert.doesNotMatch(componentSource, /function interpolateBuddyPosition/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor"), /transform-origin:\s*50% 58%;/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor"), /translate var\(--buddy-widget-virtual-cursor-move-duration-ms,\s*180ms\) linear/);
});

test("BuddyWidget delegates graph edit playback execution to a focused composable", () => {
  assert.notEqual(graphEditPlaybackExecutorSource, "");
  assert.match(componentSource, /import \{ useBuddyGraphEditPlaybackExecutor \} from "\.\/useBuddyGraphEditPlaybackExecutor\.ts";/);
  assert.match(componentSource, /const \{ executeBuddyVirtualGraphEditOperation \} = useBuddyGraphEditPlaybackExecutor\(\{/);
  assert.match(graphEditPlaybackExecutorSource, /export function useBuddyGraphEditPlaybackExecutor\(/);
  assert.match(graphEditPlaybackExecutorSource, /async function executeBuddyVirtualGraphEditOperation\(/);
  assert.match(graphEditPlaybackExecutorSource, /requestGraphEditPlaybackPlan\(\{[\s\S]*requestId,[\s\S]*graphEditIntents: operation\.graphEditIntents,[\s\S]*\}\);/);
  assert.match(graphEditPlaybackExecutorSource, /resolveGraphEditPlaybackStepElementWithRetry\(\{[\s\S]*resolveAffordance: resolveVirtualOperationAffordance,[\s\S]*recordRetry: recordVirtualOperationRetry,[\s\S]*\}\)/);
  assert.match(graphEditPlaybackExecutorSource, /requestGraphEditPlaybackSave\(\{[\s\S]*runId: operationPlan\.runId \?\? "",[\s\S]*nodeId: operationPlan\.nodeId \?\? operationPlan\.subgraphNodeId \?\? "",[\s\S]*\}\);/);
  assert.doesNotMatch(componentSource, /async function executeBuddyVirtualGraphEditOperation\(/);
  assert.doesNotMatch(componentSource, /async function executeGraphEditPlaybackDragStep\(/);
  assert.doesNotMatch(componentSource, /function shouldSkipGraphEditPlaybackTextStep\(/);
  assert.doesNotMatch(componentSource, /function resolveGraphEditPlaybackAnchorNodeFallbackPoint\(/);
});

test("BuddyWidget delegates virtual operation execution to a focused composable", () => {
  assert.notEqual(virtualOperationExecutorSource, "");
  assert.match(componentSource, /import \{ useBuddyVirtualOperationExecutor \} from "\.\/useBuddyVirtualOperationExecutor\.ts";/);
  assert.match(componentSource, /useBuddyVirtualOperationExecutor\(\{[\s\S]*buildPageOperationRuntimeContext,[\s\S]*executeBuddyVirtualGraphEditOperation,[\s\S]*finishAutoResumedPageOperationRun,[\s\S]*\}\)/);
  assert.match(virtualOperationExecutorSource, /export function useBuddyVirtualOperationExecutor\(/);
  assert.match(virtualOperationExecutorSource, /function handleBuddyVirtualUiOperationEvent\(payload: Record<string, unknown>\)/);
  assert.match(virtualOperationExecutorSource, /async function executeVirtualOperationRequest\(/);
  assert.match(virtualOperationExecutorSource, /async function maybeAutoResumePageOperationRun\(/);
  assert.match(virtualOperationExecutorSource, /async function executeBuddyVirtualOperationCommand\(/);
  assert.match(virtualOperationExecutorSource, /async function waitForTriggeredRunCompletion\(/);
  assert.match(virtualOperationExecutorSource, /resolveBuddyVirtualOperationPlanFromActivityEvent\(payload\)/);
  assert.match(virtualOperationExecutorSource, /buildPageOperationResult\(\{[\s\S]*operationPlan,[\s\S]*routeBefore,[\s\S]*routeAfter: routePath\.value,[\s\S]*\}\)/);
  assert.match(virtualOperationExecutorSource, /canAutoResumePageOperationRun\(runDetail, operationPlan\.operationRequestId\)/);
  assert.doesNotMatch(componentSource, /async function executeVirtualOperationRequest\(/);
  assert.doesNotMatch(componentSource, /async function maybeAutoResumePageOperationRun\(/);
  assert.doesNotMatch(componentSource, /async function executeBuddyVirtualOperationCommand\(/);
  assert.doesNotMatch(componentSource, /async function waitForTriggeredRunCompletion\(/);
});

test("BuddyWidget can interrupt virtual operations and keeps low-level playback details outside the SFC", () => {
  assert.match(componentSource, /import BuddyVirtualOperationBanner from "\.\/BuddyVirtualOperationBanner\.vue";/);
  assert.match(componentSource, /<BuddyVirtualOperationBanner[\s\S]*v-if="virtualOperationStatus"[\s\S]*:status="virtualOperationStatus"[\s\S]*@interrupt="interruptVirtualOperation"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__virtual-operation-banner"/);
  assert.match(virtualOperationBannerSource, /class="buddy-widget__virtual-operation-banner"/);
  assert.match(componentSource, /function handleAvatarClick\(\) \{[\s\S]*resolveBuddyVirtualOperationUserAction\(\{[\s\S]*source: "avatar_click"/);
  assert.match(mascotMotionControllerSource, /function handleVirtualCursorPointerDown\(event: PointerEvent\) \{[\s\S]*shouldHandleVirtualCursorPointerDown\(\{[\s\S]*isOperationRunning: isVirtualOperationRunning\.value/);
  assert.match(virtualOperationExecutorSource, /function interruptVirtualOperation\(\) \{[\s\S]*resolveBuddyVirtualOperationUserAction\(\{[\s\S]*source: "stop_button"/);
  assert.match(virtualOperationLifecycleSource, /export type BuddyVirtualOperationStatus = \{/);
  assert.match(virtualOperationLifecycleSource, /export type BuddyVirtualOperationToken = \{/);
  assert.match(virtualOperationLifecycleSource, /const activeVirtualOperationToken = shallowRef<BuddyVirtualOperationToken \| null>\(null\);/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--operation-active': isVirtualOperationRunning,/);
  assert.match(graphEditPlaybackTargetsSource, /export async function resolveGraphEditPlaybackStepElementWithRetry/);
  assert.match(graphEditPlaybackTargetsSource, /while \(!isInterrupted\(token\) && Date\.now\(\) <= deadlineMs\) \{/);
  assert.match(graphEditPlaybackTargetsSource, /return Boolean\(edgeTargetId && hasAffordanceElement\(edgeTargetId\)\);/);
  assert.match(virtualOperationTargetsSource, /export function hasVirtualOperationAffordanceElement\(targetId: string\)/);
  assert.match(virtualPointerEventsSource, /const BUDDY_VIRTUAL_POINTER_ID = 9001;/);
  assert.match(virtualPointerEventsSource, /const TOOGRAPH_VIRTUAL_EMPTY_CANVAS_POINTER_EVENT_KEY = "__toographVirtualEmptyCanvasPointerEvent";/);
  assert.match(graphEditPlaybackUiSource, /export function shouldForceGraphEditPlaybackEmptyCanvasDrop\(step: GraphEditPlaybackStep\)/);
  assert.doesNotMatch(componentSource, /function hasVirtualOperationAffordanceElement\(targetId: string\)/);
  assert.doesNotMatch(componentSource, /const BUDDY_VIRTUAL_POINTER_ID = 9001;/);
  assert.doesNotMatch(componentSource, /function markVirtualPointerEvent/);
  assert.doesNotMatch(componentSource, /^function buildVirtualDragPoints/m);
  assert.doesNotMatch(componentSource, /^function listGraphEditPlaybackNodeAffordanceIds/m);
  assert.doesNotMatch(componentSource, /^function normalizeVirtualText/m);
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

test("BuddyWidget exposes ask-first and full-access permission tiers", () => {
  assert.match(componentSource, /<ElSelect[\s\S]*v-model="buddyMode"/);
  assert.match(componentSource, /v-for="option in BUDDY_MODE_OPTIONS"/);
  assert.match(componentSource, /:disabled="option\.disabled"/);
  assert.match(componentSource, /buddyModeLabel/);
  assert.doesNotMatch(componentSource, /buddyMode\s*=\s*"advisory"/);
  assert.doesNotMatch(componentSource, /buddyMode\s*=\s*"approval"/);
  assert.doesNotMatch(componentSource, /buddyMode\s*=\s*"unrestricted"/);
});

test("BuddyWidget persists permission mode through settings API composable", () => {
  assert.match(componentSource, /import \{ useBuddyPermissionMode \} from "\.\/useBuddyPermissionMode\.ts";/);
  assert.match(componentSource, /useBuddyPermissionMode\(\)/);
  assert.match(componentSource, /hydrateBuddyPermissionMode\(\)/);
  assert.match(permissionModeSource, /fetchBuddyRuntimeSettings/);
  assert.match(permissionModeSource, /updateBuddyRuntimeSettings/);
  assert.doesNotMatch(componentSource, /const buddyMode = ref<BuddyMode>\(DEFAULT_BUDDY_MODE\)/);
});

test("BuddyWidget lets the buddy runtime choose its own model", () => {
  assert.match(componentSource, /import \{ useBuddyModelSelection \} from "\.\/useBuddyModelSelection\.ts";/);
  assert.match(modelSelectionSource, /import \{ fetchSettings \} from "\.\.\/api\/settings\.ts";/);
  assert.match(modelSelectionSource, /import \{ buildRuntimeModelOptions \} from "\.\.\/lib\/runtimeModelCatalog\.ts";/);
  assert.match(modelSelectionSource, /const buddyModelRef = ref\("/);
  assert.match(modelSelectionSource, /BUDDY_MODEL_STORAGE_KEY/);
  assert.match(componentSource, /useBuddyModelSelection\(\{ t \}\)/);
  assert.match(componentSource, /v-model="buddyModelRef"/);
  assert.match(componentSource, /@visible-change="handleBuddyModelSelectVisibleChange"/);
  assert.match(componentSource, /popper-class="toograph-select-popper buddy-widget__select-popper"/);
  assert.match(componentSource, /:global\(\.buddy-widget__select-popper\.el-popper\)[\s\S]*z-index:\s*46\d\d\s*!important;/);
  assert.match(componentSource, /buddyModelOptions/);
  assert.match(modelSelectionSource, /return buildRuntimeModelOptions\(settings\);/);
  assert.doesNotMatch(componentSource, /function buildBuddyModelOptions/);
  assert.doesNotMatch(componentSource, /fetchSettings/);
  assert.doesNotMatch(componentSource, /BUDDY_MODEL_STORAGE_KEY/);
  assert.match(boundRunTemplateSource, /buddyModel:\s*buddyModelRef\.value/);
});

test("BuddyWidget builds page context from the shared editor snapshot", () => {
  assert.match(componentSource, /import \{ useBuddyPageOperationContext \} from "\.\/useBuddyPageOperationContext\.ts";/);
  assert.match(pageOperationContextSource, /import \{ buildBuddyPageContext,[\s\S]*type BuddyEditorContextSnapshot[\s\S]*\} from "\.\/buddyPageContext\.ts";/);
  assert.match(pageOperationContextSource, /buildPageOperationRuntimeContext as buildPageOperationActionRuntimeContext/);
  assert.match(pageOperationContextSource, /collectPageOperationSnapshot/);
  assert.match(componentSource, /import \{ useBuddyContextStore \} from "\.\.\/stores\/buddyContext\.ts";/);
  assert.match(componentSource, /const buddyContextStore = useBuddyContextStore\(\);/);
  assert.match(componentSource, /useBuddyPageOperationContext\(\{[\s\S]*routePath: computed\(\(\) => route\.fullPath\),[\s\S]*activeRunId,[\s\S]*getEditorSnapshot: \(\) => buddyContextStore\.editorSnapshot,[\s\S]*\}\)/);
  assert.match(componentSource, /buildPageOperationRuntimeContext,/);
  assert.match(boundRunTemplateSource, /const pageOperationContext = buildPageOperationRuntimeContext\(\);[\s\S]*pageOperationContext: pageOperationContext\.actionRuntimeContext/);
  assert.doesNotMatch(boundRunTemplateSource, /pageContext: pageOperationContext\.pageContext/);
  assert.match(pageOperationContextSource, /const snapshot = collectPageOperationSnapshot\(\{[\s\S]*routePath: routePath\.value,[\s\S]*root,[\s\S]*\}\);/);
  assert.match(pageOperationContextSource, /const actionRuntimeContext = buildPageOperationActionRuntimeContext\(\{[\s\S]*snapshot,[\s\S]*editor: buildBuddyPageOperationEditorFacts\(editorSnapshot\),[\s\S]*latestForegroundRun: options\.latestForegroundRun \?\? null,[\s\S]*latestOperationReport: options\.latestOperationReport \?\? null,[\s\S]*\}\);/);
  assert.match(pageOperationContextSource, /pageContext: buildBuddyPageContext\(\{[\s\S]*routePath: routePath\.value,[\s\S]*editor: editorSnapshot,[\s\S]*activeBuddyRunId: activeRunId\.value,[\s\S]*pageOperationBook: actionRuntimeContext\.page_operation_book,[\s\S]*pageFacts: actionRuntimeContext\.page_facts,[\s\S]*\}\)/);
  assert.match(pageOperationContextSource, /actionRuntimeContext,/);
  assert.doesNotMatch(componentSource, /function buildPageOperationRuntimeContext/);
  assert.doesNotMatch(componentSource, /function buildBuddyPageOperationEditorFacts/);
});

test("BuddyWidget resumes page operation runs after virtual UI execution", () => {
  assert.match(virtualOperationExecutorSource, /import \{ fetchRun, resumeRun \} from "\.\.\/api\/runs\.ts";/);
  assert.match(virtualOperationExecutorSource, /import \{[\s\S]*buildPageOperationArtifactRefs,[\s\S]*buildPageOperationResult,[\s\S]*buildPageOperationResumePayload,[\s\S]*canAutoResumePageOperationRun,[\s\S]*type PageOperationRetryRecord,[\s\S]*\} from "\.\/pageOperationResume\.ts";/);
  assert.match(componentSource, /import \{[\s\S]*findAutoResumablePageOperationRequestId,[\s\S]*\} from "\.\/pageOperationResume\.ts";/);
  assert.match(virtualOperationExecutorSource, /const backgroundTemplateOperation = resolveBackgroundTemplateRunOperation\(operationPlan\);/);
  assert.match(virtualOperationExecutorSource, /debugBridge\.beginVirtualOperationRunAttribution\(operationPlan\);[\s\S]*const commandResult = await executeVirtualOperationCommands\(operationPlan\);[\s\S]*status = commandResult\.status;[\s\S]*graphEditSummary = commandResult\.graphEditSummary;[\s\S]*triggeredRun = await waitForVirtualOperationTriggeredRun\(operationPlan\);[\s\S]*triggeredRunDetail = triggeredRun \? await waitForTriggeredRunCompletion\(triggeredRun\) : null;/);
  assert.match(virtualOperationExecutorSource, /const pageOperationContextAfterBase = buildPageOperationRuntimeContext\(\{ latestForegroundRun \}\);/);
  assert.match(virtualOperationExecutorSource, /buildPageOperationResult\(\{[\s\S]*operationPlan,[\s\S]*routeBefore,[\s\S]*routeAfter: routePath\.value,[\s\S]*pageOperationContextBefore: pageOperationContextBefore\.actionRuntimeContext,[\s\S]*pageOperationContextAfter: pageOperationContextAfterBase\.actionRuntimeContext,[\s\S]*triggeredRunId: triggeredRun\?\.runId \?\? null,[\s\S]*triggeredGraphId: triggeredRun\?\.graphId \?\? null,[\s\S]*triggeredRunInitialStatus: triggeredRun\?\.initialStatus \?\? null,[\s\S]*triggeredRunStatus: triggeredRunDetail\?\.status \?\? triggeredRun\?\.initialStatus \?\? null,[\s\S]*triggeredRunFinalResult: triggeredRunDetail\?\.final_result \?\? null,[\s\S]*artifactRefs: buildPageOperationArtifactRefs\(triggeredRunDetail\),[\s\S]*retryChain,[\s\S]*graphEditSummary,[\s\S]*\}\);/);
  assert.match(virtualOperationExecutorSource, /const pageOperationContextAfter = buildPageOperationRuntimeContext\(\{[\s\S]*latestOperationReport: operationResult\.operation_report,[\s\S]*latestForegroundRun,[\s\S]*\}\);/);
  assert.match(virtualOperationExecutorSource, /async function waitForTriggeredRunCompletion\([\s\S]*triggeredRun: BuddyVirtualOperationTriggeredRun,[\s\S]*Promise<RunDetail \| null> \{[\s\S]*latestRun = await fetchRun\(triggeredRun\.runId\);[\s\S]*if \(!shouldPollRunStatus\(latestRun\.status\)\) \{/);
  assert.match(virtualOperationExecutorSource, /async function maybeAutoResumePageOperationRun\(/);
  assert.match(virtualOperationExecutorSource, /const runDetail = await fetchRun\(operationPlan\.runId\);[\s\S]*canAutoResumePageOperationRun\(runDetail, operationPlan\.operationRequestId\)/);
  assert.match(virtualOperationExecutorSource, /await resumeRun\([\s\S]*operationPlan\.runId,[\s\S]*buildPageOperationResumePayload\(\{[\s\S]*operationResult,[\s\S]*pageContext: pageOperationContextAfter\.pageContext,[\s\S]*pageOperationContext: pageOperationContextAfter\.actionRuntimeContext,[\s\S]*\}\),[\s\S]*\);/);
});

test("BuddyWidget runs template targets in the background without a follow-mode branch", () => {
  assert.match(virtualOperationExecutorSource, /import \{ fetchTemplate, fetchTemplates, runGraph \} from "\.\.\/api\/graphs\.ts";/);
  assert.match(virtualOperationExecutorSource, /import \{ buildBuddyTemplateRunGraph \} from "\.\/buddyTemplateRunGraph\.ts";/);
  assert.doesNotMatch(componentSource, /BUDDY_VIRTUAL_OPERATION_FOLLOW_STORAGE_KEY/);
  assert.doesNotMatch(componentSource, /virtualOperationFollowEnabled/);
  assert.match(virtualOperationExecutorSource, /function resolveBackgroundTemplateRunOperation\(/);
  assert.doesNotMatch(componentSource, /if \(virtualOperationFollowEnabled\.value\) \{[\s\S]*return null;[\s\S]*\}/);
  assert.match(virtualOperationExecutorSource, /async function executeBuddyBackgroundRunTemplateOperation\(/);
  assert.match(virtualOperationExecutorSource, /const \{ graph \} = buildBuddyTemplateRunGraph\(template,/);
  assert.match(virtualOperationExecutorSource, /runGraph\(attachPageOperationRuntimeContext\(graph, pageOperationContext\.actionRuntimeContext\)\)/);
  assert.match(virtualOperationExecutorSource, /debugBridge\.recordVirtualOperationTriggeredRun\(triggeredRun\);/);
  assert.match(virtualOperationExecutorSource, /syncBackgroundTemplateRunDisplay\(operationPlan, runDetail, execution\.graph\)/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__virtual-operation-follow"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__follow-control"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__follow-toggle"/);
  assert.doesNotMatch(componentSource, /function toggleVirtualOperationFollow\(\)/);
});

test("BuddyWidget keeps a fixed visible virtual page operation sequence for followed template runs", () => {
  assert.match(virtualOperationExecutorSource, /case "run_template":[\s\S]*await executeBuddyVirtualRunTemplateOperation\(operation\);/);
  assert.match(virtualOperationExecutorSource, /async function executeBuddyVirtualRunTemplateOperation\(operation: BuddyVirtualOperation\)/);
  assert.match(virtualOperationExecutorSource, /await clickVirtualOperationTargetWithRetry\("app\.nav\.library", token\);/);
  assert.match(virtualOperationExecutorSource, /await replaceVirtualText\(searchInput, operation\.searchText\);/);
  assert.match(virtualOperationExecutorSource, /const templateAffordance = await waitForTemplateRunTargetAffordance\(operation, token\);/);
  assert.match(virtualOperationExecutorSource, /await fillTemplateRunInputNode\(operation, token\);/);
  assert.match(virtualOperationExecutorSource, /await clickVirtualOperationTargetWithRetry\(operation\.runTargetId, token\);/);
  assert.match(virtualOperationExecutorSource, /operation\.kind === "run_template"/);
});

test("BuddyWidget notifies buddy pages to refresh after a completed chat graph run", () => {
  assert.match(componentSource, /if \(runDetail\.status === "completed"\) \{[\s\S]*buddyContextStore\.notifyBuddyDataChanged\(\);[\s\S]*\}/);
});

test("BuddyWidget derives the panel title from the SOUL.md identity and refresh events", () => {
  assert.match(componentVueSource, /<h2>\{\{ buddyDisplayName \}\}<\/h2>/);
  assert.match(componentSource, /import \{ resolveBuddyWindowDisplayName \} from "\.\/buddyDisplayName\.ts";/);
  assert.match(componentSource, /fetchBuddyIdentity/);
  assert.match(componentSource, /const buddyDisplayIdentity = ref<.*>\(null\);/);
  assert.match(componentSource, /const buddyDisplayName = computed\(\(\) =>/);
  assert.match(componentSource, /async function refreshBuddyDisplayName\(\)/);
  assert.match(componentSource, /resolveBuddyWindowDisplayName\(buddyDisplayIdentity\.value, t\("buddy\.title"\), String\(locale\.value\)\)/);
  assert.match(componentSource, /buddyDisplayIdentity\.value = identity;/);
  assert.match(componentSource, /onMounted\(\(\) => \{[\s\S]*void refreshBuddyDisplayName\(\);[\s\S]*\}\);/);
  assert.match(componentSource, /watch\(\s*\(\) => buddyContextStore\.dataRefreshNonce,[\s\S]*void refreshBuddyDisplayName\(\);[\s\S]*\);/);
});

test("BuddyWidget returns speaking replies to idle so the next message can be typed", () => {
  assert.match(
    componentSource,
    /if \(mood\.value === "speaking" && queuedTurns\.value\.length === 0\) \{[\s\S]*scheduleSpeakingIdle\(\);[\s\S]*\}/,
  );
  assert.match(componentSource, /speakingIdleTimerId = window\.setTimeout\(\(\) => \{[\s\S]*mood\.value = "idle";[\s\S]*\}, 1400\);/);
  assert.match(componentSource, /speakingIdleTimerId = window\.setTimeout\(\(\) => \{[\s\S]*mood\.value = "idle";[\s\S]*scheduleBuddyRoam\(\);[\s\S]*\}, 1400\);/);
  assert.match(componentSource, /clearSpeakingIdleTimer\(\);/);
  assert.doesNotMatch(componentSource, /if \(!isBusy\.value\) \{[\s\S]*mood\.value = "idle";/);
});

test("BuddyWidget keeps the composer enabled and queues sends while a reply is running", () => {
  assert.match(componentSource, /import BuddyComposer from "\.\/BuddyComposer\.vue";/);
  assert.match(componentSource, /<BuddyComposer[\s\S]*v-model="draft"[\s\S]*@submit="sendMessage"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__input"/);
  assert.doesNotMatch(composerSource, /class="buddy-widget__input"[\s\S]*:disabled="isBusy"/);
  assert.doesNotMatch(composerSource, /class="buddy-widget__input"[\s\S]*:disabled="Boolean\(pausedBuddyRun\)"/);
  assert.match(composerSource, /class="buddy-widget__send"[\s\S]*:disabled="!modelValue\.trim\(\)"/);
  assert.doesNotMatch(componentSource, /if \(!userMessage \|\| isBusy\.value\)/);
  assert.match(componentSource, /const queuedTurns = ref<BuddyQueuedTurn\[\]>\(\[\]\);/);
  assert.match(componentSource, /const assistantEntry = createMessage\("assistant", "", undefined, allocateBuddyMessageClientOrder\(\)\);/);
  assert.match(componentSource, /messages\.value\.push\(userEntry, assistantEntry\);/);
  assert.match(componentSource, /queuedTurns\.value\.push\(\{[\s\S]*userMessageId:[\s\S]*assistantMessageId:[\s\S]*userMessage:/);
  assert.match(componentSource, /client_order: message\.clientOrder \?\? null/);
  assert.match(componentSource, /import \{ useBuddyMessages,[\s\S]*type BuddyMessage,[\s\S]*type BuddyQueuedTurn[\s\S]*\} from "\.\/useBuddyMessages\.ts";/);
  assert.match(componentSource, /resetNextBuddyMessageClientOrder,[\s\S]*= useBuddyMessages\(\{ t \}\)/);
  assert.match(messagesSource, /function resetNextBuddyMessageClientOrder\(\)/);
  assert.match(componentSource, /void drainBuddyQueue\(\);/);
  assert.match(componentSource, /while \(queuedTurns\.value\.length > 0\)/);
  assert.match(componentSource, /const assistantMessage = ensureAssistantMessageForTurn\(turn\);/);
  assert.match(messagesSource, /function ensureAssistantMessageForTurn\(turn: BuddyQueuedTurn\): BuddyMessage/);
  assert.match(componentSource, /import \{ useBuddyRunDisplayMessages \} from "\.\/useBuddyRunDisplayMessages\.ts";/);
  assert.match(componentSource, /shouldRenderMessage,[\s\S]*shouldShowMessageRoleLabel,[\s\S]*= useBuddyRunDisplayMessages<BuddyMessage>/);
  assert.match(runDisplayMessagesSource, /function shouldRenderMessage\(message: Message\)/);
  assert.doesNotMatch(runDisplayMessagesSource.match(/function shouldRenderMessage\(message: Message\) \{[\s\S]*?\n  \}/)?.[0] ?? "", /activityText/);
});

test("BuddyWidget keeps runtime error replies out of model context and persisted history", () => {
  assert.match(componentSource, /const history = buildHistoryBeforeMessage\(userEntry\.id\);/);
  assert.match(componentSource, /const history = turn\.history;/);
  assert.match(messagesSource, /return previousMessages\.filter\(isContextMessage\)\.map\(\(\{ id, role, content \}\) => \(\{ id, role, content \}\)\);/);
  assert.match(componentSource, /appendBuddyChatMessage\(sessionId,[\s\S]*include_in_context: options\.includeInContext \?\? message\.includeInContext !== false,[\s\S]*\)/);
  assert.match(componentSource, /updateAssistantMessage\(assistantMessage\.id, t\("buddy\.errorReply", \{ error: message \}\), \{ includeInContext: false \}\);/);
  assert.match(componentSource, /persistBuddyMessage\(turn\.sessionId,[\s\S]*includeInContext: false,[\s\S]*\);/);
});

test("BuddyWidget keeps live run activity out of the chat transcript", () => {
  assert.match(messagesSource, /resolveBuddyRunActivityFromRunEvent/);
  assert.match(componentSource, /activityText/);
  assert.doesNotMatch(componentSource, /shouldShowAssistantActivityBubble\(message\)/);
  assert.doesNotMatch(componentSource, /message\.activityText \|\| t\("buddy\.streaming"\)/);
  assert.match(componentSource, /setAssistantActivityText\(assistantMessage\.id, t\("buddy\.activity\.preparing"\)\);/);
  assert.match(runEventStreamSource, /setAssistantActivityFromRunEvent\(assistantMessageId, eventType, payload, graph\);/);
  assert.match(componentSource, /if \(mood\.value === "thinking" && latestActivityText\.value\) \{/);
});

test("BuddyWidget renders assistant replies from parent graph output nodes only", () => {
  assert.doesNotMatch(componentSource, /resolveOutputPreviewContent/);
  assert.match(messagesSource, /import \{ resolveOutputPreviewContent \} from "\.\.\/editor\/nodes\/outputPreviewContentModel\.ts";/);
  assert.match(componentSource, /import SandboxedHtmlFrame from "\.\.\/components\/SandboxedHtmlFrame\.vue";/);
  assert.match(componentSource, /buildBuddyPublicOutputBindings/);
  assert.match(runEventStreamSource, /reduceBuddyPublicOutputEvent/);
  assert.match(messagesSource, /publicOutput\?:/);
  assert.match(runDisplayMessagesSource, /buildPublicOutputMessageId\(controllerMessageId, output\.outputNodeId\)/);
  assert.match(componentSource, /syncBuddyRunDisplayMessages,[\s\S]*= useBuddyRunDisplayMessages<BuddyMessage>/);
  assert.match(componentSource, /v-html="renderBuddyMarkdown\(message\.content\)"/);
  assert.match(componentSource, /v-else-if="message\.role === 'assistant' && message\.content && resolveBuddyRenderedContent\(message\)\.kind === 'html'"/);
  assert.match(componentSource, /<SandboxedHtmlFrame[\s\S]*:source="resolveBuddyRenderedContent\(message\)\.html"/);
  assert.match(componentSource, /class="buddy-widget__public-output-card"/);
  assert.match(runEventStreamSource, /addEventListener\("activity\.event"/);
  assert.doesNotMatch(componentSource, /resolveBuddyReplyFromRunEvent/);
  assert.doesNotMatch(componentSource, /resolveBuddyRunTraceFromRunEvent/);
});

test("BuddyWidget closed reply bubble is a four-character opener instead of a content preview", () => {
  assert.match(componentSource, /import \{ buildBuddyBubblePreviewLabel \} from "\.\/buddyBubblePreviewModel\.ts";/);
  assert.match(componentSource, /const bubblePreviewLabel = computed\(\(\) => buildBuddyBubblePreviewLabel\(bubbleText\.value\)\);/);
  assert.match(componentSource, /v-if="bubblePreviewLabel && !isPanelOpen"/);
  assert.match(componentSource, /type="button"[\s\S]*class="buddy-widget__bubble"[\s\S]*@click="openBubblePreviewPanel"/);
  assert.match(componentSource, /\{\{ bubblePreviewLabel \}\}/);
  assert.match(componentSource, /function openBubblePreviewPanel\(\)/);
  assert.doesNotMatch(componentSource, /const bubblePreviewContent = computed/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__bubble-html-frame"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__bubble-markdown"/);
  assert.doesNotMatch(componentSource, /v-html="bubblePreviewContent\.html"/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*max-width:\s*min\(9em, calc\(100vw - 32px\)\);/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*overflow:\s*hidden;/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*white-space:\s*nowrap;/);
});

test("BuddyWidget renders output-segment run trace capsules instead of per-message duration chips", () => {
  assert.match(runTraceDisplaySource, /import \{ formatRunDuration \} from "\.\.\/lib\/run-display-name\.ts";/);
  assert.match(runTraceDisplaySource, /import \{[\s\S]*advanceSmoothNumberDisplay,[\s\S]*isSmoothNumberDisplaySettled,[\s\S]*\} from "\.\.\/lib\/smoothNumberDisplay\.ts";/);
  assert.doesNotMatch(messagesSource, /buildOutputTraceBuddyMessageMetadata/);
  assert.doesNotMatch(messagesSource, /resolveOutputTraceBuddyMessageMetadata/);
  assert.match(componentSource, /import BuddyRunTrace from "\.\/BuddyRunTrace\.vue";/);
  assert.match(componentSource, /import \{ useBuddyRunTraceDisplay \} from "\.\/useBuddyRunTraceDisplay\.ts";/);
  assert.match(componentSource, /buildBuddyOutputTracePlan/);
  assert.match(runEventStreamSource, /reduceBuddyOutputTraceEvent/);
  assert.match(componentSource, /buildBuddyOutputTraceStateFromRunDetail/);
  assert.match(runTraceDisplaySource, /import \{[\s\S]*buildBuddyOutputTraceTreeRows,[\s\S]*type BuddyOutputTraceTreeRow[\s\S]*\} from "\.\/buddyOutputTraceTree\.ts";/);
  assert.match(messagesSource, /outputTrace\?:/);
  assert.match(componentSource, /useBuddyRunTraceDisplay\(\{[\s\S]*messages,[\s\S]*router,[\s\S]*t,[\s\S]*shouldRenderMessage,[\s\S]*\}\)/);
  assert.match(componentSource, /<BuddyRunTrace[\s\S]*:segment="message\.outputTrace"[\s\S]*:rows="buildTraceTreeRows\(message\.outputTrace, message\.runId\)"/);
  assert.match(componentSource, /@toggle="toggleTraceMessage\(message\.id, message\.runId\)"/);
  assert.match(componentSource, /@open-playback="\(row\) => openTraceTreeRowPlayback\(message\.runId, row\)"/);
  assert.match(componentSource, /@open-evidence-run="openTraceEvidenceRun"/);
  assert.match(componentSource, /@restore-revision="restoreTraceGraphRevision"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__run-trace"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__run-trace-summary"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__run-trace-row-open"/);
  assert.doesNotMatch(componentSource, /\.buddy-widget__run-trace\s*\{/);
  assert.doesNotMatch(componentSource, /import \{ fetchTemplate, runGraph \} from "\.\.\/api\/graphs\.ts";/);
  assert.match(boundRunTemplateSource, /import \{ fetchTemplate, runGraph \} from "\.\.\/api\/graphs\.ts";/);
  assert.match(virtualOperationExecutorSource, /import \{ fetchTemplate, fetchTemplates, runGraph \} from "\.\.\/api\/graphs\.ts";/);
  assert.match(runTraceDisplaySource, /import \{ restoreGraphRevision \} from "\.\.\/api\/graphs\.ts";/);
  assert.match(runTraceDisplaySource, /function openTraceEvidenceRun\(runId: string \| null \| undefined\)/);
  assert.match(runTraceDisplaySource, /async function restoreTraceGraphRevision\(row: BuddyOutputTraceTreeRow\)/);
  assert.match(runTraceDisplaySource, /await restoreGraphRevision\(row\.graphRevision\.graphId, row\.graphRevision\.revisionId\)/);
  assert.match(runTraceDisplaySource, /ElMessage\.success\(t\("graphLibrary\.revisionRestored", \{ revisionId: response\.restored_revision_id \}\)\);/);
  assert.match(runTraceDisplaySource, /router\.push\(`\/runs\/\$\{encodeURIComponent\(normalizedRunId\)\}`\)/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__run-trace-open"/);
  assert.match(runTraceDisplaySource, /function openTraceTreeRowPlayback\(runId: string \| null \| undefined, row: BuddyOutputTraceTreeRow\)/);
  assert.match(runTraceDisplaySource, /openRunPlayback\(row\.evidenceRunId \|\| runId\);/);
  assert.match(runTraceDisplaySource, /router\.push\(resolveRunRestoreUrl\(normalizedRunId\)\)/);
  assert.match(runTraceSource, /buddy-widget__run-trace-dot--running/);
  assert.match(runTraceSource, /class="buddy-widget__run-trace-row-evidence"/);
  assert.match(runTraceSource, /:data-virtual-affordance-id="`buddy\.trace\.graphRevision\.restore\.\$\{row\.graphRevision\.revisionId\}`"/);
  assert.match(runTraceDisplaySource, /formatTraceDuration/);
  assert.match(runTraceDisplaySource, /traceClockNowMs/);
  assert.match(runTraceDisplaySource, /traceDurationDisplayByKey/);
  assert.match(runTraceDisplaySource, /window\.requestAnimationFrame\(tick\)/);
  assert.doesNotMatch(componentSource, /advanceSmoothNumberDisplay/);
  assert.doesNotMatch(componentSource, /isSmoothNumberDisplaySettled/);
  assert.doesNotMatch(componentSource, /traceDurationDisplayByKey/);
  assert.doesNotMatch(componentSource, /traceRunTreeByRunId/);
  assert.doesNotMatch(componentSource, /traceRunDetailByRunId/);
  assert.doesNotMatch(componentSource, /function ensureTraceRunTreeLoaded/);
  assert.doesNotMatch(componentSource, /function restoreTraceGraphRevision/);
  assert.doesNotMatch(componentSource, /function resolveTraceSegmentSummary/);
  assert.doesNotMatch(componentSource, /function buildTraceTreeRows/);
  assert.doesNotMatch(componentSource, /buildRunNodeTimingByNodeIdFromRun/);
  assert.match(runDisplayMessagesSource, /replayPublicOutputEventsFromRunDetail/);
  assert.match(runDisplayMessagesSource, /reduceBuddyPublicOutputEvent/);
  assert.match(componentSource, /const \{ publicOutputMessages \} = syncBuddyRunDisplayMessages/);
  assert.doesNotMatch(componentSource, /for \(const message of outputTraceMessages\)/);
  assert.match(componentSource, /resolvePersistentBuddyReplyContent\(publicOutputMessages, runDetail\)/);
  assert.match(componentSource, /transcriptOnly:\s*true/);
  assert.match(componentSource, /hydrateLoadedRunDisplays: hydrateLoadedBuddyRunDisplays/);
  assert.match(componentSource, /syncBuddyRunDetailDisplay/);
  assert.match(componentSource, /const hydratedDisplay = syncBuddyRunDetailDisplay\(record\.message_id, runDetail\);/);
  assert.match(componentSource, /const hasHydratedRunDisplay =[\s\S]*hydratedDisplay\.outputTraceMessages\.length > 0[\s\S]*hydratedDisplay\.publicOutputMessages\.length > 0/);
  assert.match(componentSource, /message\.transcriptOnly = hasHydratedRunDisplay;/);
  assert.match(chatSessionsSource, /hydrateLoadedRunDisplays\?: \(records: BuddyChatMessageRecord\[\]\) => Promise<void>/);
  assert.match(chatSessionsSource, /async function refreshActiveChatSession\(\)/);
  assert.match(componentSource, /refreshActiveChatSession,/);
  assert.match(componentSource, /function startActiveSessionRefreshPolling\(\)/);
  assert.match(componentSource, /void refreshActiveChatSession\(\);/);
  assert.match(componentSource, /const metadata = buildBuddyMessageMetadata\(message\);/);
  assert.match(messagesSource, /function buildBuddyMessageMetadata\(message: BuddyMessage\)/);
  assert.match(componentSource, /\.\.\.\(metadata \? \{ metadata \} : \{\}\)/);
  assert.match(messagesSource, /transcriptOnly:\s*record\.role === "assistant" && Boolean\(record\.run_id\)/);
  assert.doesNotMatch(componentSource, /formatPublicOutputDuration/);
  assert.doesNotMatch(componentSource, /runTraceStartedAtByKey/);
});

test("BuddyWidget fetches real run trees when expanded trace capsules are opened", () => {
  assert.doesNotMatch(componentSource, /import \{ fetchRun, resumeRun \} from "\.\.\/api\/runs\.ts";/);
  assert.match(runTraceDisplaySource, /import \{ fetchRun, fetchRunTree \} from "\.\.\/api\/runs\.ts";/);
  assert.match(runTraceDisplaySource, /import type \{ RunDetail, RunTreeNode \} from "\.\.\/types\/run\.ts";/);
  assert.match(runTraceDisplaySource, /const traceRunTreeByRunId = ref<Record<string, RunTreeNode>>\(\{\}\);/);
  assert.match(runTraceDisplaySource, /const traceRunTreeLoadingByRunId = ref<Record<string, boolean>>\(\{\}\);/);
  assert.match(componentSource, /@toggle="toggleTraceMessage\(message\.id, message\.runId\)"/);
  assert.match(runTraceDisplaySource, /void ensureTraceRunTreeLoaded\(runId\);/);
  assert.match(runTraceDisplaySource, /fetchRunTree\(normalizedRunId/);
  assert.match(runTraceDisplaySource, /buildBuddyOutputTraceTreeRows\(segment,\s*\{\s*rootLabel: t\("buddy\.runTraceMainGraph"\),\s*runTree:/);
});

test("BuddyWidget seeds streaming run trace capsules from the current run snapshot", () => {
  assert.match(componentSource, /import \{ useBuddyRunEventStream \} from "\.\/useBuddyRunEventStream\.ts";/);
  assert.match(componentSource, /useBuddyRunEventStream\(\{[\s\S]*handleActivityEvent: handleBuddyVirtualUiOperationEvent,[\s\S]*setAssistantActivityFromRunEvent,[\s\S]*syncStreamingBuddyRunDisplay,[\s\S]*buildPublicOutputRuntimeStateFromRunDetail,[\s\S]*nowPublicOutputMs,[\s\S]*\}\)/);
  assert.match(runEventStreamSource, /const source = new EventSource\(streamUrl\);[\s\S]*activeEventSource = source;[\s\S]*void hydrateBuddyStreamingRunDisplayFromSnapshot\(/);
  assert.match(runEventStreamSource, /async function hydrateBuddyStreamingRunDisplayFromSnapshot\(/);
  assert.match(runEventStreamSource, /fetchRun\(runId\)/);
  assert.match(runEventStreamSource, /if \(activeEventSource !== source\) \{[\s\S]*return null;[\s\S]*\}/);
  assert.match(runEventStreamSource, /buildBuddyOutputTraceStateFromRunDetail\(runDetail, outputTracePlan, graph\)/);
  assert.match(runEventStreamSource, /buildPublicOutputRuntimeStateFromRunDetail\(runDetail, publicOutputBindings, graph\)/);
  assert.match(runDisplayMessagesSource, /function syncStreamingBuddyRunDisplay\(/);
  assert.match(runEventStreamSource, /syncStreamingBuddyRunDisplay\(assistantMessageId, runId, outputTraceState, publicOutputState\)/);
  assert.match(runEventStreamSource, /source\.addEventListener\("run\.completed", \(\) => closeEventSource\(source\)\);/);
  assert.doesNotMatch(componentSource, /let eventSource: EventSource \| null = null;/);
  assert.doesNotMatch(componentSource, /async function hydrateBuddyStreamingRunDisplayFromSnapshot\(/);
  assert.doesNotMatch(componentSource, /function closeEventSource\(source: EventSource/);
});

test("BuddyWidget shows a pending run trace capsule immediately after sending", () => {
  assert.match(runDisplayMessagesSource, /createBuddyPendingOutputTraceRuntimeState/);
  assert.match(
    componentSource,
    /messages\.value\.push\(userEntry, assistantEntry\);[\s\S]*showBuddyImmediatePendingTrace\(assistantEntry\.id\);[\s\S]*queuedTurns\.value\.push\(/,
  );
  assert.match(runDisplayMessagesSource, /function showBuddyImmediatePendingTrace\(assistantMessageId: string\)/);
  assert.match(runDisplayMessagesSource, /segmentId:\s*"__pending__"/);
  assert.match(runDisplayMessagesSource, /boundaryLabel:\s*t\("buddy\.activity\.preparing"\)/);
  assert.match(
    componentSource,
    /const boundRun = await startBuddyBoundRunTemplate\(\{[\s\S]*showBuddyGraphPendingTrace\(assistantMessage\.id, boundRun\.graph, boundRun\.publicOutputBindings\);/,
  );
  assert.match(boundRunTemplateSource, /const publicOutputBindings = buildBuddyPublicOutputBindings\(graph\);[\s\S]*const run = await runGraph\(graph\);/);
  assert.match(runDisplayMessagesSource, /function showBuddyGraphPendingTrace\(/);
  assert.match(runDisplayMessagesSource, /createBuddyPendingOutputTraceRuntimeState\(outputTracePlan, nowPublicOutputMs\(\)\)/);
  assert.match(runDisplayMessagesSource, /function hasVisibleBuddyRunDisplaySnapshot\(/);
});

test("BuddyWidget groups consecutive visible messages by role label", () => {
  assert.doesNotMatch(componentSource, /shouldShowGroupedBuddyMessageLabel/);
  assert.match(runDisplayMessagesSource, /import \{ shouldShowGroupedBuddyMessageLabel \} from "\.\/buddyMessageGrouping\.ts";/);
  assert.match(componentSource, /v-for="\(\s*message,\s*messageIndex\s*\) in messages"/);
  assert.match(componentSource, /v-if="shouldShowMessageRoleLabel\(messageIndex\)"/);
  assert.match(componentSource, /'buddy-widget__message--grouped': !shouldShowMessageRoleLabel\(messageIndex\)/);
  assert.match(runDisplayMessagesSource, /function shouldShowMessageRoleLabel\(messageIndex: number\)/);
  assert.match(componentSource, /\.buddy-widget__message--grouped\s*\{/);
});

test("BuddyWidget stores buddy chat in backend sessions and exposes a compact history dropdown", () => {
  assert.match(componentSource, /import \{[\s\S]*appendBuddyChatMessage,[\s\S]*\} from "\.\.\/api\/buddy\.ts";/);
  assert.doesNotMatch(componentSource, /fetchBuddyRunTemplateBinding/);
  assert.match(boundRunTemplateSource, /import \{[\s\S]*fetchBuddyRunTemplateBinding,[\s\S]*fetchBuddySessionSummary,[\s\S]*\} from "\.\.\/api\/buddy\.ts";/);
  assert.match(autonomousReviewRunSource, /import \{ enqueueBuddyBackgroundReview \} from "\.\.\/api\/buddy\.ts";/);
  assert.match(chatSessionsSource, /import \{[\s\S]*createBuddyChatSession,[\s\S]*deleteBuddyChatSession,[\s\S]*fetchBuddyChatMessages,[\s\S]*fetchBuddyChatSessions,[\s\S]*\} from "\.\.\/api\/buddy\.ts";/);
  assert.match(componentSource, /import \{ Close, FullScreen, Plus, SemiSelect \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import \{ ElIcon, ElOption, ElSelect \} from "element-plus";/);
  assert.match(componentSource, /import BuddySessionHistory from "\.\/BuddySessionHistory\.vue";/);
  assert.match(componentSource, /import \{ useBuddyChatSessions \} from "\.\/useBuddyChatSessions\.ts";/);
  assert.match(chatSessionsSource, /const BUDDY_ACTIVE_SESSION_STORAGE_KEY = "toograph:buddy-active-session";/);
  assert.match(chatSessionsSource, /const chatSessions = ref<BuddyChatSession\[\]>\(\[\]\);/);
  assert.match(chatSessionsSource, /const activeSessionId = ref<string \| null>\(null\);/);
  assert.match(chatSessionsSource, /const activeSessionDeleteId = ref<string \| null>\(null\);/);
  assert.match(chatSessionsSource, /const sessionDeleteConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /useBuddyChatSessions\(\{[\s\S]*messages,[\s\S]*queuedTurns,[\s\S]*activeRunId,[\s\S]*errorMessage,[\s\S]*messageRecordToBuddyMessage,[\s\S]*resetVisibleBuddyRunState,[\s\S]*\}\)/);
  assert.match(componentSource, /<BuddySessionHistory[\s\S]*:sessions="chatSessions"[\s\S]*:delete-confirm-session-id="activeSessionDeleteId"/);
  assert.match(componentSource, /@toggle="toggleSessionPanel"/);
  assert.match(componentSource, /@select="selectChatSession"/);
  assert.match(componentSource, /@delete-action="handleSessionDeleteActionClick"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__history-control"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__sessions-panel"/);
  assert.match(sessionHistorySource, /class="buddy-widget__history-control"/);
  assert.match(sessionHistorySource, /class="buddy-widget__sessions-panel"/);
  assert.match(sessionHistorySource, /formatBuddySessionSourceLabel/);
  assert.match(sessionHistorySource, /class="buddy-widget__session-source-badge"/);
  assert.match(sessionHistorySource, /v-for="session in sessions"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__session-new"/);
  assert.match(sessionHistorySource, /@click="emit\('select', session\.session_id\)"/);
  assert.match(sessionHistorySource, /@click\.stop="emit\('deleteAction', session\.session_id\)"/);
  assert.match(sessionHistorySource, /:visible="deleteConfirmSessionId === session\.session_id"/);
  assert.match(sessionHistorySource, /<ElIcon v-if="deleteConfirmSessionId === session\.session_id" aria-hidden="true"><Check \/><\/ElIcon>/);
  assert.match(chatSessionsSource, /function startSessionDeleteConfirmWindow\(sessionId: string\)/);
  assert.match(chatSessionsSource, /function handleSessionDeleteActionClick\(sessionId: string\)/);
  assert.match(chatSessionsSource, /chatSessionInitializationPromise = initializeBuddyChatSessions\(\)\.finally/);
  assert.doesNotMatch(componentSource, /function startSessionDeleteConfirmWindow\(sessionId: string\)/);
  assert.doesNotMatch(componentSource, /function handleSessionDeleteActionClick\(sessionId: string\)/);
  assert.doesNotMatch(componentSource, /chatSessionInitializationPromise = initializeBuddyChatSessions\(\)\.finally/);
  assert.doesNotMatch(componentSource, /BUDDY_HISTORY_STORAGE_KEY/);
  assert.doesNotMatch(componentSource, /migrateLegacyBuddyHistory/);
  assert.doesNotMatch(componentSource, /readLegacyBuddyMessages/);
  assert.doesNotMatch(componentSource, /normalizeBuddyRunDisplayMessages/);
  assert.match(componentSource, /\.buddy-widget__panel\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(componentSource, /\.buddy-widget__avatar\s*\{[\s\S]*z-index:\s*4;/);
  assert.match(sessionHistorySource, /\.buddy-widget__sessions-panel\s*\{[\s\S]*position:\s*absolute;[\s\S]*z-index:\s*3;[\s\S]*width:\s*min\(330px,[\s\S]*max-height:\s*min\(520px,[\s\S]*overflow-y:\s*auto;/);
  assert.match(sessionHistorySource, /\.buddy-widget__session-list\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow:\s*visible;/);
  assert.doesNotMatch(componentSource, /watch\(\s*messages,/);
});

test("BuddyWidget uses the top toolbar for new chat and fullscreen expansion", () => {
  assert.match(componentSource, /import \{ Close, FullScreen, Plus, SemiSelect \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /const isPanelFullscreen = ref\(false\);/);
  assert.match(componentSource, /const avatarStyle = computed\(\(\) => \{[\s\S]*left:\s*`\$\{position\.value\.x\}px`,[\s\S]*top:\s*`\$\{position\.value\.y\}px`,/);
  assert.match(chatSessionsSource, /const hasCurrentSessionContent = computed\(\(\) => messages\.value\.some\(\(message\) => message\.content\.trim\(\)\)\);/);
  assert.match(chatSessionsSource, /const canCreateNewSession = computed\(\(\) => !isSessionSwitchLocked\.value && hasCurrentSessionContent\.value\);/);
  assert.match(componentSource, /:title="t\('buddy\.newSession'\)"[\s\S]*:disabled="!canCreateNewSession"[\s\S]*@click="createNewSession"[\s\S]*<ElIcon><Plus \/><\/ElIcon>/);
  assert.match(chatSessionsSource, /async function createNewSession\(\) \{[\s\S]*if \(!canCreateNewSession\.value\) \{/);
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
  assert.doesNotMatch(componentSource, /function formatIdentityForPrompt/);
  assert.doesNotMatch(componentSource, /function formatPolicyForPrompt/);
  assert.doesNotMatch(componentSource, /function formatMemoriesForPrompt/);
});

test("BuddyWidget starts visible runs from the saved template binding", () => {
  assert.notEqual(boundRunTemplateSource, "");
  assert.match(componentSource, /import \{ useBuddyBoundRunTemplate \} from "\.\/useBuddyBoundRunTemplate\.ts";/);
  assert.match(componentSource, /const \{[\s\S]*startBuddyBoundRunTemplate,[\s\S]*\} = useBuddyBoundRunTemplate\(\{/);
  assert.match(componentSource, /const boundRun = await startBuddyBoundRunTemplate\(\{/);
  assert.match(boundRunTemplateSource, /fetchBuddyRunTemplateBinding/);
  assert.match(boundRunTemplateSource, /const binding = await fetchBuddyRunTemplateBinding\(\);/);
  assert.match(boundRunTemplateSource, /fetchTemplate\(binding\.template_id\)/);
  assert.match(boundRunTemplateSource, /buildBuddyChatGraph\([\s\S]*template,[\s\S]*binding,[\s\S]*\);/);
  assert.match(boundRunTemplateSource, /const run = await runGraph\(graph\);/);
  assert.doesNotMatch(componentSource, /fetchBuddyRunTemplateBinding/);
  assert.doesNotMatch(componentSource, /fetchTemplate\(binding\.template_id\)/);
  assert.doesNotMatch(componentSource, /buildBuddyChatGraph\(/);
  assert.doesNotMatch(componentSource, /runGraph\(/);
  assert.doesNotMatch(componentSource, /fetchTemplate\("buddy_autonomous_loop"\)/);
});

test("BuddyWidget starts autonomous review as a separate background run after the visible reply", () => {
  assert.notEqual(visibleRunTemplateEffectsSource, "");
  assert.match(autonomousReviewRunSource, /enqueueBuddyBackgroundReview/);
  assert.doesNotMatch(autonomousReviewRunSource, /buildBuddyReviewGraph/);
  assert.doesNotMatch(autonomousReviewRunSource, /fetchBuddyMemoryReviewTemplateBinding/);
  assert.match(visibleRunTemplateEffectsSource, /useBuddyAutonomousReviewRun/);
  assert.match(visibleRunTemplateEffectsSource, /useBuddyContextCompactionRun/);
  assert.match(componentSource, /import \{ useBuddyVisibleRunTemplateEffects \} from "\.\/useBuddyVisibleRunTemplateEffects\.ts";/);
  assert.match(componentSource, /const \{[\s\S]*startBuddyVisibleRunTemplateEffects,[\s\S]*abortBuddyVisibleRunTemplateEffects,[\s\S]*\} = useBuddyVisibleRunTemplateEffects\(\{[\s\S]*currentSessionId,[\s\S]*buddyModelRef,[\s\S]*pollRunUntilFinished,[\s\S]*notifyBuddyDataChanged: buddyContextStore\.notifyBuddyDataChanged,[\s\S]*\}\);/);
  assert.match(componentSource, /void startBuddyVisibleRunTemplateEffects\(\{/);
  assert.match(visibleRunTemplateEffectsSource, /void startBuddyAutonomousReviewRun\(request\.runDetail\);/);
  assert.match(autonomousReviewRunSource, /async function startBuddyAutonomousReviewRun\(mainRun: RunDetail\)/);
  assert.match(autonomousReviewRunSource, /const reviewRun = await enqueueBuddyBackgroundReview\(\{[\s\S]*source_run_id: mainRun\.run_id,[\s\S]*buddy_model_ref: buddyModelRef\.value,[\s\S]*\}\);/);
  assert.match(autonomousReviewRunSource, /void pollBuddyAutonomousReviewRun\(reviewRun\.review_run_id\);/);
  assert.match(autonomousReviewRunSource, /const backgroundReviewAbortControllers = new Set<AbortController>\(\);/);
  assert.match(componentSource, /abortBuddyVisibleRunTemplateEffects\(\);/);
  assert.doesNotMatch(componentSource, /import \{ useBuddyAutonomousReviewRun \} from "\.\/useBuddyAutonomousReviewRun\.ts";/);
  assert.doesNotMatch(componentSource, /startBuddyAutonomousReviewRun/);
  assert.doesNotMatch(componentSource, /abortBackgroundReviewRuns/);
  assert.doesNotMatch(componentSource, /async function startBuddyAutonomousReviewRun\(mainRun: RunDetail\)/);
  assert.doesNotMatch(componentSource, /async function pollBuddyAutonomousReviewRun\(runId: string\)/);
  assert.doesNotMatch(componentSource, /const backgroundReviewAbortControllers = new Set<AbortController>\(\);/);
  assert.doesNotMatch(componentSource, /activeRunId\.value = reviewRun\.run_id/);
});

test("BuddyWidget leaves visible context compaction inside the official run template", () => {
  assert.notEqual(boundRunTemplateSource, "");
  assert.notEqual(visibleRunTemplateEffectsSource, "");
  assert.match(boundRunTemplateSource, /fetchBuddySessionSummary/);
  assert.match(boundRunTemplateSource, /const sessionSummary = await fetchBuddySessionSummary\(\);/);
  assert.match(boundRunTemplateSource, /sessionSummary: sessionSummary\.content,/);
  assert.match(visibleRunTemplateEffectsSource, /startBuddyContextCompactionRun/);
  assert.match(visibleRunTemplateEffectsSource, /trigger: "background"/);
  assert.doesNotMatch(componentSource, /import \{ useBuddyContextCompactionRun \} from "\.\/useBuddyContextCompactionRun\.ts";/);
  assert.doesNotMatch(componentSource, /fetchBuddySessionSummary/);
  assert.doesNotMatch(componentSource, /startBuddyContextCompactionRun/);
  assert.doesNotMatch(componentSource, /abortContextCompactionRuns/);
  assert.doesNotMatch(componentSource, /maybeRunPreflightContextCompaction/);
  assert.doesNotMatch(componentSource, /isContextOverflowError/);
  assert.doesNotMatch(componentSource, /contextCompactionRetried/);
  assert.doesNotMatch(componentSource, /trigger: "preflight"/);
  assert.doesNotMatch(componentSource, /trigger: "overflow_recovery"/);
  assert.match(contextCompactionRunSource, /buildBuddyContextCompactionGraph/);
  assert.match(contextCompactionRunSource, /BUDDY_CONTEXT_COMPACTION_TEMPLATE_ID/);
  assert.match(contextCompactionRunSource, /shouldRunBuddyContextCompaction/);
  assert.doesNotMatch(componentSource, /async function startBuddyContextCompactionRun/);
});

test("BuddyWidget keeps awaiting-human runs out of the normal chat resume flow", () => {
  assert.match(virtualOperationExecutorSource, /import \{ fetchRun, resumeRun \} from "\.\.\/api\/runs\.ts";/);
  assert.doesNotMatch(componentSource, /import \{ fetchRun, resumeRun \} from "\.\.\/api\/runs\.ts";/);
  assert.doesNotMatch(componentSource, /buildBuddyConversationalPausePrompt/);
  assert.doesNotMatch(componentSource, /buildBuddyConversationalPauseResumePayload/);
  assert.match(componentSource, /const pausedBuddyRun = ref<RunDetail \| null>\(null\);/);
  assert.match(componentSource, /const pausedBuddyAssistantMessageId = ref<string \| null>\(null\);/);
  assert.doesNotMatch(componentSource, /<BuddyPauseCard[\s\S]*shouldShowPausedRunCard/);
  assert.doesNotMatch(componentSource, /import BuddyPauseCard from "\.\/BuddyPauseCard\.vue";/);
  assert.match(componentSource, /runDetail\.status === "awaiting_human"/);
  assert.doesNotMatch(componentSource, /resumePausedBuddyRunFromChatReply/);
  assert.doesNotMatch(componentSource, /composerDecision\.kind === "resume_paused_run"/);
  assert.doesNotMatch(componentSource, /void startBuddyAutonomousReviewRun\(runDetail\);[\s\S]*runDetail\.status === "awaiting_human"/);
});

test("BuddyWidget does not surface paused runs as an in-chat action card", () => {
  assert.match(pauseCardSource, /buddy\.pause\.cancelRun/);
  assert.doesNotMatch(componentSource, /@cancel="cancelPausedBuddyRun"/);
  assert.doesNotMatch(componentSource, /async function cancelPausedBuddyRun\(\)/);
  assert.doesNotMatch(componentSource, /await cancelRun\(run\.run_id/);
});

test("BuddyWidget keeps page-operation waiting state internal to auto resume", () => {
  assert.match(componentSource, /type BuddyPauseHandlingOptions = \{[\s\S]*persist\?: boolean;[\s\S]*\};/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(runDetail,\s*assistantMessage\.id,\s*\{ persist: true \}\)/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(resumedRunDetail,\s*assistantMessageId,\s*\{ persist: true \}\)/);
  assert.match(componentSource, /const isAutoResumablePageOperationPause = Boolean\(findAutoResumablePageOperationRequestId\(run\)\);/);
  assert.match(componentSource, /if \(isAutoResumablePageOperationPause\) \{[\s\S]*updateAssistantMessage\(assistantMessageId,\s*""/);
  assert.doesNotMatch(componentSource, /buildBuddyConversationalPausePrompt/);
  assert.doesNotMatch(componentSource, /includeInContext:\s*!isAutoResumablePageOperationPause/);
});

test("BuddyWidget finishes auto-resumed page-operation runs back into the chat reply", () => {
  assert.match(
    virtualOperationExecutorSource,
    /const completedTriggeredRunDetail = await waitForTriggeredRunCompletion\(triggeredRun,[\s\S]*\);[\s\S]*triggeredRunDetail = completedTriggeredRunDetail;[\s\S]*if \(completedTriggeredRunDetail\) \{[\s\S]*promoteBackgroundTemplateRunResultToBuddyReply\(operationPlan,\s*completedTriggeredRunDetail,\s*execution\.graph\);[\s\S]*\}[\s\S]*status = completedTriggeredRunDetail\?\.status === "failed" \? "failed" : "succeeded";/,
  );
  assert.match(runDisplayMessagesSource, /function promoteBackgroundTemplateRunResultToBuddyReply\(/);
  assert.match(runDisplayMessagesSource, /function findPrimaryCompletedTextPublicOutput\(/);
  assert.match(
    virtualOperationExecutorSource,
    /const assistantMessageId = resolveBuddyRunControllerMessageId\(operationPlan\.runId\);[\s\S]*const sessionId = activeSessionId\.value;[\s\S]*resetPausedBuddyPause\(\);[\s\S]*await finishAutoResumedPageOperationRun\(\{[\s\S]*runId:\s*response\.run_id,[\s\S]*assistantMessageId,[\s\S]*sessionId,[\s\S]*\}\);/,
  );
  assert.doesNotMatch(virtualOperationExecutorSource, /type BuddyAutoResumedPageOperationFinishOptions = \{[\s\S]*graph: GraphPayload;[\s\S]*\};/);
  assert.match(componentSource, /async function finishAutoResumedPageOperationRun\(/);
  assert.match(
    componentSource,
    /const resumedRunDetail = await pollRunUntilFinished\(runId,\s*controller\.signal\);[\s\S]*clearAutoResumingPageOperationPlaceholder\(assistantMessageId,\s*runId\);[\s\S]*finishBuddyVisibleRun\(resumedRunDetail,\s*assistantMessageId,\s*sessionId,\s*runId,\s*\{ includeOutputTrace: false \}\);/,
  );
  assert.doesNotMatch(extractSourceBetween("async function finishAutoResumedPageOperationRun(", "function clearAutoResumingPageOperationPlaceholder"), /startRunEventStream/);
  assert.match(componentSource, /function clearAutoResumingPageOperationPlaceholder\(assistantMessageId: string, runId: string\)/);
});

test("BuddyWidget still resumes page-operation runs when visible playback is interrupted after a target run exists", () => {
  assert.doesNotMatch(
    extractSourceBetween(
      "async function maybeAutoResumePageOperationRun(",
      "function resolveBackgroundTemplateRunOperation",
      virtualOperationExecutorSource,
    ),
    /if \(operationResult\.status === "interrupted"\) \{[\s\S]*return;[\s\S]*\}/,
  );
  assert.match(
    extractSourceBetween(
      "async function executeVirtualOperationRequest(",
      "async function executeVirtualOperationCommands",
      virtualOperationExecutorSource,
    ),
    /triggeredRunDetail\?\.status \?\? triggeredRun\?\.initialStatus/,
  );
});

test("BuddyWidget hides parent trace capsules while a background template target is running", () => {
  assert.match(runDisplayMessagesSource, /function syncBackgroundTemplateRunDisplay\(/);
  assert.match(
    runDisplayMessagesSource,
    /const parentControllerMessageId = resolveBuddyRunControllerMessageId\(operationPlan\.runId \?\? ""\);[\s\S]*if \(parentControllerMessageId\) \{[\s\S]*removeBuddyRunDisplayMessages\(parentControllerMessageId\);[\s\S]*\}/,
  );
  assert.match(
    runDisplayMessagesSource,
    /syncBuddyRunDisplayMessages\([\s\S]*buildBackgroundTemplateRunDisplayControllerId\(operationPlan, runDetail\.run_id\),[\s\S]*runDetail\.run_id,[\s\S]*outputTraceState,[\s\S]*outputState,/,
  );
});

test("BuddyWidget does not recover paused runs as chat-resumable prompts after session activation", () => {
  assert.doesNotMatch(componentSource, /findLatestRecoverablePausedRunMessage/);
  assert.doesNotMatch(componentSource, /isRecoverablePausedRunStatus/);
  assert.doesNotMatch(componentSource, /chatSessionActivationGeneration/);
  assert.doesNotMatch(chatSessionsSource, /chatSessionActivationGeneration/);
  assert.doesNotMatch(componentSource, /const activationGeneration = \+\+/);
  assert.doesNotMatch(chatSessionsSource, /const activationGeneration = \+\+/);
  assert.doesNotMatch(componentSource, /recoverPausedBuddyRunFromLoadedMessages/);
  assert.doesNotMatch(componentSource, /resetRunTraceForMessage\(candidate\.messageId\);/);
  assert.doesNotMatch(componentSource, /handleBuddyRunAwaitingHuman\(run,\s*candidate\.messageId\);/);
});

test("BuddyWidget keeps paused background runs from locking the chat queue", () => {
  assert.match(chatSessionsSource, /const isSessionSwitchLocked = computed\([\s\S]*activeRunId\.value !== null/);
  assert.doesNotMatch(componentSource, /isActiveTraceUnfinished\(\)/);
  assert.match(componentSource, /shouldHoldBuddyQueueDrain\(\{ hasPausedRun: Boolean\(pausedBuddyRun\.value\) \}\)/);
  assert.doesNotMatch(componentSource, /:disabled="Boolean\(pausedBuddyRun\)"/);
  assert.match(componentSource, /resolveBuddyComposerDecision\(\{[\s\S]*hasPausedRun: Boolean\(pausedBuddyRun\.value\),[\s\S]*isResumeBusy: pausedBuddyResumeBusy\.value/);
  assert.doesNotMatch(componentSource, /resumePausedBuddyRunFromChatReply/);
});

test("BuddyWidget can deny a pending permission approval from the pause card", () => {
  assert.doesNotMatch(componentSource, /function denyPausedBuddyPermissionApproval\(\)/);
  assert.doesNotMatch(componentSource, /buildBuddyConversationalPauseResumePayload/);
  assert.doesNotMatch(componentSource, /BuddyPauseCard/);
});

test("BuddyWidget shows pause context before asking for more input", () => {
  const producedTitleIndex = pauseCardSource.indexOf('t("buddy.pause.producedTitle")');
  const requiredTitleIndex = pauseCardSource.indexOf('t("buddy.pause.requiredTitle")');
  const pauseInputIndex = pauseCardSource.indexOf('class="buddy-widget__pause-input"');

  assert.notEqual(producedTitleIndex, -1);
  assert.notEqual(requiredTitleIndex, -1);
  assert.ok(producedTitleIndex < requiredTitleIndex);
  assert.ok(requiredTitleIndex < pauseInputIndex);
  assert.match(pauseCardSource, /pausedBuddyActionMode/);
  assert.match(pauseCardSource, /pausedBuddyTargetKey/);
  assert.match(pauseCardSource, /pausedBuddyInputText/);
  assert.match(pauseCardSource, /v-for="row in pausedBuddyRequiredRows"[\s\S]*class="buddy-widget__pause-row"/);
  assert.doesNotMatch(pauseCardSource, /<label[\s\S]*v-for="row in pausedBuddyRequiredRows"[\s\S]*class="buddy-widget__pause-input"/);
});

test("BuddyWidget does not render conversational pause UI inside chat", () => {
  assert.doesNotMatch(componentSource, /function scrollPausedBuddyCardIntoView\(\)/);
  assert.doesNotMatch(componentSource, /\.buddy-widget__pause-card/);
  assert.doesNotMatch(componentSource, /buildBuddyConversationalPausePrompt/);
  assert.doesNotMatch(componentSource, /await scrollPausedBuddyCardIntoView\(\)/);
});

test("BuddyWidget does not resume paused runs from the next chat reply", () => {
  assert.doesNotMatch(componentSource, /async function resumePausedBuddyRunFromChatReply/);
  assert.doesNotMatch(componentSource, /buildBuddyConversationalPauseResumePayload\(run,\s*graph,\s*userMessage\)/);
  assert.doesNotMatch(componentSource, /errorMessage\.value = t\("buddy\.pause\.useCard"\)/);
  assert.doesNotMatch(componentSource, /appendRunTraceEntry\("node\.started"/);
  assert.doesNotMatch(componentSource, /appendRunTraceEntry\("node\.completed"/);
});

test("BuddyWidget does not impose a whole-run polling timeout", () => {
  assert.doesNotMatch(componentSource, /RUN_POLL_TIMEOUT_MS/);
  assert.doesNotMatch(runEventStreamSource, /RUN_POLL_TIMEOUT_MS/);
  assert.match(runEventStreamSource, /export async function pollBuddyRunUntilFinished\([\s\S]*while \(true\) \{/);
  assert.match(runEventStreamSource, /export async function pollBuddyRunUntilFinished\([\s\S]*await waitForDelay\(intervalMs, signal\);/);
  assert.doesNotMatch(runEventStreamSource.match(/export async function pollBuddyRunUntilFinished[\s\S]*?\n\}/)?.[0] ?? "", /buddy\.runTimeout/);
});
