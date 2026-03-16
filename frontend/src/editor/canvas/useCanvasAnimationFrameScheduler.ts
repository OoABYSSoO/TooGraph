type AnimationFrameScheduler = {
  requestAnimationFrame: (callback: () => void) => number;
  cancelAnimationFrame: (frameId: number) => void;
};

function resolveDefaultAnimationFrameScheduler(): AnimationFrameScheduler | null {
  if (typeof window === "undefined") {
    return null;
  }
  return {
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (frameId) => window.cancelAnimationFrame(frameId),
  };
}

export function useCanvasAnimationFrameScheduler(
  scheduler: AnimationFrameScheduler | null = resolveDefaultAnimationFrameScheduler(),
) {
  let scheduledDragFrame: number | null = null;
  let pendingDragFrameCallback: (() => void) | null = null;

  function runPendingDragFrameCallback() {
    const pendingCallback = pendingDragFrameCallback;
    pendingDragFrameCallback = null;
    pendingCallback?.();
  }

  function scheduleDragFrame(callback: () => void) {
    if (!scheduler) {
      callback();
      return;
    }

    pendingDragFrameCallback = callback;

    if (scheduledDragFrame !== null) {
      return;
    }

    scheduledDragFrame = scheduler.requestAnimationFrame(() => {
      scheduledDragFrame = null;
      runPendingDragFrameCallback();
    });
  }

  function flushScheduledDragFrame() {
    if (scheduledDragFrame === null) {
      return;
    }

    scheduler?.cancelAnimationFrame(scheduledDragFrame);
    scheduledDragFrame = null;
    runPendingDragFrameCallback();
  }

  function cancelScheduledDragFrame() {
    if (scheduledDragFrame !== null) {
      scheduler?.cancelAnimationFrame(scheduledDragFrame);
      scheduledDragFrame = null;
    }
    pendingDragFrameCallback = null;
  }

  return {
    cancelScheduledDragFrame,
    flushScheduledDragFrame,
    scheduleDragFrame,
  };
}
