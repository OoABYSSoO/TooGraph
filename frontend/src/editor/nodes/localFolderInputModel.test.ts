import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultLocalFolderInputValue,
  formatLocalFolderSelectionSummary,
  parseLocalFolderInputValue,
  toggleLocalFolderSelection,
} from "./localFolderInputModel.ts";

test("parseLocalFolderInputValue recognizes local folder envelopes", () => {
  assert.deepEqual(parseLocalFolderInputValue({ kind: "local_folder", root: "buddy_home", selected: ["SOUL.md"] }), {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["SOUL.md"],
  });
  assert.deepEqual(parseLocalFolderInputValue(JSON.stringify({ kind: "local_folder", root: "docs", selected: ["a.md"] })), {
    kind: "local_folder",
    root: "docs",
    selected: ["a.md"],
  });
  assert.deepEqual(parseLocalFolderInputValue("plain text"), createDefaultLocalFolderInputValue());
});

test("toggleLocalFolderSelection preserves deterministic selected order", () => {
  const value = { kind: "local_folder" as const, root: "buddy_home", selected: ["USER.md"] };

  assert.deepEqual(toggleLocalFolderSelection(value, "SOUL.md", true), {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["USER.md", "SOUL.md"],
  });
  assert.deepEqual(toggleLocalFolderSelection(value, "USER.md", false), {
    kind: "local_folder",
    root: "buddy_home",
    selected: [],
  });
});

test("formatLocalFolderSelectionSummary reports selected file count and bytes", () => {
  assert.equal(
    formatLocalFolderSelectionSummary({
      selected: ["SOUL.md", "USER.md"],
      entries: [
        { path: "SOUL.md", name: "SOUL.md", type: "file", size: 100, modified_at: "", content_type: "text/markdown", text_like: true },
        { path: "USER.md", name: "USER.md", type: "file", size: 40, modified_at: "", content_type: "text/markdown", text_like: true },
      ],
    }),
    "2 files selected, 140 B",
  );
});
