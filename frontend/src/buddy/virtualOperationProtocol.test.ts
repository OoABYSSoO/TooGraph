import test from "node:test";
import assert from "node:assert/strict";

import { resolveBuddyVirtualOperationPlanFromActivityEvent } from "./virtualOperationProtocol.ts";

test("resolveBuddyVirtualOperationPlanFromActivityEvent parses operation request events", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation_request: {
        version: 1,
        commands: ["click app.nav.runs"],
        operations: [{ kind: "click", target_id: "app.nav.runs" }],
        cursor_lifecycle: "return_after_step",
        next_page_path: "/runs",
        reason: "用户要打开运行历史页。",
      },
    },
  });

  assert.deepEqual(plan, {
    version: 1,
    commands: ["click app.nav.runs"],
    operations: [{ kind: "click", targetId: "app.nav.runs" }],
    cursorLifecycle: "return_after_step",
    reason: "用户要打开运行历史页。",
  });
  assert.equal("nextPagePath" in (plan ?? {}), false);
});

test("resolveBuddyVirtualOperationPlanFromActivityEvent rejects buddy self targets", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation_request: {
        version: 1,
        commands: ["click app.nav.buddy"],
        operations: [{ kind: "click", target_id: "app.nav.buddy" }],
      },
    },
  });

  assert.equal(plan, null);
});

test("resolveBuddyVirtualOperationPlanFromActivityEvent rejects legacy single operation details", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation: {
        kind: "click",
        target_id: "app.nav.runs",
      },
      cursor_lifecycle: "return_after_step",
    },
  });

  assert.equal(plan, null);
});

test("resolveBuddyVirtualOperationPlanFromActivityEvent parses keyboard command operations", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation_request: {
        version: 1,
        commands: [
          "focus settings.input",
          "clear settings.input",
          "type settings.input hello",
          "press settings.input Enter",
          "wait short",
        ],
        operations: [
          { kind: "focus", target_id: "settings.input" },
          { kind: "clear", target_id: "settings.input" },
          { kind: "type", target_id: "settings.input", text: "hello" },
          { kind: "press", target_id: "settings.input", key: "Enter" },
          { kind: "wait", option: "short" },
        ],
        cursor_lifecycle: "keep",
        reason: "test input",
      },
    },
  });

  assert.deepEqual(plan?.operations, [
    { kind: "focus", targetId: "settings.input" },
    { kind: "clear", targetId: "settings.input" },
    { kind: "type", targetId: "settings.input", text: "hello" },
    { kind: "press", targetId: "settings.input", key: "Enter" },
    { kind: "wait", option: "short" },
  ]);
  assert.equal(plan?.cursorLifecycle, "keep");
  assert.equal(plan?.reason, "test input");
});
