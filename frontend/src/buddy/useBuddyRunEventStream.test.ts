import test from "node:test";
import assert from "node:assert/strict";

import { pollBuddyRunUntilFinished } from "./useBuddyRunEventStream.ts";

test("pollBuddyRunUntilFinished keeps polling active runs until a terminal status", async () => {
  const seenRunIds: string[] = [];
  const waited: number[] = [];
  const result = await pollBuddyRunUntilFinished("run_123", new AbortController().signal, {
    intervalMs: 25,
    fetchRunDetail: async (runId) => {
      seenRunIds.push(runId);
      return {
        run_id: runId,
        status: seenRunIds.length < 3 ? "running" : "completed",
      } as never;
    },
    waitForDelay: async (timeoutMs) => {
      waited.push(timeoutMs);
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(seenRunIds, ["run_123", "run_123", "run_123"]);
  assert.deepEqual(waited, [25, 25]);
});

test("pollBuddyRunUntilFinished forwards abort signals to fetch and delay", async () => {
  const controller = new AbortController();
  const fetchSignals: AbortSignal[] = [];
  const delaySignals: AbortSignal[] = [];

  await assert.rejects(
    pollBuddyRunUntilFinished("run_abort", controller.signal, {
      fetchRunDetail: async (_runId, options) => {
        fetchSignals.push(options.signal);
        return { run_id: "run_abort", status: "queued" } as never;
      },
      waitForDelay: async (_timeoutMs, signal) => {
        delaySignals.push(signal);
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    }),
    /Aborted/,
  );

  assert.equal(fetchSignals[0], controller.signal);
  assert.equal(delaySignals[0], controller.signal);
});
