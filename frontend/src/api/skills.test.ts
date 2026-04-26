import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteSkill,
  fetchSkillCatalog,
  fetchSkillFileContent,
  fetchSkillFiles,
  fetchSkillDefinitions,
  importSkillUpload,
  updateSkillStatus,
} from "./skills.ts";

const originalFetch = globalThis.fetch;

test("fetchSkillDefinitions requests the skill definitions endpoint", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify([
        {
          skillKey: "web_search",
          name: "Web Search",
          description: "Searches the web.",
          llmInstruction: "Choose the query and run the bound web search skill.",
          schemaVersion: "toograph.skill/v1",
          llmOutputSchema: [
            {
              key: "query",
              name: "Query",
              valueType: "text",
              description: "Web search query.",
            },
          ],
          stateOutputSchema: [
            {
              key: "summary",
              name: "Summary",
              valueType: "json",
              description: "Search result summary.",
            },
          ],
          version: "1.0.0",
          capabilityPolicy: {
            default: { selectable: true, requiresApproval: false },
            origins: {},
          },
          permissions: ["network"],
          runtime: { type: "python", entrypoint: "run.py" },
          llmNodeEligibility: "ready",
          llmNodeBlockers: [],
          sourceScope: "installed",
          sourcePath: "/skills/web_search/skill.json",
          runtimeReady: true,
          runtimeRegistered: true,
          status: "active",
          canManage: true,
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
      skillKey: "web_search",
      name: "Web Search",
      description: "Searches the web.",
      llmInstruction: "Choose the query and run the bound web search skill.",
      schemaVersion: "toograph.skill/v1",
      llmOutputSchema: [
        {
          key: "query",
          name: "Query",
          valueType: "text",
          description: "Web search query.",
        },
      ],
      stateOutputSchema: [
        {
          key: "summary",
          name: "Summary",
          valueType: "json",
          description: "Search result summary.",
        },
      ],
      version: "1.0.0",
      capabilityPolicy: {
        default: { selectable: true, requiresApproval: false },
        origins: {},
      },
      permissions: ["network"],
      runtime: { type: "python", entrypoint: "run.py" },
      llmNodeEligibility: "ready",
      llmNodeBlockers: [],
      sourceScope: "installed",
      sourcePath: "/skills/web_search/skill.json",
      runtimeReady: true,
      runtimeRegistered: true,
      status: "active",
      canManage: true,
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

test("skill file helpers request tree and content endpoints", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    const url = String(input);
    if (url.endsWith("/files")) {
      return new Response(
        JSON.stringify({
          skillKey: "rewrite_text",
          root: {
            name: "rewrite_text",
            path: "",
            type: "directory",
            size: 0,
            language: "",
            previewable: false,
            executable: false,
            children: [],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        skillKey: "rewrite_text",
        path: "SKILL.md",
        name: "SKILL.md",
        size: 12,
        language: "markdown",
        previewable: true,
        executable: false,
        encoding: "utf-8",
        content: "# Rewrite\n",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const files = await fetchSkillFiles("rewrite_text");
    const content = await fetchSkillFileContent("rewrite_text", "SKILL.md");

    assert.deepEqual(requestedUrls, [
      "/api/skills/rewrite_text/files",
      "/api/skills/rewrite_text/files/content?path=SKILL.md",
    ]);
    assert.equal(files.root.type, "directory");
    assert.equal(content.content, "# Rewrite\n");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skill management helpers call status and delete endpoints", async () => {
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
    await updateSkillStatus("rewrite_text", "disabled");
    await updateSkillStatus("rewrite_text", "active");
    await deleteSkill("rewrite_text");

    assert.deepEqual(requests, [
      { url: "/api/skills/rewrite_text/disable", method: "POST", body: "null" },
      { url: "/api/skills/rewrite_text/enable", method: "POST", body: "null" },
      { url: "/api/skills/rewrite_text", method: "DELETE", body: null },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("importSkillUpload posts files and relative paths as multipart form data", async () => {
  let requestedUrl = "";
  let requestMethod: string | undefined;
  let requestBody: BodyInit | null | undefined;
  const skillFile = new File(["---\nname: Uploaded\n---\nBody"], "SKILL.md", { type: "text/markdown" });

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestMethod = init?.method;
    requestBody = init?.body;
    return new Response(JSON.stringify({ skillKey: "uploaded_folder_skill", status: "active" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await importSkillUpload([skillFile], ["uploaded_folder_skill/SKILL.md"]);

    assert.equal(requestedUrl, "/api/skills/imports/upload");
    assert.equal(requestMethod, "POST");
    assert.ok(requestBody instanceof FormData);
    assert.equal(requestBody.get("files"), skillFile);
    assert.equal(requestBody.get("relativePaths"), "uploaded_folder_skill/SKILL.md");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
