import assert from "node:assert/strict";
import test from "node:test";

import { omitTabScopedRecordEntry, setTabScopedRecordEntry } from "./editorTabRuntimeModel.ts";

test("omitTabScopedRecordEntry removes a tab entry without mutating the source record", () => {
  const current = {
    tab_a: { loading: false },
    tab_b: { loading: true },
  };

  const next = omitTabScopedRecordEntry(current, "tab_b");

  assert.deepEqual(next, { tab_a: { loading: false } });
  assert.notEqual(next, current);
  assert.deepEqual(current, {
    tab_a: { loading: false },
    tab_b: { loading: true },
  });
});

test("omitTabScopedRecordEntry preserves the shell's clone-and-delete rhythm when the tab is absent", () => {
  const current = {
    tab_a: "ready",
  };

  const next = omitTabScopedRecordEntry(current, "tab_missing");

  assert.deepEqual(next, current);
  assert.notEqual(next, current);
});

test("setTabScopedRecordEntry writes a tab entry without mutating the source record", () => {
  const current = {
    tab_a: { text: "old" },
  };
  const value = { text: "new" };

  const next = setTabScopedRecordEntry(current, "tab_b", value);

  assert.deepEqual(next, {
    tab_a: { text: "old" },
    tab_b: value,
  });
  assert.notEqual(next, current);
  assert.deepEqual(current, {
    tab_a: { text: "old" },
  });
});
