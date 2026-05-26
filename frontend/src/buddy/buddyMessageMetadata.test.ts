import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePublicOutputBuddyMessageMetadata,
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

const publicOutput = {
  outputNodeId: "output_1",
  stateKey: "answer",
  stateName: "Answer",
  stateType: "result_package",
  displayMode: "auto",
  kind: "card" as const,
  content: { ok: true, items: ["a", "b"] },
  durationMs: 800,
  status: "completed" as const,
};

test("resolvePublicOutputBuddyMessageMetadata restores only valid public output metadata", () => {
  assert.deepEqual(resolvePublicOutputBuddyMessageMetadata({ kind: "public_output", publicOutput }), publicOutput);
  assert.equal(resolvePublicOutputBuddyMessageMetadata({ kind: "output_trace", publicOutput }), null);
  assert.equal(
    resolvePublicOutputBuddyMessageMetadata({
      kind: "public_output",
      publicOutput: { ...publicOutput, status: "idle" },
    }),
    null,
  );
  assert.equal(
    resolvePublicOutputBuddyMessageMetadata({
      kind: "public_output",
      publicOutput: { ...publicOutput, durationMs: "800" },
    }),
    null,
  );
  assert.equal(
    resolvePublicOutputBuddyMessageMetadata({
      kind: "public_output",
      publicOutput: Object.fromEntries(Object.entries(publicOutput).filter(([key]) => key !== "content")),
    }),
    null,
  );
});

test("resolveOutputTraceBuddyMessageMetadata restores only valid trace metadata", () => {
  assert.deepEqual(resolveOutputTraceBuddyMessageMetadata({ kind: "output_trace", outputTrace }), outputTrace);
  assert.deepEqual(
    resolveOutputTraceBuddyMessageMetadata({
      kind: "output_trace",
      outputTrace: {
        ...outputTrace,
        records: [{ ...outputTrace.records[0], artifactLabels: ["artifacts: 2"], triggeredRunId: "run_report" }],
      },
    }),
    {
      ...outputTrace,
      records: [{ ...outputTrace.records[0], artifactLabels: ["artifacts: 2"], triggeredRunId: "run_report" }],
    },
  );
  assert.deepEqual(
    resolveOutputTraceBuddyMessageMetadata({
      kind: "output_trace",
      outputTrace: {
        ...outputTrace,
        records: [
          {
            ...outputTrace.records[0],
            graphRevision: {
              graphId: "graph_buddy",
              revisionId: "grev_buddy",
              status: "saved",
            },
          },
        ],
      },
    }),
    {
      ...outputTrace,
      records: [
        {
          ...outputTrace.records[0],
          graphRevision: {
            graphId: "graph_buddy",
            revisionId: "grev_buddy",
            status: "saved",
          },
        },
      ],
    },
  );
  assert.equal(resolveOutputTraceBuddyMessageMetadata({ kind: "text", outputTrace }), null);
  assert.equal(resolveOutputTraceBuddyMessageMetadata({ kind: "output_trace", outputTrace: { segmentId: "segment_1" } }), null);
  assert.equal(
    resolveOutputTraceBuddyMessageMetadata({
      kind: "output_trace",
      outputTrace: {
        ...outputTrace,
        records: [{ ...outputTrace.records[0], artifactLabels: "artifacts: 2" }],
      },
    }),
    null,
  );
  assert.equal(
    resolveOutputTraceBuddyMessageMetadata({
      kind: "output_trace",
      outputTrace: {
        ...outputTrace,
        records: [{ ...outputTrace.records[0], triggeredRunId: 123 }],
      },
    }),
    null,
  );
  assert.equal(
    resolveOutputTraceBuddyMessageMetadata({
      kind: "output_trace",
      outputTrace: {
        ...outputTrace,
        records: [{ ...outputTrace.records[0], graphRevision: { graphId: "graph_buddy", revisionId: 123 } }],
      },
    }),
    null,
  );
});
