import assert from "node:assert/strict";
import test from "node:test";

import { buildCapabilityArtifactFileUrl, fetchCapabilityArtifactContent } from "./capabilityArtifacts.ts";

const originalFetch = globalThis.fetch;

test("fetchCapabilityArtifactContent reads artifact content by encoded relative path", async () => {
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

  const response = await fetchCapabilityArtifactContent("run_1/search/doc 001.md");

  assert.equal(requestedUrl, "/api/capability-artifacts/content?path=run_1%2Fsearch%2Fdoc+001.md");
  assert.deepEqual(response, {
    path: "run_1/search/doc_001.md",
    name: "doc_001.md",
    size: 42,
    content_type: "text/markdown",
    content: "# Article",
  });

  globalThis.fetch = originalFetch;
});

test("buildCapabilityArtifactFileUrl encodes artifact file paths for media preview", () => {
  assert.equal(
    buildCapabilityArtifactFileUrl("run_1/downloader/clip 001.mp4"),
    "/api/capability-artifacts/file?path=run_1%2Fdownloader%2Fclip+001.mp4",
  );
});
