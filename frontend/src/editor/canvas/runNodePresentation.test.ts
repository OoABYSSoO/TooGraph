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

test("resolveNodeRunPresentation marks paused nodes with review glow classes", () => {
  assert.deepEqual(resolveNodeRunPresentation("paused", false), {
    haloClass: "editor-canvas__node-halo--paused",
    shellClass: "editor-canvas__node--paused",
  });
  assert.deepEqual(resolveNodeRunPresentation("paused", true), {
    haloClass: "editor-canvas__node-halo--paused-current",
    shellClass: "editor-canvas__node--paused-current",
  });
});

test("resolveNodeRunPresentation marks success and failed nodes", () => {
  assert.deepEqual(resolveNodeRunPresentation("success", false), {
    haloClass: "editor-canvas__node-halo--success",
    shellClass: "editor-canvas__node--success",
  });
  assert.deepEqual(resolveNodeRunPresentation("completed", false), {
    haloClass: "editor-canvas__node-halo--success",
    shellClass: "editor-canvas__node--success",
  });
  assert.deepEqual(resolveNodeRunPresentation("failed", false), {
    haloClass: "editor-canvas__node-halo--failed",
    shellClass: "editor-canvas__node--failed",
  });
});

test("resolveNodeRunPresentation ignores idle-like statuses", () => {
  assert.equal(resolveNodeRunPresentation(undefined, false), null);
  assert.equal(resolveNodeRunPresentation("idle", false), null);
});
