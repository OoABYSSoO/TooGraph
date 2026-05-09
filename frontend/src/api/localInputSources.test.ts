import assert from "node:assert/strict";
import test from "node:test";

import { fetchLocalFolderTree } from "./localInputSources.ts";

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
