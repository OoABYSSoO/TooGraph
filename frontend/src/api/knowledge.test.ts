import test from "node:test";
import assert from "node:assert/strict";

import { fetchKnowledgeBases } from "./knowledge.ts";

const originalFetch = globalThis.fetch;

test("fetchKnowledgeBases requests the knowledge bases endpoint", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify([
        {
          name: "toograph-official",
          kb_id: "toograph-official",
          label: "TooGraph Project Docs",
          description: "Project-specific TooGraph documentation and current implementation notes.",
          sourceKind: "toograph_project_docs",
          sourceUrl: "https://github.com/OoABYSSoO/TooGraph",
          version: "v1",
          documentCount: 9,
          chunkCount: 16,
          importedAt: "2026-04-13T15:58:47.035074+00:00",
        },
      ]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const knowledgeBases = await fetchKnowledgeBases();

  assert.equal(requestedUrl, "/api/knowledge/bases");
  assert.deepEqual(knowledgeBases, [
    {
      name: "toograph-official",
      kb_id: "toograph-official",
      label: "TooGraph Project Docs",
      description: "Project-specific TooGraph documentation and current implementation notes.",
      sourceKind: "toograph_project_docs",
      sourceUrl: "https://github.com/OoABYSSoO/TooGraph",
      version: "v1",
      documentCount: 9,
      chunkCount: 16,
      importedAt: "2026-04-13T15:58:47.035074+00:00",
    },
  ]);

  globalThis.fetch = originalFetch;
});
