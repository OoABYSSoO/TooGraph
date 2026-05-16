import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteAction,
  fetchActionCatalog,
  fetchActionFileContent,
  fetchActionFiles,
  fetchActionDefinitions,
  importActionUpload,
  updateActionStatus,
} from "./actions.ts";

const originalFetch = globalThis.fetch;

test("fetchActionDefinitions requests the action definitions endpoint", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify([
        {
          actionKey: "web_search",
          name: "Web Search",
          description: "Searches the web.",
          llmInstruction: "Choose the query and run the bound web search action.",
          schemaVersion: "toograph.action/v1",
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
          sourcePath: "/actions/web_search/action.json",
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

  const actionDefinitions = await fetchActionDefinitions();

  assert.equal(requestedUrl, "/api/actions/definitions");
  assert.deepEqual(actionDefinitions, [
    {
      actionKey: "web_search",
      name: "Web Search",
      description: "Searches the web.",
      llmInstruction: "Choose the query and run the bound web search action.",
      schemaVersion: "toograph.action/v1",
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
      sourcePath: "/actions/web_search/action.json",
      runtimeReady: true,
      runtimeRegistered: true,
      status: "active",
      canManage: true,
    },
  ]);

  globalThis.fetch = originalFetch;
});

test("fetchActionCatalog requests the full management catalog including disabled actions", async () => {
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

  const actionDefinitions = await fetchActionCatalog();

  assert.equal(requestedUrl, "/api/actions/catalog?include_disabled=true");
  assert.deepEqual(actionDefinitions, []);

  globalThis.fetch = originalFetch;
});

test("action file helpers request tree and content endpoints", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    const url = String(input);
    if (url.endsWith("/files")) {
      return new Response(
        JSON.stringify({
          actionKey: "rewrite_text",
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
        actionKey: "rewrite_text",
        path: "ACTION.md",
        name: "ACTION.md",
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
    const files = await fetchActionFiles("rewrite_text");
    const content = await fetchActionFileContent("rewrite_text", "ACTION.md");

    assert.deepEqual(requestedUrls, [
      "/api/actions/rewrite_text/files",
      "/api/actions/rewrite_text/files/content?path=ACTION.md",
    ]);
    assert.equal(files.root.type, "directory");
    assert.equal(content.content, "# Rewrite\n");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("action management helpers call status and delete endpoints", async () => {
  const requests: Array<{ url: string; method: string | undefined; body: string | null }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify({ actionKey: "rewrite_text", status: "active" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await updateActionStatus("rewrite_text", "disabled");
    await updateActionStatus("rewrite_text", "active");
    await deleteAction("rewrite_text");

    assert.deepEqual(requests, [
      { url: "/api/actions/rewrite_text/disable", method: "POST", body: "null" },
      { url: "/api/actions/rewrite_text/enable", method: "POST", body: "null" },
      { url: "/api/actions/rewrite_text", method: "DELETE", body: null },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("importActionUpload posts files and relative paths as multipart form data", async () => {
  let requestedUrl = "";
  let requestMethod: string | undefined;
  let requestBody: BodyInit | null | undefined;
  const actionFile = new File(["---\nname: Uploaded\n---\nBody"], "ACTION.md", { type: "text/markdown" });

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestMethod = init?.method;
    requestBody = init?.body;
    return new Response(JSON.stringify({ actionKey: "uploaded_folder_action", status: "active" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await importActionUpload([actionFile], ["uploaded_folder_action/ACTION.md"]);

    assert.equal(requestedUrl, "/api/actions/imports/upload");
    assert.equal(requestMethod, "POST");
    assert.ok(requestBody instanceof FormData);
    assert.equal(requestBody.get("files"), actionFile);
    assert.equal(requestBody.get("relativePaths"), "uploaded_folder_action/ACTION.md");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
