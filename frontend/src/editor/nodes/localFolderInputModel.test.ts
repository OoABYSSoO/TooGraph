import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultLocalFolderInputValue,
  formatLocalFolderSelectionSummary,
  listLocalFolderPreviewEntries,
  parseLocalFolderInputValue,
  selectEntireLocalFolder,
  toggleLocalFolderSelection,
} from "./localFolderInputModel.ts";

test("parseLocalFolderInputValue recognizes local folder envelopes", () => {
  assert.deepEqual(parseLocalFolderInputValue({ kind: "local_folder", root: "buddy_home", selected: ["SOUL.md"] }), {
    kind: "local_folder",
    root: "buddy_home",
    selection_mode: "selected",
    selected: ["SOUL.md"],
  });
  assert.deepEqual(parseLocalFolderInputValue(JSON.stringify({ kind: "local_folder", root: "docs", selection_mode: "all", selected: ["a.md"] })), {
    kind: "local_folder",
    root: "docs",
    selection_mode: "all",
    selected: [],
  });
  assert.deepEqual(parseLocalFolderInputValue("plain text"), createDefaultLocalFolderInputValue());
});

test("toggleLocalFolderSelection preserves deterministic selected order", () => {
  const value = { kind: "local_folder" as const, root: "buddy_home", selection_mode: "selected" as const, selected: ["USER.md"] };

  assert.deepEqual(toggleLocalFolderSelection(value, "SOUL.md", true), {
    kind: "local_folder",
    root: "buddy_home",
    selection_mode: "selected",
    selected: ["USER.md", "SOUL.md"],
  });
  assert.deepEqual(toggleLocalFolderSelection(value, "USER.md", false), {
    kind: "local_folder",
    root: "buddy_home",
    selection_mode: "selected",
    selected: [],
  });
});

test("selectEntireLocalFolder uses compact all-folder selection instead of enumerating files", () => {
  assert.deepEqual(
    selectEntireLocalFolder({
      kind: "local_folder",
      root: "knowledge/action_policy",
      selection_mode: "selected",
      selected: ["A.md", "C.md"],
    }),
    {
      kind: "local_folder",
      root: "knowledge/action_policy",
      selection_mode: "all",
      selected: [],
    },
  );
});

test("toggleLocalFolderSelection switches all-folder selection to explicit file selection", () => {
  assert.deepEqual(
    toggleLocalFolderSelection(
      { kind: "local_folder", root: "knowledge/action_policy", selection_mode: "all", selected: [] },
      "A.md",
      true,
    ),
    {
      kind: "local_folder",
      root: "knowledge/action_policy",
      selection_mode: "selected",
      selected: ["A.md"],
    },
  );
});

test("formatLocalFolderSelectionSummary reports all-folder mode without counting selected paths", () => {
  assert.equal(
    formatLocalFolderSelectionSummary({
      selectionMode: "all",
      selected: ["SOUL.md", "USER.md"],
      entries: [
        { path: "SOUL.md", name: "SOUL.md", type: "file", size: 100, modified_at: "", content_type: "text/markdown", text_like: true },
        { path: "USER.md", name: "USER.md", type: "file", size: 40, modified_at: "", content_type: "text/markdown", text_like: true },
      ],
    }),
    "Entire folder selected, 2 visible files, 140 B visible",
  );
});

test("formatLocalFolderSelectionSummary reports selected file count and bytes", () => {
  assert.equal(
    formatLocalFolderSelectionSummary({
      selectionMode: "selected",
      selected: ["SOUL.md", "USER.md"],
      entries: [
        { path: "SOUL.md", name: "SOUL.md", type: "file", size: 100, modified_at: "", content_type: "text/markdown", text_like: true },
        { path: "USER.md", name: "USER.md", type: "file", size: 40, modified_at: "", content_type: "text/markdown", text_like: true },
      ],
    }),
    "2 files selected, 140 B",
  );
});

test("listLocalFolderPreviewEntries limits the visible folder preview", () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({
    path: `file-${index}.md`,
    name: `file-${index}.md`,
    type: "file" as const,
    size: 10,
    modified_at: "",
    content_type: "text/markdown",
    text_like: true,
  }));

  assert.deepEqual(listLocalFolderPreviewEntries(entries, 5).map((entry) => entry.path), [
    "file-0.md",
    "file-1.md",
    "file-2.md",
    "file-3.md",
    "file-4.md",
  ]);
});
