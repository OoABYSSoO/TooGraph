import assert from "node:assert/strict";
import test from "node:test";

import { fetchSkillArtifactContent } from "./skillArtifacts.ts";

const originalFetch = globalThis.fetch;

test("fetchSkillArtifactContent reads artifact content by encoded relative path", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        path: "run_1/search/doc_001.md",
        name: "doc_001.md",
        size: 42,
        content_type: "text/markdown",
        content: "# Article",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const response = await fetchSkillArtifactContent("run_1/search/doc 001.md");

  assert.equal(requestedUrl, "/api/skill-artifacts/content?path=run_1%2Fsearch%2Fdoc+001.md");
  assert.deepEqual(response, {
    path: "run_1/search/doc_001.md",
    name: "doc_001.md",
    size: 42,
    content_type: "text/markdown",
    content: "# Article",
  });

  globalThis.fetch = originalFetch;
});
