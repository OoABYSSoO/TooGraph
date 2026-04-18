import test from "node:test";
import assert from "node:assert/strict";

import { fetchSkillDefinitions } from "./skills.ts";

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

  assert.equal(requestedUrl, "http://127.0.0.1:8765/api/skills/definitions");
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
