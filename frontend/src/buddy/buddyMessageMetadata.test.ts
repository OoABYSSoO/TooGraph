import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutputTraceBuddyMessageMetadata,
  resolveOutputTraceBuddyMessageMetadata,
} from "./buddyMessageMetadata.ts";
import type { BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";

const outputTrace: BuddyOutputTraceSegment = {
  segmentId: "segment_1",
  boundaryNodeId: "llm_1",
  boundaryLabel: "回复",
  outputNodeIds: ["output_1"],
  records: [
    {
      recordId: "record_1",
      runtimeKey: "node:llm_1",
      kind: "node",
      label: "LLM",
      status: "completed",
      startedAtMs: 1000,
      completedAtMs: 1800,
      durationMs: 800,
      nodeId: "llm_1",
      nodeType: "agent",
      subgraphNodeId: null,
    },
  ],
  status: "completed",
  startedAtMs: 1000,
  completedAtMs: 1800,
  durationMs: 800,
};

test("buildOutputTraceBuddyMessageMetadata stores trace segments as buddy message metadata", () => {
  assert.deepEqual(buildOutputTraceBuddyMessageMetadata(outputTrace), {
    kind: "output_trace",
    outputTrace,
  });
});

test("resolveOutputTraceBuddyMessageMetadata restores only valid trace metadata", () => {
  assert.deepEqual(resolveOutputTraceBuddyMessageMetadata({ kind: "output_trace", outputTrace }), outputTrace);
  assert.equal(resolveOutputTraceBuddyMessageMetadata({ kind: "text", outputTrace }), null);
  assert.equal(resolveOutputTraceBuddyMessageMetadata({ kind: "output_trace", outputTrace: { segmentId: "segment_1" } }), null);
});
