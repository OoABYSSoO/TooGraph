import { defineStore } from "pinia";
import { ref } from "vue";

import type { BuddyMascotDebugAction } from "../buddy/buddyMascotDebug.ts";
import type {
  BuddyVirtualOperation,
  BuddyVirtualOperationCursorLifecycle,
  BuddyVirtualOperationPlan,
} from "../buddy/virtualOperationProtocol.ts";

export type BuddyMascotDebugRequest = {
  id: number;
  action: BuddyMascotDebugAction;
};

export type { BuddyVirtualOperation, BuddyVirtualOperationCursorLifecycle };

export type BuddyVirtualOperationRequest = {
  id: number;
  request: BuddyVirtualOperationPlan;
};

export type BuddyVirtualOperationRunAttribution = {
  operationRequestId: string;
  targetId: string;
  commands: string[];
};

export type BuddyVirtualOperationTriggeredRun = {
  operationRequestId: string;
  targetId: string;
  tabId: string;
  runId: string;
  graphId: string | null;
  initialStatus: string;
};

export type BuddyMascotMotionDebugConfig = {
  moveDurationMs: number;
  stepPauseMs: number;
  virtualCursorFlightSpeedPxPerS: number;
  virtualCursorRotationSpeedDegPerS: number;
  mascotLookRangeX: number;
  mascotLookRangeY: number;
  virtualCursorFollowMaxDistancePx: number;
};

export const DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG: BuddyMascotMotionDebugConfig = {
  moveDurationMs: 360,
  stepPauseMs: 8,
  virtualCursorFlightSpeedPxPerS: 1200,
  virtualCursorRotationSpeedDegPerS: 720,
  mascotLookRangeX: 40,
  mascotLookRangeY: 28,
  virtualCursorFollowMaxDistancePx: 64,
};

const BUDDY_MASCOT_MOTION_CONFIG_STORAGE_KEY = "toograph:buddy-mascot-motion-debug-config";
const BUDDY_MASCOT_MOTION_CONFIG_LIMITS = {
  moveDurationMs: { min: 120, max: 1200 },
  stepPauseMs: { min: 0, max: 240 },
  virtualCursorFlightSpeedPxPerS: { min: 40, max: 1200 },
  virtualCursorRotationSpeedDegPerS: { min: 90, max: 1440 },
  mascotLookRangeX: { min: 8, max: 40 },
  mascotLookRangeY: { min: 6, max: 28 },
  virtualCursorFollowMaxDistancePx: { min: 32, max: 360 },
} as const;

export const useBuddyMascotDebugStore = defineStore("buddyMascotDebug", () => {
  const latestRequest = ref<BuddyMascotDebugRequest | null>(null);
  const latestVirtualOperationRequest = ref<BuddyVirtualOperationRequest | null>(null);
  const pendingRunAttribution = ref<BuddyVirtualOperationRunAttribution | null>(null);
  const triggeredRunByOperationRequestId = ref<Record<string, BuddyVirtualOperationTriggeredRun>>({});
  const virtualCursorEnabled = ref(false);
  const motionConfig = ref<BuddyMascotMotionDebugConfig>(readStoredMotionConfig());
  const nextRequestId = ref(0);
  const nextVirtualOperationRequestId = ref(0);

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

  function requestVirtualOperation(request: BuddyVirtualOperationPlan) {
    nextVirtualOperationRequestId.value += 1;
    latestVirtualOperationRequest.value = {
      id: nextVirtualOperationRequestId.value,
      request: {
        ...request,
        commands: [...request.commands],
        operations: request.operations.map((operation) =>
          operation.kind === "graph_edit"
            ? {
                ...operation,
                graphEditIntents: operation.graphEditIntents.map((intent) => ({ ...intent })),
              }
            : { ...operation },
        ),
      },
    };
  }

  function beginVirtualOperationRunAttribution(request: BuddyVirtualOperationPlan) {
    const targetId = resolveRunButtonOperationTarget(request);
    const operationRequestId = normalizeText(request.operationRequestId);
    if (!targetId || !operationRequestId) {
      pendingRunAttribution.value = null;
      return;
    }
    pendingRunAttribution.value = {
      operationRequestId,
      targetId,
      commands: [...request.commands],
    };
  }

  function consumeVirtualOperationRunAttribution(targetId: string): BuddyVirtualOperationRunAttribution | null {
    const pending = pendingRunAttribution.value;
    if (!pending || pending.targetId !== normalizeText(targetId)) {
      return null;
    }
    pendingRunAttribution.value = null;
    return {
      ...pending,
      commands: [...pending.commands],
    };
  }

  function recordVirtualOperationTriggeredRun(record: BuddyVirtualOperationTriggeredRun) {
    const operationRequestId = normalizeText(record.operationRequestId);
    const runId = normalizeText(record.runId);
    if (!operationRequestId || !runId) {
      return;
    }
    triggeredRunByOperationRequestId.value = {
      ...triggeredRunByOperationRequestId.value,
      [operationRequestId]: {
        operationRequestId,
        targetId: normalizeText(record.targetId),
        tabId: normalizeText(record.tabId),
        runId,
        graphId: normalizeText(record.graphId) || null,
        initialStatus: normalizeText(record.initialStatus) || "unknown",
      },
    };
  }

  function resolveVirtualOperationTriggeredRun(operationRequestId: string): BuddyVirtualOperationTriggeredRun | null {
    const record = triggeredRunByOperationRequestId.value[normalizeText(operationRequestId)];
    return record ? { ...record } : null;
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
    latestVirtualOperationRequest,
    virtualCursorEnabled,
    motionConfig,
    trigger,
    setVirtualCursorEnabled,
    requestVirtualOperation,
    beginVirtualOperationRunAttribution,
    consumeVirtualOperationRunAttribution,
    recordVirtualOperationTriggeredRun,
    resolveVirtualOperationTriggeredRun,
    setMotionConfig,
    resetMotionConfig,
  };
});

function resolveRunButtonOperationTarget(request: BuddyVirtualOperationPlan) {
  const operation = request.operations.find((item) => "targetId" in item && item.targetId === "editor.action.runActiveGraph");
  return operation && "targetId" in operation ? operation.targetId : "";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

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
    virtualCursorFlightSpeedPxPerS: clampMotionConfigValue(
      config.virtualCursorFlightSpeedPxPerS,
      DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG.virtualCursorFlightSpeedPxPerS,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.virtualCursorFlightSpeedPxPerS.min,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.virtualCursorFlightSpeedPxPerS.max,
    ),
    virtualCursorRotationSpeedDegPerS: clampMotionConfigValue(
      config.virtualCursorRotationSpeedDegPerS,
      DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG.virtualCursorRotationSpeedDegPerS,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.virtualCursorRotationSpeedDegPerS.min,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.virtualCursorRotationSpeedDegPerS.max,
    ),
    mascotLookRangeX: clampMotionConfigValue(
      config.mascotLookRangeX,
      DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG.mascotLookRangeX,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.mascotLookRangeX.min,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.mascotLookRangeX.max,
    ),
    mascotLookRangeY: clampMotionConfigValue(
      config.mascotLookRangeY,
      DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG.mascotLookRangeY,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.mascotLookRangeY.min,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.mascotLookRangeY.max,
    ),
    virtualCursorFollowMaxDistancePx: clampMotionConfigValue(
      config.virtualCursorFollowMaxDistancePx,
      DEFAULT_BUDDY_MASCOT_MOTION_DEBUG_CONFIG.virtualCursorFollowMaxDistancePx,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.virtualCursorFollowMaxDistancePx.min,
      BUDDY_MASCOT_MOTION_CONFIG_LIMITS.virtualCursorFollowMaxDistancePx.max,
    ),
  };
}

function clampMotionConfigValue(value: unknown, fallback: number, min: number, max: number, precision = 0) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clampedValue = Math.min(Math.max(numericValue, min), max);
  const scale = 10 ** precision;
  return Math.round(clampedValue * scale) / scale;
}
