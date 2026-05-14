import { defineStore } from "pinia";
import { ref } from "vue";

import type { BuddyMascotDebugAction } from "../buddy/buddyMascotDebug.ts";

export type BuddyMascotDebugRequest = {
  id: number;
  action: BuddyMascotDebugAction;
};

export type BuddyMascotMotionDebugConfig = {
  moveDurationMs: number;
  stepPauseMs: number;
};

export const DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG: BuddyMascotMotionDebugConfig = {
  moveDurationMs: 360,
  stepPauseMs: 8,
};

const BUDDY_MASCOT_MOTION_CONFIG_STORAGE_KEY = "toograph:buddy-mascot-motion-debug-config";
const BUDDY_MASCOT_MOTION_CONFIG_LIMITS = {
  moveDurationMs: { min: 120, max: 1200 },
  stepPauseMs: { min: 0, max: 240 },
} as const;

export const useBuddyMascotDebugStore = defineStore("buddyMascotDebug", () => {
  const latestRequest = ref<BuddyMascotDebugRequest | null>(null);
  const virtualCursorEnabled = ref(false);
  const motionConfig = ref<BuddyMascotMotionDebugConfig>(readStoredMotionConfig());
  const nextRequestId = ref(0);

  function trigger(action: BuddyMascotDebugAction) {
    nextRequestId.value += 1;
    latestRequest.value = {
      id: nextRequestId.value,
      action,
    };
  }

  function setVirtualCursorEnabled(enabled: boolean) {
    virtualCursorEnabled.value = enabled;
  }

  function setMotionConfig(patch: Partial<BuddyMascotMotionDebugConfig>) {
    motionConfig.value = normalizeMotionConfig({
      ...motionConfig.value,
      ...patch,
    });
    persistMotionConfig(motionConfig.value);
  }

  function resetMotionConfig() {
    motionConfig.value = { ...DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG };
    persistMotionConfig(motionConfig.value);
  }

  return {
    latestRequest,
    virtualCursorEnabled,
    motionConfig,
    trigger,
    setVirtualCursorEnabled,
    setMotionConfig,
    resetMotionConfig,
  };
});

function readStoredMotionConfig(): BuddyMascotMotionDebugConfig {
  if (typeof window === "undefined") {
    return { ...DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG };
  }
  try {
    const storedValue = window.localStorage.getItem(BUDDY_MASCOT_MOTION_CONFIG_STORAGE_KEY);
    if (!storedValue) {
      return { ...DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG };
    }
    return normalizeMotionConfig(JSON.parse(storedValue) as Partial<BuddyMascotMotionDebugConfig>);
  } catch {
    return { ...DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG };
  }
}

function persistMotionConfig(config: BuddyMascotMotionDebugConfig) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(BUDDY_MASCOT_MOTION_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // The debug controls should still work for the current session if storage is unavailable.
  }
}

function normalizeMotionConfig(config: Partial<BuddyMascotMotionDebugConfig>): BuddyMascotMotionDebugConfig {
  return {
    moveDurationMs: clampMotionConfigValue(
      config.moveDurationMs,
      DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG.moveDurationMs,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.moveDurationMs.min,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.moveDurationMs.max,
    ),
    stepPauseMs: clampMotionConfigValue(
      config.stepPauseMs,
      DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG.stepPauseMs,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.stepPauseMs.min,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.stepPauseMs.max,
    ),
  };
}

function clampMotionConfigValue(value: unknown, fallback: number, min: number, max: number) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(numericValue, min), max);
}
