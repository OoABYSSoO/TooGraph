import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteTool,
  fetchToolCatalog,
  fetchToolFileContent,
  fetchToolFiles,
  importToolUpload,
  updateToolStatus,
} from "./tools.ts";

const originalFetch = globalThis.fetch;

test("fetchToolCatalog requests the full management catalog including disabled tools", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const tools = await fetchToolCatalog();

  assert.equal(requestedUrl, "/api/tools/catalog?include_disabled=true");
  assert.deepEqual(tools, []);

  globalThis.fetch = originalFetch;
});

test("tool file helpers request tree and content endpoints", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    const url = String(input);
    if (url.endsWith("/files")) {
      return new Response(
        JSON.stringify({
          toolKey: "json_passthrough",
          root: {
            name: "json_passthrough",
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
        toolKey: "json_passthrough",
        path: "tool.json",
        name: "tool.json",
        size: 2,
        language: "json",
        previewable: true,
        executable: false,
        encoding: "utf-8",
        content: "{}",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const files = await fetchToolFiles("json_passthrough");
  const content = await fetchToolFileContent("json_passthrough", "tool.json");

  assert.deepEqual(requestedUrls, [
    "/api/tools/json_passthrough/files",
    "/api/tools/json_passthrough/files/content?path=tool.json",
  ]);
  assert.equal(files.toolKey, "json_passthrough");
  assert.equal(content.content, "{}");

  globalThis.fetch = originalFetch;
});

test("tool management helpers request status delete and upload endpoints", async () => {
  const requests: Array<{ url: string; method: string; bodyKind: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      bodyKind: init?.body instanceof FormData ? "form" : typeof init?.body,
    });
    return new Response(
      JSON.stringify({
        toolKey: "json_passthrough",
        name: "JSON Passthrough",
        description: "Return JSON input.",
        schemaVersion: "toograph.tool/v1",
        version: "1.0.0",
        permissions: [],
        runtime: { type: "python", entrypoint: "run.py" },
        inputSchema: [],
        outputSchema: [],
        sourceScope: "user",
        sourcePath: "/tool/user/json_passthrough/tool.json",
        runtimeReady: true,
        runtimeRegistered: true,
        status: "active",
        canManage: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  await updateToolStatus("json_passthrough", "disabled");
  await updateToolStatus("json_passthrough", "active");
  await deleteTool("json_passthrough");
  await importToolUpload([new File(["{}"], "tool.json", { type: "application/json" })], ["json_passthrough/tool.json"]);

  assert.deepEqual(requests, [
    { url: "/api/tools/json_passthrough/disable", method: "POST", bodyKind: "string" },
    { url: "/api/tools/json_passthrough/enable", method: "POST", bodyKind: "string" },
    { url: "/api/tools/json_passthrough", method: "DELETE", bodyKind: "undefined" },
    { url: "/api/tools/imports/upload", method: "POST", bodyKind: "form" },
  ]);

  globalThis.fetch = originalFetch;
});
