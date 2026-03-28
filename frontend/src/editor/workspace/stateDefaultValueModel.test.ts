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
  assert.deepEqual(resolveStateDefaultValueEditorConfig("skill"), {
    mode: "structured",
    rows: 5,
    placeholder: "[]",
  });
  assert.deepEqual(resolveStateDefaultValueEditorConfig("markdown"), {
    mode: "text",
    rows: 5,
    placeholder: "输入 Markdown...",
  });
});

test("parseStructuredStateDraft validates structured state types", () => {
  assert.deepEqual(parseStructuredStateDraft("json", "{\"ok\":true}"), {
    ok: true,
    value: { ok: true },
  });
  assert.deepEqual(parseStructuredStateDraft("json", "[1,2]"), {
    ok: true,
    value: [1, 2],
  });
  assert.deepEqual(parseStructuredStateDraft("skill", '[{"skillKey":"web_search"}]'), {
    ok: true,
    value: [{ skillKey: "web_search" }],
  });
  assert.deepEqual(parseStructuredStateDraft("skill", "{}"), {
    ok: false,
    error: "这个 State 类型需要 JSON 数组。",
  });
  assert.deepEqual(parseStructuredStateDraft("json", "{oops"), {
    ok: false,
    error: "默认值必须是有效 JSON。",
  });
});
