<template>
  <span class="buddy-mascot" :class="mascotClasses" :style="eyeLookStyle" aria-hidden="true">
    <svg
      class="buddy-mascot__svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-260 -180 640 560"
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
        <filter id="buddyMascotSoftness" x="-280" y="-210" width="700" height="640" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.12" />
        </filter>
      </defs>

      <g class="buddy-mascot__stage" filter="url(#buddyMascotSoftness)">
        <g class="buddy-mascot__tail buddy-mascot__tail-rig">
          <path
            class="buddy-mascot__tail-pose buddy-mascot__tail-pose--right"
            d="M0 176 C54 214 104 166 154 160 C212 152 240 112 260 82 C270 66 278 60 282 62"
          >
            <animate
              attributeName="d"
              dur="3.6s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.25;0.5;0.75;1"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
              values="M0 176 C54 214 104 166 154 160 C212 152 240 112 260 82 C270 66 278 60 282 62;M0 176 C62 198 124 178 178 150 C222 126 254 86 274 68 C278 64 280 62 282 62;M0 176 C70 180 138 148 196 116 C236 94 264 74 278 64 C280 62 282 62 282 62;M0 176 C64 184 122 198 170 162 C214 132 246 88 272 66 C276 62 280 60 282 62;M0 176 C54 214 104 166 154 160 C212 152 240 112 260 82 C270 66 278 60 282 62"
            />
          </path>
          <path
            class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-right"
            d="M0 176 C36 204 72 166 100 146 C130 124 158 82 156 62 C156 56 154 52 152 54"
          >
            <animate
              attributeName="d"
              dur="3.9s"
              begin="-0.3s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.25;0.5;0.75;1"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
              values="M0 176 C36 204 72 166 100 146 C130 124 158 82 156 62 C156 56 154 52 152 54;M0 176 C42 190 84 166 116 134 C144 106 166 76 156 58 C154 54 152 52 152 54;M0 176 C48 174 88 146 120 116 C140 96 152 72 154 58 C154 54 153 52 152 54;M0 176 C28 182 84 174 118 136 C148 104 168 78 158 58 C156 54 154 52 152 54;M0 176 C36 204 72 166 100 146 C130 124 158 82 156 62 C156 56 154 52 152 54"
            />
          </path>
          <path
            class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-center"
            d="M0 176 C-24 164 20 138 -2 108 C-20 82 -12 58 0 48 C8 54 12 62 8 72"
          >
            <animate
              attributeName="d"
              dur="4.2s"
              begin="-0.6s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.25;0.5;0.75;1"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
              values="M0 176 C-24 164 20 138 -2 108 C-20 82 -12 58 0 48 C8 54 12 62 8 72;M0 176 C-8 158 -8 124 -2 92 C0 70 4 54 8 46 C10 50 12 58 8 72;M0 176 C0 154 0 116 0 84 C0 62 0 50 2 44 C6 50 8 60 8 72;M0 176 C8 158 8 124 2 92 C0 70 -4 54 -8 46 C-10 50 -12 58 -8 72;M0 176 C24 164 -20 138 2 108 C20 82 12 58 0 48 C-8 54 -12 62 -8 72"
            />
          </path>
          <path
            class="buddy-mascot__tail-pose buddy-mascot__tail-pose--back-left"
            d="M0 176 C-36 204 -72 166 -100 146 C-130 124 -158 82 -156 62 C-156 56 -154 52 -152 54"
          >
            <animate
              attributeName="d"
              dur="3.9s"
              begin="-0.3s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.25;0.5;0.75;1"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
              values="M0 176 C-36 204 -72 166 -100 146 C-130 124 -158 82 -156 62 C-156 56 -154 52 -152 54;M0 176 C-42 190 -84 166 -116 134 C-144 106 -166 76 -156 58 C-154 54 -152 52 -152 54;M0 176 C-48 174 -88 146 -120 116 C-140 96 -152 72 -154 58 C-154 54 -153 52 -152 54;M0 176 C-28 182 -84 174 -118 136 C-148 104 -168 78 -158 58 C-156 54 -154 52 -152 54;M0 176 C-36 204 -72 166 -100 146 C-130 124 -158 82 -156 62 C-156 56 -154 52 -152 54"
            />
          </path>
          <path
            class="buddy-mascot__tail-pose buddy-mascot__tail-pose--left"
            d="M0 176 C-54 214 -104 166 -154 160 C-212 152 -240 112 -260 82 C-270 66 -278 60 -282 62"
          >
            <animate
              attributeName="d"
              dur="3.6s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.25;0.5;0.75;1"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
              values="M0 176 C-54 214 -104 166 -154 160 C-212 152 -240 112 -260 82 C-270 66 -278 60 -282 62;M0 176 C-62 198 -124 178 -178 150 C-222 126 -254 86 -274 68 C-278 64 -280 62 -282 62;M0 176 C-70 180 -138 148 -196 116 C-236 94 -264 74 -278 64 C-280 62 -282 62 -282 62;M0 176 C-64 184 -122 198 -170 162 C-214 132 -246 88 -272 66 C-276 62 -280 60 -282 62;M0 176 C-54 214 -104 166 -154 160 C-212 152 -240 112 -260 82 C-270 66 -278 60 -282 62"
            />
          </path>
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
            </g>
            <g class="buddy-mascot__look-eye buddy-mascot__look-eye--right">
              <ellipse class="buddy-mascot__resting-eye buddy-mascot__resting-eye--right" cx="80" cy="82" rx="24" ry="52" fill="url(#buddyMascotEyeGold)" />
            </g>
            <path class="buddy-mascot__drag-eye buddy-mascot__drag-eye--left" d="M-104 52 L-64 82 L-104 112" />
            <path class="buddy-mascot__drag-eye buddy-mascot__drag-eye--right" d="M104 52 L64 82 L104 112" />
          </g>
        </g>

        <g class="buddy-mascot__sparkle-wrap">
          <path
            class="buddy-mascot__sparkle"
            fill="url(#buddyMascotSparkleGold)"
            d="M0-180 C5-154 18-141 44-136 C18-131 5-118 0-92 C-5-118 -18-131 -44-136 C-18-141 -5-154 0-180Z"
          />
        </g>
      </g>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

type BuddyMascotMood = "idle" | "thinking" | "speaking" | "error";
type BuddyMascotMotion = "idle" | "roam" | "hop" | "spin";
type BuddyMascotFacing = "front" | "left" | "right";

const props = withDefaults(
  defineProps<{
    mood?: BuddyMascotMood;
    motion?: BuddyMascotMotion;
    facing?: BuddyMascotFacing;
    dragging?: boolean;
    tapNonce?: number;
    lookX?: number;
    lookY?: number;
  }>(),
  {
    mood: "idle",
    motion: "idle",
    facing: "front",
    dragging: false,
    tapNonce: 0,
    lookX: 0,
    lookY: 0,
  },
);

const tapAnimating = ref(false);
let tapTimeoutId: number | null = null;

const effectiveMood = computed(() => (props.dragging ? "idle" : props.mood));
const effectiveMotion = computed(() => (props.dragging || props.mood !== "idle" ? "idle" : props.motion));
const mascotClasses = computed(() => ({
  [`buddy-mascot--${effectiveMood.value}`]: true,
  [`buddy-mascot--motion-${effectiveMotion.value}`]: true,
  [`buddy-mascot--facing-${props.facing}`]: true,
  "buddy-mascot--dragging": props.dragging,
  "buddy-mascot--tap": tapAnimating.value && !props.dragging,
}));
const eyeLookStyle = computed<Record<string, string>>(() => {
  const x = clampLookAxis(props.lookX) * 11;
  const y = clampLookAxis(props.lookY) * 7;
  return {
    "--buddy-mascot-look-x": `${x.toFixed(2)}px`,
    "--buddy-mascot-look-y": `${y.toFixed(2)}px`,
  };
});

watch(() => props.tapNonce, triggerTapAnimation);

onBeforeUnmount(() => {
  clearTapTimeout();
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
.buddy-mascot__tail,
.buddy-mascot__tail-pose,
.buddy-mascot__sparkle-wrap,
.buddy-mascot__sparkle,
.buddy-mascot__left-ear,
.buddy-mascot__right-ear,
.buddy-mascot__look-eye,
.buddy-mascot__resting-eye,
.buddy-mascot__drag-eye {
  transform-box: fill-box;
  transform-origin: center;
}

.buddy-mascot__body {
  transform-origin: 50% 70%;
}

.buddy-mascot__body-turn {
  transform-origin: 50% 72%;
  transition: transform 180ms ease;
}

.buddy-mascot__tail {
  transform-origin: 50% 78%;
}

.buddy-mascot__tail-pose {
  fill: none;
  stroke: url(#buddyMascotBlack);
  stroke-width: 38;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
  transition: opacity 160ms ease;
}

.buddy-mascot__tail-pose--right {
  opacity: 1;
}

.buddy-mascot__sparkle-wrap,
.buddy-mascot__sparkle {
  transform-origin: 50% 50%;
}

.buddy-mascot__left-ear {
  transform-origin: 78% 82%;
}

.buddy-mascot__right-ear {
  transform-origin: 22% 82%;
}

.buddy-mascot--facing-left .buddy-mascot__body-turn {
  transform: scaleX(0.92) rotate(-2deg);
}

.buddy-mascot--facing-right .buddy-mascot__body-turn {
  transform: scaleX(0.92) rotate(2deg);
}

.buddy-mascot--facing-left .buddy-mascot__tail-pose--right {
  opacity: 0;
}

.buddy-mascot--facing-left .buddy-mascot__tail-pose--left {
  opacity: 1;
}

.buddy-mascot--facing-right .buddy-mascot__tail-pose--left {
  opacity: 0;
}

.buddy-mascot--facing-right .buddy-mascot__tail-pose--right {
  opacity: 1;
}

.buddy-mascot__look-eye {
  transform: translate(var(--buddy-mascot-look-x, 0px), var(--buddy-mascot-look-y, 0px));
  transition: transform 90ms ease-out;
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

.buddy-mascot--idle .buddy-mascot__body {
  animation: buddy-mascot-idle-body 4.8s ease-in-out infinite;
}

.buddy-mascot--idle .buddy-mascot__tail {
  animation: buddy-mascot-tail-sway 3.2s ease-in-out infinite;
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
  animation: buddy-mascot-tail-thinking 760ms ease-in-out infinite;
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

.buddy-mascot--speaking .buddy-mascot__body {
  animation: buddy-mascot-speaking-body 460ms ease-in-out infinite;
}

.buddy-mascot--speaking .buddy-mascot__tail {
  animation: buddy-mascot-tail-speaking 430ms ease-in-out infinite;
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

.buddy-mascot--dragging .buddy-mascot__body {
  animation: buddy-mascot-drag-body 720ms ease-in-out infinite;
}

.buddy-mascot--dragging .buddy-mascot__tail {
  animation: buddy-mascot-tail-drag 420ms ease-in-out infinite;
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

.buddy-mascot--tap .buddy-mascot__body {
  animation: buddy-mascot-tap-body 520ms cubic-bezier(0.2, 1.5, 0.32, 1) both;
}

.buddy-mascot--tap .buddy-mascot__sparkle {
  animation: buddy-mascot-star-tap 520ms ease-out both;
}

.buddy-mascot--tap .buddy-mascot__left-ear {
  animation: buddy-mascot-ear-tap-left 520ms ease-out both;
}

.buddy-mascot--tap .buddy-mascot__right-ear {
  animation: buddy-mascot-ear-tap-right 520ms ease-out both;
}

.buddy-mascot--motion-roam .buddy-mascot__body-turn {
  animation: buddy-mascot-roam-hop 980ms cubic-bezier(0.22, 1.25, 0.36, 1) both;
}

.buddy-mascot--motion-hop .buddy-mascot__body-turn {
  animation: buddy-mascot-roam-hop 760ms cubic-bezier(0.22, 1.25, 0.36, 1) both;
}

.buddy-mascot--motion-spin .buddy-mascot__body-turn {
  animation: buddy-mascot-spin-turn 980ms cubic-bezier(0.2, 1.18, 0.3, 1) both;
}

.buddy-mascot--motion-spin .buddy-mascot__tail-pose--right {
  animation: buddy-mascot-tail-spin-right 980ms ease-in-out both;
}

.buddy-mascot--motion-spin .buddy-mascot__tail-pose--back-right {
  animation: buddy-mascot-tail-spin-back-right 980ms ease-in-out both;
}

.buddy-mascot--motion-spin .buddy-mascot__tail-pose--back-center {
  animation: buddy-mascot-tail-spin-back-center 980ms ease-in-out both;
}

.buddy-mascot--motion-spin .buddy-mascot__tail-pose--back-left {
  animation: buddy-mascot-tail-spin-back-left 980ms ease-in-out both;
}

.buddy-mascot--motion-spin .buddy-mascot__tail-pose--left {
  animation: buddy-mascot-tail-spin-left 980ms ease-in-out both;
}

@keyframes buddy-mascot-idle-body {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-4px) rotate(-1deg);
  }
}

@keyframes buddy-mascot-roam-hop {
  0% {
    transform: translateY(0) scaleX(1) scaleY(1);
  }
  18% {
    transform: translateY(10px) scaleX(1.08) scaleY(0.9);
  }
  48% {
    transform: translateY(-18px) scaleX(0.88) scaleY(1.12);
  }
  78% {
    transform: translateY(4px) scaleX(1.04) scaleY(0.96);
  }
  100% {
    transform: translateY(0) scaleX(1) scaleY(1);
  }
}

@keyframes buddy-mascot-spin-turn {
  0% {
    transform: translateY(0) scaleX(1) scaleY(1) rotate(0deg);
  }
  18% {
    transform: translateY(10px) scaleX(1.1) scaleY(0.88) rotate(0deg);
  }
  42% {
    transform: translateY(-24px) scaleX(0.18) scaleY(1.14) rotate(-5deg);
  }
  58% {
    transform: translateY(-24px) scaleX(-0.18) scaleY(1.14) rotate(5deg);
  }
  82% {
    transform: translateY(6px) scaleX(1.08) scaleY(0.92) rotate(0deg);
  }
  100% {
    transform: translateY(0) scaleX(1) scaleY(1) rotate(0deg);
  }
}

@keyframes buddy-mascot-tail-spin-right {
  0%,
  12% {
    opacity: 1;
  }
  24%,
  88% {
    opacity: 0;
  }
  96%,
  100% {
    opacity: 1;
  }
}

@keyframes buddy-mascot-tail-spin-back-right {
  0%,
  10% {
    opacity: 0;
  }
  18%,
  30% {
    opacity: 1;
  }
  38%,
  82% {
    opacity: 0;
  }
  90%,
  96% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes buddy-mascot-tail-spin-back-center {
  0%,
  22% {
    opacity: 0;
  }
  30%,
  40% {
    opacity: 1;
  }
  48%,
  68% {
    opacity: 0;
  }
  76%,
  86% {
    opacity: 1;
  }
  94%,
  100% {
    opacity: 0;
  }
}

@keyframes buddy-mascot-tail-spin-back-left {
  0%,
  36% {
    opacity: 0;
  }
  44%,
  54% {
    opacity: 1;
  }
  62% {
    opacity: 0;
  }
  66%,
  76% {
    opacity: 1;
  }
  84%,
  100% {
    opacity: 0;
  }
}

@keyframes buddy-mascot-tail-spin-left {
  0%,
  50% {
    opacity: 0;
  }
  56%,
  66% {
    opacity: 1;
  }
  76%,
  100% {
    opacity: 0;
  }
}

@keyframes buddy-mascot-tail-sway {
  0%,
  100% {
    transform: rotate(-7deg);
  }
  50% {
    transform: rotate(15deg);
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

@keyframes buddy-mascot-ear-idle-left {
  0%,
  82%,
  100% {
    transform: rotate(0deg);
  }
  88% {
    transform: rotate(-8deg);
  }
  94% {
    transform: rotate(4deg);
  }
}

@keyframes buddy-mascot-ear-idle-right {
  0%,
  82%,
  100% {
    transform: rotate(0deg);
  }
  88% {
    transform: rotate(8deg);
  }
  94% {
    transform: rotate(-4deg);
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
    transform: rotate(-8deg);
  }
  50% {
    transform: rotate(24deg);
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
    transform: rotate(-9deg) translateY(4px);
  }
  50% {
    transform: rotate(-16deg) translateY(0);
  }
}

@keyframes buddy-mascot-ear-think-right {
  0%,
  100% {
    transform: rotate(9deg) translateY(4px);
  }
  50% {
    transform: rotate(16deg) translateY(0);
  }
}

@keyframes buddy-mascot-speaking-body {
  0%,
  100% {
    transform: translateY(0) scaleX(1) scaleY(1);
  }
  28% {
    transform: translateY(2px) scaleX(1.06) scaleY(0.95);
  }
  62% {
    transform: translateY(-6px) scaleX(0.96) scaleY(1.05);
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
    transform: rotate(-12deg);
  }
  38% {
    transform: rotate(28deg);
  }
  72% {
    transform: rotate(2deg);
  }
}

@keyframes buddy-mascot-ear-speak-left {
  0%,
  100% {
    transform: rotate(-2deg);
  }
  50% {
    transform: rotate(-9deg) translateY(2px);
  }
}

@keyframes buddy-mascot-ear-speak-right {
  0%,
  100% {
    transform: rotate(2deg);
  }
  50% {
    transform: rotate(9deg) translateY(2px);
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

@keyframes buddy-mascot-tail-drag {
  0%,
  100% {
    transform: rotate(18deg);
  }
  50% {
    transform: rotate(-18deg);
  }
}

@keyframes buddy-mascot-drag-body {
  0%,
  100% {
    transform: translateY(1px) scaleX(0.96) scaleY(1.04) rotate(-5deg);
  }
  50% {
    transform: translateY(-2px) scaleX(0.98) scaleY(1.02) rotate(5deg);
  }
}

@keyframes buddy-mascot-ear-drag-left {
  0%,
  100% {
    transform: rotate(-18deg) translateY(8px);
  }
  50% {
    transform: rotate(-4deg) translateY(2px);
  }
}

@keyframes buddy-mascot-ear-drag-right {
  0%,
  100% {
    transform: rotate(18deg) translateY(8px);
  }
  50% {
    transform: rotate(4deg) translateY(2px);
  }
}

@keyframes buddy-mascot-tap-body {
  0% {
    transform: translateY(0) scale(1);
  }
  38% {
    transform: translateY(-9px) scale(1.08);
  }
  100% {
    transform: translateY(0) scale(1);
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

@keyframes buddy-mascot-ear-tap-left {
  0%,
  100% {
    transform: rotate(0deg);
  }
  40% {
    transform: rotate(9deg) translateY(-5px);
  }
}

@keyframes buddy-mascot-ear-tap-right {
  0%,
  100% {
    transform: rotate(0deg);
  }
  40% {
    transform: rotate(-9deg) translateY(-5px);
  }
}

</style>
