import test from "node:test";
import assert from "node:assert/strict";

import { resolveBuddyVirtualOperationPlanFromActivityEvent } from "./virtualOperationProtocol.ts";

test("resolveBuddyVirtualOperationPlanFromActivityEvent parses operation request events", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation_request: {
        version: 1,
        operation_request_id: "vop_1234567890abcdef",
        commands: ["click app.nav.runs"],
        operations: [{ kind: "click", target_id: "app.nav.runs" }],
        cursor_lifecycle: "return_after_step",
        next_page_path: "/runs",
        reason: "用户要打开运行历史页。",
      },
      expected_continuation: {
        mode: "auto_resume_after_ui_operation",
        operation_request_id: "vop_1234567890abcdef",
        resume_state_keys: ["page_operation_context", "page_context", "operation_result"],
      },
      run_id: "run_page_operation",
      node_id: "execute_page_operation",
    },
  });

  assert.deepEqual(plan, {
    version: 1,
    operationRequestId: "vop_1234567890abcdef",
    runId: "run_page_operation",
    nodeId: "execute_page_operation",
    commands: ["click app.nav.runs"],
    operations: [{ kind: "click", targetId: "app.nav.runs" }],
    cursorLifecycle: "return_after_step",
    expectedContinuation: {
      mode: "auto_resume_after_ui_operation",
      operationRequestId: "vop_1234567890abcdef",
      resumeStateKeys: ["page_operation_context", "page_context", "operation_result"],
    },
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

test("resolveBuddyVirtualOperationPlanFromActivityEvent rejects operation requests without stable ids", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation_request: {
        version: 1,
        commands: ["click app.nav.runs"],
        operations: [{ kind: "click", target_id: "app.nav.runs" }],
      },
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
        operation_request_id: "vop_keyboard123456",
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
      expected_continuation: {
        mode: "auto_resume_after_ui_operation",
        operation_request_id: "vop_keyboard123456",
        resume_state_keys: ["page_operation_context", "page_context", "operation_result"],
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

test("resolveBuddyVirtualOperationPlanFromActivityEvent parses graph edit playback operations", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation_request: {
        version: 1,
        operation_request_id: "vop_graphedit1234",
        commands: ["graph_edit editor.graph.playback"],
        operations: [
          {
            kind: "graph_edit",
            target_id: "editor.canvas.surface",
            graph_edit_intents: [
              { kind: "create_node", ref: "name_input", nodeType: "input", title: "input节点", description: "输入姓名。" },
              { kind: "create_state", ref: "name", name: "姓名", valueType: "text" },
              { kind: "bind_state", nodeRef: "name_input", stateRef: "name", mode: "write" },
            ],
          },
        ],
        cursor_lifecycle: "return_at_end",
        reason: "创建一个姓名输入图。",
      },
      expected_continuation: {
        mode: "auto_resume_after_ui_operation",
        operation_request_id: "vop_graphedit1234",
        resume_state_keys: ["page_operation_context", "page_context", "operation_result"],
      },
    },
  });

  assert.deepEqual(plan, {
    version: 1,
    operationRequestId: "vop_graphedit1234",
    commands: ["graph_edit editor.graph.playback"],
    operations: [
      {
        kind: "graph_edit",
        targetId: "editor.canvas.surface",
        graphEditIntents: [
          { kind: "create_node", ref: "name_input", nodeType: "input", title: "input节点", description: "输入姓名。" },
          { kind: "create_state", ref: "name", name: "姓名", valueType: "text" },
          { kind: "bind_state", nodeRef: "name_input", stateRef: "name", mode: "write" },
        ],
      },
    ],
    cursorLifecycle: "return_at_end",
    expectedContinuation: {
      mode: "auto_resume_after_ui_operation",
      operationRequestId: "vop_graphedit1234",
      resumeStateKeys: ["page_operation_context", "page_context", "operation_result"],
    },
    reason: "创建一个姓名输入图。",
  });
});

test("resolveBuddyVirtualOperationPlanFromActivityEvent parses fixed template run operations", () => {
  const plan = resolveBuddyVirtualOperationPlanFromActivityEvent({
    kind: "virtual_ui_operation",
    detail: {
      operation_request: {
        version: 1,
        operation_request_id: "vop_template1234",
        commands: ["run_template advanced_web_research_loop"],
        operations: [
          {
            kind: "run_template",
            target_id: "library.template.advanced_web_research_loop.open",
            template_id: "advanced_web_research_loop",
            template_name: "高级联网搜索",
            search_text: "advanced_web_research_loop",
            input_text: "研究 TooGraph 页面操作技能的最新差距。",
            run_target_id: "editor.action.runActiveGraph",
          },
        ],
        cursor_lifecycle: "return_at_end",
        reason: "运行选中的图模板。",
      },
      expected_continuation: {
        mode: "auto_resume_after_ui_operation",
        operation_request_id: "vop_template1234",
        resume_state_keys: ["page_operation_context", "page_context", "operation_result"],
      },
    },
  });

  assert.deepEqual(plan?.operations, [
    {
      kind: "run_template",
      targetId: "library.template.advanced_web_research_loop.open",
      templateId: "advanced_web_research_loop",
      templateName: "高级联网搜索",
      searchText: "advanced_web_research_loop",
      inputText: "研究 TooGraph 页面操作技能的最新差距。",
      runTargetId: "editor.action.runActiveGraph",
    },
  ]);
  assert.equal(plan?.cursorLifecycle, "return_at_end");
});
