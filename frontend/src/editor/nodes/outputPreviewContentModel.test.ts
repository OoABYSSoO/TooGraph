import test from "node:test";
import assert from "node:assert/strict";

import { resolveOutputPreviewContent, resolveOutputPreviewDisplayMode } from "./outputPreviewContentModel.ts";

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

test("resolveOutputPreviewContent summarizes local document references instead of raw JSON", () => {
  const preview = resolveOutputPreviewContent(
    JSON.stringify({
      documents: [
        {
          title: "Article One",
          url: "https://example.com/one",
          local_path: "run_1/search/doc_001.md",
          char_count: 1200,
        },
        {
          title: "Article Two",
          url: "https://example.com/two",
          local_path: "run_1/search/doc_002.md",
        },
      ],
    }),
    "documents",
  );

  assert.equal(preview.kind, "documents");
  assert.match(preview.text, /2 local source documents/);
  assert.match(preview.text, /1\. Article One/);
  assert.match(preview.text, /Local: run_1\/search\/doc_001\.md/);
  assert.match(preview.text, /URL: https:\/\/example\.com\/two/);
  assert.doesNotMatch(preview.text, /"local_path"/);
});

test("resolveOutputPreviewContent treats string arrays as local document paths", () => {
  const preview = resolveOutputPreviewContent(JSON.stringify(["run_1/search/doc_001.md"]), "documents");

  assert.equal(preview.kind, "documents");
  assert.match(preview.text, /1 local source document/);
  assert.match(preview.text, /Local: run_1\/search\/doc_001\.md/);
});

test("resolveOutputPreviewContent treats active waiting output as an empty preview state", () => {
  const preview = resolveOutputPreviewContent("Waiting for output...", "auto");

  assert.equal(preview.kind, "plain");
  assert.equal(preview.isEmpty, true);
});

test("resolveOutputPreviewDisplayMode exposes the effective auto-detected format", () => {
  assert.equal(resolveOutputPreviewDisplayMode('{"answer":"GraphiteUI"}', "auto"), "json");
  assert.equal(resolveOutputPreviewDisplayMode("# Final answer", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("# Final answer", "plain"), "plain");
  assert.equal(resolveOutputPreviewDisplayMode("[]", "documents"), "documents");
});
