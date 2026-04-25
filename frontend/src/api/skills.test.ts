import test from "node:test";
import assert from "node:assert/strict";

import { deleteSkill, fetchSkillCatalog, fetchSkillDefinitions, importSkill, updateSkillStatus } from "./skills.ts";

const originalFetch = globalThis.fetch;

test("fetchSkillDefinitions requests the skill definitions endpoint", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify([
        {
          skillKey: "search_knowledge_base",
          label: "Search Knowledge Base",
          description: "Searches imported knowledge bases.",
          inputSchema: [
            {
              key: "query",
              label: "Query",
              valueType: "text",
              required: true,
              description: "Knowledge lookup query.",
            },
          ],
          outputSchema: [
            {
              key: "results",
              label: "Results",
              valueType: "json",
              required: true,
              description: "Search result set.",
            },
          ],
          supportedValueTypes: ["text", "knowledge_base"],
          sideEffects: ["knowledge_read"],
          sourceFormat: "graphite_definition",
          sourceScope: "graphite_managed",
          sourcePath: "/skills/search_knowledge_base",
          runtimeRegistered: true,
          status: "active",
          canManage: true,
          canImport: false,
          compatibility: [],
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

  const skillDefinitions = await fetchSkillDefinitions();

  assert.equal(requestedUrl, "/api/skills/definitions");
  assert.deepEqual(skillDefinitions, [
    {
      skillKey: "search_knowledge_base",
      label: "Search Knowledge Base",
      description: "Searches imported knowledge bases.",
      inputSchema: [
        {
          key: "query",
          label: "Query",
          valueType: "text",
          required: true,
          description: "Knowledge lookup query.",
        },
      ],
      outputSchema: [
        {
          key: "results",
          label: "Results",
          valueType: "json",
          required: true,
          description: "Search result set.",
        },
      ],
      supportedValueTypes: ["text", "knowledge_base"],
      sideEffects: ["knowledge_read"],
      sourceFormat: "graphite_definition",
      sourceScope: "graphite_managed",
      sourcePath: "/skills/search_knowledge_base",
      runtimeRegistered: true,
      status: "active",
      canManage: true,
      canImport: false,
      compatibility: [],
    },
  ]);

  globalThis.fetch = originalFetch;
});

test("fetchSkillCatalog requests the full management catalog including disabled skills", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  const skillDefinitions = await fetchSkillCatalog();

  assert.equal(requestedUrl, "/api/skills/catalog?include_disabled=true");
  assert.deepEqual(skillDefinitions, []);

  globalThis.fetch = originalFetch;
});

test("skill management helpers call import, status, and delete endpoints", async () => {
  const requests: Array<{ url: string; method: string | undefined; body: string | null }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify({ skillKey: "rewrite_text", status: "active" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await importSkill("rewrite_text");
    await updateSkillStatus("rewrite_text", "disabled");
    await updateSkillStatus("rewrite_text", "active");
    await deleteSkill("rewrite_text");

    assert.deepEqual(requests, [
      { url: "/api/skills/rewrite_text/import", method: "POST", body: "null" },
      { url: "/api/skills/rewrite_text/disable", method: "POST", body: "null" },
      { url: "/api/skills/rewrite_text/enable", method: "POST", body: "null" },
      { url: "/api/skills/rewrite_text", method: "DELETE", body: null },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
