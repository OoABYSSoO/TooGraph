import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "BuddyWidget.vue"), "utf8");
const pauseCardSource = readFileSync(resolve(currentDirectory, "BuddyPauseCard.vue"), "utf8");

function extractCssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = componentSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

function extractFunctionBlock(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = componentSource.match(new RegExp(`function ${escapedName}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

function extractSourceBetween(startText: string, endText: string) {
  const startIndex = componentSource.indexOf(startText);
  const endIndex = componentSource.indexOf(endText, startIndex + startText.length);
  if (startIndex === -1 || endIndex === -1) {
    return "";
  }
  return componentSource.slice(startIndex, endIndex);
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

test("BuddyWidget runs one weighted idle animation at a time while the panel is closed and the buddy is idle", () => {
  assert.match(componentSource, /type BuddyMascotMotion = "idle" \| "roam" \| "hop";/);
  assert.match(componentSource, /type BuddyMascotFacing = "front" \| "left" \| "right";/);
  assert.match(componentSource, /type BuddyIdleAnimationAction = "tail-switch" \| "random-move" \| "virtual-cursor-orbit" \| "virtual-cursor-chase";/);
  assert.match(componentSource, /type BuddyIdleRunOptions = \{ force\?: boolean \};/);
  assert.match(componentSource, /const BUDDY_IDLE_ANIMATION_MIN_DELAY_MS = 5000;/);
  assert.match(componentSource, /const BUDDY_IDLE_ANIMATION_MAX_DELAY_MS = 10000;/);
  assert.match(componentSource, /const BUDDY_IDLE_ANIMATION_ACTIONS: BuddyIdleAnimationAction\[\] = \["tail-switch", "random-move", "virtual-cursor-orbit", "virtual-cursor-chase"\];/);
  assert.doesNotMatch(componentSource, /const BUDDY_ROAM_MOVE_DURATION_MS = /);
  assert.doesNotMatch(componentSource, /const BUDDY_ROAM_STEP_PAUSE_MS = /);
  assert.doesNotMatch(componentSource, /const BUDDY_MASCOT_HOP_DURATION_MS = /);
  assert.match(componentSource, /const BUDDY_ROAM_STEP_DISTANCE_PX = DEFAULT_BUDDY_SIZE\.width;/);
  assert.match(componentSource, /const BUDDY_ROAM_TARGET_MIN_DISTANCE_PX = DEFAULT_BUDDY_SIZE\.width;/);
  assert.match(componentSource, /const BUDDY_ROAM_TARGET_MAX_DISTANCE_PX = DEFAULT_BUDDY_SIZE\.width \* 3;/);
  assert.match(componentSource, /const mascotMotion = ref<BuddyMascotMotion>\("idle"\);/);
  assert.match(componentSource, /const mascotFacing = ref<BuddyMascotFacing>\("front"\);/);
  assert.match(componentSource, /const tailSwitchNonce = ref\(0\);/);
  assert.match(componentSource, /const canBuddyRoam = computed\(\(\) =>/);
  assert.match(componentSource, /!isPanelOpen\.value/);
  assert.match(componentSource, /mood\.value === "idle"/);
  assert.match(componentSource, /!isMascotDragging\.value/);
  assert.match(componentSource, /watch\(canBuddyRoam/);
  assert.match(componentSource, /scheduleBuddyRoam\(\);/);
  assert.match(componentSource, /cancelBuddyRoamTimers\(\);/);
  assert.match(componentSource, /motionConfig: buddyMascotMotionConfig/);
  assert.match(componentSource, /const mascotMoveDurationMs = ref\(buddyMascotMotionConfig\.value\.moveDurationMs\);/);
  assert.match(componentSource, /"--buddy-widget-roam-duration-ms": `\$\{mascotMoveDurationMs\.value\}ms`/);
  assert.match(componentSource, /"--buddy-widget-hop-duration-ms": `\$\{mascotMoveDurationMs\.value\}ms`/);
  assert.match(componentSource, /function resolveMascotMoveDurationMs\(mode: "fixed" \| "random"\)/);
  assert.match(componentSource, /const baseDurationMs = buddyMascotMotionConfig\.value\.moveDurationMs;/);
  assert.match(componentSource, /return Math\.round\(randomBetween\(baseDurationMs, baseDurationMs \* 2\)\);/);
  assert.match(componentSource, /function chooseBuddyIdleAnimationAction\(\): BuddyIdleAnimationAction/);
  assert.match(componentSource, /BUDDY_IDLE_ANIMATION_ACTIONS\[Math\.floor\(Math\.random\(\) \* BUDDY_IDLE_ANIMATION_ACTIONS\.length\)\]/);
  assert.match(componentSource, /function canRunBuddyIdleAnimation\(options: BuddyIdleRunOptions = \{\}\)/);
  assert.match(componentSource, /return options\.force \|\| canBuddyRoam\.value;/);
  assert.match(componentSource, /function runBuddyIdleAnimation\(\)/);
  assert.match(componentSource, /const action = chooseBuddyIdleAnimationAction\(\);/);
  assert.match(componentSource, /case "tail-switch":[\s\S]*runBuddyIdleTailSwitch\(buddyRoamSequenceId\);/);
  assert.match(componentSource, /case "random-move":[\s\S]*runBuddyIdleRoam\(buddyRoamSequenceId\);/);
  assert.match(componentSource, /case "virtual-cursor-orbit":[\s\S]*runBuddyIdleVirtualCursorOrbit\(buddyRoamSequenceId\);/);
  assert.match(componentSource, /case "virtual-cursor-chase":[\s\S]*runBuddyIdleVirtualCursorChase\(buddyRoamSequenceId\);/);
  assert.match(componentSource, /function finishBuddyIdleAnimation\(sequenceId: number\)[\s\S]*scheduleBuddyRoam\(\);/);
  assert.match(componentSource, /const motionDurationMs = resolveMascotMoveDurationMs\("random"\);[\s\S]*mascotMoveDurationMs\.value = motionDurationMs;[\s\S]*\}, motionDurationMs\);/);
  assert.match(componentSource, /\}, buddyMascotMotionConfig\.value\.stepPauseMs\);/);
  assert.match(extractCssBlock(".buddy-widget__anchor--roaming"), /var\(--buddy-widget-roam-duration-ms,\s*360ms\) cubic-bezier\(0\.2,\s*1\.05,\s*0\.32,\s*1\)/);
  assert.match(componentSource, /const avatarHopCycle = ref\(0\);/);
  assert.match(componentSource, /function restartAvatarHopAnimation\(\)/);
  assert.match(componentSource, /avatarHopCycle\.value \+= 1;/);
  assert.match(componentSource, /'buddy-widget__avatar--hop-cycle-a': avatarHopCycle % 2 === 0/);
  assert.match(componentSource, /'buddy-widget__avatar--hop-cycle-b': avatarHopCycle % 2 === 1/);
  assert.match(extractCssBlock(".buddy-widget__avatar--roaming.buddy-widget__avatar--hop-cycle-a"), /buddy-widget-avatar-hop-path-a var\(--buddy-widget-roam-duration-ms,\s*360ms\) cubic-bezier\(0\.2,\s*1\.05,\s*0\.32,\s*1\) both/);
  assert.match(extractCssBlock(".buddy-widget__avatar--roaming.buddy-widget__avatar--hop-cycle-b"), /buddy-widget-avatar-hop-path-b var\(--buddy-widget-roam-duration-ms,\s*360ms\) cubic-bezier\(0\.2,\s*1\.05,\s*0\.32,\s*1\) both/);
  assert.match(extractCssBlock(".buddy-widget__avatar--hopping.buddy-widget__avatar--hop-cycle-a"), /buddy-widget-avatar-hop-path-a var\(--buddy-widget-hop-duration-ms,\s*360ms\) cubic-bezier\(0\.2,\s*1\.05,\s*0\.32,\s*1\) both/);
  assert.match(extractCssBlock(".buddy-widget__avatar--hopping.buddy-widget__avatar--hop-cycle-b"), /buddy-widget-avatar-hop-path-b var\(--buddy-widget-hop-duration-ms,\s*360ms\) cubic-bezier\(0\.2,\s*1\.05,\s*0\.32,\s*1\) both/);
  assert.match(componentSource, /@keyframes buddy-widget-avatar-hop-path-a/);
  assert.match(componentSource, /@keyframes buddy-widget-avatar-hop-path-b/);
});

test("BuddyWidget schedules random hop movement without jump-turn spin actions", () => {
  assert.match(componentSource, /let buddyRoamTimerId: number \| null = null;/);
  assert.match(componentSource, /let buddyRoamMotionTimerId: number \| null = null;/);
  assert.match(componentSource, /let buddyRoamStepTimerId: number \| null = null;/);
  assert.match(componentSource, /let buddyRoamTargetPosition: BuddyPosition \| null = null;/);
  assert.match(componentSource, /let buddyRoamSequenceId = 0;/);
  assert.match(componentSource, /function scheduleBuddyRoam\(\)/);
  assert.match(componentSource, /randomBetween\(BUDDY_IDLE_ANIMATION_MIN_DELAY_MS, BUDDY_IDLE_ANIMATION_MAX_DELAY_MS\)/);
  assert.match(componentSource, /function runBuddyIdleRoam\(sequenceId: number, options: BuddyIdleRunOptions = \{\}\)/);
  assert.match(componentSource, /buddyRoamTargetPosition = resolveBuddyRoamTargetPosition\(\);/);
  assert.match(componentSource, /runBuddyRoamStep\(sequenceId, options\);/);
  assert.match(componentSource, /function runBuddyRoamStep\(sequenceId: number, options: BuddyIdleRunOptions = \{\}\)/);
  assert.match(componentSource, /const nextPosition = resolveBuddyRoamStepPosition\(position\.value, targetPosition\);/);
  assert.match(componentSource, /restartAvatarHopAnimation\(\);[\s\S]*mascotFacing\.value = resolveBuddyRoamFacing\(nextPosition\.x - position\.value\.x\);/);
  assert.match(componentSource, /mascotFacing\.value = resolveBuddyRoamFacing\(nextPosition\.x - position\.value\.x\);/);
  assert.match(componentSource, /buddyRoamStepTimerId = window\.setTimeout\(\(\) => \{[\s\S]*runBuddyRoamStep\(sequenceId, options\);[\s\S]*\}, buddyMascotMotionConfig\.value\.stepPauseMs\);/);
  assert.match(componentSource, /function resolveBuddyRoamStepPosition\(currentPosition: BuddyPosition, targetPosition: BuddyPosition\): BuddyPosition/);
  assert.match(componentSource, /if \(distance <= BUDDY_ROAM_STEP_DISTANCE_PX\) \{/);
  assert.match(componentSource, /currentPosition\.x \+ \(deltaX \/ distance\) \* BUDDY_ROAM_STEP_DISTANCE_PX/);
  assert.match(componentSource, /function resolveBuddyRoamFacing\(deltaX: number\): BuddyMascotFacing/);
  assert.match(componentSource, /function isBuddyRoamTargetReached\(currentPosition: BuddyPosition, targetPosition: BuddyPosition\)/);
  assert.match(componentSource, /'buddy-widget__avatar--hopping': mascotMotion === 'hop'/);
  assert.doesNotMatch(componentSource, /BUDDY_ROAM_SPIN_CHANCE/);
  assert.doesNotMatch(componentSource, /BUDDY_ROAM_SPIN_DURATION_MS/);
  assert.doesNotMatch(componentSource, /function runBuddyIdleSpin\(\)/);
  assert.doesNotMatch(componentSource, /mascotMotion\.value = "spin";/);
  assert.match(componentSource, /persistPosition\(\);/);
  assert.doesNotMatch(extractFunctionBlock("runBuddyRoamStep"), /persistPosition\(\);/);
});

test("BuddyWidget exposes debug triggers for each idle animation and stops virtual cursor animation on buddy click", () => {
  assert.match(componentSource, /case "idle-tail-switch":[\s\S]*runBuddyIdleTailSwitch\(\+\+buddyRoamSequenceId\);/);
  assert.match(componentSource, /case "idle-random-move":[\s\S]*mood\.value = "idle";[\s\S]*runBuddyIdleRoam\(\+\+buddyRoamSequenceId, \{ force: true \}\);/);
  assert.match(componentSource, /case "idle-virtual-cursor-orbit":[\s\S]*mood\.value = "idle";[\s\S]*runBuddyIdleVirtualCursorOrbit\(\+\+buddyRoamSequenceId, \{ force: true \}\);/);
  assert.match(componentSource, /case "idle-virtual-cursor-chase":[\s\S]*mood\.value = "idle";[\s\S]*runBuddyIdleVirtualCursorChase\(\+\+buddyRoamSequenceId, \{ force: true \}\);/);
  assert.match(componentSource, /function handleAvatarClick\(\)[\s\S]*stopBuddyIdleAnimation\(\{ closeVirtualCursor: true \}\);/);
  assert.match(componentSource, /function handleAvatarClick\(\)[\s\S]*if \(mood\.value === "error"\) \{[\s\S]*mood\.value = "idle";/);
  assert.match(componentSource, /function stopBuddyIdleAnimation\(options: \{ closeVirtualCursor\?: boolean \} = \{\}\)/);
  assert.match(componentSource, /buddyMascotDebugStore\.setVirtualCursorEnabled\(false\);/);
});

test("BuddyWidget tracks the pointer direction for the mascot eyes with animation-frame throttling", () => {
  assert.match(componentSource, /ref="avatarElement"/);
  assert.match(componentSource, /const avatarElement = ref<HTMLElement \| null>\(null\);/);
  assert.match(componentSource, /const mascotLook = ref\(\{ x: 0, y: 0 \}\);/);
  assert.match(componentSource, /let mascotLookFrameId: number \| null = null;/);
  assert.match(componentSource, /window\.addEventListener\("pointermove", handleMascotLookPointerMove, \{ passive: true \}\);/);
  assert.match(componentSource, /window\.removeEventListener\("pointermove", handleMascotLookPointerMove\);/);
  assert.match(componentSource, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(componentSource, /getBoundingClientRect\(\)/);
  assert.match(componentSource, /Math\.hypot\(deltaX, deltaY\)/);
  assert.match(componentSource, /mascotLook\.value = \{ x: deltaX \/ distance, y: deltaY \/ distance \};/);
  assert.match(componentSource, /cancelMascotLookFrame\(\);/);
});

test("BuddyWidget tracks dragging and click pulses for mascot animation", () => {
  assert.match(componentSource, /const isDragging = computed\(\(\) => Boolean\(pointerDrag\.value\?\.moved\)\);/);
  assert.match(componentSource, /const debugDragging = ref\(false\);/);
  assert.match(componentSource, /const isMascotDragging = computed\(\(\) => isDragging\.value \|\| debugDragging\.value\);/);
  assert.match(componentSource, /const tapNonce = ref\(0\);/);
  assert.match(componentSource, /tapNonce\.value \+= 1;/);
});

test("BuddyWidget listens for mascot debug actions requested from the Buddy page", () => {
  assert.match(componentSource, /import type \{ BuddyMascotDebugAction \} from "\.\/buddyMascotDebug\.ts";/);
  assert.match(componentSource, /import \{[\s\S]*useBuddyMascotDebugStore[\s\S]*\} from "\.\.\/stores\/buddyMascotDebug\.ts";/);
  assert.match(componentSource, /const buddyMascotDebugStore = useBuddyMascotDebugStore\(\);/);
  assert.match(componentSource, /latestRequest: mascotDebugRequest,[\s\S]*motionConfig: buddyMascotMotionConfig,[\s\S]*virtualCursorEnabled,[\s\S]*= storeToRefs\(buddyMascotDebugStore\);/);
  assert.match(componentSource, /watch\(mascotDebugRequest,\s*\(request\) => \{/);
  assert.match(componentSource, /triggerMascotDebugAction\(request\.action\);/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__debug-panel"/);
  assert.doesNotMatch(componentSource, /shouldShowMascotDebugPanel/);
});

test("BuddyWidget renders a draggable virtual cursor and makes the mascot follow it", () => {
  const activateVirtualCursorBlock = extractFunctionBlock("activateVirtualCursor");
  const startVirtualCursorLaunchBlock = extractFunctionBlock("startVirtualCursorLaunch");
  const startVirtualCursorReturnBlock = extractFunctionBlock("startVirtualCursorReturn");
  assert.match(componentSource, /latestRequest: mascotDebugRequest,[\s\S]*motionConfig: buddyMascotMotionConfig,[\s\S]*virtualCursorEnabled,[\s\S]*= storeToRefs\(buddyMascotDebugStore\);/);
  assert.match(componentSource, /type VirtualCursorPhase = "hidden" \| "launching" \| "active" \| "returning";/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS = 360;/);
  assert.match(componentSource, /const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_PERIOD_MS = 1600;/);
  assert.match(componentSource, /const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX = BUDDY_VIRTUAL_CURSOR_SIZE\.width \* 0\.86;/);
  assert.match(componentSource, /const BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX = BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX \* 0\.62;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS = 180;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS = 120;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_MIN_FLIGHT_DURATION_MS = 140;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_MAX_FLIGHT_DURATION_MS = 6000;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE = 0\.72;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE = 1;/);
  assert.match(componentSource, /const VIRTUAL_CURSOR_STAR_PATH =/);
  assert.match(componentSource, /const VIRTUAL_CURSOR_SHAPE_PATH =/);
  assert.match(componentSource, /v-if="isVirtualCursorRendered"/);
  assert.match(componentSource, /class="buddy-widget__virtual-cursor"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__virtual-cursor-follow-range"/);
  assert.doesNotMatch(componentSource, /virtualCursorFollowRangeStyle/);
  assert.doesNotMatch(componentSource, /shouldShowVirtualCursorFollowRange/);
  assert.match(componentSource, /class="buddy-widget__virtual-cursor-svg"/);
  assert.match(componentSource, /viewBox="-80 -80 160 160"/);
  assert.match(componentSource, /class="buddy-widget__virtual-cursor-shape"/);
  assert.match(componentSource, /:d="virtualCursorPath"/);
  assert.match(componentSource, /ref="virtualCursorAnimateElement"/);
  assert.match(componentSource, /:values="virtualCursorMorphAnimation\.values"/);
  assert.match(componentSource, /:style="virtualCursorStyle"/);
  assert.match(componentSource, /@pointerdown="handleVirtualCursorPointerDown"/);
  assert.match(componentSource, /const isVirtualCursorRendered = computed\(\(\) => virtualCursorPhase\.value !== "hidden"\);/);
  assert.match(componentSource, /const virtualCursorPosition = ref/);
  assert.match(componentSource, /const virtualCursorPhase = ref<VirtualCursorPhase>\("hidden"\);/);
  assert.match(componentSource, /const virtualCursorPath = ref\(VIRTUAL_CURSOR_STAR_PATH\);/);
  assert.match(componentSource, /const virtualCursorMorphAnimation = ref/);
  assert.match(componentSource, /const virtualCursorAngleDeg = ref\(BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG\);/);
  assert.match(componentSource, /const virtualCursorScale = ref\(BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE\);/);
  assert.match(componentSource, /const virtualCursorMoveDurationMs = ref\(BUDDY_VIRTUAL_CURSOR_MOVE_TRANSITION_MS\);/);
  assert.match(componentSource, /const virtualCursorRotateDurationMs = ref\(BUDDY_VIRTUAL_CURSOR_ROTATE_TRANSITION_MS\);/);
  assert.match(componentSource, /const virtualCursorDetached = ref\(false\);/);
  assert.match(componentSource, /const virtualCursorDragging = ref\(false\);/);
  assert.match(componentSource, /const virtualCursorStyle = computed/);
  assert.match(componentSource, /"--buddy-widget-virtual-cursor-morph-duration-ms": `\$\{BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS\}ms`/);
  assert.match(componentSource, /"--buddy-widget-virtual-cursor-move-duration-ms": `\$\{virtualCursorMoveDurationMs\.value\}ms`/);
  assert.match(componentSource, /"--buddy-widget-virtual-cursor-rotate-duration-ms": `\$\{virtualCursorRotateDurationMs\.value\}ms`/);
  assert.match(componentSource, /"--buddy-widget-virtual-cursor-angle": `\$\{virtualCursorAngleDeg\.value\}deg`/);
  assert.match(componentSource, /"--buddy-widget-virtual-cursor-scale": virtualCursorScale\.value,/);
  assert.match(componentSource, /const shouldFloatVirtualCursor = computed\(\(\) =>/);
  assert.match(componentSource, /virtualCursorPhase\.value === "active" && !virtualCursorDragging\.value && virtualCursorIdleActionMode\.value === "none"/);
  assert.match(componentSource, /translate: `\$\{virtualCursorPosition\.value\.x\}px \$\{virtualCursorPosition\.value\.y\}px`/);
  assert.match(componentSource, /rotate: "var\(--buddy-widget-virtual-cursor-angle\)"/);
  assert.match(componentSource, /let virtualCursorDrag: \{/);
  assert.match(componentSource, /let virtualCursorTransitionTimerId: number \| null = null;/);
  assert.match(componentSource, /let virtualCursorTransitionFrameId: number \| null = null;/);
  assert.match(componentSource, /let virtualCursorAngleFrameTimestampMs: number \| null = null;/);
  assert.match(componentSource, /function handleVirtualCursorPointerDown\(event: PointerEvent\)/);
  assert.match(componentSource, /if \(virtualCursorPhase\.value !== "active"\) \{/);
  assert.match(componentSource, /virtualCursorDetached\.value = true;/);
  assert.match(componentSource, /virtualCursorDragging\.value = true;/);
  assert.match(componentSource, /buddy-widget__virtual-cursor--docked/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--launching': virtualCursorPhase === 'launching'/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--returning': virtualCursorPhase === 'returning'/);
  assert.match(componentSource, /'buddy-widget__virtual-cursor--floating': shouldFloatVirtualCursor/);
  assert.match(componentSource, /function handleVirtualCursorPointerMove\(event: PointerEvent\)/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG = -36;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG = 0;/);
  assert.match(componentSource, /watch\(virtualCursorEnabled, \(enabled\) => \{[\s\S]*activateVirtualCursor\(\);[\s\S]*deactivateVirtualCursor\(\);/);
  assert.match(componentSource, /function deactivateVirtualCursor\(\)[\s\S]*startVirtualCursorReturn\(\);/);
  assert.match(startVirtualCursorLaunchBlock, /virtualCursorPhase\.value = "launching";/);
  assert.match(startVirtualCursorLaunchBlock, /virtualCursorScale\.value = BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE;/);
  assert.match(startVirtualCursorLaunchBlock, /virtualCursorPath\.value = VIRTUAL_CURSOR_STAR_PATH;/);
  assert.match(startVirtualCursorLaunchBlock, /virtualCursorScale\.value = BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE;/);
  assert.match(startVirtualCursorLaunchBlock, /resolveVirtualCursorLaunchPosition\(viewport\.value, position\.value\)/);
  assert.match(startVirtualCursorReturnBlock, /virtualCursorPhase\.value = "returning";/);
  assert.match(startVirtualCursorReturnBlock, /virtualCursorScale\.value = BUDDY_VIRTUAL_CURSOR_ACTIVE_SCALE;/);
  assert.match(startVirtualCursorReturnBlock, /virtualCursorPath\.value = VIRTUAL_CURSOR_SHAPE_PATH;/);
  assert.match(startVirtualCursorReturnBlock, /virtualCursorAngleDeg\.value = BUDDY_VIRTUAL_CURSOR_STAR_ANGLE_DEG;/);
  assert.match(startVirtualCursorReturnBlock, /virtualCursorScale\.value = BUDDY_VIRTUAL_CURSOR_DOCKED_SCALE;/);
  assert.match(startVirtualCursorReturnBlock, /moveVirtualCursorTo\(dockedPosition, \{ updateAngle: false \}\)/);
  assert.match(componentSource, /function startVirtualCursorMorph\(fromPath: string, toPath: string\)/);
  assert.match(componentSource, /function resolveVirtualCursorLaunchPosition\(currentViewport: \{ width: number; height: number \}, buddyPosition: BuddyPosition\): BuddyPosition/);
  assert.match(componentSource, /const horizontalDirection = resolveBoxCenter\(buddyPosition, DEFAULT_BUDDY_SIZE\)\.x > currentViewport\.width \/ 2 \? -1 : 1;/);
  assert.match(componentSource, /function resolveVirtualCursorFlightAngle\(fromPosition: BuddyPosition, toPosition: BuddyPosition\): number/);
  assert.match(componentSource, /Math\.atan2\(deltaY, deltaX\) \* \(180 \/ Math\.PI\) \+ 90/);
  assert.match(componentSource, /function moveVirtualCursorTo\([\s\S]*nextPosition: BuddyPosition,[\s\S]*options: \{ updateAngle\?: boolean; durationMs\?: number; rotateDurationMs\?: number; angleDeg\?: number; smoothAngle\?: boolean \} = \{\},[\s\S]*\)/);
  assert.match(componentSource, /const currentPosition = virtualCursorPosition\.value;/);
  assert.match(componentSource, /setVirtualCursorMoveTransitionDuration\(options\.durationMs \?\? resolveVirtualCursorMoveDurationMs\(currentPosition, nextPosition\)\);/);
  assert.match(componentSource, /setVirtualCursorRotateTransitionDuration\(options\.rotateDurationMs \?\? resolveVirtualCursorRotateDurationMs\(targetAngleDeg\)\);/);
  assert.match(componentSource, /const targetAngleDeg = options\.angleDeg \?\? resolveVirtualCursorFlightAngle\(currentPosition, nextPosition\);/);
  assert.match(componentSource, /if \(options\.updateAngle !== false\) \{[\s\S]*virtualCursorAngleDeg\.value = options\.smoothAngle[\s\S]*resolveSmoothedVirtualCursorAngle\(targetAngleDeg\)[\s\S]*resolveContinuousVirtualCursorAngle\(targetAngleDeg\);[\s\S]*\}/);
  assert.match(componentSource, /function resolveVirtualCursorMoveDurationMs\(fromPosition: BuddyPosition, toPosition: BuddyPosition\)/);
  assert.match(componentSource, /distance \* 1000 \/ buddyMascotMotionConfig\.value\.virtualCursorFlightSpeedPxPerS/);
  assert.match(componentSource, /function setVirtualCursorMoveTransitionDuration\(durationMs: number\)/);
  assert.match(componentSource, /function setVirtualCursorRotateTransitionDuration\(durationMs: number\)/);
  assert.match(componentSource, /function resolveVirtualCursorRotateDurationMs\(targetAngleDeg: number\)/);
  assert.match(componentSource, /function resolveContinuousVirtualCursorAngle\(targetAngleDeg: number\)/);
  assert.match(componentSource, /function resolveSmoothedVirtualCursorAngle\(targetAngleDeg: number\)/);
  assert.match(componentSource, /buddyMascotMotionConfig\.value\.virtualCursorRotationSpeedDegPerS \* elapsedMs \/ 1000/);
  assert.match(componentSource, /function settleVirtualCursorRotation\(\)/);
  assert.match(componentSource, /virtualCursorAngleDeg\.value = BUDDY_VIRTUAL_CURSOR_RESTING_ANGLE_DEG;/);
  assert.match(componentSource, /virtualCursorDragging\.value = false;/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor--floating .buddy-widget__virtual-cursor-svg"), /animation:\s*buddy-widget-virtual-cursor-float 1\.5s ease-in-out infinite;/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor-svg"), /scale:\s*var\(--buddy-widget-virtual-cursor-scale\);/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor-svg"), /transition:\s*scale 160ms cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\);/);
  assert.match(componentSource, /\.buddy-widget__virtual-cursor--launching\s*\{[\s\S]*translate var\(--buddy-widget-virtual-cursor-morph-duration-ms,\s*360ms\)[\s\S]*rotate 120ms ease/);
  assert.match(componentSource, /\.buddy-widget__virtual-cursor--returning\s*\{[\s\S]*translate var\(--buddy-widget-virtual-cursor-morph-duration-ms,\s*360ms\)[\s\S]*filter 140ms ease/);
  assert.match(componentSource, /\.buddy-widget__virtual-cursor--launching \.buddy-widget__virtual-cursor-svg,\s*\.buddy-widget__virtual-cursor--returning \.buddy-widget__virtual-cursor-svg\s*\{[\s\S]*scale var\(--buddy-widget-virtual-cursor-morph-duration-ms,\s*360ms\)/);
  assert.doesNotMatch(extractCssBlock(".buddy-widget__virtual-cursor--returning"), /rotate 120ms/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor--returning .buddy-widget__virtual-cursor-shape"), /stroke-width:\s*0;/);
  assert.match(componentSource, /@keyframes buddy-widget-virtual-cursor-float[\s\S]*translateY\(-4px\) rotate\(-2deg\)/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor"), /transform-origin:\s*50% 58%;/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor"), /drop-shadow\(0 0 8px rgba\(242,\s*201,\s*104,\s*0\.32\)\)/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor"), /translate var\(--buddy-widget-virtual-cursor-move-duration-ms,\s*180ms\) linear/);
  assert.match(extractCssBlock(".buddy-widget__virtual-cursor"), /rotate var\(--buddy-widget-virtual-cursor-rotate-duration-ms,\s*120ms\) ease/);
  assert.doesNotMatch(extractCssBlock(".buddy-widget__virtual-cursor"), /scaleX|rotateY/);
  assert.match(componentSource, /function requestBuddyFollowVirtualCursor\(\)/);
  assert.match(componentSource, /function runBuddyVirtualCursorFollowStep\(sequenceId: number\)/);
  assert.match(componentSource, /resolveBuddyVirtualCursorFollowTargetPosition/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_FOLLOW_TARGET_REACHED_DISTANCE_PX = 12;/);
  assert.match(componentSource, /function isBuddyVirtualCursorFollowTargetReached\(currentPosition: BuddyPosition, targetPosition: BuddyPosition\)/);
  assert.match(componentSource, /function resolveVirtualCursorFollowTargetDistancePx\(\)/);
  assert.match(componentSource, /resolveVirtualCursorFollowMaxDistancePx\(\) \* 0\.72/);
  assert.match(componentSource, /const followTargetDistancePx = resolveVirtualCursorFollowTargetDistancePx\(\);/);
  assert.match(componentSource, /function resolveCurrentVirtualCursorTrackingPosition\(\)/);
  assert.match(componentSource, /function resolveVirtualCursorFollowMaxDistancePx\(\)/);
  assert.match(activateVirtualCursorBlock, /cancelMascotLookFrame\(\);/);
  assert.match(activateVirtualCursorBlock, /pendingMascotLookPointer = null;/);
  assert.match(activateVirtualCursorBlock, /startVirtualCursorLaunch\(\);/);
});

test("BuddyWidget keeps virtual-cursor follow jumps from being flattened by slow cursor drags", () => {
  assert.match(componentSource, /let buddyVirtualCursorIdleFrameId: number \| null = null;/);
  assert.match(componentSource, /let virtualCursorFlightFrameId: number \| null = null;/);
  assert.match(componentSource, /let virtualCursorFlightTrackingFrameId: number \| null = null;/);
  assert.match(componentSource, /let virtualCursorFlightTracking: \{/);
  assert.match(componentSource, /let virtualCursorTrackingPosition: BuddyPosition \| null = null;/);
  assert.match(componentSource, /const BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_LAP_DURATION_MS = 1200;/);
  assert.doesNotMatch(componentSource, /BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_DURATION_MS/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS = 80;/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_CURSOR_FLIGHT_SETTLE_MS = 80;/);
  assert.match(componentSource, /function cancelBuddyVirtualCursorIdleFrame\(\)/);
  assert.match(componentSource, /function clearVirtualCursorFlightFrame\(\)/);
  assert.match(componentSource, /window\.cancelAnimationFrame\(virtualCursorFlightFrameId\);/);
  assert.match(componentSource, /function clearVirtualCursorFlightTracking\(\)/);
  assert.match(componentSource, /function startVirtualCursorFlightTracking\(fromPosition: BuddyPosition, toPosition: BuddyPosition, durationMs: number\)/);
  assert.match(componentSource, /function runVirtualCursorFlightTrackingFrame\(\)/);
  assert.match(componentSource, /virtualCursorTrackingPosition = interpolateBuddyPosition\(/);
  assert.match(componentSource, /requestBuddyFollowVirtualCursor\(\);/);
  assert.match(componentSource, /function runBuddyIdleVirtualCursorOrbitFrame\(sequenceId: number, startedAtMs: number, startAngle: number\)/);
  assert.match(componentSource, /elapsedMs \/ BUDDY_IDLE_VIRTUAL_CURSOR_ORBIT_LAP_DURATION_MS/);
  assert.match(componentSource, /if \(Math\.random\(\) < 0\.5\) \{[\s\S]*finishBuddyIdleVirtualCursorAction\(sequenceId\);[\s\S]*return;[\s\S]*\}[\s\S]*runBuddyIdleVirtualCursorOrbitFrame\(sequenceId, performance\.now\(\), startAngle\);/);
  assert.match(componentSource, /function scheduleVirtualCursorIdleActionStart\(sequenceId: number, callback: \(\) => void\)/);
  assert.match(componentSource, /virtualCursorPhase\.value === "active"\s*\?\s*BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS\s*:\s*BUDDY_VIRTUAL_CURSOR_MORPH_DURATION_MS \+ BUDDY_VIRTUAL_CURSOR_READY_FRAME_DELAY_MS/);
  assert.match(componentSource, /runBuddyIdleVirtualCursorOrbit\(sequenceId: number[\s\S]*scheduleVirtualCursorIdleActionStart\(sequenceId, \(\) => \{[\s\S]*runBuddyIdleVirtualCursorOrbitFrame\(sequenceId, performance\.now\(\), resolveVirtualCursorOrbitAngle\(virtualCursorPosition\.value\)\);/);
  assert.match(componentSource, /runBuddyIdleVirtualCursorChase\(sequenceId: number[\s\S]*scheduleVirtualCursorIdleActionStart\(sequenceId, \(\) => \{[\s\S]*moveBuddyIdleVirtualCursorChaseTarget\(sequenceId\);/);
  assert.match(componentSource, /window\.requestAnimationFrame\(\(\) => runBuddyIdleVirtualCursorOrbitFrame\(sequenceId, startedAtMs, startAngle\)\)/);
  assert.match(componentSource, /function resolveVirtualCursorOrbitTangentAngle\(angle: number\)/);
  assert.match(componentSource, /moveVirtualCursorTo\(resolveVirtualCursorOrbitPosition\(angle\), \{[\s\S]*angleDeg: resolveVirtualCursorOrbitTangentAngle\(angle\),[\s\S]*durationMs: 0,[\s\S]*rotateDurationMs: 0,[\s\S]*\}\);/);
  assert.match(componentSource, /function runBuddyIdleVirtualCursorChaseLoop\(sequenceId: number, centerPosition: BuddyPosition, startedAtMs: number\)/);
  assert.match(componentSource, /BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_PERIOD_MS/);
  assert.match(componentSource, /BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX/);
  assert.match(componentSource, /BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX/);
  assert.match(componentSource, /function resolveVirtualCursorChaseLoopTangentAngle\(angle: number\)/);
  assert.match(componentSource, /Math\.cos\(angle\) \* BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX/);
  assert.match(componentSource, /Math\.cos\(angle \* 2\) \* BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX \* 2/);
  assert.match(componentSource, /function moveVirtualCursorToWithArmedTransition\(/);
  assert.match(componentSource, /clearVirtualCursorFlightFrame\(\);[\s\S]*setVirtualCursorMoveTransitionDuration\(durationMs\);[\s\S]*setVirtualCursorRotateTransitionDuration\(rotateDurationMs\);[\s\S]*virtualCursorFlightFrameId = window\.requestAnimationFrame/);
  assert.match(componentSource, /const flightWaitMs = moveVirtualCursorToWithArmedTransition\(targetPosition, \{ durationMs: flightDurationMs \}\);/);
  assert.match(componentSource, /buddyRoamMotionTimerId = window\.setTimeout\(\(\) => \{[\s\S]*runBuddyIdleVirtualCursorChaseLoop\(sequenceId, targetPosition, performance\.now\(\)\);[\s\S]*\}, flightWaitMs\);/);
  assert.doesNotMatch(
    extractSourceBetween("function moveBuddyIdleVirtualCursorChaseTarget", "function runBuddyIdleVirtualCursorChaseLoop"),
    /updateMascotLookFromVirtualCursor\(\);[\s\S]*requestBuddyFollowVirtualCursor\(\);[\s\S]*runBuddyIdleVirtualCursorChaseLoop/,
  );
  assert.match(componentSource, /\}, flightWaitMs\);/);
  assert.doesNotMatch(componentSource, /moveVirtualCursorTo\(targetPosition, \{ durationMs: flightDurationMs \}\);/);
  assert.match(componentSource, /\{ durationMs: 0, rotateDurationMs: 0 \}/);
  assert.match(componentSource, /const chaseLoopHorizontalMarginPx = DEFAULT_BUDDY_MARGIN \+ BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_RADIUS_PX;/);
  assert.match(componentSource, /const chaseLoopVerticalMarginPx = DEFAULT_BUDDY_MARGIN \+ BUDDY_IDLE_VIRTUAL_CURSOR_CHASE_LOOP_Y_RADIUS_PX;/);
  assert.match(componentSource, /function clampVirtualCursorFramePosition\(positionValue: BuddyPosition\): BuddyPosition/);
  assert.match(componentSource, /watch\(canBuddyRoam, \(canRoam\) => \{[\s\S]*if \(virtualCursorIdleActionMode\.value !== "none"\) \{[\s\S]*return;[\s\S]*\}[\s\S]*cancelBuddyRoamTimers\(\);/);
  assert.match(componentSource, /if \(!wasFollowing && virtualCursorIdleActionMode\.value === "none"\) \{[\s\S]*cancelBuddyRoamTimers\(\);[\s\S]*\}/);
  assert.match(componentSource, /const isFollowingMotionActive = buddyVirtualCursorFollowMotionTimerId !== null;/);
  assert.match(componentSource, /if \(isBuddyVirtualCursorFollowTargetReached\(position\.value, targetPosition\)\) \{[\s\S]*if \(isFollowingMotionActive\) \{[\s\S]*buddyVirtualCursorFollowTargetPosition = targetPosition;[\s\S]*return;[\s\S]*\}/);
  assert.equal(extractCssBlock(".buddy-widget__virtual-cursor-follow-range"), "");
  assert.match(componentSource, /function finishBuddyVirtualCursorFollowSequence\(shouldPersistPosition: boolean\)[\s\S]*cancelBuddyVirtualCursorFollowTimers\(\);[\s\S]*mascotMotion\.value = "idle";/);
});

test("BuddyWidget lets the buddy pick up idle-created virtual cursors after catching them", () => {
  assert.match(componentSource, /let virtualCursorPickupPending = false;/);
  assert.match(componentSource, /function pickupVirtualCursor\(/);
  assert.match(componentSource, /runBuddyIdleVirtualCursorOrbit\(sequenceId: number[\s\S]*virtualCursorPickupPending = true;[\s\S]*buddyMascotDebugStore\.setVirtualCursorEnabled\(true\);/);
  assert.match(componentSource, /runBuddyIdleVirtualCursorChase\(sequenceId: number[\s\S]*virtualCursorPickupPending = true;[\s\S]*buddyMascotDebugStore\.setVirtualCursorEnabled\(true\);/);
  assert.match(componentSource, /if \(virtualCursorPickupPending && virtualCursorIdleActionMode\.value === "none" && virtualCursorEnabled\.value\) \{[\s\S]*pickupVirtualCursor\(\{ finishIdleAnimation: true \}\);[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /if \(virtualCursorIdleActionMode\.value === "chase"\) \{[\s\S]*if \(Math\.random\(\) < 0\.5\) \{[\s\S]*pickupVirtualCursor\(\{ sequenceId: buddyRoamSequenceId, finishIdleAnimation: true \}\);[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /function finishBuddyIdleVirtualCursorAction\(sequenceId: number\)[\s\S]*pickupVirtualCursor\(\{ sequenceId, finishIdleAnimation: true \}\);/);
});

test("BuddyWidget executes virtual UI operation events through the virtual cursor", () => {
  assert.match(componentSource, /import \{ resolveBuddyVirtualOperationPlanFromActivityEvent \} from "\.\/virtualOperationProtocol\.ts";/);
  assert.match(componentSource, /latestVirtualOperationRequest,/);
  assert.match(componentSource, /watch\(latestVirtualOperationRequest,\s*\(request\) => \{/);
  assert.match(componentSource, /executeVirtualOperationRequest\(request\);/);
  assert.match(componentSource, /eventType === "activity\.event"[\s\S]*handleBuddyVirtualUiOperationEvent\(payload\);/);
  assert.match(componentSource, /function handleBuddyVirtualUiOperationEvent\(payload: Record<string, unknown>\)/);
  assert.match(componentSource, /const operationPlan = resolveBuddyVirtualOperationPlanFromActivityEvent\(payload\);/);
  assert.match(componentSource, /buddyMascotDebugStore\.requestVirtualOperation\(operationPlan\);/);
  assert.match(componentSource, /function executeVirtualOperationRequest\(request: BuddyVirtualOperationRequest \| null\)/);
  assert.match(componentSource, /async function executeVirtualOperationCommands\(operationPlan:/);
  assert.match(componentSource, /for \(const operation of operationPlan\.operations\)/);
  assert.match(componentSource, /async function executeBuddyVirtualOperationCommand\(operation: BuddyVirtualOperation\)/);
  assert.match(componentSource, /case "focus":[\s\S]*executeBuddyVirtualFocusOperation/);
  assert.match(componentSource, /case "clear":[\s\S]*executeBuddyVirtualClearOperation/);
  assert.match(componentSource, /case "type":[\s\S]*executeBuddyVirtualTypeOperation/);
  assert.match(componentSource, /case "press":[\s\S]*executeBuddyVirtualPressOperation/);
  assert.match(componentSource, /case "wait":[\s\S]*executeBuddyVirtualWaitOperation/);
  assert.match(componentSource, /case "graph_edit":[\s\S]*executeBuddyVirtualGraphEditOperation/);
  assert.match(componentSource, /function executeBuddyVirtualClickOperation\(operation: BuddyVirtualOperation\)/);
  assert.match(componentSource, /async function executeBuddyVirtualGraphEditOperation\(operation: BuddyVirtualOperation\)/);
  assert.match(componentSource, /requestGraphEditPlaybackPlan\(\{[\s\S]*requestId,[\s\S]*graphEditIntents: operation\.graphEditIntents,[\s\S]*\}\);/);
  assert.match(componentSource, /window\.dispatchEvent\(new CustomEvent\("toograph:graph-edit-playback-plan-request", \{ detail \}\)\);/);
  assert.doesNotMatch(componentSource, /v-if="virtualGraphDragLine"/);
  assert.doesNotMatch(componentSource, /class="buddy-widget__graph-drag-line"/);
  assert.match(componentSource, /const playbackState = createGraphEditPlaybackUiState\(\);/);
  assert.match(componentSource, /await resolveGraphEditPlaybackStepElementWithRetry\(step, playbackState, token\)/);
  assert.match(componentSource, /executeGraphEditPlaybackDragStep\(step, targetElement, playbackState\)/);
  assert.match(componentSource, /function resolveGraphEditPlaybackStepElementWithRetry\([\s\S]*step: GraphEditPlaybackStep,[\s\S]*playbackState: GraphEditPlaybackUiState,[\s\S]*token: BuddyVirtualOperationToken \| null,[\s\S]*\)/);
  assert.match(componentSource, /const deadlineMs = Date\.now\(\) \+ BUDDY_GRAPH_EDIT_PLAYBACK_TARGET_WAIT_MS;/);
  assert.doesNotMatch(componentSource, /resolveGraphEditPlaybackStepElement\(step, playbackState\) \?\? affordance\?\.element/);
  assert.match(componentSource, /dispatchVirtualGraphDragPointerEvents\(resolvedStep, targetElement\)/);
  assert.match(componentSource, /dispatchVirtualPointerEvent\(targetElement, "pointerdown"/);
  assert.match(componentSource, /dispatchVirtualPointerEvent\(pointerSurface, "pointermove"/);
  assert.match(componentSource, /dispatchVirtualPointerEvent\(pointerSurface, "pointerup"/);
  assert.match(componentSource, /dispatchVirtualDoubleClick\(targetElement, resolveGraphEditPlaybackPositionClientPoint\(step\)\);/);
  assert.match(componentSource, /function resolveGraphEditPlaybackPositionClientPoint\(step: GraphEditPlaybackStep\): BuddyPosition \| null/);
  assert.match(componentSource, /async function typeVirtualText\(element: HTMLInputElement \| HTMLTextAreaElement, text: string\)/);
  assert.match(componentSource, /function shouldSkipGraphEditPlaybackTextStep\(/);
  assert.match(componentSource, /if \(step\.kind === "choose_node_type" && targetElement\) \{[\s\S]*const beforeNodeIds = listGraphEditPlaybackNodeAffordanceIds\(\);[\s\S]*dispatchVirtualClick\(targetElement\);[\s\S]*rememberCreatedNodeAlias\(step, beforeNodeIds, playbackState\);/);
  assert.match(componentSource, /if \(step\.kind === "commit_state_field" && targetElement\) \{[\s\S]*const beforeStateKeys = listGraphEditPlaybackPortStateKeys\(step, playbackState\);[\s\S]*dispatchVirtualClick\(targetElement\);[\s\S]*rememberCreatedStateAlias\(step, beforeStateKeys, playbackState\);/);
  assert.doesNotMatch(componentSource, /dispatchGraphEditPlaybackOpenMenu/);
  assert.doesNotMatch(componentSource, /toograph:graph-edit-playback-open-node-menu/);
  assert.doesNotMatch(componentSource, /dispatchGraphEditPlaybackApplyCommand/);
  assert.doesNotMatch(componentSource, /toograph:graph-edit-playback-apply-command/);
  assert.match(componentSource, /function resolveAliasedGraphEditPlaybackTarget\(targetId: string, playbackState: GraphEditPlaybackUiState\)/);
  assert.match(componentSource, /function resolveVirtualOperationAffordance\(targetId: string\)/);
  assert.match(componentSource, /const targetId = resolveAliasedGraphEditPlaybackTarget\(step\.target, playbackState\);/);
  assert.match(componentSource, /querySelectorAll<HTMLElement>\(`\[data-virtual-affordance-id="\$\{escapeVirtualOperationTargetId\(targetId\)\}"\]`\)/);
  assert.match(componentSource, /for \(const element of affordanceElements\) \{/);
  assert.match(componentSource, /if \(rect\.width <= 0 \|\| rect\.height <= 0\) \{[\s\S]*continue;/);
  assert.doesNotMatch(componentSource, /const element = document\.querySelector<HTMLElement>/);
  assert.doesNotMatch(componentSource, /"app\.nav\.buddy":/);
  assert.doesNotMatch(componentSource, /BUDDY_VIRTUAL_OPERATION_TARGET_SELECTORS/);
  assert.match(componentSource, /moveVirtualCursorToWithArmedTransition\(cursorPosition\)/);
  assert.match(componentSource, /dispatchVirtualClick\(affordance\.element\);/);
  assert.match(componentSource, /function resolveVirtualOperationTextInputAffordance\(targetId: string\)/);
  assert.match(componentSource, /return resolveVirtualOperationTextInputElement\(affordance\.element\) \?\? resolveVirtualOperationTextInputAffordance\(`\$\{targetId\}\.input`\);/);
  assert.match(componentSource, /operationPlan\.cursorLifecycle === "return_after_step"/);
  assert.match(componentSource, /dispatchVirtualInputEvents/);
  assert.match(componentSource, /buddyMascotDebugStore\.setVirtualCursorEnabled\(false\);/);
});

test("BuddyWidget can interrupt virtual operations and skips graph connections that already exist", () => {
  assert.match(componentSource, /v-if="virtualOperationStatus"/);
  assert.match(componentSource, /class="buddy-widget__virtual-operation-banner"/);
  assert.match(componentSource, /@click="interruptVirtualOperation"/);
  assert.match(componentSource, /class="buddy-widget__virtual-operation-stop-icon"/);
  const operationBannerBlock = extractCssBlock(".buddy-widget__virtual-operation-banner");
  assert.match(operationBannerBlock, /left:\s*50%;/);
  assert.match(operationBannerBlock, /top:\s*calc\(var\(--editor-canvas-floating-top-clearance,\s*18px\) \+ 64px\);/);
  assert.match(operationBannerBlock, /translate:\s*-50% 0;/);
  assert.match(operationBannerBlock, /min-width:\s*min\(420px,\s*calc\(100vw - 56px\)\);/);
  assert.match(operationBannerBlock, /justify-content:\s*center;/);
  assert.match(operationBannerBlock, /padding:\s*14px 16px 14px 24px;/);
  assert.match(operationBannerBlock, /border:\s*1px solid rgba\(255,\s*247,\s*237,\s*0\.34\);/);
  assert.match(operationBannerBlock, /background:\s*linear-gradient\(135deg,\s*rgba\(154,\s*52,\s*18,\s*0\.96\),\s*rgba\(131,\s*43,\s*13,\s*0\.94\)\);/);
  assert.match(operationBannerBlock, /color:\s*#fff7ed;/);
  assert.match(operationBannerBlock, /animation:\s*buddy-widget-virtual-operation-breathe 2\.4s ease-in-out infinite;/);
  assert.match(extractCssBlock(".buddy-widget__virtual-operation-stop"), /border-radius:\s*999px;/);
  assert.match(componentSource, /\.buddy-widget__virtual-operation-stop-icon::before\s*\{[\s\S]*width:\s*8px;[\s\S]*height:\s*8px;/);
  assert.match(componentSource, /@keyframes buddy-widget-virtual-operation-breathe/);
  assert.match(componentSource, /type BuddyVirtualOperationToken = \{/);
  assert.match(componentSource, /const virtualOperationStatus = ref<BuddyVirtualOperationStatus \| null>\(null\);/);
  assert.match(componentSource, /import \{[\s\S]*shallowRef[\s\S]*\} from "vue";/);
  assert.match(componentSource, /const activeVirtualOperationToken = shallowRef<BuddyVirtualOperationToken \| null>\(null\);/);
  assert.doesNotMatch(componentSource, /const activeVirtualOperationToken = ref<BuddyVirtualOperationToken \| null>\(null\);/);
  assert.match(componentSource, /function interruptVirtualOperation\(\)/);
  assert.match(componentSource, /function isVirtualOperationInterrupted\(token: BuddyVirtualOperationToken \| null\)/);
  assert.match(componentSource, /waitForVirtualOperation\([^)]*, activeVirtualOperationToken\.value\)/);
  assert.match(componentSource, /resolveGraphEditPlaybackStepElementWithRetry\(step, playbackState, token\)/);
  assert.match(componentSource, /function resolveGraphEditPlaybackStepElementWithRetry\([\s\S]*step: GraphEditPlaybackStep,[\s\S]*playbackState: GraphEditPlaybackUiState,[\s\S]*token: BuddyVirtualOperationToken \| null,[\s\S]*\)/);
  assert.match(componentSource, /while \(!isVirtualOperationInterrupted\(token\) && Date\.now\(\) <= deadlineMs\) \{/);
  assert.match(componentSource, /if \(isVirtualOperationInterrupted\(token\)\) \{[\s\S]*return null;/);
  assert.match(componentSource, /shouldSkipGraphEditPlaybackConnectionStep\(step, playbackState\)/);
  assert.match(componentSource, /function hasVirtualOperationAffordanceElement\(targetId: string\)/);
  assert.match(componentSource, /return Boolean\(edgeTargetId && hasVirtualOperationAffordanceElement\(edgeTargetId\)\);/);
  assert.match(componentSource, /function resolveGraphEditPlaybackDataEdgeTarget\(step: GraphEditPlaybackStep, playbackState: GraphEditPlaybackUiState\)/);
  assert.match(componentSource, /function resolveGraphEditPlaybackFlowEdgeTarget\(step: GraphEditPlaybackStep, playbackState: GraphEditPlaybackUiState\)/);
  assert.match(componentSource, /const BUDDY_VIRTUAL_POINTER_ID = 9001;/);
  assert.match(componentSource, /const TOOGRAPH_VIRTUAL_EMPTY_CANVAS_POINTER_EVENT_KEY = "__toographVirtualEmptyCanvasPointerEvent";/);
  assert.match(componentSource, /function markVirtualPointerEvent/);
  assert.match(componentSource, /function shouldForceGraphEditPlaybackEmptyCanvasDrop\(step: GraphEditPlaybackStep\)/);
  assert.match(componentSource, /dispatchVirtualPointerEvent\(pointerSurface, "pointermove", point\.x, point\.y, \{ forceEmptyCanvasDrop \}\)/);
  assert.match(componentSource, /dispatchVirtualPointerEvent\(pointerSurface, "pointerup", endPoint\.x, endPoint\.y, \{ forceEmptyCanvasDrop \}\)/);
  assert.match(componentSource, /Object\.defineProperty\(event, TOOGRAPH_VIRTUAL_EMPTY_CANVAS_POINTER_EVENT_KEY,/);
  assert.match(componentSource, /function resolveGraphEditPlaybackAnchorNodeFallbackPoint\(targetId: string\)/);
  assert.match(componentSource, /pointerId: BUDDY_VIRTUAL_POINTER_ID,/);
});

test("BuddyWidget debug panel can trigger every mascot animation state without graph runs", () => {
  assert.match(componentSource, /let buddyDebugActionTimerId: number \| null = null;/);
  assert.match(componentSource, /onBeforeUnmount\(\(\) => \{[\s\S]*clearBuddyDebugActionTimer\(\);/);
  assert.match(componentSource, /function triggerMascotDebugAction\(action: BuddyMascotDebugAction\)/);
  assert.match(componentSource, /cancelBuddyRoamTimers\(\);/);
  assert.match(componentSource, /clearSpeakingIdleTimer\(\);/);
  assert.match(componentSource, /case "thinking":[\s\S]*mood\.value = "thinking";/);
  assert.match(componentSource, /case "speaking":[\s\S]*mood\.value = "speaking";/);
  assert.match(componentSource, /case "error":[\s\S]*mood\.value = "error";/);
  assert.match(componentSource, /case "tap":[\s\S]*tapNonce\.value \+= 1;/);
  assert.match(componentSource, /case "dragging":[\s\S]*debugDragging\.value = true;/);
  assert.match(componentSource, /function playMascotDebugMotion\(motion: BuddyMascotMotion, durationMs: number, facing: BuddyMascotFacing\)[\s\S]*restartAvatarHopAnimation\(\);/);
  assert.match(componentSource, /playMascotDebugMotion\("hop", resolveMascotMoveDurationMs\("random"\), "front"\);/);
  assert.match(componentSource, /playMascotDebugMotion\("roam", resolveMascotMoveDurationMs\("random"\), "right"\);/);
  assert.doesNotMatch(componentSource, /playMascotDebugMotion\("spin"/);
  assert.doesNotMatch(extractFunctionBlock("triggerMascotDebugAction"), /runGraph\(/);
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

test("BuddyWidget lets the buddy runtime choose its own model", () => {
  assert.match(componentSource, /import \{ fetchSettings \} from "\.\.\/api\/settings\.ts";/);
  assert.match(componentSource, /import \{ buildRuntimeModelOptions \} from "\.\.\/lib\/runtimeModelCatalog\.ts";/);
  assert.match(componentSource, /const buddyModelRef = ref\("/);
  assert.match(componentSource, /BUDDY_MODEL_STORAGE_KEY/);
  assert.match(componentSource, /v-model="buddyModelRef"/);
  assert.match(componentSource, /@visible-change="handleBuddyModelSelectVisibleChange"/);
  assert.match(componentSource, /popper-class="toograph-select-popper buddy-widget__select-popper"/);
  assert.match(componentSource, /:global\(\.buddy-widget__select-popper\.el-popper\)[\s\S]*z-index:\s*46\d\d\s*!important;/);
  assert.match(componentSource, /buddyModelOptions/);
  assert.match(componentSource, /return buildRuntimeModelOptions\(settings\);/);
  assert.match(componentSource, /buddyModel:\s*buddyModelRef\.value/);
});

test("BuddyWidget builds page context from the shared editor snapshot", () => {
  assert.match(componentSource, /import \{ buildBuddyPageContext \} from "\.\/buddyPageContext\.ts";/);
  assert.match(componentSource, /import \{ buildPageOperationBook, collectPageOperationSnapshot \} from "\.\/pageOperationAffordances\.ts";/);
  assert.match(componentSource, /import \{ useBuddyContextStore \} from "\.\.\/stores\/buddyContext\.ts";/);
  assert.match(componentSource, /const buddyContextStore = useBuddyContextStore\(\);/);
  assert.match(componentSource, /const pageOperationContext = buildPageOperationRuntimeContext\(\);[\s\S]*pageContext: pageOperationContext\.pageContext,[\s\S]*pageOperationContext: pageOperationContext\.skillRuntimeContext/);
  assert.match(componentSource, /const snapshot = collectPageOperationSnapshot\(\{[\s\S]*routePath: route\.fullPath,[\s\S]*root: typeof document === "undefined" \? null : document,[\s\S]*\}\);/);
  assert.match(componentSource, /pageContext: buildBuddyPageContext\(\{[\s\S]*routePath: route\.fullPath,[\s\S]*editor: buddyContextStore\.editorSnapshot,[\s\S]*activeBuddyRunId: activeRunId\.value,[\s\S]*pageOperationBook,[\s\S]*\}\)/);
  assert.match(componentSource, /skillRuntimeContext: \{[\s\S]*page_path: snapshot\.path,[\s\S]*page_snapshot: snapshot,[\s\S]*page_operation_book: pageOperationBook,[\s\S]*\}/);
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
  assert.match(componentSource, /class="buddy-widget__input"[\s\S]*:disabled="Boolean\(pausedBuddyRun\)"/);
  assert.match(componentSource, /class="buddy-widget__send"[\s\S]*:disabled="Boolean\(pausedBuddyRun\) \|\| !draft\.trim\(\)"/);
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
  assert.doesNotMatch(extractFunctionBlock("shouldRenderMessage"), /activityText/);
});

test("BuddyWidget keeps runtime error replies out of model context and persisted history", () => {
  assert.match(componentSource, /const history = buildHistoryBeforeMessage\(userEntry\.id\);/);
  assert.match(componentSource, /const history = turn\.history;/);
  assert.match(componentSource, /return previousMessages\.filter\(isContextMessage\)\.map\(\(\{ role, content \}\) => \(\{ role, content \}\)\);/);
  assert.match(componentSource, /appendBuddyChatMessage\(sessionId,[\s\S]*include_in_context: options\.includeInContext \?\? message\.includeInContext !== false,[\s\S]*\)/);
  assert.match(componentSource, /updateAssistantMessage\(assistantMessage\.id, t\("buddy\.errorReply", \{ error: message \}\), \{ includeInContext: false \}\);/);
  assert.match(componentSource, /persistBuddyMessage\(turn\.sessionId,[\s\S]*includeInContext: false,[\s\S]*\);/);
});

test("BuddyWidget keeps live run activity out of the chat transcript", () => {
  assert.match(componentSource, /resolveBuddyRunActivityFromRunEvent/);
  assert.match(componentSource, /activityText/);
  assert.doesNotMatch(componentSource, /shouldShowAssistantActivityBubble\(message\)/);
  assert.doesNotMatch(componentSource, /message\.activityText \|\| t\("buddy\.streaming"\)/);
  assert.match(componentSource, /setAssistantActivityText\(assistantMessage\.id, t\("buddy\.activity\.preparing"\)\);/);
  assert.match(componentSource, /setAssistantActivityFromRunEvent\(assistantMessageId, eventType, payload, graph\);/);
  assert.match(componentSource, /if \(mood\.value === "thinking" && latestActivityText\.value\) \{/);
});

test("BuddyWidget renders assistant replies from parent graph output nodes only", () => {
  assert.match(componentSource, /import \{ resolveOutputPreviewContent \} from "\.\.\/editor\/nodes\/outputPreviewContentModel\.ts";/);
  assert.match(componentSource, /import SandboxedHtmlFrame from "\.\.\/components\/SandboxedHtmlFrame\.vue";/);
  assert.match(componentSource, /buildBuddyPublicOutputBindings/);
  assert.match(componentSource, /reduceBuddyPublicOutputEvent/);
  assert.match(componentSource, /publicOutput\?:/);
  assert.match(componentSource, /buildPublicOutputMessageId\(controllerMessageId, output\.outputNodeId\)/);
  assert.match(componentSource, /syncBuddyRunDisplayMessages/);
  assert.match(componentSource, /v-html="renderBuddyMarkdown\(message\.content\)"/);
  assert.match(componentSource, /v-else-if="message\.role === 'assistant' && message\.content && resolveBuddyRenderedContent\(message\)\.kind === 'html'"/);
  assert.match(componentSource, /<SandboxedHtmlFrame[\s\S]*:source="resolveBuddyRenderedContent\(message\)\.html"/);
  assert.match(componentSource, /class="buddy-widget__public-output-card"/);
  assert.match(componentSource, /addEventListener\("activity\.event"/);
  assert.doesNotMatch(componentSource, /resolveBuddyReplyFromRunEvent/);
  assert.doesNotMatch(componentSource, /resolveBuddyRunTraceFromRunEvent/);
});

test("BuddyWidget closed reply bubble uses compact maximum dimensions and renders markdown or sandboxed html", () => {
  assert.match(componentSource, /const bubblePreviewContent = computed/);
  assert.match(componentSource, /v-if="bubblePreviewContent\.kind === 'html'"/);
  assert.match(componentSource, /v-else-if="bubblePreviewContent\.kind === 'markdown'"/);
  assert.match(componentSource, /v-html="bubblePreviewContent\.html"/);
  assert.match(componentSource, /--buddy-widget-bubble-max-width:\s*320px;/);
  assert.match(componentSource, /--buddy-widget-bubble-max-height:\s*256px;/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*width:\s*max-content;/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*max-width:\s*min\(var\(--buddy-widget-bubble-max-width\), calc\(100vw - 32px\)\);/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*max-height:\s*min\(var\(--buddy-widget-bubble-max-height\), calc\(100vh - 120px\)\);/);
  assert.doesNotMatch(componentSource, /\.buddy-widget__bubble \{[\s\S]*\n\s*width:\s*min\(var\(--buddy-widget-bubble-max-width/);
  assert.doesNotMatch(componentSource, /\.buddy-widget__bubble \{[\s\S]*\n\s*height:\s*min\(var\(--buddy-widget-bubble-max-height/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(componentSource, /\.buddy-widget__bubble \{[\s\S]*overflow:\s*auto;/);
  assert.match(componentSource, /\.buddy-widget__bubble-html-frame \{[\s\S]*width:\s*100%;/);
});

test("BuddyWidget renders output-segment run trace capsules instead of per-message duration chips", () => {
  assert.match(componentSource, /import \{ formatRunDuration \} from "\.\.\/lib\/run-display-name\.ts";/);
  assert.match(componentSource, /import \{[\s\S]*advanceSmoothNumberDisplay,[\s\S]*isSmoothNumberDisplaySettled,[\s\S]*\} from "\.\.\/lib\/smoothNumberDisplay\.ts";/);
  assert.match(componentSource, /import \{[\s\S]*buildOutputTraceBuddyMessageMetadata,[\s\S]*resolveOutputTraceBuddyMessageMetadata,[\s\S]*\} from "\.\/buddyMessageMetadata\.ts";/);
  assert.match(componentSource, /buildBuddyOutputTracePlan/);
  assert.match(componentSource, /reduceBuddyOutputTraceEvent/);
  assert.match(componentSource, /buildBuddyOutputTraceStateFromRunDetail/);
  assert.match(componentSource, /outputTrace\?:/);
  assert.match(componentSource, /class="buddy-widget__run-trace"/);
  assert.match(componentSource, /class="buddy-widget__run-trace-summary"/);
  assert.match(componentSource, /buddy-widget__run-trace-dot--running/);
  assert.match(componentSource, /formatTraceDuration/);
  assert.match(componentSource, /traceClockNowMs/);
  assert.match(componentSource, /traceDurationDisplayByKey/);
  assert.match(componentSource, /window\.requestAnimationFrame\(tick\)/);
  assert.match(componentSource, /buildRunNodeTimingByNodeIdFromRun/);
  assert.match(componentSource, /const \{ publicOutputMessages, outputTraceMessages \} = syncBuddyRunDisplayMessages/);
  assert.match(componentSource, /for \(const message of outputTraceMessages\) \{[\s\S]*persistBuddyMessage\(sessionId, message,[\s\S]*includeInContext:\s*false/);
  assert.match(componentSource, /const metadata = buildBuddyMessageMetadata\(message\);/);
  assert.match(componentSource, /\.\.\.\(metadata \? \{ metadata \} : \{\}\)/);
  assert.match(componentSource, /outputTrace:\s*resolveOutputTraceBuddyMessageMetadata\(record\.metadata\) \?\? undefined/);
  assert.doesNotMatch(componentSource, /formatPublicOutputDuration/);
  assert.doesNotMatch(componentSource, /runTraceStartedAtByKey/);
});

test("BuddyWidget seeds streaming run trace capsules from the current run snapshot", () => {
  assert.match(componentSource, /const source = new EventSource\(streamUrl\);[\s\S]*eventSource = source;[\s\S]*void hydrateBuddyStreamingRunDisplayFromSnapshot\(/);
  assert.match(componentSource, /async function hydrateBuddyStreamingRunDisplayFromSnapshot\(/);
  assert.match(componentSource, /fetchRun\(runId\)/);
  assert.match(componentSource, /if \(eventSource !== source\) \{[\s\S]*return null;[\s\S]*\}/);
  assert.match(componentSource, /buildBuddyOutputTraceStateFromRunDetail\(runDetail, outputTracePlan, graph\)/);
  assert.match(componentSource, /buildPublicOutputRuntimeStateFromRunDetail\(runDetail, publicOutputBindings, graph\)/);
  assert.match(componentSource, /function syncStreamingBuddyRunDisplay\(/);
  assert.match(componentSource, /syncStreamingBuddyRunDisplay\(assistantMessageId, runId, outputTraceState, publicOutputState\)/);
  assert.match(componentSource, /source\.addEventListener\("run\.completed", \(\) => closeEventSource\(source\)\);/);
});

test("BuddyWidget shows a pending run trace capsule immediately after sending", () => {
  assert.match(componentSource, /import \{[\s\S]*createBuddyPendingOutputTraceRuntimeState,[\s\S]*\} from "\.\/buddyOutputTrace\.ts";/);
  assert.match(
    componentSource,
    /messages\.value\.push\(userEntry, assistantEntry\);[\s\S]*showBuddyImmediatePendingTrace\(assistantEntry\.id\);[\s\S]*queuedTurns\.value\.push\(/,
  );
  assert.match(componentSource, /function showBuddyImmediatePendingTrace\(assistantMessageId: string\)/);
  assert.match(componentSource, /segmentId:\s*"__pending__"/);
  assert.match(componentSource, /boundaryLabel:\s*t\("buddy\.activity\.preparing"\)/);
  assert.match(
    componentSource,
    /const publicOutputBindings = buildBuddyPublicOutputBindings\(graph\);[\s\S]*showBuddyGraphPendingTrace\(assistantMessage\.id, graph, publicOutputBindings\);[\s\S]*const run = await runGraph\(graph\);/,
  );
  assert.match(componentSource, /function showBuddyGraphPendingTrace\(/);
  assert.match(componentSource, /createBuddyPendingOutputTraceRuntimeState\(outputTracePlan, nowPublicOutputMs\(\)\)/);
  assert.match(componentSource, /function hasVisibleBuddyRunDisplaySnapshot\(/);
});

test("BuddyWidget groups consecutive visible messages by role label", () => {
  assert.match(componentSource, /import \{ shouldShowGroupedBuddyMessageLabel \} from "\.\/buddyMessageGrouping\.ts";/);
  assert.match(componentSource, /v-for="\(\s*message,\s*messageIndex\s*\) in messages"/);
  assert.match(componentSource, /v-if="shouldShowMessageRoleLabel\(messageIndex\)"/);
  assert.match(componentSource, /'buddy-widget__message--grouped': !shouldShowMessageRoleLabel\(messageIndex\)/);
  assert.match(componentSource, /function shouldShowMessageRoleLabel\(messageIndex: number\)/);
  assert.match(componentSource, /\.buddy-widget__message--grouped\s*\{/);
});

test("BuddyWidget stores buddy chat in backend sessions and exposes a compact history dropdown", () => {
  assert.match(componentSource, /import \{[\s\S]*appendBuddyChatMessage,[\s\S]*fetchBuddyChatMessages,[\s\S]*fetchBuddyChatSessions,[\s\S]*\} from "\.\.\/api\/buddy\.ts";/);
  assert.match(componentSource, /import \{ Check, Clock, Close, Delete, FullScreen, Plus, Promotion, SemiSelect \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import \{ ElIcon, ElOption, ElPopover, ElSelect \} from "element-plus";/);
  assert.match(componentSource, /const BUDDY_ACTIVE_SESSION_STORAGE_KEY = "toograph:buddy-active-session";/);
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
  assert.match(componentSource, /import \{ Check, Clock, Close, Delete, FullScreen, Plus, Promotion, SemiSelect \} from "@element-plus\/icons-vue";/);
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

test("BuddyWidget starts visible runs from the saved template binding", () => {
  assert.match(componentSource, /fetchBuddyRunTemplateBinding/);
  assert.match(componentSource, /const binding = await fetchBuddyRunTemplateBinding\(\);/);
  assert.match(componentSource, /fetchTemplate\(binding\.template_id\)/);
  assert.match(componentSource, /buildBuddyChatGraph\([\s\S]*template,[\s\S]*binding,[\s\S]*\);/);
  assert.doesNotMatch(componentSource, /fetchTemplate\("buddy_autonomous_loop"\)/);
});

test("BuddyWidget starts autonomous review as a separate background run after the visible reply", () => {
  assert.match(componentSource, /BUDDY_REVIEW_TEMPLATE_ID/);
  assert.match(componentSource, /buildBuddyReviewGraph/);
  assert.match(componentSource, /void startBuddyAutonomousReviewRun\(runDetail\);/);
  assert.match(componentSource, /async function startBuddyAutonomousReviewRun\(mainRun: RunDetail\)/);
  assert.match(componentSource, /fetchTemplate\(BUDDY_REVIEW_TEMPLATE_ID\)/);
  assert.match(componentSource, /const graph = buildBuddyReviewGraph\(template,\s*\{[\s\S]*mainRun,[\s\S]*buddyModel: buddyModelRef\.value,[\s\S]*\}\);/);
  assert.match(componentSource, /const reviewRun = await runGraph\(graph\);/);
  assert.match(componentSource, /void pollBuddyAutonomousReviewRun\(reviewRun\.run_id\);/);
  assert.match(componentSource, /const backgroundReviewAbortControllers = new Set<AbortController>\(\);/);
  assert.match(componentSource, /abortBackgroundReviewRuns\(\);/);
  assert.doesNotMatch(componentSource, /activeRunId\.value = reviewRun\.run_id/);
});

test("BuddyWidget treats awaiting-human graph runs as resumable pause cards", () => {
  assert.match(componentSource, /import \{ cancelRun, fetchRun, resumeRun \} from "\.\.\/api\/runs\.ts";/);
  assert.match(componentSource, /import BuddyPauseCard from "\.\/BuddyPauseCard\.vue";/);
  assert.match(componentSource, /const pausedBuddyRun = ref<RunDetail \| null>\(null\);/);
  assert.match(componentSource, /const pausedBuddyAssistantMessageId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /<BuddyPauseCard[\s\S]*v-if="shouldShowPausedRunCard\(message\)"[\s\S]*:run="pausedBuddyRun"[\s\S]*@resume="resumePausedBuddyRun"[\s\S]*@cancel="cancelPausedBuddyRun"/);
  assert.match(componentSource, /resumePausedBuddyRun/);
  assert.match(componentSource, /runDetail\.status === "awaiting_human"/);
  assert.match(componentSource, /shouldHoldBuddyQueueDrain\(\{ hasPausedRun: Boolean\(pausedBuddyRun\.value\) \}\)/);
  assert.doesNotMatch(componentSource, /void startBuddyAutonomousReviewRun\(runDetail\);[\s\S]*runDetail\.status === "awaiting_human"/);
});

test("BuddyWidget can cancel a paused run from the pause card", () => {
  assert.match(pauseCardSource, /buddy\.pause\.cancelRun/);
  assert.match(componentSource, /@cancel="cancelPausedBuddyRun"/);
  assert.match(componentSource, /async function cancelPausedBuddyRun\(\)/);
  assert.match(componentSource, /await cancelRun\(run\.run_id,\s*t\("buddy\.pause\.cancelReason"\)\)/);
  assert.match(
    componentSource,
    /updateAssistantMessage\(assistantMessageId,\s*t\("buddy\.pause\.cancelledReply"\),\s*\{[\s\S]*includeInContext:\s*false/,
  );
  assert.match(componentSource, /void persistBuddyMessage\(sessionId,[\s\S]*runId:\s*run\.run_id,[\s\S]*includeInContext:\s*false/);
});

test("BuddyWidget persists awaiting-human paused run placeholders outside model context", () => {
  assert.match(componentSource, /type BuddyPauseHandlingOptions = \{[\s\S]*persist\?: boolean;[\s\S]*\};/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(runDetail,\s*assistantMessage\.id,\s*\{ persist: true \}\)/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(resumedRunDetail,\s*assistantMessageId,\s*\{ persist: true \}\)/);
  assert.match(
    componentSource,
    /updateAssistantMessage\(assistantMessageId,\s*t\("buddy\.pause\.persistedReply"\),\s*\{[\s\S]*includeInContext:\s*false,[\s\S]*runId:\s*run\.run_id/,
  );
  assert.match(
    componentSource,
    /if \(options\.persist && activeSessionId\.value\) \{[\s\S]*persistBuddyMessage\(activeSessionId\.value,[\s\S]*runId:\s*run\.run_id,[\s\S]*includeInContext:\s*false/,
  );
});

test("BuddyWidget recovers awaiting-human paused runs after session activation", () => {
  assert.match(
    componentSource,
    /import \{ findLatestRecoverablePausedRunMessage, isRecoverablePausedRunStatus \} from "\.\/buddyPausedRunRecovery\.ts";/,
  );
  assert.match(componentSource, /let chatSessionActivationGeneration = 0;/);
  assert.match(componentSource, /const activationGeneration = \+\+chatSessionActivationGeneration;/);
  assert.match(componentSource, /await recoverPausedBuddyRunFromLoadedMessages\(sessionId,\s*activationGeneration\);/);
  assert.match(componentSource, /async function recoverPausedBuddyRunFromLoadedMessages\(sessionId: string, activationGeneration: number\)/);
  assert.match(componentSource, /const candidate = findLatestRecoverablePausedRunMessage\(messages\.value\);/);
  assert.match(componentSource, /const run = await fetchRun\(candidate\.runId\);/);
  assert.match(componentSource, /if \(!isRecoverablePausedRunStatus\(run\.status\)\) \{/);
  assert.doesNotMatch(componentSource, /resetRunTraceForMessage\(candidate\.messageId\);/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(run,\s*candidate\.messageId\);/);
  assert.match(componentSource, /buddy\.pause\.recoveryFailed/);
});

test("BuddyWidget keeps recovered paused runs session-locked and queue-safe", () => {
  assert.match(componentSource, /const isSessionSwitchLocked = computed\([\s\S]*activeRunId\.value !== null/);
  assert.doesNotMatch(componentSource, /isActiveTraceUnfinished\(\)/);
  assert.match(componentSource, /shouldHoldBuddyQueueDrain\(\{ hasPausedRun: Boolean\(pausedBuddyRun\.value\) \}\)/);
  assert.match(componentSource, /:disabled="Boolean\(pausedBuddyRun\)"/);
  assert.match(componentSource, /resolveBuddyComposerDecision\(\{[\s\S]*hasPausedRun: Boolean\(pausedBuddyRun\.value\),[\s\S]*isResumeBusy: pausedBuddyResumeBusy\.value/);
  assert.match(componentSource, /if \(composerDecision\.kind === "route_to_pause_card"\) \{[\s\S]*errorMessage\.value = t\("buddy\.pause\.useCard"\);/);
});

test("BuddyWidget can deny a pending permission approval from the pause card", () => {
  assert.doesNotMatch(componentSource, /function denyPausedBuddyPermissionApproval\(\)/);
  assert.match(componentSource, /@resume="resumePausedBuddyRun"/);
  assert.match(componentSource, /BuddyPauseCard/);
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

test("BuddyWidget scrolls the pause card into view before resuming input", () => {
  assert.match(componentSource, /function scrollPausedBuddyCardIntoView\(\)/);
  assert.match(componentSource, /\.buddy-widget__pause-card/);
  assert.match(componentSource, /if \(keepRunPaused\) \{[\s\S]*await scrollPausedBuddyCardIntoView\(\);[\s\S]*\} else \{[\s\S]*await scrollMessagesToBottom\(\);[\s\S]*\}/);
  assert.match(componentSource, /if \(pausedBuddyRun\.value\) \{[\s\S]*await scrollPausedBuddyCardIntoView\(\);[\s\S]*\} else \{[\s\S]*await scrollMessagesToBottom\(\);[\s\S]*\}/);
});

test("BuddyWidget keeps paused run continuation inside the pause card", () => {
  assert.match(componentSource, /:disabled="Boolean\(pausedBuddyRun\)"/);
  assert.match(componentSource, /if \(pausedBuddyRun\.value\) \{[\s\S]*await scrollPausedBuddyCardIntoView\(\);[\s\S]*return;/);
  assert.doesNotMatch(componentSource, /if \(pausedBuddyRun\.value\) \{[\s\S]*await resumePausedBuddyRun\(userMessage\);[\s\S]*return;/);
  assert.doesNotMatch(componentSource, /buildBuddyResumePayloadFromText/);
  assert.match(componentSource, /setAssistantActivityText\(assistantMessageId,\s*t\("buddy\.activity\.resuming"\)\)/);
  assert.doesNotMatch(componentSource, /appendRunTraceEntry\("node\.started"/);
  assert.doesNotMatch(componentSource, /appendRunTraceEntry\("node\.completed"/);
});

test("BuddyWidget does not impose a whole-run polling timeout", () => {
  assert.doesNotMatch(componentSource, /RUN_POLL_TIMEOUT_MS/);
  assert.match(componentSource, /async function pollRunUntilFinished\([^)]*\): Promise<RunDetail> \{[\s\S]*while \(true\) \{/);
  assert.match(componentSource, /async function pollRunUntilFinished\([^)]*\): Promise<RunDetail> \{[\s\S]*await delay\(RUN_POLL_INTERVAL_MS, signal\);/);
  assert.doesNotMatch(componentSource.match(/async function pollRunUntilFinished[\s\S]*?\n\}/)?.[0] ?? "", /buddy\.runTimeout/);
});
