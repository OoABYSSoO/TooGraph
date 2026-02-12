import test from "node:test";
import assert from "node:assert/strict";

import { resolveOutputPreviewContent } from "./outputPreviewContentModel.ts";

test("resolveOutputPreviewContent formats auto-detected JSON previews", () => {
  const preview = resolveOutputPreviewContent('{"answer":"GraphiteUI","ok":true}', "auto");

  assert.equal(preview.kind, "json");
  assert.equal(preview.text, '{\n  "answer": "GraphiteUI",\n  "ok": true\n}');
  assert.equal(preview.html, "");
});

test("resolveOutputPreviewContent renders safe markdown without exposing raw HTML", () => {
  const preview = resolveOutputPreviewContent("# Title\n\n**safe** <script>alert(1)</script>", "markdown");

  assert.equal(preview.kind, "markdown");
  assert.match(preview.html, /<h1>Title<\/h1>/);
  assert.match(preview.html, /<strong>safe<\/strong>/);
  assert.match(preview.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(preview.html, /<script>/);
});

test("resolveOutputPreviewContent keeps ordinary previews as plain text", () => {
  const preview = resolveOutputPreviewContent("Connected to answer. Run the graph to preview/export it.", "auto");

  assert.equal(preview.kind, "plain");
  assert.equal(preview.text, "Connected to answer. Run the graph to preview/export it.");
});
