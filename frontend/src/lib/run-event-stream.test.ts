import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveStreamingOutput,
  buildRunEventOutputPreviewByNodeId,
  buildRunEventOutputPreviewUpdate,
  buildRunEventStreamUrl,
  parseRunEventPayload,
  listRunEventOutputKeys,
  parseRunEventPayloadData,
  resolveRunEventNodeId,
  resolveRunEventPreviewNodeIds,
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

test("parseRunEventPayload reads MessageEvent payloads and ignores other events", () => {
  assert.deepEqual(parseRunEventPayload(new MessageEvent("message", { data: '{"node_id":"output","text":"done"}' })), {
    node_id: "output",
    text: "done",
  });
  assert.equal(parseRunEventPayload(new MessageEvent("message", { data: "not json" })), null);
  assert.equal(parseRunEventPayload(new Event("open")), null);
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

test("resolveRunEventPreviewNodeIds maps output keys to output nodes and preserves fallback behavior", () => {
  const document = {
    nodes: {
      agent_writer: {
        kind: "agent",
        reads: [{ state: "answer" }],
      },
      output_answer: {
        kind: "output",
        reads: [{ state: "answer" }],
      },
      output_summary: {
        kind: "output",
        reads: [{ state: "summary" }],
      },
    },
  };

  assert.deepEqual(resolveRunEventPreviewNodeIds(document, ["answer"], "fallback_node"), ["output_answer"]);
  assert.deepEqual(resolveRunEventPreviewNodeIds(document, ["missing"], "fallback_node"), ["fallback_node"]);
  assert.deepEqual(resolveRunEventPreviewNodeIds(null, ["answer"], "fallback_node"), ["fallback_node"]);
  assert.deepEqual(resolveRunEventPreviewNodeIds(document, [], ""), []);
});

test("buildRunEventOutputPreviewByNodeId writes plain previews without mutating existing entries", () => {
  const currentPreview = {
    existing_output: {
      text: "old",
      displayMode: "markdown",
    },
  };

  const nextPreview = buildRunEventOutputPreviewByNodeId(currentPreview, ["output_answer", "output_summary"], "new text");

  assert.deepEqual(nextPreview, {
    existing_output: {
      text: "old",
      displayMode: "markdown",
    },
    output_answer: {
      text: "new text",
      displayMode: "plain",
    },
    output_summary: {
      text: "new text",
      displayMode: "plain",
    },
  });
  assert.notEqual(nextPreview, currentPreview);
  assert.deepEqual(currentPreview, {
    existing_output: {
      text: "old",
      displayMode: "markdown",
    },
  });
});

test("buildRunEventOutputPreviewUpdate projects payloads into next preview maps or skips no-op payloads", () => {
  const document = {
    nodes: {
      output_answer: {
        kind: "output",
        reads: [{ state: "answer" }],
      },
    },
  };
  const currentPreview = {
    existing_output: {
      text: "old",
      displayMode: "markdown",
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, currentPreview, {
      text: "new text",
      output_keys: ["answer"],
      node_id: "fallback_node",
    }),
    {
      existing_output: {
        text: "old",
        displayMode: "markdown",
      },
      output_answer: {
        text: "new text",
        displayMode: "plain",
      },
    },
  );

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, currentPreview, {
      text: "fallback text",
      output_keys: ["missing"],
      node_id: " fallback_node ",
    }),
    {
      existing_output: {
        text: "old",
        displayMode: "markdown",
      },
      fallback_node: {
        text: "fallback text",
        displayMode: "plain",
      },
    },
  );

  assert.equal(buildRunEventOutputPreviewUpdate(document, currentPreview, { delta: "ignored", output_keys: ["answer"] }), null);
  assert.equal(buildRunEventOutputPreviewUpdate(document, currentPreview, { text: "missing target" }), null);
});

test("buildRunEventOutputPreviewUpdate preserves configured document output display mode", () => {
  const document = {
    nodes: {
      output_sources: {
        kind: "output",
        reads: [{ state: "source_documents" }],
        config: { displayMode: "documents" },
      },
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, {}, {
      text: '[{"title":"Article","local_path":"run_1/search/doc_001.md"}]',
      output_keys: ["source_documents"],
      node_id: "web_search_agent",
    }),
    {
      output_sources: {
        text: '[{"title":"Article","local_path":"run_1/search/doc_001.md"}]',
        displayMode: "documents",
      },
    },
  );
});

test("buildRunEventOutputPreviewUpdate auto-displays file state array updates as documents", () => {
  const document = {
    state_schema: {
      artifact_paths: { type: "file" },
    },
    nodes: {
      output_artifacts: {
        kind: "output",
        reads: [{ state: "artifact_paths" }],
        config: { displayMode: "auto" },
      },
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, {}, {
      event_type: "state.updated",
      state_key: "artifact_paths",
      value: ["run_1/searcher/web_search/invocation_001/doc_001.md"],
    }),
    {
      output_artifacts: {
        text: '[\n  "run_1/searcher/web_search/invocation_001/doc_001.md"\n]',
        displayMode: "documents",
      },
    },
  );
});

test("buildRunEventOutputPreviewUpdate routes multi-state JSON streams to matching Output nodes only", () => {
  const document = {
    nodes: {
      output_zh: { kind: "output", reads: [{ state: "greeting_zh" }], config: { displayMode: "plain" } },
      output_en: { kind: "output", reads: [{ state: "greeting_en" }], config: { displayMode: "plain" } },
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, {}, {
      node_id: "agent_greeter",
      text: '{"greeting_zh":"你好，Abyss","greeting_en":"Hel',
      output_keys: ["greeting_zh", "greeting_en"],
      stream_state_keys: ["greeting_zh", "greeting_en"],
    }),
    {
      output_zh: { text: "你好，Abyss", displayMode: "plain" },
      output_en: { text: "Hel", displayMode: "plain" },
    },
  );
});

test("buildRunEventOutputPreviewUpdate strips a single output JSON envelope by state key", () => {
  const document = {
    nodes: {
      output_answer: { kind: "output", reads: [{ state: "answer" }], config: { displayMode: "markdown" } },
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, {}, {
      node_id: "agent_writer",
      text: '{"answer":"你好，TooGraph',
      output_keys: ["answer"],
      stream_state_keys: ["answer"],
    }),
    {
      output_answer: { text: "你好，TooGraph", displayMode: "markdown" },
    },
  );
});

test("buildRunEventOutputPreviewUpdate preserves JSON text inside a stripped single output envelope", () => {
  const document = {
    nodes: {
      output_payload: { kind: "output", reads: [{ state: "payload" }], config: { displayMode: "json" } },
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, {}, {
      node_id: "agent_writer",
      text: '{"payload":"{\\\"ok\\\":true}"}',
      output_keys: ["payload"],
      stream_state_keys: ["payload"],
    }),
    {
      output_payload: { text: '{"ok":true}', displayMode: "json" },
    },
  );
});

test("buildRunEventOutputPreviewUpdate preserves JSON object bodies inside a stripped single output envelope", () => {
  const document = {
    nodes: {
      output_payload: { kind: "output", reads: [{ state: "payload" }], config: { displayMode: "json" } },
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, {}, {
      node_id: "agent_writer",
      text: '{"payload":{"ok":true',
      output_keys: ["payload"],
      stream_state_keys: ["payload"],
    }),
    {
      output_payload: { text: '{"ok":true', displayMode: "json" },
    },
  );
});

test("buildRunEventOutputPreviewUpdate hides a single output JSON envelope before the body starts", () => {
  const document = {
    nodes: {
      output_answer: { kind: "output", reads: [{ state: "answer" }], config: { displayMode: "markdown" } },
    },
  };

  assert.equal(
    buildRunEventOutputPreviewUpdate(document, {}, {
      node_id: "agent_writer",
      text: '{"answer"',
      output_keys: ["answer"],
      stream_state_keys: ["answer"],
    }),
    null,
  );
});

test("buildRunEventOutputPreviewUpdate does not broadcast ambiguous multi-state text streams", () => {
  const document = {
    nodes: {
      output_zh: { kind: "output", reads: [{ state: "greeting_zh" }] },
      output_en: { kind: "output", reads: [{ state: "greeting_en" }] },
    },
  };

  assert.equal(
    buildRunEventOutputPreviewUpdate(document, {}, {
      node_id: "agent_greeter",
      text: "plain model stream",
      output_keys: ["greeting_zh", "greeting_en"],
      stream_state_keys: ["greeting_zh", "greeting_en"],
    }),
    null,
  );
});

test("buildRunEventOutputPreviewUpdate applies authoritative state.updated values", () => {
  const document = {
    nodes: {
      output_answer: { kind: "output", reads: [{ state: "answer" }], config: { displayMode: "markdown" } },
    },
  };

  assert.deepEqual(
    buildRunEventOutputPreviewUpdate(document, {}, {
      event_type: "state.updated",
      state_key: "answer",
      value: "# Final",
    }),
    {
      output_answer: { text: "# Final", displayMode: "markdown" },
    },
  );
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
