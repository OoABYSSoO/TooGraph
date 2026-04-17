import test from "node:test";
import assert from "node:assert/strict";

import { resolveShellLayoutMode } from "./layout-mode.ts";

test("resolveShellLayoutMode keeps non-editor routes in standard mode", () => {
  assert.equal(resolveShellLayoutMode("/"), "standard");
  assert.equal(resolveShellLayoutMode("/runs"), "standard");
});

test("resolveShellLayoutMode marks graph editor routes as canvas mode", () => {
  assert.equal(resolveShellLayoutMode("/editor"), "editor-canvas");
  assert.equal(resolveShellLayoutMode("/editor/new"), "editor-canvas");
  assert.equal(resolveShellLayoutMode("/editor/graph_123"), "editor-canvas");
});
