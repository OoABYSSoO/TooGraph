import test from "node:test";
import assert from "node:assert/strict";

import { resolvePrimaryNavigationSection, resolveShellLayoutMode } from "./layout-mode.ts";

test("resolveShellLayoutMode keeps non-editor routes in standard mode", () => {
  assert.equal(resolveShellLayoutMode("/"), "standard");
  assert.equal(resolveShellLayoutMode("/runs"), "standard");
});

test("resolveShellLayoutMode marks graph editor routes as canvas mode", () => {
  assert.equal(resolveShellLayoutMode("/editor"), "editor-canvas");
  assert.equal(resolveShellLayoutMode("/editor/new"), "editor-canvas");
  assert.equal(resolveShellLayoutMode("/editor/graph_123"), "editor-canvas");
});

test("resolvePrimaryNavigationSection keeps graph editor detail routes inside the editor nav section", () => {
  assert.equal(resolvePrimaryNavigationSection("/"), "home");
  assert.equal(resolvePrimaryNavigationSection("/editor"), "editor");
  assert.equal(resolvePrimaryNavigationSection("/editor/new"), "editor");
  assert.equal(resolvePrimaryNavigationSection("/editor/graph_123"), "editor");
  assert.equal(resolvePrimaryNavigationSection("/runs"), "runs");
  assert.equal(resolvePrimaryNavigationSection("/runs/run_123"), "runs");
  assert.equal(resolvePrimaryNavigationSection("/settings"), "settings");
  assert.equal(resolvePrimaryNavigationSection("/unknown"), null);
});
