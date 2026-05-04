<template>
  <span class="companion-mascot" :class="mascotClasses" aria-hidden="true">
    <svg
      class="companion-mascot__svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-260 -180 640 560"
      focusable="false"
    >
      <defs>
        <radialGradient id="companionMascotSparkleGold" cx="0" cy="-106" r="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#f2c968" />
          <stop offset="62%" stop-color="#dfad50" />
          <stop offset="100%" stop-color="#c89136" />
        </radialGradient>
        <linearGradient id="companionMascotEyeGold" x1="-104" y1="32" x2="104" y2="136" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#efbd61" />
          <stop offset="52%" stop-color="#d8a650" />
          <stop offset="100%" stop-color="#cf963d" />
        </linearGradient>
        <radialGradient id="companionMascotBlack" cx="-44" cy="-132" r="360" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#282928" />
          <stop offset="44%" stop-color="#222222" />
          <stop offset="100%" stop-color="#171818" />
        </radialGradient>
        <filter id="companionMascotSoftness" x="-280" y="-210" width="700" height="640" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.12" />
        </filter>
      </defs>

      <g class="companion-mascot__stage" filter="url(#companionMascotSoftness)">
        <path
          class="companion-mascot__tail"
          fill="none"
          stroke="url(#companionMascotBlack)"
          stroke-width="38"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M206 154 C240 154 268 136 282 108"
        />

        <g class="companion-mascot__sparkle-wrap">
          <path
            class="companion-mascot__sparkle"
            fill="url(#companionMascotSparkleGold)"
            d="M0-150 C5-124 18-111 44-106 C18-101 5-88 0-62 C-5-88 -18-101 -44-106 C-18-111 -5-124 0-150Z"
          />
        </g>

        <g class="companion-mascot__body">
          <path
            class="companion-mascot__left-ear"
            fill="url(#companionMascotBlack)"
            d="M-146-143 C-114-132-82-101-55-61 C-90-61-130-43-168-4 C-174-52-164-106-146-143Z"
          />
          <path
            class="companion-mascot__right-ear"
            fill="url(#companionMascotBlack)"
            d="M146-143 C114-132 82-101 55-61 C90-61 130-43 168-4 C174-52 164-106 146-143Z"
          />
          <path
            class="companion-mascot__head"
            fill="url(#companionMascotBlack)"
            d="M-120-80 C-88-104-42-118 0-118 C42-118 88-104 120-80 C151-56 171-18 168 20 C197 47 214 84 218 116 C226 208 145 264 0 264 C-145 264-226 208-218 116 C-214 84-197 47-168 20 C-171-18-151-56-120-80Z"
          />
          <ellipse class="companion-mascot__resting-eye companion-mascot__resting-eye--left" cx="-80" cy="82" rx="24" ry="52" fill="url(#companionMascotEyeGold)" />
          <ellipse class="companion-mascot__resting-eye companion-mascot__resting-eye--right" cx="80" cy="82" rx="24" ry="52" fill="url(#companionMascotEyeGold)" />
          <path class="companion-mascot__drag-eye companion-mascot__drag-eye--left" d="M-104 52 L-64 82 L-104 112" />
          <path class="companion-mascot__drag-eye companion-mascot__drag-eye--right" d="M104 52 L64 82 L104 112" />
        </g>
      </g>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

type CompanionMascotMood = "idle" | "thinking" | "speaking" | "error";

const props = withDefaults(
  defineProps<{
    mood?: CompanionMascotMood;
    dragging?: boolean;
    tapNonce?: number;
  }>(),
  {
    mood: "idle",
    dragging: false,
    tapNonce: 0,
  },
);

const tapAnimating = ref(false);
let tapTimeoutId: number | null = null;

const effectiveMood = computed(() => (props.dragging ? "idle" : props.mood));
const mascotClasses = computed(() => ({
  [`companion-mascot--${effectiveMood.value}`]: true,
  "companion-mascot--dragging": props.dragging,
  "companion-mascot--tap": tapAnimating.value && !props.dragging,
}));

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
</script>

<style scoped>
.companion-mascot {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.companion-mascot__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.companion-mascot__body,
.companion-mascot__tail,
.companion-mascot__sparkle-wrap,
.companion-mascot__sparkle,
.companion-mascot__left-ear,
.companion-mascot__right-ear,
.companion-mascot__resting-eye,
.companion-mascot__drag-eye {
  transform-box: fill-box;
  transform-origin: center;
}

.companion-mascot__body {
  transform-origin: 50% 70%;
}

.companion-mascot__tail {
  transform-origin: 4% 90%;
}

.companion-mascot__sparkle-wrap,
.companion-mascot__sparkle {
  transform-origin: 50% 50%;
}

.companion-mascot__left-ear {
  transform-origin: 78% 82%;
}

.companion-mascot__right-ear {
  transform-origin: 22% 82%;
}

.companion-mascot__resting-eye {
  opacity: 1;
  transform-origin: 50% 50%;
  transition: opacity 120ms ease;
}

.companion-mascot__drag-eye {
  opacity: 0;
  fill: none;
  stroke: url(#companionMascotEyeGold);
  stroke-width: 18;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: opacity 120ms ease;
}

.companion-mascot--idle .companion-mascot__body {
  animation: companion-mascot-idle-body 4.8s ease-in-out infinite;
}

.companion-mascot--idle .companion-mascot__tail {
  animation: companion-mascot-tail-sway 4.2s ease-in-out infinite;
}

.companion-mascot--idle .companion-mascot__sparkle-wrap {
  animation: companion-mascot-star-sway 3.6s ease-in-out infinite;
}

.companion-mascot--idle .companion-mascot__left-ear {
  animation: companion-mascot-ear-idle-left 6.8s ease-in-out infinite;
}

.companion-mascot--idle .companion-mascot__right-ear {
  animation: companion-mascot-ear-idle-right 6.8s ease-in-out infinite;
}

.companion-mascot--idle .companion-mascot__resting-eye {
  animation: companion-mascot-blink 7.2s ease-in-out infinite;
}

.companion-mascot--thinking .companion-mascot__body {
  animation: companion-mascot-thinking-body 1.15s ease-in-out infinite;
}

.companion-mascot--thinking .companion-mascot__sparkle {
  animation: companion-mascot-star-flip 1.22s ease-in-out infinite;
}

.companion-mascot--thinking .companion-mascot__left-ear {
  transform: rotate(-7deg) translateY(3px);
}

.companion-mascot--thinking .companion-mascot__right-ear {
  transform: rotate(7deg) translateY(3px);
}

.companion-mascot--speaking .companion-mascot__body {
  animation: companion-mascot-speaking-body 640ms ease-in-out infinite;
}

.companion-mascot--speaking .companion-mascot__sparkle {
  animation: companion-mascot-star-pulse 640ms ease-in-out infinite;
}

.companion-mascot--speaking .companion-mascot__left-ear {
  animation: companion-mascot-ear-speak-left 680ms ease-in-out infinite;
}

.companion-mascot--speaking .companion-mascot__right-ear {
  animation: companion-mascot-ear-speak-right 680ms ease-in-out infinite;
}

.companion-mascot--speaking .companion-mascot__resting-eye {
  animation: companion-mascot-speaking-eye 640ms ease-in-out infinite;
}

.companion-mascot--error {
  filter: saturate(0.85);
}

.companion-mascot--dragging .companion-mascot__body {
  transform: translateY(5px) scaleX(1.04) scaleY(0.92) rotate(-2deg);
}

.companion-mascot--dragging .companion-mascot__tail {
  animation: companion-mascot-tail-drag 520ms ease-in-out infinite;
}

.companion-mascot--dragging .companion-mascot__left-ear {
  transform: rotate(-14deg) translateY(8px);
}

.companion-mascot--dragging .companion-mascot__right-ear {
  transform: rotate(14deg) translateY(8px);
}

.companion-mascot--dragging .companion-mascot__resting-eye {
  opacity: 0;
}

.companion-mascot--dragging .companion-mascot__drag-eye {
  opacity: 1;
}

.companion-mascot--tap .companion-mascot__body {
  animation: companion-mascot-tap-body 520ms cubic-bezier(0.2, 1.5, 0.32, 1) both;
}

.companion-mascot--tap .companion-mascot__sparkle {
  animation: companion-mascot-star-tap 520ms ease-out both;
}

.companion-mascot--tap .companion-mascot__left-ear {
  animation: companion-mascot-ear-tap-left 520ms ease-out both;
}

.companion-mascot--tap .companion-mascot__right-ear {
  animation: companion-mascot-ear-tap-right 520ms ease-out both;
}

@keyframes companion-mascot-idle-body {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-4px) rotate(-1deg);
  }
}

@keyframes companion-mascot-tail-sway {
  0%,
  100% {
    transform: rotate(-2deg);
  }
  50% {
    transform: rotate(8deg);
  }
}

@keyframes companion-mascot-star-sway {
  0%,
  100% {
    transform: translateY(0) rotate(-4deg);
  }
  50% {
    transform: translateY(-3px) rotate(4deg);
  }
}

@keyframes companion-mascot-ear-idle-left {
  0%,
  82%,
  100% {
    transform: rotate(0deg);
  }
  88% {
    transform: rotate(-5deg);
  }
  94% {
    transform: rotate(2deg);
  }
}

@keyframes companion-mascot-ear-idle-right {
  0%,
  82%,
  100% {
    transform: rotate(0deg);
  }
  88% {
    transform: rotate(5deg);
  }
  94% {
    transform: rotate(-2deg);
  }
}

@keyframes companion-mascot-blink {
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

@keyframes companion-mascot-thinking-body {
  0%,
  100% {
    transform: translateY(0) rotate(-1deg);
  }
  50% {
    transform: translateY(-2px) rotate(1.5deg);
  }
}

@keyframes companion-mascot-star-flip {
  0%,
  100% {
    transform: scaleX(1);
    filter: brightness(1);
  }
  50% {
    transform: scaleX(0.18);
    filter: brightness(1.22);
  }
}

@keyframes companion-mascot-speaking-body {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-5px) scale(1.035);
  }
}

@keyframes companion-mascot-star-pulse {
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

@keyframes companion-mascot-ear-speak-left {
  0%,
  100% {
    transform: rotate(-2deg);
  }
  50% {
    transform: rotate(-9deg) translateY(2px);
  }
}

@keyframes companion-mascot-ear-speak-right {
  0%,
  100% {
    transform: rotate(2deg);
  }
  50% {
    transform: rotate(9deg) translateY(2px);
  }
}

@keyframes companion-mascot-speaking-eye {
  0%,
  100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.9);
  }
}

@keyframes companion-mascot-tail-drag {
  0%,
  100% {
    transform: rotate(8deg);
  }
  50% {
    transform: rotate(-10deg);
  }
}

@keyframes companion-mascot-tap-body {
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

@keyframes companion-mascot-star-tap {
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

@keyframes companion-mascot-ear-tap-left {
  0%,
  100% {
    transform: rotate(0deg);
  }
  40% {
    transform: rotate(9deg) translateY(-5px);
  }
}

@keyframes companion-mascot-ear-tap-right {
  0%,
  100% {
    transform: rotate(0deg);
  }
  40% {
    transform: rotate(-9deg) translateY(-5px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .companion-mascot,
  .companion-mascot * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
