import test from "node:test";
import assert from "node:assert/strict";

import { resolveEditorRouteInstruction } from "./editor-route-sync.ts";

test("resolveEditorRouteInstruction opens a new draft on initial /editor/new load", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: null,
    routeSignature: "new:",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "open-new",
    templateId: null,
    navigation: "replace",
  });
});

test("resolveEditorRouteInstruction opens a template draft on initial /editor/new?template=... load", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "new",
    routeGraphId: null,
    defaultTemplateId: "hello_world",
    routeSignature: "new:hello_world",
    handledRouteSignature: null,
  });

  assert.deepEqual(instruction, {
    type: "open-new",
    templateId: "hello_world",
    navigation: "replace",
  });
});

test("resolveEditorRouteInstruction opens an existing graph when /editor/:graphId is first loaded", () => {
  const instruction = resolveEditorRouteInstruction({
    routeMode: "existing",
    routeGraphId: "graph_123",
    defaultTemplateId: null,
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
    defaultTemplateId: "hello_world",
    routeSignature: "new:hello_world",
    handledRouteSignature: "new:hello_world",
  });

  assert.deepEqual(instruction, {
    type: "noop",
  });
});
