import test from "node:test";
import assert from "node:assert/strict";

import { resolveEditorRouteInstruction } from "./editor-route-sync.ts";

test("resolveEditorRouteInstruction opens a new draft on initial /editor/new load", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: null,
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: null,
    routeSignature: "new:",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "open-new",
    templateId: null,
    navigation: "replace",
  });
});

test("resolveEditorRouteInstruction opens a blank draft for an empty /editor workspace", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "root",
    routeGraphId: null,
    defaultTemplateId: null,
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: null,
    routeSignature: "root",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "open-new",
    templateId: null,
    navigation: "replace",
  });
});

test("resolveEditorRouteInstruction keeps /editor on the restored active workspace tab", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "root",
    routeGraphId: null,
    defaultTemplateId: null,
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: "existing:graph_123",
    routeSignature: "root",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "noop",
  });
});

test("resolveEditorRouteInstruction opens a template draft on initial /editor/new?template=... load", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: "starter_graph",
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: null,
    routeSignature: "new:starter_graph",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "open-new",
    templateId: "starter_graph",
    navigation: "replace",
  });
});

test("resolveEditorRouteInstruction prioritizes restore-run requests on /editor/new?restoreRun=...", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: null,
    restoreRunId: "run_123",
    restoreSnapshotId: null,
    activeTabRouteSignature: null,
    routeSignature: "restore:run_123",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "restore-run",
    runId: "run_123",
    snapshotId: null,
    navigation: "replace",
  });
});

test("resolveEditorRouteInstruction keeps restore snapshot identity in the route instruction", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: null,
    restoreRunId: "run_123",
    restoreSnapshotId: "pause_1",
    activeTabRouteSignature: null,
    routeSignature: "restore:run_123:pause_1",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "restore-run",
    runId: "run_123",
    snapshotId: "pause_1",
    navigation: "replace",
  });
});

test("resolveEditorRouteInstruction opens an existing graph when /editor/:graphId is first loaded", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "existing",
    routeGraphId: "graph_123",
    defaultTemplateId: null,
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: null,
    routeSignature: "existing:graph_123",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "open-existing",
    graphId: "graph_123",
    navigation: "none",
  });
});

test("resolveEditorRouteInstruction does nothing when the route signature was already handled", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: "starter_graph",
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: null,
    routeSignature: "new:starter_graph",
    handledRouteSignature: "new:starter_graph",
  });

  assert.deepEqual(instruction, {
    type: "noop",
  });
});

test("resolveEditorRouteInstruction does nothing when the active tab already matches an unsaved route", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: null,
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: "new:",
    routeSignature: "new:",
    handledRouteSignature: "existing:graph_123",
  });

  assert.deepEqual(instruction, {
    type: "noop",
  });
});

test("resolveEditorRouteInstruction does nothing when the active tab already matches a template route", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: "starter_graph",
    restoreRunId: null,
    restoreSnapshotId: null,
    activeTabRouteSignature: "new:starter_graph",
    routeSignature: "new:starter_graph",
    handledRouteSignature: "existing:graph_123",
  });

  assert.deepEqual(instruction, {
    type: "noop",
  });
});
