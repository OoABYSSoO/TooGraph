import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalWorkspace,
  fetchLocalDirectoryEntries,
  fetchLocalFolderTree,
  fetchLocalPickerDirectoryEntries,
  fetchLocalWorkspaces,
  setCurrentLocalWorkspace,
} from "./localInputSources.ts";

const originalFetch = globalThis.fetch;

test("fetchLocalFolderTree requests an encoded local folder path", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        kind: "local_folder_tree",
        root: "buddy_home",
        entries: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const response = await fetchLocalFolderTree("buddy home");

  assert.equal(requestedUrl, "/api/local-input-sources/folder?path=buddy+home");
  assert.deepEqual(response, {
    kind: "local_folder_tree",
    root: "buddy_home",
    entries: [],
  });

  globalThis.fetch = originalFetch;
});

test("fetchLocalDirectoryEntries requests an encoded local directory path", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        kind: "local_directory_entries",
        path: "C:/Users/abyss",
        parent: "C:/Users",
        breadcrumbs: [{ label: "abyss", path: "C:/Users/abyss" }],
        entries: [
          {
            name: "TooGraph",
            path: "C:/Users/abyss/TooGraph",
            relative_path: "TooGraph",
            kind: "directory",
            size: null,
            modified_at: "2026-06-07T10:00:00Z",
            content_type: "inode/directory",
            text_like: false,
            selectable: true,
          },
        ],
        denied: false,
        truncated: false,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const response = await fetchLocalDirectoryEntries("C:/Users/abyss", "workspace_1");

  assert.equal(requestedUrl, "/api/local-input-sources/entries?path=C%3A%2FUsers%2Fabyss&workspace_id=workspace_1");
  assert.equal(response.kind, "local_directory_entries");
  assert.equal(response.entries[0]?.kind, "directory");

  globalThis.fetch = originalFetch;
});

test("fetchLocalPickerDirectoryEntries can request the picker root or a selected path", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        kind: "local_directory_entries",
        path: "C:/Users/abyss",
        parent: "C:/Users",
        breadcrumbs: [],
        entries: [],
        denied: false,
        truncated: false,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  await fetchLocalPickerDirectoryEntries();
  await fetchLocalPickerDirectoryEntries("C:/Users/abyss");

  assert.deepEqual(requestedUrls, [
    "/api/local-input-sources/picker/entries",
    "/api/local-input-sources/picker/entries?path=C%3A%2FUsers%2Fabyss",
  ]);

  globalThis.fetch = originalFetch;
});

test("local workspace APIs list, create, and set the current workspace", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: String(init?.method || "GET"),
      body: String(init?.body || ""),
    });
    if (String(input).endsWith("/workspaces") && !init?.method) {
      return new Response(
        JSON.stringify({
          workspaces: [],
          current_workspace_id: "",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
    return new Response(
      JSON.stringify({
        workspace_id: "workspace_1",
        name: "Policy",
        root_path: "C:/Policy",
        created_at: "2026-06-07T10:00:00Z",
        updated_at: "2026-06-07T10:00:00Z",
        last_opened_at: "2026-06-07T10:00:00Z",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  await fetchLocalWorkspaces();
  await createLocalWorkspace({ root_path: "C:/Policy", name: "Policy" });
  await setCurrentLocalWorkspace("workspace_1");

  assert.deepEqual(requests.map((request) => [request.method, request.url]), [
    ["GET", "/api/local-input-sources/workspaces"],
    ["POST", "/api/local-input-sources/workspaces"],
    ["POST", "/api/local-input-sources/workspaces/current"],
  ]);
  assert.equal(requests[1]?.body, JSON.stringify({ root_path: "C:/Policy", name: "Policy" }));
  assert.equal(requests[2]?.body, JSON.stringify({ workspace_id: "workspace_1" }));

  globalThis.fetch = originalFetch;
});
