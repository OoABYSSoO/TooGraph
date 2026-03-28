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

test("resolveOutputPreviewContent renders markdown tables as safe table markup", () => {
  const preview = resolveOutputPreviewContent("| 语言 | 问候 |\n| --- | --- |\n| 中文 | **你好** |\n| English | `Hello` |", "markdown");

  assert.equal(preview.kind, "markdown");
  assert.match(preview.html, /<table>/);
  assert.match(preview.html, /<thead><tr><th>语言<\/th><th>问候<\/th><\/tr><\/thead>/);
  assert.match(preview.html, /<tbody><tr><td>中文<\/td><td><strong>你好<\/strong><\/td><\/tr><tr><td>English<\/td><td><code>Hello<\/code><\/td><\/tr><\/tbody>/);
  assert.doesNotMatch(preview.html, /<p>\| 语言 \| 问候 \|<\/p>/);
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
  assert.deepEqual(preview.documentRefs, [
    {
      title: "Article One",
      url: "https://example.com/one",
      localPath: "run_1/search/doc_001.md",
      contentType: "text/markdown",
      charCount: 1200,
      artifactKind: "document",
      size: null,
      filename: "doc_001.md",
    },
    {
      title: "Article Two",
      url: "https://example.com/two",
      localPath: "run_1/search/doc_002.md",
      contentType: "text/markdown",
      charCount: null,
      artifactKind: "document",
      size: null,
      filename: "doc_002.md",
    },
  ]);
});

test("resolveOutputPreviewContent extracts media artifact references from downloaded files", () => {
  const preview = resolveOutputPreviewContent(
    JSON.stringify({
      downloaded_files: [
        {
          filename: "clip.mp4",
          url: "https://example.com/watch",
          local_path: "run_1/downloader/clip.mp4",
          content_type: "video/mp4",
          size: 2048,
        },
      ],
    }),
    "documents",
  );

  assert.equal(preview.kind, "documents");
  assert.match(preview.text, /1 local artifact/);
  assert.match(preview.text, /clip\.mp4/);
  assert.deepEqual(preview.documentRefs, [
    {
      title: "clip.mp4",
      url: "https://example.com/watch",
      localPath: "run_1/downloader/clip.mp4",
      contentType: "video/mp4",
      charCount: null,
      artifactKind: "video",
      size: 2048,
      filename: "clip.mp4",
    },
  ]);
});

test("resolveOutputPreviewContent treats string arrays as local document paths", () => {
  const preview = resolveOutputPreviewContent(JSON.stringify(["run_1/search/doc_001.md"]), "documents");

  assert.equal(preview.kind, "documents");
  assert.match(preview.text, /1 local source document/);
  assert.match(preview.text, /Local: run_1\/search\/doc_001\.md/);
});

test("resolveOutputPreviewContent treats a single local path as a document reference in document mode", () => {
  const preview = resolveOutputPreviewContent("run_1/search/doc_001.md", "documents");

  assert.equal(preview.kind, "documents");
  assert.equal(preview.documentRefs[0]?.localPath, "run_1/search/doc_001.md");
  assert.match(preview.text, /1 local source document/);
});

test("resolveOutputPreviewContent treats active waiting output as an empty preview state", () => {
  const preview = resolveOutputPreviewContent("Waiting for output...", "auto");

  assert.equal(preview.kind, "plain");
  assert.equal(preview.isEmpty, true);
});

test("resolveOutputPreviewDisplayMode exposes the effective auto-detected format", () => {
  assert.equal(resolveOutputPreviewDisplayMode('{"answer":"GraphiteUI"}', "auto"), "json");
  assert.equal(resolveOutputPreviewDisplayMode("# Final answer", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("| A | B |\n| --- | --- |\n| 1 | 2 |", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("# Final answer", "plain"), "plain");
  assert.equal(resolveOutputPreviewDisplayMode("[]", "documents"), "documents");
});
