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

  assert.deepEqual(book.allowedOperations.map((item) => item.targetId), ["app.nav.runs", "editor.graph.playback"]);
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
      ["editor.graph.playback", ["graph_edit editor.graph.playback"]],
    ],
  );
});

test("buildPageOperationBook exposes graph edit playback as an editor-page semantic operation", () => {
  const book = buildPageOperationBook({
    snapshotId: "snapshot-graph-edit",
    path: "/editor/new",
    title: "图编辑器",
    affordances: [
      {
        id: "editor.canvas.surface",
        label: "图编辑器画布",
        role: "button",
        zone: "editor-canvas",
        actions: ["click"],
        enabled: true,
        visible: true,
      },
    ],
  });

  const graphEditOperation = book.allowedOperations.find((operation) => operation.targetId === "editor.graph.playback");

  assert.deepEqual(graphEditOperation, {
    targetId: "editor.graph.playback",
    label: "图编辑回放",
    role: "button",
    commands: ["graph_edit editor.graph.playback"],
    resultHint: null,
  });
  assert.match(formatPageOperationBookLines(book).join("\n"), /graph_edit editor\.graph\.playback/);
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

test("buildPageOperationRuntimeContext adds structured page facts for goal verification", () => {
  const runtimeContext = buildPageOperationRuntimeContext({
    routePath: "/library",
    root: null,
    title: "图库",
    snapshot: {
      snapshotId: "snapshot-facts",
      path: "/library",
      title: "图库",
      affordances: [
        {
          id: "library.template.toograph_page_operation_workflow.open",
          label: "页面操作工作流",
          role: "button",
          actions: ["click"],
        },
        {
          id: "library.graph.graph_saved.open",
          label: "已保存图",
          role: "button",
          actions: ["click"],
        },
        {
          id: "runs.run.run_123.openDetail",
          label: "运行 run_123",
          role: "navigation-link",
          actions: ["click"],
        },
      ],
    },
    editor: {
      activeTabId: "tab_1",
      activeTabTitle: "投放素材分析",
      activeTabKind: "existing",
      activeGraphId: "graph_saved",
      activeGraphName: "投放素材分析",
      activeGraphDirty: true,
    },
    latestForegroundRun: {
      runId: "run_123",
      status: "completed",
      resultSummary: "输出完成。",
    },
    latestOperationReport: {
      operation_request_id: "vop_1234567890abcdef",
      status: "succeeded",
      route_after: "/library",
    },
  });

  assert.deepEqual(runtimeContext.page_facts, {
    route: { path: "/library", title: "图库", snapshotId: "snapshot-facts" },
    activeEditorTab: { tabId: "tab_1", title: "投放素材分析", kind: "existing" },
    activeGraph: { graphId: "graph_saved", name: "投放素材分析", dirty: true },
    visibleGraphs: [{ id: "graph_saved", label: "已保存图" }],
    visibleTemplates: [{ id: "toograph_page_operation_workflow", label: "页面操作工作流" }],
    visibleRuns: [{ id: "run_123", label: "运行 run_123" }],
    latestForegroundRun: { runId: "run_123", status: "completed", resultSummary: "输出完成。" },
    latestOperationResult: {
      operation_request_id: "vop_1234567890abcdef",
      status: "succeeded",
      route_after: "/library",
    },
  });
  assert.deepEqual(runtimeContext.operation_report, runtimeContext.page_facts.latestOperationResult);
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
