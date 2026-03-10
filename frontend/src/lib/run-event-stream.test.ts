import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveStreamingOutput,
  buildRunEventStreamUrl,
  parseRunEventPayloadData,
} from "./run-event-stream.ts";

test("buildRunEventStreamUrl trims run ids and skips empty streams", () => {
  assert.equal(buildRunEventStreamUrl(" run_1 "), "/api/runs/run_1/events");
  assert.equal(buildRunEventStreamUrl(" "), null);
});

test("parseRunEventPayloadData returns object payloads and ignores invalid event data", () => {
  assert.deepEqual(parseRunEventPayloadData('{"node_id":"output","text":"done"}'), {
    node_id: "output",
    text: "done",
  });
  assert.equal(parseRunEventPayloadData("not json"), null);
  assert.equal(parseRunEventPayloadData('"string"'), null);
});

test("buildLiveStreamingOutput preserves live output merge semantics", () => {
  const current = {
    nodeId: "output",
    text: "hello",
    chunkCount: 1,
    outputKeys: ["answer"],
    completed: false,
    updatedAt: "2026-04-30T00:00:00Z",
  };

  assert.deepEqual(
    buildLiveStreamingOutput(
      current,
      {
        node_id: "output",
        delta: " world",
        chunk_index: 2,
        completed: true,
        updated_at: "2026-04-30T00:00:01Z",
      },
      false,
    ),
    {
      nodeId: "output",
      text: "hello world",
      chunkCount: 2,
      outputKeys: ["answer"],
      completed: true,
      updatedAt: "2026-04-30T00:00:01Z",
    },
  );

  assert.equal(buildLiveStreamingOutput(null, { text: "missing node" }, false), null);
});
