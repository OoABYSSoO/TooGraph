import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveStreamingOutput,
  buildRunEventStreamUrl,
  listRunEventOutputKeys,
  parseRunEventPayloadData,
  resolveRunEventNodeId,
  resolveRunEventText,
  shouldPollRunStatus,
} from "./run-event-stream.ts";

test("buildRunEventStreamUrl trims run ids and skips empty streams", () => {
  assert.equal(buildRunEventStreamUrl(" run_1 "), "/api/runs/run_1/events");
  assert.equal(buildRunEventStreamUrl(" "), null);
});

test("shouldPollRunStatus follows queued, running, and resuming semantics", () => {
  assert.equal(shouldPollRunStatus("queued"), true);
  assert.equal(shouldPollRunStatus("running"), true);
  assert.equal(shouldPollRunStatus("resuming"), true);
  assert.equal(shouldPollRunStatus("completed"), false);
  assert.equal(shouldPollRunStatus("failed"), false);
  assert.equal(shouldPollRunStatus(null), false);
});

test("parseRunEventPayloadData returns object payloads and ignores invalid event data", () => {
  assert.deepEqual(parseRunEventPayloadData('{"node_id":"output","text":"done"}'), {
    node_id: "output",
    text: "done",
  });
  assert.equal(parseRunEventPayloadData("not json"), null);
  assert.equal(parseRunEventPayloadData('"string"'), null);
});

test("resolveRunEventNodeId trims node ids and skips missing ids", () => {
  assert.equal(resolveRunEventNodeId({ node_id: " output_1 " }), "output_1");
  assert.equal(resolveRunEventNodeId({ node_id: null }), "");
  assert.equal(resolveRunEventNodeId({}), "");
});

test("resolveRunEventText preserves explicit text and only uses fallback when text is absent", () => {
  assert.equal(resolveRunEventText({ text: "ready", delta: " ignored" }, "fallback"), "ready");
  assert.equal(resolveRunEventText({ text: "", delta: " ignored" }, "fallback"), "");
  assert.equal(resolveRunEventText({ delta: " chunk" }, "fallback"), "fallback");
});

test("listRunEventOutputKeys normalizes keys and preserves fallback when keys are absent", () => {
  assert.deepEqual(listRunEventOutputKeys({ output_keys: ["answer", 2, "", null] }), ["answer", "2", "null"]);
  assert.deepEqual(listRunEventOutputKeys({ output_keys: "answer" }, ["fallback"]), ["fallback"]);
  assert.deepEqual(listRunEventOutputKeys({}, ["fallback"]), ["fallback"]);
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
