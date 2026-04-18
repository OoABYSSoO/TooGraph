import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStructuredStateDraft,
  resolveStateDefaultValueEditorConfig,
} from "./stateDefaultValueModel.ts";

test("resolveStateDefaultValueEditorConfig returns typed editor modes", () => {
  assert.deepEqual(resolveStateDefaultValueEditorConfig("boolean"), {
    mode: "boolean",
    rows: 0,
    placeholder: "",
  });
  assert.deepEqual(resolveStateDefaultValueEditorConfig("number"), {
    mode: "number",
    rows: 1,
    placeholder: "0",
  });
  assert.deepEqual(resolveStateDefaultValueEditorConfig("object"), {
    mode: "structured",
    rows: 5,
    placeholder: "{}",
  });
  assert.deepEqual(resolveStateDefaultValueEditorConfig("markdown"), {
    mode: "text",
    rows: 5,
    placeholder: "Write markdown...",
  });
});

test("parseStructuredStateDraft validates structured state types", () => {
  assert.deepEqual(parseStructuredStateDraft("object", "{\"ok\":true}"), {
    ok: true,
    value: { ok: true },
  });
  assert.deepEqual(parseStructuredStateDraft("array", "[1,2]"), {
    ok: true,
    value: [1, 2],
  });
  assert.deepEqual(parseStructuredStateDraft("file_list", ""), {
    ok: true,
    value: [],
  });
  assert.deepEqual(parseStructuredStateDraft("object", "[]"), {
    ok: false,
    error: "This state type requires a JSON object.",
  });
  assert.deepEqual(parseStructuredStateDraft("array", "{}"), {
    ok: false,
    error: "This state type requires a JSON array.",
  });
  assert.deepEqual(parseStructuredStateDraft("json", "{oops"), {
    ok: false,
    error: "Default value must be valid JSON.",
  });
});
