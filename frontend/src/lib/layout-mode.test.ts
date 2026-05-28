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
  assert.equal(resolvePrimaryNavigationSection("/library"), "graphLibrary");
  assert.equal(resolvePrimaryNavigationSection("/library/templates"), "graphLibrary");
  assert.equal(resolvePrimaryNavigationSection("/knowledge"), "knowledge");
  assert.equal(resolvePrimaryNavigationSection("/knowledge/docs"), "knowledge");
  assert.equal(resolvePrimaryNavigationSection("/evals"), null);
  assert.equal(resolvePrimaryNavigationSection("/evals/suite_a"), null);
  assert.equal(resolvePrimaryNavigationSection("/scheduler"), "scheduler");
  assert.equal(resolvePrimaryNavigationSection("/scheduler/jobs"), "scheduler");
  assert.equal(resolvePrimaryNavigationSection("/curator-reports"), "curatorReports");
  assert.equal(resolvePrimaryNavigationSection("/curator-reports/run_123"), "curatorReports");
  assert.equal(resolvePrimaryNavigationSection("/buddy"), "buddy");
  assert.equal(resolvePrimaryNavigationSection("/buddy/memories"), "buddy");
  assert.equal(resolvePrimaryNavigationSection("/message-platforms"), "messagePlatforms");
  assert.equal(resolvePrimaryNavigationSection("/message-platforms/telegram"), "messagePlatforms");
  assert.equal(resolvePrimaryNavigationSection("/presets"), "presets");
  assert.equal(resolvePrimaryNavigationSection("/actions"), "actions");
  assert.equal(resolvePrimaryNavigationSection("/improvements"), "improvements");
  assert.equal(resolvePrimaryNavigationSection("/improvements/cand_1"), "improvements");
  assert.equal(resolvePrimaryNavigationSection("/models"), "models");
  assert.equal(resolvePrimaryNavigationSection("/model-logs"), "modelLogs");
  assert.equal(resolvePrimaryNavigationSection("/evidence"), "evidenceSearch");
  assert.equal(resolvePrimaryNavigationSection("/evidence/run_123"), "evidenceSearch");
  assert.equal(resolvePrimaryNavigationSection("/runs"), "runs");
  assert.equal(resolvePrimaryNavigationSection("/runs/run_123"), "runs");
  assert.equal(resolvePrimaryNavigationSection("/settings"), "settings");
  assert.equal(resolvePrimaryNavigationSection("/unknown"), null);
});
