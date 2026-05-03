import assert from "node:assert/strict";
import test from "node:test";

import { routeStreamingJsonStateText } from "./streamingJsonStateRouter.ts";

test("routeStreamingJsonStateText routes partial top-level JSON string fields by emitted key", () => {
  assert.deepEqual(
    routeStreamingJsonStateText('{"greeting_zh":"你好，Abyss","greeting_en":"Hel', ["greeting_zh", "greeting_en"]),
    {
      greeting_zh: { text: "你好，Abyss", completed: true },
      greeting_en: { text: "Hel", completed: false },
    },
  );
});

test("routeStreamingJsonStateText decodes escaped string content without treating nested keys as states", () => {
  assert.deepEqual(
    routeStreamingJsonStateText('{"answer":"Line 1\\nLine 2","payload":{"answer":"nested"}}', ["answer"]),
    {
      answer: { text: "Line 1\nLine 2", completed: true },
    },
  );
});

test("routeStreamingJsonStateText ignores arrays and objects until state.updated provides the authority", () => {
  assert.deepEqual(
    routeStreamingJsonStateText('{"evidence_links":[{"title":"A"}],"final_answer":"Done', ["evidence_links", "final_answer"]),
    {
      final_answer: { text: "Done", completed: false },
    },
  );
});

test("routeStreamingJsonStateText returns an empty map for non-json stream text", () => {
  assert.deepEqual(routeStreamingJsonStateText("plain text", ["answer"]), {});
});
