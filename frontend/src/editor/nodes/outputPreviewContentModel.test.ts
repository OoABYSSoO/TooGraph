import test from "node:test";
import assert from "node:assert/strict";

import { linkifyOutputText, resolveOutputPreviewContent, resolveOutputPreviewDisplayMode } from "./outputPreviewContentModel.ts";

test("resolveOutputPreviewContent formats auto-detected JSON previews", () => {
  const preview = resolveOutputPreviewContent('{"answer":"TooGraph","ok":true}', "auto");

  assert.equal(preview.kind, "json");
  assert.equal(preview.text, '{\n  "answer": "TooGraph",\n  "ok": true\n}');
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

test("resolveOutputPreviewContent renders fenced code blocks with language labels and escaped code", () => {
  const preview = resolveOutputPreviewContent(
    [
      "Run this:",
      "",
      "```ts",
      "const value = \"<safe>\";",
      "console.log(value);",
      "```",
      "",
      "Then continue.",
    ].join("\n"),
    "markdown",
  );

  assert.equal(preview.kind, "markdown");
  assert.match(preview.html, /<pre data-language="ts"><code class="language-ts">const value = &quot;&lt;safe&gt;&quot;;\nconsole\.log\(value\);<\/code><\/pre>/);
  assert.match(preview.html, /<p>Run this:<\/p>/);
  assert.match(preview.html, /<p>Then continue\.<\/p>/);
  assert.doesNotMatch(preview.html, /<p>```ts<\/p>/);
  assert.doesNotMatch(preview.html, /<safe>/);
});

test("resolveOutputPreviewContent renders common markdown reader blocks safely", () => {
  const preview = resolveOutputPreviewContent(
    [
      "#### Details",
      "",
      "1. Open [TooGraph](https://example.com?a=1&b=2)",
      "2. Keep `inline <code>` intact",
      "",
      "> quoted **text**",
      "> second line",
      "",
      "---",
      "",
      "[unsafe](javascript:alert(1))",
    ].join("\n"),
    "markdown",
  );

  assert.equal(preview.kind, "markdown");
  assert.match(preview.html, /<h4>Details<\/h4>/);
  assert.match(preview.html, /<ol><li>Open <a href="https:\/\/example\.com\?a=1&amp;b=2" target="_blank" rel="noreferrer noopener">TooGraph<\/a><\/li><li>Keep <code>inline &lt;code&gt;<\/code> intact<\/li><\/ol>/);
  assert.match(preview.html, /<blockquote><p>quoted <strong>text<\/strong><br>second line<\/p><\/blockquote>/);
  assert.match(preview.html, /<hr>/);
  assert.match(preview.html, /<p>unsafe \(javascript:alert\(1\)\)<\/p>/);
  assert.doesNotMatch(preview.html, /href="javascript:/);
});

test("resolveOutputPreviewContent turns bare markdown URLs into safe new-page links", () => {
  const preview = resolveOutputPreviewContent("Source: https://example.com/a?b=1&c=2. Mirror: www.example.org/path", "markdown");

  assert.equal(preview.kind, "markdown");
  assert.match(
    preview.html,
    /Source: <a href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noreferrer noopener">https:\/\/example\.com\/a\?b=1&amp;c=2<\/a>\./,
  );
  assert.match(
    preview.html,
    /Mirror: <a href="https:\/\/www\.example\.org\/path" target="_blank" rel="noreferrer noopener">www\.example\.org\/path<\/a>/,
  );

  const emphasizedPreview = resolveOutputPreviewContent("**https://example.com/bold**", "markdown");
  assert.match(
    emphasizedPreview.html,
    /<strong><a href="https:\/\/example\.com\/bold" target="_blank" rel="noreferrer noopener">https:\/\/example\.com\/bold<\/a><\/strong>/,
  );
});

test("linkifyOutputText preserves text while exposing plain preview URLs as links", () => {
  assert.deepEqual(linkifyOutputText('Open https://example.com/a?b=1, then "www.example.org/docs".'), [
    { kind: "text", text: "Open " },
    { kind: "link", text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
    { kind: "text", text: ', then "' },
    { kind: "link", text: "www.example.org/docs", href: "https://www.example.org/docs" },
    { kind: "text", text: "\"." },
  ]);
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

test("resolveOutputPreviewContent unwraps single-output result packages for direct display", () => {
  const preview = resolveOutputPreviewContent(
    JSON.stringify({
      kind: "result_package",
      outputs: {
        final_reply: {
          name: "最终回复",
          description: "面向用户展示的最终整理结果。",
          type: "markdown",
          value: "# Done",
        },
      },
    }),
    "auto",
  );

  assert.equal(preview.kind, "markdown");
  assert.equal(preview.text, "# Done");
  assert.match(preview.html, /<h1>Done<\/h1>/);
  assert.equal(preview.packagePages, undefined);
});

test("resolveOutputPreviewContent paginates multi-output result packages by output field", () => {
  const preview = resolveOutputPreviewContent(
    JSON.stringify({
      kind: "result_package",
      outputs: {
        final_reply: {
          name: "最终回复",
          description: "面向用户展示的最终整理结果。",
          type: "markdown",
          value: "# Done",
        },
        source_documents: {
          name: "来源文档",
          description: "联网搜索下载到本地的原文。",
          type: "file",
          value: [
            {
              title: "Article One",
              url: "https://example.com/one",
              local_path: "run_1/search/doc_001.md",
              char_count: 1200,
            },
          ],
        },
      },
    }),
    "auto",
  );

  assert.equal(preview.kind, "package");
  assert.equal(preview.packagePages?.length, 2);
  assert.equal(preview.packagePages?.[0]?.key, "final_reply");
  assert.equal(preview.packagePages?.[0]?.title, "最终回复");
  assert.equal(preview.packagePages?.[0]?.kind, "markdown");
  assert.match(preview.packagePages?.[0]?.html ?? "", /<h1>Done<\/h1>/);
  assert.equal(preview.packagePages?.[1]?.key, "source_documents");
  assert.equal(preview.packagePages?.[1]?.kind, "documents");
  assert.equal(preview.packagePages?.[1]?.documentRefs[0]?.localPath, "run_1/search/doc_001.md");
});

test("resolveOutputPreviewContent treats active waiting output as an empty preview state", () => {
  const preview = resolveOutputPreviewContent("Waiting for output...", "auto");

  assert.equal(preview.kind, "plain");
  assert.equal(preview.isEmpty, true);
});

test("resolveOutputPreviewDisplayMode exposes the effective auto-detected format", () => {
  assert.equal(resolveOutputPreviewDisplayMode('{"answer":"TooGraph"}', "auto"), "json");
  assert.equal(resolveOutputPreviewDisplayMode("# Final answer", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("```python\nprint('hi')\n```", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("> quoted", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("1. First\n2. Second", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("| A | B |\n| --- | --- |\n| 1 | 2 |", "auto"), "markdown");
  assert.equal(resolveOutputPreviewDisplayMode("# Final answer", "plain"), "plain");
  assert.equal(resolveOutputPreviewDisplayMode("[]", "documents"), "documents");
  assert.equal(
    resolveOutputPreviewDisplayMode(
      JSON.stringify({
        kind: "result_package",
        outputs: {
          a: { type: "markdown", value: "# A" },
          b: { type: "json", value: { ok: true } },
        },
      }),
      "auto",
    ),
    "package",
  );
  assert.equal(
    resolveOutputPreviewDisplayMode(
      JSON.stringify({
        kind: "result_package",
        outputs: {
          a: { type: "markdown", value: "# A" },
        },
      }),
      "auto",
    ),
    "markdown",
  );
});
