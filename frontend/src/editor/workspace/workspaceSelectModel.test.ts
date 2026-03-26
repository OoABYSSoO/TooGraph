import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceSelectOptions,
  hasWorkspaceSelectOptions,
  paginateWorkspaceOptions,
  resolveWorkspaceSelectTriggerLabel,
} from "./workspaceSelectModel.ts";

test("resolveWorkspaceSelectTriggerLabel prefers selected option label", () => {
  assert.equal(
    resolveWorkspaceSelectTriggerLabel({
      value: "graph-1",
      placeholder: "打开已有图",
      options: [
        { value: "graph-1", label: "Starter Graph" },
        { value: "graph-2", label: "Knowledge Base" },
      ],
    }),
    "Starter Graph",
  );
});

test("resolveWorkspaceSelectTriggerLabel falls back to placeholder when empty", () => {
  assert.equal(
    resolveWorkspaceSelectTriggerLabel({
      value: "",
      placeholder: "从模板创建",
      options: [{ value: "starter_graph", label: "Starter Graph" }],
    }),
    "从模板创建",
  );
});

test("buildWorkspaceSelectOptions maps records to stable workspace options", () => {
  assert.deepEqual(
    buildWorkspaceSelectOptions([
      { value: "starter_graph", label: "Starter Graph" },
      { value: "knowledge_base", label: "知识库验证" },
    ]),
    [
      { value: "starter_graph", label: "Starter Graph" },
      { value: "knowledge_base", label: "知识库验证" },
    ],
  );
});

test("hasWorkspaceSelectOptions reports disabled state from option length", () => {
  assert.equal(hasWorkspaceSelectOptions([]), false);
  assert.equal(hasWorkspaceSelectOptions([{ value: "starter_graph", label: "Starter Graph" }]), true);
});

test("paginateWorkspaceOptions clamps pages and exposes pagination metadata", () => {
  const page = paginateWorkspaceOptions(
    [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C" },
      { value: "d", label: "D" },
    ],
    5,
    2,
  );

  assert.deepEqual(page.items, [
    { value: "c", label: "C" },
    { value: "d", label: "D" },
  ]);
  assert.equal(page.page, 1);
  assert.equal(page.pageCount, 2);
  assert.equal(page.hasPagination, true);
});
