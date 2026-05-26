import assert from "node:assert/strict";
import test from "node:test";

import { useBuddyMessages } from "./useBuddyMessages.ts";
import type { BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";

const outputTrace: BuddyOutputTraceSegment = {
  segmentId: "segment_1",
  boundaryNodeId: "agent_1",
  boundaryLabel: "回复",
  outputNodeIds: ["output_1"],
  status: "completed",
  startedAtMs: 1000,
  completedAtMs: 2000,
  durationMs: 1000,
  records: [],
};

test("messageRecordToBuddyMessage keeps historical run messages as transcript facts without trusting derived metadata", () => {
  const { messageRecordToBuddyMessage } = useBuddyMessages({ t: (key) => key });

  const message = messageRecordToBuddyMessage({
    message_id: "msg_assistant_1",
    session_id: "session_1",
    role: "assistant",
    content: "最终回复",
    client_order: 2,
    include_in_context: true,
    run_id: "run_1",
    metadata: { kind: "output_trace", outputTrace },
    created_at: "2026-05-26T00:00:00Z",
    updated_at: "2026-05-26T00:00:00Z",
  });

  assert.equal(message.id, "msg_assistant_1");
  assert.equal(message.content, "最终回复");
  assert.equal(message.runId, "run_1");
  assert.equal(message.transcriptOnly, true);
  assert.equal(message.outputTrace, undefined);
  assert.equal(message.publicOutput, undefined);
});

test("buildBuddyMessageMetadata never persists transient run display metadata", () => {
  const { buildBuddyMessageMetadata } = useBuddyMessages({ t: (key) => key });

  assert.equal(
    buildBuddyMessageMetadata({
      id: "msg_trace",
      role: "assistant",
      content: "",
      outputTrace,
    }),
    null,
  );
  assert.equal(
    buildBuddyMessageMetadata({
      id: "msg_output",
      role: "assistant",
      content: "最终回复",
      publicOutput: {
        outputNodeId: "output_1",
        stateKey: "answer",
        stateName: "answer",
        stateType: "markdown",
        displayMode: "markdown",
        kind: "text",
        content: "最终回复",
        durationMs: 1000,
        status: "completed",
      },
    }),
    null,
  );
});
