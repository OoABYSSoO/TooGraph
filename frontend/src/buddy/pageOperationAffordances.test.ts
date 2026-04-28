import test from "node:test";
import assert from "node:assert/strict";

import {
  attachPageOperationRuntimeContext,
  buildPageOperationBook,
  buildPageOperationRuntimeContext,
  formatPageOperationBookLines,
  normalizePageAffordance,
} from "./pageOperationAffordances.ts";

test("normalizePageAffordance keeps safe navigation commands", () => {
  const affordance = normalizePageAffordance({
    id: "app.nav.runs",
    label: "运行历史",
    role: "navigation-link",
    zone: "app-shell",
    actions: ["click"],
    enabled: true,
    visible: true,
    pathAfterClick: "/runs",
  });

  assert.deepEqual(affordance, {
    id: "app.nav.runs",
    label: "运行历史",
    role: "navigation-link",
    zone: "app-shell",
    actions: ["click"],
    enabled: true,
    visible: true,
    current: false,
    pathAfterClick: "/runs",
    input: null,
    safety: {
      selfSurface: false,
      requiresConfirmation: false,
      destructive: false,
    },
  });
});

test("buildPageOperationBook filters buddy self surfaces and disabled targets", () => {
  const book = buildPageOperationBook({
    snapshotId: "snapshot-1",
    path: "/editor",
    title: "图编辑器",
    affordances: [
      {
        id: "app.nav.runs",
        label: "运行历史",
        role: "navigation-link",
        zone: "app-shell",
        actions: ["click"],
        enabled: true,
        visible: true,
        pathAfterClick: "/runs",
      },
      {
        id: "app.nav.buddy",
        label: "伙伴",
        role: "navigation-link",
        zone: "buddy-page",
        actions: ["click"],
        enabled: true,
        visible: true,
        safety: { selfSurface: true },
      },
      {
        id: "settings.disabled",
        label: "不可用按钮",
        role: "button",
        zone: "settings",
        actions: ["click"],
        enabled: false,
        visible: true,
      },
    ],
  });

  assert.deepEqual(book.allowedOperations.map((item) => item.targetId), ["app.nav.runs"]);
  assert.deepEqual(book.unavailable.map((item) => item.targetId), ["settings.disabled"]);
  assert.match(book.forbidden.join("\n"), /伙伴页面、伙伴浮窗、伙伴形象/);
});

test("buildPageOperationBook keeps editor canvas affordances addressable by semantic target id", () => {
  const book = buildPageOperationBook({
    snapshotId: "snapshot-canvas",
    path: "/editor",
    title: "图编辑器",
    affordances: [
      {
        id: "editor.canvas.node.agent_1",
        label: "节点：页面操作器",
        role: "button",
        zone: "editor-canvas.node",
        actions: ["click"],
        enabled: true,
        visible: true,
      },
      {
        id: "editor.canvas.anchor.agent_1:flow-out",
        label: "连接点：页面操作器 流程输出",
        role: "button",
        zone: "editor-canvas.anchor",
        actions: ["click"],
        enabled: true,
        visible: true,
      },
    ],
  });

  assert.deepEqual(
    book.allowedOperations.map((item) => [item.targetId, item.commands]),
    [
      ["editor.canvas.node.agent_1", ["click editor.canvas.node.agent_1"]],
      ["editor.canvas.anchor.agent_1:flow-out", ["click editor.canvas.anchor.agent_1:flow-out"]],
    ],
  );
});

test("formatPageOperationBookLines renders commands without selectors or coordinates", () => {
  const lines = formatPageOperationBookLines(
    buildPageOperationBook({
      snapshotId: "snapshot-2",
      path: "/settings",
      title: "设置",
      affordances: [
        {
          id: "settings.modelProviders.local.baseUrl",
          label: "本地网关地址",
          role: "textbox",
          zone: "settings",
          actions: ["focus", "clear", "type", "press"],
          enabled: true,
          visible: true,
          input: { kind: "text", maxLength: 300, valuePreview: "http://127.0.0.1:8888/v1" },
        },
      ],
    }),
  );

  const text = lines.join("\n");
  assert.match(text, /页面操作书:/);
  assert.match(text, /settings\.modelProviders\.local\.baseUrl/);
  assert.match(text, /commands: focus settings\.modelProviders\.local\.baseUrl/);
  assert.match(text, /type settings\.modelProviders\.local\.baseUrl <text>/);
  assert.doesNotMatch(text, /querySelector|selector|x:|y:/i);
});

test("buildPageOperationRuntimeContext packages snapshot and operation book for graph runs", () => {
  const runtimeContext = buildPageOperationRuntimeContext({
    routePath: "/editor?tab=active",
    root: null,
    title: "图编辑器",
  });

  assert.equal(runtimeContext.page_path, "/editor");
  assert.equal(runtimeContext.page_snapshot.path, "/editor");
  assert.equal(runtimeContext.page_operation_book.page.path, "/editor");
  assert.equal(runtimeContext.page_operation_book.page.title, "图编辑器");
});

test("attachPageOperationRuntimeContext preserves graph metadata while adding skill runtime context", () => {
  const runtimeContext = buildPageOperationRuntimeContext({
    routePath: "/runs",
    root: null,
    title: "运行历史",
  });
  const graph = {
    name: "侧视图页面操作",
    metadata: { existing: "keep" },
  };

  const result = attachPageOperationRuntimeContext(graph, runtimeContext);

  assert.notEqual(result, graph);
  assert.deepEqual(result.metadata.existing, "keep");
  assert.deepEqual(result.metadata.skill_runtime_context, runtimeContext);
});
