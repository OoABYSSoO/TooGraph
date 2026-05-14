<template>
  <span class="buddy-mascot" :class="mascotClasses" :style="eyeLookStyle" aria-hidden="true">
    <svg
      class="buddy-mascot__svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-320 -180 640 560"
      focusable="false"
    >
      <defs>
        <radialGradient id="buddyMascotSparkleGold" cx="0" cy="-136" r="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#f2c968" />
          <stop offset="62%" stop-color="#dfad50" />
          <stop offset="100%" stop-color="#c89136" />
        </radialGradient>
        <linearGradient id="buddyMascotEyeGold" x1="-104" y1="32" x2="104" y2="136" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#efbd61" />
          <stop offset="52%" stop-color="#d8a650" />
          <stop offset="100%" stop-color="#cf963d" />
        </linearGradient>
        <radialGradient id="buddyMascotBlack" cx="-44" cy="-132" r="360" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#282928" />
          <stop offset="44%" stop-color="#222222" />
          <stop offset="100%" stop-color="#171818" />
        </radialGradient>
        <filter id="buddyMascotSoftness" x="-340" y="-210" width="680" height="640" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.12" />
        </filter>
      </defs>

      <g class="buddy-mascot__stage" filter="url(#buddyMascotSoftness)">
        <g class="buddy-mascot__tail-root">
          <g class="buddy-mascot__tail buddy-mascot__tail-rig">
            <path
              class="buddy-mascot__tail-pose"
              :d="tailBasePath"
            >
              <animate
                ref="tailAnimateElement"
                v-if="tailSwingAnimation"
                :key="tailSwingAnimation.key"
                attributeName="d"
                begin="indefinite"
                :dur="`${tailSwingAnimation.durationMs}ms`"
                fill="freeze"
                calcMode="spline"
                :keyTimes="tailSwingAnimation.keyTimes"
                :keySplines="tailSwingAnimation.keySplines"
                :values="tailSwingAnimation.values"
              />
              <animate
                v-if="!tailSwingAnimation"
                :key="`tail-curve-${tailSide}`"
                attributeName="d"
                begin="0s"
                :dur="`${TAIL_CURVE_MICRO_DURATION_MS}ms`"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1"
                keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
                :values="tailCurveAnimationValues"
              />
            </path>
          </g>
        </g>

        <g class="buddy-mascot__body-turn">
          <g class="buddy-mascot__body">
            <path
              class="buddy-mascot__left-ear"
              fill="url(#buddyMascotBlack)"
              d="M-146-143 C-114-132-82-101-55-61 C-60-24-84 25-124 63 C-158 95-190 53-168-4 C-174-52-164-106-146-143Z"
            />
            <path
              class="buddy-mascot__right-ear"
              fill="url(#buddyMascotBlack)"
              d="M146-143 C114-132 82-101 55-61 C60-24 84 25 124 63 C158 95 190 53 168-4 C174-52 164-106 146-143Z"
            />
            <path
              class="buddy-mascot__head"
              fill="url(#buddyMascotBlack)"
              d="M-55-61 C-25-66 25-66 55-61 C90-61 130-43 168-4 C196 22 214 66 218 116 C226 208 145 264 0 264 C-145 264-226 208-218 116 C-214 66-196 22-168-4 C-130-43-90-61-55-61Z"
            />
            <g class="buddy-mascot__look-eye buddy-mascot__look-eye--left">
              <ellipse class="buddy-mascot__resting-eye buddy-mascot__resting-eye--left" cx="-80" cy="82" rx="24" ry="52" fill="url(#buddyMascotEyeGold)" />
              <path class="buddy-mascot__dizzy-eye buddy-mascot__dizzy-eye--left" d="M-80 82 C-70 70 -50 74 -50 90 C-50 112 -76 124 -96 108 C-122 88 -110 48 -76 44 C-34 40 -12 88 -42 122" />
            </g>
            <g class="buddy-mascot__look-eye buddy-mascot__look-eye--right">
              <ellipse class="buddy-mascot__resting-eye buddy-mascot__resting-eye--right" cx="80" cy="82" rx="24" ry="52" fill="url(#buddyMascotEyeGold)" />
              <path class="buddy-mascot__dizzy-eye buddy-mascot__dizzy-eye--right" d="M80 82 C90 70 110 74 110 90 C110 112 84 124 64 108 C38 88 50 48 84 44 C126 40 148 88 118 122" />
            </g>
            <path class="buddy-mascot__drag-eye buddy-mascot__drag-eye--left" d="M-104 52 L-64 82 L-104 112" />
            <path class="buddy-mascot__drag-eye buddy-mascot__drag-eye--right" d="M104 52 L64 82 L104 112" />
          </g>
        </g>

        <g v-show="!props.hideSparkle" class="buddy-mascot__sparkle-wrap">
          <path
            class="buddy-mascot__sparkle"
            fill="url(#buddyMascotSparkleGold)"
            :d="sparklePath"
          >
            <animate
              ref="sparkleAnimateElement"
              v-if="sparkleMorphAnimation"
              :key="sparkleMorphAnimation.key"
              attributeName="d"
              begin="indefinite"
              :dur="`${sparkleMorphAnimation.durationMs}ms`"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.2 0.8 0.2 1"
              :values="sparkleMorphAnimation.values"
            />
          </path>
        </g>
      </g>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

type BuddyMascotMood = "idle" | "thinking" | "speaking" | "error";
type BuddyMascotMotion = "idle" | "roam" | "hop";
type BuddyMascotFacing = "front" | "left" | "right";
type TailSide = "left" | "right";
type TailPose = (typeof TAIL_POSE_ORDER)[number];

const TAIL_POSE_ORDER = ["right", "backRight", "backCenter", "backLeft", "left"] as const;
const TAIL_IDLE_SWITCH_DURATION_MS = 1000;
const TAIL_FACING_SWITCH_DURATION_MS = 320;
const TAIL_CURVE_MICRO_DURATION_MS = 6800;
const TAIL_KEY_SPLINE = "0.42 0 0.58 1";
const SPARKLE_STAR_PATH = "M0-180 C5-154 18-141 44-136 C18-131 5-118 0-92 C-5-118 -18-131 -44-136 C-18-141 -5-154 0-180Z";
const SPARKLE_CURSOR_PATH = "M0-184 C14-147 33-107 52-78 C27-77 13-66 0-48 C-13-66 -27-77 -52-78 C-33-107 -14-147 0-184Z";
const SPARKLE_MORPH_DURATION_MS = 420;

const TAIL_POSE_PATHS = {
  right: "M0 176 C54 214 104 166 154 160 C212 152 240 112 260 82 C270 66 278 60 282 62",
  backRight: "M0 176 C36 204 72 166 100 146 C130 124 158 82 156 62 C156 56 154 52 152 54",
  backCenter: "M0 176 C-24 164 20 138 -2 108 C-20 82 -12 58 0 48 C8 54 12 62 8 72",
  backLeft: "M0 176 C-36 204 -72 166 -100 146 C-130 124 -158 82 -156 62 C-156 56 -154 52 -152 54",
  left: "M0 176 C-54 214 -104 166 -154 160 C-212 152 -240 112 -260 82 C-270 66 -278 60 -282 62",
} as const;

const TAIL_TRANSITION_PATHS = {
  rightToLeft: [
    TAIL_POSE_PATHS.right,
    TAIL_POSE_PATHS.backRight,
    TAIL_POSE_PATHS.backCenter,
    TAIL_POSE_PATHS.backLeft,
    TAIL_POSE_PATHS.left,
  ],
  leftToRight: [
    TAIL_POSE_PATHS.left,
    TAIL_POSE_PATHS.backLeft,
    TAIL_POSE_PATHS.backCenter,
    TAIL_POSE_PATHS.backRight,
    TAIL_POSE_PATHS.right,
  ],
} as const;

const TAIL_CURVE_MICRO_PATHS = {
  right: [
    TAIL_POSE_PATHS.right,
    "M0 176 C72 234 98 142 158 154 C222 166 230 96 260 80 C274 64 286 54 292 58",
    "M0 176 C56 202 112 184 160 160 C206 138 236 112 260 84 C272 70 280 66 286 68",
    "M0 176 C70 148 124 122 174 104 C218 86 252 70 286 58 C288 58 290 58 292 58",
    "M0 176 C34 214 124 190 154 164 C196 130 244 122 260 86 C270 72 272 58 278 54",
    "M0 176 C24 118 122 222 164 162 C206 102 244 122 260 86 C270 72 272 58 278 54",
  ],
  left: [
    TAIL_POSE_PATHS.left,
    "M0 176 C-72 234 -98 142 -158 154 C-222 166 -230 96 -260 80 C-274 64 -286 54 -292 58",
    "M0 176 C-56 202 -112 184 -160 160 C-206 138 -236 112 -260 84 C-272 70 -280 66 -286 68",
    "M0 176 C-70 148 -124 122 -174 104 C-218 86 -252 70 -286 58 C-288 58 -290 58 -292 58",
    "M0 176 C-34 214 -124 190 -154 164 C-196 130 -244 122 -260 86 C-270 72 -272 58 -278 54",
    "M0 176 C-24 118 -122 222 -164 162 C-206 102 -244 122 -260 86 C-270 72 -272 58 -278 54",
  ],
} as const;

const props = withDefaults(
  defineProps<{
    mood?: BuddyMascotMood;
    motion?: BuddyMascotMotion;
    facing?: BuddyMascotFacing;
    dragging?: boolean;
    tapNonce?: number;
    tailSwitchNonce?: number;
    lookX?: number;
    lookY?: number;
    virtualCursor?: boolean;
    hideSparkle?: boolean;
  }>(),
  {
    mood: "idle",
    motion: "idle",
    facing: "front",
    dragging: false,
    tapNonce: 0,
    tailSwitchNonce: 0,
    lookX: 0,
    lookY: 0,
    virtualCursor: false,
    hideSparkle: false,
  },
);

const tapAnimating = ref(false);
const tailBasePath = ref<string>(TAIL_POSE_PATHS.right);
const tailSide = ref<TailSide>("right");
const tailSwingAnimation = ref<{ key: number; values: string; durationMs: number; keyTimes: string; keySplines: string } | null>(null);
const tailAnimateElement = ref<SVGAnimationElement | null>(null);
const sparklePath = ref<string>(SPARKLE_STAR_PATH);
const sparkleMorphAnimation = ref<{ key: number; values: string; durationMs: number } | null>(null);
const sparkleAnimateElement = ref<SVGAnimationElement | null>(null);
let tapTimeoutId: number | null = null;
let tailTransitionTimerId: number | null = null;
let sparkleMorphTimerId: number | null = null;
let tailAnimationKey = 0;
let sparkleAnimationKey = 0;
let tailTransitionStartedAtMs = 0;
let tailTransitionFromPose: TailPose = "right";
let tailTransitionTargetSide: TailSide | null = null;
let previousFacing: BuddyMascotFacing = props.facing;

const effectiveMood = computed(() => (props.dragging ? "idle" : props.mood));
const effectiveMotion = computed(() => (props.dragging || props.mood !== "idle" ? "idle" : props.motion));
const mascotClasses = computed(() => ({
  [`buddy-mascot--${effectiveMood.value}`]: true,
  [`buddy-mascot--motion-${effectiveMotion.value}`]: true,
  [`buddy-mascot--facing-${props.facing}`]: true,
  "buddy-mascot--dragging": props.dragging,
  "buddy-mascot--tap": tapAnimating.value && !props.dragging,
  "buddy-mascot--virtual-cursor": props.virtualCursor,
}));
const eyeLookStyle = computed<Record<string, string>>(() => {
  const shouldTrackPointer = props.facing === "front";
  const x = shouldTrackPointer ? clampLookAxis(props.lookX) * 18 : 0;
  const y = shouldTrackPointer ? clampLookAxis(props.lookY) * 12 : 0;
  return {
    "--buddy-mascot-look-x": `${x.toFixed(2)}px`,
    "--buddy-mascot-look-y": `${y.toFixed(2)}px`,
  };
});
const tailCurveAnimationValues = computed(() => buildTailCurveMicroValues(tailSide.value));

watch(() => props.tapNonce, triggerTapAnimation);
watch(() => props.tailSwitchNonce, triggerTailSideSwitch);
watch(() => props.virtualCursor, syncSparklePath, { immediate: true });
watch([effectiveMood, () => props.facing, () => props.dragging], syncTailTarget, { immediate: true });

onBeforeUnmount(() => {
  clearTapTimeout();
  clearTailTimers();
  clearSparkleMorphTimer();
});

function triggerTapAnimation(nextNonce: number, previousNonce: number | undefined) {
  if (nextNonce === previousNonce) {
    return;
  }
  clearTapTimeout();
  tapAnimating.value = false;

  if (typeof window === "undefined") {
    tapAnimating.value = true;
    return;
  }

  window.requestAnimationFrame(() => {
    tapAnimating.value = true;
    tapTimeoutId = window.setTimeout(() => {
      tapAnimating.value = false;
      tapTimeoutId = null;
    }, 520);
  });
}

function clearTapTimeout() {
  if (tapTimeoutId === null || typeof window === "undefined") {
    tapTimeoutId = null;
    return;
  }
  window.clearTimeout(tapTimeoutId);
  tapTimeoutId = null;
}

function syncSparklePath(enabled: boolean, previousEnabled: boolean | undefined) {
  const targetPath = enabled ? SPARKLE_CURSOR_PATH : SPARKLE_STAR_PATH;
  if (previousEnabled === undefined || typeof window === "undefined") {
    clearSparkleMorphTimer();
    sparklePath.value = targetPath;
    sparkleMorphAnimation.value = null;
    return;
  }
  if (sparklePath.value === targetPath) {
    sparkleMorphAnimation.value = null;
    return;
  }

  clearSparkleMorphTimer();
  const startPath = sparklePath.value;
  sparkleAnimationKey += 1;
  sparkleMorphAnimation.value = {
    key: sparkleAnimationKey,
    values: `${startPath};${targetPath}`,
    durationMs: SPARKLE_MORPH_DURATION_MS,
  };
  void nextTick(() => {
    sparkleAnimateElement.value?.beginElement();
  });

  sparkleMorphTimerId = window.setTimeout(() => {
    sparklePath.value = targetPath;
    sparkleMorphAnimation.value = null;
    sparkleMorphTimerId = null;
  }, SPARKLE_MORPH_DURATION_MS);
}

function clearSparkleMorphTimer() {
  if (sparkleMorphTimerId === null || typeof window === "undefined") {
    sparkleMorphTimerId = null;
    return;
  }
  window.clearTimeout(sparkleMorphTimerId);
  sparkleMorphTimerId = null;
}

function syncTailTarget() {
  const enteredFrontFromLateral = props.facing === "front" && isLateralFacing(previousFacing);
  const targetSide = enteredFrontFromLateral
    ? resolveFrontTailSideFromPreviousFacing(previousFacing)
    : resolveTailSideForFacing(props.facing);
  const crossedLateralFacing = isOppositeSideFacing(previousFacing, props.facing);
  previousFacing = props.facing;

  if (props.facing !== "front") {
    transitionTailTo(targetSide, TAIL_FACING_SWITCH_DURATION_MS, crossedLateralFacing);
    return;
  }

  if (enteredFrontFromLateral) {
    transitionTailTo(targetSide, TAIL_FACING_SWITCH_DURATION_MS, true);
    return;
  }

}

function triggerTailSideSwitch(nextNonce: number, previousNonce: number | undefined) {
  if (nextNonce === previousNonce || props.facing !== "front" || effectiveMood.value !== "idle" || props.dragging) {
    return;
  }
  transitionTailTo(tailSide.value === "right" ? "left" : "right", TAIL_IDLE_SWITCH_DURATION_MS);
}

function transitionTailTo(targetSide: TailSide, durationMs = TAIL_IDLE_SWITCH_DURATION_MS, forceSwitch = false) {
  const startPose = tailSwingAnimation.value ? estimateCurrentTailPose() : poseFromSide(tailSide.value);
  clearTailTransitionTimer();

  if (!forceSwitch && targetSide === tailSide.value && startPose === poseFromSide(targetSide)) {
    tailSwingAnimation.value = null;
    tailBasePath.value = TAIL_POSE_PATHS[targetSide];
    tailTransitionTargetSide = null;
    return;
  }

  const route = buildTailTransitionPoseRoute(startPose, targetSide);
  tailBasePath.value = TAIL_POSE_PATHS[startPose];
  tailTransitionStartedAtMs = nowMs();
  tailTransitionFromPose = startPose;
  tailTransitionTargetSide = targetSide;
  tailAnimationKey += 1;
  tailSwingAnimation.value = {
    key: tailAnimationKey,
    values: buildTailPoseValues(route),
    durationMs,
    keyTimes: buildTailKeyTimes(route.length),
    keySplines: buildTailKeySplines(route.length),
  };
  void nextTick(() => {
    tailAnimateElement.value?.beginElement();
  });

  if (typeof window === "undefined") {
    tailSwingAnimation.value = null;
    tailBasePath.value = TAIL_POSE_PATHS[targetSide];
    tailSide.value = targetSide;
    tailTransitionTargetSide = null;
    return;
  }

  tailTransitionTimerId = window.setTimeout(() => {
    tailTransitionTimerId = null;
    tailBasePath.value = TAIL_POSE_PATHS[targetSide];
    tailSide.value = targetSide;
    tailSwingAnimation.value = null;
    tailTransitionTargetSide = null;
    syncTailTarget();
  }, durationMs);
}

function resolveTailSideForFacing(facing: BuddyMascotFacing): TailSide {
  if (facing === "left") {
    return "right";
  }
  if (facing === "right") {
    return "left";
  }
  return tailSide.value;
}

function resolveFrontTailSideFromPreviousFacing(facing: BuddyMascotFacing): TailSide {
  if (facing === "left") {
    return "left";
  }
  if (facing === "right") {
    return "right";
  }
  return tailSide.value;
}

function isOppositeSideFacing(previous: BuddyMascotFacing, next: BuddyMascotFacing) {
  return (
    previous === "left" && next === "right"
  ) || (
    previous === "right" && next === "left"
  );
}

function isLateralFacing(facing: BuddyMascotFacing) {
  return facing === "left" || facing === "right";
}

function buildTailTransitionValues(fromSide: TailSide, toSide: TailSide) {
  if (fromSide === toSide) {
    return TAIL_POSE_PATHS[toSide];
  }
  const paths = fromSide === "right" ? TAIL_TRANSITION_PATHS.rightToLeft : TAIL_TRANSITION_PATHS.leftToRight;
  return paths.join(";");
}

function estimateCurrentTailPose(): TailPose {
  if (tailTransitionTargetSide === null || !tailSwingAnimation.value) {
    return poseFromSide(tailSide.value);
  }
  const route = buildTailTransitionPoseRoute(tailTransitionFromPose, tailTransitionTargetSide);
  const progress = Math.max(
    0,
    Math.min(1, (nowMs() - tailTransitionStartedAtMs) / Math.max(1, tailSwingAnimation.value.durationMs)),
  );
  const routeIndex = Math.min(route.length - 1, Math.round(progress * (route.length - 1)));
  return route[routeIndex] ?? poseFromSide(tailSide.value);
}

function buildTailTransitionPoseRoute(fromPose: TailPose, toSide: TailSide) {
  const toPose = poseFromSide(toSide);
  const fromIndex = TAIL_POSE_ORDER.indexOf(fromPose);
  const toIndex = TAIL_POSE_ORDER.indexOf(toPose);
  const step = fromIndex <= toIndex ? 1 : -1;
  const route: TailPose[] = [];

  for (let index = fromIndex; step > 0 ? index <= toIndex : index >= toIndex; index += step) {
    route.push(TAIL_POSE_ORDER[index]);
  }

  return route.length > 0 ? route : [toPose];
}

function buildTailPoseValues(route: TailPose[]) {
  return route.map((pose) => TAIL_POSE_PATHS[pose]).join(";");
}

function buildTailCurveMicroValues(side: TailSide) {
  const route = TAIL_CURVE_MICRO_PATHS[side];
  return [route[0], route[1], route[2], route[3], route[4], route[3], route[2], route[1], route[0]].join(";");
}

function buildTailKeyTimes(poseCount: number) {
  if (poseCount <= 1) {
    return "0";
  }
  return Array.from({ length: poseCount }, (_, index) => (index / (poseCount - 1)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")).join(";");
}

function buildTailKeySplines(poseCount: number) {
  return Array.from({ length: Math.max(1, poseCount - 1) }, () => TAIL_KEY_SPLINE).join(";");
}

function poseFromSide(side: TailSide): TailPose {
  return side;
}

function nowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function clearTailTimers() {
  clearTailTransitionTimer();
  tailTransitionTargetSide = null;
}

function clearTailTransitionTimer() {
  if (tailTransitionTimerId === null || typeof window === "undefined") {
    tailTransitionTimerId = null;
    return;
  }
  window.clearTimeout(tailTransitionTimerId);
  tailTransitionTimerId = null;
}

function clampLookAxis(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value ?? 0));
}
</script>

<style scoped>
.buddy-mascot {
  display: block;
  width: 100%;
  height: 100%;
  --buddy-mascot-left-eye-facing-x: 0px;
  --buddy-mascot-right-eye-facing-x: 0px;
  --buddy-mascot-eye-facing-y: 0px;
  --buddy-mascot-left-ear-x: 0px;
  --buddy-mascot-left-ear-y: 0px;
  --buddy-mascot-left-ear-scale: 1;
  --buddy-mascot-left-ear-rotate: 0deg;
  --buddy-mascot-right-ear-x: 0px;
  --buddy-mascot-right-ear-y: 0px;
  --buddy-mascot-right-ear-scale: 1;
  --buddy-mascot-right-ear-rotate: 0deg;
  --buddy-mascot-tail-root-x: 0px;
  pointer-events: none;
}

.buddy-mascot__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.buddy-mascot__body,
.buddy-mascot__body-turn,
.buddy-mascot__tail-root,
.buddy-mascot__tail,
.buddy-mascot__tail-pose,
.buddy-mascot__sparkle-wrap,
.buddy-mascot__sparkle,
.buddy-mascot__left-ear,
.buddy-mascot__right-ear,
.buddy-mascot__look-eye,
.buddy-mascot__resting-eye,
.buddy-mascot__dizzy-eye,
.buddy-mascot__drag-eye {
  transform-box: fill-box;
  transform-origin: center;
}

.buddy-mascot__body {
  transform-origin: 50% 70%;
}

.buddy-mascot__body-turn {
  transform-origin: 50% 72%;
}

.buddy-mascot__tail {
  transform-origin: 50% 78%;
}

.buddy-mascot__tail-root {
  transform: translateX(var(--buddy-mascot-tail-root-x));
  transition: transform 180ms ease;
}

.buddy-mascot__tail-pose {
  fill: none;
  stroke: url(#buddyMascotBlack);
  stroke-width: 38;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 1;
  transform-origin: 50% 78%;
  transition:
    opacity 160ms ease,
    transform 420ms ease;
}

.buddy-mascot__sparkle-wrap,
.buddy-mascot__sparkle {
  transform-origin: 50% 50%;
}

.buddy-mascot.buddy-mascot--virtual-cursor .buddy-mascot__sparkle-wrap {
  animation: buddy-mascot-cursor-ready 2.4s ease-in-out infinite;
}

.buddy-mascot.buddy-mascot--virtual-cursor .buddy-mascot__sparkle {
  transform: translateY(-2px) rotate(-14deg) scale(1.04);
  stroke: #171818;
  stroke-width: 16px;
  stroke-linecap: round;
  stroke-linejoin: round;
  paint-order: stroke fill;
  filter: drop-shadow(0 6px 6px rgba(32, 24, 16, 0.16));
}

.buddy-mascot__left-ear {
  transform-origin: 78% 82%;
  transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
    scale(var(--buddy-mascot-left-ear-scale))
    rotate(var(--buddy-mascot-left-ear-rotate));
  transition: transform 180ms ease;
}

.buddy-mascot__right-ear {
  transform-origin: 22% 82%;
  transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
    scale(var(--buddy-mascot-right-ear-scale))
    rotate(var(--buddy-mascot-right-ear-rotate));
  transition: transform 180ms ease;
}

.buddy-mascot--facing-left {
  --buddy-mascot-tail-root-x: 12px;
  --buddy-mascot-left-eye-facing-x: -70px;
  --buddy-mascot-right-eye-facing-x: -110px;
  --buddy-mascot-eye-facing-y: 1px;
  --buddy-mascot-left-ear-x: 18px;
  --buddy-mascot-left-ear-y: 4px;
  --buddy-mascot-left-ear-scale: 0.96;
  --buddy-mascot-left-ear-rotate: 4deg;
  --buddy-mascot-right-ear-x: 12px;
  --buddy-mascot-right-ear-y: 0px;
  --buddy-mascot-right-ear-scale: 1;
  --buddy-mascot-right-ear-rotate: 3deg;
}

.buddy-mascot--facing-right {
  --buddy-mascot-tail-root-x: -12px;
  --buddy-mascot-left-eye-facing-x: 110px;
  --buddy-mascot-right-eye-facing-x: 70px;
  --buddy-mascot-eye-facing-y: 1px;
  --buddy-mascot-left-ear-x: -12px;
  --buddy-mascot-left-ear-y: 0px;
  --buddy-mascot-left-ear-scale: 1;
  --buddy-mascot-left-ear-rotate: -3deg;
  --buddy-mascot-right-ear-x: -18px;
  --buddy-mascot-right-ear-y: 4px;
  --buddy-mascot-right-ear-scale: 0.96;
  --buddy-mascot-right-ear-rotate: -4deg;
}

.buddy-mascot__look-eye {
  transition: transform 90ms ease-out;
}

.buddy-mascot__look-eye--left {
  transform: translate(
    calc(var(--buddy-mascot-look-x, 0px) + var(--buddy-mascot-left-eye-facing-x, 0px)),
    calc(var(--buddy-mascot-look-y, 0px) + var(--buddy-mascot-eye-facing-y, 0px))
  );
}

.buddy-mascot__look-eye--right {
  transform: translate(
    calc(var(--buddy-mascot-look-x, 0px) + var(--buddy-mascot-right-eye-facing-x, 0px)),
    calc(var(--buddy-mascot-look-y, 0px) + var(--buddy-mascot-eye-facing-y, 0px))
  );
}

.buddy-mascot__resting-eye {
  opacity: 1;
  transform-origin: 50% 50%;
  transition: opacity 120ms ease;
}

.buddy-mascot__drag-eye {
  opacity: 0;
  fill: none;
  stroke: url(#buddyMascotEyeGold);
  stroke-width: 18;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: opacity 120ms ease;
}

.buddy-mascot__dizzy-eye {
  opacity: 0;
  fill: none;
  stroke: url(#buddyMascotEyeGold);
  stroke-width: 10;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: opacity 120ms ease;
}

.buddy-mascot__dizzy-eye--left {
  transform-box: view-box;
  transform-origin: -80px 82px;
}

.buddy-mascot__dizzy-eye--right {
  transform-box: view-box;
  transform-origin: 80px 82px;
}

.buddy-mascot--idle .buddy-mascot__tail {
  animation: buddy-mascot-tail-sway 1.8s ease-in-out infinite;
}

.buddy-mascot--idle .buddy-mascot__sparkle-wrap {
  animation: buddy-mascot-star-sway 3.6s ease-in-out infinite;
}

.buddy-mascot--idle .buddy-mascot__left-ear {
  animation: buddy-mascot-ear-idle-left 4.2s ease-in-out infinite;
}

.buddy-mascot--idle .buddy-mascot__right-ear {
  animation: buddy-mascot-ear-idle-right 4.2s ease-in-out infinite;
  animation-delay: 160ms;
}

.buddy-mascot--idle .buddy-mascot__resting-eye {
  animation: buddy-mascot-blink 7.2s ease-in-out infinite;
}

.buddy-mascot--thinking .buddy-mascot__tail {
  animation: buddy-mascot-tail-thinking 1.45s ease-in-out infinite;
}

.buddy-mascot--thinking .buddy-mascot__sparkle-wrap {
  animation: buddy-mascot-thinking-orbit 1.6s ease-in-out infinite;
}

.buddy-mascot--thinking .buddy-mascot__sparkle {
  animation: buddy-mascot-star-flip 860ms ease-in-out infinite;
}

.buddy-mascot--thinking .buddy-mascot__left-ear {
  animation: buddy-mascot-ear-think-left 860ms ease-in-out infinite;
}

.buddy-mascot--thinking .buddy-mascot__right-ear {
  animation: buddy-mascot-ear-think-right 860ms ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__tail {
  animation: buddy-mascot-tail-speaking 1.08s ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__body-turn {
  animation: buddy-mascot-speaking-hop 1.04s ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__body {
  animation: buddy-mascot-speaking-body-squash 1.04s ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__sparkle {
  animation: buddy-mascot-star-pulse 520ms ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__left-ear {
  animation: buddy-mascot-ear-speak-left 520ms ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__right-ear {
  animation: buddy-mascot-ear-speak-right 520ms ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__resting-eye {
  animation: buddy-mascot-speaking-eye 520ms ease-in-out infinite;
}

.buddy-mascot--error {
  filter: saturate(0.85);
}

.buddy-mascot--error .buddy-mascot__left-ear {
  animation: buddy-mascot-error-ear-left 760ms ease-out both;
}

.buddy-mascot--error .buddy-mascot__right-ear {
  animation: buddy-mascot-error-ear-right 760ms ease-out both;
}

.buddy-mascot--error .buddy-mascot__look-eye--left {
  transform: translate(-4px, 10px);
}

.buddy-mascot--error .buddy-mascot__look-eye--right {
  transform: translate(4px, 10px);
}

.buddy-mascot--error .buddy-mascot__resting-eye {
  display: none;
  opacity: 0;
}

.buddy-mascot--error .buddy-mascot__dizzy-eye {
  opacity: 1;
  animation: buddy-mascot-error-eye-spin 920ms linear infinite;
}

.buddy-mascot--error .buddy-mascot__dizzy-eye--right {
  animation-delay: -230ms;
}

.buddy-mascot--dragging .buddy-mascot__tail {
  animation: buddy-mascot-tail-drag 1.2s ease-in-out infinite;
}

.buddy-mascot--dragging .buddy-mascot__body-turn {
  animation: buddy-mascot-drag-body-wobble 860ms ease-in-out infinite;
}

.buddy-mascot--dragging .buddy-mascot__left-ear {
  animation: buddy-mascot-ear-drag-left 360ms ease-in-out infinite;
}

.buddy-mascot--dragging .buddy-mascot__right-ear {
  animation: buddy-mascot-ear-drag-right 360ms ease-in-out infinite;
}

.buddy-mascot--dragging .buddy-mascot__look-eye {
  transform: translate(0px, 0px);
}

.buddy-mascot--dragging .buddy-mascot__resting-eye {
  opacity: 0;
}

.buddy-mascot--dragging .buddy-mascot__drag-eye {
  opacity: 1;
}

.buddy-mascot--tap .buddy-mascot__sparkle {
  animation: buddy-mascot-star-tap 520ms ease-out both;
}

.buddy-mascot--tap .buddy-mascot__body-turn {
  animation: buddy-mascot-tap-hop 520ms ease-out both;
}

.buddy-mascot--tap .buddy-mascot__body {
  animation: buddy-mascot-tap-body-squash 520ms ease-out both;
}

.buddy-mascot--tap .buddy-mascot__left-ear {
  animation: buddy-mascot-ear-tap-left 520ms ease-out both;
}

.buddy-mascot--tap .buddy-mascot__right-ear {
  animation: buddy-mascot-ear-tap-right 520ms ease-out both;
}

@keyframes buddy-mascot-tail-sway {
  0%,
  100% {
    transform: rotate(-2deg);
  }
  50% {
    transform: rotate(7deg);
  }
}

@keyframes buddy-mascot-star-sway {
  0%,
  100% {
    transform: translateY(0) rotate(-4deg);
  }
  50% {
    transform: translateY(-3px) rotate(4deg);
  }
}

@keyframes buddy-mascot-cursor-ready {
  0%,
  100% {
    transform: translateY(0) rotate(-2deg);
  }
  50% {
    transform: translateY(-3px) rotate(2deg);
  }
}

@keyframes buddy-mascot-ear-idle-left {
  0%,
  82%,
  100% {
    transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + 0deg));
  }
  88% {
    transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -8deg));
  }
  94% {
    transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + 4deg));
  }
}

@keyframes buddy-mascot-ear-idle-right {
  0%,
  82%,
  100% {
    transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 0deg));
  }
  88% {
    transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 8deg));
  }
  94% {
    transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + -4deg));
  }
}

@keyframes buddy-mascot-blink {
  0%,
  90%,
  94%,
  100% {
    transform: scaleY(1);
  }
  92% {
    transform: scaleY(0.08);
  }
}

@keyframes buddy-mascot-tail-thinking {
  0%,
  100% {
    transform: rotate(-2deg);
  }
  50% {
    transform: rotate(7deg);
  }
}

@keyframes buddy-mascot-thinking-orbit {
  0%,
  100% {
    transform: translate(0, 0) rotate(-8deg);
  }
  42% {
    transform: translate(10px, -7px) rotate(10deg);
  }
  72% {
    transform: translate(-7px, 4px) rotate(-14deg);
  }
}

@keyframes buddy-mascot-star-flip {
  0%,
  100% {
    transform: scaleX(1) rotate(0deg);
    filter: brightness(1);
  }
  50% {
    transform: scaleX(0.12) rotate(18deg);
    filter: brightness(1.35);
  }
}

@keyframes buddy-mascot-ear-think-left {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-left-ear-x), calc(var(--buddy-mascot-left-ear-y) + 4px))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -9deg));
  }
  50% {
    transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -16deg));
  }
}

@keyframes buddy-mascot-ear-think-right {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-right-ear-x), calc(var(--buddy-mascot-right-ear-y) + 4px))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 9deg));
  }
  50% {
    transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 16deg));
  }
}

@keyframes buddy-mascot-star-pulse {
  0%,
  100% {
    transform: scale(1);
    filter: brightness(1);
  }
  50% {
    transform: scale(1.16);
    filter: brightness(1.18);
  }
}

@keyframes buddy-mascot-tail-speaking {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  38% {
    transform: rotate(8deg);
  }
  72% {
    transform: rotate(1deg);
  }
}

@keyframes buddy-mascot-speaking-hop {
  0%,
  100% {
    transform: translateY(0);
  }
  34% {
    transform: translateY(-5px);
  }
  62% {
    transform: translateY(-2px);
  }
}

@keyframes buddy-mascot-speaking-body-squash {
  0%,
  100% {
    transform: scale(1);
  }
  18% {
    transform: scale(1.025, 0.975) translateY(2px);
  }
  36% {
    transform: scale(0.982, 1.025) translateY(-2px);
  }
  68% {
    transform: scale(1.01, 0.99);
  }
}

@keyframes buddy-mascot-ear-speak-left {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -2deg));
  }
  50% {
    transform: translate(var(--buddy-mascot-left-ear-x), calc(var(--buddy-mascot-left-ear-y) + 2px))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -9deg));
  }
}

@keyframes buddy-mascot-ear-speak-right {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 2deg));
  }
  50% {
    transform: translate(var(--buddy-mascot-right-ear-x), calc(var(--buddy-mascot-right-ear-y) + 2px))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 9deg));
  }
}

@keyframes buddy-mascot-speaking-eye {
  0%,
  100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.9);
  }
}

@keyframes buddy-mascot-error-ear-left {
  0% {
    transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(var(--buddy-mascot-left-ear-rotate));
  }
  100% {
    transform: translate(var(--buddy-mascot-left-ear-x), calc(var(--buddy-mascot-left-ear-y) + 16px))
      scale(0.94)
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -24deg));
  }
}

@keyframes buddy-mascot-error-ear-right {
  0% {
    transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(var(--buddy-mascot-right-ear-rotate));
  }
  100% {
    transform: translate(var(--buddy-mascot-right-ear-x), calc(var(--buddy-mascot-right-ear-y) + 16px))
      scale(0.94)
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 24deg));
  }
}

@keyframes buddy-mascot-error-eye-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes buddy-mascot-tail-drag {
  0%,
  100% {
    transform: rotate(4deg);
  }
  50% {
    transform: rotate(-4deg);
  }
}

@keyframes buddy-mascot-drag-body-wobble {
  0%,
  100% {
    transform: rotate(-3deg) translateY(0);
  }
  50% {
    transform: rotate(3deg) translateY(-2px);
  }
}

@keyframes buddy-mascot-ear-drag-left {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-left-ear-x), calc(var(--buddy-mascot-left-ear-y) + 7px))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -12deg));
  }
  50% {
    transform: translate(var(--buddy-mascot-left-ear-x), calc(var(--buddy-mascot-left-ear-y) + 2px))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + -4deg));
  }
}

@keyframes buddy-mascot-ear-drag-right {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-right-ear-x), calc(var(--buddy-mascot-right-ear-y) + 7px))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 12deg));
  }
  50% {
    transform: translate(var(--buddy-mascot-right-ear-x), calc(var(--buddy-mascot-right-ear-y) + 2px))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + 4deg));
  }
}

@keyframes buddy-mascot-star-tap {
  0% {
    transform: scale(1) rotate(0deg);
    filter: brightness(1);
  }
  42% {
    transform: scale(1.22) rotate(10deg);
    filter: brightness(1.28);
  }
  100% {
    transform: scale(1) rotate(0deg);
    filter: brightness(1);
  }
}

@keyframes buddy-mascot-tap-hop {
  0%,
  100% {
    transform: translateY(0);
  }
  34% {
    transform: translateY(-10px);
  }
  62% {
    transform: translateY(-5px);
  }
}

@keyframes buddy-mascot-tap-body-squash {
  0%,
  100% {
    transform: scale(1);
  }
  18% {
    transform: scale(1.04, 0.96) translateY(4px);
  }
  38% {
    transform: scale(0.97, 1.04) translateY(-3px);
  }
  68% {
    transform: scale(1.015, 0.985);
  }
}

@keyframes buddy-mascot-ear-tap-left {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-left-ear-x), var(--buddy-mascot-left-ear-y))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(var(--buddy-mascot-left-ear-rotate));
  }
  40% {
    transform: translate(var(--buddy-mascot-left-ear-x), calc(var(--buddy-mascot-left-ear-y) - 5px))
      scale(var(--buddy-mascot-left-ear-scale))
      rotate(calc(var(--buddy-mascot-left-ear-rotate) + 9deg));
  }
}

@keyframes buddy-mascot-ear-tap-right {
  0%,
  100% {
    transform: translate(var(--buddy-mascot-right-ear-x), var(--buddy-mascot-right-ear-y))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(var(--buddy-mascot-right-ear-rotate));
  }
  40% {
    transform: translate(var(--buddy-mascot-right-ear-x), calc(var(--buddy-mascot-right-ear-y) - 5px))
      scale(var(--buddy-mascot-right-ear-scale))
      rotate(calc(var(--buddy-mascot-right-ear-rotate) + -9deg));
  }
}

</style>
