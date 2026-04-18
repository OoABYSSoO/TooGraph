import assert from "node:assert/strict";
import test from "node:test";

import { resolveEdgeRunPresentation } from "./runEdgePresentation.ts";

test("resolveEdgeRunPresentation marks active run edges", () => {
  assert.deepEqual(resolveEdgeRunPresentation("flow:input->agent", ["flow:input->agent"]), {
    edgeClass: "editor-canvas__edge--active-run",
  });
});

test("resolveEdgeRunPresentation ignores inactive edges", () => {
  assert.equal(resolveEdgeRunPresentation("flow:input->agent", ["route:branch"]), null);
});
