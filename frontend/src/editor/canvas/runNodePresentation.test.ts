import assert from "node:assert/strict";
import test from "node:test";

import { resolveNodeRunPresentation } from "./runNodePresentation.ts";

test("resolveNodeRunPresentation marks current running nodes distinctly", () => {
  assert.deepEqual(resolveNodeRunPresentation("running", true), {
    haloClass: "editor-canvas__node-halo--running-current",
    shellClass: "editor-canvas__node--running-current",
  });
});

test("resolveNodeRunPresentation marks non-current running nodes", () => {
  assert.deepEqual(resolveNodeRunPresentation("running", false), {
    haloClass: "editor-canvas__node-halo--running",
    shellClass: "editor-canvas__node--running",
  });
});

test("resolveNodeRunPresentation marks success and failed nodes", () => {
  assert.deepEqual(resolveNodeRunPresentation("success", false), {
    haloClass: null,
    shellClass: "editor-canvas__node--success",
  });
  assert.deepEqual(resolveNodeRunPresentation("completed", false), {
    haloClass: null,
    shellClass: "editor-canvas__node--success",
  });
  assert.deepEqual(resolveNodeRunPresentation("failed", false), {
    haloClass: null,
    shellClass: "editor-canvas__node--failed",
  });
});

test("resolveNodeRunPresentation ignores idle-like statuses", () => {
  assert.equal(resolveNodeRunPresentation(undefined, false), null);
  assert.equal(resolveNodeRunPresentation("idle", false), null);
  assert.equal(resolveNodeRunPresentation("paused", false), null);
});
