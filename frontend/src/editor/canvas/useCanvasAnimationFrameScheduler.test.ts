import assert from "node:assert/strict";
import test from "node:test";

import { useCanvasAnimationFrameScheduler } from "./useCanvasAnimationFrameScheduler.ts";

function createFrameScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  const cancelled: number[] = [];

  return {
    callbacks,
    cancelled,
    scheduler: {
      requestAnimationFrame(callback: () => void) {
        const id = nextId;
        nextId += 1;
        callbacks.set(id, callback);
        return id;
      },
      cancelAnimationFrame(id: number) {
        callbacks.delete(id);
        cancelled.push(id);
      },
    },
  };
}

test("useCanvasAnimationFrameScheduler batches the latest callback into one frame", () => {
  const frame = createFrameScheduler();
  const calls: string[] = [];
  const scheduler = useCanvasAnimationFrameScheduler(frame.scheduler);

  scheduler.scheduleDragFrame(() => calls.push("first"));
  scheduler.scheduleDragFrame(() => calls.push("second"));

  assert.equal(frame.callbacks.size, 1);
  frame.callbacks.get(1)?.();
  assert.deepEqual(calls, ["second"]);
});

test("useCanvasAnimationFrameScheduler can flush the pending frame immediately", () => {
  const frame = createFrameScheduler();
  const calls: string[] = [];
  const scheduler = useCanvasAnimationFrameScheduler(frame.scheduler);

  scheduler.scheduleDragFrame(() => calls.push("pending"));
  scheduler.flushScheduledDragFrame();

  assert.deepEqual(frame.cancelled, [1]);
  assert.deepEqual(calls, ["pending"]);
  assert.equal(frame.callbacks.size, 0);
});

test("useCanvasAnimationFrameScheduler can cancel the pending frame", () => {
  const frame = createFrameScheduler();
  const calls: string[] = [];
  const scheduler = useCanvasAnimationFrameScheduler(frame.scheduler);

  scheduler.scheduleDragFrame(() => calls.push("pending"));
  scheduler.cancelScheduledDragFrame();
  frame.callbacks.get(1)?.();

  assert.deepEqual(frame.cancelled, [1]);
  assert.deepEqual(calls, []);
});
